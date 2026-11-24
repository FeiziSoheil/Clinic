package ehr

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"clinic-api/internal/user"
	"clinic-api/pkg/errormap"
	"clinic-api/pkg/logger"
	"clinic-api/pkg/requestctx"
)

// Handler exposes the EHR domain over HTTP. Each method maps a route to a
// Service call and translates the result/error into the consistent JSON shape
// defined by the errormap package.
//
// The handler is intentionally thin: all business rules (visibility of private
// notes, patient/doctor authorization) live in the service, so this file only
// concerns itself with request binding, validation, path parameter parsing,
// reading the caller's identity from the request context and HTTP status
// selection.
type Handler struct {
	service *Service
}

// NewHandler constructs a Handler backed by the given Service.
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// RegisterRoutes wires the handler's methods onto the provided Echo group.
//
// Authentication/authorization middleware is applied by the caller (e.g. in
// bootstrap) when attaching the group, so this method only declares the
// route-to-handler mapping itself.
func (h *Handler) RegisterRoutes(g *echo.Group) {
	// Doctor's read-only patient directory (one aggregated row per patient the
	// doctor has ever seen). The caller's identity ("me") is resolved from the
	// JWT inside the handler.
	g.GET("/doctor/patients", h.ListDoctorPatients)

	g.POST("/medical-records", h.CreateMedicalRecord)
	g.GET("/medical-records/:id", h.GetMedicalRecord)
	g.GET("/medical-records/patient/:patientID", h.ListByPatient)
	g.GET("/medical-records/doctor/:doctorID", h.ListByDoctor)
	g.GET("/medical-records/appointment/:appointmentID", h.ListByAppointment)

	// Triage note endpoints.
	g.POST("/triage", h.CreateTriageNote)
	g.GET("/triage/:id", h.GetTriageNote)
	g.GET("/triage/patient/:patientID", h.ListTriageByPatient)
	g.GET("/triage/appointment/:appointmentID", h.ListTriageByAppointment)
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// CreateMedicalRecord handles POST /medical-records and returns HTTP 201 on
// success. Doctor-role enforcement is expected at the middleware layer; the
// handler still validates the payload.
func (h *Handler) CreateMedicalRecord(c echo.Context) error {
	var req CreateMedicalRecordRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.CreateMedicalRecord(c.Request().Context(), &req)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusCreated, resp)
}

// GetMedicalRecord handles GET /medical-records/:id. The requester's identity
// (user id + role) is read from the request context and forwarded to the
// service, which applies the differential visibility rules (full view for the
// authoring doctor/admin, stripped view for the patient, forbidden otherwise).
func (h *Handler) GetMedicalRecord(c echo.Context) error {
	id := c.Param("id")
	requesterID := requestctx.GetUserID(c)
	requesterRole := requestctx.GetRole(c)

	resp, err := h.service.GetMedicalRecord(c.Request().Context(), id, requesterID, requesterRole)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// ListByPatient handles GET /medical-records/patient/:patientID. It branches on
// the requester's role: a patient sees their own stripped records, while a
// doctor/admin sees the full records (including PrivateNotes). Both code paths
// serialize cleanly to JSON, so c.JSON works for either return type.
func (h *Handler) ListByPatient(c echo.Context) error {
	patientID := c.Param("patientID")
	requesterID := requestctx.GetUserID(c)
	requesterRole := requestctx.GetRole(c)

	switch requestctx.GetRole(c) {
	case string(user.RolePatient):
		resp, err := h.service.ListByPatientForPatient(c.Request().Context(), patientID, requesterID, requesterRole)
		if err != nil {
			return mapServiceError(c, err)
		}
		return c.JSON(http.StatusOK, resp)
	case string(user.RoleDoctor), string(user.RoleAdmin):
		resp, err := h.service.ListByPatientForDoctor(c.Request().Context(), patientID, requesterRole)
		if err != nil {
			return mapServiceError(c, err)
		}
		return c.JSON(http.StatusOK, resp)
	default:
		return writeError(c, errormap.ErrForbidden, "role not permitted to view patient records")
	}
}

// ListByDoctor handles GET /medical-records/doctor/:doctorID and returns every
// record authored by the given doctor, including PrivateNotes.
func (h *Handler) ListByDoctor(c echo.Context) error {
	doctorID := c.Param("doctorID")

	resp, err := h.service.ListByDoctor(c.Request().Context(), doctorID)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// ListByAppointment handles GET /medical-records/appointment/:appointmentID and
// returns every record tied to the appointment, with PrivateNotes stripped for
// safety regardless of requester.
func (h *Handler) ListByAppointment(c echo.Context) error {
	appointmentID := c.Param("appointmentID")
	requesterID := requestctx.GetUserID(c)
	requesterRole := requestctx.GetRole(c)

	resp, err := h.service.ListByAppointment(c.Request().Context(), appointmentID, requesterID, requesterRole)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// ListDoctorPatients handles GET /doctor/patients and returns the calling
// doctor's read-only patient directory: a bare JSON array of per-patient
// aggregated rows (sorted by last visit, most recent first). The caller's
// identity is resolved from the JWT context; the service enforces the
// doctor-only authorization.
func (h *Handler) ListDoctorPatients(c echo.Context) error {
	// requestctx.GetUserID returns the caller's id as a hex string from the
	// JWT; parse it into an ObjectID before forwarding to the service
	// (mirroring how the other handlers convert hex ids at the boundary).
	requesterIDHex := requestctx.GetUserID(c)
	requesterID, err := primitive.ObjectIDFromHex(requesterIDHex)
	if err != nil {
		return mapServiceError(c, ErrInvalidObjectID)
	}
	requesterRole := requestctx.GetRole(c)

	resp, err := h.service.ListDoctorPatients(c.Request().Context(), requesterID, requesterRole)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// ---------------------------------------------------------------------------
// Triage note handlers
// ---------------------------------------------------------------------------

// CreateTriageNote handles POST /triage and returns HTTP 201 on success.
func (h *Handler) CreateTriageNote(c echo.Context) error {
	var req CreateTriageNoteRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.CreateTriageNote(c.Request().Context(), req)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusCreated, resp)
}

// GetTriageNote handles GET /triage/:id.
func (h *Handler) GetTriageNote(c echo.Context) error {
	id := c.Param("id")

	resp, err := h.service.GetTriageNote(c.Request().Context(), id)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// ListTriageByPatient handles GET /triage/patient/:patientID and returns the
// patient's triage history, newest first.
func (h *Handler) ListTriageByPatient(c echo.Context) error {
	patientID := c.Param("patientID")

	resp, err := h.service.ListTriageByPatient(c.Request().Context(), patientID)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// ListTriageByAppointment handles GET /triage/appointment/:appointmentID and
// returns every triage note tied to the appointment, newest first.
func (h *Handler) ListTriageByAppointment(c echo.Context) error {
	appointmentID := c.Param("appointmentID")

	resp, err := h.service.ListTriageByAppointment(c.Request().Context(), appointmentID)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

// mapServiceError converts a service-layer error into the appropriate HTTP
// response, keeping the errormap JSON shape uniform across the API. It is the
// single point where domain errors are mapped to status codes.
func mapServiceError(c echo.Context, err error) error {
	switch {
	case errors.Is(err, ErrForbidden):
		return writeError(c, errormap.ErrForbidden, err.Error())
	case errors.Is(err, ErrMedicalRecordNotFound), errors.Is(err, ErrTriageNoteNotFound):
		return writeError(c, errormap.ErrNotFound, err.Error())
	case errors.Is(err, ErrInvalidObjectID), errors.Is(err, ErrEmptyRecord):
		return writeError(c, errormap.ErrBadRequest, err.Error())
	default:
		// Anything else is treated as an internal failure; log it for
		// diagnosis but do not leak internals to the client.
		logger.Get().Error("ehr handler: unexpected service error", "error", err)
		return writeError(c, errormap.ErrInternal, err.Error())
	}
}

// writeError serializes an *errormap.APIError into the response, attaching an
// optional diagnostic detail to the Debug field. A fresh APIError is created
// each time so the package-level sentinels are never mutated concurrently.
func writeError(c echo.Context, apiErr *errormap.APIError, detail string) error {
	return c.JSON(apiErr.Code, errormap.New(apiErr.Code, apiErr.Message, detail))
}
