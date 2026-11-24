package schedule

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"clinic-api/pkg/errormap"
	"clinic-api/pkg/logger"
)

// Handler exposes the schedule domain over HTTP. Each method maps a route to a
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
	// Shift endpoints.
	g.POST("/shifts", h.CreateShift)
	g.POST("/shifts/recurring", h.CreateRecurringShifts)
	g.GET("/shifts", h.ListShifts)
	g.GET("/shifts/:id", h.GetShift)
	g.PUT("/shifts/:id", h.UpdateShift)
	g.DELETE("/shifts/:id", h.DeleteShift)

	// Leave endpoints.
	g.POST("/leaves", h.CreateLeave)
	g.GET("/leaves", h.ListLeaves)
	g.GET("/leaves/:id", h.GetLeave)
	g.DELETE("/leaves/:id", h.DeleteLeave)

	// Time block endpoints.
	g.POST("/time-blocks", h.CreateTimeBlock)
	g.GET("/time-blocks", h.ListTimeBlocks)
	g.DELETE("/time-blocks/:id", h.DeleteTimeBlock)
}

// ---------------------------------------------------------------------------
// Shift handlers
// ---------------------------------------------------------------------------

// CreateShift handles POST /shifts and returns HTTP 201 on success.
func (h *Handler) CreateShift(c echo.Context) error {
	var req CreateShiftRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.CreateShift(c.Request().Context(), req)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusCreated, resp)
}

// CreateRecurringShifts handles POST /shifts/recurring and returns HTTP 201
// with the list of created shifts on success.
func (h *Handler) CreateRecurringShifts(c echo.Context) error {
	var req CreateRecurringShiftRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.CreateRecurringShifts(c.Request().Context(), req)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusCreated, resp)
}

// GetShift handles GET /shifts/:id.
func (h *Handler) GetShift(c echo.Context) error {
	id := c.Param("id")
	if _, err := primitive.ObjectIDFromHex(id); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid id")
	}

	resp, err := h.service.GetShift(c.Request().Context(), id)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// ListShifts handles GET /shifts. It accepts optional doctor_id and date query
// params to narrow the result set; when both are absent every shift is returned.
func (h *Handler) ListShifts(c echo.Context) error {
	doctorID := c.QueryParam("doctor_id")
	date := c.QueryParam("date")

	resp, err := h.service.ListShifts(c.Request().Context(), doctorID, date)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// UpdateShift handles PUT /shifts/:id.
func (h *Handler) UpdateShift(c echo.Context) error {
	id := c.Param("id")
	if _, err := primitive.ObjectIDFromHex(id); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid id")
	}

	var req UpdateShiftRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}

	resp, err := h.service.UpdateShift(c.Request().Context(), id, req)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// DeleteShift handles DELETE /shifts/:id and returns HTTP 204 on success.
func (h *Handler) DeleteShift(c echo.Context) error {
	id := c.Param("id")
	if _, err := primitive.ObjectIDFromHex(id); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid id")
	}

	if err := h.service.DeleteShift(c.Request().Context(), id); err != nil {
		return mapServiceError(c, err)
	}

	return c.NoContent(http.StatusNoContent)
}

// ---------------------------------------------------------------------------
// Leave handlers
// ---------------------------------------------------------------------------

// CreateLeave handles POST /leaves and returns HTTP 201 on success.
func (h *Handler) CreateLeave(c echo.Context) error {
	var req CreateLeaveRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.CreateLeave(c.Request().Context(), req)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusCreated, resp)
}

// GetLeave handles GET /leaves/:id.
func (h *Handler) GetLeave(c echo.Context) error {
	id := c.Param("id")
	if _, err := primitive.ObjectIDFromHex(id); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid id")
	}

	resp, err := h.service.GetLeave(c.Request().Context(), id)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// ListLeaves handles GET /leaves. It accepts an optional doctor_id query param
// to narrow the result set to a single doctor; when absent every leave is returned.
func (h *Handler) ListLeaves(c echo.Context) error {
	doctorID := c.QueryParam("doctor_id")

	resp, err := h.service.ListLeaves(c.Request().Context(), doctorID)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// DeleteLeave handles DELETE /leaves/:id and returns HTTP 204 on success.
func (h *Handler) DeleteLeave(c echo.Context) error {
	id := c.Param("id")
	if _, err := primitive.ObjectIDFromHex(id); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid id")
	}

	if err := h.service.DeleteLeave(c.Request().Context(), id); err != nil {
		return mapServiceError(c, err)
	}

	return c.NoContent(http.StatusNoContent)
}

// ---------------------------------------------------------------------------
// Time block handlers
// ---------------------------------------------------------------------------

// CreateTimeBlock handles POST /time-blocks and returns HTTP 201 on success.
func (h *Handler) CreateTimeBlock(c echo.Context) error {
	var req CreateTimeBlockRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.CreateTimeBlock(c.Request().Context(), req)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusCreated, resp)
}

// ListTimeBlocks handles GET /time-blocks. It accepts optional doctor_id and
// date query params to narrow the result set; when both are absent every time
// block is returned.
func (h *Handler) ListTimeBlocks(c echo.Context) error {
	doctorID := c.QueryParam("doctor_id")
	date := c.QueryParam("date")

	resp, err := h.service.ListTimeBlocks(c.Request().Context(), doctorID, date)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// DeleteTimeBlock handles DELETE /time-blocks/:id and returns HTTP 204 on
// success.
func (h *Handler) DeleteTimeBlock(c echo.Context) error {
	id := c.Param("id")
	if _, err := primitive.ObjectIDFromHex(id); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid id")
	}

	if err := h.service.DeleteTimeBlock(c.Request().Context(), id); err != nil {
		return mapServiceError(c, err)
	}

	return c.NoContent(http.StatusNoContent)
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

// mapServiceError converts a service-layer error into the appropriate HTTP
// response, keeping the errormap JSON shape uniform across the API. It is the
// single point where domain errors are mapped to status codes.
func mapServiceError(c echo.Context, err error) error {
	switch {
	case errors.Is(err, ErrShiftNotFound), errors.Is(err, ErrLeaveNotFound), errors.Is(err, ErrTimeBlockNotFound):
		return writeError(c, errormap.ErrNotFound, err.Error())
	case errors.Is(err, ErrTimeBlockInvalid):
		return writeError(c, errormap.ErrBadRequest, err.Error())
	case errors.Is(err, ErrOverlappingShift), errors.Is(err, ErrShiftOnLeave), errors.Is(err, ErrDoctorOnLeave):
		return writeError(c, errormap.ErrConflict, err.Error())
	case errors.Is(err, ErrShiftTimeInvalid), errors.Is(err, ErrInvalidObjectID):
		return writeError(c, errormap.ErrBadRequest, err.Error())
	default:
		// Anything else is treated as an internal failure; log it for
		// diagnosis but do not leak internals to the client.
		logger.Get().Error("schedule handler: unexpected service error", "error", err)
		return writeError(c, errormap.ErrInternal, err.Error())
	}
}

// writeError serializes an *errormap.APIError into the response, attaching an
// optional diagnostic detail to the Debug field. A fresh APIError is created
// each time so the package-level sentinels are never mutated concurrently.
func writeError(c echo.Context, apiErr *errormap.APIError, detail string) error {
	return c.JSON(apiErr.Code, errormap.New(apiErr.Code, apiErr.Message, detail))
}
