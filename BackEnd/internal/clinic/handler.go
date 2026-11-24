package clinic

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"clinic-api/pkg/errormap"
	"clinic-api/pkg/logger"
	"clinic-api/pkg/requestctx"
)

// Handler exposes the clinic domain over HTTP. Each method maps a route to a
// Service call and translates the result/error into the consistent JSON shape
// defined by the errormap package.
//
// The handler is intentionally thin: all business rules live in the service,
// so this file only concerns itself with request binding, validation, path
// parameter parsing and HTTP status selection.
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
	// Branch endpoints.
	g.POST("/branches", h.CreateBranch)
	g.GET("/branches", h.ListBranches)
	g.GET("/branches/:id", h.GetBranch)
	g.PUT("/branches/:id", h.UpdateBranch)
	g.DELETE("/branches/:id", h.DeleteBranch)

	// Doctor profile endpoints.
	g.POST("/doctors", h.CreateDoctorProfile)
	g.GET("/doctors", h.ListDoctorProfiles)
	g.GET("/doctors/:id", h.GetDoctorProfile)
	g.PUT("/doctors/:id", h.UpdateDoctorProfile)
	g.DELETE("/doctors/:id", h.DeleteDoctorProfile)
	g.GET("/doctors/by-user/:user_id", h.GetDoctorProfileByUserID)
}

// ---------------------------------------------------------------------------
// Branch handlers
// ---------------------------------------------------------------------------

// CreateBranch handles POST /branches and returns HTTP 201 on success.
func (h *Handler) CreateBranch(c echo.Context) error {
	var req CreateBranchRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.CreateBranch(c.Request().Context(), req)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusCreated, resp)
}

// GetBranch handles GET /branches/:id.
func (h *Handler) GetBranch(c echo.Context) error {
	id := c.Param("id")
	if _, err := primitive.ObjectIDFromHex(id); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid id")
	}

	resp, err := h.service.GetBranch(c.Request().Context(), id)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// ListBranches handles GET /branches.
func (h *Handler) ListBranches(c echo.Context) error {
	resp, err := h.service.ListBranches(c.Request().Context())
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// UpdateBranch handles PUT /branches/:id.
func (h *Handler) UpdateBranch(c echo.Context) error {
	id := c.Param("id")
	if _, err := primitive.ObjectIDFromHex(id); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid id")
	}

	var req UpdateBranchRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.UpdateBranch(c.Request().Context(), id, req)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// DeleteBranch handles DELETE /branches/:id and returns HTTP 204 on success.
func (h *Handler) DeleteBranch(c echo.Context) error {
	id := c.Param("id")
	if _, err := primitive.ObjectIDFromHex(id); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid id")
	}

	if err := h.service.DeleteBranch(c.Request().Context(), id); err != nil {
		return mapServiceError(c, err)
	}

	return c.NoContent(http.StatusNoContent)
}

// ---------------------------------------------------------------------------
// DoctorProfile handlers
// ---------------------------------------------------------------------------

// CreateDoctorProfile handles POST /doctors and returns HTTP 201 on success.
func (h *Handler) CreateDoctorProfile(c echo.Context) error {
	var req CreateDoctorProfileRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.CreateDoctorProfile(c.Request().Context(), req)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusCreated, resp)
}

// GetDoctorProfile handles GET /doctors/:id.
func (h *Handler) GetDoctorProfile(c echo.Context) error {
	id := c.Param("id")
	if _, err := primitive.ObjectIDFromHex(id); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid id")
	}

	resp, err := h.service.GetDoctorProfile(c.Request().Context(), id)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// GetDoctorProfileByUserID handles GET /doctors/by-user/:user_id.
func (h *Handler) GetDoctorProfileByUserID(c echo.Context) error {
	userID := c.Param("user_id")
	if _, err := primitive.ObjectIDFromHex(userID); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid id")
	}

	resp, err := h.service.GetDoctorProfileByUserID(c.Request().Context(), userID)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// GetMyDoctorProfile handles GET /v1/doctor/profile. It returns the signed-in
// doctor's OWN profile, resolving the owner from the JWT via requestctx (no id
// is accepted from the client, so a doctor can only ever read their own
// profile).
func (h *Handler) GetMyDoctorProfile(c echo.Context) error {
	userID := requestctx.GetUserID(c)
	if _, err := primitive.ObjectIDFromHex(userID); err != nil {
		return writeError(c, errormap.ErrUnauthorized, "missing authenticated user id")
	}

	resp, err := h.service.GetDoctorProfileByUserID(c.Request().Context(), userID)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// UpdateMyDoctorProfile handles PUT /v1/doctor/profile. It lets a signed-in
// DOCTOR update their OWN pricing settings (visit fee + default visit
// duration). The owner is resolved from the JWT via requestctx, so the doctor
// can only ever mutate their own profile.
func (h *Handler) UpdateMyDoctorProfile(c echo.Context) error {
	userID := requestctx.GetUserID(c)
	if _, err := primitive.ObjectIDFromHex(userID); err != nil {
		return writeError(c, errormap.ErrUnauthorized, "missing authenticated user id")
	}

	var req UpdateMyProfileRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.UpdateMyProfile(c.Request().Context(), userID, req)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// ListDoctorProfiles handles GET /doctors.
func (h *Handler) ListDoctorProfiles(c echo.Context) error {
	resp, err := h.service.ListDoctorProfiles(c.Request().Context())
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// UpdateDoctorProfile handles PUT /doctors/:id.
func (h *Handler) UpdateDoctorProfile(c echo.Context) error {
	id := c.Param("id")
	if _, err := primitive.ObjectIDFromHex(id); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid id")
	}

	var req UpdateDoctorProfileRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.UpdateDoctorProfile(c.Request().Context(), id, req)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// DeleteDoctorProfile handles DELETE /doctors/:id and returns HTTP 204 on success.
func (h *Handler) DeleteDoctorProfile(c echo.Context) error {
	id := c.Param("id")
	if _, err := primitive.ObjectIDFromHex(id); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid id")
	}

	if err := h.service.DeleteDoctorProfile(c.Request().Context(), id); err != nil {
		return mapServiceError(c, err)
	}

	return c.NoContent(http.StatusNoContent)
}

// mapServiceError converts a service-layer error into the appropriate HTTP
// response, keeping the errormap JSON shape uniform across the API. It is the
// single point where domain errors are mapped to status codes.
func mapServiceError(c echo.Context, err error) error {
	switch {
	case errors.Is(err, ErrBranchNotFound), errors.Is(err, ErrDoctorProfileNotFound):
		return writeError(c, errormap.ErrNotFound, err.Error())
	case errors.Is(err, ErrDoctorProfileExists):
		return writeError(c, errormap.ErrConflict, err.Error())
	case errors.Is(err, ErrInvalidObjectID):
		return writeError(c, errormap.ErrBadRequest, err.Error())
	default:
		// Anything else is treated as an internal failure; log it for
		// diagnosis but do not leak internals to the client.
		logger.Get().Error("clinic handler: unexpected service error", "error", err)
		return writeError(c, errormap.ErrInternal, err.Error())
	}
}

// writeError serializes an *errormap.APIError into the response, attaching an
// optional diagnostic detail to the Debug field. A fresh APIError is created
// each time so the package-level sentinels are never mutated concurrently.
func writeError(c echo.Context, apiErr *errormap.APIError, detail string) error {
	return c.JSON(apiErr.Code, errormap.New(apiErr.Code, apiErr.Message, detail))
}
