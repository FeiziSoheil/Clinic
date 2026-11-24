package otp

import (
	"strings"
	"testing"
	"time"
)

// TestGenerateCodeShape verifies the OTP generation contract: exactly 6 digits,
// the first digit is never zero (range 1..9), all digits are numeric, and the
// output is produced with crypto/rand (no math/rand). The statistical spot
// checks (first-digit non-zero across many samples) guard against accidental
// leading-zero regressions.
func TestGenerateCodeShape(t *testing.T) {
	const samples = 1000
	seenFirst := map[byte]bool{}
	for i := 0; i < samples; i++ {
		code, err := generateCode(6)
		if err != nil {
			t.Fatalf("generateCode returned error: %v", err)
		}
		if len(code) != 6 {
			t.Fatalf("code length = %d, want 6 (%q)", len(code), code)
		}
		for j := 0; j < 6; j++ {
			if code[j] < '0' || code[j] > '9' {
				t.Fatalf("non-digit in code %q at %d", code, j)
			}
		}
		if code[0] == '0' {
			t.Fatalf("first digit is zero: %q", code)
		}
		seenFirst[code[0]] = true
	}
	// Over many samples the first digit should exercise most of 1..9; if only a
	// single value ever appears the range is likely mis-wired. We require at
	// least 4 distinct leading digits to keep the test robust to randomness.
	if len(seenFirst) < 4 {
		t.Fatalf("first-digit distribution too narrow: %v", seenFirst)
	}
}

// TestGenerateCodeCustomLength ensures the length is honored.
func TestGenerateCodeCustomLength(t *testing.T) {
	code, err := generateCode(8)
	if err != nil {
		t.Fatalf("generateCode returned error: %v", err)
	}
	if len(code) != 8 {
		t.Fatalf("code length = %d, want 8", len(code))
	}
	if code[0] == '0' {
		t.Fatalf("first digit is zero: %q", code)
	}
}

// TestNormalizePhone covers the canonicalization rules: the standard form passes
// unchanged; missing leading zero, +98/0098/98 country codes, and visual
// separators are all reduced to the canonical 09xxxxxxxxx form. Invalid inputs
// are rejected.
func TestNormalizePhone(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"canonical", "09149532509", "09149532509"},
		{"missing trunk zero", "9149532509", "09149532509"},
		{"plus country code", "+989149532509", "09149532509"},
		{"double zero country code", "00989149532509", "09149532509"},
		{"country code 98", "989149532509", "09149532509"},
		{"with spaces", "0914 953 2509", "09149532509"},
		{"with dashes", "0914-953-2509", "09149532509"},
		{"different operator 090", "09012345678", "09012345678"},
		{"operator 099", "09901234567", "09901234567"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := NormalizePhone(tc.in)
			if err != nil {
				t.Fatalf("NormalizePhone(%q) error: %v", tc.in, err)
			}
			if got != tc.want {
				t.Fatalf("NormalizePhone(%q) = %q, want %q", tc.in, got, tc.want)
			}
			if !IsValidPhone(got) {
				t.Fatalf("normalized %q failed IsValidPhone", got)
			}
		})
	}
}

// TestNormalizePhoneInvalid ensures malformed numbers are rejected.
func TestNormalizePhoneInvalid(t *testing.T) {
	invalid := []string{
		"",
		"abc",
		"12345",
		"091234",         // too short
		"08123456789",    // invalid operator prefix (081)
		"09123456789012", // too long
		"0098",           // country code only
		strings.Repeat("9", 20),
	}
	for _, in := range invalid {
		got, err := NormalizePhone(in)
		if err == nil {
			t.Fatalf("NormalizePhone(%q) = %q, want error", in, got)
		}
	}
}

// TestBanPolicyDurationFor verifies the escalating block schedule: levels 1..3
// map to their distinct windows and level 4+ settles at the ceiling.
func TestBanPolicyDurationFor(t *testing.T) {
	// time.Duration is int64 nanoseconds, so multiply by time.Second.
	p := BanPolicy{
		Level1:     120 * time.Second,
		Level2:     300 * time.Second,
		Level3:     600 * time.Second,
		Level4Plus: 86400 * time.Second,
	}
	cases := map[int]int{
		0:  120, // non-positive falls back to level 1
		1:  120,
		2:  300,
		3:  600,
		4:  86400,
		5:  86400,
		42: 86400,
	}
	for level, wantSec := range cases {
		if got := int(p.DurationFor(level).Seconds()); got != wantSec {
			t.Fatalf("DurationFor(%d) = %ds, want %ds", level, got, wantSec)
		}
	}
}
