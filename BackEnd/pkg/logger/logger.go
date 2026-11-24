// Package logger provides a thin, application-wide wrapper around the standard
// library's structured logger (log/slog).
//
// The active logger is initialized once at startup via Init and is then
// accessed anywhere in the codebase through Get. This keeps logging
// configuration centralized and consistent.
package logger

import (
	"log/slog"
	"os"
	"strings"
)

// logger is the package-level active logger. It is populated by Init and read
// by Get. Access is safe for concurrent use because slog.Logger is goroutine-
// safe and the variable is only written once during startup before any other
// goroutines begin logging.
var logger *slog.Logger

// Init configures and stores the active *slog.Logger. The level string is
// parsed case-insensitively and must be one of: debug, info, warn, error.
// Unknown values default to "info" so a typo can never disable logging
// entirely.
//
// The handler is selected based on the APP_ENV-style behavior implied by the
// caller: production deployments typically want the structured JSON handler
// while development favors the human-readable text handler.
func Init(level, env string) {
	lvl := parseLevel(level)

	var handler slog.Handler
	if isProduction(env) {
		// JSON output is best for log aggregation/ingestion in production.
		handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: lvl})
	} else {
		// Text output is easier to read while developing locally.
		handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: lvl})
	}

	logger = slog.New(handler)
	// Make the package-level default logger behave consistently too, so any
	// direct slog.Info(...) calls elsewhere use the same configuration.
	slog.SetDefault(logger)
}

// Get returns the active *slog.Logger. If Init was never called, it lazily
// initializes a default info-level text logger so callers never need to guard
// against a nil receiver.
func Get() *slog.Logger {
	if logger == nil {
		// Fallback to avoid nil-pointer panics during early bootstrap or tests.
		Init("info", "development")
	}
	return logger
}

// parseLevel converts a human-friendly level string into a slog.Level. Any
// unrecognized value resolves to LevelInfo.
func parseLevel(level string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		// Includes "info" and any typo/empty value.
		return slog.LevelInfo
	}
}

// isProduction reports whether the given environment should be treated as a
// production deployment (i.e. use the JSON handler).
func isProduction(env string) bool {
	return strings.EqualFold(strings.TrimSpace(env), "production")
}
