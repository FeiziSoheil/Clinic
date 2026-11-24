package review

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"

	"clinic-api/pkg/errormap"
	"clinic-api/pkg/logger"
	"clinic-api/pkg/requestctx"
)

// Handler exposes the review domain over HTTP.
type Handler struct {
	service *Service
}

// NewHandler constructs a Handler backed by the given Service.
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// RegisterPatientRoutes wires patient create + list-mine onto a JWT group.
func (h *Handler) RegisterPatientRoutes(g *echo.Group) {
	g.POST("/reviews", h.CreateReview)
	g.GET("/reviews/me", h.ListMine)
}

// RegisterDoctorRoutes wires doctor list + reply onto a doctor-only group.
func (h *Handler) RegisterDoctorRoutes(g *echo.Group) {
	g.GET("/reviews", h.ListForDoctor)
	g.POST("/reviews/:id/reply", h.Reply)
}

// RegisterAdminRoutes wires admin list + moderate onto an admin-only group.
func (h *Handler) RegisterAdminRoutes(g *echo.Group) {
	g.GET("/reviews", h.ListAdmin)
	g.PATCH("/reviews/:id/status", h.Moderate)
}

// RegisterPublicRoutes wires public approved reviews onto an unauthenticated group.
func (h *Handler) RegisterPublicRoutes(g *echo.Group) {
	g.GET("/doctors/:id/reviews", h.ListPublic)
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// CreateReview handles POST /reviews (patient).
func (h *Handler) CreateReview(c echo.Context) error {
	var req CreateReviewRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.CreateReview(
		c.Request().Context(),
		requestctx.GetUserID(c),
		requestctx.GetRole(c),
		&req,
	)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusCreated, resp)
}

// ListMine handles GET /reviews/me (patient).
func (h *Handler) ListMine(c echo.Context) error {
	resp, err := h.service.ListMineByPatient(
		c.Request().Context(),
		requestctx.GetUserID(c),
		requestctx.GetRole(c),
	)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// ListForDoctor handles GET /doctor/reviews.
func (h *Handler) ListForDoctor(c echo.Context) error {
	resp, err := h.service.ListForDoctor(
		c.Request().Context(),
		requestctx.GetUserID(c),
		requestctx.GetRole(c),
	)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// Reply handles POST /doctor/reviews/:id/reply.
func (h *Handler) Reply(c echo.Context) error {
	var req ReplyReviewRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.Reply(
		c.Request().Context(),
		requestctx.GetUserID(c),
		requestctx.GetRole(c),
		c.Param("id"),
		req.Reply,
	)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// ListAdmin handles GET /admin/reviews?status=&doctor_id=.
func (h *Handler) ListAdmin(c echo.Context) error {
	resp, err := h.service.ListAdmin(
		c.Request().Context(),
		requestctx.GetRole(c),
		c.QueryParam("status"),
		c.QueryParam("doctor_id"),
	)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// Moderate handles PATCH /admin/reviews/:id/status.
func (h *Handler) Moderate(c echo.Context) error {
	var req ModerateReviewRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.Moderate(
		c.Request().Context(),
		requestctx.GetRole(c),
		c.Param("id"),
		req.Status,
	)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// ListPublic handles GET /doctors/:id/reviews (approved only + summary).
func (h *Handler) ListPublic(c echo.Context) error {
	resp, err := h.service.ListPublicByDoctor(c.Request().Context(), c.Param("id"))
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

func mapServiceError(c echo.Context, err error) error {
	switch {
	case errors.Is(err, ErrForbidden):
		return writeError(c, errormap.ErrForbidden, err.Error())
	case errors.Is(err, ErrNotFound), errors.Is(err, ErrAppointmentNotFound):
		return writeError(c, errormap.ErrNotFound, err.Error())
	case errors.Is(err, ErrAlreadyReviewed):
		return writeError(c, errormap.ErrConflict, err.Error())
	case errors.Is(err, ErrInvalidObjectID), errors.Is(err, ErrInvalidRating),
		errors.Is(err, ErrEmptyBody), errors.Is(err, ErrNotEligible),
		errors.Is(err, ErrReplyNotAllowed), errors.Is(err, ErrInvalidStatus):
		return writeError(c, errormap.ErrBadRequest, err.Error())
	default:
		logger.Get().Error("review handler: unexpected service error", "error", err)
		return writeError(c, errormap.ErrInternal, err.Error())
	}
}

func writeError(c echo.Context, apiErr *errormap.APIError, detail string) error {
	return c.JSON(apiErr.Code, errormap.New(apiErr.Code, apiErr.Message, detail))
}
