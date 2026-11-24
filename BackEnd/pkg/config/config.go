// Package config is responsible for loading application configuration from
// environment variables (optionally backed by a .env file).
//
// It follows the project's Clean Architecture rules: this package lives in
// `pkg/` and therefore MUST NOT import anything from `internal/`.
package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config holds all runtime configuration values consumed by the application.
// Every field is populated from an environment variable with a sensible
// fallback default so the service can boot even when a variable is missing.
type Config struct {
	// Port is the TCP port the HTTP server binds to.
	Port string
	// MongoURI is the full MongoDB connection string.
	MongoURI string
	// MongoDBName is the name of the MongoDB database used by the app.
	MongoDBName string
	// JWTSecret is the secret used to sign and verify JWT tokens.
	JWTSecret string
	// JWTExpirationHours is the lifetime (in hours) of issued JWT tokens.
	JWTExpirationHours int
	// RedisURL is the Redis connection URL used for caching/sessions.
	RedisURL string
	// LogLevel controls the verbosity of the structured logger.
	LogLevel string
	// AppEnv is the deployment environment: "development" or "production".
	AppEnv string
	// AppBaseURL is the public base URL of the patient-facing web app (no trailing
	// slash). Used to build deep links in SMS notifications (e.g. prescription
	// download links).
	AppBaseURL string
	// AdminPhone is the phone number used by the bootstrap seeder to create the
	// default ADMIN account on first boot.
	AdminPhone string
	// AdminUsername is the login username used by the bootstrap seeder for the
	// default ADMIN account. Staff authenticate with Username + Password, so the
	// seeded admin needs a username to be able to log in.
	AdminUsername string
	// AdminPassword is the plaintext password used by the seeder for the
	// default ADMIN account (hashed with bcrypt before persistence).
	AdminPassword string
	// RxNormBaseURL is the base URL of the RxNorm (NLM) REST API consumed by the
	// medicine module for live drug lookups and local-index seeding.
	RxNormBaseURL string
	// MedicineCacheTTL is the time-to-live, in seconds, of entries held in the
	// in-memory medicine search cache.
	MedicineCacheTTL int
	// MedicineCacheMax is the maximum number of entries the in-memory medicine
	// search cache retains before evicting the least-recently-used item.
	MedicineCacheMax int
	// MedicineSeedOnBoot, when true, triggers an asynchronous best-effort seed
	// of the local medicine index from RxNorm during application startup. The
	// seed never blocks boot.
	MedicineSeedOnBoot bool
	// MedicineFallbackToRxNorm, when true, allows the medicine service to fall
	// back to a live RxNorm lookup when the local index yields no results. When
	// false, the service operates fully offline against the local index only.
	MedicineFallbackToRxNorm bool
	// SMSProvider selects the SMS transport used to deliver OTP codes. "mock"
	// (the default) only logs the message; "smsir" calls the sms.ir REST API.
	SMSProvider string
	// SMSIRAPIKey is the value sent as the "x-api-key" header to the sms.ir OTP
	// gateway. Required when SMS_PROVIDER=smsir.
	SMSIRAPIKey string
	// SMSIRBaseURL is the base URL of the sms.ir gateway (no trailing slash).
	SMSIRBaseURL string
	// SMSIROTPPath is the path appended to SMSIRBaseURL for OTP sends.
	SMSIROTPPath string
	// SMSIRTemplateID is the pre-approved OTP template id at sms.ir (the real
	// production value, e.g. "218976"). Sourced from .env so it never lives in
	// code.
	SMSIRTemplateID string
	// SMSIRCodeParam is the template parameter name that receives the OTP code
	// (e.g. "code" when the template variable is %code%).
	SMSIRCodeParam string
	// OTPLength is the number of digits in a generated code. The first digit is
	// always 1..9 (never zero) and codes are produced with crypto/rand.
	OTPLength int
	// OTPLoginTTLSeconds is the TTL of the active OTP code (otp:login key).
	OTPLoginTTLSeconds int
	// OTPCooldownSeconds is the resend-throttle window (otp:cooldown key): the
	// minimum interval between two OTP requests for the same phone.
	OTPCooldownSeconds int
	// OTPAttemptsTTLSeconds is the window over which wrong verification attempts
	// are counted (otp:attempts key TTL).
	OTPAttemptsTTLSeconds int
	// OTPMaxAttempts is the number of wrong verifications within the attempts
	// window that triggers a temporary block.
	OTPMaxAttempts int
	// OTPMaxRequests is the maximum number of OTP send requests allowed within
	// OTPRequestWindowSeconds before the phone is rate-limited.
	OTPMaxRequests int
	// OTPRequestWindowSeconds is the duration of the send-request rate-limit
	// window (otp:requests key TTL).
	OTPRequestWindowSeconds int
	// OTPBanLevel1Seconds is the temporary-block window applied on the first
	// offence (too many wrong attempts).
	OTPBanLevel1Seconds int
	// OTPBanLevel2Seconds is the window applied on the second offence.
	OTPBanLevel2Seconds int
	// OTPBanLevel3Seconds is the window applied on the third offence.
	OTPBanLevel3Seconds int
	// OTPBanLevel4PlusSeconds is the window applied on the fourth and every
	// subsequent offence (the escalation ceiling, e.g. one day).
	OTPBanLevel4PlusSeconds int
	// OTPResetBanOnSuccess, when true, clears the persisted ban tier after a
	// successful verification so a verified user starts fresh.
	OTPResetBanOnSuccess bool
	// OTPTestCode, when non-empty and AppEnv is not production, is accepted as a
	// valid OTP on verify without a prior send. Always empty/ignored in production
	// via ResolveOTPTestCode at bootstrap.
	OTPTestCode string
	// UploadDir is the base directory for televisit file uploads.
	UploadDir string
	// MaxUploadSizeMB is the maximum allowed upload size in megabytes.
	MaxUploadSizeMB int
	// AIServiceURL is the base URL of the Python previsit AI sidecar (no trailing slash).
	AIServiceURL string
	// PrevisitAIEnabled gates outbound calls to the AI sidecar.
	PrevisitAIEnabled bool
	// PrevisitAITimeout is the HTTP timeout for sidecar turn/finalize calls.
	PrevisitAITimeout time.Duration
}

// Load reads configuration from the process environment. A local `.env` file
// is loaded first via godotenv when present; this is purely a convenience for
// local development and the error is intentionally ignored in production where
// real env vars are injected by the orchestrator.
//
// All values fall back to safe defaults so that a missing variable never
// prevents startup. The function returns a pointer to a fully populated
// *Config, or an error if a value cannot be parsed.
func Load() (*Config, error) {
	// Attempt to load .env. Production deployments inject env vars directly, so
	// the file is optional; we only surface malformed-file errors and silently
	// ignore a missing one.
	//
	// IMPORTANT: godotenv.Load() (with no arguments) looks for ".env" in the
	// *current working directory*. When the binary is launched from a nested
	// folder (e.g. `go run main.go` from cmd/clinic-api/), the project-root
	// .env would never be found and every variable would silently fall back to
	// its (often insecure) default. We therefore resolve the .env location
	// robustly via findDotenv() (CWD upward search + go.mod marker).
	if path := findDotenv(); path != "" {
		_ = godotenv.Load(path)
	}

	cfg := &Config{
		Port:                     getEnv("APP_PORT", "8080"),
		MongoURI:                 getEnv("MONGO_URI", "mongodb://localhost:27017"),
		MongoDBName:              getEnv("MONGO_DB_NAME", "clinic_db"),
		JWTSecret:                getEnv("JWT_SECRET", "change-me-in-production"),
		RedisURL:                 getEnv("REDIS_URL", "redis://localhost:6379"),
		LogLevel:                 getEnv("LOG_LEVEL", "info"),
		AppEnv:                   getEnv("APP_ENV", "development"),
		AppBaseURL:               strings.TrimRight(getEnv("APP_BASE_URL", "http://localhost:3000"), "/"),
		AdminPhone:               getEnv("ADMIN_PHONE", "0000000000"),
		AdminUsername:            getEnv("ADMIN_USERNAME", "admin"),
		AdminPassword:            getEnv("ADMIN_PASSWORD", "admin123456"),
		RxNormBaseURL:            getEnv("RXNORM_BASE_URL", "https://rxnav.nlm.nih.gov/REST"),
		MedicineSeedOnBoot:       getEnvBool("MEDICINE_SEED_ON_BOOT", false),
		MedicineFallbackToRxNorm: getEnvBool("MEDICINE_FALLBACK_TO_RXNORM", true),
		JWTExpirationHours:       24,

		// SMS gateway. The provider defaults to "mock" so the app boots and the
		// OTP flow stays testable without real credentials. When SMS_IR_API_KEY
		// is set and SMS_PROVIDER is still "mock", it auto-upgrades to "smsir".
		SMSProvider: getEnv("SMS_PROVIDER", "mock"),

		// sms.ir OTP gateway. TemplateId and x-api-key are read from .env so
		// nothing sensitive is hard-coded; the production values are supplied by
		// the deployment, never committed.
		SMSIRAPIKey:     getEnv("SMS_IR_API_KEY", ""),
		SMSIRBaseURL:    getEnv("SMS_IR_BASE_URL", "https://api.sms.ir"),
		SMSIROTPPath:    getEnv("SMS_IR_OTP_PATH", "/v1/send/verify"),
		SMSIRTemplateID: getEnv("SMS_IR_TEMPLATE_ID", ""),
		SMSIRCodeParam:  getEnv("SMS_IR_CODE_PARAM", "code"),
	}

	// Parse the token lifetime, falling back to 24h on missing/invalid input.
	expHours, err := strconv.Atoi(getEnv("JWT_EXPIRATION_HOURS", "24"))
	if err != nil || expHours <= 0 {
		// Keep the default rather than failing: a missing or invalid value
		// should not crash the service on boot.
		expHours = 24
	}
	cfg.JWTExpirationHours = expHours

	// Parse the medicine cache TTL (seconds), falling back to 300 on
	// missing/invalid input. A non-positive value is treated as missing so a
	// typo never disables caching silently.
	cacheTTL, err := strconv.Atoi(getEnv("MEDICINE_CACHE_TTL_SECONDS", "300"))
	if err != nil || cacheTTL <= 0 {
		cacheTTL = 300
	}
	cfg.MedicineCacheTTL = cacheTTL

	// Parse the medicine cache max-entries bound, falling back to 10000 on
	// missing/invalid input.
	cacheMax, err := strconv.Atoi(getEnv("MEDICINE_CACHE_MAX_ENTRIES", "10000"))
	if err != nil || cacheMax <= 0 {
		cacheMax = 10000
	}
	cfg.MedicineCacheMax = cacheMax

	// Parse the OTP policy with safe defaults so a typo or a missing value never
	// disables authentication. Every duration is realized as a Redis key TTL.
	// The defaults follow the configured Iranian OTP conventions: 6-digit codes
	// (first digit 1..9) valid for 120s, a 60s resend cooldown, 5 wrong attempts
	// over 120s before a block, up to 3 sends per 10 minutes, and an escalating
	// ban (2m → 5m → 10m → 1 day). The ban tier resets after a successful verify.
	cfg.OTPLength = atoiDefault("OTP_LENGTH", 6)
	cfg.OTPLoginTTLSeconds = atoiDefault("OTP_LOGIN_TTL_SECONDS", 120)
	cfg.OTPCooldownSeconds = atoiDefault("OTP_COOLDOWN_SECONDS", 60)
	cfg.OTPAttemptsTTLSeconds = atoiDefault("OTP_ATTEMPTS_TTL_SECONDS", 120)
	cfg.OTPMaxAttempts = atoiDefault("OTP_MAX_ATTEMPTS", 5)
	cfg.OTPMaxRequests = atoiDefault("OTP_MAX_REQUESTS", 3)
	cfg.OTPRequestWindowSeconds = atoiDefault("OTP_REQUEST_WINDOW_SECONDS", 600)
	cfg.OTPBanLevel1Seconds = atoiDefault("OTP_BAN_LEVEL1_SECONDS", 120)
	cfg.OTPBanLevel2Seconds = atoiDefault("OTP_BAN_LEVEL2_SECONDS", 300)
	cfg.OTPBanLevel3Seconds = atoiDefault("OTP_BAN_LEVEL3_SECONDS", 600)
	cfg.OTPBanLevel4PlusSeconds = atoiDefault("OTP_BAN_LEVEL4PLUS_SECONDS", 86400)
	cfg.OTPResetBanOnSuccess = getEnvBool("OTP_RESET_BAN_ON_SUCCESS", true)
	cfg.OTPTestCode = getEnv("OTP_TEST_CODE", "")
	cfg.UploadDir = getEnv("UPLOAD_DIR", "./uploads/televisit")
	cfg.MaxUploadSizeMB = atoiDefault("MAX_UPLOAD_SIZE_MB", 10)

	cfg.AIServiceURL = strings.TrimRight(getEnv("AI_SERVICE_URL", ""), "/")
	cfg.PrevisitAIEnabled = getEnvBool("PREVISIT_AI_ENABLED", false)
	if d, err := time.ParseDuration(getEnv("PREVISIT_AI_TIMEOUT", "30s")); err == nil && d > 0 {
		cfg.PrevisitAITimeout = d
	} else {
		cfg.PrevisitAITimeout = 30 * time.Second
	}

	// When an API key is configured but SMS_PROVIDER was left unset, upgrade to
	// sms.ir so operators only have to set SMS_IR_API_KEY. An explicit
	// SMS_PROVIDER=mock (e.g. in .env) must win over the key auto-detect.
	if _, providerSet := os.LookupEnv("SMS_PROVIDER"); !providerSet && cfg.SMSIRAPIKey != "" {
		cfg.SMSProvider = "smsir"
	}

	// Basic sanity check: an empty MongoURI is unrecoverable.
	if cfg.MongoURI == "" {
		return nil, fmt.Errorf("config: MONGO_URI must not be empty")
	}

	return cfg, nil
}

// ResolveOTPTestCode returns code trimmed for use as a verify bypass, or "" when
// the environment is production or the code is empty. Bootstrap must use this
// (not the raw Config.OTPTestCode) when building otp.Policy.
func ResolveOTPTestCode(appEnv, code string) string {
	if strings.EqualFold(strings.TrimSpace(appEnv), "production") {
		return ""
	}
	return strings.TrimSpace(code)
}

// getEnv returns the value of the named environment variable, or the provided
// default when the variable is unset or empty.
func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

// getEnvBool returns the boolean value of the named environment variable, or
// the provided default when the variable is unset, empty or not a recognizable
// truthy/falsy token. Recognized truthy tokens are "1", "true", "yes", "on";
// recognized falsy tokens are "0", "false", "no", "off" (case-insensitive).
// Anything else falls back to the provided default.
func getEnvBool(key string, fallback bool) bool {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		switch strings.ToLower(strings.TrimSpace(v)) {
		case "1", "true", "yes", "on":
			return true
		case "0", "false", "no", "off":
			return false
		}
	}
	return fallback
}

// atoiDefault parses the named environment variable as an int, returning the
// provided default when the variable is unset, empty or not a positive integer.
// It centralizes the "parse-with-safe-default" pattern used by the OTP policy.
func atoiDefault(key string, fallback int) int {
	v, err := strconv.Atoi(getEnv(key, ""))
	if err != nil || v <= 0 {
		return fallback
	}
	return v
}

// findDotenv locates the project's ".env" file in a way that is independent of
// the current working directory. This makes `go run` / `go build` work whether
// invoked from the repository root or from a nested package directory.
//
// Resolution strategy (first match wins):
//  1. If MONGO-style absolute override is provided via the "DOTENV_PATH" env
//     var, use it verbatim (handy for tests / non-standard layouts).
//  2. Walk upward from the process working directory; prefer the closest
//     directory that contains BOTH "go.mod" (the module root marker) and
//     ".env". This is the canonical project-root .env.
//  3. Otherwise return the closest ".env" found while walking upward.
//  4. As a last resort, fall back to "./.env" (original behaviour) so that a
//     CWD-local file still works and production (no .env at all) is unaffected.
//
// Returns "" when no candidate file exists on disk.
func findDotenv() string {
	// (1) Explicit override.
	if p := os.Getenv("DOTENV_PATH"); p != "" {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}

	cwd, err := os.Getwd()
	if err != nil {
		return ".env"
	}

	// (2) & (3) Walk upward from CWD toward the filesystem root.
	dir := cwd
	var nearestDotenv string
	for {
		dotenvPath := filepath.Join(dir, ".env")
		hasDotenv := fileExists(dotenvPath)
		if hasDotenv && nearestDotenv == "" {
			nearestDotenv = dotenvPath
		}
		// Prefer the .env that lives at the Go module root (contains go.mod).
		if hasDotenv && fileExists(filepath.Join(dir, "go.mod")) {
			return dotenvPath
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			break // reached filesystem root
		}
		dir = parent
	}

	// (2.5) If we found a go.mod but no co-located .env, the .env may sit one
	// level above the module root; the upward walk already covered it, so only
	// return the nearest .env we actually found.
	if nearestDotenv != "" {
		return nearestDotenv
	}

	// (4) Final fallback: original behaviour.
	return ".env"
}

// fileExists reports whether path exists and is not a directory.
func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
