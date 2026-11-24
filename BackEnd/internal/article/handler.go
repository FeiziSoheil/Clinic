package article

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"

	"clinic-api/pkg/errormap"
	"clinic-api/pkg/logger"
	"clinic-api/pkg/requestctx"
)

// Handler exposes the article CMS over HTTP.
type Handler struct {
	service *Service
}

// NewHandler constructs a Handler.
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// RegisterAdminRoutes wires admin CRUD onto an admin-only group
// (prefix typically /api/v1/admin → /articles).
func (h *Handler) RegisterAdminRoutes(g *echo.Group) {
	g.GET("/articles", h.ListAdmin)
	g.POST("/articles", h.Create)
	g.GET("/articles/:id", h.GetAdmin)
	g.PUT("/articles/:id", h.Update)
	g.DELETE("/articles/:id", h.Delete)
}

// RegisterPublicRoutes wires public list/get onto an unauthenticated group.
func (h *Handler) RegisterPublicRoutes(g *echo.Group) {
	g.GET("/articles", h.ListPublic)
	g.GET("/articles/:idOrSlug", h.GetPublic)
}

// Create handles POST /admin/articles.
func (h *Handler) Create(c echo.Context) error {
	var req CreateArticleRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}
	resp, err := h.service.Create(c.Request().Context(), requestctx.GetRole(c), &req)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusCreated, resp)
}

// Update handles PUT /admin/articles/:id.
func (h *Handler) Update(c echo.Context) error {
	var req CreateArticleRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}
	resp, err := h.service.Update(
		c.Request().Context(),
		requestctx.GetRole(c),
		c.Param("id"),
		&req,
	)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// Delete handles DELETE /admin/articles/:id.
func (h *Handler) Delete(c echo.Context) error {
	if err := h.service.Delete(
		c.Request().Context(),
		requestctx.GetRole(c),
		c.Param("id"),
	); err != nil {
		return mapServiceError(c, err)
	}
	return c.NoContent(http.StatusNoContent)
}

// GetAdmin handles GET /admin/articles/:id.
func (h *Handler) GetAdmin(c echo.Context) error {
	resp, err := h.service.GetByIDOrSlug(c.Request().Context(), c.Param("id"), false)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// ListAdmin handles GET /admin/articles.
func (h *Handler) ListAdmin(c echo.Context) error {
	page, _ := strconv.Atoi(c.QueryParam("page"))
	pageSize, _ := strconv.Atoi(c.QueryParam("page_size"))
	resp, err := h.service.List(
		c.Request().Context(),
		c.QueryParam("status"),
		c.QueryParam("category"),
		c.QueryParam("q"),
		page,
		pageSize,
		false,
	)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// ListPublic handles GET /articles (published only).
func (h *Handler) ListPublic(c echo.Context) error {
	page, _ := strconv.Atoi(c.QueryParam("page"))
	pageSize, _ := strconv.Atoi(c.QueryParam("page_size"))
	resp, err := h.service.List(
		c.Request().Context(),
		"",
		c.QueryParam("category"),
		c.QueryParam("q"),
		page,
		pageSize,
		true,
	)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// GetPublic handles GET /articles/:idOrSlug.
func (h *Handler) GetPublic(c echo.Context) error {
	resp, err := h.service.GetByIDOrSlug(
		c.Request().Context(),
		c.Param("idOrSlug"),
		true,
	)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

func mapServiceError(c echo.Context, err error) error {
	switch {
	case errors.Is(err, ErrForbidden):
		return writeError(c, errormap.ErrForbidden, err.Error())
	case errors.Is(err, ErrNotFound):
		return writeError(c, errormap.ErrNotFound, err.Error())
	case errors.Is(err, ErrSlugTaken):
		return writeError(c, errormap.ErrConflict, err.Error())
	case errors.Is(err, ErrInvalidObjectID), errors.Is(err, ErrInvalidStatus),
		errors.Is(err, ErrEmptyTitle), errors.Is(err, ErrEmptySlug),
		errors.Is(err, ErrEmptyContent):
		return writeError(c, errormap.ErrBadRequest, err.Error())
	default:
		logger.Get().Error("article handler: unexpected service error", "error", err)
		return writeError(c, errormap.ErrInternal, err.Error())
	}
}

func writeError(c echo.Context, apiErr *errormap.APIError, detail string) error {
	return c.JSON(apiErr.Code, errormap.New(apiErr.Code, apiErr.Message, detail))
}
