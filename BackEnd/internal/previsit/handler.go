package previsit

import (
	"errors"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"

	"clinic-api/pkg/errormap"
	"clinic-api/pkg/logger"
	"clinic-api/pkg/requestctx"
)

// Handler exposes pre-visit HTTP routes.
type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// RegisterRoutes mounts routes on /api/v1/previsit (group prefix).
func (h *Handler) RegisterRoutes(g *echo.Group) {
	g.POST("/appointments/:appointmentId/session", h.EnsureSession)
	g.GET("/appointments/:appointmentId", h.GetSession)
	g.POST("/appointments/:appointmentId/turn", h.Turn)
	g.GET("/appointments/:appointmentId/messages", h.ListMessages)
}

func (h *Handler) EnsureSession(c echo.Context) error {
	appointmentID := c.Param("appointmentId")
	requesterID := requestctx.GetUserID(c)
	role := requestctx.GetRole(c)
	if role != "PATIENT" {
		return writeError(c, errormap.ErrForbidden, "only patients can start previsit")
	}
	sess, err := h.service.EnsureSessionForPatient(c.Request().Context(), appointmentID, requesterID)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, sess)
}

func (h *Handler) GetSession(c echo.Context) error {
	resp, err := h.service.GetByAppointment(
		c.Request().Context(),
		c.Param("appointmentId"),
		requestctx.GetUserID(c),
		requestctx.GetRole(c),
	)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

func (h *Handler) Turn(c echo.Context) error {
	if requestctx.GetRole(c) != "PATIENT" {
		return writeError(c, errormap.ErrForbidden, "only patients can chat")
	}
	var body TurnRequestBody
	if err := c.Bind(&body); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	res, err := h.service.PatientTurn(
		c.Request().Context(),
		c.Param("appointmentId"),
		requestctx.GetUserID(c),
		body.Message,
	)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, res)
}

func (h *Handler) ListMessages(c echo.Context) error {
	msgs, err := h.service.ListMessages(
		c.Request().Context(),
		c.Param("appointmentId"),
		requestctx.GetUserID(c),
		requestctx.GetRole(c),
	)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, msgs)
}

func mapServiceError(c echo.Context, err error) error {
	switch {
	case errors.Is(err, ErrForbidden):
		return writeError(c, errormap.ErrForbidden, err.Error())
	case errors.Is(err, ErrSessionNotFound):
		return writeError(c, errormap.ErrNotFound, err.Error())
	case errors.Is(err, ErrInvalidID), errors.Is(err, ErrExpired):
		return writeError(c, errormap.ErrBadRequest, err.Error())
	case errors.Is(err, ErrAIUnavailable):
		// 503: sidecar missing/misconfigured OR upstream AI failure.
		// Prefer sidecar detail (credit/proxy/LLM) over a generic env checklist.
		debug := "دستیار پیش‌ویزیت موقتاً در دسترس نیست. AI_SERVICE_URL و PREVISIT_AI_ENABLED را در BackEnd/.env بررسی کنید."
		raw := err.Error()
		if idx := strings.Index(raw, "HTTP "); idx >= 0 {
			body := strings.TrimSpace(raw[idx:])
			if body != "" {
				debug = body
			}
		} else if strings.Contains(raw, "client not configured") {
			debug = raw
		} else if detail := strings.TrimPrefix(raw, ErrAIUnavailable.Error()+": "); detail != "" && detail != raw {
			debug = detail
		}
		logger.Get().Warn("previsit AI unavailable", "error", err)
		return c.JSON(http.StatusServiceUnavailable, errormap.New(
			http.StatusServiceUnavailable,
			"previsit ai unavailable",
			debug,
		))
	default:
		logger.Get().Error("previsit handler: unexpected error", "error", err)
		return writeError(c, errormap.ErrInternal, err.Error())
	}
}

func writeError(c echo.Context, apiErr *errormap.APIError, detail string) error {
	return c.JSON(apiErr.Code, errormap.New(apiErr.Code, apiErr.Message, detail))
}
