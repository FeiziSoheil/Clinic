package notification

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"clinic-api/pkg/logger"
)

// smsIRSendRequest is the JSON body posted to the sms.ir verify endpoint. It
// mirrors the provider sample exactly:
//
//	{
//	  "Mobile":     "<recipient phone>",
//	  "TemplateId": "<pre-approved template id>",
//	  "Parameters": [{ "name": "<param>", "value": "<otp code>" }]
//	}
type smsIRSendRequest struct {
	Mobile     string       `json:"Mobile"`
	TemplateID string       `json:"TemplateId"`
	Parameters []smsIRParam `json:"Parameters"`
}

// smsIRParam is a single template variable posted inside the Parameters array
// of smsIRSendRequest. The sms.ir /v1/send/verify endpoint expects each
// template placeholder as an { "name", "value" } object.
type smsIRParam struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// smsIRResponse is the permissive shape returned by the sms.ir gateway. The
// provider wraps the result in { status, message, data }; we only care about
// whether the request was accepted (2xx + non-error status) so unknown extra
// fields never break decoding.
type smsIRResponse struct {
	Status  int             `json:"status"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

// SMSIRSender delivers OTP codes through the sms.ir REST gateway
// (https://api.sms.ir). It authenticates per request via the "x-api-key" header
// and routes the code through a pre-approved OTP template (TemplateId), which
// the provider delivers instantly (no pending-approval moderation delay). It is
// the transport used by the OTP authentication flow.
//
// The sender is safe for concurrent use: it shares only an immutable
// configuration and a *http.Client (which is itself goroutine-safe).
type SMSIRSender struct {
	apiKey     string
	baseURL    string
	otpPath    string
	templateID string
	codeParam  string
	client     *http.Client
}

// Compile-time assertions that SMSIRSender satisfies the OTP and notification
// transports expected by bootstrap.
var (
	_ SmsSender  = (*SMSIRSender)(nil)
	_ CodeSender = (*SMSIRSender)(nil)
)

// SMSIRConfig holds the gateway settings consumed by NewSMSIRSender. All values
// are sourced from configuration so nothing sensitive is hard-coded.
type SMSIRConfig struct {
	// APIKey is sent as the "x-api-key" header on every request.
	APIKey string
	// BaseURL is the gateway base URL (no trailing slash), e.g.
	// "https://api.sms.ir".
	BaseURL string
	// OTPPath is the path appended to BaseURL for OTP sends, e.g.
	// "/v1/send/otp".
	OTPPath string
	// TemplateID is the pre-approved OTP template id (e.g. "218976").
	TemplateID string
	// CodeParam is the template parameter name that receives the code digits
	// (e.g. "code" when the template variable is %code%).
	CodeParam string
}

// NewSMSIRSender constructs a sender bound to the given gateway settings.
// Missing optional fields fall back to the provider defaults so a partial config
// still boots.
func NewSMSIRSender(cfg SMSIRConfig) *SMSIRSender {
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL == "" {
		baseURL = "https://api.sms.ir"
	}
	otpPath := strings.TrimSpace(cfg.OTPPath)
	if otpPath == "" {
		otpPath = "/v1/send/verify"
	}
	codeParam := strings.TrimSpace(cfg.CodeParam)
	if codeParam == "" {
		codeParam = "code"
	}
	return &SMSIRSender{
		apiKey:     cfg.APIKey,
		baseURL:    baseURL,
		otpPath:    otpPath,
		templateID: cfg.TemplateID,
		codeParam:  codeParam,
		client:     &http.Client{Timeout: 10 * time.Second},
	}
}

// SendCode delivers an OTP over the pre-approved template endpoint. It always
// uses the OTP path + TemplateId, never free-text simple SMS, so the code is
// delivered instantly rather than queued for moderation. The expiryMinutes
// argument is accepted to satisfy the CodeSender contract but is unused: the
// sms.ir template carries its own validity text.
func (s *SMSIRSender) SendCode(ctx context.Context, phone, code string, expiryMinutes int) error {
	if s.templateID == "" {
		logger.Get().Error("smsir: TEMPLATE_ID unset; cannot deliver otp")
		return fmt.Errorf("smsir: template id not configured")
	}

	body := smsIRSendRequest{
		Mobile:     phone,
		TemplateID: s.templateID,
		Parameters: []smsIRParam{{Name: s.codeParam, Value: code}},
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("smsir: marshal request: %w", err)
	}
	return s.post(ctx, phone, raw)
}

// Send is provided so SMSIRSender can also serve as a plain SmsSender for
// free-text notifications if ever needed. It is implemented as a simple-SMS POST
// over the OTP path with a single "text"-like parameter; the OTP flow itself
// never calls it (it calls SendCode).
func (s *SMSIRSender) Send(ctx context.Context, phone, message string) error {
	body := smsIRSendRequest{
		Mobile:     phone,
		TemplateID: s.templateID,
		Parameters: []smsIRParam{{Name: "text", Value: message}},
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("smsir: marshal request: %w", err)
	}
	return s.post(ctx, phone, raw)
}

// post performs the authenticated POST to the OTP endpoint and interprets the
// gateway response. A non-2xx status or an error-level body is surfaced as an
// error so the OTP service can discard the issued code and let the user retry.
func (s *SMSIRSender) post(ctx context.Context, phone string, raw []byte) error {
	url := s.baseURL + s.otpPath

	logger.Get().Debug("smsir: sending otp",
		"url", url,
		"phone", phone,
		"template_id", s.templateID,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return fmt.Errorf("smsir: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	// The provider authenticates each request via the x-api-key header (per the
	// otp.txt sample). Never hard-code this value: it is supplied from .env.
	req.Header.Set("x-api-key", s.apiKey)

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("smsir: http call: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		logger.Get().Error("smsir: non-2xx response",
			"phone", phone,
			"status_code", resp.StatusCode,
			"body", string(respBody),
		)
		return fmt.Errorf("smsir: unexpected status %d", resp.StatusCode)
	}

	var parsed smsIRResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		// Treat an unparseable body as accepted (it was a 2xx) but warn so the
		// shape change is visible.
		logger.Get().Warn("smsir: unparseable response body", "phone", phone, "body", string(respBody))
		return nil
	}

	// sms.ir reports success with status == 1 (and message "موفق") inside the
	// JSON body. Any other value (0 when the field is absent, or an error tier)
	// means the gateway rejected the send; the details live in the message field.
	if parsed.Status != 1 {
		logger.Get().Error("smsir: gateway rejected message",
			"phone", phone,
			"status", parsed.Status,
			"message", parsed.Message,
		)
		return fmt.Errorf("smsir: gateway rejected message: %s", strings.TrimSpace(parsed.Message))
	}

	logger.Get().Info("smsir: otp accepted",
		"phone", phone,
		"status", parsed.Status,
		"gateway_message", parsed.Message,
	)
	return nil
}
