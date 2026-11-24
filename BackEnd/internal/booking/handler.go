package booking

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"clinic-api/internal/user"
	"clinic-api/pkg/errormap"
	"clinic-api/pkg/logger"
	"clinic-api/pkg/requestctx"
)

// Handler exposes the booking domain over HTTP. Each method maps a route to a
// Service call and translates the result/error into the consistent JSON shape
// defined by the errormap package.
//
// The handler is intentionally thin: all business rules (availability, overlap,
// refund policy, waiting-list promotion) live in the service, so this file only
// concerns itself with request binding, validation, path/query parameter
// parsing and HTTP status selection.
//
// Patients address a doctor by the PROFILE id exposed by the public directory,
// but appointments/shifts are stored under the doctor USER id. The optional
// doctorResolver (supplied by bootstrap) lets the handler translate the
// incoming profile id into the user id before delegating to the service. When
// nil (e.g. in unit tests, or callers that already supply a user id) the
// request's doctor id is used verbatim.
type Handler struct {
	service        *Service
	doctorResolver DoctorUserIDResolver
}

// DoctorUserIDResolver maps a doctor PROFILE id to the underlying USER id. It
// mirrors bootstrap.DoctorUserIDResolver; defining it locally keeps the booking
// package free of any bootstrap import. A missing profile should be reported as
// database.ErrNotFound so the handler can fall back to the supplied id.
type DoctorUserIDResolver interface {
	ResolveUserIDByProfileID(ctx context.Context, profileID primitive.ObjectID) (primitive.ObjectID, error)
}

// NewHandler constructs a Handler backed by the given Service.
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// SetDoctorUserIDResolver wires the optional profile-id → user-id resolver. It
// is called from bootstrap after construction.
func (h *Handler) SetDoctorUserIDResolver(r DoctorUserIDResolver) {
	h.doctorResolver = r
}

// resolveDoctorID translates a doctor PROFILE id into the USER id appointments
// are stored under. When no resolver is configured, or the supplied id cannot
// be resolved (e.g. it is already a user id, or the profile is missing), the
// original value is returned unchanged so existing behavior is preserved.
func (h *Handler) resolveDoctorID(ctx context.Context, doctorID string) string {
	if h.doctorResolver == nil || doctorID == "" {
		return doctorID
	}
	profileOID, err := primitive.ObjectIDFromHex(doctorID)
	if err != nil {
		return doctorID
	}
	userID, err := h.doctorResolver.ResolveUserIDByProfileID(ctx, profileOID)
	if err != nil {
		// Not-found (or any lookup error): fall back to the supplied id rather
		// than hard-failing, so callers that already pass a user id keep working.
		return doctorID
	}
	return userID.Hex()
}

// RegisterRoutes wires the handler's methods onto the provided Echo group.
//
// Authentication/authorization middleware is applied by the caller (e.g. in
// bootstrap) when attaching the group, so this method only declares the
// route-to-handler mapping itself.
func (h *Handler) RegisterRoutes(g *echo.Group) {
	// Appointment endpoints.
	g.POST("/book", h.BookAppointment)
	g.POST("/cancel", h.CancelAppointment)
	g.POST("/reschedule", h.RescheduleAppointment)
	g.POST("/check-in", h.CheckIn)
	g.POST("/confirm", h.ConfirmAppointment)
	g.POST("/call", h.CallPatient)

	// Reception queue control endpoints.
	g.POST("/start-visit", h.StartVisit)
	g.POST("/complete-visit", h.CompleteVisit)
	g.POST("/no-show", h.MarkNoShow)

	// Calendar / timeline endpoints.
	g.GET("/monthly/:doctorID/:year/:month", h.GetMonthlyAppointments)
	g.GET("/timeline/:doctorID/:date", h.GetDailyTimeline)

	// Waiting list endpoints.
	g.POST("/waiting-list", h.JoinWaitingList)
	g.GET("/waiting-list/:doctorID/:date", h.GetWaitingList)
	g.POST("/waiting-list/:id/convert", h.ConvertWaitingList)
	g.POST("/waiting-list/:id/offer", h.OfferSlot)
	g.PATCH("/waiting-list/:id/priority", h.UpdatePriority)
}

// ---------------------------------------------------------------------------
// Appointment handlers
// ---------------------------------------------------------------------------

// BookAppointment handles POST /book and returns HTTP 201 on success.
//
// @Summary      Book an appointment
// @Description  Create a new appointment for a patient with a doctor
// @Tags         bookings
// @Accept       json
// @Produce      json
// @Param        body body booking.BookAppointmentRequest true "Booking payload"
// @Success      201 {object} booking.AppointmentResponse
// @Failure      400 {object} errormap.APIError
// @Failure      409 {object} errormap.APIError
// @Security     ApiKeyAuth
// @Router       /bookings/book [post]
func (h *Handler) BookAppointment(c echo.Context) error {
	var req BookAppointmentRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	// Patients send the doctor PROFILE id; translate it to the USER id the
	// schedule/booking domains key on.
	req.DoctorID = h.resolveDoctorID(c.Request().Context(), req.DoctorID)
	req.PaymentType = paymentTypeForCallerRole(requestctx.GetRole(c))

	// Patients always book as themselves — ignore any client-supplied
	// patient_id (stale localStorage / tampering) and bind to the JWT subject.
	if requestctx.GetRole(c) == string(user.RolePatient) {
		if uid := requestctx.GetUserID(c); uid != "" {
			req.PatientID = uid
		}
	}

	resp, err := h.service.BookAppointment(c.Request().Context(), req)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusCreated, resp)
}

// CancelAppointment handles POST /cancel and returns HTTP 200 with the updated
// appointment on success.
//
// @Summary      Cancel an appointment
// @Description  Cancel an existing appointment (subject to refund policy)
// @Tags         bookings
// @Accept       json
// @Produce      json
// @Param        body body booking.CancelAppointmentRequest true "Cancel payload"
// @Success      200 {object} booking.AppointmentResponse
// @Failure      400 {object} errormap.APIError
// @Failure      403 {object} errormap.APIError
// @Failure      404 {object} errormap.APIError
// @Failure      409 {object} errormap.APIError
// @Security     ApiKeyAuth
// @Router       /bookings/cancel [post]
func (h *Handler) CancelAppointment(c echo.Context) error {
	var req CancelAppointmentRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.CancelAppointment(c.Request().Context(), req)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// RescheduleAppointment handles POST /reschedule and returns HTTP 200 with the
// updated appointment on success.
//
// @Summary      Reschedule an appointment
// @Description  Move an existing appointment into a new slot
// @Tags         bookings
// @Accept       json
// @Produce      json
// @Param        body body booking.RescheduleAppointmentRequest true "Reschedule payload"
// @Success      200 {object} booking.AppointmentResponse
// @Failure      400 {object} errormap.APIError
// @Failure      404 {object} errormap.APIError
// @Failure      409 {object} errormap.APIError
// @Security     ApiKeyAuth
// @Router       /bookings/reschedule [post]
func (h *Handler) RescheduleAppointment(c echo.Context) error {
	var req RescheduleAppointmentRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.RescheduleAppointment(c.Request().Context(), req)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// CheckIn handles POST /check-in and returns HTTP 200 with the updated
// appointment on success. It marks a CONFIRMED appointment as CHECKED_IN
// (patient arrived, waiting hall).
//
// @Summary      Check in an appointment
// @Description  Mark a CONFIRMED appointment as CHECKED_IN (patient in waiting hall)
// @Tags         bookings
// @Accept       json
// @Produce      json
// @Param        body body booking.CheckInRequest true "Check-in payload"
// @Success      200 {object} booking.AppointmentResponse
// @Failure      400 {object} errormap.APIError
// @Failure      404 {object} errormap.APIError
// @Failure      409 {object} errormap.APIError
// @Security     ApiKeyAuth
// @Router       /bookings/check-in [post]
func (h *Handler) CheckIn(c echo.Context) error {
	var req CheckInRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.CheckIn(c.Request().Context(), req.ID)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// ConfirmAppointment handles POST /confirm. PENDING → CONFIRMED + SMS.
//
// @Summary      Confirm an appointment
// @Description  Reception confirms a PENDING booking; patient is notified by SMS
// @Tags         bookings
// @Accept       json
// @Produce      json
// @Param        body body booking.CheckInRequest true "Confirm payload"
// @Success      200 {object} booking.AppointmentResponse
// @Failure      400 {object} errormap.APIError
// @Failure      404 {object} errormap.APIError
// @Failure      409 {object} errormap.APIError
// @Security     ApiKeyAuth
// @Router       /bookings/confirm [post]
func (h *Handler) ConfirmAppointment(c echo.Context) error {
	var req CheckInRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.ConfirmAppointment(c.Request().Context(), req.ID)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// CallPatient handles POST /call. CHECKED_IN → CALLED (patient's turn).
//
// @Summary      Call / admit a patient
// @Description  Mark a CHECKED_IN appointment as CALLED (patient called into room)
// @Tags         bookings
// @Accept       json
// @Produce      json
// @Param        body body booking.CheckInRequest true "Call payload"
// @Success      200 {object} booking.AppointmentResponse
// @Failure      400 {object} errormap.APIError
// @Failure      404 {object} errormap.APIError
// @Failure      409 {object} errormap.APIError
// @Security     ApiKeyAuth
// @Router       /bookings/call [post]
func (h *Handler) CallPatient(c echo.Context) error {
	var req CheckInRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.CallPatient(c.Request().Context(), req.ID)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// ---------------------------------------------------------------------------
// Waiting list handlers
// ---------------------------------------------------------------------------

// JoinWaitingList handles POST /waiting-list and returns HTTP 201 on success.
//
// @Summary      Join the waiting list
// @Description  Add a patient to the waiting list for a doctor on a given date
// @Tags         bookings
// @Accept       json
// @Produce      json
// @Param        body body booking.JoinWaitingListRequest true "Waiting list payload"
// @Success      201 {object} booking.WaitingListResponse
// @Failure      400 {object} errormap.APIError
// @Security     ApiKeyAuth
// @Router       /bookings/waiting-list [post]
func (h *Handler) JoinWaitingList(c echo.Context) error {
	var req JoinWaitingListRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	// Patients send the doctor PROFILE id; translate it to the USER id.
	req.DoctorID = h.resolveDoctorID(c.Request().Context(), req.DoctorID)

	resp, err := h.service.JoinWaitingList(c.Request().Context(), req)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusCreated, resp)
}

// GetWaitingList handles GET /waiting-list/:doctorID/:date and returns the FIFO
// waiting list for that doctor on that calendar day (YYYY-MM-DD).
//
// @Summary      Get the waiting list
// @Description  Return the FIFO waiting list for a doctor on a date
// @Tags         bookings
// @Produce      json
// @Param        doctorID path string true "Doctor user id (hex ObjectID)"
// @Param        date     path string true "Calendar day (YYYY-MM-DD)"
// @Success      200 {array} booking.WaitingListResponse
// @Failure      400 {object} errormap.APIError
// @Security     ApiKeyAuth
// @Router       /bookings/waiting-list/{doctorID}/{date} [get]
func (h *Handler) GetWaitingList(c echo.Context) error {
	doctorID := c.Param("doctorID")
	if _, err := primitive.ObjectIDFromHex(doctorID); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid doctor id")
	}
	date := c.Param("date")
	if _, err := time.Parse("2006-01-02", date); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid date (expected YYYY-MM-DD)")
	}

	resp, err := h.service.GetWaitingList(c.Request().Context(), doctorID, date)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// ConvertWaitingList handles POST /waiting-list/:id/convert and returns HTTP 201
// with the newly created appointment on success. It turns a waiting-list entry
// into a real CONFIRMED appointment in the doctor's first free slot.
//
// @Summary      Convert a waiting-list entry into an appointment
// @Description  Turn a waiting-list entry into a confirmed appointment in the first free slot
// @Tags         bookings
// @Produce      json
// @Param        id path string true "Waiting-list entry id (hex ObjectID)"
// @Success      201 {object} booking.AppointmentResponse
// @Failure      400 {object} errormap.APIError
// @Failure      404 {object} errormap.APIError
// @Failure      409 {object} errormap.APIError
// @Security     ApiKeyAuth
// @Router       /bookings/waiting-list/{id}/convert [post]
func (h *Handler) ConvertWaitingList(c echo.Context) error {
	entryID := c.Param("id")
	if _, err := primitive.ObjectIDFromHex(entryID); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid waiting list entry id")
	}

	resp, err := h.service.ConvertWaitingEntry(c.Request().Context(), entryID)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusCreated, resp)
}

// ---------------------------------------------------------------------------
// Reception queue control handlers
// ---------------------------------------------------------------------------

// StartVisit handles POST /start-visit. It transitions a CALLED
// appointment to IN_PROGRESS, used by the doctor to start the visit.
func (h *Handler) StartVisit(c echo.Context) error {
	var req CheckInRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	if err := h.service.StartVisit(c.Request().Context(), req.ID); err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "IN_PROGRESS"})
}

// CompleteVisit handles POST /complete-visit. It transitions an IN_PROGRESS
// appointment to COMPLETED.
func (h *Handler) CompleteVisit(c echo.Context) error {
	var req CheckInRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	if err := h.service.CompleteVisit(c.Request().Context(), req.ID); err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "COMPLETED"})
}

// MarkNoShow handles POST /no-show. It transitions a PENDING/CONFIRMED/
// CHECKED_IN appointment to NO_SHOW and triggers the waiting-list engine.
func (h *Handler) MarkNoShow(c echo.Context) error {
	var req CheckInRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	if err := h.service.MarkNoShow(c.Request().Context(), req.ID); err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "NO_SHOW"})
}

// ---------------------------------------------------------------------------
// Calendar / timeline handlers
// ---------------------------------------------------------------------------

// GetMonthlyAppointments handles GET /monthly/:doctorID/:year/:month and
// returns the per-day status breakdown for the given month.
func (h *Handler) GetMonthlyAppointments(c echo.Context) error {
	doctorID := c.Param("doctorID")
	if _, err := primitive.ObjectIDFromHex(doctorID); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid doctor id")
	}
	year, err := strconv.Atoi(c.Param("year"))
	if err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid year")
	}
	month, err := strconv.Atoi(c.Param("month"))
	if err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid month")
	}

	resp, err := h.service.GetMonthlyAppointments(c.Request().Context(), doctorID, year, month)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// GetDailyTimeline handles GET /timeline/:doctorID/:date and returns the
// doctor's shifts and appointments for that calendar day (YYYY-MM-DD).
func (h *Handler) GetDailyTimeline(c echo.Context) error {
	doctorID := c.Param("doctorID")
	if _, err := primitive.ObjectIDFromHex(doctorID); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid doctor id")
	}
	dateStr := c.Param("date")
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid date (expected YYYY-MM-DD)")
	}

	resp, err := h.service.GetDailyTimeline(c.Request().Context(), doctorID, date)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// ---------------------------------------------------------------------------
// Waiting list: reception handlers
// ---------------------------------------------------------------------------

// OfferSlot handles POST /waiting-list/:id/offer. It books a CONFIRMED
// appointment for a waiting-list entry at the supplied slot and returns the new
// appointment with HTTP 201.
func (h *Handler) OfferSlot(c echo.Context) error {
	var req OfferSlotRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	// Prefer the path param id when the body omits entry_id, for convenience.
	if req.EntryID == "" {
		req.EntryID = c.Param("id")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.OfferSlotToWaitingEntry(c.Request().Context(), req.EntryID, req.StartTime, req.EndTime)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusCreated, resp)
}

// UpdatePriority handles PATCH /waiting-list/:id/priority. It sets the triage
// priority of a waiting-list entry to NORMAL or URGENT.
func (h *Handler) UpdatePriority(c echo.Context) error {
	var req UpdateWaitingPriorityRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if req.ID == "" {
		req.ID = c.Param("id")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	if err := h.service.UpdateWaitingPriority(c.Request().Context(), req.ID, req.Priority); err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

// paymentTypeForCallerRole derives the expected payment channel from the
// authenticated user's role. Staff booking on behalf of a patient implies an
// in-clinic (cash/card at reception) payment; patients booking for themselves
// pay online via the wallet when they call /finance/pay.
func paymentTypeForCallerRole(role string) PaymentType {
	switch role {
	case string(user.RoleReceptionist), string(user.RoleDoctor), string(user.RoleAdmin):
		return PaymentTypeInPerson
	default:
		return ""
	}
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

// mapServiceError converts a service-layer error into the appropriate HTTP
// response, keeping the errormap JSON shape uniform across the API. It is the
// single point where domain errors are mapped to status codes.
func mapServiceError(c echo.Context, err error) error {
	switch {
	case errors.Is(err, ErrAppointmentNotFound), errors.Is(err, ErrWaitingEntryNotFound):
		return writeError(c, errormap.ErrNotFound, err.Error())
	case errors.Is(err, ErrSlotConflict), errors.Is(err, ErrAlreadyCancelled), errors.Is(err, ErrNotCheckable):
		return writeError(c, errormap.ErrConflict, err.Error())
	case errors.Is(err, ErrCancellationTooLate):
		return writeError(c, errormap.ErrForbidden,
			"لغو این نوبت امکان‌پذیر نیست؛ کمتر از ۳ ساعت به زمان ویزیت مانده است. طبق قوانین، لغو فقط تا ۳ ساعت قبل از نوبت مجاز است.")
	case errors.Is(err, ErrPatientNotFound):
		// Stale JWT / wiped user — force client re-auth (Axios interceptor
		// clears the session on 401).
		return writeError(c, errormap.ErrUnauthorized, "حساب بیمار یافت نشد؛ دوباره وارد شوید")
	case errors.Is(err, ErrInvalidObjectID), errors.Is(err, ErrSlotInvalid),
		errors.Is(err, ErrSlotInThePast),
		errors.Is(err, ErrDoctorOnLeave), errors.Is(err, ErrOutsideShift),
		errors.Is(err, ErrInvalidPriority):
		return writeError(c, errormap.ErrBadRequest, err.Error())
	default:
		// Anything else is treated as an internal failure; log it for
		// diagnosis but do not leak internals to the client.
		logger.Get().Error("booking handler: unexpected service error", "error", err)
		return writeError(c, errormap.ErrInternal, err.Error())
	}
}

// writeError serializes an *errormap.APIError into the response, attaching an
// optional diagnostic detail to the Debug field. A fresh APIError is created
// each time so the package-level sentinels are never mutated concurrently.
func writeError(c echo.Context, apiErr *errormap.APIError, detail string) error {
	return c.JSON(apiErr.Code, errormap.New(apiErr.Code, apiErr.Message, detail))
}
