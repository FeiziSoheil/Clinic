// Package requestctx provides typed helpers for reading and writing values
// to request-scoped contexts.
//
// There are two complementary flavors of helper:
//
//   - The Echo variants (SetUserID/GetUserID/...) operate on echo.Context and
//     are used inside HTTP handlers and middleware.
//   - The standard-library variant (GetUserIDFromContext) operates on a plain
//     context.Context so that the identity can be propagated through the
//     service/repository layers without dragging Echo into `internal/`.
//
// Per the project's Clean Architecture rules this package lives in `pkg/` and
// therefore MUST NOT import anything from `internal/`.
package requestctx

import (
	"context"

	"github.com/labstack/echo/v4"
)

// contextKey is an unexported type so the keys defined below cannot collide
// with keys defined in other packages that happen to share the same string.
type contextKey string

const (
	// contextKeyUserID is the key under which the authenticated user's id is
	// stored in both echo.Context and standard context.Context.
	contextKeyUserID contextKey = "user_id"
	// contextKeyRole is the key under which the authenticated user's role is
	// stored.
	contextKeyRole contextKey = "role"
)

// SetUserID stores the given userID in the Echo request context for use by
// downstream handlers.
func SetUserID(c echo.Context, userID string) {
	c.Set(string(contextKeyUserID), userID)
}

// GetUserID retrieves the authenticated user's id previously stored in the
// Echo context. It returns an empty string when no value was set, which is the
// expected state for unauthenticated/unprocessed requests.
func GetUserID(c echo.Context) string {
	if v, ok := c.Get(string(contextKeyUserID)).(string); ok {
		return v
	}
	return ""
}

// SetRole stores the given role in the Echo request context.
func SetRole(c echo.Context, role string) {
	c.Set(string(contextKeyRole), role)
}

// GetRole retrieves the authenticated user's role from the Echo context. It
// returns an empty string when no value was set.
func GetRole(c echo.Context) string {
	if v, ok := c.Get(string(contextKeyRole)).(string); ok {
		return v
	}
	return ""
}

// GetUserIDFromContext reads the user id from a standard library context. This
// variant is intended for code paths that flow through `internal/` where we
// cannot (and should not) depend on Echo. It returns an empty string when the
// value is absent or of an unexpected type.
func GetUserIDFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if v, ok := ctx.Value(contextKeyUserID).(string); ok {
		return v
	}
	return ""
}

// GetRoleFromContext reads the user role from a standard library context, the
// mirror of GetUserIDFromContext for the role field.
func GetRoleFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if v, ok := ctx.Value(contextKeyRole).(string); ok {
		return v
	}
	return ""
}

// WithUserID returns a derived context carrying the given user id. It is the
// standard-context counterpart of SetUserID and lets services attach the
// identity before passing the context deeper into the call graph.
func WithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, contextKeyUserID, userID)
}

// WithRole returns a derived context carrying the given role.
func WithRole(ctx context.Context, role string) context.Context {
	return context.WithValue(ctx, contextKeyRole, role)
}
