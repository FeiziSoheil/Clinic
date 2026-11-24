// Package otp implements one-time-password (OTP) authentication for the
// clinic's patient-facing flows.
//
// Patients authenticate exclusively via OTP (no password): they request a code
// sent to their phone, then verify it to either log an existing account in or
// register a brand-new PATIENT account.
//
// The package owns the OTP code lifecycle, which is driven entirely by Redis key
// expiration — there are no in-value timestamps, cron jobs or background
// sweepers. The escalating temporary-block tier is persisted per phone in the
// database (BanLevel) so it survives Redis restarts and lets the block window
// grow with each offence.
//
// It depends on the notification package (SMS delivery), the redis package
// (stateful OTP store) and the user package (account lookup/creation + the
// shared login response shape), all of which live in internal/ alongside it.
package otp

import (
	"errors"
	"time"
)

// Sentinel errors returned by the service. Handlers translate these into the
// appropriate HTTP status via errormap. Sentinel errors keep the service free of
// HTTP concerns, in line with the project's Clean Architecture.
var (
	// ErrCooldown is returned when an OTP is requested while the resend
	// throttle (otp:cooldown) is still active.
	ErrCooldown = errors.New("otp: please wait before requesting a new code")
	// ErrRequestLimit is returned when a phone has issued the maximum number of
	// OTP requests within the rate-limit window.
	ErrRequestLimit = errors.New("otp: too many otp requests, try again later")
	// ErrCodeNotFound is returned when verifying a phone for which no valid code
	// exists (never requested, already consumed, or expired).
	ErrCodeNotFound = errors.New("otp: no active code, request a new one")
	// ErrInvalidCode is returned when the supplied code does not match the
	// stored one. The attempt counter is incremented before returning.
	ErrInvalidCode = errors.New("otp: invalid code")
	// ErrSMSDispatch is returned when the SMS gateway rejects/fails the delivery
	// of the code; the generated code is discarded so the caller must retry.
	ErrSMSDispatch = errors.New("otp: failed to send sms")
	// ErrBlocked is the base error for a temporarily blocked phone (an active
	// ban from too many wrong attempts). The concrete *RetryError carries the
	// remaining block window.
	ErrBlocked = errors.New("otp: temporarily blocked, please try again later")
	// ErrStaffMustUsePassword is returned when a non-PATIENT account (staff)
	// attempts to authenticate via OTP. Staff authenticate exclusively with
	// username + password.
	ErrStaffMustUsePassword = errors.New("otp: staff accounts must log in with username and password")
)

// RetryError indicates an OTP action (send or verify) must wait before being
// retried, and for how long. It wraps the specific sentinel (ErrBlocked,
// ErrRequestLimit or ErrCooldown) so handlers can both classify the cause with
// errors.Is and read the remaining window with errors.As. The window is returned
// to the client via the debug payload (retry_after) so the UI can drive its
// single countdown timer.
type RetryError struct {
	// Cause is the wrapped sentinel describing why the retry is required.
	Cause error
	// RetryAfter is the remaining wait window.
	RetryAfter time.Duration
}

// Error implements the error interface, forwarding the wrapped cause's message.
func (e *RetryError) Error() string {
	if e == nil {
		return "otp: retry later"
	}
	if e.Cause != nil {
		return e.Cause.Error()
	}
	return "otp: retry later"
}

// Unwrap allows errors.Is(err, <sentinel>) to match the wrapped cause.
func (e *RetryError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Cause
}

// retry wraps cause with the remaining wait window, guaranteeing a strictly
// positive value (a zero/negative wait is clamped to 1 second so the client
// countdown never shows 0 for an otherwise-rejected request).
func retry(cause error, wait time.Duration) error {
	if wait <= 0 {
		wait = 1 * time.Second
	}
	return &RetryError{Cause: cause, RetryAfter: wait}
}

// SendOTPRequest is the payload accepted by POST /auth/otp/send. It carries only
// the destination phone; the flow (login vs register) is decided at verification
// time, so sending is flow-agnostic and never reveals whether the phone is
// already registered. The phone is normalized server-side before any keying.
type SendOTPRequest struct {
	// Phone is the destination mobile number (validated/normalized server-side).
	Phone string `json:"phone" validate:"required"`
}

// SendOTPResponse is returned by a successful POST /auth/otp/send. It carries
// the timing/quota hints the client needs to drive its OTP countdown UI. It
// deliberately never includes the code itself. The field names match the
// existing frontend contract.
type SendOTPResponse struct {
	// ExpiresIn is the number of seconds the issued code stays valid
	// (the otp:login TTL). This is the source of truth for the client countdown.
	ExpiresIn int `json:"expires_in"`
	// ResendIn is the cooldown (otp:cooldown TTL): the minimum seconds the
	// client must wait before requesting another code for the same phone.
	ResendIn int `json:"resend_in"`
	// RemainingResends is how many more code requests the user may issue before
	// the rate limit kicks in (RequestLimit - requests already used).
	RemainingResends int `json:"remaining_resends"`
	// MaxResends is the configured request quota (for the "N از M" UI hint).
	MaxResends int `json:"max_resends"`
}

// VerifyLoginRequest is the payload accepted by POST /auth/otp/login. It carries
// only the phone and the code; an unknown phone yields ErrUserNotFound.
type VerifyLoginRequest struct {
	// Phone identifies the account attempting to authenticate (normalized).
	Phone string `json:"phone" validate:"required"`
	// Code is the one-time password delivered over SMS.
	Code string `json:"code" validate:"required"`
}

// VerifyRegisterRequest is the payload accepted by POST /auth/otp/register. In
// addition to the phone + code it carries the profile fields needed to mint a
// new PATIENT account. The code MUST be verified before the account is created.
type VerifyRegisterRequest struct {
	// Phone identifies the account and the OTP recipient (normalized).
	Phone string `json:"phone" validate:"required"`
	// Code is the one-time password delivered over SMS.
	Code string `json:"code" validate:"required"`
	// FirstName is the new patient's given name.
	FirstName string `json:"first_name" validate:"required"`
	// LastName is the new patient's family name.
	LastName string `json:"last_name" validate:"required"`
	// NationalCode is the new patient's national identification code.
	NationalCode string `json:"national_code" validate:"required"`
}
