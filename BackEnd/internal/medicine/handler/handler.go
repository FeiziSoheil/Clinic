// Package handler exposes the Medicine domain over HTTP using Echo, mirroring
// the thin-handler pattern used by the prescription domain (see
// internal/prescription/handler.go).
//
// Each method binds/validates the request, reads the authenticated doctor's
// identity from the JWT context (via pkg/requestctx), delegates to the service
// and translates the result/error into the consistent JSON shape defined by
// pkg/errormap. Authentication/authorization middleware is applied by the
// caller in bootstrap when mounting the route group, so RegisterRoutes only
// declares the route-to-handler mapping.
//
// Per the project's Clean Architecture rules this package imports only the
// service sibling, pkg/errormap, pkg/logger, pkg/requestctx and Echo.
package handler

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"clinic-api/internal/medicine/service"
	"clinic-api/pkg/errormap"
	"clinic-api/pkg/logger"
	"clinic-api/pkg/requestctx"
)

// ---------------------------------------------------------------------------
// Search limit bounds (plan §5.1)
// ---------------------------------------------------------------------------

const (
	// defaultSearchLimit is returned when the limit query param is omitted or
	// unparseable.
	defaultSearchLimit = 20
	// minSearchLimit is the smallest accepted limit; anything below falls back
	// to the default rather than returning an error.
	minSearchLimit = 1
	// maxSearchLimit is the largest accepted limit; larger values are clamped
	// down to it so a client cannot request an unbounded result set.
	maxSearchLimit = 50
)

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

// Handler exposes the Medicine domain over HTTP. It holds a reference to the
// service and is intentionally thin: all business rules live in the service.
type Handler struct {
	svc *service.Service
}

// NewHandler constructs a Handler backed by the given Service.
func NewHandler(svc *service.Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes wires the handler's methods onto the provided Echo group.
//
// Authentication/authorization middleware is applied by the caller (bootstrap)
// when attaching the group, so this method only declares the route-to-handler
// mapping. The group is mounted under /api/v1/medicines, so the routes below
// are relative to that prefix.
//
// Route ordering note: the static segments (/search, /favorites*) are
// registered before the parameterized /:rxcui. Echo's radix router prefers
// static segments over parameterized ones regardless of order, but registering
// statics first keeps the intent explicit and avoids any ambiguity.
func (h *Handler) RegisterRoutes(g *echo.Group) {
	g.GET("/search", h.search)
	g.GET("/favorites", h.listFavorites)
	g.POST("/favorites", h.addFavorite)
	g.DELETE("/favorites/:rxcui", h.removeFavorite)
	g.GET("/:rxcui", h.detail)
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// search handles GET /search?q=<query>&limit=<n> and returns the ranked
// MedicineSearchResponse. The query is required (400 when empty); the limit
// defaults to 20 and is clamped to [1, 50].
func (h *Handler) search(c echo.Context) error {
	q := strings.TrimSpace(c.QueryParam("q"))
	if q == "" {
		return writeError(c, errormap.ErrBadRequest, "query parameter 'q' is required")
	}
	limit := parseLimit(c.QueryParam("limit"))

	resp, err := h.svc.Search(c.Request().Context(), q, limit)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// detail handles GET /:rxcui and returns the full MedicineDetail, or 404 when
// the concept is absent locally and no RxNorm fallback is available.
func (h *Handler) detail(c echo.Context) error {
	rxcui := strings.TrimSpace(c.Param("rxcui"))
	if rxcui == "" {
		return writeError(c, errormap.ErrBadRequest, "rxcui path parameter is required")
	}

	resp, err := h.svc.GetDetail(c.Request().Context(), rxcui)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// listFavorites handles GET /favorites and returns the calling doctor's
// favorites. The doctor identity is resolved from the JWT context.
func (h *Handler) listFavorites(c echo.Context) error {
	doctorID, err := doctorIDFromContext(c)
	if err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	favs, err := h.svc.ListFavorites(c.Request().Context(), doctorID)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, favs)
}

// addFavoriteRequest is the JSON body for POST /favorites.
type addFavoriteRequest struct {
	// RxCUI is the RxNorm CUI of the drug to favorite.
	RxCUI string `json:"rxcui"`
}

// addFavorite handles POST /favorites and returns 201 with the created
// FavoriteMedicineResponse. A duplicate favorite yields 409. The doctor
// identity is resolved from the JWT context.
func (h *Handler) addFavorite(c echo.Context) error {
	doctorID, err := doctorIDFromContext(c)
	if err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	var req addFavoriteRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if strings.TrimSpace(req.RxCUI) == "" {
		return writeError(c, errormap.ErrBadRequest, "rxcui is required")
	}

	resp, err := h.svc.AddFavorite(c.Request().Context(), doctorID, req.RxCUI)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusCreated, resp)
}

// removeFavorite handles DELETE /favorites/:rxcui and returns 204 on success.
// Removing a non-existent favorite yields 404. The doctor identity is resolved
// from the JWT context.
func (h *Handler) removeFavorite(c echo.Context) error {
	doctorID, err := doctorIDFromContext(c)
	if err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	rxcui := strings.TrimSpace(c.Param("rxcui"))
	if rxcui == "" {
		return writeError(c, errormap.ErrBadRequest, "rxcui path parameter is required")
	}

	if err := h.svc.RemoveFavorite(c.Request().Context(), doctorID, rxcui); err != nil {
		return mapServiceError(c, err)
	}
	return c.NoContent(http.StatusNoContent)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// parseLimit parses the limit query param into an int clamped to
// [minSearchLimit, maxSearchLimit]. An empty, unparseable or sub-minimum value
// yields the default; an oversized value is clamped down to maxSearchLimit.
func parseLimit(raw string) int {
	if raw == "" {
		return defaultSearchLimit
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < minSearchLimit {
		return defaultSearchLimit
	}
	if n > maxSearchLimit {
		return maxSearchLimit
	}
	return n
}

// doctorIDFromContext resolves the authenticated doctor's ObjectID from the JWT
// context. It mirrors the readIdentity pattern in the prescription handler but
// returns an error (rather than a zero value) because every favorites endpoint
// requires a valid doctor identity.
func doctorIDFromContext(c echo.Context) (primitive.ObjectID, error) {
	uid := requestctx.GetUserID(c)
	if uid == "" {
		return primitive.NilObjectID, errors.New("missing authenticated user identity")
	}
	oid, err := primitive.ObjectIDFromHex(uid)
	if err != nil {
		return primitive.NilObjectID, errors.New("invalid authenticated user identity")
	}
	return oid, nil
}

// mapServiceError converts a service-layer error into the appropriate HTTP
// response, keeping the errormap JSON shape uniform across the API. It is the
// single point where medicine domain errors are mapped to status codes, and
// mirrors the prescription handler's mapServiceError. The sentinel → status
// mapping is defined by the API contract (plan §5.3):
//
//   - ErrInvalidRequest  → 400
//   - ErrNotFound        → 404
//   - ErrAlreadyFavorite → 409
//   - ErrSearchFailed    → 502 (upstream RxNorm failure, fallback mode only)
//   - anything else      → 500
func mapServiceError(c echo.Context, err error) error {
	switch {
	case errors.Is(err, service.ErrInvalidRequest):
		return writeError(c, errormap.ErrBadRequest, err.Error())
	case errors.Is(err, service.ErrNotFound):
		return writeError(c, errormap.ErrNotFound, err.Error())
	case errors.Is(err, service.ErrAlreadyFavorite):
		return writeError(c, errormap.ErrConflict, err.Error())
	case errors.Is(err, service.ErrSearchFailed):
		// errormap has no 502 sentinel, so build the APIError inline.
		return c.JSON(http.StatusBadGateway, errormap.New(http.StatusBadGateway, "upstream medicine search failed", err.Error()))
	default:
		// Anything else is treated as an internal failure; log it for
		// diagnosis but do not leak internals to the client.
		logger.Get().Error("medicine handler: unexpected service error", "error", err)
		return writeError(c, errormap.ErrInternal, err.Error())
	}
}

// writeError serializes an *errormap.APIError into the response, attaching an
// optional diagnostic detail. A fresh APIError is created each time so the
// package-level sentinels are never mutated concurrently. It is the verbatim
// helper used by the prescription handler.
func writeError(c echo.Context, apiErr *errormap.APIError, detail string) error {
	return c.JSON(apiErr.Code, errormap.New(apiErr.Code, apiErr.Message, detail))
}
