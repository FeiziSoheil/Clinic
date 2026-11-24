package normalizer

import (
	"reflect"
	"testing"
)

func TestNormalize(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"empty", "", ""},
		{"whitespace only", "   ", ""},
		{"trim and lowercase", "  Acetaminophen  ", "acetaminophen"},
		{"collapse spaces", "acetaminophen   500   mg", "acetaminophen 500 mg"},
		{"strip punctuation", "amoxicillin/clavulanate", "amoxicillin clavulanate"},
		{"strip braces fragment", "Acetaminophen {13 C (pack)}", "acetaminophen"},
		{"strip noise token pack", "Ibuprofen Pack", "ibuprofen"},
		{"diacritic fold", "Ibuprofène", "ibuprofene"},
		{"multi diacritic", "Naïve café", "naive cafe"},
		{"persian transliteration", "استامینوفن", "astamynvfn"},
		{"mixed persian and latin is normalized", "Acetaminophen استامینوفن", "acetaminophen astamynvfn"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Normalize(tc.in); got != tc.want {
				t.Errorf("Normalize(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestTokenize(t *testing.T) {
	got := Tokenize("  Acetaminophen 500 MG (Oral) Pack  ")
	// Punctuation/parens split, noise token "pack" removed, lowercased.
	want := []string{"acetaminophen", "500", "mg", "oral"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Tokenize(...) = %v, want %v", got, want)
	}
}

func TestBuildSearchName(t *testing.T) {
	if got := BuildSearchName("Acetaminophen"); got != "acetaminophen" {
		t.Errorf("BuildSearchName = %q, want %q", got, "acetaminophen")
	}
	// The search name must drop the brace fragment so a prefix search still
	// matches the bare generic.
	if got := BuildSearchName("Acetaminophen {12 C (pack)}"); got != "acetaminophen" {
		t.Errorf("BuildSearchName = %q, want %q", got, "acetaminophen")
	}
}

func TestParseDescription(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want DescriptionParts
	}{
		{
			name: "plan example tablet",
			in:   "acetaminophen 500 MG Oral Tablet",
			want: DescriptionParts{Strength: "500 mg", Form: "Tablet", Route: "Oral"},
		},
		{
			name: "suspension with ratio",
			in:   "amoxicillin 250 MG / 5 ML Oral Suspension",
			want: DescriptionParts{Strength: "250 mg", Form: "Suspension", Route: "Oral"},
		},
		{
			name: "ingredient only",
			in:   "insulin glargine",
			want: DescriptionParts{},
		},
		{
			name: "topical cream",
			in:   "hydrocortisone 1 % Topical Cream",
			want: DescriptionParts{Strength: "1 %", Form: "Cream", Route: "Topical"},
		},
		{
			name: "injection solution",
			in:   "Ceftriaxone 1 GRM Injection Solution",
			want: DescriptionParts{Strength: "1 grm", Form: "Solution", Route: "Injection"},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ParseDescription(tc.in)
			if !reflect.DeepEqual(got, tc.want) {
				t.Errorf("ParseDescription(%q) = %+v, want %+v", tc.in, got, tc.want)
			}
		})
	}
}

func TestTTYFilters(t *testing.T) {
	allowed := []string{"IN", "SCD", "SBD", "in", " SCD "}
	for _, tty := range allowed {
		if !IsAllowedTTY(tty) {
			t.Errorf("IsAllowedTTY(%q) = false, want true", tty)
		}
	}
	disallowed := []string{"BPCK", "GPCK", "PACK", "KIT", "pack", " kit "}
	for _, tty := range disallowed {
		if !IsDisallowedTTY(tty) {
			t.Errorf("IsDisallowedTTY(%q) = false, want true", tty)
		}
	}
	// A disallowed TTY must not also be allowed.
	if IsAllowedTTY("BPCK") {
		t.Errorf("IsAllowedTTY(BPCK) = true, want false")
	}
	// An allowed TTY must not also be flagged disallowed.
	if IsDisallowedTTY("IN") {
		t.Errorf("IsDisallowedTTY(IN) = true, want false")
	}
}
