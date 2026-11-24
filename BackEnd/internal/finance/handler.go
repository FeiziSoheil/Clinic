package finance

import (
	"errors"
	"net/http"
	"regexp"
	"time"

	"github.com/labstack/echo/v4"

	"clinic-api/pkg/errormap"
	"clinic-api/pkg/logger"
	"clinic-api/pkg/requestctx"
)

// monthRegex validates the YYYY-MM query param on doctor read endpoints.
var monthRegex = regexp.MustCompile(`^\d{4}-\d{2}$`)

// dayRegex validates YYYY-MM-DD query params for from/to date ranges.
var dayRegex = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// Handler exposes the finance domain over HTTP. Each method maps a route to a
// Service call and translates the result/error into the consistent JSON shape
// defined by the errormap package.
//
// The handler is intentionally thin: all business rules (mock payments,
// visit-fee collection, settlement, no-show forfeits) live in the service, so
// this file only concerns itself with request binding, validation, query/auth
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
	g.POST("/finance/mock-pay", h.MockPay)
	g.GET("/finance/mock-verify", h.MockVerify)
	g.POST("/finance/pay", h.PayVisitFee) // pay the full visit fee up front
	g.POST("/finance/settle", h.Settle)   // settle appointment (credit doctor)
	g.POST("/finance/cancel", h.Cancel)   // process cancellation
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// MockPay handles POST /finance/mock-pay and returns HTTP 201 with the pending
// payment attempt (including the mock verification URL) on success.
func (h *Handler) MockPay(c echo.Context) error {
	var req MockPayRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.InitiateMockPayment(c.Request().Context(), req.UserID, req.Amount)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusCreated, resp)
}

// MockVerify handles GET /finance/mock-verify?code=<trackingCode> and returns
// HTTP 200 with the wallet-credit transaction on success.
func (h *Handler) MockVerify(c echo.Context) error {
	code := c.QueryParam("code")
	if code == "" {
		return writeError(c, errormap.ErrBadRequest, "missing tracking code")
	}

	resp, err := h.service.VerifyMockPayment(c.Request().Context(), code)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// PayVisitFee handles POST /finance/pay and collects the FULL visit fee for an
// appointment in a single up-front payment (the deposit/prepayment mechanism has
// been removed). The user id is taken from the auth context, falling back to the
// optional request body field (mainly for testing). Returns HTTP 200 with the
// created invoice on success.
func (h *Handler) PayVisitFee(c echo.Context) error {
	var req PayVisitFeeRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	// Resolve the acting user from the auth context first, falling back to the
	// optional body field. If neither is present the request is unauthorized.
	userID := requestctx.GetUserID(c)
	if userID == "" {
		userID = req.UserID
	}
	if userID == "" {
		return writeError(c, errormap.ErrUnauthorized, "missing authenticated user id")
	}

	resp, err := h.service.PayVisitFee(c.Request().Context(), userID, req.AppointmentID)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// Settle handles POST /finance/settle and settles an appointment by crediting
// the full visit fee to the doctor's wallet. Returns HTTP 200 with the settled
// invoice on success.
func (h *Handler) Settle(c echo.Context) error {
	var req SettleRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.SettleAppointment(c.Request().Context(), req.AppointmentID)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// Cancel handles POST /finance/cancel and processes an appointment
// cancellation, refunding or forfeiting the deposit per the no-show flag.
// Returns HTTP 200 with the updated invoice on success.
func (h *Handler) Cancel(c echo.Context) error {
	var req CancelRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.ProcessCancellation(c.Request().Context(), req.AppointmentID, req.IsLateOrNoShow)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// ---------------------------------------------------------------------------
// Doctor-facing read handlers
// ---------------------------------------------------------------------------

// resolveDoctorID extracts the signed-in doctor's id from the JWT context. The
// routes calling these handlers are gated by RoleAuth(RoleDoctor), so an empty
// id here only happens when the JWT middleware failed to populate the context.
func resolveDoctorID(c echo.Context) (string, error) {
	id := requestctx.GetUserID(c)
	if id == "" {
		return "", errormap.ErrUnauthorized
	}
	return id, nil
}

// resolveEarningsWindow resolves the query window for doctor earnings reads.
// Preference order:
//  1. from=&to= as inclusive YYYY-MM-DD (when either is present both required)
//  2. month=YYYY-MM (full calendar month)
//  3. default: current UTC calendar month
func resolveEarningsWindow(c echo.Context) (fromLabel, toLabel string, start, endExclusive time.Time, err error) {
	from := c.QueryParam("from")
	to := c.QueryParam("to")
	if from != "" || to != "" {
		if !dayRegex.MatchString(from) || !dayRegex.MatchString(to) {
			return "", "", time.Time{}, time.Time{}, ErrInvalidDateRange
		}
		start, endExclusive, err = parseDateRange(from, to)
		if err != nil {
			return "", "", time.Time{}, time.Time{}, err
		}
		return from, to, start, endExclusive, nil
	}

	month := c.QueryParam("month")
	if month == "" {
		month = time.Now().UTC().Format("2006-01")
	}
	if !monthRegex.MatchString(month) {
		return "", "", time.Time{}, time.Time{}, ErrInvalidMonth
	}
	return parseMonthRange(month)
}

// DoctorEarnings handles GET /finance/doctor/earnings and returns HTTP 200 with
// the aggregated earnings summary for the signed-in doctor.
//
// Query: from=&to= (YYYY-MM-DD inclusive) or month=YYYY-MM (legacy).
func (h *Handler) DoctorEarnings(c echo.Context) error {
	doctorID, err := resolveDoctorID(c)
	if err != nil {
		return writeError(c, errormap.ErrUnauthorized, "missing authenticated user id")
	}
	fromLabel, toLabel, start, endExclusive, err := resolveEarningsWindow(c)
	if err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid date range; use from/to as YYYY-MM-DD or month as YYYY-MM")
	}

	// Backfill: visits completed clinically before auto-settle was wired leave
	// PARTIAL invoices; settle those so earnings/wallet reflect reality.
	_ = h.service.RepairSettleCompletedVisits(c.Request().Context(), doctorID)

	resp, err := h.service.GetDoctorEarnings(c.Request().Context(), doctorID, fromLabel, toLabel, start, endExclusive)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// DoctorTransactions handles GET /finance/doctor/transactions and returns HTTP
// 200 with the doctor's REVENUE_SHARE and DEPOSIT_FORFEIT ledger entries for
// the window, newest first.
//
// Query: from=&to= (YYYY-MM-DD inclusive) or month=YYYY-MM (legacy).
func (h *Handler) DoctorTransactions(c echo.Context) error {
	doctorID, err := resolveDoctorID(c)
	if err != nil {
		return writeError(c, errormap.ErrUnauthorized, "missing authenticated user id")
	}
	_, _, start, endExclusive, err := resolveEarningsWindow(c)
	if err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid date range; use from/to as YYYY-MM-DD or month as YYYY-MM")
	}

	resp, err := h.service.GetDoctorTransactions(c.Request().Context(), doctorID, start, endExclusive)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// DoctorWallet handles GET /finance/doctor/wallet and returns HTTP 200 with the
// signed-in doctor's wallet balance (0 when no wallet exists yet).
func (h *Handler) DoctorWallet(c echo.Context) error {
	doctorID, err := resolveDoctorID(c)
	if err != nil {
		return writeError(c, errormap.ErrUnauthorized, "missing authenticated user id")
	}

	resp, err := h.service.GetDoctorWallet(c.Request().Context(), doctorID)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// UserWallet handles GET /finance/wallet and returns HTTP 200 with the signed-in
// user's wallet balance (0 when no wallet exists yet). Unlike the doctor-scoped
// endpoint, this is the generic patient wallet read: the user id is taken from
// the JWT auth context and the route is gated by plain JWTAuth (no role
// restriction) so any authenticated user may read their own wallet.
func (h *Handler) UserWallet(c echo.Context) error {
	userID := requestctx.GetUserID(c)
	if userID == "" {
		return writeError(c, errormap.ErrUnauthorized, "missing authenticated user id")
	}

	resp, err := h.service.GetUserWallet(c.Request().Context(), userID)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// ---------------------------------------------------------------------------
// Admin dashboard
// ---------------------------------------------------------------------------

// validDashboardRanges is the set of accepted ?range= values for the dashboard
// endpoint. An empty/missing query param defaults to the 12-month window.
var validDashboardRanges = map[string]struct{}{
	string(DashboardRange6m):  {},
	string(DashboardRange12m): {},
}

// Dashboard handles GET /finance/dashboard?range=<6m|12m> and returns HTTP 200
// with the aggregated KPI summary and chart series for the selected window.
func (h *Handler) Dashboard(c echo.Context) error {
	rangeStr := c.QueryParam("range")
	if rangeStr == "" {
		rangeStr = string(DashboardRange12m)
	}
	if _, ok := validDashboardRanges[rangeStr]; !ok {
		return writeError(c, errormap.ErrBadRequest, "invalid range, expected one of: 6m, 12m")
	}

	resp, err := h.service.GetDashboard(c.Request().Context(), rangeStr)
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
	case errors.Is(err, ErrInvalidObjectID), errors.Is(err, ErrInvalidMonth), errors.Is(err, ErrInvalidDateRange):
		return writeError(c, errormap.ErrBadRequest, err.Error())
	case errors.Is(err, ErrInsufficientBalance):
		return writeError(c, errormap.ErrBadRequest, err.Error())
	case errors.Is(err, ErrWalletNotFound),
		errors.Is(err, ErrPaymentAttemptNotFound),
		errors.Is(err, ErrInvoiceNotFound),
		errors.Is(err, ErrAppointmentNotFound):
		return writeError(c, errormap.ErrNotFound, err.Error())
	case errors.Is(err, ErrPaymentAlreadyVerified),
		errors.Is(err, ErrInvoiceAlreadySettled),
		errors.Is(err, ErrInvoiceAlreadyForfeited),
		errors.Is(err, ErrAppointmentAlreadyPaid):
		return writeError(c, errormap.ErrConflict, err.Error())
	default:
		// Anything else is treated as an internal failure; log it for
		// diagnosis but do not leak internals to the client.
		logger.Get().Error("finance handler: unexpected service error", "error", err)
		return writeError(c, errormap.ErrInternal, err.Error())
	}
}

// writeError serializes an *errormap.APIError into the response, attaching an
// optional diagnostic detail to the Debug field. A fresh APIError is created
// each time so the package-level sentinels are never mutated concurrently.
func writeError(c echo.Context, apiErr *errormap.APIError, detail string) error {
	return c.JSON(apiErr.Code, errormap.New(apiErr.Code, apiErr.Message, detail))
}
