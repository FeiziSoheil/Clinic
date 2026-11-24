package otp

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"errors"
	"math/big"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"clinic-api/internal/notification"
	"clinic-api/internal/user"
	"clinic-api/pkg/database"
	pkgjwt "clinic-api/pkg/jwt"
	"clinic-api/pkg/logger"
)

// Policy bundles the tunable OTP send/verify parameters. It is populated from
// configuration in bootstrap and treated as immutable by the service. Every
// duration is realized as a Redis key TTL, never stored inside a value.
type Policy struct {
	// Length is the number of digits in a generated code (the first digit is
	// guaranteed non-zero).
	Length int
	// LoginTTL is how long an issued code stays valid (otp:login TTL).
	LoginTTL time.Duration
	// Cooldown is the minimum interval enforced between two OTP requests for the
	// same phone (otp:cooldown TTL).
	Cooldown time.Duration
	// AttemptsTTL bounds the window in which wrong attempts are counted
	// (otp:attempts TTL).
	AttemptsTTL time.Duration
	// MaxAttempts is the number of wrong verifications within AttemptsTTL that
	// triggers a temporary block.
	MaxAttempts int
	// MaxRequests is the maximum number of OTP send requests allowed within
	// RequestWindow before the phone is rate-limited.
	MaxRequests int
	// RequestWindow is the duration of the send-request rate-limit window
	// (otp:requests TTL).
	RequestWindow time.Duration
	// Ban expresses the escalating per-level temporary-block windows.
	Ban BanPolicy
	// ResetBanOnSuccess, when true, clears the persisted ban tier after a
	// successful verification so a returning, verified user starts fresh.
	ResetBanOnSuccess bool
	// TestCode, when non-empty, is accepted as a valid OTP on verify without a
	// prior send. Intended for non-production only; bootstrap must leave this
	// empty when APP_ENV=production.
	TestCode string
}

// Service implements the OTP authentication flow. It owns the Redis-backed code
// store, an SMS transport, the persisted ban-level repository, the user
// repository (to look up / create accounts on successful verification) and the
// JWT settings needed to mint login tokens.
type Service struct {
	store    Store
	sms      notification.CodeSender
	bans     *BanLevelRepository
	userRepo *database.Repository[user.User]

	jwtSecret      string
	jwtExpiryHours int
	policy         Policy
}

// NewService constructs a Service with the given collaborators and policy. The
// store and bans are injected (rather than created here) so tests can supply
// fakes.
func NewService(
	store Store,
	sms notification.CodeSender,
	bans *BanLevelRepository,
	userRepo *database.Repository[user.User],
	jwtSecret string,
	jwtExpiryHours int,
	policy Policy,
) *Service {
	return &Service{
		store:          store,
		sms:            sms,
		bans:           bans,
		userRepo:       userRepo,
		jwtSecret:      jwtSecret,
		jwtExpiryHours: jwtExpiryHours,
		policy:         policy,
	}
}

// SendOTP generates a fresh numeric code for phone, persists it with the
// configured TTL and dispatches it over SMS. The phone MUST already be
// normalized. It enforces, in order:
//  1. Block: an active ban (otp:block) blocks all sends for the remaining
//     window (returned as *RetryError wrapping ErrBlocked).
//  2. Request limit: once MaxRequests sends have been issued within
//     RequestWindow, further sends are rejected until the window elapses
//     (*RetryError wrapping ErrRequestLimit).
//  3. Cooldown: while otp:cooldown is active, a new request is rejected
//     (*RetryError wrapping ErrCooldown).
//
// When all guards pass it issues a fresh code, writes otp:login (TTL=LoginTTL),
// otp:cooldown (TTL=Cooldown), resets otp:attempts for the new code, sends the
// SMS and counts the request against the rate-limit window. The phone's
// registration status is intentionally NOT checked so the endpoint cannot be
// used to enumerate accounts.
func (s *Service) SendOTP(ctx context.Context, phone string) (*SendOTPResponse, error) {
	// 1) Block check: an active ban blocks everything.
	if ttl, err := s.store.BlockTTL(ctx, phone); err != nil {
		logger.Get().Error("otp: block check failed", "phone", phone, "error", err)
		return nil, err
	} else if ttl > 0 {
		return nil, retry(ErrBlocked, ttl)
	}

	// 2) Request-limit check: too many sends within the window.
	if used, err := s.store.RequestsCount(ctx, phone); err != nil {
		logger.Get().Error("otp: requests count failed", "phone", phone, "error", err)
		return nil, err
	} else if used >= s.policy.MaxRequests {
		remaining, _ := s.store.RequestsTTL(ctx, phone)
		logger.Get().Warn("otp: request limit reached",
			"phone", phone, "used", used, "retry_after", remaining)
		return nil, retry(ErrRequestLimit, remaining)
	}

	// 3) Cooldown check: throttle back-to-back requests.
	if ttl, err := s.store.CooldownTTL(ctx, phone); err != nil {
		logger.Get().Error("otp: cooldown check failed", "phone", phone, "error", err)
		return nil, err
	} else if ttl > 0 {
		return nil, retry(ErrCooldown, ttl)
	}

	// 4) Issue a fresh single-use code.
	code, err := generateCode(s.policy.Length)
	if err != nil {
		logger.Get().Error("otp: code generation failed", "phone", phone, "error", err)
		return nil, err
	}

	// Persist the bare code, arm the cooldown and reset the wrong-attempt
	// counter so the new code gets a fresh budget.
	if err := s.store.SetCode(ctx, phone, code, s.policy.LoginTTL); err != nil {
		logger.Get().Error("otp: set code failed", "phone", phone, "error", err)
		return nil, err
	}
	if err := s.store.SetCooldown(ctx, phone, s.policy.Cooldown); err != nil {
		logger.Get().Error("otp: set cooldown failed", "phone", phone, "error", err)
		return nil, err
	}
	if err := s.store.DeleteAttempts(ctx, phone); err != nil {
		logger.Get().Error("otp: reset attempts failed", "phone", phone, "error", err)
		return nil, err
	}

	// Surface the code at debug level so it is visible during local testing
	// (LOG_LEVEL=debug) without leaking it in production info logs.
	logger.Get().Debug("otp: generated code", "phone", phone, "code", code)

	// Deliver via the configured gateway (sms.ir pattern OTP). The expiry in
	// minutes is passed so transport that supports it can render it.
	expiryMin := int(s.policy.LoginTTL.Minutes())
	if expiryMin <= 0 {
		expiryMin = 1
	}
	if err := s.sms.SendCode(ctx, phone, code, expiryMin); err != nil {
		// Delivery failed: discard the issued code + cooldown so the user can
		// immediately retry.
		_ = s.store.ResetState(ctx, phone)
		logger.Get().Error("otp: sms dispatch failed", "phone", phone, "error", err)
		return nil, ErrSMSDispatch
	}

	// 5) Count this issue against the rate-limit window only after delivery
	//    succeeded. The window TTL is seeded on first creation.
	used, err := s.store.IncrementRequests(ctx, phone, s.policy.RequestWindow)
	if err != nil {
		logger.Get().Error("otp: increment requests failed", "phone", phone, "error", err)
		// Non-fatal: the code was already sent; just report a degraded quota.
		used = s.policy.MaxRequests
	}
	remaining := s.policy.MaxRequests - used
	if remaining < 0 {
		remaining = 0
	}

	logger.Get().Info("otp: code sent", "phone", phone, "remaining_requests", remaining)
	return &SendOTPResponse{
		ExpiresIn:        int(s.policy.LoginTTL.Seconds()),
		ResendIn:         int(s.policy.Cooldown.Seconds()),
		RemainingResends: remaining,
		MaxResends:       s.policy.MaxRequests,
	}, nil
}

// VerifyLogin confirms the code for phone and, on success, authenticates the
// existing account by issuing a JWT. The phone MUST already be normalized. An
// unknown phone yields ErrUserNotFound so the client can prompt the user to
// register instead.
func (s *Service) VerifyLogin(ctx context.Context, req VerifyLoginRequest) (*user.LoginResponse, error) {
	if err := s.verify(ctx, req.Phone, req.Code); err != nil {
		return nil, err
	}

	u, err := s.userRepo.FindOne(ctx, bson.M{"phone": req.Phone})
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, user.ErrUserNotFound
		}
		logger.Get().Error("otp: login lookup failed", "phone", req.Phone, "error", err)
		return nil, err
	}

	// OTP is the patient-only authentication path. Staff authenticate with
	// username + password, so an OTP login for a non-PATIENT account is refused.
	if u.Role != user.RolePatient {
		logger.Get().Warn("otp: non-patient attempted OTP login", "phone", req.Phone, "role", u.Role)
		return nil, ErrStaffMustUsePassword
	}

	return s.issueToken(u)
}

// VerifyRegister confirms the code for phone and, on success, creates a new
// PATIENT account and issues a JWT. The phone MUST already be normalized. A phone
// that is already registered yields ErrUserAlreadyExists.
func (s *Service) VerifyRegister(ctx context.Context, req VerifyRegisterRequest) (*user.LoginResponse, error) {
	if err := s.verify(ctx, req.Phone, req.Code); err != nil {
		return nil, err
	}

	// Enforce phone uniqueness before creating.
	existing, err := s.userRepo.FindOne(ctx, bson.M{"phone": req.Phone})
	if err != nil && !errors.Is(err, database.ErrNotFound) {
		logger.Get().Error("otp: register lookup failed", "phone", req.Phone, "error", err)
		return nil, err
	}
	if existing != nil {
		return nil, user.ErrUserAlreadyExists
	}

	now := time.Now()
	u := user.User{
		ID:           primitive.NewObjectID(),
		Phone:        req.Phone,
		Role:         user.RolePatient,
		FirstName:    req.FirstName,
		LastName:     req.LastName,
		NationalCode: req.NationalCode,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	id, err := s.userRepo.Insert(ctx, u)
	if err != nil {
		logger.Get().Error("otp: register insert failed", "phone", req.Phone, "error", err)
		return nil, err
	}
	u.ID = id

	logger.Get().Info("user registered via otp", "id", u.ID.Hex(), "role", u.Role)

	return s.issueToken(&u)
}

// verify is the shared code-check used by both VerifyLogin and VerifyRegister.
// It implements the block-aware, attempt-counting verification against the
// Redis store and, on too many wrong attempts, escalates and applies a
// temporary block (persisting the tier in the database so it survives Redis
// restarts).
func (s *Service) verify(ctx context.Context, phone, code string) error {
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

	// 1) Block check: an active ban blocks all verification for its window.
	if ttl, err := s.store.BlockTTL(ctx, phone); err != nil {
		logger.Get().Error("otp: verify block check failed", "phone", phone, "error", err)
		return err
	} else if ttl > 0 {
		return retry(ErrBlocked, ttl)
	}

	// 2) Read the stored code. Absent/expired == no active code.
	stored, err := s.store.GetCode(ctx, phone)
	if err != nil {
		logger.Get().Error("otp: read code failed", "phone", phone, "error", err)
		return err
	}
	if stored == "" {
		return ErrCodeNotFound
	}

	// 3) Constant-time comparison to avoid leaking the code via timing.
	if subtle.ConstantTimeCompare([]byte(stored), []byte(code)) == 1 {
		// Success: consume the single-use code and clear every piece of OTP
		// state for this phone (login, cooldown, attempts and any block
		// marker). The block is normally already absent here (the block-check
		// above gates verification), but deleting it is spec-faithful and
		// robust to any future flow change.
		if err := s.store.ResetState(ctx, phone); err != nil {
			logger.Get().Error("otp: reset state failed", "phone", phone, "error", err)
		}
		if err := s.store.DeleteBlock(ctx, phone); err != nil {
			logger.Get().Warn("otp: delete block failed", "phone", phone, "error", err)
		}
		// Per policy, optionally reset the persisted ban tier so a verified user
		// starts with a fresh escalation slate.
		if s.policy.ResetBanOnSuccess && s.bans != nil {
			if err := s.bans.Reset(ctx, phone); err != nil && !errors.Is(err, ErrStoreUnavailable) {
				logger.Get().Warn("otp: ban reset failed", "phone", phone, "error", err)
			}
		}
		return nil
	}

	// 4) Wrong code: count the attempt.
	attempts, err := s.store.IncrementAttempts(ctx, phone, s.policy.AttemptsTTL)
	if err != nil {
		logger.Get().Error("otp: increment attempts failed", "phone", phone, "error", err)
		return ErrInvalidCode
	}

	// 5) Threshold reached: escalate the ban tier and apply a temporary block.
	if attempts >= s.policy.MaxAttempts {
		return s.applyBlock(ctx, phone)
	}

	return ErrInvalidCode
}

// applyBlock escalates the persisted ban tier for phone, computes the window for
// the new tier, writes the otp:block marker (auto-expiring) and returns a
// *RetryError carrying the window. It also clears the now-consumed code state so
// a fresh OTP must be requested after the block lifts.
func (s *Service) applyBlock(ctx context.Context, phone string) error {
	level := 1
	if s.bans != nil {
		lvl, err := s.bans.Increment(ctx, phone)
		if err != nil && !errors.Is(err, ErrStoreUnavailable) {
			logger.Get().Error("otp: ban increment failed", "phone", phone, "error", err)
		}
		if lvl > 0 {
			level = lvl
		}
	}

	window := s.policy.Ban.DurationFor(level)

	if err := s.store.SetBlock(ctx, phone, window); err != nil {
		logger.Get().Error("otp: set block failed", "phone", phone, "error", err)
	}
	// Consume the code so a new one must be issued after the block lifts.
	if err := s.store.ResetState(ctx, phone); err != nil {
		logger.Get().Warn("otp: reset state on block failed", "phone", phone, "error", err)
	}

	logger.Get().Warn("otp: phone blocked after too many wrong attempts",
		"phone", phone, "ban_level", level, "block_window", window)

	return retry(ErrBlocked, window)
}

// issueToken mints a signed JWT for the given user and wraps it in the shared
// LoginResponse shape used across all authentication paths.
func (s *Service) issueToken(u *user.User) (*user.LoginResponse, error) {
	token, err := pkgjwt.GenerateToken(u.ID.Hex(), string(u.Role), s.jwtSecret, s.jwtExpiryHours)
	if err != nil {
		logger.Get().Error("otp: token generation failed", "user_id", u.ID.Hex(), "error", err)
		return nil, err
	}
	return &user.LoginResponse{Token: token, User: u.ToResponse()}, nil
}

// generateCode returns a cryptographically random numeric string of the given
// length using crypto/rand so codes are not predictable. The first digit is
// guaranteed to be in the range 1..9 (never zero) so the code is always a true
// length-N number with no leading zero, while the remaining digits span 0..9.
// math/rand is deliberately never used.
func generateCode(length int) (string, error) {
	if length <= 0 {
		length = 6
	}
	digits := make([]byte, length)

	// First digit: 1..9 (uniform), never zero.
	first, err := rand.Int(rand.Reader, big.NewInt(9))
	if err != nil {
		return "", err
	}
	digits[0] = byte('0' + first.Int64() + 1)

	// Remaining digits: 0..9 (uniform).
	for i := 1; i < length; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", err
		}
		digits[i] = byte('0' + n.Int64())
	}
	return string(digits), nil
}
