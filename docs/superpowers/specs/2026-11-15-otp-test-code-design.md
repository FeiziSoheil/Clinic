# Fake OTP test code (design)

**Date:** 2026-11-15  
**Status:** Approved  
**Scope:** Backend OTP verify bypass for local/test environments

## Goal

Allow developers and automated tests to authenticate patients with a fixed OTP without calling `/auth/otp/send` or reading SMS/mock logs.

## Decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| Behavior | Fixed code always accepted on verify |
| Enablement | Explicit env only (`OTP_TEST_CODE`) |
| Prior `/send` required? | No |
| Approach | Bypass inside `otp.Service.verify` |
| Production safety | Ignore test code when `APP_ENV=production` |

## Architecture

Add optional `TestCode` to `otp.Policy`, loaded from `OTP_TEST_CODE` in config/bootstrap.

Activation rules:

1. `OTP_TEST_CODE` empty → current behavior unchanged.
2. Set **and** `APP_ENV=production` → value discarded at bootstrap; log a warning; verify behaves as today.
3. Set **and** non-production → `Policy.TestCode` is active.

No new HTTP endpoints. No frontend changes. Send/SMS/rate-limit/ban flows for real OTP remain unchanged.

```text
POST /auth/otp/login|register
        │
        ▼
  otp.Service.verify
        │
        ├─ TestCode active AND code matches? ──► success (skip Redis/block/attempts)
        │
        └─ else ──► existing block → GetCode → compare → attempts path
```

## Verify behavior

Order inside `verify`:

1. If `policy.TestCode` is non-empty and the submitted code matches it (constant-time compare) → success.
2. Otherwise → existing logic (block check, Redis code, attempts, ban escalation).

Details:

- Match both `VerifyLogin` and `VerifyRegister` (shared `verify`).
- On test-code success: best-effort `ResetState` / block cleanup when Redis state exists; do not fail if no OTP was ever issued.
- Wrong non-test codes still increment attempts when a stored code exists (unchanged).
- Real issued codes continue to work alongside the test code when both paths apply.

## Config

| Env | Meaning |
|-----|---------|
| `OTP_TEST_CODE` | Fixed digits accepted on verify when non-empty and not production |
| `APP_ENV` | `production` forces test code off even if env is set |

Files:

- `BackEnd/pkg/config/config.go` — `OTPTestCode` field + load from env
- `BackEnd/internal/otp/service.go` — `Policy.TestCode` + early return in `verify`
- `BackEnd/cmd/clinic-api/bootstrap/app.go` — gate on `AppEnv`, pass into `Policy`
- `BackEnd/.env.local` — documented example (e.g. `OTP_TEST_CODE=123456`)
- Unit tests under `BackEnd/internal/otp/`

## Testing

- With `TestCode` set and no Redis OTP → verify succeeds for that code.
- Wrong code with no Redis OTP → still `ErrCodeNotFound` (or existing error).
- With `TestCode` empty → behavior identical to today.
- Bootstrap/production gate: production + set env → `TestCode` not applied (unit or bootstrap-level check as practical).

## Out of scope

- Frontend / OTP UI changes
- New auth endpoints
- Changing send, SMS provider, or rate-limit policy
- Returning the test code from any API response

## Usage (after implementation)

```bash
# BackEnd/.env.local (development only)
APP_ENV=development
OTP_TEST_CODE=123456
```

Then call `POST /auth/otp/login` or `/auth/otp/register` with any valid phone and `code: "123456"` without prior send.
