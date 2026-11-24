package otp

import (
	"context"
	"fmt"
	"strconv"
	"time"

	pkgredis "clinic-api/pkg/redis"
)

// Compile-time assertion that RedisStore satisfies the Store contract.
var _ Store = (*RedisStore)(nil)

// RedisStore is the Redis-backed implementation of Store, built on the
// project's minimal dependency-free Redis client. Every OTP timing concern is
// expressed exclusively through key expiration: there are no timestamps stored
// in values and no background sweepers. Keys are human-readable so they are easy
// to inspect with redis-cli during debugging.
//
// It is safe for concurrent use: it shares only an immutable *pkgredis.Client,
// which is itself goroutine-safe (pooled connections).
type RedisStore struct {
	client *pkgredis.Client
}

// NewRedisStore binds the store to the given Redis client. The client is created
// once during bootstrap (pkg/redis.Connect) and reused for the process lifetime.
func NewRedisStore(client *pkgredis.Client) *RedisStore {
	return &RedisStore{client: client}
}

// SetCode stores the bare code for phone with ttl, overwriting any prior code.
// SET key value EX sets both the value and the expiry atomically.
func (s *RedisStore) SetCode(ctx context.Context, phone, code string, ttl time.Duration) error {
	if err := s.client.Set(ctx, keyPrefixLogin+phone, code, ttl); err != nil {
		return fmt.Errorf("otp: set login code: %w", err)
	}
	return nil
}

// GetCode returns the stored code, or "" when no unexpired code exists.
func (s *RedisStore) GetCode(ctx context.Context, phone string) (string, error) {
	val, ok, err := s.client.Get(ctx, keyPrefixLogin+phone)
	if err != nil {
		return "", fmt.Errorf("otp: get login code: %w", err)
	}
	if !ok {
		return "", nil
	}
	return val, nil
}

// SetCooldown sets the resend-throttle marker. The value is a constant
// placeholder (the marker's mere existence + TTL is what matters).
func (s *RedisStore) SetCooldown(ctx context.Context, phone string, ttl time.Duration) error {
	if err := s.client.Set(ctx, keyPrefixCooldown+phone, "1", ttl); err != nil {
		return fmt.Errorf("otp: set cooldown: %w", err)
	}
	return nil
}

// CooldownTTL returns the remaining cooldown window, or 0 when no cooldown key
// exists.
func (s *RedisStore) CooldownTTL(ctx context.Context, phone string) (time.Duration, error) {
	ttl, err := s.client.TTL(ctx, keyPrefixCooldown+phone)
	if err != nil {
		return 0, fmt.Errorf("otp: cooldown ttl: %w", err)
	}
	return ttl, nil
}

// IncrementAttempts bumps the wrong-attempt counter, seeding its TTL on first
// creation only (INCR returns 1) so the window is anchored to the first failure
// rather than refreshed on each one.
func (s *RedisStore) IncrementAttempts(ctx context.Context, phone string, ttl time.Duration) (int, error) {
	key := keyPrefixAttempts + phone
	n, err := s.client.Incr(ctx, key)
	if err != nil {
		return 0, fmt.Errorf("otp: increment attempts: %w", err)
	}
	if n == 1 {
		if err := s.client.Expire(ctx, key, ttl); err != nil {
			return 0, fmt.Errorf("otp: seed attempts ttl: %w", err)
		}
	}
	return int(n), nil
}

// DeleteAttempts removes the wrong-attempt counter.
func (s *RedisStore) DeleteAttempts(ctx context.Context, phone string) error {
	if err := s.client.Del(ctx, keyPrefixAttempts+phone); err != nil {
		return fmt.Errorf("otp: delete attempts: %w", err)
	}
	return nil
}

// SetBlock sets the temporary-block marker with the given ban window; the key
// auto-expires, lifting the block without any scheduler.
func (s *RedisStore) SetBlock(ctx context.Context, phone string, ttl time.Duration) error {
	if err := s.client.Set(ctx, keyPrefixBlock+phone, "1", ttl); err != nil {
		return fmt.Errorf("otp: set block: %w", err)
	}
	return nil
}

// BlockTTL returns the remaining block window, or 0 when the phone is not
// blocked.
func (s *RedisStore) BlockTTL(ctx context.Context, phone string) (time.Duration, error) {
	ttl, err := s.client.TTL(ctx, keyPrefixBlock+phone)
	if err != nil {
		return 0, fmt.Errorf("otp: block ttl: %w", err)
	}
	return ttl, nil
}

// DeleteBlock removes the block marker for phone. A no-op when the phone is not
// currently blocked.
func (s *RedisStore) DeleteBlock(ctx context.Context, phone string) error {
	if err := s.client.Del(ctx, keyPrefixBlock+phone); err != nil {
		return fmt.Errorf("otp: delete block: %w", err)
	}
	return nil
}

// IncrementRequests bumps the send-request counter, seeding its TTL to window
// only on first creation (INCR returns 1) so the rate-limit window is fixed from
// the first request — a steady drip of requests cannot keep sliding the window
// to evade the cap.
func (s *RedisStore) IncrementRequests(ctx context.Context, phone string, window time.Duration) (int, error) {
	key := keyPrefixRequests + phone
	n, err := s.client.Incr(ctx, key)
	if err != nil {
		return 0, fmt.Errorf("otp: increment requests: %w", err)
	}
	if n == 1 {
		if err := s.client.Expire(ctx, key, window); err != nil {
			return 0, fmt.Errorf("otp: seed requests ttl: %w", err)
		}
	}
	return int(n), nil
}

// RequestsCount returns the current send-request counter, or 0 when no window is
// active.
func (s *RedisStore) RequestsCount(ctx context.Context, phone string) (int, error) {
	val, ok, err := s.client.Get(ctx, keyPrefixRequests+phone)
	if err != nil {
		return 0, fmt.Errorf("otp: requests count: %w", err)
	}
	if !ok {
		return 0, nil
	}
	n, err := strconv.Atoi(val)
	if err != nil {
		return 0, fmt.Errorf("otp: requests count not numeric %q: %w", val, err)
	}
	return n, nil
}

// RequestsTTL returns the remaining send-request window, or 0 when inactive.
func (s *RedisStore) RequestsTTL(ctx context.Context, phone string) (time.Duration, error) {
	ttl, err := s.client.TTL(ctx, keyPrefixRequests+phone)
	if err != nil {
		return 0, fmt.Errorf("otp: requests ttl: %w", err)
	}
	return ttl, nil
}

// ResetState deletes the per-code OTP state (login, cooldown, attempts) but NOT
// the block marker, which must expire on its own. Done as a single DEL of the
// three keys to minimize round-trips.
func (s *RedisStore) ResetState(ctx context.Context, phone string) error {
	keys := []string{
		keyPrefixLogin + phone,
		keyPrefixCooldown + phone,
		keyPrefixAttempts + phone,
	}
	if err := s.client.Del(ctx, keys...); err != nil {
		return fmt.Errorf("otp: reset state: %w", err)
	}
	return nil
}
