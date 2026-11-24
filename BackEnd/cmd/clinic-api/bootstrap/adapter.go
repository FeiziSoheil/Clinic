// Package bootstrap assembles the application's runtime graph: it loads
// configuration, connects to MongoDB, constructs the repositories, services and
// HTTP handlers for every internal domain, registers the Echo routes and runs
// the server with graceful shutdown.
//
// This file holds the cross-domain adapter that bridges the booking and
// finance domains: finance depends on a narrow finance.AppointmentService
// interface, but the concrete booking.Service does not implement it (its
// methods have different signatures and concerns). Rather than polluting either
// domain with the other's types, we implement the interface here in the
// bootstrap layer, delegating to the booking appointments repository.
package bootstrap

import (
	"context"
	"fmt"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"clinic-api/internal/booking"
	"clinic-api/internal/clinic"
	"clinic-api/internal/ehr"
	"clinic-api/internal/finance"
	"clinic-api/internal/notification"
	"clinic-api/internal/prescription"
	"clinic-api/internal/review"
	"clinic-api/internal/user"
	"clinic-api/pkg/database"
	"clinic-api/pkg/errormap"
	"clinic-api/pkg/logger"
)

// billingAdapter implements finance.AppointmentService by delegating to the
// generic booking.Appointment repository. It is the bridge that lets the
// finance domain read an appointment's billing details and mutate its payment
// lifecycle without importing internal/booking (which would invert the
// dependency direction the architecture enforces).
type billingAdapter struct {
	// apptRepo is the generic repository over the "appointments" collection,
	// typed for the booking.Appointment entity.
	apptRepo *database.Repository[booking.Appointment]
	// doctorRepo is the generic repository over the "doctor_profiles"
	// collection. It is used to source the doctor's VisitFee, which is the
	// authoritative monetary TotalFee for an appointment (the booking.Appointment
	// entity itself carries no fee field).
	doctorRepo *database.Repository[clinic.DoctorProfile]
	// client is the connected mongo client, used for specialized count queries
	// that fall outside the generic repository surface.
	client *mongo.Client
}

// newBillingAdapter constructs a billingAdapter bound to the given booking
// appointments repository, doctor-profile repository and mongo client.
func newBillingAdapter(
	apptRepo *database.Repository[booking.Appointment],
	doctorRepo *database.Repository[clinic.DoctorProfile],
	client *mongo.Client,
) *billingAdapter {
	return &billingAdapter{apptRepo: apptRepo, doctorRepo: doctorRepo, client: client}
}

// Compile-time assertion that billingAdapter satisfies the
// finance.AppointmentService interface. A mismatch surfaces as a build error
// at the bootstrap package rather than at runtime.
var _ finance.AppointmentService = (*billingAdapter)(nil)

// visitSettlerAdapter implements booking.VisitSettler by delegating to
// finance.Service.SettleAppointment so completing a visit credits the doctor.
type visitSettlerAdapter struct {
	finance *finance.Service
}

func (a *visitSettlerAdapter) SettleAppointment(ctx context.Context, appointmentID string) error {
	_, err := a.finance.SettleAppointment(ctx, appointmentID)
	return err
}

var _ booking.VisitSettler = (*visitSettlerAdapter)(nil)

// GetForBilling returns the billing-relevant projection of an appointment.
//
// The booking.Appointment entity carries no fee/price field, so the
// appointment's monetary TotalFee is sourced from the doctor's profile
// (clinic.DoctorProfile.VisitFee), looked up by the appointment's DoctorID
// (which is the doctor's USER id, matching DoctorProfile.UserID). A missing
// profile is tolerated and degrades to a 0 fee (logged) so billing never
// hard-fails on an orphaned appointment, but a real VisitFee is honored.
func (a *billingAdapter) GetForBilling(ctx context.Context, appointmentID primitive.ObjectID) (*finance.AppointmentInfo, error) {
	appt, err := a.apptRepo.FindByID(ctx, appointmentID)
	if err != nil {
		// Translate the repository's "not found" into the canonical API error so
		// the finance service / handler can map it to a 404 consistently.
		if err == database.ErrNotFound {
			return nil, errormap.ErrNotFound
		}
		return nil, err
	}

	// Source the authoritative visit fee from the doctor's profile. Appointments
	// store the doctor's USER id, which is the key used by doctor_profiles.
	var totalFee float64
	if a.doctorRepo != nil {
		profile, perr := a.doctorRepo.FindOne(ctx, bson.M{"user_id": appt.DoctorID})
		if perr != nil {
			logger.Get().Warn("billingAdapter: doctor profile not found, fee defaults to 0",
				"appointment_id", appointmentID.Hex(), "doctor_id", appt.DoctorID.Hex(), "error", perr)
		} else if profile != nil {
			totalFee = float64(profile.VisitFee) //nolint:gosec // float64 is the codebase money type
		}
	}

	return &finance.AppointmentInfo{
		AppointmentID: appt.ID,
		PatientID:     appt.PatientID,
		DoctorID:      appt.DoctorID,
		TotalFee:      totalFee,
		Status:        string(appt.Status),
		PaymentType:   string(appt.PaymentType),
	}, nil
}

// MarkDepositPaid records that the appointment fee/deposit has been paid.
// It does NOT confirm the booking — confirmation is a separate receptionist
// action (PENDING → CONFIRMED + SMS).
func (a *billingAdapter) MarkDepositPaid(ctx context.Context, appointmentID primitive.ObjectID, paymentType string) error {
	update := bson.M{"$set": bson.M{
		"payment_status": string(booking.PaymentPaid),
		"updated_at":     time.Now().UTC(),
	}}
	if paymentType != "" {
		update["$set"].(bson.M)["payment_type"] = paymentType
	}
	return a.apptRepo.Update(ctx, appointmentID, update)
}

// MarkSettled marks the appointment as completed (visit took place and is paid).
func (a *billingAdapter) MarkSettled(ctx context.Context, appointmentID primitive.ObjectID) error {
	update := bson.M{"$set": bson.M{
		"status":         string(booking.StatusCompleted),
		"payment_status": string(booking.PaymentPaid),
		"updated_at":     time.Now().UTC(),
	}}
	return a.apptRepo.Update(ctx, appointmentID, update)
}

// MarkCancelled marks the appointment as cancelled and its payment refunded.
func (a *billingAdapter) MarkCancelled(ctx context.Context, appointmentID primitive.ObjectID) error {
	update := bson.M{"$set": bson.M{
		"status":         string(booking.StatusCancelled),
		"payment_status": string(booking.PaymentRefunded),
		"updated_at":     time.Now().UTC(),
	}}
	return a.apptRepo.Update(ctx, appointmentID, update)
}

// AppointmentStatsByMonth returns clinic-wide appointment totals and no-show
// counts for each calendar month in the half-open [start, end) window, powering
// the admin dashboard's no-show-rate series.
//
// It runs a single aggregation that buckets appointments by the calendar month
// of their `date` field (using $dateToString on a UTC "YYYY-MM" key) and counts
// both the total and the subset whose status is NO_SHOW. The result is mapped
// into finance.MonthlyAppointmentStat values. Months in the window that have no
// appointments are absent from the result (the caller fills the gaps with
// zeros), which is fine because a month with no appointments has a 0 no-show
// rate by definition.
func (a *billingAdapter) AppointmentStatsByMonth(ctx context.Context, start, end time.Time) ([]finance.MonthlyAppointmentStat, error) {
	// Group by a "YYYY-MM" UTC key derived from the appointment date, and within
	// each bucket count the total and the no-show subset.
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"date": bson.M{"$gte": start, "$lt": end},
		}}},
		{{Key: "$group", Value: bson.M{
			"_id": bson.M{
				"$dateToString": bson.M{
					"format":   "%Y-%m",
					"date":     "$date",
					"timezone": "UTC",
				},
			},
			"total":   bson.M{"$sum": 1},
			"no_show": bson.M{"$sum": bson.M{"$cond": bson.M{"if": bson.M{"$eq": []string{"$status", string(booking.StatusNoShow)}}, "then": 1, "else": 0}}},
		}}},
		{{Key: "$sort", Value: bson.M{"_id": 1}}},
	}

	cur, err := a.apptRepo.Collection().Aggregate(ctx, pipeline)
	if err != nil {
		return nil, fmt.Errorf("appointmentStatsByMonth: aggregate failed: %w", err)
	}
	defer func() { _ = cur.Close(ctx) }()

	var results []struct {
		ID     string `bson:"_id"`
		Total  int64  `bson:"total"`
		NoShow int64  `bson:"no_show"`
	}
	if err := cur.All(ctx, &results); err != nil {
		return nil, fmt.Errorf("appointmentStatsByMonth: decode failed: %w", err)
	}

	stats := make([]finance.MonthlyAppointmentStat, 0, len(results))
	for _, r := range results {
		// Parse the "YYYY-MM" bucket key back into year/month integers so the
		// finance layer never deals with raw strings.
		t, perr := time.Parse("2006-01", r.ID)
		if perr != nil {
			logger.Get().Warn("appointmentStatsByMonth: skipping unparseable month bucket", "bucket", r.ID, "error", perr)
			continue
		}
		stats = append(stats, finance.MonthlyAppointmentStat{
			Year:   t.Year(),
			Month:  int(t.Month()),
			Total:  r.Total,
			NoShow: r.NoShow,
		})
	}
	return stats, nil
}

// clinicUserReader adapts the generic users repository to the
// clinic.UserReader interface. It exists so the clinic domain can denormalize a
// doctor profile with its linked user's identity (name/phone/national code)
// without ever importing internal/user — the dependency direction mandated by
// the project's Clean Architecture rules. It is the user→clinic analogue of the
// booking→finance billingAdapter above.
type clinicUserReader struct {
	repo *database.Repository[user.User]
}

// Compile-time assertion that clinicUserReader satisfies clinic.UserReader. A
// signature mismatch surfaces as a build error here rather than at runtime.
var _ clinic.UserReader = (*clinicUserReader)(nil)

// GetByID returns the user-identity projection for the given id. A missing user
// propagates as database.ErrNotFound so the clinic service can degrade the
// enrichment gracefully (it logs and skips).
func (r *clinicUserReader) GetByID(ctx context.Context, id primitive.ObjectID) (*clinic.UserInfo, error) {
	u, err := r.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return toClinicUserInfo(u), nil
}

// FindByIDs returns the user-identity projections for the given ids in a single
// batched query, keyed by id. Unknown ids are simply absent from the result map
// (no error), which keeps listing resilient to orphaned profiles.
func (r *clinicUserReader) FindByIDs(ctx context.Context, ids []primitive.ObjectID) (map[primitive.ObjectID]*clinic.UserInfo, error) {
	out := make(map[primitive.ObjectID]*clinic.UserInfo, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	users, err := r.repo.FindAll(ctx, bson.M{"_id": bson.M{"$in": ids}})
	if err != nil {
		return nil, err
	}
	for _, u := range users {
		info := toClinicUserInfo(u)
		out[info.ID] = info
	}
	return out, nil
}

// toClinicUserInfo maps a user.User entity into the clinic domain's identity
// projection. Centralizing the field copy keeps the mapping in one place.
func toClinicUserInfo(u *user.User) *clinic.UserInfo {
	if u == nil {
		return nil
	}
	return &clinic.UserInfo{
		ID:           u.ID,
		FirstName:    u.FirstName,
		LastName:     u.LastName,
		Phone:        u.Phone,
		NationalCode: u.NationalCode,
	}
}

// CountReceptionistsByEmployerIDs returns how many RECEPTIONIST users are
// scoped to each doctor USER id via employer_id. Every requested id is present
// in the result map (0 when none).
func (r *clinicUserReader) CountReceptionistsByEmployerIDs(ctx context.Context, doctorUserIDs []primitive.ObjectID) (map[primitive.ObjectID]int, error) {
	out := make(map[primitive.ObjectID]int, len(doctorUserIDs))
	for _, id := range doctorUserIDs {
		out[id] = 0
	}
	if len(doctorUserIDs) == 0 {
		return out, nil
	}
	users, err := r.repo.FindAll(ctx, bson.M{
		"role":        user.RoleReceptionist,
		"employer_id": bson.M{"$in": doctorUserIDs},
	})
	if err != nil {
		return nil, err
	}
	for _, u := range users {
		if _, ok := out[u.EmployerID]; ok {
			out[u.EmployerID]++
		}
	}
	return out, nil
}

// CountPatientsByDoctorIDs returns patient roster counts per doctor USER id,
// matching user.Service.ListPatients: employer-linked patients plus distinct
// appointment patients, minus roster exclusions. Every requested id is present
// in the result map (0 when none).
func (r *clinicUserReader) CountPatientsByDoctorIDs(ctx context.Context, doctorUserIDs []primitive.ObjectID) (map[primitive.ObjectID]int, error) {
	out := make(map[primitive.ObjectID]int, len(doctorUserIDs))
	seen := make(map[primitive.ObjectID]map[primitive.ObjectID]struct{}, len(doctorUserIDs))
	for _, id := range doctorUserIDs {
		out[id] = 0
		seen[id] = map[primitive.ObjectID]struct{}{}
	}
	if len(doctorUserIDs) == 0 {
		return out, nil
	}

	byEmployer, err := r.repo.FindAll(ctx, bson.M{
		"role":        user.RolePatient,
		"employer_id": bson.M{"$in": doctorUserIDs},
	})
	if err != nil {
		return nil, err
	}
	for _, u := range byEmployer {
		docID := u.EmployerID
		if _, ok := out[docID]; !ok {
			continue
		}
		if containsOID(u.RosterExcludedDoctorIDs, docID) {
			continue
		}
		if _, ok := seen[docID][u.ID]; ok {
			continue
		}
		seen[docID][u.ID] = struct{}{}
		out[docID]++
	}

	type apptPair struct {
		DoctorID  primitive.ObjectID
		PatientID primitive.ObjectID
	}
	cur, err := r.repo.Collection().Database().Collection("appointments").Find(
		ctx,
		bson.M{"doctor_id": bson.M{"$in": doctorUserIDs}},
		options.Find().SetProjection(bson.M{"doctor_id": 1, "patient_id": 1}),
	)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var pairs []apptPair
	missingSet := map[primitive.ObjectID]struct{}{}
	for cur.Next(ctx) {
		var row struct {
			DoctorID  primitive.ObjectID `bson:"doctor_id"`
			PatientID primitive.ObjectID `bson:"patient_id"`
		}
		if err := cur.Decode(&row); err != nil {
			return nil, err
		}
		if _, ok := out[row.DoctorID]; !ok {
			continue
		}
		if _, ok := seen[row.DoctorID][row.PatientID]; ok {
			continue
		}
		pairs = append(pairs, apptPair{DoctorID: row.DoctorID, PatientID: row.PatientID})
		missingSet[row.PatientID] = struct{}{}
	}
	if err := cur.Err(); err != nil {
		return nil, err
	}
	if len(missingSet) == 0 {
		return out, nil
	}

	missing := make([]primitive.ObjectID, 0, len(missingSet))
	for id := range missingSet {
		missing = append(missing, id)
	}
	extra, err := r.repo.FindAll(ctx, bson.M{
		"role": user.RolePatient,
		"_id":  bson.M{"$in": missing},
	})
	if err != nil {
		return nil, err
	}
	byID := make(map[primitive.ObjectID]*user.User, len(extra))
	for _, u := range extra {
		byID[u.ID] = u
	}
	for _, p := range pairs {
		u := byID[p.PatientID]
		if u == nil {
			continue
		}
		if containsOID(u.RosterExcludedDoctorIDs, p.DoctorID) {
			continue
		}
		if _, ok := seen[p.DoctorID][p.PatientID]; ok {
			continue
		}
		seen[p.DoctorID][p.PatientID] = struct{}{}
		out[p.DoctorID]++
	}
	return out, nil
}

func containsOID(ids []primitive.ObjectID, id primitive.ObjectID) bool {
	for _, x := range ids {
		if x == id {
			return true
		}
	}
	return false
}

// bookingPatientResolver adapts the users repository to the
// booking.PatientInfoResolver interface so appointment responses can be
// denormalized with patient name/phone without the booking domain importing
// internal/user. It is the booking→user analogue of the clinicUserReader
// above.
type bookingPatientResolver struct {
	repo *database.Repository[user.User]
}

// Compile-time assertion that bookingPatientResolver satisfies
// booking.PatientInfoResolver. A signature mismatch surfaces as a build error
// here rather than at runtime.
var _ booking.PatientInfoResolver = (*bookingPatientResolver)(nil)

// ResolvePatient returns the patient's first name, last name and phone for the
// given patient ObjectID. A missing user propagates as database.ErrNotFound so
// the booking service can degrade enrichment gracefully (it logs and skips).
func (r *bookingPatientResolver) ResolvePatient(ctx context.Context, patientID primitive.ObjectID) (string, string, string, error) {
	u, err := r.repo.FindByID(ctx, patientID)
	if err != nil {
		return "", "", "", err
	}
	return u.FirstName, u.LastName, u.Phone, nil
}

// doctorPatientsAdapter implements both ehr.PatientVisitLookup and
// ehr.PatientInfoReader by delegating to the generic booking.Appointment and
// user.User repositories. It is the bridge that lets the EHR domain build the
// doctor's "My Patients" directory (per-patient appointment aggregates +
// demographics) without importing internal/booking or internal/user — the
// dependency direction the project's Clean Architecture mandates. It is the
// booking/user→ehr analogue of the billingAdapter and clinicUserReader above.
type doctorPatientsAdapter struct {
	// apptRepo is the generic repository over the "appointments" collection,
	// typed for the booking.Appointment entity.
	apptRepo *database.Repository[booking.Appointment]
	// userRepo is the generic repository over the "users" collection, typed for
	// the user.User entity.
	userRepo *database.Repository[user.User]
}

// Compile-time assertions that doctorPatientsAdapter satisfies both EHR
// collaborator interfaces. A signature mismatch surfaces as a build error here
// rather than at runtime.
var (
	_ ehr.PatientVisitLookup = (*doctorPatientsAdapter)(nil)
	_ ehr.PatientInfoReader  = (*doctorPatientsAdapter)(nil)
)

// ListVisitsByDoctor returns the visit facts for every appointment the given
// doctor has in the statuses the patient directory counts (CONFIRMED,
// CHECKED_IN, IN_PROGRESS, COMPLETED). It projects only the three fields the
// directory needs (patient_id, start_time, status) via a lightweight local
// decode struct, then maps each into an ehr.VisitFact.
func (a *doctorPatientsAdapter) ListVisitsByDoctor(ctx context.Context, doctorID primitive.ObjectID) ([]ehr.VisitFact, error) {
	filter := bson.M{
		"doctor_id": doctorID,
		"status": bson.M{"$in": []string{
			string(booking.StatusConfirmed),
			string(booking.StatusCheckedIn),
			string(booking.StatusCalled),
			string(booking.StatusInProgress),
			string(booking.StatusCompleted),
		}},
	}

	cur, err := a.apptRepo.Collection().Find(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("doctorPatientsAdapter: appointments query failed: %w", err)
	}
	defer func() { _ = cur.Close(ctx) }()

	var docs []struct {
		PatientID primitive.ObjectID `bson:"patient_id"`
		StartTime time.Time          `bson:"start_time"`
		Status    string             `bson:"status"`
	}
	if err := cur.All(ctx, &docs); err != nil {
		return nil, fmt.Errorf("doctorPatientsAdapter: appointments decode failed: %w", err)
	}

	facts := make([]ehr.VisitFact, 0, len(docs))
	for _, d := range docs {
		facts = append(facts, ehr.VisitFact{
			PatientID: d.PatientID,
			StartTime: d.StartTime,
			Status:    d.Status,
		})
	}
	return facts, nil
}

// GetPatientInfo returns the demographic projection for the given patient id.
// A missing user propagates the repository error (database.ErrNotFound) so the
// EHR service can skip that patient rather than failing the whole listing.
func (a *doctorPatientsAdapter) GetPatientInfo(ctx context.Context, patientID primitive.ObjectID) (ehr.PatientInfo, error) {
	u, err := a.userRepo.FindByID(ctx, patientID)
	if err != nil {
		return ehr.PatientInfo{}, err
	}
	return ehr.PatientInfo{
		FirstName:    u.FirstName,
		LastName:     u.LastName,
		Phone:        u.Phone,
		NationalCode: u.NationalCode,
	}, nil
}

// userSmsNotifier adapts notification.SmsSender to notification.Notifier by
// resolving the recipient's phone from the users repository. It is the bridge
// that lets domain notifications (keyed by user id) reuse the same live SMS
// transport as the OTP flow without the notification package importing
// internal/user.
type userSmsNotifier struct {
	sms  notification.SmsSender
	repo *database.Repository[user.User]
}

// Compile-time assertion that userSmsNotifier satisfies notification.Notifier.
var _ notification.Notifier = (*userSmsNotifier)(nil)

// Send looks up the user's phone and delivers message via the configured SMS
// gateway. A user without a phone number is logged and treated as a no-op so
// prescription issuance is never blocked by a missing contact.
func (n *userSmsNotifier) Send(ctx context.Context, userID primitive.ObjectID, message string) error {
	u, err := n.repo.FindByID(ctx, userID)
	if err != nil {
		return fmt.Errorf("userSmsNotifier: lookup user %s: %w", userID.Hex(), err)
	}
	if strings.TrimSpace(u.Phone) == "" {
		logger.Get().Warn("userSmsNotifier: user has no phone; skipping sms",
			"user_id", userID.Hex(),
		)
		return nil
	}
	return n.sms.Send(ctx, u.Phone, message)
}

// prescriptionDoctorNameResolver adapts the users repository to the
// prescription.DoctorNameResolver interface so prescription notifications can
// include the doctor's display name without the prescription domain importing
// internal/user.
type prescriptionDoctorNameResolver struct {
	repo *database.Repository[user.User]
}

// Compile-time assertion that prescriptionDoctorNameResolver satisfies
// prescription.DoctorNameResolver.
var _ prescription.DoctorNameResolver = (*prescriptionDoctorNameResolver)(nil)

// DoctorName returns "FirstName LastName" for the given doctor user id.
func (r *prescriptionDoctorNameResolver) DoctorName(ctx context.Context, doctorID primitive.ObjectID) (string, error) {
	u, err := r.repo.FindByID(ctx, doctorID)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(u.FirstName + " " + u.LastName), nil
}

// reviewAppointmentLookup adapts the appointments repository to
// review.AppointmentLookup so the review domain can validate completed visits
// without importing internal/booking.
type reviewAppointmentLookup struct {
	apptRepo *database.Repository[booking.Appointment]
}

var _ review.AppointmentLookup = (*reviewAppointmentLookup)(nil)

// FindAppointment returns the fields needed for review eligibility.
func (l *reviewAppointmentLookup) FindAppointment(ctx context.Context, id primitive.ObjectID) (*review.CompletedAppointment, error) {
	appt, err := l.apptRepo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return &review.CompletedAppointment{
		ID:        appt.ID,
		PatientID: appt.PatientID,
		DoctorID:  appt.DoctorID,
		Status:    string(appt.Status),
	}, nil
}

// reviewPatientNameReader adapts the users repository to review.PatientNameReader.
type reviewPatientNameReader struct {
	repo *database.Repository[user.User]
}

var _ review.PatientNameReader = (*reviewPatientNameReader)(nil)

// GetName returns the patient's first and last name for author initials.
func (r *reviewPatientNameReader) GetName(ctx context.Context, userID primitive.ObjectID) (string, string, error) {
	u, err := r.repo.FindByID(ctx, userID)
	if err != nil {
		return "", "", err
	}
	return u.FirstName, u.LastName, nil
}
