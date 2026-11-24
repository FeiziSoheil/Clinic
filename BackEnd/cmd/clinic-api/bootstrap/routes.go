package bootstrap

import (
	"github.com/labstack/echo/v4"
	echomw "github.com/labstack/echo/v4/middleware"

	"clinic-api/internal/article"
	"clinic-api/internal/booking"
	"clinic-api/internal/clinic"
	"clinic-api/internal/ehr"
	"clinic-api/internal/finance"
	medicinehandler "clinic-api/internal/medicine/handler"
	"clinic-api/internal/otp"
	"clinic-api/internal/prescription"
	"clinic-api/internal/previsit"
	"clinic-api/internal/review"
	"clinic-api/internal/schedule"
	"clinic-api/internal/user"
	"clinic-api/pkg/config"
	mw "clinic-api/pkg/middleware"
)

// setupRoutes registers all HTTP routes and applies global + per-group
// middleware onto the provided Echo engine. Each domain handler exposes a
// RegisterRoutes method that wires its own sub-paths onto a group, so this
// function's job is to:
//  1. attach the global (cross-cutting) middleware;
//  2. create the appropriately-scoped (and middleware-decorated) Echo groups;
//  3. hand each group to its handler's RegisterRoutes.
//
// Import aliases: echomw is Echo's built-in middleware (logger/recover/cors),
// while mw is the project-local pkg/middleware package providing JWTAuth and
// RoleAuth.
func setupRoutes(
	e *echo.Echo,
	cfg *config.Config,
	userH *user.Handler,
	clinicH *clinic.Handler,
	scheduleH *schedule.Handler,
	bookingH *booking.Handler,
	financeH *finance.Handler,
	ehrH *ehr.Handler,
	prescriptionH *prescription.Handler,
	medicineH *medicinehandler.Handler,
	otpH *otp.Handler,
	reviewH *review.Handler,
	articleH *article.Handler,
	previsitH *previsit.Handler,
	publicShifts echo.HandlerFunc,
	publicSlots echo.HandlerFunc,
	mySchedule echo.HandlerFunc,
	myTimeline echo.HandlerFunc,
	myMonthly echo.HandlerFunc,
	myMonthlyRange echo.HandlerFunc,
	myAppointments echo.HandlerFunc,
) {
	// --- Global middleware -------------------------------------------------
	e.Use(echomw.Logger())
	e.Use(echomw.Recover())
	// Permissive CORS for development; tighten in production as needed.
	e.Use(echomw.CORS())

	// --- Health check ------------------------------------------------------
	e.GET("/health", func(c echo.Context) error {
		return c.JSON(200, map[string]string{"status": "ok"})
	})

	// --- Auth (user) -------------------------------------------------------
	//
	// DECISION: user.Handler.RegisterRoutes bundles /register, /login AND
	// /profile onto a single group, but /profile must be JWT-protected while
	// /register and /login must stay public. Calling RegisterRoutes once would
	// either leave /profile unprotected or block /register and /login. To
	// satisfy both requirements without a route conflict, we do NOT call the
	// user handler's RegisterRoutes and instead register the three routes
	// manually on two distinct groups:
	//   * a public group for /register and /login;
	//   * a JWT-protected group for /profile.
	authPublicG := e.Group("/api/v1/auth")
	authPublicG.POST("/register", userH.Register)
	authPublicG.POST("/login", userH.Login)
	// OTP authentication (patient login + registration without a password).
	// otp.Handler.RegisterRoutes wires /otp/send, /otp/login and /otp/register
	// onto this public group so the final paths are /api/v1/auth/otp/*.
	otpH.RegisterRoutes(authPublicG)

	authProfileG := e.Group("/api/v1/auth", mw.JWTAuth(cfg.JWTSecret))
	authProfileG.GET("/profile", userH.GetProfile)

	// --- Admin (admin only) -----------------------------------------------
	// Admin-only staff management: mint a privileged DOCTOR or ADMIN account,
	// plus per-doctor patient and receptionist (secretary) CRUD.
	adminG := e.Group("/api/v1/admin", mw.JWTAuth(cfg.JWTSecret), mw.RoleAuth(string(user.RoleAdmin)))
	adminG.POST("/users", userH.CreateDoctor)
	// doctorId is the DOCTOR user's ObjectID (same id stored as EmployerID on
	// patients and receptionists), not the clinic DoctorProfile id.
	adminG.GET("/doctors/:doctorId/patients", userH.AdminListPatients)
	adminG.POST("/doctors/:doctorId/patients", userH.AdminCreatePatient)
	adminG.PUT("/doctors/:doctorId/patients/:id", userH.AdminUpdatePatient)
	adminG.DELETE("/doctors/:doctorId/patients/:id", userH.AdminDeletePatient)
	adminG.GET("/doctors/:doctorId/receptionists", userH.AdminListReceptionists)
	adminG.POST("/doctors/:doctorId/receptionists", userH.AdminCreateReceptionist)
	adminG.PUT("/doctors/:doctorId/receptionists/:id", userH.AdminUpdateReceptionist)
	adminG.DELETE("/doctors/:doctorId/receptionists/:id", userH.AdminDeleteReceptionist)
	// Patient review moderation (list + approve/reject/hide).
	reviewH.RegisterAdminRoutes(adminG)
	// CMS article CRUD (admin).
	articleH.RegisterAdminRoutes(adminG)

	// --- Doctor (doctor only) ---------------------------------------------
	// Doctor-only staff management: mint a RECEPTIONIST scoped to the calling
	// doctor (the receptionist's EmployerID is set to the doctor's id).
	doctorG := e.Group("/api/v1/doctor", mw.JWTAuth(cfg.JWTSecret), mw.RoleAuth(string(user.RoleDoctor)))
	doctorG.POST("/receptionists", userH.CreateReceptionist)
	// List the receptionists scoped to the calling doctor (employer_id == me).
	doctorG.GET("/receptionists", userH.ListReceptionists)
	// Doctor self-service profile (read + edit own pricing settings). The owner
	// is resolved from the JWT inside each handler, so a doctor can only ever
	// touch their own profile.
	doctorG.GET("/profile", clinicH.GetMyDoctorProfile)
	doctorG.PUT("/profile", clinicH.UpdateMyDoctorProfile)
	// Doctor review inbox + reply (reply only allowed for APPROVED).
	reviewH.RegisterDoctorRoutes(doctorG)

	// --- Clinics (admin only) ---------------------------------------------
	// clinic.Handler.RegisterRoutes registers /branches and /doctors, so the
	// group prefix is /api/v1/clinics.
	clinicsG := e.Group("/api/v1/clinics", mw.JWTAuth(cfg.JWTSecret), mw.RoleAuth(string(user.RoleAdmin)))
	clinicH.RegisterRoutes(clinicsG)

	// --- Schedule (admin + doctor) ----------------------------------------
	// schedule.Handler.RegisterRoutes registers /shifts and /leaves.
	scheduleG := e.Group("/api/v1/schedule", mw.JWTAuth(cfg.JWTSecret), mw.RoleAuth(string(user.RoleAdmin), string(user.RoleDoctor)))
	scheduleH.RegisterRoutes(scheduleG)

	// --- Bookings (authenticated) -----------------------------------------
	// booking.Handler.RegisterRoutes registers /book, /cancel, /reschedule and
	// /waiting-list.
	bookingsG := e.Group("/api/v1/bookings", mw.JWTAuth(cfg.JWTSecret))
	bookingH.RegisterRoutes(bookingsG)

	// --- Finance (authenticated) ------------------------------------------
	// finance.Handler.RegisterRoutes registers /finance/mock-pay etc., so the
	// group prefix must be the /api/v1 base for the final paths to be
	// /api/v1/finance/...
	financeG := e.Group("/api/v1", mw.JWTAuth(cfg.JWTSecret))
	financeH.RegisterRoutes(financeG)
	// Patient wallet read: returns the signed-in user's own wallet balance.
	// Gated by plain JWTAuth (no role restriction) so any authenticated user
	// may read their own wallet; the user id is taken from the token context.
	financeG.GET("/finance/wallet", financeH.UserWallet)

	// --- Finance / doctor read endpoints (doctor only) --------------------
	// The signed-in doctor's earnings, revenue-share transactions and wallet
	// balance. JWT + RoleAuth(RoleDoctor) gate access; the doctor's identity is
	// derived from the token via requestctx inside each handler.
	doctorFinanceG := e.Group("/api/v1/finance/doctor", mw.JWTAuth(cfg.JWTSecret), mw.RoleAuth(string(user.RoleDoctor)))
	doctorFinanceG.GET("/earnings", financeH.DoctorEarnings)
	doctorFinanceG.GET("/transactions", financeH.DoctorTransactions)
	doctorFinanceG.GET("/wallet", financeH.DoctorWallet)

	// --- Finance / admin dashboard (admin only) --------------------------
	// The admin KPI dashboard aggregated from real invoices and appointments.
	// JWT + RoleAuth(RoleAdmin) gate access so only privileged staff can read
	// the clinic-wide financial overview.
	adminFinanceG := e.Group("/api/v1/finance", mw.JWTAuth(cfg.JWTSecret), mw.RoleAuth(string(user.RoleAdmin)))
	adminFinanceG.GET("/dashboard", financeH.Dashboard)

	// --- EHR (authenticated) ----------------------------------------------
	// ehr.Handler.RegisterRoutes registers /medical-records.
	ehrG := e.Group("/api/v1/ehr", mw.JWTAuth(cfg.JWTSecret))
	ehrH.RegisterRoutes(ehrG)

	// --- Pre-visit AI intake (authenticated) ------------------------------
	previsitG := e.Group("/api/v1/previsit", mw.JWTAuth(cfg.JWTSecret))
	previsitH.RegisterRoutes(previsitG)

	// --- Prescriptions (authenticated) ------------------------------------
	// prescription.Handler.RegisterRoutes registers the create, get/list and
	// status endpoints. The group is JWTAuth-only (any
	// authenticated role) so patients can read their own prescriptions; the
	// create/status write paths enforce the DOCTOR/ADMIN role inside the
	// handler/service (returning ErrForbidden otherwise), mirroring how the EHR
	// group is mounted.
	prescriptionG := e.Group("/api/v1/prescriptions", mw.JWTAuth(cfg.JWTSecret))
	prescriptionH.RegisterRoutes(prescriptionG)

	// --- Medicines (doctor only) ------------------------------------------
	// medicine.Handler.RegisterRoutes registers /search, /:rxcui and the
	// /favorites* endpoints. Search/detail/favorites are clinical authoring
	// tools, so the group is gated by JWTAuth + RoleAuth(RoleDoctor) exactly
	// like the other doctor-only groups (see the /api/v1/doctor group above).
	medicineG := e.Group("/api/v1/medicines", mw.JWTAuth(cfg.JWTSecret), mw.RoleAuth(string(user.RoleDoctor)))
	medicineH.RegisterRoutes(medicineG)

	// --- Public (patient discovery, no auth required) ----------------------
	// Unauthenticated read endpoints that let patients browse the doctor
	// directory and pick a slot before authenticating to book. These reuse the
	// existing clinic handlers (list/get profile) and the cross-domain public
	// shift/slot handlers built in bootstrap. The clinic list/get responses are
	// already sanitized (no password hashes), so they are safe to expose.
	publicG := e.Group("/api/v1")
	publicG.GET("/doctors", clinicH.ListDoctorProfiles)
	publicG.GET("/doctors/:id", clinicH.GetDoctorProfile)
	publicG.GET("/doctors/:id/shifts", publicShifts)
	publicG.GET("/doctors/:id/slots", publicSlots)
	// Approved patient reviews + aggregate rating for a doctor (public).
	reviewH.RegisterPublicRoutes(publicG)
	// Published articles (public list + get by id/slug).
	articleH.RegisterPublicRoutes(publicG)

	// --- Reviews (patient create + list mine) -----------------------------
	// JWT + PATIENT so only patients can submit reviews after a completed visit.
	patientReviewG := e.Group("/api/v1", mw.JWTAuth(cfg.JWTSecret), mw.RoleAuth(string(user.RolePatient)))
	reviewH.RegisterPatientRoutes(patientReviewG)

	// --- Doctor "me" (authenticated) --------------------------------------
	// The signed-in doctor's daily schedule/queue. JWT-only (no role gate) so
	// the identity ("me") is derived from the token; in practice only doctors
	// use it. Registered under /api/v1 with JWTAuth to keep it distinct from the
	// public /api/v1 doctor directory above.
	meG := e.Group("/api/v1", mw.JWTAuth(cfg.JWTSecret))
	meG.GET("/doctors/me/schedule", mySchedule)
	meG.GET("/doctors/me/timeline", myTimeline)
	// The signed-in doctor/receptionist's monthly appointment breakdown per
	// calendar day, used by the reception calendar view. "me" is resolved from
	// the JWT (receptionist → employer doctor) inside the handler.
	meG.GET("/bookings/me/monthly/:year/:month", myMonthly)
	// Same breakdown but over an explicit Gregorian date range
	// (?from=YYYY-MM-DD&to=YYYY-MM-DD) so the reception Jalali calendar — whose
	// months span two Gregorian months — fetches the correct window.
	meG.GET("/bookings/me/monthly", myMonthlyRange)
	// The signed-in patient's full appointment history (active + past),
	// denormalized with the doctor profile/name so the patient "my
	// appointments" page renders from real backend data.
	meG.GET("/bookings/me/appointments", myAppointments)
}
