// Package jwt provides JSON Web Token (JWT) generation and validation for the
// clinic application.
//
// Tokens are signed using HMAC-SHA256 and carry the authenticated user's
// identity (UserID) and authorization role. This package is intentionally
// stateless: it only knows how to mint and verify tokens. Revocation, refresh
// and storage concerns live elsewhere.
//
// Per the project's Clean Architecture rules this package lives in `pkg/` and
// therefore MUST NOT import anything from `internal/`.
package jwt

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims is the set of assertions encoded into every access token. It embeds
// the standard RegisteredClaims (iss, sub, exp, iat, ...) so that the
// golang-jwt library can validate the usual lifecycle fields, and augments them
// with the application-specific identity fields.
type Claims struct {
	// UserID is the unique identifier of the authenticated subject.
	UserID string `json:"user_id"`
	// Role is the authorization role granted to the subject (e.g. "admin",
	// "doctor", "patient").
	Role string `json:"role"`
	// RegisteredClaims holds the standard JWT claims (ExpiresAt, IssuedAt,
	// Subject, etc.). Embedding it lets the parser validate expiry for us.
	jwt.RegisteredClaims
}

// GenerateToken creates a signed JWT for the given user. The token expires
// after expiryHours and is signed with secret using the HMAC-SHA256 method.
//
// Returns the encoded token as a string ready to be sent in an
// "Authorization: Bearer <token>" header, or an error if signing fails.
func GenerateToken(userID, role, secret string, expiryHours int) (string, error) {
	// Guard against a misconfigured secret: signing with an empty key would
	// produce tokens that anyone can forge.
	if secret == "" {
		return "", fmt.Errorf("jwt: secret must not be empty")
	}

	now := time.Now()
	claims := &Claims{
		UserID: userID,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			// Subject is set to the user id so standard tooling can read it,
			// in addition to our custom UserID field.
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			// ExpiresAt drives the library's automatic expiry validation.
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Duration(expiryHours) * time.Hour)),
		},
	}

	// Build the token with our custom claims type and sign it.
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", fmt.Errorf("jwt: failed to sign token: %w", err)
	}

	return signed, nil
}

// ValidateToken parses and verifies the tokenString against secret. On success
// it returns the populated *Claims; on any validation failure (bad signature,
// malformed token, expired, ...) it returns an error.
//
// The caller is responsible for translating the returned error into an
// appropriate HTTP response (typically 401 Unauthorized).
func ValidateToken(tokenString, secret string) (*Claims, error) {
	// ParseWithClaims verifies the signature and runs the built-in validations
	// (exp, nbf) automatically. The key function guarantees the token used the
	// expected HMAC method and our secret.
	parsed, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		// Enforce the expected signing method to prevent algorithm-confusion
		// attacks (e.g. a token claiming "none" or an RSA public key).
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("jwt: unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, fmt.Errorf("jwt: invalid token: %w", err)
	}

	// Type-assert the parsed claims; this should always succeed given the
	// target type above, but we guard defensively.
	claims, ok := parsed.Claims.(*Claims)
	if !ok || !parsed.Valid {
		return nil, fmt.Errorf("jwt: invalid or malformed claims")
	}

	return claims, nil
}
