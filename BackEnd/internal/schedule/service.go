package schedule

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"clinic-api/pkg/database"
	"clinic-api/pkg/logger"
)

// Sentinel errors returned by the service. Handlers translate these into the
// appropriate HTTP status via errormap. Using sentinel errors (rather than
// returning *errormap.APIError directly) keeps the service free of HTTP
// concerns, in line with Clean Architecture.
var (
	// ErrShiftNotFound is returned when a shift lookup yields no document.
	ErrShiftNotFound = errors.New("schedule: shift not found")
	// ErrLeaveNotFound is returned when a leave lookup yields no document.
	ErrLeaveNotFound = errors.New("schedule: leave not found")
	// ErrInvalidObjectID is returned when a supplied id is not a valid hex
	// ObjectID.
	ErrInvalidObjectID = errors.New("schedule: invalid object id")
	// ErrOverlappingShift is returned when a new/updated shift overlaps an
	// existing shift for the same doctor on the same day.
	ErrOverlappingShift = errors.New("schedule: shift overlaps an existing shift")
	// ErrShiftOnLeave is returned when attempting to create a shift that falls
	// on a day the doctor is on leave.
	ErrShiftOnLeave = errors.New("schedule: shift falls on a leave day")
	// ErrShiftTimeInvalid is returned when a shift's start time is not strictly
	// before its end time.
	ErrShiftTimeInvalid = errors.New("schedule: shift start time must be before end time")
	// ErrDoctorOnLeave is returned when a recurring shift generation attempts to
	// create a shift on a leave day. It is handled gracefully by the recurring
	// generator (the day is skipped) and surfaced for single-shift creation.
	ErrDoctorOnLeave = errors.New("schedule: doctor is on leave on this date")
	// ErrTimeBlockNotFound is returned when a time block lookup yields no
	// document.
	ErrTimeBlockNotFound = errors.New("schedule: time block not found")
	// ErrTimeBlockInvalid is returned when a time block's start time is not
	// strictly before its end time, or its wall-clock format is malformed.
	ErrTimeBlockInvalid = errors.New("schedule: time block start time must be before end time")
)

// Service contains the schedule domain's business logic. It owns a generic
// repository for shifts, leaves and time blocks and is the only layer allowed
// to talk to the repositories, keeping those concerns out of both the entity
// definitions and the HTTP handlers.
type Service struct {
	shiftRepo *database.Repository[Shift]
	leaveRepo *database.Repository[Leave]
	blockRepo *database.Repository[TimeBlock]
}

// NewService constructs a Service bound to the given repositories. The
// repositories are typically created in bootstrap from the underlying MongoDB
// collections.
func NewService(shiftRepo *database.Repository[Shift], leaveRepo *database.Repository[Leave], blockRepo *database.Repository[TimeBlock]) *Service {
	return &Service{
		shiftRepo: shiftRepo,
		leaveRepo: leaveRepo,
		blockRepo: blockRepo,
	}
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

// ValidateShiftTimes returns ErrShiftTimeInvalid unless start is strictly
// before end. Centralizing the rule keeps the same semantics everywhere a
// shift is created or modified.
func ValidateShiftTimes(start, end time.Time) error {
	if !start.Before(end) {
		return ErrShiftTimeInvalid
	}
	return nil
}

// midnight normalizes a time to the start of its calendar day in its existing
// location. It is used to compare calendar days regardless of the wall-clock
// component.
func midnight(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}

// isDoctorOnLeave reports whether the given doctor has a leave on the calendar
// day of the supplied date. A non-nil error (other than ErrNotFound) is
// propagated.
func (s *Service) isDoctorOnLeave(ctx context.Context, doctorID primitive.ObjectID, date time.Time) (bool, error) {
	day := midnight(date)
	filter := bson.M{
		"doctor_id": doctorID,
		"date":      day,
	}
	if _, err := s.leaveRepo.FindOne(ctx, filter); err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// IsDoctorOnLeave is the exported wrapper around isDoctorOnLeave. It is the
// public surface used by other domains (notably booking) to query whether a
// doctor is on leave on a given date, without those domains reaching into the
// schedule repositories directly.
func (s *Service) IsDoctorOnLeave(ctx context.Context, doctorID primitive.ObjectID, date time.Time) (bool, error) {
	return s.isDoctorOnLeave(ctx, doctorID, date)
}

// GetShiftsByDoctorAndDate returns all shifts the given doctor has on the
// calendar day of the supplied date. The date is normalized to midnight so the
// equality match compares whole days. It is exposed for other domains (notably
// booking) to verify that a requested slot falls within a doctor's working
// hours.
func (s *Service) GetShiftsByDoctorAndDate(ctx context.Context, doctorID primitive.ObjectID, date time.Time) ([]*Shift, error) {
	day := midnight(date)
	filter := bson.M{
		"doctor_id": doctorID,
		"date":      day,
	}
	return s.shiftRepo.FindAll(ctx, filter)
}

// GetShiftsByDoctor returns every shift for the given doctor regardless of
// date. It is used by the public doctor-directory endpoint to list a doctor's
// availability without the caller knowing a specific day.
func (s *Service) GetShiftsByDoctor(ctx context.Context, doctorID primitive.ObjectID) ([]*Shift, error) {
	return s.shiftRepo.FindAll(ctx, bson.M{"doctor_id": doctorID})
}

// GetShiftsByDoctorBetween returns every shift for the given doctor whose Date
// falls within the half-open range [from, to). It is a range query (rather than
// exact-day equality) so callers can be tolerant of timezone-normalization
// differences between how shifts are written and read; the caller then filters
// by the shift's own start time as needed.
func (s *Service) GetShiftsByDoctorBetween(ctx context.Context, doctorID primitive.ObjectID, from, to time.Time) ([]*Shift, error) {
	return s.shiftRepo.FindAll(ctx, bson.M{
		"doctor_id": doctorID,
		"date":      bson.M{"$gte": from, "$lt": to},
	})
}

// hasOverlappingShift reports whether any existing shift for the given doctor
// on the given date overlaps the half-open interval [start, end). Two ranges
// overlap iff s1 < e2 && s2 < e1. A non-nil error (other than ErrNotFound) is
// propagated.
func (s *Service) hasOverlappingShift(ctx context.Context, doctorID primitive.ObjectID, date, start, end time.Time) (bool, error) {
	day := midnight(date)
	filter := bson.M{
		"doctor_id": doctorID,
		"date":      day,
	}
	existing, err := s.shiftRepo.FindAll(ctx, filter)
	if err != nil {
		return false, err
	}
	for _, sh := range existing {
		if start.Before(sh.EndTime) && sh.StartTime.Before(end) {
			return true, nil
		}
	}
	return false, nil
}

// validateNewShift runs the full pre-insert validation for a shift: time
// ordering, leave check and overlap check. It returns the appropriate domain
// sentinel error on the first failure so the caller can surface it cleanly.
func (s *Service) validateNewShift(ctx context.Context, doctorID primitive.ObjectID, shift Shift) error {
	if err := ValidateShiftTimes(shift.StartTime, shift.EndTime); err != nil {
		return err
	}

	onLeave, err := s.isDoctorOnLeave(ctx, doctorID, shift.Date)
	if err != nil {
		logger.Get().Error("validateNewShift: leave lookup failed", "doctor_id", doctorID.Hex(), "error", err)
		return err
	}
	if onLeave {
		return ErrShiftOnLeave
	}

	overlap, err := s.hasOverlappingShift(ctx, doctorID, shift.Date, shift.StartTime, shift.EndTime)
	if err != nil {
		logger.Get().Error("validateNewShift: overlap lookup failed", "doctor_id", doctorID.Hex(), "error", err)
		return err
	}
	if overlap {
		return ErrOverlappingShift
	}

	return nil
}

// ---------------------------------------------------------------------------
// Shift operations
// ---------------------------------------------------------------------------

// CreateShift persists a single new shift after validating its times and the
// leave/overlap constraints. It returns the sanitized response of the
// persisted entity.
func (s *Service) CreateShift(ctx context.Context, req CreateShiftRequest) (*ShiftResponse, error) {
	doctorOID, err := primitive.ObjectIDFromHex(req.DoctorID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	now := time.Now()
	shift := Shift{
		ID:          primitive.NewObjectID(),
		DoctorID:    doctorOID,
		// Normalize to midnight so day-equality lookups (leave, overlap, booking
		// eligibility) match regardless of the wall-clock on StartTime.
		Date:        midnight(req.Date),
		StartTime:   req.StartTime,
		EndTime:     req.EndTime,
		MaxPatients: req.MaxPatients,
		IsActive:    true,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if err := s.validateNewShift(ctx, doctorOID, shift); err != nil {
		return nil, err
	}

	id, err := s.shiftRepo.Insert(ctx, shift)
	if err != nil {
		logger.Get().Error("createShift: insert failed", "doctor_id", req.DoctorID, "error", err)
		return nil, err
	}
	shift.ID = id

	logger.Get().Info("shift created", "id", shift.ID.Hex(), "doctor_id", req.DoctorID)

	return shift.ToResponse(), nil
}

// CreateRecurringShifts expands the recurrence request into one shift per day
// in [FromDate, ToDate] whose weekday appears in Weekdays. Each generated
// shift is validated the same way as a single shift; days that fall on a leave
// are skipped (logged) rather than aborting the whole batch, so callers can
// provision a full season in one request. The returned slice contains only
// the shifts that were actually persisted.
func (s *Service) CreateRecurringShifts(ctx context.Context, req CreateRecurringShiftRequest) ([]*ShiftResponse, error) {
	doctorOID, err := primitive.ObjectIDFromHex(req.DoctorID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	if err := ValidateShiftTimes(req.StartTime, req.EndTime); err != nil {
		return nil, err
	}

	// Build a set of the requested weekdays for O(1) membership checks.
	weekdaySet := make(map[int]struct{}, len(req.Weekdays))
	for _, w := range req.Weekdays {
		weekdaySet[w] = struct{}{}
	}

	// Anchor the shift start/end wall-clock to each generated day so a single
	// request defines the daily working hours consistently.
	startClock := time.Duration(req.StartTime.Hour())*time.Hour +
		time.Duration(req.StartTime.Minute())*time.Minute +
		time.Duration(req.StartTime.Second())*time.Second
	endClock := time.Duration(req.EndTime.Hour())*time.Hour +
		time.Duration(req.EndTime.Minute())*time.Minute +
		time.Duration(req.EndTime.Second())*time.Second

	created := make([]*ShiftResponse, 0)

	// Iterate day by day, inclusive of both FromDate and ToDate.
	for day := midnight(req.FromDate); !day.After(midnight(req.ToDate)); day = day.AddDate(0, 0, 1) {
		// Go's time.Weekday is 0=Sunday..6=Saturday, matching the request
		// encoding documented on CreateRecurringShiftRequest.
		if _, ok := weekdaySet[int(day.Weekday())]; !ok {
			continue
		}

		startTime := day.Add(startClock)
		endTime := day.Add(endClock)

		now := time.Now()
		shift := Shift{
			ID:          primitive.NewObjectID(),
			DoctorID:    doctorOID,
			Date:        day,
			StartTime:   startTime,
			EndTime:     endTime,
			MaxPatients: req.MaxPatients,
			IsActive:    true,
			CreatedAt:   now,
			UpdatedAt:   now,
		}

		if err := s.validateNewShift(ctx, doctorOID, shift); err != nil {
			// A leave day is skipped gracefully so the batch can continue.
			if errors.Is(err, ErrShiftOnLeave) || errors.Is(err, ErrDoctorOnLeave) {
				logger.Get().Info("createRecurringShifts: skipping leave day", "doctor_id", req.DoctorID, "date", day.Format("2006-01-02"))
				continue
			}
			// A genuine conflict (overlap) or validation failure aborts the
			// batch and rolls responsibility to the caller; partial results
			// are not returned to avoid a misleading success.
			return created, err
		}

		id, err := s.shiftRepo.Insert(ctx, shift)
		if err != nil {
			logger.Get().Error("createRecurringShifts: insert failed", "doctor_id", req.DoctorID, "date", day.Format("2006-01-02"), "error", err)
			return created, err
		}
		shift.ID = id

		created = append(created, shift.ToResponse())
	}

	logger.Get().Info("recurring shifts created", "doctor_id", req.DoctorID, "count", len(created))

	return created, nil
}

// GetShift returns the shift identified by the given hex id.
func (s *Service) GetShift(ctx context.Context, id string) (*ShiftResponse, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	shift, err := s.shiftRepo.FindByID(ctx, oid)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrShiftNotFound
		}
		logger.Get().Error("getShift: lookup failed", "id", id, "error", err)
		return nil, err
	}

	return shift.ToResponse(), nil
}

// ListShifts returns the sanitized responses for all shifts, optionally
// filtered by doctor_id and/or a calendar date. An empty doctorID/date means
// "no filter on that field".
func (s *Service) ListShifts(ctx context.Context, doctorID, date string) ([]*ShiftResponse, error) {
	filter := bson.M{}

	if doctorID != "" {
		doctorOID, err := primitive.ObjectIDFromHex(doctorID)
		if err != nil {
			return nil, ErrInvalidObjectID
		}
		filter["doctor_id"] = doctorOID
	}

	if date != "" {
		// Parse the supplied date and normalize to midnight so the equality
		// match compares calendar days rather than instants.
		parsed, err := time.Parse("2006-01-02", date)
		if err != nil {
			return nil, ErrInvalidObjectID
		}
		filter["date"] = midnight(parsed)
	}

	shifts, err := s.shiftRepo.FindAll(ctx, filter)
	if err != nil {
		logger.Get().Error("listShifts: query failed", "error", err)
		return nil, err
	}

	results := make([]*ShiftResponse, 0, len(shifts))
	for _, sh := range shifts {
		results = append(results, sh.ToResponse())
	}
	return results, nil
}

// UpdateShift applies the partial update described by req to the shift
// identified by id. Currently it supports toggling IsActive and adjusting
// MaxPatients; only MaxPatients values greater than zero overwrite the stored
// capacity so a zero (omitted) value cannot accidentally reset it.
func (s *Service) UpdateShift(ctx context.Context, id string, req UpdateShiftRequest) (*ShiftResponse, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	setFields := bson.M{
		"is_active":  req.IsActive,
		"updated_at": time.Now(),
	}
	if req.MaxPatients > 0 {
		setFields["max_patients"] = req.MaxPatients
	}

	update := bson.M{"$set": setFields}

	if err := s.shiftRepo.Update(ctx, oid, update); err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrShiftNotFound
		}
		logger.Get().Error("updateShift: update failed", "id", id, "error", err)
		return nil, err
	}

	// Re-read to return the updated entity, mirroring the create flow.
	shift, err := s.shiftRepo.FindByID(ctx, oid)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrShiftNotFound
		}
		logger.Get().Error("updateShift: re-read failed", "id", id, "error", err)
		return nil, err
	}

	logger.Get().Info("shift updated", "id", id)

	return shift.ToResponse(), nil
}

// DeleteShift removes the shift identified by id.
func (s *Service) DeleteShift(ctx context.Context, id string) error {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return ErrInvalidObjectID
	}

	if err := s.shiftRepo.Delete(ctx, oid); err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return ErrShiftNotFound
		}
		logger.Get().Error("deleteShift: delete failed", "id", id, "error", err)
		return err
	}

	logger.Get().Info("shift deleted", "id", id)

	return nil
}

// ---------------------------------------------------------------------------
// Leave operations
// ---------------------------------------------------------------------------

// CreateLeave persists a new doctor leave, normalizing the supplied date to
// midnight so day-based comparisons are exact. It does not attempt to reconcile
// existing shifts that may fall on the leave day (that is left to higher-level
// orchestration); it simply records the exception.
func (s *Service) CreateLeave(ctx context.Context, req CreateLeaveRequest) (*LeaveResponse, error) {
	doctorOID, err := primitive.ObjectIDFromHex(req.DoctorID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	now := time.Now()
	leave := Leave{
		ID:        primitive.NewObjectID(),
		DoctorID:  doctorOID,
		Date:      midnight(req.Date),
		Reason:    req.Reason,
		CreatedAt: now,
		UpdatedAt: now,
	}

	id, err := s.leaveRepo.Insert(ctx, leave)
	if err != nil {
		logger.Get().Error("createLeave: insert failed", "doctor_id", req.DoctorID, "error", err)
		return nil, err
	}
	leave.ID = id

	logger.Get().Info("leave created", "id", leave.ID.Hex(), "doctor_id", req.DoctorID)

	return leave.ToResponse(), nil
}

// GetLeave returns the leave identified by the given hex id.
func (s *Service) GetLeave(ctx context.Context, id string) (*LeaveResponse, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	leave, err := s.leaveRepo.FindByID(ctx, oid)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrLeaveNotFound
		}
		logger.Get().Error("getLeave: lookup failed", "id", id, "error", err)
		return nil, err
	}

	return leave.ToResponse(), nil
}

// ListLeaves returns the sanitized responses for all leaves for the given
// doctor. An empty doctorID means "all doctors".
func (s *Service) ListLeaves(ctx context.Context, doctorID string) ([]*LeaveResponse, error) {
	filter := bson.M{}
	if doctorID != "" {
		doctorOID, err := primitive.ObjectIDFromHex(doctorID)
		if err != nil {
			return nil, ErrInvalidObjectID
		}
		filter["doctor_id"] = doctorOID
	}

	leaves, err := s.leaveRepo.FindAll(ctx, filter)
	if err != nil {
		logger.Get().Error("listLeaves: query failed", "error", err)
		return nil, err
	}

	results := make([]*LeaveResponse, 0, len(leaves))
	for _, l := range leaves {
		results = append(results, l.ToResponse())
	}
	return results, nil
}

// DeleteLeave removes the leave identified by id.
func (s *Service) DeleteLeave(ctx context.Context, id string) error {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return ErrInvalidObjectID
	}

	if err := s.leaveRepo.Delete(ctx, oid); err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return ErrLeaveNotFound
		}
		logger.Get().Error("deleteLeave: delete failed", "id", id, "error", err)
		return err
	}

	logger.Get().Info("leave deleted", "id", id)

	return nil
}

// ---------------------------------------------------------------------------
// Time block operations
// ---------------------------------------------------------------------------

// parseClock parses a "HH:MM" wall-clock string into (hours, minutes). It
// returns false for a malformed string. It is the shared validator for time
// block start/end ordering.
func parseClock(s string) (int, int, bool) {
	parts := strings.Split(s, ":")
	if len(parts) != 2 {
		return 0, 0, false
	}
	h, err := strconv.Atoi(parts[0])
	if err != nil || h < 0 || h > 23 {
		return 0, 0, false
	}
	m, err := strconv.Atoi(parts[1])
	if err != nil || m < 0 || m > 59 {
		return 0, 0, false
	}
	return h, m, true
}

// CreateTimeBlock persists a new partial-day time block for a doctor. It parses
// the hex DoctorID, parses and normalizes the calendar date to midnight,
// validates that start and end are well-formed "HH:MM" strings and that start
// is strictly before end, then inserts the block.
func (s *Service) CreateTimeBlock(ctx context.Context, req CreateTimeBlockRequest) (*TimeBlockResponse, error) {
	doctorOID, err := primitive.ObjectIDFromHex(req.DoctorID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	day, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	sh, sm, ok := parseClock(req.StartTime)
	if !ok {
		return nil, ErrTimeBlockInvalid
	}
	eh, em, ok := parseClock(req.EndTime)
	if !ok {
		return nil, ErrTimeBlockInvalid
	}
	// Start must be strictly before end (compare as total minutes).
	if sh*60+sm >= eh*60+em {
		return nil, ErrTimeBlockInvalid
	}

	block := TimeBlock{
		ID:        primitive.NewObjectID(),
		DoctorID:  doctorOID,
		Date:      midnight(day),
		StartTime: req.StartTime,
		EndTime:   req.EndTime,
		Reason:    req.Reason,
		CreatedAt: time.Now(),
	}

	id, err := s.blockRepo.Insert(ctx, block)
	if err != nil {
		logger.Get().Error("createTimeBlock: insert failed", "doctor_id", req.DoctorID, "error", err)
		return nil, err
	}
	block.ID = id

	logger.Get().Info("time block created", "id", block.ID.Hex(), "doctor_id", req.DoctorID)

	return block.ToResponse(), nil
}

// ListTimeBlocks returns the time blocks for the given doctor, optionally
// narrowed to a specific calendar date (YYYY-MM-DD). An empty date means "all
// dates for this doctor".
func (s *Service) ListTimeBlocks(ctx context.Context, doctorID, date string) ([]*TimeBlockResponse, error) {
	filter := bson.M{}

	if doctorID != "" {
		doctorOID, err := primitive.ObjectIDFromHex(doctorID)
		if err != nil {
			return nil, ErrInvalidObjectID
		}
		filter["doctor_id"] = doctorOID
	}

	if date != "" {
		parsed, err := time.Parse("2006-01-02", date)
		if err != nil {
			return nil, ErrInvalidObjectID
		}
		filter["date"] = midnight(parsed)
	}

	blocks, err := s.blockRepo.FindAll(ctx, filter)
	if err != nil {
		logger.Get().Error("listTimeBlocks: query failed", "error", err)
		return nil, err
	}

	results := make([]*TimeBlockResponse, 0, len(blocks))
	for _, b := range blocks {
		results = append(results, b.ToResponse())
	}
	return results, nil
}

// DeleteTimeBlock removes the time block identified by id.
func (s *Service) DeleteTimeBlock(ctx context.Context, id string) error {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return ErrInvalidObjectID
	}

	if err := s.blockRepo.Delete(ctx, oid); err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return ErrTimeBlockNotFound
		}
		logger.Get().Error("deleteTimeBlock: delete failed", "id", id, "error", err)
		return err
	}

	logger.Get().Info("time block deleted", "id", id)

	return nil
}
