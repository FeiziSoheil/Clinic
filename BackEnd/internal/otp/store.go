package otp

import (
	"context"
	"time"
)

// Key prefix scheme (human-readable on purpose, to make debugging easy):
//
//	otp:login:{phone}     = the active 6-digit code,            TTL = LoginTTL
//	otp:cooldown:{phone}  = resend throttle marker,             TTL = Cooldown
//	otp:attempts:{phone}  = wrong-verification attempt counter,  TTL = AttemptsTTL
//	otp:block:{phone}     = temporary block marker,             TTL = ban window
//	otp:requests:{phone}  = send-request counter (rate limiter), TTL = RequestWindow
//
// No timestamps or expiry instants are ever stored *inside* a value — every
// timing concern is expressed purely through Redis key expiration (SET ... EX /
// EXPIRE). This keeps the store stateless and removes the need for any cron job
// or sweeper.

const (
	keyPrefixLogin    = "otp:login:"
	keyPrefixCooldown = "otp:cooldown:"
	keyPrefixAttempts = "otp:attempts:"
	keyPrefixBlock    = "otp:block:"
	keyPrefixRequests = "otp:requests:"
)

// Store is the TTL-driven OTP state backend. The production implementation is
// backed by Redis (RedisStore); the interface keeps the service decoupled and
// trivially testable with a fake.
//
// Every method maps to a small, self-contained Redis operation. Time-to-live is
// expressed in seconds (int) where it is returned to callers, mirroring how the
// Redis TTL command reports it.
type Store interface {
	// SetCode stores code for phone with the given TTL (overwriting any prior
	// code). The value stored is the bare code string — nothing else.
	SetCode(ctx context.Context, phone, code string, ttl time.Duration) error
	// GetCode returns the stored code for phone, or "" with a nil error when no
	// (unexpired) code exists.
	GetCode(ctx context.Context, phone string) (string, error)

	// SetCooldown sets the resend-throttle marker for phone with the given TTL.
	SetCooldown(ctx context.Context, phone string, ttl time.Duration) error
	// CooldownTTL returns the remaining cooldown window for phone, or 0 when no
	// cooldown is active.
	CooldownTTL(ctx context.Context, phone string) (time.Duration, error)

	// IncrementAttempts atomically bumps the wrong-attempt counter for phone,
	// seeding its TTL to ttl when first created, and returns the new count.
	IncrementAttempts(ctx context.Context, phone string, ttl time.Duration) (int, error)
	// DeleteAttempts removes the wrong-attempt counter for phone (used when a
	// fresh code is issued so the counter starts at zero again).
	DeleteAttempts(ctx context.Context, phone string) error

	// SetBlock sets the temporary-block marker for phone with the given ban
	// window. The block auto-expires; no background job clears it.
	SetBlock(ctx context.Context, phone string, ttl time.Duration) error
	// BlockTTL returns the remaining block window for phone, or 0 when the
	// phone is not currently blocked.
	BlockTTL(ctx context.Context, phone string) (time.Duration, error)
	// DeleteBlock removes the block marker for phone. Called after a successful
	// verification (a no-op when the phone was not blocked, which is the normal
	// case since the block-check guards verification) so all OTP state is clean.
	DeleteBlock(ctx context.Context, phone string) error

	// IncrementRequests atomically bumps the send-request counter for phone,
	// seeding its TTL to window when first created (the window is fixed from the
	// first request, not refreshed on subsequent increments). It returns the new
	// count.
	IncrementRequests(ctx context.Context, phone string, window time.Duration) (int, error)
	// RequestsCount returns the current send-request counter for phone, or 0
	// when no window is active.
	RequestsCount(ctx context.Context, phone string) (int, error)
	// RequestsTTL returns the remaining time in the active send-request window,
	// or 0 when no window is active.
	RequestsTTL(ctx context.Context, phone string) (time.Duration, error)

	// ResetState removes the per-code OTP state for phone (login code, cooldown
	// and attempt counter) but intentionally NOT the block marker, which must
	// expire on its own. Called after a successful verification.
	ResetState(ctx context.Context, phone string) error
}
