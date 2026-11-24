// Package middleware bundles the HTTP middlewares used by the clinic API.
//
// This file provides authentication and authorization middlewares for Echo:
//
//   - JWTAuth verifies the "Authorization: Bearer <token>" header and, on
//     success, injects the caller's identity into the request context.
//   - RoleAuth enforces role-based access control (RBAC) on top of that
//     identity.
//
// Per the project's Clean Architecture rules this package lives in `pkg/` and
// therefore MUST NOT import anything from `internal/`.
package middleware

import (
	"strings"

	"github.com/labstack/echo/v4"

	"clinic-api/pkg/errormap"
	"clinic-api/pkg/jwt"
	"clinic-api/pkg/logger"
	"clinic-api/pkg/requestctx"
)

// bearerPrefix is the expected scheme prefix of the Authorization header.
const bearerPrefix = "Bearer "

// JWTAuth returns an Echo middleware that authenticates each request via a
// JWT carried in the Authorization header.
//
// On a valid token the middleware stores the resolved UserID and Role into the
// Echo context (via the requestctx helpers) so downstream handlers and the
// RoleAuth middleware can use them. On any failure it short-circuits the
// request with a structured 401 error produced through the errormap package,
// keeping the JSON error shape consistent across the whole API.
func JWTAuth(secret string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			// Extract the raw header; missing/empty is an authentication failure.
			authHeader := c.Request().Header.Get(echo.HeaderAuthorization)
			if authHeader == "" {
				return writeAPIError(c, errormap.ErrUnauthorized, "missing authorization header")
			}

			// Validate the scheme and strip the "Bearer " prefix.
			if !strings.HasPrefix(authHeader, bearerPrefix) {
				return writeAPIError(c, errormap.ErrUnauthorized, "invalid authorization scheme")
			}
			tokenString := strings.TrimSpace(strings.TrimPrefix(authHeader, bearerPrefix))
			if tokenString == "" {
				return writeAPIError(c, errormap.ErrUnauthorized, "empty bearer token")
			}

			// Verify the signature and lifecycle of the token.
			claims, err := jwt.ValidateToken(tokenString, secret)
			if err != nil {
				logger.Get().Debug("jwt validation failed", "error", err)
				return writeAPIError(c, errormap.ErrUnauthorized, "invalid or expired token")
			}

			// Persist the resolved identity for downstream handlers/middleware.
			requestctx.SetUserID(c, claims.UserID)
			requestctx.SetRole(c, claims.Role)

			return next(c)
		}
	}
}

// RoleAuth returns an Echo middleware that restricts access to the supplied
// roles. It MUST run after JWTAuth since it reads the role from the request
// context.
//
// If the caller's role is not in the allowed list the request is rejected with
// a 403 Forbidden error (using the errormap shape). If no role is present at
// all (i.e. JWTAuth did not run) the request is treated as unauthorized (401).
func RoleAuth(allowedRoles ...string) echo.MiddlewareFunc {
	// Build a set for O(1) membership checks; this is computed once per route
	// registration rather than per request.
	allowed := make(map[string]struct{}, len(allowedRoles))
	for _, r := range allowedRoles {
		allowed[strings.TrimSpace(r)] = struct{}{}
	}

	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			role := requestctx.GetRole(c)

			// No role at all means JWTAuth didn't run (or failed): treat as
			// unauthenticated rather than forbidden.
			if role == "" {
				return writeAPIError(c, errormap.ErrUnauthorized, "missing role in context")
			}

			if _, ok := allowed[role]; !ok {
				return writeAPIError(c, errormap.ErrForbidden, "insufficient permissions")
			}

			return next(c)
		}
	}
}

// writeAPIError serializes an *errormap.APIError into the HTTP response. The
// optional detail string is attached to the Debug field so operators can
// diagnose the failure without leaking it to end users in production-style
// deployments.
//
// It exists to keep the error JSON shape identical everywhere middlewares
// reject a request.
func writeAPIError(c echo.Context, apiErr *errormap.APIError, detail string) error {
	if detail != "" {
		// Return a fresh APIError so the package-level sentinel errors remain
		// unmutated; attaching Debug directly to the sentinel would be a data
		// race under concurrent requests.
		return c.JSON(apiErr.Code, errormap.New(apiErr.Code, apiErr.Message, detail))
	}
	return c.JSON(apiErr.Code, apiErr)
}
