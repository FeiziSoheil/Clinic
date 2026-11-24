package otp

import (
	"context"
	"errors"
	"testing"
	"time"
)

// memStore is a minimal Store for unit tests. Unused methods are no-ops.
type memStore struct {
	code             string
	blockTTL         time.Duration
	resetCalls       int
	deleteBlockCalls int
}

func (m *memStore) SetCode(ctx context.Context, phone, code string, ttl time.Duration) error {
	m.code = code
	return nil
}
func (m *memStore) GetCode(ctx context.Context, phone string) (string, error) {
	return m.code, nil
}
func (m *memStore) SetCooldown(ctx context.Context, phone string, ttl time.Duration) error {
	return nil
}
func (m *memStore) CooldownTTL(ctx context.Context, phone string) (time.Duration, error) {
	return 0, nil
}
func (m *memStore) IncrementAttempts(ctx context.Context, phone string, ttl time.Duration) (int, error) {
	return 1, nil
}
func (m *memStore) DeleteAttempts(ctx context.Context, phone string) error { return nil }
func (m *memStore) SetBlock(ctx context.Context, phone string, ttl time.Duration) error {
	m.blockTTL = ttl
	return nil
}
func (m *memStore) BlockTTL(ctx context.Context, phone string) (time.Duration, error) {
	return m.blockTTL, nil
}
func (m *memStore) DeleteBlock(ctx context.Context, phone string) error {
	m.deleteBlockCalls++
	m.blockTTL = 0
	return nil
}
func (m *memStore) IncrementRequests(ctx context.Context, phone string, window time.Duration) (int, error) {
	return 1, nil
}
func (m *memStore) RequestsCount(ctx context.Context, phone string) (int, error) {
	return 0, nil
}
func (m *memStore) RequestsTTL(ctx context.Context, phone string) (time.Duration, error) {
	return 0, nil
}
func (m *memStore) ResetState(ctx context.Context, phone string) error {
	m.resetCalls++
	m.code = ""
	return nil
}

func testPolicy(testCode string) Policy {
	return Policy{
		Length:        6,
		LoginTTL:      120 * time.Second,
		Cooldown:      60 * time.Second,
		AttemptsTTL:   120 * time.Second,
		MaxAttempts:   5,
		MaxRequests:   3,
		RequestWindow: 600 * time.Second,
		TestCode:      testCode,
	}
}

func TestVerifyTestCodeWithoutStoredOTP(t *testing.T) {
	store := &memStore{}
	svc := NewService(store, nil, nil, nil, "secret", 24, testPolicy("123456"))
	if err := svc.verify(context.Background(), "09123456789", "123456"); err != nil {
		t.Fatalf("verify with test code: %v", err)
	}
}

func TestVerifyWrongCodeWithoutStoredOTP(t *testing.T) {
	store := &memStore{}
	svc := NewService(store, nil, nil, nil, "secret", 24, testPolicy("123456"))
	err := svc.verify(context.Background(), "09123456789", "000000")
	if !errors.Is(err, ErrCodeNotFound) {
		t.Fatalf("got %v, want ErrCodeNotFound", err)
	}
}

func TestVerifyWithoutTestCodeUnchanged(t *testing.T) {
	store := &memStore{}
	svc := NewService(store, nil, nil, nil, "secret", 24, testPolicy(""))
	err := svc.verify(context.Background(), "09123456789", "123456")
	if !errors.Is(err, ErrCodeNotFound) {
		t.Fatalf("got %v, want ErrCodeNotFound", err)
	}
}

func TestVerifyTestCodeBypassesBlock(t *testing.T) {
	store := &memStore{blockTTL: 5 * time.Minute}
	svc := NewService(store, nil, nil, nil, "secret", 24, testPolicy("123456"))
	if err := svc.verify(context.Background(), "09123456789", "123456"); err != nil {
		t.Fatalf("test code should bypass block: %v", err)
	}
}
