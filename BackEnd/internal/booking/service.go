package booking

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"clinic-api/internal/schedule"
	"clinic-api/pkg/database"
	"clinic-api/pkg/logger"
)

// ---------------------------------------------------------------------------
// Concurrency strategy for booking
// ---------------------------------------------------------------------------
//
// Two patients attempting to book the exact same (or overlapping) slot for the
// same doctor is the canonical race condition of an appointment system. We
// cannot rely on a simple "read then insert" because two concurrent requests
// would both read "no overlap" and both insert, producing a double booking.
//
// The strategy implemented here combines three layers of defense:
//
//  1. Transactional read-check-write. BookAppointment and RescheduleAppointment
//     execute inside a MongoDB transaction (client.StartSession /
//     WithTransaction). All reads (leave check, shift- containment check,
//     overlap check) and the final insert happen inside the SAME transaction so
//     that MongoDB's snapshot isolation gives us a consistent view and, crucially,
//     so that two transactions that both decide to write the same slot run into a
//     write conflict. The driver's WithTransaction helper automatically retries
//     the whole callback on transient errors (write conflicts /
//     TransientTransactionError / UnknownTransactionCommitResult), which is the
//     pattern the MongoDB documentation recommends for this exact problem.
//
//  2. Overlap query expressed directly in the filter. The overlap check uses the
//     classic half-open interval predicate
//       existing.start_time < new.end_time AND existing.end_time > new.start_time
//     restricted to the same doctor and to appointments whose status is NOT
//     cancelled (cancelled slots are free to be re-booked). Running this query
//     inside the transaction means a conflicting insert made by a concurrent
//     transaction is visible to us at commit time and surfaces as a write
//     conflict that triggers the retry, at which point the re-run will see the
//     now-conflicting appointment and reject the booking.
//
//  3. Recommended unique index. As belt-and-suspenders protection (and to
//     enforce correctness even on a standalone mongod that does not support
//     multi-document transactions), bootstrap should create a unique index on
//     { doctor_id: 1, start_time: 1 } (a partial index scoped to
//     status != "CANCELLED") so that a conflicting insert fails at the storage
//     layer regardless of any code-level check. The transaction + retry approach
//     remains the primary mechanism; the index is the hard guarantee.
//
// This layered approach makes double-booking impossible in practice while
// keeping the failure mode for a genuine conflict a clean ErrSlotConflict rather
// than a raw driver error.

// Sentinel errors returned by the service. Handlers translate these into the
// appropriate HTTP status via errormap. Using sentinel errors (rather than
// returning *errormap.APIError directly) keeps the service free of HTTP
// concerns, in line with Clean Architecture.
var (
	// ErrInvalidObjectID is returned when a supplied id is not a valid hex
	// ObjectID.
	ErrInvalidObjectID = errors.New("booking: invalid object id")
	// ErrAppointmentNotFound is returned when an appointment lookup yields no
	// document.
	ErrAppointmentNotFound = errors.New("booking: appointment not found")
	// ErrSlotInvalid is returned when the requested start time is not strictly
	// before the end time.
	ErrSlotInvalid = errors.New("booking: start time must be before end time")
	// ErrDoctorOnLeave is returned when the doctor is on leave on the requested
	// date.
	ErrDoctorOnLeave = errors.New("booking: doctor is on leave on this date")
	// ErrOutsideShift is returned when the requested slot is not fully contained
	// within any of the doctor's active shifts for that day.
	ErrOutsideShift = errors.New("booking: requested slot is outside the doctor's shift hours")
	// ErrSlotConflict is returned when the requested slot overlaps an existing
	// non-cancelled appointment for the same doctor.
	ErrSlotConflict = errors.New("booking: slot overlaps an existing appointment")
	// ErrCancellationTooLate is returned when a cancellation is attempted within
	// the no-refund window (less than 3 hours before the visit).
	ErrCancellationTooLate = errors.New("booking: cancellation is not allowed within 3 hours of the visit")
	// ErrAlreadyCancelled is returned when an appointment that is no longer in a
	// mutable state is targeted by cancel/reschedule.
	ErrAlreadyCancelled = errors.New("booking: appointment is not in a cancellable state")
	// ErrNotCheckable is returned by CheckIn/CallPatient/StartVisit when the
	// appointment is not in a state that allows that transition.
	ErrNotCheckable = errors.New("booking: appointment is not in a checkable state")
	// ErrSlotInThePast is returned by BookAppointment/RescheduleAppointment
	// when the requested start time is not strictly in the future. A slot that
	// has already begun cannot be booked.
	ErrSlotInThePast = errors.New("booking: requested start time is in the past")
	// ErrWaitingEntryNotFound is returned when a waiting-list entry lookup yields
	// no document.
	ErrWaitingEntryNotFound = errors.New("booking: waiting list entry not found")
	// ErrWaitingListEmpty is returned by ProcessWaitingList when there is nobody
	// to promote. It is benign and only logged, never surfaced as an HTTP error.
	ErrWaitingListEmpty = errors.New("booking: no patients on the waiting list")
	// ErrInvalidPriority is returned when a supplied priority is neither
	// "NORMAL" nor "URGENT".
	ErrInvalidPriority = errors.New("booking: invalid priority, expected NORMAL or URGENT")
	// ErrPatientNotFound is returned when the patient_id does not match a user
	// account (e.g. stale JWT after a DB reset).
	ErrPatientNotFound = errors.New("booking: patient account not found")
)

// Cancellation policy thresholds, per REQUIREMENTS.md section 2.C. They express
// how far before the visit a cancellation must happen to qualify for a refund.
const (
	// cancellationFullRefundWindow is the lead time (24h) beyond which the
	// patient gets a 100% refund.
	cancellationFullRefundWindow = 24 * time.Hour
	// cancellationNoRefundWindow is the lead time (3h) below which a
	// cancellation is rejected outright.
	cancellationNoRefundWindow = 3 * time.Hour
	// cancellationPenaltyPercent is the penalty fraction (20%) applied to
	// cancellations between the no-refund and full-refund windows.
	cancellationPenaltyPercent = 0.20
	// defaultVisitDuration is the visit length used when auto-picking a slot for
	// a converted waiting-list entry, mirroring the public slot-generation
	// default.
	defaultVisitDuration = 15 * time.Minute
)

// Notifier dispatches user-facing messages for booking lifecycle events.
// It mirrors the event methods on notification.Service so booking depends on a
// narrow abstraction rather than the concrete notification package, keeping the
// booking domain testable and mockable. A nil notifier (or nil Service) must be
// tolerated by implementations so notifications are purely best-effort.
type Notifier interface {
	// NotifyAppointmentConfirmation informs a patient their appointment was
	// confirmed.
	NotifyAppointmentConfirmation(ctx context.Context, patientID primitive.ObjectID, doctorName string, appointmentTime time.Time) error
	// NotifyAppointmentCancellation informs a patient their appointment was
	// cancelled.
	NotifyAppointmentCancellation(ctx context.Context, patientID primitive.ObjectID, doctorName string, appointmentTime time.Time) error
	// NotifyWaitingListTurn informs a patient a slot opened up and they were
	// promoted off the waiting list.
	NotifyWaitingListTurn(ctx context.Context, patientID primitive.ObjectID, doctorName string, appointmentTime time.Time) error
}

// ScheduleService is the subset of the schedule.Service surface that booking
// depends on. Declaring it as an interface (rather than importing the concrete
// type directly) keeps the dependency narrow and makes the booking service
// trivially testable with a fake schedule service.
type ScheduleService interface {
	// IsDoctorOnLeave reports whether the doctor is on leave on the given date.
	IsDoctorOnLeave(ctx context.Context, doctorID primitive.ObjectID, date time.Time) (bool, error)
	// GetShiftsByDoctorAndDate returns the doctor's shifts for the given date
	// via exact equality on the stored `date` field (midnight). Prefer
	// GetShiftsByDoctorBetween when the stored date may not be normalized.
	GetShiftsByDoctorAndDate(ctx context.Context, doctorID primitive.ObjectID, date time.Time) ([]*schedule.Shift, error)
	// GetShiftsByDoctorBetween returns shifts whose Date falls in [from, to).
	GetShiftsByDoctorBetween(ctx context.Context, doctorID primitive.ObjectID, from, to time.Time) ([]*schedule.Shift, error)
}

// PatientInfoResolver resolves a patient's contact identity (first name, last
// name, phone) for a given patient ObjectID. It is used to denormalize patient
// details onto AppointmentResponse for views that need them (e.g. the
// reception calendar/timeline). Declaring it as an interface keeps the booking
// domain free of any dependency on the user domain; bootstrap supplies a small
// adapter backed by the user repository.
type PatientInfoResolver interface {
	// ResolvePatient returns the patient's first name, last name and phone.
	ResolvePatient(ctx context.Context, patientID primitive.ObjectID) (firstName, lastName, phone string, err error)
}

// Service contains the booking domain's business logic. It owns the generic
// repositories for appointments and the waiting list, a reference to the
// schedule service (for leave/shift checks) and the mongo client used to run
// the booking/reschedule logic inside transactions.
type Service struct {
	apptRepo *database.Repository[Appointment]
	waitRepo *database.Repository[WaitingList]
	schedule ScheduleService
	client   *mongo.Client
	// notifier, when wired (typically the concrete notification.Service from
	// bootstrap), fires best-effort user messages on booking lifecycle events.
	// It may be nil; notifications never cause a booking operation to fail.
	notifier Notifier
	// patientResolver, when wired (typically a bootstrap adapter over the user
	// repository), denormalizes patient name/phone onto AppointmentResponse for
	// views that need them (e.g. the reception timeline). It may be nil, in
	// which case appointment responses carry no patient contact details.
	patientResolver PatientInfoResolver
	// visitSettler, when wired (typically finance.Service via a bootstrap
	// adapter), credits the doctor when a visit is completed. It may be nil;
	// clinical completion still succeeds if settlement is unavailable.
	visitSettler VisitSettler
	// previsit, when wired, creates/expires AI pre-visit sessions and sends
	// soft invites. Best-effort only; never fails booking operations.
	previsit PreVisitLifecycle
}

// PreVisitLifecycle hooks pre-visit AI intake into the booking lifecycle.
// Implemented in bootstrap over the previsit + notification services.
type PreVisitLifecycle interface {
	OnBooked(ctx context.Context, appointmentID, patientID, doctorID string)
	OnCancelled(ctx context.Context, appointmentID string)
	OnConfirmed(ctx context.Context, appointmentID, patientID, doctorName string, appointmentTime time.Time)
}

// VisitSettler settles the financial side of a completed visit (credit doctor
// wallet from a PARTIAL invoice or record an in-person payment). Implemented
// by bootstrap over finance.Service so booking does not import finance.
type VisitSettler interface {
	SettleAppointment(ctx context.Context, appointmentID string) error
}

// NewService constructs a Service bound to the given repositories, schedule
// service, mongo client and (optionally) a notifier. The client is required to
// start the multi-document transactions that make booking/reschedule
// concurrency-safe; the repositories are typically created in bootstrap from
// the underlying MongoDB collections. notifier may be nil to disable
// notifications without breaking the booking flow.
func NewService(
	apptRepo *database.Repository[Appointment],
	waitRepo *database.Repository[WaitingList],
	scheduleSvc ScheduleService,
	client *mongo.Client,
	notifier Notifier,
) *Service {
	return &Service{
		apptRepo: apptRepo,
		waitRepo: waitRepo,
		schedule: scheduleSvc,
		client:   client,
		notifier: notifier,
	}
}

// SetPatientResolver wires the optional PatientInfoResolver used to denormalize
// patient name/phone onto AppointmentResponse values (e.g. for the reception
// timeline). It mirrors SetBookingCompleter on the ehr service and
// SetDoctorUserIDResolver on the booking handler: a setter is used instead of a
// constructor parameter so the resolver can be supplied after construction by
// bootstrap without a circular dependency. Passing nil disables enrichment.
func (s *Service) SetPatientResolver(r PatientInfoResolver) {
	s.patientResolver = r
}

// SetVisitSettler wires the optional VisitSettler used to credit the doctor
// when a visit is marked completed. Passing nil disables auto-settlement.
func (s *Service) SetVisitSettler(settler VisitSettler) {
	s.visitSettler = settler
}

// SetPreVisitLifecycle wires optional AI pre-visit session hooks.
func (s *Service) SetPreVisitLifecycle(hooks PreVisitLifecycle) {
	s.previsit = hooks
}

// midnight normalizes a time to the start of its calendar day in its existing
// location, so day-based comparisons are exact regardless of the wall-clock
// component.
func midnight(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}

// calendarDateUTC stores the wall-clock calendar day of t (in t's location) as
// UTC midnight. Patient bookings arrive as Tehran offsets (+03:30); without this,
// midnight(t) keeps +03:30 and no longer equals the UTC-midnight day keys used
// by GetDailyTimeline / schedule queries.
func calendarDateUTC(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

// sameUTCCalendarDay reports whether t falls on the same UTC calendar day as day.
func sameUTCCalendarDay(t, day time.Time) bool {
	u := t.UTC()
	d := day.UTC()
	return u.Year() == d.Year() && u.Month() == d.Month() && u.Day() == d.Day()
}

// paymentTypeFromEntryType maps a waiting-list registration channel to the
// expected payment channel. Walk-in and phone registrations are settled at the
// clinic; online registrations pay via the patient app / wallet.
func paymentTypeFromEntryType(et EntryType) PaymentType {
	switch et {
	case EntryWalkin, EntryPhone:
		return PaymentTypeInPerson
	default:
		return ""
	}
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

// BookAppointment creates a new appointment after validating the slot. It is
// concurrency-safe: see the strategy documented at the top of this file. On
// success the new appointment is returned in PENDING status (awaiting
// receptionist confirmation). SMS is sent only after ConfirmAppointment.
func (s *Service) BookAppointment(ctx context.Context, req BookAppointmentRequest) (*AppointmentResponse, error) {
	doctorOID, err := primitive.ObjectIDFromHex(req.DoctorID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}
	patientOID, err := primitive.ObjectIDFromHex(req.PatientID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	if err := validateSlotTimes(req.StartTime, req.EndTime); err != nil {
		return nil, err
	}

	// Resolve + denormalize patient contact so reception calendars show a name
	// without a live join. When the resolver is wired, a missing account is a
	// hard failure (prevents orphan patient_ids from stale JWTs).
	patientName, patientPhone := "", ""
	if s.patientResolver != nil {
		firstName, lastName, phone, err := s.patientResolver.ResolvePatient(ctx, patientOID)
		if err != nil {
			logger.Get().Warn("bookAppointment: patient not found",
				"patient_id", req.PatientID, "error", err)
			return nil, ErrPatientNotFound
		}
		patientName = strings.TrimSpace(firstName + " " + lastName)
		patientPhone = strings.TrimSpace(phone)
	}

	// Build the appointment entity up front; the transaction callback only has
	// to run the eligibility checks and the insert. BranchID is intentionally
	// left as a zero ObjectID: branches were removed project-wide.
	now := time.Now().UTC()
	appt := Appointment{
		ID:            primitive.NewObjectID(),
		PatientID:     patientOID,
		DoctorID:      doctorOID,
		Date:          calendarDateUTC(req.StartTime),
		StartTime:     req.StartTime,
		EndTime:       req.EndTime,
		Status:        StatusPending,
		PaymentStatus: PaymentUnpaid,
		PaymentType:   req.PaymentType,
		PatientName:   patientName,
		PatientPhone:  patientPhone,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	// Run the eligibility checks + insert inside a transaction so concurrent
	// bookings of overlapping slots cannot both succeed.
	if err := s.withTx(ctx, func(txCtx context.Context) error {
		return s.createAppointmentTx(txCtx, appt)
	}); err != nil {
		return nil, err
	}

	logger.Get().Info("appointment booked", "id", appt.ID.Hex(), "doctor_id", req.DoctorID, "patient_id", req.PatientID)

	if s.previsit != nil {
		s.previsit.OnBooked(ctx, appt.ID.Hex(), req.PatientID, req.DoctorID)
	}

	return appt.ToResponse(), nil
}

// createAppointmentTx performs the eligibility checks (leave, shift containment,
// no overlap) and the insert, intended to run inside a transaction. Keeping it
// separate from BookAppointment lets RescheduleAppointment reuse the exact same
// eligibility rules for the new slot.
func (s *Service) createAppointmentTx(ctx context.Context, appt Appointment) error {
	if err := s.checkEligibilityTx(ctx, appt.DoctorID, appt.Date, appt.StartTime, appt.EndTime, primitive.NilObjectID); err != nil {
		return err
	}

	if _, err := s.apptRepo.Insert(ctx, appt); err != nil {
		// A duplicate-key error here means the defensive unique index caught a
		// race that the overlap check missed; surface it as a clean conflict.
		if isDuplicateKeyErr(err) {
			return ErrSlotConflict
		}
		logger.Get().Error("createAppointmentTx: insert failed", "doctor_id", appt.DoctorID.Hex(), "error", err)
		return err
	}
	return nil
}

// checkEligibilityTx runs the three preconditions a slot must satisfy to be
// bookable. excludeID lets reschedule ignore the appointment being moved so it
// does not overlap itself. It is meant to run inside the same transaction as the
// subsequent insert.
func (s *Service) checkEligibilityTx(ctx context.Context, doctorID primitive.ObjectID, date, start, end time.Time, excludeID primitive.ObjectID) error {
	// 1) Leave: no bookings on a doctor's day off.
	onLeave, err := s.schedule.IsDoctorOnLeave(ctx, doctorID, date)
	if err != nil {
		logger.Get().Error("checkEligibilityTx: leave lookup failed", "doctor_id", doctorID.Hex(), "error", err)
		return err
	}
	if onLeave {
		return ErrDoctorOnLeave
	}

	// 2) Shift containment: the slot must fit entirely within at least one of
	// the doctor's active shifts for that calendar day. Use a tolerant date
	// window (same approach as the public /doctors/:id/slots handler) because
	// stored shift `date` values are not always normalized to UTC midnight —
	// exact equality misses shifts the patient can already see and select.
	shifts, err := s.shiftsCoveringDay(ctx, doctorID, start)
	if err != nil {
		logger.Get().Error("checkEligibilityTx: shift lookup failed", "doctor_id", doctorID.Hex(), "error", err)
		return err
	}
	if !withinAShift(start, end, shifts) {
		return ErrOutsideShift
	}

	// 3) Overlap: no two non-cancelled appointments for the same doctor may
	// overlap. Two half-open ranges [s1,e1) and [s2,e2) overlap iff
	// s1 < e2 && s2 < e1, which translates directly to the BSON filter below.
	conflict, err := s.hasOverlapTx(ctx, doctorID, start, end, excludeID)
	if err != nil {
		logger.Get().Error("checkEligibilityTx: overlap lookup failed", "doctor_id", doctorID.Hex(), "error", err)
		return err
	}
	if conflict {
		return ErrSlotConflict
	}

	return nil
}

// shiftsCoveringDay returns active-candidate shifts whose start falls on the
// same UTC calendar day as `when`. Mirrors the public slots endpoint so
// bookability checks agree with what patients were shown.
func (s *Service) shiftsCoveringDay(ctx context.Context, doctorID primitive.ObjectID, when time.Time) ([]*schedule.Shift, error) {
	day := time.Date(when.UTC().Year(), when.UTC().Month(), when.UTC().Day(), 0, 0, 0, 0, time.UTC)
	raw, err := s.schedule.GetShiftsByDoctorBetween(ctx, doctorID, day.Add(-24*time.Hour), day.Add(48*time.Hour))
	if err != nil {
		return nil, err
	}
	out := make([]*schedule.Shift, 0, len(raw))
	for _, sh := range raw {
		su := sh.StartTime.UTC()
		if su.Year() == day.Year() && su.Month() == day.Month() && su.Day() == day.Day() {
			out = append(out, sh)
		}
	}
	return out, nil
}

// hasOverlapTx reports whether any non-cancelled appointment for the given
// doctor overlaps the [start, end) interval, optionally excluding the
// appointment identified by excludeID (used during reschedule).
func (s *Service) hasOverlapTx(ctx context.Context, doctorID primitive.ObjectID, start, end time.Time, excludeID primitive.ObjectID) (bool, error) {
	filter := bson.M{
		"doctor_id":  doctorID,
		"status":     bson.M{"$ne": StatusCancelled},
		"start_time": bson.M{"$lt": end},
		"end_time":   bson.M{"$gt": start},
	}
	if excludeID != primitive.NilObjectID {
		filter["_id"] = bson.M{"$ne": excludeID}
	}

	if _, err := s.apptRepo.FindOne(ctx, filter); err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

// CancelAppointment cancels the appointment identified by req.ID, applying the
// refund/penalty policy from REQUIREMENTS.md section 2.C. After a successful
// cancellation it triggers the waiting-list engine so the first waiting patient
// is auto-promoted.
func (s *Service) CancelAppointment(ctx context.Context, req CancelAppointmentRequest) (*AppointmentResponse, error) {
	oid, err := primitive.ObjectIDFromHex(req.ID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	// Fetch the appointment first so we can apply the time-based policy against
	// its StartTime. We do not need a transaction here because the status
	// transition is a single conditional update (idempotent on conflict).
	appt, err := s.apptRepo.FindByID(ctx, oid)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrAppointmentNotFound
		}
		logger.Get().Error("cancelAppointment: lookup failed", "id", req.ID, "error", err)
		return nil, err
	}

	// Only pending/confirmed appointments can be cancelled.
	if appt.Status == StatusCancelled || appt.Status == StatusCompleted || appt.Status == StatusNoShow {
		return nil, ErrAlreadyCancelled
	}

	now := time.Now()
	leadTime := appt.StartTime.Sub(now)

	// Cancellations inside the no-refund window (< 3h) are rejected outright.
	if leadTime < cancellationNoRefundWindow {
		return nil, ErrCancellationTooLate
	}

	// Apply the refund/penalty policy based on how much lead time remains.
	refundPercent := computeRefundPercent(leadTime)

	// TODO(wallet): once the wallet domain exists, record the refund/penalty
	// against the patient's digital wallet and append an immutable ledger entry.
	// For now the policy is computed and logged so the booking domain stands on
	// its own; integration with the wallet is a wiring task for bootstrap.
	logger.Get().Info("cancellation refund computed",
		"appointment_id", appt.ID.Hex(),
		"refund_percent", refundPercent,
		"reason", req.Reason,
	)

	// Conditional update: only flip the status if it is still cancellable, so a
	// concurrent cancel/complete cannot race us.
	filter := bson.M{
		"_id": oid,
		// Checked-in / called appointments may still be cancelled (e.g. by reception).
		"status": bson.M{"$in": bson.A{StatusPending, StatusConfirmed, StatusCheckedIn, StatusCalled}},
	}
	update := bson.M{
		"$set": bson.M{
			"status":     StatusCancelled,
			"updated_at": now,
		},
	}
	if err := s.apptRepo.Collection().FindOneAndUpdate(ctx, filter, update).Err(); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrAlreadyCancelled
		}
		logger.Get().Error("cancelAppointment: update failed", "id", req.ID, "error", err)
		return nil, err
	}

	// Re-read to return the updated state.
	updated, err := s.apptRepo.FindByID(ctx, oid)
	if err != nil {
		logger.Get().Error("cancelAppointment: re-read failed", "id", req.ID, "error", err)
		return nil, err
	}

	logger.Get().Info("appointment cancelled", "id", req.ID)

	// Best-effort cancellation notification. The cancellation already
	// persisted, so the notification must never cause it to fail.
	s.notifyAppointmentCancellation(ctx, *updated)

	if s.previsit != nil {
		s.previsit.OnCancelled(ctx, updated.ID.Hex())
	}

	// Promote the next waiting patient into the freed slot. Failures here are
	// non-fatal: the cancellation already succeeded, so we log and move on.
	s.processWaitingListBestEffort(ctx, updated.DoctorID, updated.Date)

	return updated.ToResponse(), nil
}

// computeRefundPercent returns the refund fraction (0..1) for a cancellation
// made with the given lead time before the visit, per REQUIREMENTS.md 2.C:
//   - > 24h:    100% refund.
//   - 3h..24h:  80% refund (20% penalty).
//   - < 3h:     the caller must reject the cancellation before reaching here.
func computeRefundPercent(leadTime time.Duration) float64 {
	if leadTime >= cancellationFullRefundWindow {
		return 1.0
	}
	return 1.0 - cancellationPenaltyPercent
}

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

// ConfirmAppointment transitions a PENDING appointment to CONFIRMED and sends
// the confirmation SMS. Only reception should call this after reviewing the
// booking request.
func (s *Service) ConfirmAppointment(ctx context.Context, id string) (*AppointmentResponse, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	now := time.Now().UTC()
	filter := bson.M{
		"_id":    oid,
		"status": StatusPending,
	}
	update := bson.M{
		"$set": bson.M{
			"status":     StatusConfirmed,
			"updated_at": now,
		},
	}
	if err := s.apptRepo.Collection().FindOneAndUpdate(ctx, filter, update).Err(); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			if _, lookupErr := s.apptRepo.FindByID(ctx, oid); errors.Is(lookupErr, database.ErrNotFound) {
				return nil, ErrAppointmentNotFound
			}
			return nil, ErrNotCheckable
		}
		logger.Get().Error("confirmAppointment: update failed", "id", id, "error", err)
		return nil, err
	}

	updated, err := s.apptRepo.FindByID(ctx, oid)
	if err != nil {
		logger.Get().Error("confirmAppointment: re-read failed", "id", id, "error", err)
		return nil, err
	}

	logger.Get().Info("appointment confirmed", "id", id)
	s.notifyAppointmentConfirmation(ctx, *updated)
	if s.previsit != nil {
		s.previsit.OnConfirmed(ctx, updated.ID.Hex(), updated.PatientID.Hex(), updated.DoctorID.Hex(), updated.StartTime)
	}

	return updated.ToResponse(), nil
}

// CheckIn marks an appointment as CHECKED_IN, i.e. the patient has arrived and
// is in the waiting hall. Only CONFIRMED appointments may be checked in.
func (s *Service) CheckIn(ctx context.Context, id string) (*AppointmentResponse, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	now := time.Now().UTC()
	filter := bson.M{
		"_id":    oid,
		"status": StatusConfirmed,
	}
	update := bson.M{
		"$set": bson.M{
			"status":     StatusCheckedIn,
			"updated_at": now,
		},
	}
	if err := s.apptRepo.Collection().FindOneAndUpdate(ctx, filter, update).Err(); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotCheckable
		}
		logger.Get().Error("checkIn: update failed", "id", id, "error", err)
		return nil, err
	}

	updated, err := s.apptRepo.FindByID(ctx, oid)
	if err != nil {
		logger.Get().Error("checkIn: re-read failed", "id", id, "error", err)
		return nil, err
	}

	logger.Get().Info("appointment checked in", "id", id)

	return updated.ToResponse(), nil
}

// CallPatient transitions CHECKED_IN → CALLED when reception calls the patient
// (their turn / admit to room). StartVisit follows from CALLED.
func (s *Service) CallPatient(ctx context.Context, id string) (*AppointmentResponse, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	now := time.Now().UTC()
	filter := bson.M{
		"_id":    oid,
		"status": StatusCheckedIn,
	}
	update := bson.M{
		"$set": bson.M{
			"status":     StatusCalled,
			"updated_at": now,
		},
	}
	if err := s.apptRepo.Collection().FindOneAndUpdate(ctx, filter, update).Err(); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			if _, lookupErr := s.apptRepo.FindByID(ctx, oid); errors.Is(lookupErr, database.ErrNotFound) {
				return nil, ErrAppointmentNotFound
			}
			return nil, ErrNotCheckable
		}
		logger.Get().Error("callPatient: update failed", "id", id, "error", err)
		return nil, err
	}

	updated, err := s.apptRepo.FindByID(ctx, oid)
	if err != nil {
		logger.Get().Error("callPatient: re-read failed", "id", id, "error", err)
		return nil, err
	}

	logger.Get().Info("patient called", "id", id)

	return updated.ToResponse(), nil
}

// ---------------------------------------------------------------------------
// Reschedule
// ---------------------------------------------------------------------------

// RescheduleAppointment atomically moves an existing appointment to a new slot.
// The new slot must satisfy the same eligibility rules as a fresh booking
// (leave, shift containment, no overlap), ignoring the appointment's own
// current slot. The whole operation runs inside a transaction to prevent a
// double-booking race against concurrent bookings.
func (s *Service) RescheduleAppointment(ctx context.Context, req RescheduleAppointmentRequest) (*AppointmentResponse, error) {
	oid, err := primitive.ObjectIDFromHex(req.ID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	if err := validateSlotTimes(req.StartTime, req.EndTime); err != nil {
		return nil, err
	}

	// Pre-fetch the appointment to confirm it exists and is reschedulable; we
	// re-check inside the transaction to remain race-safe.
	existing, err := s.apptRepo.FindByID(ctx, oid)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrAppointmentNotFound
		}
		logger.Get().Error("rescheduleAppointment: lookup failed", "id", req.ID, "error", err)
		return nil, err
	}
	if existing.Status != StatusPending && existing.Status != StatusConfirmed {
		return nil, ErrAlreadyCancelled
	}

	newDate := calendarDateUTC(req.StartTime)

	if err := s.withTx(ctx, func(txCtx context.Context) error {
		// Re-check eligibility for the new slot, excluding the appointment being
		// moved so it cannot collide with itself.
		if err := s.checkEligibilityTx(txCtx, existing.DoctorID, newDate, req.StartTime, req.EndTime, oid); err != nil {
			return err
		}

		filter := bson.M{
			"_id":    oid,
			"status": bson.M{"$in": bson.A{StatusPending, StatusConfirmed}},
		}
		update := bson.M{
			"$set": bson.M{
				"date":       newDate,
				"start_time": req.StartTime,
				"end_time":   req.EndTime,
				"updated_at": time.Now(),
			},
		}
		if err := s.apptRepo.Collection().FindOneAndUpdate(txCtx, filter, update).Err(); err != nil {
			if errors.Is(err, mongo.ErrNoDocuments) {
				return ErrAlreadyCancelled
			}
			return err
		}
		return nil
	}); err != nil {
		return nil, err
	}

	updated, err := s.apptRepo.FindByID(ctx, oid)
	if err != nil {
		logger.Get().Error("rescheduleAppointment: re-read failed", "id", req.ID, "error", err)
		return nil, err
	}

	logger.Get().Info("appointment rescheduled", "id", req.ID)

	return updated.ToResponse(), nil
}

// ---------------------------------------------------------------------------
// Waiting list
// ---------------------------------------------------------------------------

// JoinWaitingList adds a patient to the waiting list for the given doctor/date.
// The queue is ordered by CreatedAt (see WaitingList docs). Duplicates are
// allowed: a patient may rejoin after a previous promotion; uniqueness, if
// desired, is a policy for bootstrap to enforce via an index.
func (s *Service) JoinWaitingList(ctx context.Context, req JoinWaitingListRequest) (*WaitingListResponse, error) {
	doctorOID, err := primitive.ObjectIDFromHex(req.DoctorID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}
	// For ONLINE registrations a patient account is required. For WALKIN/PHONE
	// quick registrations there may be no account yet, so an empty/invalid
	// patient id is tolerated and stored as a zero ObjectID.
	var patientOID primitive.ObjectID
	if req.PatientID != "" {
		patientOID, err = primitive.ObjectIDFromHex(req.PatientID)
		if err != nil {
			return nil, ErrInvalidObjectID
		}
	}

	// Normalize and default the optional triage/registration fields.
	priority := PriorityNormal
	if req.Priority != "" {
		p, err := parsePriority(req.Priority)
		if err != nil {
			return nil, err
		}
		priority = p
	}
	entryType := EntryOnline
	if req.EntryType != "" {
		et, err := parseEntryType(req.EntryType)
		if err != nil {
			return nil, err
		}
		entryType = et
	}

	now := time.Now().UTC()
	entry := WaitingList{
		ID:          primitive.NewObjectID(),
		PatientID:   patientOID,
		DoctorID:    doctorOID,
		Date:        midnight(req.Date),
		CreatedAt:   now,
		Priority:    priority,
		Phone:       req.Phone,
		PatientName: req.PatientName,
		EntryType:   entryType,
	}

	id, err := s.waitRepo.Insert(ctx, entry)
	if err != nil {
		logger.Get().Error("joinWaitingList: insert failed", "doctor_id", req.DoctorID, "error", err)
		return nil, err
	}
	entry.ID = id

	logger.Get().Info("patient joined waiting list", "id", entry.ID.Hex(), "doctor_id", req.DoctorID)

	return entry.ToResponse(), nil
}

// GetWaitingList returns the waiting-list entries for the given doctor on the
// given date, ordered FIFO by CreatedAt. Already-notified entries are excluded
// so callers only see patients still waiting.
func (s *Service) GetWaitingList(ctx context.Context, doctorID, date string) ([]*WaitingListResponse, error) {
	doctorOID, err := primitive.ObjectIDFromHex(doctorID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}
	parsed, err := time.Parse("2006-01-02", date)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	filter := bson.M{
		"doctor_id": doctorOID,
		"date":      midnight(parsed),
	}

	entries, err := s.waitRepo.FindAll(ctx, filter)
	if err != nil {
		logger.Get().Error("getWaitingList: query failed", "error", err)
		return nil, err
	}

	results := make([]*WaitingListResponse, 0, len(entries))
	for _, e := range entries {
		results = append(results, e.ToResponse())
	}
	return results, nil
}

// ProcessWaitingList is the entry point of the smart-queue engine. After an
// appointment is cancelled it fetches the first (oldest by CreatedAt) still-
// waiting patient for that doctor/date, marks them notified and auto-creates a
// CONFIRMED appointment. It returns the promoted patient's new appointment (or
// nil if nobody was waiting) and the originating waiting-list entry id.
//
// The promotion runs inside a transaction so the waiting-list mutation and the
// new appointment insert commit atomically.
func (s *Service) ProcessWaitingList(ctx context.Context, doctorID primitive.ObjectID, date time.Time) (*AppointmentResponse, primitive.ObjectID, error) {
	day := midnight(date)

	var promoted *AppointmentResponse
	var entryID primitive.ObjectID

	err := s.withTx(ctx, func(txCtx context.Context) error {
		// Find the oldest still-waiting entry for this doctor/date.
		entry, err := s.firstWaitingTx(txCtx, doctorID, day)
		if err != nil {
			return err
		}

		// Mark the entry as notified so it is not promoted twice by a concurrent
		// trigger. The conditional filter (notified_at == zero) makes the claim
		// atomic.
		filter := bson.M{
			"_id":         entry.ID,
			"notified_at": primitive.NilObjectID,
		}
		update := bson.M{"$set": bson.M{"notified_at": time.Now()}}
		if err := s.waitRepo.Collection().FindOneAndUpdate(txCtx, filter, update).Err(); err != nil {
			if errors.Is(err, mongo.ErrNoDocuments) {
				// Another concurrent promotion grabbed it first; nothing to do.
				return ErrWaitingListEmpty
			}
			return err
		}

		// Auto-create a CONFIRMED appointment for the promoted patient. The slot
		// reuses the branch/date of the freed appointment's context: since we do
		// not have the exact freed slot here, we book the doctor's next available
		// shift window for that date as a sensible default. In a fuller system a
		// notification + patient confirmation flow would precede this insert.
		slot, err := s.firstShiftSlotTx(txCtx, doctorID, day)
		if err != nil {
			return err
		}

		now := time.Now().UTC()
		appt := Appointment{
			ID:            primitive.NewObjectID(),
			PatientID:     entry.PatientID,
			DoctorID:      doctorID,
			BranchID:      slot.branch,
			Date:          day,
			StartTime:     slot.start,
			EndTime:       slot.end,
			Status:        StatusConfirmed,
			PaymentStatus: PaymentUnpaid,
			PaymentType:   paymentTypeFromEntryType(entry.EntryType),
			PatientName:   entry.PatientName,
			PatientPhone:  entry.Phone,
			CreatedAt:     now,
			UpdatedAt:     now,
		}
		if _, err := s.apptRepo.Insert(txCtx, appt); err != nil {
			return err
		}

		promoted = appt.ToResponse()
		entryID = entry.ID
		return nil
	})
	if err != nil {
		return nil, primitive.NilObjectID, err
	}

	return promoted, entryID, nil
}

// processWaitingListBestEffort runs ProcessWaitingList and swallows the benign
// "empty waiting list" case, logging any other error. It is the wrapper used by
// CancelAppointment where a promotion failure must never undo the cancellation.
func (s *Service) processWaitingListBestEffort(ctx context.Context, doctorID primitive.ObjectID, date time.Time) {
	appt, entryID, err := s.ProcessWaitingList(ctx, doctorID, date)
	switch {
	case errors.Is(err, ErrWaitingListEmpty):
		logger.Get().Debug("processWaitingListBestEffort: no patients waiting", "doctor_id", doctorID.Hex())
	case err != nil:
		logger.Get().Error("processWaitingListBestEffort: failed", "doctor_id", doctorID.Hex(), "error", err)
	default:
		logger.Get().Info("waiting list patient promoted",
			"appointment_id", appt.ID.Hex(),
			"waiting_list_id", entryID.Hex(),
		)
		// Best-effort notification: a promotion is independent of the caller's
		// booking operation, so this notification must never fail it.
		s.notifyWaitingListTurn(ctx, appt)
	}
}

// ConvertWaitingEntry turns an existing waiting-list entry into a real,
// confirmed appointment. The entry is atomically claimed (its notified_at is
// set) so it cannot be converted/promoted twice; the doctor's first free
// visit-duration slot for the entry's date is then booked for the waiting
// patient under the same eligibility rules as a normal booking (leave, shift
// containment, no overlap). The whole operation runs inside a transaction.
func (s *Service) ConvertWaitingEntry(ctx context.Context, entryID string) (*AppointmentResponse, error) {
	oid, err := primitive.ObjectIDFromHex(entryID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	// 1) The entry must exist.
	entry, err := s.waitRepo.FindByID(ctx, oid)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrWaitingEntryNotFound
		}
		logger.Get().Error("convertWaitingEntry: lookup failed", "id", entryID, "error", err)
		return nil, err
	}

	// 2) Atomically claim the entry. notified_at == zero is the existing "still
	//    waiting" marker; flipping it prevents a double-convert (and also keeps
	//    it consistent with GetWaitingList's "booked" derivation).
	now := time.Now().UTC()
	claimFilter := bson.M{
		"_id":         entry.ID,
		"notified_at": primitive.NilObjectID,
	}
	claimUpdate := bson.M{"$set": bson.M{"notified_at": now}}
	if err := s.waitRepo.Collection().FindOneAndUpdate(ctx, claimFilter, claimUpdate).Err(); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrSlotConflict
		}
		logger.Get().Error("convertWaitingEntry: claim failed", "id", entryID, "error", err)
		return nil, err
	}

	day := midnight(entry.Date)

	// 3) Pick the first free visit-duration slot for doctor+date and create the
	//    appointment inside a transaction so eligibility (leave/shift/overlap)
	//    is enforced atomically.
	var createdAppt Appointment
	if err := s.withTx(ctx, func(txCtx context.Context) error {
		slot, err := s.firstFreeSlotTx(txCtx, entry.DoctorID, day)
		if err != nil {
			return err
		}

		appt := Appointment{
			ID:            primitive.NewObjectID(),
			PatientID:     entry.PatientID,
			DoctorID:      entry.DoctorID,
			BranchID:      slot.branch,
			Date:          day,
			StartTime:     slot.start,
			EndTime:       slot.end,
			Status:        StatusConfirmed,
			PaymentStatus: PaymentUnpaid,
			PaymentType:   PaymentTypeInPerson,
			PatientName:   entry.PatientName,
			PatientPhone:  entry.Phone,
			CreatedAt:     now,
			UpdatedAt:     now,
		}
		if err := s.createAppointmentTx(txCtx, appt); err != nil {
			return err
		}
		createdAppt = appt
		return nil
	}); err != nil {
		return nil, err
	}

	logger.Get().Info("waiting list entry converted to appointment",
		"waiting_list_id", entry.ID.Hex(), "appointment_id", createdAppt.ID.Hex())

	s.notifyAppointmentConfirmation(ctx, createdAppt)

	return createdAppt.ToResponse(), nil
}

// firstFreeSlotTx decomposes the doctor's active shifts for the given day into
// consecutive visit-duration slots and returns the first one that does not
// overlap any existing non-cancelled appointment. It is meant to run inside the
// same transaction as the subsequent insert so the availability check is
// consistent at commit time. If no active shift exists it falls back to the
// whole day (mirroring firstShiftSlotTx) so a manual reconciliation is still
// possible. It returns ErrOutsideShift when there is no bookable sub-slot.
func (s *Service) firstFreeSlotTx(ctx context.Context, doctorID primitive.ObjectID, day time.Time) (shiftSlot, error) {
	shifts, err := s.schedule.GetShiftsByDoctorAndDate(ctx, doctorID, day)
	if err != nil {
		return shiftSlot{}, err
	}

	for _, sh := range shifts {
		if !sh.IsActive {
			continue
		}
		for cur := sh.StartTime; ; cur = cur.Add(defaultVisitDuration) {
			slotStart := cur
			slotEnd := cur.Add(defaultVisitDuration)
			if slotEnd.After(sh.EndTime) {
				break
			}
			overlap, err := s.hasOverlapTx(ctx, doctorID, slotStart, slotEnd, primitive.NilObjectID)
			if err != nil {
				return shiftSlot{}, err
			}
			if !overlap {
				return shiftSlot{branch: sh.BranchID, start: slotStart, end: slotEnd}, nil
			}
		}
	}

	// No active shift / no free sub-slot: fall back to the whole day so the
	// appointment is still created (it will need manual reconciliation), mirroring
	// the existing firstShiftSlotTx behavior.
	return shiftSlot{branch: primitive.NilObjectID, start: day, end: day.Add(24 * time.Hour)}, nil
}

// firstWaitingTx returns the oldest still-waiting entry for the given
// doctor/date (NotifiedAt is zero), intended to run inside a transaction.
func (s *Service) firstWaitingTx(ctx context.Context, doctorID primitive.ObjectID, day time.Time) (*WaitingList, error) {
	filter := bson.M{
		"doctor_id":   doctorID,
		"date":        day,
		"notified_at": primitive.NilObjectID,
	}
	cur, err := s.waitRepo.Collection().Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer func() { _ = cur.Close(ctx) }()

	var entry WaitingList
	if !cur.Next(ctx) {
		return nil, ErrWaitingListEmpty
	}
	if err := cur.Decode(&entry); err != nil {
		return nil, err
	}
	return &entry, nil
}

// shiftSlot holds the (branch, start, end) window picked from a doctor's shift
// for an auto-created waiting-list appointment.
type shiftSlot struct {
	branch primitive.ObjectID
	start  time.Time
	end    time.Time
}

// firstShiftSlotTx returns the doctor's first active shift window for the given
// date, used to anchor the auto-created appointment for a promoted patient. It
// is intentionally simple: a real system would compute the actual next free
// sub-slot, but anchoring at the shift start is a reasonable default.
func (s *Service) firstShiftSlotTx(ctx context.Context, doctorID primitive.ObjectID, day time.Time) (shiftSlot, error) {
	shifts, err := s.schedule.GetShiftsByDoctorAndDate(ctx, doctorID, day)
	if err != nil {
		return shiftSlot{}, err
	}
	for _, sh := range shifts {
		if sh.IsActive {
			return shiftSlot{branch: sh.BranchID, start: sh.StartTime, end: sh.EndTime}, nil
		}
	}
	// No active shift on that day: fall back to the whole day so the appointment
	// is still created (it will need manual reconciliation).
	return shiftSlot{branch: primitive.NilObjectID, start: day, end: day.Add(24 * time.Hour)}, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Notification helpers (best-effort, never fatal)
// ---------------------------------------------------------------------------

// doctorNamePlaceholder is used as the doctorName argument to notifications.
// Booking does not own doctor-name lookup; until a resolver is wired in
// bootstrap the doctor's ObjectID hex is passed and the (mock) notifier logs
// it. Swap in a real DoctorNameResolver via bootstrap when available.
const doctorNamePlaceholderNote = "booking: doctor name not resolved, using ObjectID hex placeholder"

// notifyAppointmentConfirmation dispatches a confirmation notification for the
// given appointment in a best-effort manner. It never returns an error.
func (s *Service) notifyAppointmentConfirmation(ctx context.Context, appt Appointment) {
	s.safeNotify(func() error {
		return s.notifier.NotifyAppointmentConfirmation(ctx, appt.PatientID, appt.DoctorID.Hex(), appt.StartTime)
	})
}

// notifyAppointmentCancellation dispatches a cancellation notification for the
// given appointment in a best-effort manner. It never returns an error.
func (s *Service) notifyAppointmentCancellation(ctx context.Context, appt Appointment) {
	s.safeNotify(func() error {
		return s.notifier.NotifyAppointmentCancellation(ctx, appt.PatientID, appt.DoctorID.Hex(), appt.StartTime)
	})
}

// notifyWaitingListTurn dispatches a waiting-list-turn notification for the
// given promoted appointment (view DTO) in a best-effort manner. It never
// returns an error.
func (s *Service) notifyWaitingListTurn(ctx context.Context, appt *AppointmentResponse) {
	if appt == nil {
		return
	}
	s.safeNotify(func() error {
		return s.notifier.NotifyWaitingListTurn(ctx, appt.PatientID, appt.DoctorID.Hex(), appt.StartTime)
	})
}

// safeNotify dispatches a notification only when a notifier is wired and
// swallows any delivery error, logging it instead. Notifications are purely
// best-effort and must never cause a booking operation to fail.
func (s *Service) safeNotify(fn func() error) {
	if s.notifier == nil {
		return
	}
	if err := fn(); err != nil {
		logger.Get().Error("booking: notification failed", "err", err)
	}
}

// validateSlotTimes enforces that start is strictly before end and that the
// slot has not already begun. A slot whose start is not in the future (i.e. it
// is now or in the past) is rejected with ErrSlotInThePast so patients cannot
// book a time they would already have missed.
func validateSlotTimes(start, end time.Time) error {
	if !start.Before(end) {
		return ErrSlotInvalid
	}
	if !start.After(time.Now().UTC()) {
		return ErrSlotInThePast
	}
	return nil
}

// withinAShift reports whether the half-open interval [start, end) is fully
// contained within at least one of the given shifts. A slot that starts at or
// after the shift's start and ends at or before the shift's end qualifies.
func withinAShift(start, end time.Time, shifts []*schedule.Shift) bool {
	for _, sh := range shifts {
		if !sh.IsActive {
			continue
		}
		if !start.Before(sh.StartTime) && !end.After(sh.EndTime) {
			return true
		}
	}
	return false
}

// isDuplicateKeyErr reports whether err is a MongoDB duplicate-key (E11000)
// error, used to map a unique-index violation to a clean conflict.
func isDuplicateKeyErr(err error) bool {
	var we mongo.WriteException
	if errors.As(err, &we) {
		for _, we2 := range we.WriteErrors {
			if we2.Code == 11000 {
				return true
			}
		}
	}
	return false
}

// withTx runs fn inside a MongoDB transaction, retrying automatically on
// transient errors. If the deployment does not support multi-document
// transactions (e.g. a standalone mongod) the callback is run once without a
// session so the service degrades gracefully rather than hard-failing. This
// keeps local development against a standalone instance working while still
// being correct on a replica set.
func (s *Service) withTx(ctx context.Context, fn func(context.Context) error) error {
	if s.client == nil {
		// No client configured: run the callback directly.
		return fn(ctx)
	}

	session, err := s.client.StartSession()
	if err != nil {
		// Could not start a session (typical on a standalone mongod): fall back
		// to a non-transactional run so the service remains usable.
		logger.Get().Warn("withTx: sessions unavailable, running without transaction", "error", err)
		return fn(ctx)
	}
	defer session.EndSession(ctx)

	// WithTransaction commits/aborts automatically and retries the callback on
	// transient errors (write conflicts, commit failures), which is exactly the
	// guarantee the booking concurrency strategy relies on.
	_, err = session.WithTransaction(ctx, func(txCtx mongo.SessionContext) (interface{}, error) {
		return nil, fn(txCtx)
	})
	if err != nil {
		// Unwrap the duplicate-key case so callers can map it to ErrSlotConflict.
		if isDuplicateKeyErr(err) {
			return fmt.Errorf("%w: %v", ErrSlotConflict, err)
		}
		return err
	}
	return nil
}

// ---------------------------------------------------------------------------
// Queue control (reception panel)
// ---------------------------------------------------------------------------

// StartVisit transitions an appointment from CALLED to IN_PROGRESS, i.e.
// the doctor has started seeing the patient. The transition is a single
// conditional update so a concurrent state change cannot race it. If the
// appointment exists but is not in the CALLED state, ErrNotCheckable is
// returned.
func (s *Service) StartVisit(ctx context.Context, appointmentID string) error {
	oid, err := primitive.ObjectIDFromHex(appointmentID)
	if err != nil {
		return ErrInvalidObjectID
	}

	now := time.Now().UTC()
	filter := bson.M{
		"_id":    oid,
		"status": StatusCalled,
	}
	update := bson.M{
		"$set": bson.M{
			"status":           StatusInProgress,
			"updated_at":       now,
			"visit_started_at": now,
		},
	}
	if err := s.apptRepo.Collection().FindOneAndUpdate(ctx, filter, update).Err(); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			// Distinguish "does not exist" from "wrong status".
			if _, lookupErr := s.apptRepo.FindByID(ctx, oid); errors.Is(lookupErr, database.ErrNotFound) {
				return ErrAppointmentNotFound
			}
			return ErrNotCheckable
		}
		logger.Get().Error("startVisit: update failed", "id", appointmentID, "error", err)
		return err
	}

	logger.Get().Info("visit started", "id", appointmentID)
	return nil
}

// CompleteVisit transitions an appointment from IN_PROGRESS to COMPLETED. The
// transition is a single conditional update. If the appointment exists but is
// not in the IN_PROGRESS state, ErrNotCheckable is returned.
func (s *Service) CompleteVisit(ctx context.Context, appointmentID string) error {
	oid, err := primitive.ObjectIDFromHex(appointmentID)
	if err != nil {
		return ErrInvalidObjectID
	}

	now := time.Now().UTC()
	filter := bson.M{
		"_id":    oid,
		"status": StatusInProgress,
	}
	update := bson.M{
		"$set": bson.M{
			"status":     StatusCompleted,
			"updated_at": now,
		},
		// Clear the visit-start timestamp so completed visits no longer show
		// a live timer in the portal.
		"$unset": bson.M{"visit_started_at": ""},
	}
	if err := s.apptRepo.Collection().FindOneAndUpdate(ctx, filter, update).Err(); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			if _, lookupErr := s.apptRepo.FindByID(ctx, oid); errors.Is(lookupErr, database.ErrNotFound) {
				return ErrAppointmentNotFound
			}
			return ErrNotCheckable
		}
		logger.Get().Error("completeVisit: update failed", "id", appointmentID, "error", err)
		return err
	}

	logger.Get().Info("visit completed", "id", appointmentID)

	// Credit the doctor once the clinical visit is done. Settlement failures
	// are logged but do not roll back COMPLETED — reception can still settle.
	if s.visitSettler != nil {
		if serr := s.visitSettler.SettleAppointment(ctx, appointmentID); serr != nil {
			logger.Get().Warn("completeVisit: auto-settle failed", "id", appointmentID, "error", serr)
		}
	}

	return nil
}

// MarkNoShow transitions an appointment from PENDING, CONFIRMED, CHECKED_IN
// or CALLED to NO_SHOW. After a successful transition it triggers the
// waiting-list engine for that doctor/date so a freed slot can be offered.
func (s *Service) MarkNoShow(ctx context.Context, appointmentID string) error {
	oid, err := primitive.ObjectIDFromHex(appointmentID)
	if err != nil {
		return ErrInvalidObjectID
	}

	now := time.Now().UTC()
	filter := bson.M{
		"_id": oid,
		"status": bson.M{"$in": bson.A{
			StatusPending, StatusConfirmed, StatusCheckedIn, StatusCalled,
		}},
	}
	update := bson.M{
		"$set": bson.M{
			"status":     StatusNoShow,
			"updated_at": now,
		},
	}
	if err := s.apptRepo.Collection().FindOneAndUpdate(ctx, filter, update).Err(); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			if _, lookupErr := s.apptRepo.FindByID(ctx, oid); errors.Is(lookupErr, database.ErrNotFound) {
				return ErrAppointmentNotFound
			}
			return ErrNotCheckable
		}
		logger.Get().Error("markNoShow: update failed", "id", appointmentID, "error", err)
		return err
	}

	logger.Get().Info("appointment marked no-show", "id", appointmentID)

	// Re-read to obtain the doctor/date context for the waiting-list engine.
	appt, err := s.apptRepo.FindByID(ctx, oid)
	if err != nil {
		logger.Get().Error("markNoShow: re-read failed", "id", appointmentID, "error", err)
		return nil
	}
	s.processWaitingListBestEffort(ctx, appt.DoctorID, appt.Date)

	return nil
}

// ---------------------------------------------------------------------------
// Waiting list: reception operations
// ---------------------------------------------------------------------------

// OfferSlotToWaitingEntry books a CONFIRMED appointment for a waiting-list
// entry at an explicitly chosen slot (start/end), then marks the entry as
// notified/converted. It reuses the standard booking eligibility rules (leave,
// shift containment, no overlap) by delegating to BookAppointment.
func (s *Service) OfferSlotToWaitingEntry(ctx context.Context, entryID string, startTime, endTime time.Time) (*AppointmentResponse, error) {
	oid, err := primitive.ObjectIDFromHex(entryID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	entry, err := s.waitRepo.FindByID(ctx, oid)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrWaitingEntryNotFound
		}
		logger.Get().Error("offerSlotToWaitingEntry: lookup failed", "id", entryID, "error", err)
		return nil, err
	}

	// Book the appointment for the waiting patient using the offered slot. For
	// walk-in/phone entries without a patient account we cannot create a real
	// appointment; surface a bad-request so the caller can resolve a patient.
	if entry.PatientID == primitive.NilObjectID {
		return nil, ErrInvalidObjectID
	}

	bookReq := BookAppointmentRequest{
		DoctorID:    entry.DoctorID.Hex(),
		PatientID:   entry.PatientID.Hex(),
		StartTime:   startTime,
		EndTime:     endTime,
		PaymentType: PaymentTypeInPerson,
	}
	resp, err := s.BookAppointment(ctx, bookReq)
	if err != nil {
		return nil, err
	}

	// Mark the entry as converted/notified so it is not offered/promoted twice.
	now := time.Now().UTC()
	if err := s.waitRepo.Update(ctx, entry.ID, bson.M{"$set": bson.M{"notified_at": now}}); err != nil {
		logger.Get().Error("offerSlotToWaitingEntry: mark converted failed", "id", entryID, "error", err)
	}

	logger.Get().Info("slot offered to waiting entry",
		"entry_id", entryID, "appointment_id", resp.ID.Hex())

	return resp, nil
}

// UpdateWaitingPriority sets the triage priority of a waiting-list entry.
// priority must be "NORMAL" or "URGENT".
func (s *Service) UpdateWaitingPriority(ctx context.Context, entryID string, priority string) error {
	oid, err := primitive.ObjectIDFromHex(entryID)
	if err != nil {
		return ErrInvalidObjectID
	}

	p, err := parsePriority(priority)
	if err != nil {
		return err
	}

	if _, err := s.waitRepo.FindByID(ctx, oid); err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return ErrWaitingEntryNotFound
		}
		logger.Get().Error("updateWaitingPriority: lookup failed", "id", entryID, "error", err)
		return err
	}

	if err := s.waitRepo.Update(ctx, oid, bson.M{"$set": bson.M{"priority": p}}); err != nil {
		logger.Get().Error("updateWaitingPriority: update failed", "id", entryID, "error", err)
		return err
	}

	logger.Get().Info("waiting list priority updated", "id", entryID, "priority", p)
	return nil
}

// GetWaitingListSorted returns the waiting-list entries for the given doctor on
// the given date, sorted URGENT-first then FIFO by CreatedAt. Already-notified
// (converted) entries are included so reception can see the full picture; the
// NotifiedAt field lets callers filter them out at the presentation layer.
func (s *Service) GetWaitingListSorted(ctx context.Context, doctorID primitive.ObjectID, date time.Time) ([]WaitingList, error) {
	day := midnight(date)
	filter := bson.M{
		"doctor_id": doctorID,
		"date":      day,
	}

	entries, err := s.waitRepo.FindAll(ctx, filter)
	if err != nil {
		logger.Get().Error("getWaitingListSorted: query failed", "error", err)
		return nil, err
	}

	result := make([]WaitingList, 0, len(entries))
	for _, e := range entries {
		result = append(result, *e)
	}

	// URGENT first, then FIFO by CreatedAt. Stable sort keeps insertion order
	// within equal-priority buckets.
	sortWaitingList(result)
	return result, nil
}

// sortWaitingList orders entries URGENT-first, then by CreatedAt ascending
// (FIFO). It is a stable selection so equal-priority entries keep their
// enqueue order.
func sortWaitingList(entries []WaitingList) {
	// Simple stable insertion sort: small N (a single day's waiting list) keeps
	// this allocation-free and deterministic.
	for i := 1; i < len(entries); i++ {
		for j := i; j > 0 && waitingLess(entries[j], entries[j-1]); j-- {
			entries[j], entries[j-1] = entries[j-1], entries[j]
		}
	}
}

// waitingLess reports whether a should sort before b: URGENT precedes NORMAL,
// and within the same priority the earlier CreatedAt wins.
func waitingLess(a, b WaitingList) bool {
	aUrgent := a.Priority == PriorityUrgent
	bUrgent := b.Priority == PriorityUrgent
	if aUrgent != bUrgent {
		return aUrgent
	}
	return a.CreatedAt.Before(b.CreatedAt)
}

// ---------------------------------------------------------------------------
// Calendar / timeline
// ---------------------------------------------------------------------------

// GetMonthlyAppointments returns a per-day status breakdown of all
// appointments for a doctor in the given calendar month (1-12). Each calendar
// day with at least one appointment yields one MonthlyAppointmentSummary.
func (s *Service) GetMonthlyAppointments(ctx context.Context, doctorID string, year, month int) ([]MonthlyAppointmentSummary, error) {
	doctorOID, err := primitive.ObjectIDFromHex(doctorID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}
	if month < 1 || month > 12 || year < 1 {
		return nil, ErrInvalidObjectID
	}

	// Compute the month window [firstOfMonth, firstOfNextMonth) in UTC.
	startOfMonth := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	endOfMonth := startOfMonth.AddDate(0, 1, 0)

	return s.GetAppointmentsSummaryByRange(ctx, doctorOID, startOfMonth, endOfMonth)
}

// GetAppointmentsSummaryByRange aggregates the per-day appointment status
// breakdown for a single doctor over the half-open window [from, to).
//
// Unlike GetMonthlyAppointments (which assumes a Gregorian month), this variant
// works with an arbitrary date range, which is required by the receptionist
// Jalali calendar: a Jalali month spans two Gregorian months, so the client
// supplies the exact range computed from the displayed Jalali grid.
func (s *Service) GetAppointmentsSummaryByRange(ctx context.Context, doctorOID primitive.ObjectID, from, to time.Time) ([]MonthlyAppointmentSummary, error) {
	filter := bson.M{
		"doctor_id":  doctorOID,
		"start_time": bson.M{"$gte": from, "$lt": to},
	}

	appts, err := s.apptRepo.FindAll(ctx, filter)
	if err != nil {
		logger.Get().Error("getAppointmentsSummaryByRange: query failed", "error", err)
		return nil, err
	}

	byDay := map[string]*MonthlyAppointmentSummary{}
	for _, a := range appts {
		// Normalize to the UTC calendar day the appointment belongs to so the
		// frontend can key summaries by the Gregorian "YYYY-MM-DD" it renders.
		dayUTC := a.StartTime.In(time.UTC)
		dayKey := dayUTC.Format("2006-01-02")
		summary, ok := byDay[dayKey]
		if !ok {
			summary = &MonthlyAppointmentSummary{
				Date: time.Date(dayUTC.Year(), dayUTC.Month(), dayUTC.Day(), 0, 0, 0, 0, time.UTC),
			}
			byDay[dayKey] = summary
		}
		summary.Total++
		switch a.Status {
		case StatusPending:
			summary.Pending++
		case StatusConfirmed:
			summary.Confirmed++
		case StatusCheckedIn:
			summary.CheckedIn++
		case StatusCalled:
			summary.Called++
		case StatusInProgress:
			summary.InProgress++
		case StatusCompleted:
			summary.Completed++
		case StatusCancelled:
			summary.Cancelled++
		case StatusNoShow:
			summary.NoShow++
		}
	}

	results := make([]MonthlyAppointmentSummary, 0, len(byDay))
	for _, summary := range byDay {
		results = append(results, *summary)
	}
	// Sort by day for a stable, frontend-friendly ordering.
	for i := 1; i < len(results); i++ {
		for j := i; j > 0 && results[j].Date.Before(results[j-1].Date); j-- {
			results[j], results[j-1] = results[j-1], results[j]
		}
	}
	return results, nil
}

// GetDailyTimeline returns the doctor's shifts and appointments for a single
// day, combined into a DailyTimelineResponse for the reception/doctor UI.
func (s *Service) GetDailyTimeline(ctx context.Context, doctorID string, date time.Time) (*DailyTimelineResponse, error) {
	doctorOID, err := primitive.ObjectIDFromHex(doctorID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}
	// Normalize the requested day to UTC midnight so it matches the YYYY-MM-DD
	// keys the reception calendar sends (and calendarDateUTC on write).
	day := calendarDateUTC(date)

	shifts, err := s.schedule.GetShiftsByDoctorAndDate(ctx, doctorOID, day)
	if err != nil {
		logger.Get().Error("getDailyTimeline: shift lookup failed", "doctor_id", doctorID, "error", err)
		return nil, err
	}

	shiftInfos := make([]ShiftInfo, 0, len(shifts))
	for _, sh := range shifts {
		shiftInfos = append(shiftInfos, ShiftInfo{
			ID:          sh.ID,
			DoctorID:    sh.DoctorID,
			BranchID:    sh.BranchID,
			Date:        sh.Date,
			StartTime:   sh.StartTime,
			EndTime:     sh.EndTime,
			MaxPatients: sh.MaxPatients,
			IsActive:    sh.IsActive,
		})
	}

	// Query by start_time (±1 day) then keep the UTC calendar day — same pattern
	// as /doctors/me/schedule. Exact equality on "date" misses patient bookings
	// whose Date was stored as Tehran midnight (+03:30 → previous UTC evening).
	dayStartUTC := day
	appts, err := s.apptRepo.FindAll(ctx, bson.M{
		"doctor_id": doctorOID,
		"start_time": bson.M{
			"$gte": dayStartUTC.Add(-24 * time.Hour),
			"$lt":  dayStartUTC.Add(48 * time.Hour),
		},
	})
	if err != nil {
		logger.Get().Error("getDailyTimeline: appointment lookup failed", "error", err)
		return nil, err
	}

	appointments := make([]AppointmentResponse, 0, len(appts))
	for _, a := range appts {
		if !sameUTCCalendarDay(a.StartTime, day) {
			continue
		}
		appointments = append(appointments, *a.ToResponse())
	}

	// Best-effort live enrichment: refresh name/phone from the users collection
	// when possible. Appointments already carry denormalized fields from book
	// time — keep those if the live lookup fails (orphan / deleted account).
	if s.patientResolver != nil {
		for i := range appointments {
			firstName, lastName, phone, err := s.patientResolver.ResolvePatient(ctx, appointments[i].PatientID)
			if err != nil {
				if appointments[i].PatientName == "" && appointments[i].PatientPhone == "" {
					logger.Get().Warn("getDailyTimeline: patient resolution failed; no denormalized fallback",
						"patient_id", appointments[i].PatientID.Hex(), "error", err)
				}
				continue
			}
			name := strings.TrimSpace(firstName + " " + lastName)
			if name != "" {
				appointments[i].PatientName = name
			}
			if phone = strings.TrimSpace(phone); phone != "" {
				appointments[i].PatientPhone = phone
			}
		}
	}

	return &DailyTimelineResponse{
		DoctorID:     doctorOID,
		Date:         day,
		Shifts:       shiftInfos,
		Appointments: appointments,
	}, nil
}

// ---------------------------------------------------------------------------
// Enum parsing helpers
// ---------------------------------------------------------------------------

// parsePriority parses a priority string into a typed Priority, returning
// ErrInvalidPriority for anything other than "NORMAL"/"URGENT" (case-insensitive).
func parsePriority(s string) (Priority, error) {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case string(PriorityNormal):
		return PriorityNormal, nil
	case string(PriorityUrgent):
		return PriorityUrgent, nil
	default:
		return "", ErrInvalidPriority
	}
}

// parseEntryType parses an entry-type string into a typed EntryType, returning
// ErrInvalidObjectID (a generic bad-input error) for an unknown value.
func parseEntryType(s string) (EntryType, error) {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case string(EntryOnline):
		return EntryOnline, nil
	case string(EntryWalkin):
		return EntryWalkin, nil
	case string(EntryPhone):
		return EntryPhone, nil
	default:
		return "", ErrInvalidObjectID
	}
}
