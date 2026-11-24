// Package booking implements the booking domain of the clinic application.
//
// It owns the Appointment and WaitingList entities, the request/response DTOs
// used by the HTTP layer, and the business rules that govern smart booking,
// cancellations, reschedules and the waiting-list engine. Business logic lives
// in service.go and the HTTP handlers in handler.go.
//
// Per the project's Clean Architecture rules this package lives in
// `internal/` and may import from `pkg/` (and from sibling `internal/`
// domains such as schedule), while `pkg/` packages MUST NEVER import anything
// from `internal/`.
package booking

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// ---------------------------------------------------------------------------
// Status enum
// ---------------------------------------------------------------------------

// Status is the lifecycle state of an appointment. It is a typed string so the
// compiler catches typos while still serializing cleanly to/from JSON and BSON
// as plain strings.
type Status string

const (
	// StatusPending means the appointment was requested and is awaiting
	// receptionist confirmation before it becomes final.
	StatusPending = Status("PENDING")
	// StatusConfirmed means the receptionist confirmed the booking; the slot
	// is locked and the patient has been notified.
	StatusConfirmed = Status("CONFIRMED")
	// StatusCancelled means the appointment was cancelled and the slot freed.
	StatusCancelled = Status("CANCELLED")
	// StatusCompleted means the visit took place and the appointment is closed.
	StatusCompleted = Status("COMPLETED")
	// StatusNoShow means the patient did not show up for the appointment.
	StatusNoShow = Status("NO_SHOW")
	// StatusCheckedIn means the patient has arrived and is in the waiting hall.
	StatusCheckedIn = Status("CHECKED_IN")
	// StatusCalled means reception has called the patient (their turn); they
	// are being admitted / entering the room. StartVisit follows this state.
	StatusCalled = Status("CALLED")
	// StatusInProgress means the visit has started (the doctor is now seeing
	// the patient). It sits between CALLED and COMPLETED.
	StatusInProgress = Status("IN_PROGRESS")
)

// Priority for waiting-list entries. URGENT entries are surfaced before NORMAL
// ones regardless of enqueue order.
type Priority string

const (
	// PriorityNormal is the default waiting-list priority.
	PriorityNormal = Priority("NORMAL")
	// PriorityUrgent is an elevated waiting-list priority (promoted first).
	PriorityUrgent = Priority("URGENT")
)

// EntryType describes how a waiting-list registration reached the clinic.
type EntryType string

const (
	// EntryOnline is a registration that came through the patient app.
	EntryOnline = EntryType("ONLINE")
	// EntryWalkin is a registration made in person at reception.
	EntryWalkin = EntryType("WALKIN")
	// EntryPhone is a registration made over the phone.
	EntryPhone = EntryType("PHONE")
)

// PaymentStatus tracks the financial state of an appointment. It is a typed
// string for the same reasons as Status.
type PaymentStatus string

const (
	// PaymentUnpaid means no payment has been recorded yet.
	PaymentUnpaid = PaymentStatus("UNPAID")
	// PaymentPaid means the appointment fee has been settled.
	PaymentPaid = PaymentStatus("PAID")
	// PaymentRefunded means a cancellation refund was applied to the wallet.
	PaymentRefunded = PaymentStatus("REFUNDED")
)

// PaymentType records how the patient paid (or is expected to pay) for the
// visit. It is distinct from PaymentStatus, which tracks whether money has
// actually changed hands.
type PaymentType string

const (
	// PaymentTypeOnline means the fee was (or will be) collected via the patient
	// app / digital wallet.
	PaymentTypeOnline = PaymentType("ONLINE")
	// PaymentTypeInPerson means the fee is collected at the clinic, typically
	// when reception books a walk-in or phone registration.
	PaymentTypeInPerson = PaymentType("IN_PERSON")
)

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

// Appointment is the persisted representation of a patient's booking with a
// doctor. It maps 1:1 to a document in the "appointments" MongoDB collection.
//
// The (DoctorID, StartTime, EndTime) range is the slot the appointment
// occupies; concurrent booking attempts are prevented from double-booking the
// same slot by the concurrency strategy documented in service.go.
type Appointment struct {
	// ID is the MongoDB primary key.
	ID primitive.ObjectID `bson:"_id" json:"id"`
	// PatientID references the user account (role PATIENT) the appointment
	// belongs to.
	PatientID primitive.ObjectID `bson:"patient_id" json:"patient_id"`
	// DoctorID references the user account (role DOCTOR) the appointment is
	// with.
	DoctorID primitive.ObjectID `bson:"doctor_id" json:"doctor_id"`
	// BranchID references the clinic branch where the visit will happen.
	// Deprecated: branches have been removed project-wide. The field is retained
	// only so legacy BSON documents keep decoding; it is always a zero ObjectID
	// for newly created appointments.
	BranchID primitive.ObjectID `bson:"branch_id,omitempty" json:"branch_id,omitempty"`
	// Date is the calendar day the appointment belongs to (normalized to the
	// day, used together with DoctorID to scope waiting-list lookups).
	Date time.Time `bson:"date" json:"date"`
	// StartTime is the inclusive beginning of the appointment slot.
	StartTime time.Time `bson:"start_time" json:"start_time"`
	// EndTime is the exclusive end of the appointment slot.
	EndTime time.Time `bson:"end_time" json:"end_time"`
	// Status is the current lifecycle state of the appointment.
	Status Status `bson:"status" json:"status"`
	// PaymentStatus is the current financial state of the appointment.
	PaymentStatus PaymentStatus `bson:"payment_status" json:"payment_status"`
	// PaymentType records the payment channel (online wallet vs in-clinic).
	// Empty on legacy documents and on online bookings until PayVisitFee runs.
	PaymentType PaymentType `bson:"payment_type,omitempty" json:"payment_type,omitempty"`
	// PatientName is denormalized at booking time so reception/doctor UIs can
	// show the patient even if a later user lookup fails (deleted account,
	// stale id, etc.). Empty on legacy documents.
	PatientName string `bson:"patient_name,omitempty" json:"patient_name,omitempty"`
	// PatientPhone is denormalized alongside PatientName at booking time.
	PatientPhone string `bson:"patient_phone,omitempty" json:"patient_phone,omitempty"`
	// CreatedAt is the timestamp the appointment record was first persisted.
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	// UpdatedAt is the timestamp of the most recent modification.
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
	// VisitStartedAt records when the doctor began the visit (transition to
	// IN_PROGRESS). It is a pointer so it is nil until StartVisit is called.
	VisitStartedAt *time.Time `bson:"visit_started_at,omitempty" json:"visit_started_at,omitempty"`
}

// ToResponse converts the Appointment entity into an AppointmentResponse DTO,
// stripping out the auditing timestamps before it crosses the service boundary
// towards the HTTP layer. It returns nil for a nil receiver so callers can
// chain safely.
func (a *Appointment) ToResponse() *AppointmentResponse {
	if a == nil {
		return nil
	}
	return &AppointmentResponse{
		ID:            a.ID,
		PatientID:     a.PatientID,
		DoctorID:      a.DoctorID,
		BranchID:      a.BranchID,
		Date:          a.Date,
		StartTime:     a.StartTime,
		EndTime:       a.EndTime,
		Status:        a.Status,
		PaymentStatus: a.PaymentStatus,
		PaymentType:   a.PaymentType,
		PatientName:   a.PatientName,
		PatientPhone:  a.PatientPhone,
	}
}

// WaitingList is the persisted representation of a patient who requested a slot
// for a doctor on a date when the schedule was full. It maps 1:1 to a document
// in the "waiting_list" MongoDB collection.
//
// FIFO ordering across the waiting list is achieved by sorting on CreatedAt and
// materializing that order at query time via an ascending index on
// (doctor_id, date, created_at).
type WaitingList struct {
	// ID is the MongoDB primary key.
	ID primitive.ObjectID `bson:"_id" json:"id"`
	// PatientID references the user account (role PATIENT) waiting.
	PatientID primitive.ObjectID `bson:"patient_id" json:"patient_id"`
	// DoctorID references the user account (role DOCTOR) the patient is
	// waiting for.
	DoctorID primitive.ObjectID `bson:"doctor_id" json:"doctor_id"`
	// Date is the calendar day the patient is interested in.
	Date time.Time `bson:"date" json:"date"`
	// CreatedAt is the enqueue timestamp; used to order the queue FIFO.
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	// NotifiedAt is set when the patient was auto-promoted to a confirmed
	// appointment after a cancellation. A zero value means the patient is still
	// waiting.
	NotifiedAt time.Time `bson:"notified_at" json:"notified_at"`
	// Priority is the triage priority of the entry. Valid values are "NORMAL"
	// (default) and "URGENT" (promoted first when offering slots).
	Priority Priority `bson:"priority" json:"priority"`
	// Phone is the contact phone number, mainly used for walk-in/phone quick
	// registrations where no patient account exists yet. Optional.
	Phone string `bson:"phone" json:"phone"`
	// PatientName is the display name of the patient, mainly used for walk-in/
	// phone quick registrations. Optional.
	PatientName string `bson:"patient_name" json:"patient_name"`
	// EntryType records how the registration reached the clinic. Valid values
	// are "ONLINE" (default), "WALKIN" and "PHONE".
	EntryType EntryType `bson:"entry_type" json:"entry_type"`
}

// ToResponse converts the WaitingList entity into a WaitingListResponse DTO.
// It returns nil for a nil receiver so callers can chain safely.
func (w *WaitingList) ToResponse() *WaitingListResponse {
	if w == nil {
		return nil
	}
	return &WaitingListResponse{
		ID:          w.ID,
		PatientID:   w.PatientID,
		DoctorID:    w.DoctorID,
		Date:        w.Date,
		CreatedAt:   w.CreatedAt,
		NotifiedAt:  w.NotifiedAt,
		Priority:    w.Priority,
		Phone:       w.Phone,
		PatientName: w.PatientName,
		EntryType:   w.EntryType,
	}
}

// ---------------------------------------------------------------------------
// Request / Response DTOs
// ---------------------------------------------------------------------------

// BookAppointmentRequest is the payload accepted by POST /book. The doctor and
// patient ids are hex strings in the DTO and are parsed into ObjectIDs in the
// service. The branch concept has been removed project-wide, so appointments
// are no longer branch-scoped.
type BookAppointmentRequest struct {
	// DoctorID is the hex id of the associated doctor user (required).
	DoctorID string `json:"doctor_id" validate:"required"`
	// PatientID is the hex id of the patient user (required). In an authenticated
	// flow the service may override this with the caller's identity; the field
	// exists so receptionists/admins can book on behalf of a patient.
	PatientID string `json:"patient_id" validate:"required"`
	// StartTime is the inclusive beginning of the requested slot (required).
	StartTime time.Time `json:"start_time" validate:"required"`
	// EndTime is the exclusive end of the requested slot (required).
	EndTime time.Time `json:"end_time" validate:"required"`
	// PaymentType is set server-side from the caller's role / booking channel;
	// it is never accepted from client JSON (json:"-").
	PaymentType PaymentType `json:"-"`
}

// CancelAppointmentRequest is the payload accepted by POST /cancel. It targets
// an appointment by id and carries an optional reason for auditability.
type CancelAppointmentRequest struct {
	// ID is the hex id of the appointment to cancel (required).
	ID string `json:"id" validate:"required"`
	// Reason is an optional free-text cancellation reason.
	Reason string `json:"reason"`
}

// CheckInRequest is the payload accepted by POST /check-in. It targets an
// appointment by id so reception can mark the patient as arrived.
type CheckInRequest struct {
	// ID is the hex id of the appointment to check in (required).
	ID string `json:"id" validate:"required"`
}

// RescheduleAppointmentRequest is the payload accepted by POST /reschedule. It
// targets an appointment by id and supplies the new slot to move it into,
// subject to the same availability/overlap checks as a fresh booking.
type RescheduleAppointmentRequest struct {
	// ID is the hex id of the appointment to reschedule (required).
	ID string `json:"id" validate:"required"`
	// StartTime is the new inclusive beginning of the slot (required).
	StartTime time.Time `json:"start_time" validate:"required"`
	// EndTime is the new exclusive end of the slot (required).
	EndTime time.Time `json:"end_time" validate:"required"`
}

// JoinWaitingListRequest is the payload accepted by POST /waiting-list. It adds
// the patient to the waiting list for the given doctor/date.
type JoinWaitingListRequest struct {
	// DoctorID is the hex id of the associated doctor user (required).
	DoctorID string `json:"doctor_id" validate:"required"`
	// PatientID is the hex id of the patient user (required for ONLINE entries;
	// for WALKIN/PHONE quick registrations an empty/invalid value is allowed).
	PatientID string `json:"patient_id"`
	// Date is the calendar day the patient is interested in (required).
	Date time.Time `json:"date" validate:"required"`
	// Priority is the optional triage priority ("NORMAL" or "URGENT"). Defaults
	// to "NORMAL" when empty.
	Priority string `json:"priority"`
	// Phone is an optional contact phone, mainly for walk-in/phone quick
	// registrations.
	Phone string `json:"phone"`
	// PatientName is an optional display name, mainly for walk-in/phone quick
	// registrations.
	PatientName string `json:"patient_name"`
	// EntryType records how the registration reached the clinic ("ONLINE",
	// "WALKIN" or "PHONE"). Defaults to "ONLINE" when empty.
	EntryType string `json:"entry_type"`
}

// UpdateWaitingPriorityRequest is the payload accepted by PATCH
// /waiting-list/:id/priority. It sets the triage priority of an entry.
type UpdateWaitingPriorityRequest struct {
	// ID is the hex id of the waiting-list entry (required).
	ID string `json:"id" validate:"required"`
	// Priority is the new priority ("NORMAL" or "URGENT") (required).
	Priority string `json:"priority" validate:"required"`
}

// OfferSlotRequest is the payload accepted by POST /waiting-list/:id/offer. It
// books an appointment for a waiting-list entry at an explicitly chosen slot.
type OfferSlotRequest struct {
	// EntryID is the hex id of the waiting-list entry to convert (required).
	EntryID string `json:"entry_id" validate:"required"`
	// StartTime is the inclusive beginning of the offered slot (required).
	StartTime time.Time `json:"start_time" validate:"required"`
	// EndTime is the exclusive end of the offered slot (required).
	EndTime time.Time `json:"end_time" validate:"required"`
}

// AppointmentResponse is the sanitized view of an Appointment returned by
// booking endpoints. It omits the auditing timestamps.
type AppointmentResponse struct {
	ID            primitive.ObjectID `json:"id"`
	PatientID     primitive.ObjectID `json:"patient_id"`
	DoctorID      primitive.ObjectID `json:"doctor_id"`
	BranchID      primitive.ObjectID `json:"branch_id"`
	Date          time.Time          `json:"date"`
	StartTime     time.Time          `json:"start_time"`
	EndTime       time.Time          `json:"end_time"`
	Status        Status             `json:"status"`
	PaymentStatus PaymentStatus      `json:"payment_status"`
	PaymentType   PaymentType        `json:"payment_type,omitempty"`
	// PatientName is the patient's display name, denormalized onto the
	// response when a PatientInfoResolver is wired into the booking service
	// (e.g. for the reception timeline). Empty unless enriched.
	PatientName string `json:"patient_name,omitempty"`
	// PatientPhone is the patient's contact phone, denormalized alongside
	// PatientName. Empty unless enriched.
	PatientPhone string `json:"patient_phone,omitempty"`
}

// WaitingListResponse is the sanitized view of a WaitingList entry returned by
// the waiting-list endpoints.
type WaitingListResponse struct {
	ID          primitive.ObjectID `json:"id"`
	PatientID   primitive.ObjectID `json:"patient_id"`
	DoctorID    primitive.ObjectID `json:"doctor_id"`
	Date        time.Time          `json:"date"`
	CreatedAt   time.Time          `json:"created_at"`
	NotifiedAt  time.Time          `json:"notified_at"`
	Priority    Priority           `json:"priority"`
	Phone       string             `json:"phone"`
	PatientName string             `json:"patient_name"`
	EntryType   EntryType          `json:"entry_type"`
}

// MonthlyAppointmentSummary is the per-day aggregate returned by the monthly
// calendar endpoint. Each entry summarizes the status breakdown of all
// appointments for a single doctor on a single calendar day.
type MonthlyAppointmentSummary struct {
	// Date is the calendar day this summary covers (normalized to midnight).
	Date time.Time `json:"date"`
	// Total is the number of appointments on that day.
	Total int `json:"total"`
	// Pending is the count of appointments in PENDING status.
	Pending int `json:"pending"`
	// Confirmed is the count of appointments in CONFIRMED status.
	Confirmed int `json:"confirmed"`
	// CheckedIn is the count of appointments in CHECKED_IN status.
	CheckedIn int `json:"checked_in"`
	// Called is the count of appointments in CALLED status.
	Called int `json:"called"`
	// InProgress is the count of appointments in IN_PROGRESS status.
	InProgress int `json:"in_progress"`
	// Completed is the count of appointments in COMPLETED status.
	Completed int `json:"completed"`
	// Cancelled is the count of appointments in CANCELLED status.
	Cancelled int `json:"cancelled"`
	// NoShow is the count of appointments in NO_SHOW status.
	NoShow int `json:"no_show"`
}

// ShiftInfo is the sanitized view of a doctor's shift used in the daily
// timeline. It mirrors schedule.ShiftResponse but is declared here so the
// booking package stays self-contained for the timeline response.
type ShiftInfo struct {
	ID          primitive.ObjectID `json:"id"`
	DoctorID    primitive.ObjectID `json:"doctor_id"`
	BranchID    primitive.ObjectID `json:"branch_id"`
	Date        time.Time          `json:"date"`
	StartTime   time.Time          `json:"start_time"`
	EndTime     time.Time          `json:"end_time"`
	MaxPatients int                `json:"max_patients"`
	IsActive    bool               `json:"is_active"`
}

// DailyTimelineResponse is the payload returned by the daily timeline endpoint.
// It combines the doctor's shifts for the day with the list of their
// appointments so the reception/doctor UI can render a positional schedule.
type DailyTimelineResponse struct {
	// DoctorID is the user id of the doctor this timeline belongs to.
	DoctorID primitive.ObjectID `json:"doctor_id"`
	// Date is the calendar day this timeline covers.
	Date time.Time `json:"date"`
	// Shifts lists the doctor's shifts for that day.
	Shifts []ShiftInfo `json:"shifts"`
	// Appointments lists the doctor's appointments for that day.
	Appointments []AppointmentResponse `json:"appointments"`
}
