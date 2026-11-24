// Package errormap defines a uniform error representation for the HTTP API.
//
// Every API-facing error is expressed as an *APIError so that handlers can
// map business/infra failures to a consistent JSON shape:
//
//	{
//	  "code": 404,
//	  "message": "resource not found",
//	  "debug": { ... }   // optional, only in non-production contexts
//	}
//
// The package also exposes a set of pre-built common errors for the standard
// HTTP status codes, plus a From helper that converts arbitrary errors into
// an *APIError with sensible defaults.
package errormap

import (
	"errors"
	"fmt"
	"net/http"
)

// APIError is the canonical error type returned by the API. It satisfies the
// built-in error interface and carries an HTTP status code, a human-readable
// message, and an optional debug payload for diagnostics.
type APIError struct {
	// Code is the HTTP status code associated with the error.
	Code int `json:"code"`
	// Message is a stable, user-facing description of what went wrong.
	Message string `json:"message"`
	// Debug optionally holds extra diagnostic data. It is omitted from the
	// JSON response when nil/empty (see the omitempty tag). Callers should
	// avoid exposing sensitive internals in production.
	Debug interface{} `json:"debug,omitempty"`
}

// Error implements the error interface, allowing *APIError to be passed
// anywhere a standard error is expected while retaining structured metadata.
func (e *APIError) Error() string {
	if e == nil {
		return ""
	}
	return fmt.Sprintf("api error %d: %s", e.Code, e.Message)
}

// New constructs an *APIError with the given status code and message. Any
// trailing variadic arguments are attached to Debug (useful for ad-hoc
// context such as the offending field name or an underlying error).
//
// Example:
//
//	errormap.New(http.StatusBadRequest, "invalid email", map[string]any{"field": "email"})
func New(code int, message string, debug ...interface{}) *APIError {
	apiErr := &APIError{
		Code:    code,
		Message: message,
	}
	if len(debug) > 0 {
		apiErr.Debug = debug[0]
	}
	return apiErr
}

// ---------------------------------------------------------------------------
// Pre-defined common errors. These cover the most frequent HTTP statuses so
// handlers/services can return them directly without re-specifying the code
// or message each time.
// ---------------------------------------------------------------------------

var (
	// ErrBadRequest represents a 400 - malformed or invalid request.
	ErrBadRequest = New(http.StatusBadRequest, "bad request")
	// ErrUnauthorized represents a 401 - authentication required/failed.
	ErrUnauthorized = New(http.StatusUnauthorized, "unauthorized")
	// ErrForbidden represents a 403 - authenticated but not permitted.
	ErrForbidden = New(http.StatusForbidden, "forbidden")
	// ErrNotFound represents a 404 - resource does not exist.
	ErrNotFound = New(http.StatusNotFound, "not found")
	// ErrConflict represents a 409 - duplicate/conflicting state.
	ErrConflict = New(http.StatusConflict, "conflict")
	// ErrInternal represents a 500 - unexpected server-side failure.
	ErrInternal = New(http.StatusInternalServerError, "internal server error")
)

// From converts an arbitrary error into an *APIError. If the error is already
// an *APIError it is returned as-is (preserving its code/message/debug). Any
// other error is treated as an internal server error and its textual message
// is placed in the Debug field for traceability.
//
// This is the recommended entry point in error-handling middleware so unknown
// failure modes always serialize to a valid APIError.
func From(err error) *APIError {
	if err == nil {
		return nil
	}

	// Preserve an existing *APIError (and any wrapped variant).
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr
	}

	// Default to a 500 for opaque errors; keep the original message in Debug.
	return New(http.StatusInternalServerError, ErrInternal.Message, err.Error())
}
