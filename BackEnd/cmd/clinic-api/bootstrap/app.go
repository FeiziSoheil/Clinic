package bootstrap

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"clinic-api/internal/article"
	"clinic-api/internal/booking"
	"clinic-api/internal/clinic"
	"clinic-api/internal/ehr"
	"clinic-api/internal/finance"
	medicinecache "clinic-api/internal/medicine/cache"
	medicinehandler "clinic-api/internal/medicine/handler"
	medicinerepository "clinic-api/internal/medicine/repository"
	medicinerxnorm "clinic-api/internal/medicine/rxnorm"
	medicinesearch "clinic-api/internal/medicine/search"
	medicineservice "clinic-api/internal/medicine/service"
	"clinic-api/internal/notification"
	"clinic-api/internal/otp"
	"clinic-api/internal/prescription"
	"clinic-api/internal/previsit"
	"clinic-api/internal/review"
	"clinic-api/internal/schedule"
	"clinic-api/internal/user"
	"clinic-api/pkg/config"
	"clinic-api/pkg/database"
	"clinic-api/pkg/logger"
	pkgredis "clinic-api/pkg/redis"
	"clinic-api/pkg/validator"

	"github.com/labstack/echo/v4"
)

// App is the assembled application graph: the configured Echo engine, the
// loaded configuration, the connected mongo client and references to the
// domain handlers. It is constructed once by NewApp and consumed by RunApp to
// serve traffic and shut down gracefully.
type App struct {
	echo        *echo.Echo
	cfg         *config.Config
	mongoClient *mongo.Client
	redisClient *pkgredis.Client
}

// NewApp builds the entire runtime dependency graph from the ground up and
// returns a ready-to-serve *App. The wiring order below is the dependency
// order: config -> logger -> mongo -> repositories -> indexes -> services ->
// handlers -> echo engine + routes.
func NewApp() (*App, error) {
	// 1. Configuration.
	cfg, err := config.Load()
	if err != nil {
		return nil, err
	}

	// 2. Logger (initialized once for the whole process).
	logger.Init(cfg.LogLevel, cfg.AppEnv)

	// 3. Mongo connectivity. A bounded context prevents a hung cluster from
	// blocking startup indefinitely.
	connectCtx, cancelConnect := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancelConnect()
	client, err := database.Connect(connectCtx, cfg.MongoURI)
	if err != nil {
		return nil, err
	}

	// 4. Database handle.
	db := client.Database(cfg.MongoDBName)

	// 4b. Redis connectivity. Redis is the TTL-driven OTP store (active codes,
	// cooldown, attempt counters, temporary blocks and the request rate limiter),
	// so the OTP authentication flow requires it. A failure to connect is fatal:
	// surfacing it at startup is far better than running with a half-broken auth
	// path. The client is created once and reused for the process lifetime. Run
	// Redis via Docker (see docker-compose.yml, network_mode: host).
	redisClient, err := pkgredis.Connect(connectCtx, cfg.RedisURL)
	if err != nil {
		return nil, err
	}
	logger.Get().Info("bootstrap: redis connected", "url", cfg.RedisURL)

	// 5. Repositories — one generic repository per collection, typed for the
	// owning domain's entity.
	userRepo := database.NewRepository[user.User](db.Collection("users"))
	branchRepo := database.NewRepository[clinic.Branch](db.Collection("branches"))
	doctorRepo := database.NewRepository[clinic.DoctorProfile](db.Collection("doctor_profiles"))
	shiftRepo := database.NewRepository[schedule.Shift](db.Collection("shifts"))
	leaveRepo := database.NewRepository[schedule.Leave](db.Collection("leaves"))
	blockRepo := database.NewRepository[schedule.TimeBlock](db.Collection("time_blocks"))
	apptRepo := database.NewRepository[booking.Appointment](db.Collection("appointments"))
	waitRepo := database.NewRepository[booking.WaitingList](db.Collection("waiting_list"))
	walletRepo := database.NewRepository[finance.Wallet](db.Collection("wallets"))
	txnRepo := database.NewRepository[finance.Transaction](db.Collection("transactions"))
	invoiceRepo := database.NewRepository[finance.Invoice](db.Collection("invoices"))
	paymentRepo := database.NewRepository[finance.PaymentAttempt](db.Collection("payment_attempts"))
	recordRepo := database.NewRepository[ehr.MedicalRecord](db.Collection("medical_records"))
	triageRepo := database.NewRepository[ehr.TriageNote](db.Collection("triage_notes"))
	previsitSessionRepo := database.NewRepository[previsit.PreVisitSession](db.Collection("previsit_sessions"))
	previsitMessageRepo := database.NewRepository[previsit.PreVisitMessage](db.Collection("previsit_messages"))
	prescriptionRepo := database.NewRepository[prescription.Prescription](db.Collection("prescriptions"))
	reviewRepo := database.NewRepository[review.Review](db.Collection("reviews"))
	articleRepo := database.NewRepository[article.Article](db.Collection("articles"))

	// OTP ban-level repository: persists the escalating temporary-block tier per
	// normalized phone number so it survives Redis restarts/flushei and lets the
	// block window grow with each offence. One document per phone (the phone is
	// the _id, so uniqueness is already guaranteed by MongoDB's default _id
	// index — no extra index needed).
	otpBanRepo := otp.NewBanLevelRepository(db.Collection("otp_ban_levels"))

	// Medicines reference-data repository. It owns two collections — the
	// normalized concept index ("medicines") and the per-doctor favorites
	// ("medicine_favorites") — exposed through the medicine.Repository
	// interface. The generic database.NewRepository is not used here because
	// the medicine repository needs the specialized prefix/$text search and
	// favorites methods the generic repo cannot express.
	medicinesRepo := medicinerepository.New(
		db.Collection("medicines"),
		db.Collection("medicine_favorites"),
	)

	// 6. Optional indexes. These are best-effort: a failure is logged as a
	// warning but never aborts bootstrap so the API can still serve traffic.
	indexCtx, cancelIndex := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelIndex()
	ensureIndexesBestEffort(indexCtx, userRepo, doctorRepo, walletRepo, prescriptionRepo, medicinesRepo, reviewRepo, articleRepo)

	// 6b. Seed the default admin account. Best-effort: a failure is logged as a
	// warning but never aborts startup so the API can still serve traffic. The
	// seeder is idempotent (it no-ops when an admin already exists).
	seedCtx, cancelSeed := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelSeed()
	if err := user.SeedDefaultAdmin(seedCtx, userRepo, cfg.AdminPhone, cfg.AdminUsername, cfg.AdminPassword); err != nil {
		logger.Get().Warn("bootstrap: default admin seeding failed", "error", err)
	}

	// 7. Services.
	userService := user.NewService(userRepo, cfg.JWTSecret, cfg.JWTExpirationHours)
	// clinicUserReader adapts the users repository to the clinic.UserReader
	// interface so doctor-profile responses can be denormalized with the
	// linked user's identity without the clinic domain importing internal/user.
	clinicService := clinic.NewService(branchRepo, doctorRepo, &clinicUserReader{repo: userRepo})
	scheduleService := schedule.NewService(shiftRepo, leaveRepo, blockRepo)

	// SMS transport shared by OTP and patient notifications (sms.ir when
	// configured, otherwise mock logging).
	smsSender := newSmsSender(cfg)
	notificationService := notification.NewService(
		&userSmsNotifier{sms: smsSender, repo: userRepo},
		cfg.AppBaseURL,
	)

	// OTP authentication (Redis-backed). The OTP store is backed by Redis so
	// every timing concern (code validity, cooldown, attempt window, temporary
	// block, request rate limit) is expressed purely through key expiration — no
	// cron jobs or in-value timestamps. The escalating ban tier is persisted per
	// phone in MongoDB (otpBanRepo). The SMS transport is selected from config:
	// "smsir" or "mock".
	otpStore := otp.NewRedisStore(redisClient)
	otpTestCode := config.ResolveOTPTestCode(cfg.AppEnv, cfg.OTPTestCode)
	if cfg.OTPTestCode != "" && otpTestCode == "" {
		logger.Get().Warn("bootstrap: OTP_TEST_CODE ignored because APP_ENV=production")
	} else if otpTestCode != "" {
		logger.Get().Warn("bootstrap: OTP test code enabled (non-production only)",
			"app_env", cfg.AppEnv,
		)
	}
	otpService := otp.NewService(
		otpStore,
		smsSender,
		otpBanRepo,
		userRepo,
		cfg.JWTSecret,
		cfg.JWTExpirationHours,
		otp.Policy{
			Length:        cfg.OTPLength,
			LoginTTL:      time.Duration(cfg.OTPLoginTTLSeconds) * time.Second,
			Cooldown:      time.Duration(cfg.OTPCooldownSeconds) * time.Second,
			AttemptsTTL:   time.Duration(cfg.OTPAttemptsTTLSeconds) * time.Second,
			MaxAttempts:   cfg.OTPMaxAttempts,
			MaxRequests:   cfg.OTPMaxRequests,
			RequestWindow: time.Duration(cfg.OTPRequestWindowSeconds) * time.Second,
			Ban: otp.BanPolicy{
				Level1:     time.Duration(cfg.OTPBanLevel1Seconds) * time.Second,
				Level2:     time.Duration(cfg.OTPBanLevel2Seconds) * time.Second,
				Level3:     time.Duration(cfg.OTPBanLevel3Seconds) * time.Second,
				Level4Plus: time.Duration(cfg.OTPBanLevel4PlusSeconds) * time.Second,
			},
			ResetBanOnSuccess: cfg.OTPResetBanOnSuccess,
			TestCode:          otpTestCode,
		},
	)

	// booking.Service depends on a ScheduleService and a Notifier interface;
	// the concrete schedule.Service and notification.Service satisfy them by
	// structural typing (no explicit declaration required).
	bookingService := booking.NewService(apptRepo, waitRepo, scheduleService, client, notificationService)

	// Finance needs the cross-domain AppointmentService adapter. It also needs
	// the doctor-profiles repository so the adapter can source the doctor's
	// VisitFee as the appointment's monetary TotalFee.
	billingAdapter := newBillingAdapter(apptRepo, doctorRepo, client)

	financeService := finance.NewService(walletRepo, txnRepo, invoiceRepo, paymentRepo, billingAdapter, client)
	// Completing a visit should credit the doctor: wire finance settle into
	// booking without a circular package import.
	bookingService.SetVisitSettler(&visitSettlerAdapter{finance: financeService})
	ehrService := ehr.NewService(recordRepo, triageRepo)
	// Wire the SOAP→complete-visit flow: booking.Service satisfies the
	// ehr.BookingCompleter interface structurally. Done as a setter (rather than
	// at construction) because booking.Service is built below this point and the
	// ehr/booking packages must not import each other.
	ehrService.SetBookingCompleter(bookingService)
	// Wire the doctor's "My Patients" directory collaborators: a single
	// adapter over the appointments + users repositories implements both the
	// ehr.PatientVisitLookup and ehr.PatientInfoReader interfaces. Done as
	// setters (rather than at construction) for the same Clean-Architecture
	// reasons as SetBookingCompleter.
	doctorPatientsAdapter := &doctorPatientsAdapter{apptRepo: apptRepo, userRepo: userRepo}
	ehrService.SetPatientVisitLookup(doctorPatientsAdapter)
	ehrService.SetPatientInfoReader(doctorPatientsAdapter)

	// Prescription management. notification.Service structurally satisfies the
	// prescription.Notifier interface (it exposes NotifyPrescriptionIssued), so
	// it is wired as a best-effort notifier. The doctor-name resolver supplies
	// the doctor's display name in the SMS; the EHR cross-linker is left nil
	// for now (the service is nil-safe without it).
	prescriptionService := prescription.NewService(prescriptionRepo)
	prescriptionService.SetNotifier(notificationService)
	prescriptionService.SetDoctorNameResolver(&prescriptionDoctorNameResolver{repo: userRepo})
	// Wire the user-name resolver so prescription responses carry the resolved
	// patient/doctor display names (used by the PDF export). user.Service
	// structurally satisfies prescription.UserNameResolver via NamesByIDs.
	prescriptionService.SetUserNameResolver(userService)

	// Patient review moderation. Collaborators are wired via setters so the
	// review domain never imports booking/clinic/user packages directly.
	reviewService := review.NewService(reviewRepo)
	reviewService.SetAppointmentLookup(&reviewAppointmentLookup{apptRepo: apptRepo})
	reviewService.SetPatientNameReader(&reviewPatientNameReader{repo: userRepo})

	articleService := article.NewService(articleRepo)

	var previsitAI previsit.AIClient
	if cfg.PrevisitAIEnabled && cfg.AIServiceURL != "" {
		previsitAI = previsit.NewHTTPAIClient(cfg.AIServiceURL, cfg.PrevisitAITimeout)
		logger.Get().Info("bootstrap: previsit AI sidecar enabled", "url", cfg.AIServiceURL)
	} else {
		logger.Get().Info("bootstrap: previsit AI sidecar disabled")
	}
	previsitService := previsit.NewService(
		previsit.NewMongoSessionStore(previsitSessionRepo),
		previsit.NewMongoMessageStore(previsitMessageRepo),
		previsitAI,
	)
	previsitService.SetAppointmentLookup(&bookingAppointmentParties{repo: apptRepo})
	bookingService.SetPreVisitLifecycle(&previsitLifecycleAdapter{
		svc:     previsitService,
		notify:  notificationService,
		baseURL: cfg.AppBaseURL,
	})

	if n, err := article.SeedDemoArticles(seedCtx, articleRepo); err != nil {
		logger.Get().Warn("bootstrap: demo article seeding failed", "error", err)
	} else if n > 0 {
		logger.Get().Info("bootstrap: demo articles seeded", "count", n)
	}

	// Medicine reference-data domain: cache-first search with an RxNorm
	// fallback, local-index detail, per-doctor favorites and a best-effort
	// seed from RxNorm. Built in collaborator-first order (cache → rxnorm →
	// search engine → service), mirroring the dependency order of the other
	// domains. The cache TTL is expressed in seconds in config and converted
	// to a duration here.
	medicineCache := medicinecache.NewMemoryCache(cfg.MedicineCacheMax)
	medicineRxnorm := medicinerxnorm.New(cfg.RxNormBaseURL)
	medicineSearch := medicinesearch.New(medicinesRepo)
	medicineService := medicineservice.New(
		medicinesRepo,
		medicineSearch,
		medicineCache,
		medicineRxnorm,
		time.Duration(cfg.MedicineCacheTTL)*time.Second,
		cfg.MedicineFallbackToRxNorm,
		logger.Get(),
	)

	// Optional background seed of the local medicine index from RxNorm. Gated
	// by cfg.MedicineSeedOnBoot and run on a detached goroutine with a generous
	// timeout so it never blocks boot, mirroring the best-effort philosophy of
	// the user seeder above. Errors are logged and swallowed.
	if cfg.MedicineSeedOnBoot {
		go func() {
			seedMedCtx, cancelSeedMed := context.WithTimeout(context.Background(), 5*time.Minute)
			defer cancelSeedMed()
			if n, err := medicineService.Seed(seedMedCtx); err != nil {
				logger.Get().Error("bootstrap: medicine seed failed", "error", err)
			} else {
				logger.Get().Info("bootstrap: medicine seed complete", "count", n)
			}
		}()
	}

	// 8. Handlers.
	userHandler := user.NewHandler(userService)
	clinicHandler := clinic.NewHandler(clinicService)
	scheduleHandler := schedule.NewHandler(scheduleService)
	bookingHandler := booking.NewHandler(bookingService)
	financeHandler := finance.NewHandler(financeService)
	ehrHandler := ehr.NewHandler(ehrService)
	prescriptionHandler := prescription.NewHandler(prescriptionService)
	medicineHandler := medicinehandler.NewHandler(medicineService)
	otpHandler := otp.NewHandler(otpService)
	reviewHandler := review.NewHandler(reviewService)
	articleHandler := article.NewHandler(articleService)
	previsitHandler := previsit.NewHandler(previsitService)

	// 9. Echo engine + validator + routes.
	e := echo.New()
	e.Validator = validator.New()
	e.HideBanner = true

	// Public (unauthenticated) patient-facing handlers that aggregate across
	// domains (clinic/schedule/booking). Built here where the services + repos
	// are in scope; registered on a public group inside setupRoutes.
	// Resolver that maps a doctor PROFILE id (exposed by the public directory)
	// to the USER id that shifts/appointments are stored under. Without it the
	// patient-facing shift/slot endpoints query with the wrong id and return
	// an empty result set.
	doctorResolver := &doctorProfileRepoResolver{repo: doctorRepo}
	reviewService.SetDoctorProfileResolver(doctorResolver)
	// The booking handler resolves the doctor PROFILE id (sent by patients) to
	// the USER id that appointments/shifts are stored under.
	bookingHandler.SetDoctorUserIDResolver(doctorResolver)
	// Wire the optional patient-info resolver so the booking service can
	// denormalize patient name/phone onto appointment responses (used by the
	// reception timeline). Done as a setter (rather than at construction) so
	// the booking domain never imports internal/user; the adapter bridges the
	// two here in bootstrap.
	bookingService.SetPatientResolver(&bookingPatientResolver{repo: userRepo})
	publicShifts := makeDoctorShiftsHandler(scheduleService, doctorResolver)
	publicSlots := makeDoctorSlotsHandler(scheduleService, apptRepo, doctorResolver)
	// Authenticated doctor "my schedule" (daily queue) handler.
	mySchedule := makeDoctorMyScheduleHandler(apptRepo, userRepo)
	// Authenticated doctor "my timeline" (daily shifts + appointments) handler.
	// Server-side doctor resolution so the reception panel works without the
	// client knowing the doctor id.
	myTimeline := makeDoctorMyTimelineHandler(bookingService, userRepo)
	// Authenticated doctor/receptionist "my monthly" (per-day appointment
	// breakdown) handler for the reception calendar view.
	myMonthly := makeDoctorMyMonthlyHandler(bookingService, userRepo)
	// Authenticated doctor/receptionist "my monthly range" handler — aggregates
	// per-day breakdown over an explicit Gregorian date range so the reception
	// Jalali calendar (whose months span two Gregorian months) fetches correctly.
	myMonthlyRange := makeDoctorMyMonthlyRangeHandler(bookingService, userRepo)
	// Authenticated patient "my appointments" (all-time list) handler.
	myAppointments := makePatientMyAppointmentsHandler(apptRepo, userRepo, doctorRepo)

	setupRoutes(e, cfg, userHandler, clinicHandler, scheduleHandler, bookingHandler, financeHandler, ehrHandler, prescriptionHandler, medicineHandler, otpHandler, reviewHandler, articleHandler, previsitHandler, publicShifts, publicSlots, mySchedule, myTimeline, myMonthly, myMonthlyRange, myAppointments)

	// 10. Return the assembled app.
	return &App{
		echo:        e,
		cfg:         cfg,
		mongoClient: client,
		redisClient: redisClient,
	}, nil
}

// newSmsSender selects the SMS transport for OTP delivery based on the loaded
// configuration. Supported providers:
//   - "smsir" (auto-selected when SMS_IR_API_KEY is set): the sms.ir OTP
//     gateway — TemplateId + x-api-key, instant delivery via a pre-approved
//     template.
//   - "mock" (default): logs the code to the server logs, keeping the flow fully
//     testable without real credentials.
func newSmsSender(cfg *config.Config) notification.Gateway {
	switch cfg.SMSProvider {
	case "smsir":
		if cfg.SMSIRAPIKey == "" || cfg.SMSIRTemplateID == "" {
			logger.Get().Warn("bootstrap: smsir selected but SMS_IR_API_KEY/SMS_IR_TEMPLATE_ID unset; OTP delivery will fail")
		} else {
			logger.Get().Info("bootstrap: sms transport = smsir (live, template OTP)",
				"template_id", cfg.SMSIRTemplateID,
				"otp_path", cfg.SMSIROTPPath,
			)
		}
		return notification.NewSMSIRSender(notification.SMSIRConfig{
			APIKey:     cfg.SMSIRAPIKey,
			BaseURL:    cfg.SMSIRBaseURL,
			OTPPath:    cfg.SMSIROTPPath,
			TemplateID: cfg.SMSIRTemplateID,
			CodeParam:  cfg.SMSIRCodeParam,
		})
	}
	logger.Get().Info("bootstrap: sms transport = mock (otp codes logged)")
	return notification.NewMockSender()
}

// ensureIndexesBestEffort creates the unique indexes that guard data integrity
// (unique phone, unique doctor profile per user, unique wallet per user). Each
// index creation is wrapped in its own try/log so a single failure cannot
// prevent the others from running or abort bootstrap.
func ensureIndexesBestEffort(
	ctx context.Context,
	userRepo *database.Repository[user.User],
	doctorRepo *database.Repository[clinic.DoctorProfile],
	walletRepo *database.Repository[finance.Wallet],
	prescriptionRepo *database.Repository[prescription.Prescription],
	medicineRepo medicinerepository.Repository,
	reviewRepo *database.Repository[review.Review],
	articleRepo *database.Repository[article.Article],
) {
	unique := true

	// Unique phone on users.
	if err := userRepo.EnsureIndexes(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "phone", Value: 1}},
		Options: &options.IndexOptions{Unique: &unique},
	}); err != nil {
		logger.Get().Warn("bootstrap: failed to ensure unique phone index on users", "error", err)
	}

	// Unique username on users — the staff (admin/doctor/receptionist) login
	// identifier. A PARTIAL filter restricts uniqueness to documents that
	// actually carry a non-empty username, so patient accounts (which never set
	// one) and legacy documents that pre-date the field never collide and are
	// ignored by the constraint.
	if err := userRepo.EnsureIndexes(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "username", Value: 1}},
		Options: &options.IndexOptions{
			Unique:                  &unique,
			PartialFilterExpression: bson.D{{Key: "username", Value: bson.D{{Key: "$gt", Value: ""}}}},
		},
	}); err != nil {
		logger.Get().Warn("bootstrap: failed to ensure unique username index on users", "error", err)
	}

	// Unique user_id on doctor_profiles.
	if err := doctorRepo.EnsureIndexes(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "user_id", Value: 1}},
		Options: &options.IndexOptions{Unique: &unique},
	}); err != nil {
		logger.Get().Warn("bootstrap: failed to ensure unique user_id index on doctor_profiles", "error", err)
	}

	// Unique user_id on wallets.
	if err := walletRepo.EnsureIndexes(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "user_id", Value: 1}},
		Options: &options.IndexOptions{Unique: &unique},
	}); err != nil {
		logger.Get().Warn("bootstrap: failed to ensure unique user_id index on wallets", "error", err)
	}

	// Non-unique patient_id + doctor_id indexes on prescriptions to keep the
	// list-by-patient / list-by-doctor read paths fast. These are best-effort:
	// a failure is logged but never aborts bootstrap.
	for _, key := range []string{"patient_id", "doctor_id"} {
		if err := prescriptionRepo.EnsureIndexes(ctx, mongo.IndexModel{
			Keys: bson.D{{Key: key, Value: 1}},
		}); err != nil {
			logger.Get().Warn("bootstrap: failed to ensure index on prescriptions", "key", key, "error", err)
		}
	}

	// Medicine domain indexes: unique rxcui, search_name prefix, compound text
	// index over generic/brand/synonyms, and the favorites uniqueness/read-path
	// indexes. The repository owns all medicine index creation, so this is a
	// single best-effort call; a failure is logged but never aborts bootstrap.
	if err := medicineRepo.EnsureIndexes(ctx); err != nil {
		logger.Get().Warn("bootstrap: failed to ensure medicine indexes", "error", err)
	}

	// Reviews: one review per completed appointment, plus read-path indexes for
	// doctor list / public approved listing / admin filters.
	if err := reviewRepo.EnsureIndexes(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "appointment_id", Value: 1}},
		Options: &options.IndexOptions{Unique: &unique},
	}); err != nil {
		logger.Get().Warn("bootstrap: failed to ensure unique appointment_id index on reviews", "error", err)
	}
	for _, key := range []string{"doctor_id", "doctor_profile_id", "status", "patient_id"} {
		if err := reviewRepo.EnsureIndexes(ctx, mongo.IndexModel{
			Keys: bson.D{{Key: key, Value: 1}},
		}); err != nil {
			logger.Get().Warn("bootstrap: failed to ensure index on reviews", "key", key, "error", err)
		}
	}

	// Articles: unique slug, plus read-path indexes for admin filters and public listing.
	if err := articleRepo.EnsureIndexes(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "slug", Value: 1}},
		Options: &options.IndexOptions{Unique: &unique},
	}); err != nil {
		logger.Get().Warn("bootstrap: failed to ensure unique slug index on articles", "error", err)
	}
	for _, key := range []string{"status", "category", "updated_at"} {
		if err := articleRepo.EnsureIndexes(ctx, mongo.IndexModel{
			Keys: bson.D{{Key: key, Value: 1}},
		}); err != nil {
			logger.Get().Warn("bootstrap: failed to ensure index on articles", "key", key, "error", err)
		}
	}
}
