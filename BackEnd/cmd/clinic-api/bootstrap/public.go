// Package bootstrap assembles the application's runtime graph: it loads
// configuration, connects to MongoDB, constructs the repositories, services and
// HTTP handlers for every internal domain, registers the Echo routes and runs
// the server with graceful shutdown.
//
// This file holds the PUBLIC, patient-facing read endpoints that aggregate
// across domains (clinic + schedule + booking): the doctor directory, a
// doctor's shifts, and the bookable time-slots for a doctor on a given day.
// These endpoints sit on an unauthenticated group so patients can discover
// doctors and pick a slot before logging in / booking. They are intentionally
// thin wiring: they delegate to the existing domain services and only add the
// cross-domain "slot generation" rule (shift window − existing appointments),
// which cannot live in any single domain without violating the dependency
// direction (booking → schedule, never schedule → booking).
package bootstrap

import (
	"context"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"clinic-api/internal/booking"
	"clinic-api/internal/clinic"
	"clinic-api/internal/review"
	"clinic-api/internal/schedule"
	"clinic-api/internal/user"
	"clinic-api/pkg/database"
	"clinic-api/pkg/errormap"
	"clinic-api/pkg/logger"
	"clinic-api/pkg/requestctx"
)

// DoctorUserIDResolver maps a doctor PROFILE id (the id exposed by the public
// doctor directory) to the underlying USER id that shifts and appointments are
// actually stored under. Shifts are written by the doctor panel keyed by the
// user account id (the authenticated user's _id), while patients browse and
// book by the doctor-profile id. The public endpoints therefore must resolve
// profile-id → user-id before querying the schedule domain, otherwise the
// queries return an empty result set.
type DoctorUserIDResolver interface {
	// ResolveUserIDByProfileID returns the user id linked to the given doctor
	// profile id. A missing profile is reported as database.ErrNotFound so the
	// caller can map it to a 404.
	ResolveUserIDByProfileID(ctx context.Context, profileID primitive.ObjectID) (primitive.ObjectID, error)
}

// doctorProfileRepoResolver implements DoctorUserIDResolver by looking the
// profile up directly in the doctor_profiles repository. It is supplied by the
// bootstrap layer where the generic repository is already in scope, mirroring
// the cross-domain adapter pattern used elsewhere.
type doctorProfileRepoResolver struct {
	repo *database.Repository[clinic.DoctorProfile]
}

// ResolveUserIDByProfileID loads the doctor profile and returns its UserID.
func (r *doctorProfileRepoResolver) ResolveUserIDByProfileID(ctx context.Context, profileID primitive.ObjectID) (primitive.ObjectID, error) {
	profile, err := r.repo.FindByID(ctx, profileID)
	if err != nil {
		return primitive.NilObjectID, err
	}
	return profile.UserID, nil
}

// ResolveProfileIDByUserID loads the doctor profile for a USER id and returns
// its PROFILE id (used by the review domain when denormalizing public ids).
func (r *doctorProfileRepoResolver) ResolveProfileIDByUserID(ctx context.Context, userID primitive.ObjectID) (primitive.ObjectID, error) {
	profile, err := r.repo.FindOne(ctx, bson.M{"user_id": userID})
	if err != nil {
		return primitive.NilObjectID, err
	}
	return profile.ID, nil
}

// Compile-time check: doctorProfileRepoResolver satisfies review.DoctorProfileResolver.
var _ review.DoctorProfileResolver = (*doctorProfileRepoResolver)(nil)

// tehran is the clinic's local timezone (Asia/Tehran, UTC+03:30, no DST). The
// Go Mongo driver decodes stored times into UTC; we format the patient/doctor-
// facing wall-clock values in Tehran so the displayed slots/queue times match
// what staff and patients actually work with.
var tehran = time.FixedZone("IRST", 3*60*60+30*60)

// TimeSlotResponse is the JSON shape returned by GET /doctors/:id/slots. It
// mirrors the frontend TimeSlot contract (HH:mm start/end + availability).
type TimeSlotResponse struct {
	// StartTime is the inclusive slot beginning, "HH:mm".
	StartTime string `json:"start_time"`
	// EndTime is the exclusive slot end, "HH:mm".
	EndTime string `json:"end_time"`
	// Available reports whether the slot still accepts new bookings.
	Available bool `json:"available"`
	// MaxPatients is the shift's booking capacity (denormalized for the UI).
	MaxPatients int `json:"max_patients"`
	// BookedCount is how many non-cancelled appointments already overlap.
	BookedCount int `json:"booked_count"`
}

// sameCalendarDay reports whether t falls on the same Asia/Tehran calendar day
// as the requested day (YYYY-MM-DD from the client, meaning a clinic-local day).
// Comparing in UTC used to drop early-morning Tehran shifts whose UTC instant
// falls on the previous UTC date.
func sameCalendarDay(t time.Time, day time.Time) bool {
	tt := t.In(tehran)
	return tt.Year() == day.Year() && tt.Month() == day.Month() && tt.Day() == day.Day()
}

// makeDoctorShiftsHandler builds the public GET /doctors/:id/shifts handler. It
// returns the doctor's shifts; when ?date=YYYY-MM-DD is supplied, the result is
// scoped to that calendar day by the shift's OWN start time (UTC), which is
// robust to the timezone the shift was originally written with.
func makeDoctorShiftsHandler(scheduleSvc *schedule.Service, resolver DoctorUserIDResolver) echo.HandlerFunc {
	return func(c echo.Context) error {
		ctx := c.Request().Context()
		profileID := c.Param("id")
		profileOID, err := primitive.ObjectIDFromHex(profileID)
		if err != nil {
			return c.JSON(http.StatusBadRequest, errormap.New(http.StatusBadRequest, "invalid doctor id", "id must be a hex objectid"))
		}

		// The directory exposes the doctor PROFILE id, but shifts are stored
		// under the doctor USER id, so resolve before querying.
		doctorOID, err := resolver.ResolveUserIDByProfileID(ctx, profileOID)
		if err != nil {
			if errors.Is(err, database.ErrNotFound) {
				return c.JSON(http.StatusNotFound, errormap.New(http.StatusNotFound, "doctor not found", "no doctor profile for id"))
			}
			logger.Get().Error("public: resolve doctor user id failed", "profile_id", profileID, "error", err)
			return c.JSON(http.StatusInternalServerError, errormap.New(http.StatusInternalServerError, "internal error", err.Error()))
		}

		shifts, err := scheduleSvc.GetShiftsByDoctor(ctx, doctorOID)
		if err != nil {
			logger.Get().Error("public: list doctor shifts failed", "doctor_id", profileID, "error", err)
			return c.JSON(http.StatusInternalServerError, errormap.New(http.StatusInternalServerError, "internal error", err.Error()))
		}

		// Optional date scope (by the shift's start-time UTC calendar day).
		dateStr := c.QueryParam("date")
		if dateStr != "" {
			if day, perr := time.Parse("2006-01-02", dateStr); perr == nil {
				filtered := make([]*schedule.ShiftResponse, 0, len(shifts))
				for _, sh := range shifts {
					if sameCalendarDay(sh.StartTime, day) {
						filtered = append(filtered, sh.ToResponse())
					}
				}
				return c.JSON(http.StatusOK, filtered)
			}
		}

		// No (valid) date: return all of the doctor's shifts.
		out := make([]*schedule.ShiftResponse, 0, len(shifts))
		for _, sh := range shifts {
			out = append(out, sh.ToResponse())
		}
		return c.JSON(http.StatusOK, out)
	}
}

// makeDoctorSlotsHandler builds the public GET /doctors/:id/slots handler. It
// decomposes each active shift the doctor has on the requested date into
// visit-duration-minute slots and marks a slot unavailable once the number of
// overlapping non-cancelled appointments reaches the shift's capacity.
//
// The visit duration is taken from the ?visit_duration query param (provided by
// the client, which already holds the doctor's profile) defaulting to 15.
func makeDoctorSlotsHandler(
	scheduleSvc *schedule.Service,
	apptRepo *database.Repository[booking.Appointment],
	resolver DoctorUserIDResolver,
) echo.HandlerFunc {
	return func(c echo.Context) error {
		ctx := c.Request().Context()
		profileID := c.Param("id")
		profileOID, err := primitive.ObjectIDFromHex(profileID)
		if err != nil {
			return c.JSON(http.StatusBadRequest, errormap.New(http.StatusBadRequest, "invalid doctor id", "id must be a hex objectid"))
		}

		// The directory exposes the doctor PROFILE id, but shifts/appointments
		// are stored under the doctor USER id, so resolve before querying.
		doctorOID, err := resolver.ResolveUserIDByProfileID(ctx, profileOID)
		if err != nil {
			if errors.Is(err, database.ErrNotFound) {
				return c.JSON(http.StatusNotFound, errormap.New(http.StatusNotFound, "doctor not found", "no doctor profile for id"))
			}
			logger.Get().Error("public: resolve doctor user id failed", "profile_id", profileID, "error", err)
			return c.JSON(http.StatusInternalServerError, errormap.New(http.StatusInternalServerError, "internal error", err.Error()))
		}
		doctorID := profileID

		// Parse the requested calendar day.
		day, err := time.Parse("2006-01-02", c.QueryParam("date"))
		if err != nil {
			return c.JSON(http.StatusBadRequest, errormap.New(http.StatusBadRequest, "invalid date", "date must be YYYY-MM-DD"))
		}

		// Visit duration (minutes); default to a sensible 15, clamp to >=1.
		visitDur := 15
		if raw := c.QueryParam("visit_duration"); raw != "" {
			if n, perr := strconv.Atoi(raw); perr == nil && n > 0 {
				visitDur = n
			}
		}
		slotLen := time.Duration(visitDur) * time.Minute

		// Fetch the doctor's shifts around that calendar day via a range query
		// (robust to timezone normalization), then keep only those whose OWN
		// start time falls on the requested UTC calendar day.
		shifts, err := scheduleSvc.GetShiftsByDoctorBetween(ctx, doctorOID, day.Add(-24*time.Hour), day.Add(48*time.Hour))
		if err != nil {
			logger.Get().Error("public: slots shift lookup failed", "doctor_id", doctorID, "error", err)
			return c.JSON(http.StatusInternalServerError, errormap.New(http.StatusInternalServerError, "internal error", err.Error()))
		}

		// Fetch the doctor's existing appointments for that day. We query a
		// generous start_time window (±1 day) to be robust against timezone
		// normalization differences, then rely on the absolute-time overlap
		// check below for correctness — extra candidates in the set are
		// harmless because availability is computed by slot↔appointment overlap.
		dayStartUTC := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, time.UTC)
		appts, apptErr := apptRepo.FindAll(ctx, bson.M{
			"doctor_id":  doctorOID,
			"start_time": bson.M{"$gte": dayStartUTC.Add(-24 * time.Hour), "$lt": dayStartUTC.Add(48 * time.Hour)},
		})
		if apptErr != nil {
			// A lookup failure degrades gracefully: treat as no bookings.
			logger.Get().Warn("public: slots appointment lookup failed; treating as no bookings", "doctor_id", doctorID, "error", apptErr)
			appts = nil
		}

		// "Now" drives availability: slots whose start has already passed stay
		// visible but marked unavailable so patients can see the day's schedule
		// instead of an empty "no slots" state when the shift already ended.
		now := time.Now().UTC()

		slots := make([]TimeSlotResponse, 0)
		for _, sh := range shifts {
			if !sh.IsActive {
				continue
			}
			if !sameCalendarDay(sh.StartTime, day) {
				continue
			}
			// Decompose [StartTime, EndTime) into consecutive visit-length slots.
			for cur := sh.StartTime; ; cur = cur.Add(slotLen) {
				slotStart := cur
				slotEnd := cur.Add(slotLen)
				if slotEnd.After(sh.EndTime) {
					break
				}
				past := !slotStart.After(now)
				booked := 0
				for _, a := range appts {
					if a.Status == booking.StatusCancelled {
						continue
					}
					// Half-open overlap: [slotStart, slotEnd) ∩ [a.Start, a.End).
					if slotStart.Before(a.EndTime) && a.StartTime.Before(slotEnd) {
						booked++
					}
				}
				// Booking is strictly one patient per slot: as soon as any
				// non-cancelled appointment overlaps, the slot is taken.
				taken := booked > 0
				slots = append(slots, TimeSlotResponse{
					StartTime:   slotStart.In(tehran).Format("15:04"),
					EndTime:     slotEnd.In(tehran).Format("15:04"),
					Available:   !taken && !past,
					MaxPatients: sh.MaxPatients,
					BookedCount: booked,
				})
			}
		}

		return c.JSON(http.StatusOK, slots)
	}
}

// PatientAppointmentResponse mirrors the frontend AppointmentListItem contract
// used by the patient "my appointments" page. It denormalizes each appointment
// with the doctor's profile (the patient-facing id, specialty, visit duration
// and fee) and the doctor's display name so the UI can render a row without a
// second round-trip.
type PatientAppointmentResponse struct {
	// ID is the appointment id (hex).
	ID string `json:"id"`
	// DoctorID is the doctor PROFILE id (the patient-facing id the booking UI
	// keys on), NOT the underlying user id appointments are stored under.
	DoctorID string `json:"doctor_id"`
	// DoctorName is the doctor's display name ("FirstName LastName").
	DoctorName string `json:"doctor_name"`
	// Specialty is the doctor's medical specialty.
	Specialty string `json:"specialty"`
	// VisitDurationMinutes is the doctor's default visit length, needed by the
	// frontend to regenerate slots when rescheduling.
	VisitDurationMinutes int `json:"visit_duration_minutes"`
	// Fee is the doctor's visit fee in the smallest displayed currency unit
	// (e.g. Toman), used by the frontend to compute the cancellation penalty.
	Fee int `json:"fee"`
	// Date is the appointment's start time as an ISO 8601 string (UTC). The
	// frontend slices the first 10 chars for the Jalali date label and parses
	// the full value for cancellation-tier math.
	Date string `json:"date"`
	// StartTime is the slot beginning in Tehran wall-clock time, "HH:mm".
	StartTime string `json:"start_time"`
	// EndTime is the slot end in Tehran wall-clock time, "HH:mm".
	EndTime string `json:"end_time"`
	// Status is the booking lifecycle status (PENDING/CONFIRMED/...).
	Status string `json:"status"`
	// PaymentStatus is the financial status (UNPAID/PAID/REFUNDED).
	PaymentStatus string `json:"payment_status"`
	// PaymentType is the payment channel (ONLINE/IN_PERSON).
	PaymentType string `json:"payment_type,omitempty"`
}

// makePatientMyAppointmentsHandler builds the authenticated
// GET /bookings/me/appointments handler. It returns ALL of the signed-in
// patient's appointments (active + past), denormalized with the doctor's
// profile and display name, newest-first, so the patient "my appointments"
// page can render the list from real backend data.
func makePatientMyAppointmentsHandler(
	apptRepo *database.Repository[booking.Appointment],
	userRepo *database.Repository[user.User],
	doctorRepo *database.Repository[clinic.DoctorProfile],
) echo.HandlerFunc {
	return func(c echo.Context) error {
		ctx := c.Request().Context()

		// "me" = the authenticated patient, resolved from the JWT by the
		// middleware on the route group.
		patientIDHex := requestctx.GetUserID(c)
		patientOID, err := primitive.ObjectIDFromHex(patientIDHex)
		if err != nil {
			return c.JSON(http.StatusUnauthorized, errormap.New(http.StatusUnauthorized, "unauthorized", "missing user identity"))
		}

		// Fetch every appointment belonging to this patient.
		appts, err := apptRepo.FindAll(ctx, bson.M{"patient_id": patientOID})
		if err != nil {
			logger.Get().Error("patient appointments: lookup failed", "patient_id", patientIDHex, "error", err)
			return c.JSON(http.StatusInternalServerError, errormap.New(http.StatusInternalServerError, "internal error", err.Error()))
		}

		// Newest-first ordering for a sensible active/past split in the UI.
		sort.SliceStable(appts, func(i, j int) bool { return appts[i].StartTime.After(appts[j].StartTime) })

		// Collect the distinct doctor USER ids so we can batch-resolve both the
		// doctor profiles (specialty/fee/visit-duration + the patient-facing
		// profile id) and the doctor display names in two queries.
		doctorIDs := make([]primitive.ObjectID, 0, len(appts))
		seen := map[primitive.ObjectID]struct{}{}
		for _, a := range appts {
			if _, ok := seen[a.DoctorID]; ok {
				continue
			}
			seen[a.DoctorID] = struct{}{}
			doctorIDs = append(doctorIDs, a.DoctorID)
		}

		// profileByUser: user id -> doctor profile.
		profileByUser := map[primitive.ObjectID]*clinic.DoctorProfile{}
		if len(doctorIDs) > 0 {
			if profiles, perr := doctorRepo.FindAll(ctx, bson.M{"user_id": bson.M{"$in": doctorIDs}}); perr == nil {
				for _, p := range profiles {
					profileByUser[p.UserID] = p
				}
			} else if !errors.Is(perr, database.ErrNotFound) {
				logger.Get().Warn("patient appointments: doctor profile lookup failed", "error", perr)
			}
		}

		// nameByUser: user id -> display name.
		nameByUser := map[primitive.ObjectID]string{}
		if len(doctorIDs) > 0 {
			if users, uerr := userRepo.FindAll(ctx, bson.M{"_id": bson.M{"$in": doctorIDs}}); uerr == nil {
				for _, u := range users {
					nameByUser[u.ID] = (u.FirstName + " " + u.LastName)
				}
			}
		}

		items := make([]PatientAppointmentResponse, 0, len(appts))
		for _, a := range appts {
			// Fall back to the stored user id when no profile is linked so the
			// row still renders (the reschedule/cancel flows key off this id).
			doctorID := a.DoctorID.Hex()
			var specialty string
			visitDuration := 0
			fee := 0
			if p, ok := profileByUser[a.DoctorID]; ok {
				doctorID = p.ID.Hex()
				specialty = p.Specialty
				visitDuration = p.VisitDurationMinutes
				fee = p.VisitFee
			}
			items = append(items, PatientAppointmentResponse{
				ID:                   a.ID.Hex(),
				DoctorID:             doctorID,
				DoctorName:           nameByUser[a.DoctorID],
				Specialty:            specialty,
				VisitDurationMinutes: visitDuration,
				Fee:                  fee,
				Date:                 a.StartTime.UTC().Format(time.RFC3339),
				StartTime:            a.StartTime.In(tehran).Format("15:04"),
				EndTime:              a.EndTime.In(tehran).Format("15:04"),
				Status:               string(a.Status),
				PaymentStatus:        string(a.PaymentStatus),
				PaymentType:          string(a.PaymentType),
			})
		}

		return c.JSON(http.StatusOK, items)
	}
}

// DoctorScheduleItemResponse mirrors the frontend DoctorScheduleItem contract.
type DoctorScheduleItemResponse struct {
	AppointmentID  string     `json:"appointment_id"`
	PatientID      string     `json:"patient_id"`
	PatientName    string     `json:"patient_name"`
	StartTime      string     `json:"start_time"`
	EndTime        string     `json:"end_time"`
	Status         string     `json:"status"`
	Reason         string     `json:"reason"`
	HasEHR         bool       `json:"has_ehr"`
	QueuePosition  *int       `json:"queue_position,omitempty"`
	VisitStartedAt *time.Time `json:"visit_started_at,omitempty"`
}

// DoctorScheduleResponse mirrors the frontend DoctorScheduleResponse contract.
type DoctorScheduleResponse struct {
	Date       string                       `json:"date"`
	Total      int                          `json:"total"`
	Waiting    int                          `json:"waiting"`
	InRoom     int                          `json:"in_room"`
	InProgress int                          `json:"in_progress"`
	Completed  int                          `json:"completed"`
	NoShow     int                          `json:"no_show"`
	Items      []DoctorScheduleItemResponse `json:"items"`
}

// makeDoctorMyScheduleHandler builds the authenticated
// GET /doctors/me/schedule?date=YYYY-MM-DD handler. It returns the signed-in
// doctor's appointments for the given day, denormalized with patient names.
// Lifecycle statuses are returned as-is (PENDING, CONFIRMED, CHECKED_IN,
// CALLED, IN_PROGRESS, COMPLETED, NO_SHOW; CANCELLED excluded). EHR existence
// is not checked here (no cross-domain dependency on ehr), so HasEHR is
// reported as false; the UI treats "write record" as always available.
func makeDoctorMyScheduleHandler(
	apptRepo *database.Repository[booking.Appointment],
	userRepo *database.Repository[user.User],
) echo.HandlerFunc {
	return func(c echo.Context) error {
		ctx := c.Request().Context()

		// "me" = the authenticated user (enforced by the JWT middleware on the
		// route group). In practice a DOCTOR calls this to see their own queue.
		// A RECEPTIONIST also calls it: in that case the schedule is scoped to
		// the employer doctor identified by the receptionist's EmployerID, so
		// reception sees exactly their employer's queue.
		callerIDHex := requestctx.GetUserID(c)
		callerOID, err := primitive.ObjectIDFromHex(callerIDHex)
		if err != nil {
			return c.JSON(http.StatusUnauthorized, errormap.New(http.StatusUnauthorized, "unauthorized", "missing user identity"))
		}

		// Default: the caller's own id. A receptionist with a valid EmployerID
		// is redirected to that employer doctor's schedule instead.
		doctorOID := callerOID
		if caller, err := userRepo.FindByID(ctx, callerOID); err == nil {
			if caller.Role == user.RoleReceptionist && caller.EmployerID != primitive.NilObjectID {
				doctorOID = caller.EmployerID
			}
		} else if !errors.Is(err, database.ErrNotFound) {
			// A genuine lookup error is logged but does not block the request:
			// we fall back to the caller's own id so the endpoint stays usable.
			logger.Get().Warn("doctor schedule: caller lookup failed; falling back to caller id", "caller_id", callerIDHex, "error", err)
		}

		day, err := time.Parse("2006-01-02", c.QueryParam("date"))
		if err != nil {
			return c.JSON(http.StatusBadRequest, errormap.New(http.StatusBadRequest, "invalid date", "date must be YYYY-MM-DD"))
		}

		// Fetch the doctor's appointments for that calendar day (generous ±1
		// day window then filter by the absolute StartTime date for robustness
		// against timezone normalization).
		dayStartUTC := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, time.UTC)
		appts, err := apptRepo.FindAll(ctx, bson.M{
			"doctor_id":  doctorOID,
			"start_time": bson.M{"$gte": dayStartUTC.Add(-24 * time.Hour), "$lt": dayStartUTC.Add(48 * time.Hour)},
		})
		if err != nil {
			logger.Get().Error("doctor schedule: appointment lookup failed", "doctor_id", doctorOID.Hex(), "error", err)
			return c.JSON(http.StatusInternalServerError, errormap.New(http.StatusInternalServerError, "internal error", err.Error()))
		}

		// Keep only appointments whose StartTime falls on the requested calendar
		// day (UTC), excluding cancelled ones.
		type candidate struct {
			appt *booking.Appointment
		}
		var kept []*booking.Appointment
		for _, a := range appts {
			if a.Status == booking.StatusCancelled {
				continue
			}
			d := a.StartTime.UTC()
			if d.Year() == day.Year() && d.Month() == day.Month() && d.Day() == day.Day() {
				kept = append(kept, a)
			}
		}
		// Deterministic order by start time for stable queue positions.
		sort.SliceStable(kept, func(i, j int) bool { return kept[i].StartTime.Before(kept[j].StartTime) })

		// Batch-resolve patient names.
		patientIDs := make([]primitive.ObjectID, 0, len(kept))
		for _, a := range kept {
			patientIDs = append(patientIDs, a.PatientID)
		}
		nameByID := map[primitive.ObjectID]string{}
		if len(patientIDs) > 0 {
			if users, err := userRepo.FindAll(ctx, bson.M{"_id": bson.M{"$in": patientIDs}}); err == nil {
				for _, u := range users {
					nameByID[u.ID] = (u.FirstName + " " + u.LastName)
				}
			}
		}

		items := make([]DoctorScheduleItemResponse, 0, len(kept))
		waitingIdx := 0
		var counts struct{ waiting, inRoom, inProgress, completed, noShow int }
		for _, a := range kept {
			// Map the booking lifecycle onto the portal queue vocabulary.
			var status string
			switch a.Status {
			case booking.StatusPending:
				status = "PENDING"
			case booking.StatusConfirmed:
				// Confirmed, not yet arrived — still in the arrival queue.
				status = "CONFIRMED"
				counts.waiting++
			case booking.StatusCheckedIn:
				// Arrived — waiting hall.
				status = "CHECKED_IN"
				counts.inRoom++
			case booking.StatusCalled:
				// Called / admitted — ready for the doctor to start the visit.
				status = "CALLED"
				counts.inRoom++
			case booking.StatusInProgress:
				status = "IN_PROGRESS"
				counts.inProgress++
			case booking.StatusCompleted:
				status = "COMPLETED"
				counts.completed++
			case booking.StatusNoShow:
				status = "NO_SHOW"
				counts.noShow++
			default:
				status = string(a.Status)
			}

			patientName := strings.TrimSpace(nameByID[a.PatientID])
			if patientName == "" {
				patientName = strings.TrimSpace(a.PatientName)
			}
			if patientName == "" && a.PatientPhone != "" {
				patientName = a.PatientPhone
			}
			item := DoctorScheduleItemResponse{
				AppointmentID:  a.ID.Hex(),
				PatientID:      a.PatientID.Hex(),
				PatientName:    patientName,
				StartTime:      a.StartTime.In(tehran).Format("15:04"),
				EndTime:        a.EndTime.In(tehran).Format("15:04"),
				Status:         status,
				Reason:         "", // not modeled on the appointment entity
				HasEHR:         false,
				VisitStartedAt: a.VisitStartedAt,
			}
			if status == "CONFIRMED" || status == "CHECKED_IN" {
				pos := waitingIdx
				item.QueuePosition = &pos
				waitingIdx++
			}
			items = append(items, item)
		}

		return c.JSON(http.StatusOK, DoctorScheduleResponse{
			Date:       c.QueryParam("date"),
			Total:      len(items),
			Waiting:    counts.waiting,
			InRoom:     counts.inRoom,
			InProgress: counts.inProgress,
			Completed:  counts.completed,
			NoShow:     counts.noShow,
			Items:      items,
		})
	}
}

// makeDoctorMyTimelineHandler builds the authenticated
// GET /doctors/me/timeline?date=YYYY-MM-DD handler. It is the server-side
// counterpart of GET /bookings/timeline/:doctorID/:date, but resolves the
// doctor ("me") from the JWT — exactly like makeDoctorMyScheduleHandler — so a
// receptionist is transparently redirected to their employer doctor's timeline
// without the client ever needing to know the doctor id. This avoids the
// doctor_id resolution gap that left the reception timeline empty.
func makeDoctorMyTimelineHandler(
	bookingService *booking.Service,
	userRepo *database.Repository[user.User],
) echo.HandlerFunc {
	return func(c echo.Context) error {
		ctx := c.Request().Context()

		// Resolve "me": the authenticated user (DOCTOR) or, for a RECEPTIONIST,
		// their employer doctor (EmployerID). Mirrors makeDoctorMyScheduleHandler.
		callerIDHex := requestctx.GetUserID(c)
		callerOID, err := primitive.ObjectIDFromHex(callerIDHex)
		if err != nil {
			return c.JSON(http.StatusUnauthorized, errormap.New(http.StatusUnauthorized, "unauthorized", "missing user identity"))
		}
		doctorOID := callerOID
		if caller, err := userRepo.FindByID(ctx, callerOID); err == nil {
			if caller.Role == user.RoleReceptionist && caller.EmployerID != primitive.NilObjectID {
				doctorOID = caller.EmployerID
			}
		} else if !errors.Is(err, database.ErrNotFound) {
			logger.Get().Warn("doctor timeline: caller lookup failed; falling back to caller id", "caller_id", callerIDHex, "error", err)
		}

		dateStr := c.QueryParam("date")
		date, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			return c.JSON(http.StatusBadRequest, errormap.New(http.StatusBadRequest, "invalid date", "date must be YYYY-MM-DD"))
		}

		resp, err := bookingService.GetDailyTimeline(ctx, doctorOID.Hex(), date)
		if err != nil {
			logger.Get().Error("doctor timeline: lookup failed", "doctor_id", doctorOID.Hex(), "date", dateStr, "error", err)
			return c.JSON(http.StatusInternalServerError, errormap.New(http.StatusInternalServerError, "internal error", err.Error()))
		}
		return c.JSON(http.StatusOK, resp)
	}
}

// makeDoctorMyMonthlyHandler builds the authenticated
// GET /bookings/me/monthly/:year/:month handler. It is the server-side
// counterpart of the monthly calendar endpoint, but resolves the doctor ("me")
// from the JWT — exactly like makeDoctorMyTimelineHandler — so a receptionist is
// transparently redirected to their employer doctor's monthly appointment
// breakdown without the client ever needing to know the doctor id.
func makeDoctorMyMonthlyHandler(
	bookingService *booking.Service,
	userRepo *database.Repository[user.User],
) echo.HandlerFunc {
	return func(c echo.Context) error {
		ctx := c.Request().Context()

		// Resolve "me": the authenticated user (DOCTOR) or, for a RECEPTIONIST,
		// their employer doctor (EmployerID). Mirrors makeDoctorMyTimelineHandler.
		callerIDHex := requestctx.GetUserID(c)
		callerOID, err := primitive.ObjectIDFromHex(callerIDHex)
		if err != nil {
			return c.JSON(http.StatusUnauthorized, errormap.New(http.StatusUnauthorized, "unauthorized", "missing user identity"))
		}
		doctorOID := callerOID
		switch caller, lerr := userRepo.FindByID(ctx, callerOID); {
		case lerr == nil:
			// A receptionist is redirected to their employer doctor; a doctor
			// uses their own id. Any other role is forbidden.
			switch caller.Role {
			case user.RoleReceptionist:
				if caller.EmployerID == primitive.NilObjectID {
					return c.JSON(http.StatusForbidden, errormap.New(http.StatusForbidden, "forbidden", "receptionist has no employer doctor"))
				}
				doctorOID = caller.EmployerID
			case user.RoleDoctor:
				// doctorOID already set to callerOID.
			default:
				return c.JSON(http.StatusForbidden, errormap.New(http.StatusForbidden, "forbidden", "only doctors and receptionists may access this endpoint"))
			}
		case errors.Is(lerr, database.ErrNotFound):
			return c.JSON(http.StatusForbidden, errormap.New(http.StatusForbidden, "forbidden", "caller account not found"))
		default:
			logger.Get().Warn("doctor monthly: caller lookup failed", "caller_id", callerIDHex, "error", lerr)
			return c.JSON(http.StatusInternalServerError, errormap.New(http.StatusInternalServerError, "internal error", lerr.Error()))
		}

		year, err := strconv.Atoi(c.Param("year"))
		if err != nil {
			return c.JSON(http.StatusBadRequest, errormap.New(http.StatusBadRequest, "invalid year", "year must be an integer"))
		}
		month, err := strconv.Atoi(c.Param("month"))
		if err != nil {
			return c.JSON(http.StatusBadRequest, errormap.New(http.StatusBadRequest, "invalid month", "month must be an integer"))
		}

		resp, err := bookingService.GetMonthlyAppointments(ctx, doctorOID.Hex(), year, month)
		if err != nil {
			logger.Get().Error("doctor monthly: lookup failed", "doctor_id", doctorOID.Hex(), "year", year, "month", month, "error", err)
			return c.JSON(http.StatusInternalServerError, errormap.New(http.StatusInternalServerError, "internal error", err.Error()))
		}
		return c.JSON(http.StatusOK, resp)
	}
}

// resolveDoctorSelf resolves the acting doctor ("me") from the authenticated
// caller: a DOCTOR maps to themselves, a RECEPTIONIST maps to their employer
// doctor. Returns the doctor ObjectID or an Echo response (already written) on
// failure. Shared by the monthly/range calendar handlers.
func resolveDoctorSelf(c echo.Context, userRepo *database.Repository[user.User]) (primitive.ObjectID, bool) {
	ctx := c.Request().Context()
	callerIDHex := requestctx.GetUserID(c)
	callerOID, err := primitive.ObjectIDFromHex(callerIDHex)
	if err != nil {
		c.JSON(http.StatusUnauthorized, errormap.New(http.StatusUnauthorized, "unauthorized", "missing user identity"))
		return primitive.NilObjectID, false
	}
	caller, lerr := userRepo.FindByID(ctx, callerOID)
	switch {
	case lerr == nil:
		switch caller.Role {
		case user.RoleReceptionist:
			if caller.EmployerID == primitive.NilObjectID {
				c.JSON(http.StatusForbidden, errormap.New(http.StatusForbidden, "forbidden", "receptionist has no employer doctor"))
				return primitive.NilObjectID, false
			}
			return caller.EmployerID, true
		case user.RoleDoctor:
			return callerOID, true
		default:
			c.JSON(http.StatusForbidden, errormap.New(http.StatusForbidden, "forbidden", "only doctors and receptionists may access this endpoint"))
			return primitive.NilObjectID, false
		}
	case errors.Is(lerr, database.ErrNotFound):
		c.JSON(http.StatusForbidden, errormap.New(http.StatusForbidden, "forbidden", "caller account not found"))
		return primitive.NilObjectID, false
	default:
		logger.Get().Warn("resolve doctor self: caller lookup failed", "caller_id", callerIDHex, "error", lerr)
		c.JSON(http.StatusInternalServerError, errormap.New(http.StatusInternalServerError, "internal error", lerr.Error()))
		return primitive.NilObjectID, false
	}
}

// makeDoctorMyMonthlyRangeHandler builds the authenticated
// GET /bookings/me/monthly?from=YYYY-MM-DD&to=YYYY-MM-DD handler. It aggregates
// the per-day appointment breakdown over an explicit half-open Gregorian date
// range, which lets the receptionist Jalali calendar fetch a Jalali month that
// spans two Gregorian months. The doctor ("me") is resolved from the JWT, just
// like the timeline handler.
func makeDoctorMyMonthlyRangeHandler(
	bookingService *booking.Service,
	userRepo *database.Repository[user.User],
) echo.HandlerFunc {
	return func(c echo.Context) error {
		ctx := c.Request().Context()

		doctorOID, ok := resolveDoctorSelf(c, userRepo)
		if !ok {
			return nil
		}

		fromStr := c.QueryParam("from")
		toStr := c.QueryParam("to")
		if fromStr == "" || toStr == "" {
			return c.JSON(http.StatusBadRequest, errormap.New(http.StatusBadRequest, "invalid range", "both 'from' and 'to' query params (YYYY-MM-DD) are required"))
		}
		from, err := time.Parse("2006-01-02", fromStr)
		if err != nil {
			return c.JSON(http.StatusBadRequest, errormap.New(http.StatusBadRequest, "invalid from", "'from' must be a YYYY-MM-DD date"))
		}
		to, err := time.Parse("2006-01-02", toStr)
		if err != nil {
			return c.JSON(http.StatusBadRequest, errormap.New(http.StatusBadRequest, "invalid to", "'to' must be a YYYY-MM-DD date"))
		}
		// `to` is inclusive on the wire → make the window half-open [from, to+1day).
		toExclusive := to.AddDate(0, 0, 1)

		resp, err := bookingService.GetAppointmentsSummaryByRange(ctx, doctorOID, from, toExclusive)
		if err != nil {
			logger.Get().Error("doctor monthly range: lookup failed", "doctor_id", doctorOID.Hex(), "from", fromStr, "to", toStr, "error", err)
			return c.JSON(http.StatusInternalServerError, errormap.New(http.StatusInternalServerError, "internal error", err.Error()))
		}
		return c.JSON(http.StatusOK, resp)
	}
}
