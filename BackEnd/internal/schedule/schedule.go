// Package schedule implements the schedule domain of the clinic application.
//
// It owns the Shift and Leave entities, the request/response DTOs used by the
// HTTP layer, and the business rules that govern a doctor's availability. Shift
// business logic lives in service.go and the HTTP handlers in handler.go.
//
// Per the project's Clean Architecture rules this package lives in `internal/`
// and may import from `pkg/`, while `pkg/` packages MUST NEVER import anything
// from `internal/`.
package schedule

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Shift is the persisted representation of a single doctor working slot on a
// given calendar day. It maps 1:1 to a document in the "shifts" MongoDB
// collection.
//
// NOTE: BranchID is retained for backward compatibility with historical
// documents and with other domains (e.g. booking) that may still read it, but
// it is no longer required or set when creating new shifts.
type Shift struct {
	// ID is the MongoDB primary key.
	ID primitive.ObjectID `bson:"_id" json:"id"`
	// DoctorID references the user account (role DOCTOR) this shift belongs to.
	DoctorID primitive.ObjectID `bson:"doctor_id" json:"doctor_id"`
	// BranchID references the clinic branch where the shift takes place.
	// Deprecated: shifts are no longer branch-scoped. Kept only so legacy
	// documents and consumers that still read it keep compiling.
	BranchID primitive.ObjectID `bson:"branch_id,omitempty" json:"branch_id,omitempty"`
	// Date is the calendar day this shift belongs to (normalized to the day).
	Date time.Time `bson:"date" json:"date"`
	// StartTime is the inclusive beginning of the shift.
	StartTime time.Time `bson:"start_time" json:"start_time"`
	// EndTime is the exclusive end of the shift.
	EndTime time.Time `bson:"end_time" json:"end_time"`
	// MaxPatients is the maximum number of patients that can be booked into it.
	MaxPatients int `bson:"max_patients" json:"max_patients"`
	// IsActive indicates whether the shift is currently bookable. A shift can
	// be deactivated without being deleted.
	IsActive bool `bson:"is_active" json:"is_active"`
	// CreatedAt is the timestamp the shift record was first persisted.
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	// UpdatedAt is the timestamp of the most recent modification.
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

// ToResponse converts the Shift entity into a ShiftResponse DTO, stripping out
// the auditing timestamps before it crosses the service boundary towards the
// HTTP layer. It returns nil for a nil receiver so callers can chain safely.
func (s *Shift) ToResponse() *ShiftResponse {
	if s == nil {
		return nil
	}
	return &ShiftResponse{
		ID:          s.ID,
		DoctorID:    s.DoctorID,
		BranchID:    s.BranchID,
		Date:        s.Date,
		StartTime:   s.StartTime,
		EndTime:     s.EndTime,
		MaxPatients: s.MaxPatients,
		IsActive:    s.IsActive,
	}
}

// Leave is the persisted representation of a doctor's day off. It acts as a
// scheduling exception: any shift that falls on a Leave's date is rejected by
// the service. It maps 1:1 to a document in the "leaves" MongoDB collection.
type Leave struct {
	// ID is the MongoDB primary key.
	ID primitive.ObjectID `bson:"_id" json:"id"`
	// DoctorID references the user account (role DOCTOR) the leave belongs to.
	DoctorID primitive.ObjectID `bson:"doctor_id" json:"doctor_id"`
	// Date is the calendar day the doctor is off (normalized to midnight).
	Date time.Time `bson:"date" json:"date"`
	// Reason is the free-text justification for the leave.
	Reason string `bson:"reason" json:"reason"`
	// CreatedAt is the timestamp the leave record was first persisted.
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	// UpdatedAt is the timestamp of the most recent modification.
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

// ToResponse converts the Leave entity into a LeaveResponse DTO, stripping out
// the auditing timestamps. It returns nil for a nil receiver so callers can
// chain safely.
func (l *Leave) ToResponse() *LeaveResponse {
	if l == nil {
		return nil
	}
	return &LeaveResponse{
		ID:       l.ID,
		DoctorID: l.DoctorID,
		Date:     l.Date,
		Reason:   l.Reason,
	}
}

// ---------------------------------------------------------------------------
// Request / Response DTOs
// ---------------------------------------------------------------------------

// CreateShiftRequest is the payload accepted by POST /shifts. DoctorID is a hex
// string in the DTO and is parsed into an ObjectID in the service. The validate
// tag is interpreted by go-playground/validator (registered as the Echo
// validator during bootstrap) and enforces that the reference is present; the
// time ordering (start before end) and max-patient positivity are validated in
// the service so the error semantics stay consistent with the domain.
//
// Shifts are no longer branch-scoped, so no BranchID is accepted here.
type CreateShiftRequest struct {
	// DoctorID is the hex id of the associated doctor user (required).
	DoctorID string `json:"doctor_id" validate:"required"`
	// Date is the calendar day this shift belongs to.
	Date time.Time `json:"date"`
	// StartTime is the inclusive beginning of the shift.
	StartTime time.Time `json:"start_time"`
	// EndTime is the exclusive end of the shift.
	EndTime time.Time `json:"end_time"`
	// MaxPatients is the booking capacity of the shift.
	MaxPatients int `json:"max_patients"`
}

// CreateRecurringShiftRequest is the payload accepted by POST /shifts/recurring.
// It expands into one CreateShiftRequest-style shift per day in [FromDate,
// ToDate] whose weekday appears in Weekdays, applying the same start/end time
// (anchored to that day) and capacity to every generated shift.
type CreateRecurringShiftRequest struct {
	// DoctorID is the hex id of the associated doctor user (required).
	DoctorID string `json:"doctor_id" validate:"required"`
	// Weekdays lists the days of week to generate shifts for, using Go's
	// time.Weekday encoding (0=Sunday .. 6=Saturday).
	Weekdays []int `json:"weekdays"`
	// StartTime is the inclusive beginning of each generated shift.
	StartTime time.Time `json:"start_time"`
	// EndTime is the exclusive end of each generated shift.
	EndTime time.Time `json:"end_time"`
	// MaxPatients is the booking capacity of each generated shift.
	MaxPatients int `json:"max_patients"`
	// FromDate is the inclusive start of the recurrence window.
	FromDate time.Time `json:"from_date"`
	// ToDate is the inclusive end of the recurrence window.
	ToDate time.Time `json:"to_date"`
}

// UpdateShiftRequest is the payload accepted by PUT /shifts/:id. It supports
// toggling a shift's active flag and/or adjusting its capacity; only the
// supplied fields are applied.
type UpdateShiftRequest struct {
	// IsActive toggles whether the shift is bookable.
	IsActive bool `json:"is_active"`
	// MaxPatients overrides the booking capacity (applied when > 0).
	MaxPatients int `json:"max_patients"`
}

// ShiftResponse is the sanitized view of a Shift returned by read endpoints.
// It omits the auditing timestamps.
type ShiftResponse struct {
	ID          primitive.ObjectID `json:"id"`
	DoctorID    primitive.ObjectID `json:"doctor_id"`
	BranchID    primitive.ObjectID `json:"branch_id"`
	Date        time.Time          `json:"date"`
	StartTime   time.Time          `json:"start_time"`
	EndTime     time.Time          `json:"end_time"`
	MaxPatients int                `json:"max_patients"`
	IsActive    bool               `json:"is_active"`
}

// CreateLeaveRequest is the payload accepted by POST /leaves.
type CreateLeaveRequest struct {
	// DoctorID is the hex id of the associated doctor user (required).
	DoctorID string `json:"doctor_id" validate:"required"`
	// Date is the calendar day the doctor is off.
	Date time.Time `json:"date" validate:"required"`
	// Reason is required.
	Reason string `json:"reason" validate:"required"`
}

// LeaveResponse is the sanitized view of a Leave returned by read endpoints.
// It omits the auditing timestamps.
type LeaveResponse struct {
	ID       primitive.ObjectID `json:"id"`
	DoctorID primitive.ObjectID `json:"doctor_id"`
	Date     time.Time          `json:"date"`
	Reason   string             `json:"reason"`
}

// ---------------------------------------------------------------------------
// Time blocks
// ---------------------------------------------------------------------------

// TimeBlock is the persisted representation of a partial-day blocked time for a
// doctor. Unlike a Leave (which is a full-day exception) a TimeBlock marks a
// specific window within a day as unavailable, e.g. a lunch break or an
// off-site commitment. It maps 1:1 to a document in the "time_blocks" MongoDB
// collection.
type TimeBlock struct {
	// ID is the MongoDB primary key.
	ID primitive.ObjectID `bson:"_id,omitempty" json:"id,omitempty"`
	// DoctorID references the user account (role DOCTOR) the block belongs to.
	DoctorID primitive.ObjectID `bson:"doctor_id" json:"doctor_id"`
	// Date is the calendar day the block falls on (normalized to midnight).
	Date time.Time `bson:"date" json:"date"`
	// StartTime is the inclusive beginning of the blocked window, formatted
	// "HH:MM".
	StartTime string `bson:"start_time" json:"start_time"`
	// EndTime is the exclusive end of the blocked window, formatted "HH:MM".
	EndTime string `bson:"end_time" json:"end_time"`
	// Reason is the free-text justification for the block.
	Reason string `bson:"reason" json:"reason"`
	// CreatedAt is the timestamp the block was first persisted.
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
}

// ToResponse converts the TimeBlock entity into a TimeBlockResponse DTO,
// turning the embedded ObjectIDs into hex strings for JSON transport. It
// returns nil for a nil receiver so callers can chain safely.
func (b *TimeBlock) ToResponse() *TimeBlockResponse {
	if b == nil {
		return nil
	}
	return &TimeBlockResponse{
		ID:        b.ID.Hex(),
		DoctorID:  b.DoctorID.Hex(),
		Date:      b.Date,
		StartTime: b.StartTime,
		EndTime:   b.EndTime,
		Reason:    b.Reason,
		CreatedAt: b.CreatedAt,
	}
}

// CreateTimeBlockRequest is the payload accepted by POST /time-blocks. DoctorID
// is a hex string parsed into an ObjectID in the service; Date is a "YYYY-MM-DD"
// calendar day and the start/end times are "HH:MM" wall-clock strings.
type CreateTimeBlockRequest struct {
	DoctorID  string `json:"doctor_id" validate:"required"`
	Date      string `json:"date" validate:"required"`       // YYYY-MM-DD
	StartTime string `json:"start_time" validate:"required"` // HH:MM
	EndTime   string `json:"end_time" validate:"required"`   // HH:MM
	Reason    string `json:"reason"`
}

// TimeBlockResponse is the API-facing representation of a TimeBlock. It uses a
// hex string id and keeps the wall-clock time strings verbatim.
type TimeBlockResponse struct {
	ID        string    `json:"id"`
	DoctorID  string    `json:"doctor_id"`
	Date      time.Time `json:"date"`
	StartTime string    `json:"start_time"`
	EndTime   string    `json:"end_time"`
	Reason    string    `json:"reason"`
	CreatedAt time.Time `json:"created_at"`
}
