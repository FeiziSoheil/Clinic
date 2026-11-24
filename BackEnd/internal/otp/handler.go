package otp

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"

	"clinic-api/internal/user"
	"clinic-api/pkg/errormap"
	"clinic-api/pkg/logger"
)

// Handler exposes the OTP authentication flow over HTTP. It maps the three
// public endpoints (/otp/send, /otp/login, /otp/register) onto Service calls,
// normalizes/validates the phone number on the server side, and translates
// service errors into the consistent JSON shape defined by the errormap package.
//
// Like the user handler it is intentionally thin: business rules live in the
// service, and this file only concerns itself with request binding, phone
// normalization, validation and HTTP status selection.
type Handler struct {
	service *Service
}

// NewHandler constructs a Handler backed by the given Service.
func NewHandler(service *Service) *Handler { return &Handler{service: service} }

// RegisterRoutes wires the handler's methods onto the provided Echo group. The
// caller is expected to mount the group on the public (unauthenticated)
// /api/v1/auth path so the routes resolve to /api/v1/auth/otp/*.
func (h *Handler) RegisterRoutes(g *echo.Group) {
	g.POST("/otp/send", h.Send)
	g.POST("/otp/login", h.VerifyLogin)
	g.POST("/otp/register", h.VerifyRegister)
}

// Send handles POST /otp/send.
//
// It binds/validates the SendOTPRequest, normalizes the phone number server-side
// (rejecting malformed Iranian numbers), delegates to the service, and returns
// 200 with the timing/quota hints.
//
// @Summary      Request an OTP code
// @Description  Generate and send a one-time password over SMS to the given phone
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body body otp.SendOTPRequest true "Send OTP payload"
// @Success      200 {object} otp.SendOTPResponse
// @Failure      400 {object} errormap.APIError
// @Failure      429 {object} errormap.APIError
// @Router       /auth/otp/send [post]
func (h *Handler) Send(c echo.Context) error {
	var req SendOTPRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	phone, err := NormalizePhone(req.Phone)
	if err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.SendOTP(c.Request().Context(), phone)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// VerifyLogin handles POST /otp/login.
//
// On success it returns 200 with a LoginResponse containing the JWT and the
// user's public profile.
//
// @Summary      Login with OTP
// @Description  Verify an OTP code and authenticate an existing account
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body body otp.VerifyLoginRequest true "Verify login payload"
// @Success      200 {object} user.LoginResponse
// @Failure      400 {object} errormap.APIError
// @Failure      401 {object} errormap.APIError
// @Failure      404 {object} errormap.APIError
// @Router       /auth/otp/login [post]
func (h *Handler) VerifyLogin(c echo.Context) error {
	var req VerifyLoginRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	phone, err := NormalizePhone(req.Phone)
	if err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}
	req.Phone = phone

	resp, err := h.service.VerifyLogin(c.Request().Context(), req)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// VerifyRegister handles POST /otp/register.
//
// On success it returns 201 with a LoginResponse containing the JWT and the
// newly created user's public profile.
//
// @Summary      Register with OTP
// @Description  Verify an OTP code and create a new patient account
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body body otp.VerifyRegisterRequest true "Verify register payload"
// @Success      201 {object} user.LoginResponse
// @Failure      400 {object} errormap.APIError
// @Failure      401 {object} errormap.APIError
// @Failure      409 {object} errormap.APIError
// @Router       /auth/otp/register [post]
func (h *Handler) VerifyRegister(c echo.Context) error {
	var req VerifyRegisterRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	phone, err := NormalizePhone(req.Phone)
	if err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}
	req.Phone = phone

	resp, err := h.service.VerifyRegister(c.Request().Context(), req)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusCreated, resp)
}

// mapServiceError converts a service-layer error into the appropriate HTTP
// response, keeping the errormap JSON shape uniform across the API. It covers
// both the OTP-package sentinels and the user-package sentinels that surface
// through the verification dispatch (account lookup / uniqueness).
//
// Any *RetryError (block / request-limit / cooldown) maps to 429 with the
// remaining wait window in the debug payload (retry_after) so the client can
// drive its single countdown timer.
func mapServiceError(c echo.Context, err error) error {
	// Retryable guards (block, request limit, cooldown) → 429 with retry_after.
	var re *RetryError
	if errors.As(err, &re) {
		retryAfter := int(re.RetryAfter.Seconds())
		return c.JSON(http.StatusTooManyRequests, errormap.New(
			http.StatusTooManyRequests,
			"too many requests",
			map[string]any{"retry_after": retryAfter},
		))
	}
	switch {
	case errors.Is(err, ErrCodeNotFound), errors.Is(err, ErrInvalidCode):
		// A wrong/absent code is an authentication failure.
		return writeError(c, errormap.ErrUnauthorized, err.Error())
	case errors.Is(err, ErrStaffMustUsePassword):
		// A staff account tried to authenticate via OTP — they must use the
		// password login. Surfaced as 403 so the client can redirect them.
		return writeError(c, errormap.ErrForbidden, err.Error())
	case errors.Is(err, ErrSMSDispatch):
		// Gateway failure is a transient server-side problem.
		return writeError(c, errormap.ErrInternal, err.Error())
	case errors.Is(err, user.ErrUserAlreadyExists):
		return writeError(c, errormap.ErrConflict, err.Error())
	case errors.Is(err, user.ErrUserNotFound):
		return writeError(c, errormap.ErrNotFound, err.Error())
	default:
		logger.Get().Error("otp handler: unexpected service error", "error", err)
		return writeError(c, errormap.ErrInternal, err.Error())
	}
}

// writeError serializes an *errormap.APIError into the response, attaching an
// optional diagnostic detail to the Debug field. A fresh APIError is created
// each time so the package-level sentinels are never mutated concurrently.
func writeError(c echo.Context, apiErr *errormap.APIError, detail string) error {
	return c.JSON(apiErr.Code, errormap.New(apiErr.Code, apiErr.Message, detail))
}
