# OTP Test Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept a fixed OTP from `OTP_TEST_CODE` on verify (login/register) in non-production, without requiring a prior `/auth/otp/send`.

**Architecture:** Load `OTP_TEST_CODE` into config; bootstrap clears it when `APP_ENV=production`; pass as `otp.Policy.TestCode`. In `Service.verify`, if `TestCode` is set and matches the submitted code (constant-time), return success before Redis/block checks.

**Tech Stack:** Go backend (`clinic-api`), existing `otp` package, `pkg/config`, Echo bootstrap. Tests via `go test` in `BackEnd/internal/otp` and `BackEnd/pkg/config`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-15-otp-test-code-design.md`
- Enable only via explicit `OTP_TEST_CODE` env (empty = off)
- When `APP_ENV=production`, test code must never be applied (discard + warning at bootstrap)
- No new HTTP endpoints; no frontend changes
- Do not return the test code in any API response
- Real OTP send / SMS / rate-limit / ban flows stay unchanged for non-test codes
- Prior `/send` is not required for test-code success
- Prefer constant-time compare (`crypto/subtle`) for the test-code match

---

## File map

| File | Responsibility |
|------|----------------|
| `BackEnd/pkg/config/config.go` | `OTPTestCode` field; load env; `ResolveOTPTestCode(appEnv, code)` helper |
| `BackEnd/pkg/config/otp_test_code_test.go` | Unit tests for production gate helper |
| `BackEnd/internal/otp/service.go` | `Policy.TestCode`; early success path in `verify` |
| `BackEnd/internal/otp/verify_testcode_test.go` | Unit tests for verify bypass with in-memory store |
| `BackEnd/cmd/clinic-api/bootstrap/app.go` | Resolve test code; pass into `otp.Policy`; warn if stripped in production |
| `BackEnd/.env.local` | Documented example `OTP_TEST_CODE=123456` |

---

### Task 1: Config helper + `OTPTestCode` field

**Files:**
- Modify: `BackEnd/pkg/config/config.go`
- Create: `BackEnd/pkg/config/otp_test_code_test.go`

**Interfaces:**
- Consumes: existing `getEnv`, `Config.AppEnv`
- Produces:

```go
// On Config:
OTPTestCode string // raw value from OTP_TEST_CODE (may still be set in production)

// Pure helper used by bootstrap:
func ResolveOTPTestCode(appEnv, code string) string
// Returns trimmed code when appEnv is not "production" (case-insensitive).
// Returns "" when appEnv is production or code is empty/whitespace.
```

- [ ] **Step 1: Write the failing tests**

Create `BackEnd/pkg/config/otp_test_code_test.go`:

```go
package config

import "testing"

func TestResolveOTPTestCode(t *testing.T) {
	cases := []struct {
		name   string
		appEnv string
		code   string
		want   string
	}{
		{"dev with code", "development", "123456", "123456"},
		{"empty code", "development", "", ""},
		{"whitespace code", "development", "  ", ""},
		{"trim spaces", "development", " 123456 ", "123456"},
		{"production strips", "production", "123456", ""},
		{"Production case", "Production", "123456", ""},
		{"staging keeps", "staging", "999999", "999999"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ResolveOTPTestCode(tc.appEnv, tc.code)
			if got != tc.want {
				t.Fatalf("ResolveOTPTestCode(%q, %q) = %q, want %q", tc.appEnv, tc.code, got, tc.want)
			}
		})
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd BackEnd && go test ./pkg/config/ -run TestResolveOTPTestCode -v
```

Expected: FAIL — `ResolveOTPTestCode` undefined.

- [ ] **Step 3: Implement helper + config field**

In `BackEnd/pkg/config/config.go`:

1. Add field after `OTPResetBanOnSuccess`:

```go
	// OTPTestCode, when non-empty and AppEnv is not production, is accepted as a
	// valid OTP on verify without a prior send. Always empty/ignored in production
	// via ResolveOTPTestCode at bootstrap.
	OTPTestCode string
```

2. In `Load()` (or equivalent), after other OTP env loads:

```go
cfg.OTPTestCode = getEnv("OTP_TEST_CODE", "")
```

3. Add helper (same file or adjacent is fine):

```go
// ResolveOTPTestCode returns code trimmed for use as a verify bypass, or "" when
// the environment is production or the code is empty. Bootstrap must use this
// (not the raw Config.OTPTestCode) when building otp.Policy.
func ResolveOTPTestCode(appEnv, code string) string {
	if strings.EqualFold(strings.TrimSpace(appEnv), "production") {
		return ""
	}
	return strings.TrimSpace(code)
}
```

Ensure `strings` is already imported in `config.go` (it is).

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd BackEnd && go test ./pkg/config/ -run TestResolveOTPTestCode -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add BackEnd/pkg/config/config.go BackEnd/pkg/config/otp_test_code_test.go
git commit -m "$(cat <<'EOF'
feat(config): add OTP_TEST_CODE env and production gate helper

EOF
)"
```

---

### Task 2: `Policy.TestCode` + verify bypass

**Files:**
- Modify: `BackEnd/internal/otp/service.go` (`Policy` struct + `verify`)
- Create: `BackEnd/internal/otp/verify_testcode_test.go`

**Interfaces:**
- Consumes: `Policy`, `Store`, `Service.verify(ctx, phone, code string) error`
- Produces: `Policy.TestCode string` — when non-empty, matching submitted code skips Redis/block/attempts and returns nil

- [ ] **Step 1: Write the failing tests**

Create `BackEnd/internal/otp/verify_testcode_test.go` with a minimal in-memory `Store` and tests against unexported `verify` (same package):

```go
package otp

import (
	"context"
	"errors"
	"testing"
	"time"
)

// memStore is a minimal Store for unit tests. Unused methods are no-ops.
type memStore struct {
	code      string
	blockTTL  time.Duration
	resetCalls int
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
		Length:      6,
		LoginTTL:    120 * time.Second,
		Cooldown:    60 * time.Second,
		AttemptsTTL: 120 * time.Second,
		MaxAttempts: 5,
		MaxRequests: 3,
		RequestWindow: 600 * time.Second,
		TestCode:    testCode,
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd BackEnd && go test ./internal/otp/ -run 'TestVerifyTestCode|TestVerifyWrongCode|TestVerifyWithoutTestCode' -v
```

Expected: FAIL — either unknown field `TestCode` or test-code path not implemented (e.g. `ErrCodeNotFound` / blocked).

- [ ] **Step 3: Implement `Policy.TestCode` + verify early path**

1. Add to `Policy` in `BackEnd/internal/otp/service.go`:

```go
	// TestCode, when non-empty, is accepted as a valid OTP on verify without a
	// prior send. Intended for non-production only; bootstrap must leave this
	// empty when APP_ENV=production.
	TestCode string
```

2. At the **start** of `verify` (before block check), add:

```go
	// Test-code bypass (non-production only; Policy.TestCode emptied in production
	// at bootstrap). Allows login/register without a prior send.
	if s.policy.TestCode != "" &&
		subtle.ConstantTimeCompare([]byte(s.policy.TestCode), []byte(code)) == 1 {
		if err := s.store.ResetState(ctx, phone); err != nil {
			logger.Get().Warn("otp: test-code reset state failed", "phone", phone, "error", err)
		}
		if err := s.store.DeleteBlock(ctx, phone); err != nil {
			logger.Get().Warn("otp: test-code delete block failed", "phone", phone, "error", err)
		}
		logger.Get().Info("otp: accepted test code", "phone", phone)
		return nil
	}
```

Keep the rest of `verify` unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd BackEnd && go test ./internal/otp/ -run 'TestVerifyTestCode|TestVerifyWrongCode|TestVerifyWithoutTestCode' -v
```

Expected: all PASS.

Also run the full package once:

```bash
cd BackEnd && go test ./internal/otp/ -count=1
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add BackEnd/internal/otp/service.go BackEnd/internal/otp/verify_testcode_test.go
git commit -m "$(cat <<'EOF'
feat(otp): accept Policy.TestCode on verify without prior send

EOF
)"
```

---

### Task 3: Wire bootstrap + document `.env.local`

**Files:**
- Modify: `BackEnd/cmd/clinic-api/bootstrap/app.go` (otp `NewService` / `Policy` construction ~lines 165–188)
- Modify: `BackEnd/.env.local` (OTP section comments + example value)

**Interfaces:**
- Consumes: `config.ResolveOTPTestCode`, `cfg.AppEnv`, `cfg.OTPTestCode`
- Produces: `otp.Policy{..., TestCode: resolved}` where `resolved` is empty in production

- [ ] **Step 1: Wire bootstrap**

In `BackEnd/cmd/clinic-api/bootstrap/app.go`, immediately before `otp.NewService(...)`:

```go
	otpTestCode := config.ResolveOTPTestCode(cfg.AppEnv, cfg.OTPTestCode)
	if cfg.OTPTestCode != "" && otpTestCode == "" {
		logger.Get().Warn("bootstrap: OTP_TEST_CODE ignored because APP_ENV=production")
	} else if otpTestCode != "" {
		logger.Get().Warn("bootstrap: OTP test code enabled (non-production only)",
			"app_env", cfg.AppEnv,
		)
	}
```

Ensure `clinic-api/pkg/config` is already imported as `config` (it is).

Then add to the `otp.Policy{...}` literal:

```go
			ResetBanOnSuccess: cfg.OTPResetBanOnSuccess,
			TestCode:          otpTestCode,
```

Do **not** log the actual test code digits.

- [ ] **Step 2: Document env example**

In `BackEnd/.env.local`, in the OTP section, add:

```bash
# Fixed OTP accepted on verify without /send. Ignored when APP_ENV=production.
# Leave empty (or unset) to disable. Development only.
OTP_TEST_CODE=123456
```

Also ensure `APP_ENV=development` (or non-production) is set in that file if not already.

Optionally add a commented line in `BackEnd/.env` OTP section (do not set a real value there if that file is used for closer-to-prod local runs):

```bash
# OTP_TEST_CODE=   # never enable in production; stripped when APP_ENV=production
```

- [ ] **Step 3: Compile check**

Run:

```bash
cd BackEnd && go build ./cmd/clinic-api/
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add BackEnd/cmd/clinic-api/bootstrap/app.go BackEnd/.env.local BackEnd/.env
git commit -m "$(cat <<'EOF'
feat(otp): wire OTP_TEST_CODE in bootstrap for non-production verify

EOF
)"
```

Note: If `.env` / `.env.local` are gitignored, commit only the tracked files that changed and mention the local env edit in the PR/summary instead of forcing those files into git.

- [ ] **Step 5: Manual smoke (optional)**

With backend running and `OTP_TEST_CODE=123456`, `APP_ENV=development`:

```bash
# Replace phone with an existing PATIENT account phone
curl -s -X POST http://localhost:8080/api/v1/auth/otp/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"09123456789","code":"123456"}'
```

Expected: JWT login response (or register flow) without prior `/auth/otp/send`. Wrong code without send still fails as before.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Fixed code accepted on verify | Task 2 |
| Explicit `OTP_TEST_CODE` only | Task 1 + 3 |
| No prior `/send` required | Task 2 |
| Bypass inside `verify` | Task 2 |
| Ignore in `APP_ENV=production` + warning | Task 1 helper + Task 3 bootstrap |
| Login + register both work | Shared `verify` (Task 2) |
| Unit tests | Tasks 1–2 |
| `.env.local` example | Task 3 |
| No frontend / new endpoints | Out of scope — no tasks |

## Self-review notes

- No placeholders; helper name `ResolveOTPTestCode` consistent across tasks.
- `Policy.TestCode` is the runtime field; raw config stays `OTPTestCode`.
- Constant-time compare required in Task 2 implementation step.
