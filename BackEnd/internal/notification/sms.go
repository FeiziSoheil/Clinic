package notification

import (
	"context"

	"clinic-api/pkg/logger"
)

// SmsSender delivers a plain-text SMS to an arbitrary phone number. It is used
// for domain notifications (appointment, prescription, …) and differs from the
// Notifier interface, which is keyed by user id.
//
// Implementations are safe for concurrent use.
type SmsSender interface {
	// Send delivers message to phone. phone is expected to be in the format the
	// underlying gateway accepts (for sms.ir, an Iranian mobile number such as
	// "09123456789"). A nil/empty error means the gateway accepted the request.
	Send(ctx context.Context, phone, message string) error
}

// CodeSender delivers a one-time password. OTP must go through a pre-approved
// template on gateways like sms.ir for instant delivery.
type CodeSender interface {
	SendCode(ctx context.Context, phone, code string, expiryMinutes int) error
}

// Gateway is the combined SMS transport used at bootstrap: free-text
// notifications via SmsSender and instant OTP via CodeSender.
type Gateway interface {
	SmsSender
	CodeSender
}

// MockSender is a SmsSender/CodeSender that only logs the would-be SMS. It is
// the default transport in development (SMS_PROVIDER=mock) so the entire OTP
// flow is fully testable without real gateway credentials. The generated OTP
// codes are surfaced in the server logs during local development.
type MockSender struct{}

// NewMockSender returns a MockSender.
func NewMockSender() *MockSender { return &MockSender{} }

// Compile-time assertion that MockSender satisfies Gateway.
var _ Gateway = (*MockSender)(nil)

// Send logs the message as if it were delivered over SMS. It always succeeds
// and is therefore suitable for local development and tests.
func (m *MockSender) Send(ctx context.Context, phone, message string) error {
	logger.Get().Info("notification: sms sent (mock)",
		"phone", phone,
		"channel", "sms",
		"message", message,
	)
	return nil
}

// SendCode logs the OTP as if it were delivered over SMS.
func (m *MockSender) SendCode(ctx context.Context, phone, code string, expiryMinutes int) error {
	logger.Get().Info("notification: otp sent (mock)",
		"phone", phone,
		"channel", "sms",
		"code", code,
		"expiry_minutes", expiryMinutes,
	)
	return nil
}
