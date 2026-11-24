package otp

import (
	"errors"
	"regexp"
	"strings"
)

// ErrInvalidPhone is returned by NormalizePhone when the input cannot be mapped
// to a valid Iranian mobile number in the canonical 09xxxxxxxxx form.
var ErrInvalidPhone = errors.New("otp: invalid iranian mobile number")

// phoneRegex validates the canonical Iranian mobile form: an 11-digit number
// starting with "09" whose operator prefix is one of the active ranges
// (090, 091, 092, 093, 099). It is matched against the *normalized* number only.
var phoneRegex = regexp.MustCompile(`^09(0[0-9]|1[0-9]|2[0-9]|3[0-9]|9[0-9])[0-9]{7}$`)

// IsValidPhone reports whether phone is a valid Iranian mobile number in the
// canonical 09xxxxxxxxx form. Callers should normalize first.
func IsValidPhone(phone string) bool {
	return phoneRegex.MatchString(phone)
}

// NormalizePhone canonicalizes an Iranian mobile number received from any
// client into the standard 09xxxxxxxxx form. It tolerates the common
// representations Iranians type:
//
//   - leading "+" or country code: +989149532509, 00989149532509, 989149532509
//   - a missing leading zero:        9149532509
//   - separators (spaces, dashes):   0914 953 2509, 0914-953-2509
//
// The result is validated against phoneRegex; anything that cannot be reduced
// to a valid number yields ErrInvalidPhone. All Redis keys and persisted
// records MUST be keyed on the normalized value so storage and lookups are
// stable regardless of how the client formatted the input.
func NormalizePhone(raw string) (string, error) {
	// Strip whitespace and common visual separators.
	s := strings.NewReplacer(" ", "", "-", "", "(", "", ")", "").
		Replace(raw)
	s = strings.TrimSpace(s)

	// Drop the optional leading "+" (international prefix).
	s = strings.TrimPrefix(s, "+")

	switch {
	// 0098... -> strip the 0098 country code, the canonical form starts with 09.
	case strings.HasPrefix(s, "0098"):
		s = "0" + strings.TrimPrefix(s, "0098")
	// 98... (e.g. 98914...) -> strip the 98 country code, prepend the trunk 0.
	case strings.HasPrefix(s, "98") && len(s) == 12:
		s = "0" + strings.TrimPrefix(s, "98")
	// Already trunk-prefixed (09...): keep as-is.
	case strings.HasPrefix(s, "0"):
		// no-op
	// Missing trunk zero (914...): prepend it.
	case strings.HasPrefix(s, "9") && len(s) == 10:
		s = "0" + s
	}

	if !IsValidPhone(s) {
		return "", ErrInvalidPhone
	}
	return s, nil
}
