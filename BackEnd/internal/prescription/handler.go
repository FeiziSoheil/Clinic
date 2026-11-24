package prescription

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"

	"clinic-api/internal/user"
	"clinic-api/pkg/errormap"
	"clinic-api/pkg/logger"
	"clinic-api/pkg/requestctx"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Handler exposes the prescription domain over HTTP. Each method maps a route
// to a Service call and translates the result/error into the consistent JSON
// shape defined by the errormap package.
//
// The handler is intentionally thin: all business rules (visibility of notes,
// patient/doctor authorization, drug search) live in the service, so this file
// only concerns itself with request binding, validation, path parameter
// parsing, reading the caller's identity from the request context and HTTP
// status selection.
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
// route-to-handler mapping itself. The group is mounted under
// /api/v1/prescriptions, so the routes below are relative to that prefix.
func (h *Handler) RegisterRoutes(g *echo.Group) {
	g.POST("", h.create)
	g.GET("/:id", h.getByID)
	g.GET("/patient/:patientId", h.listByPatient)
	g.GET("/doctor/:doctorId", h.listByDoctor)
	g.PATCH("/:id/status", h.updateStatus)
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// create handles POST /prescriptions and returns HTTP 201 on success. The
// authoring doctor's identity is taken from the JWT context; only a doctor or
// admin may issue a prescription (enforced here, mirroring how the EHR domain
// keeps role checks close to the handler).
func (h *Handler) create(c echo.Context) error {
	requesterRole := requestctx.GetRole(c)
	if requesterRole != string(user.RoleDoctor) && requesterRole != string(user.RoleAdmin) {
		return writeError(c, errormap.ErrForbidden, "only doctors or admins may issue prescriptions")
	}

	var req CreatePrescriptionRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	doctorID, err := primitive.ObjectIDFromHex(requestctx.GetUserID(c))
	if err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid requester identity")
	}

	resp, err := h.service.Create(c.Request().Context(), req, doctorID)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusCreated, resp)
}

// getByID handles GET /prescriptions/:id. The requester's identity (user id +
// role) is read from the request context and forwarded to the service, which
// applies the differential visibility rules (full view for the authoring
// doctor/admin, stripped view for the patient, forbidden otherwise).
func (h *Handler) getByID(c echo.Context) error {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		return mapServiceError(c, ErrInvalidObjectID)
	}

	requesterID, requesterRole := readIdentity(c)

	resp, err := h.service.GetByID(c.Request().Context(), id, requesterID, requesterRole)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// listByPatient handles GET /prescriptions/patient/:patientId. It branches on
// the requester's role via the service: a patient sees their own stripped
// prescriptions, while a doctor/admin sees the full set (including Notes).
func (h *Handler) listByPatient(c echo.Context) error {
	patientID, err := primitive.ObjectIDFromHex(c.Param("patientId"))
	if err != nil {
		return mapServiceError(c, ErrInvalidObjectID)
	}

	requesterID, requesterRole := readIdentity(c)

	resp, err := h.service.ListByPatient(c.Request().Context(), patientID, requesterID, requesterRole)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// listByDoctor handles GET /prescriptions/doctor/:doctorId and returns every
// prescription issued by the given doctor, including Notes.
func (h *Handler) listByDoctor(c echo.Context) error {
	doctorID, err := primitive.ObjectIDFromHex(c.Param("doctorId"))
	if err != nil {
		return mapServiceError(c, ErrInvalidObjectID)
	}

	resp, err := h.service.ListByDoctor(c.Request().Context(), doctorID)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// updateStatus handles PATCH /prescriptions/:id/status. Only the authoring
// doctor or an admin may change the status (enforced in the service).
func (h *Handler) updateStatus(c echo.Context) error {
	requesterRole := requestctx.GetRole(c)
	if requesterRole != string(user.RoleDoctor) && requesterRole != string(user.RoleAdmin) {
		return writeError(c, errormap.ErrForbidden, "only doctors or admins may change a prescription's status")
	}

	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		return mapServiceError(c, ErrInvalidObjectID)
	}

	var req UpdatePrescriptionStatusRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	requesterID, _ := readIdentity(c)

	resp, err := h.service.UpdateStatus(c.Request().Context(), id, requesterID, requesterRole, req.Status)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// readIdentity pulls the requester's user id (parsed into an ObjectID; the nil
// ObjectID when absent/invalid) and role out of the Echo context. It keeps the
// handlers terse.
func readIdentity(c echo.Context) (primitive.ObjectID, string) {
	role := requestctx.GetRole(c)
	oid, err := primitive.ObjectIDFromHex(requestctx.GetUserID(c))
	if err != nil {
		return primitive.NilObjectID, role
	}
	return oid, role
}

// mapServiceError converts a service-layer error into the appropriate HTTP
// response, keeping the errormap JSON shape uniform across the API. It is the
// single point where domain errors are mapped to status codes.
func mapServiceError(c echo.Context, err error) error {
	switch {
	case errors.Is(err, ErrForbidden):
		return writeError(c, errormap.ErrForbidden, err.Error())
	case errors.Is(err, ErrNotFound):
		return writeError(c, errormap.ErrNotFound, err.Error())
	case errors.Is(err, ErrInvalidObjectID), errors.Is(err, ErrInvalidRequest):
		return writeError(c, errormap.ErrBadRequest, err.Error())
	default:
		// Anything else is treated as an internal failure; log it for
		// diagnosis but do not leak internals to the client.
		logger.Get().Error("prescription handler: unexpected service error", "error", err)
		return writeError(c, errormap.ErrInternal, err.Error())
	}
}

// writeError serializes an *errormap.APIError into the response, attaching an
// optional diagnostic detail to the Debug field. A fresh APIError is created
// each time so the package-level sentinels are never mutated concurrently.
func writeError(c echo.Context, apiErr *errormap.APIError, detail string) error {
	return c.JSON(apiErr.Code, errormap.New(apiErr.Code, apiErr.Message, detail))
}
