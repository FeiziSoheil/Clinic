// Package normalizer provides the pure, dependency-free text normalization
// primitives that power the Medicine search engine.
//
// It owns four concerns described in plans/medicine-search-refactor.md §8:
//
//   - Normalize/Tokenize: canonicalize a raw string (lowercase, trim, collapse
//     whitespace, strip diacritics and RxNorm noise tokens) so that two strings
//     referring to the same concept compare equal.
//   - Persian/Latin transliteration: map Persian script to a Latin form so a
//     typed name like "استامینوفن" can be compared against the Latin index.
//   - BuildSearchName: the canonical, prefix-friendly form of a generic name
//     stored on Medicine.SearchName and indexed for the prefix search tier.
//   - ParseDescription: split a raw RxNorm description such as
//     "acetaminophen 500 MG Oral Tablet" into its strength / dosage form / route
//     components, used to populate the structured Medicine fields.
//
// Everything here is pure (no I/O, no external dependencies) so it is trivially
// unit-testable and safe to call from any goroutine.
package normalizer

import (
	"strings"
	"unicode"
)

// ---------------------------------------------------------------------------
// RxNorm term-type policy (plan §9)
// ---------------------------------------------------------------------------

// disallowedTTYs are RxNorm term types that represent non-prescribable
// packaging aggregations. They are filtered out during ingestion.
var disallowedTTYs = map[string]struct{}{
	"BPCK": {},
	"GPCK": {},
	"PACK": {},
	"KIT":  {},
}

// allowedTTYs are the RxNorm term types retained in the local index: the
// canonical ingredient (IN) plus the semantic clinical/branded drugs (SCD/SBD).
var allowedTTYs = map[string]struct{}{
	"IN":  {},
	"SCD": {},
	"SBD": {},
}

// IsAllowedTTY reports whether tty is one of the term types the medicine domain
// keeps in its local index (IN, SCD, SBD). The check is case-insensitive.
func IsAllowedTTY(tty string) bool {
	_, ok := allowedTTYs[strings.ToUpper(strings.TrimSpace(tty))]
	return ok
}

// IsDisallowedTTY reports whether tty is one of the explicitly filtered
// packaging term types (BPCK, GPCK, PACK, KIT). The check is case-insensitive.
func IsDisallowedTTY(tty string) bool {
	_, ok := disallowedTTYs[strings.ToUpper(strings.TrimSpace(tty))]
	return ok
}

// ---------------------------------------------------------------------------
// Noise tokens
// ---------------------------------------------------------------------------

// noiseTokens are stop-word / packaging tokens that carry no search signal and
// are stripped during normalization so they cannot inflate or skew matches.
var noiseTokens = map[string]struct{}{
	"pack":   {},
	"packs":  {},
	"kit":    {},
	"kits":   {},
	"box":    {},
	"carton": {},
	"the":    {},
	"of":     {},
}

// ---------------------------------------------------------------------------
// Normalize / Tokenize
// ---------------------------------------------------------------------------

// Normalize returns the canonical comparable form of s. It lowercases, strips
// Persian→Latin transliteration and Latin diacritics, removes RxNorm brace
// fragments and punctuation, drops noise tokens and collapses whitespace.
//
// The result is suitable both for storage on Medicine.SearchName (via
// BuildSearchName) and for runtime query comparison.
func Normalize(s string) string {
	if s == "" {
		return ""
	}
	// 1) Transliterate Persian script to a Latin approximation first so the
	//    rest of the pipeline (lowercase/punctuation) operates uniformly.
	s = transliteratePersian(s)

	// 2) Strip diacritics from Latin characters (café → cafe).
	s = foldDiacritics(s)

	// 3) Lowercase.
	s = strings.ToLower(s)

	// 4) Drop RxNorm brace fragments such as "{12 C (pack)}".
	s = stripBraces(s)

	// 5+6) Tokenize (splits on whitespace/punctuation), drop noise tokens and
	//      re-join with single spaces. Reusing Tokenize keeps the noise removal
	//      rule in exactly one place.
	tokens := tokenizeRaw(s)
	cleaned := make([]string, 0, len(tokens))
	for _, tok := range tokens {
		if _, skip := noiseTokens[tok]; skip {
			continue
		}
		if tok == "" {
			continue
		}
		cleaned = append(cleaned, tok)
	}
	return strings.Join(cleaned, " ")
}

// Tokenize splits s on whitespace and punctuation, normalizes each token, drops
// empty tokens and RxNorm noise tokens, and returns the result. It is the
// per-token view used by the fuzzy tier (which compares the query against each
// token independently).
func Tokenize(s string) []string {
	tokens := tokenizeRaw(Normalize(s))
	out := make([]string, 0, len(tokens))
	for _, tok := range tokens {
		if tok == "" {
			continue
		}
		if _, skip := noiseTokens[tok]; skip {
			continue
		}
		out = append(out, tok)
	}
	return out
}

// BuildSearchName returns the prefix-friendly canonical form of a generic name.
// It is identical to Normalize today but exists as a named entry point so the
// search_name derivation is explicit and easy to evolve independently of query
// normalization (e.g. if the stored form should ever differ from the query form).
func BuildSearchName(generic string) string {
	return Normalize(generic)
}

// tokenizeRaw is the low-level splitter: it splits s on any run of whitespace
// or punctuation (keeping runs of letters, digits and the percent/percent-sign
// together so strengths such as "0.9%" or "500mg" survive). It does not apply
// noise removal; callers decide what to drop.
func tokenizeRaw(s string) []string {
	var b strings.Builder
	tokens := make([]string, 0, 8)
	flush := func() {
		if b.Len() > 0 {
			tokens = append(tokens, b.String())
			b.Reset()
		}
	}

	for _, r := range s {
		switch {
		case isTokenRune(r):
			b.WriteRune(r)
		default:
			// Whitespace or punctuation: a separator.
			flush()
		}
	}
	flush()
	return tokens
}

// isTokenRune reports whether r is part of a token (letter, digit, percent or
// hyphen). Hyphens and percents are kept so compound strengths ("500-1" in
// "hydrocodone-acetaminophen", "0.9%") are not shredded. '.' is kept so decimal
// strengths ("0.9") survive; it is consumed as part of the token.
func isTokenRune(r rune) bool {
	if unicode.IsLetter(r) || unicode.IsDigit(r) {
		return true
	}
	switch r {
	case '%', '-', '.':
		return true
	}
	return false
}

// stripBraces removes every "{...}" fragment from s (RxNorm embeds pack/box
// metadata in braces). An unterminated opener swallows the rest of the string,
// mirroring the lenient intent of the data.
func stripBraces(s string) string {
	var b strings.Builder
	depth := 0
	for _, r := range s {
		switch r {
		case '{':
			depth++
		case '}':
			if depth > 0 {
				depth--
			}
		default:
			if depth == 0 {
				b.WriteRune(r)
			}
		}
	}
	return b.String()
}

// ---------------------------------------------------------------------------
// Description parsing
// ---------------------------------------------------------------------------

// DescriptionParts holds the structured components ParseDescription extracts
// from a raw RxNorm description string.
type DescriptionParts struct {
	// Strength is the parsed strength, lowercased and units-normalized, e.g.
	// "500 mg". Empty when no strength is present.
	Strength string
	// Form is the parsed dosage form with its original casing preserved, e.g.
	// "Tablet". Empty when no form is present.
	Form string
	// Route is the parsed administration route with its original casing
	// preserved, e.g. "Oral". Empty when no route is present.
	Route string
}

// routeTokens is the set of RxNorm administration routes recognized by
// ParseDescription. The comparison is case-insensitive; the original-cased
// token is returned in DescriptionParts.Route.
var routeTokens = map[string]struct{}{
	"oral": {}, "topical": {}, "intravenous": {}, "injection": {},
	"rectal": {}, "vaginal": {}, "nasal": {}, "ophthalmic": {}, "otic": {},
	"inhalation": {}, "sublingual": {}, "buccal": {}, "transdermal": {},
	"subcutaneous": {}, "intramuscular": {}, "intrathecal": {},
	"epidural": {}, "intracervical": {}, "intraocular": {}, "auricular": {},
	"respiratory": {}, "urethral": {}, "sl": {}, "td": {}, "iv": {},
}

// formTokens is the set of RxNorm dosage forms recognized by ParseDescription.
var formTokens = map[string]struct{}{
	"tablet": {}, "tablets": {}, "capsule": {}, "capsules": {},
	"solution": {}, "suspension": {}, "syrup": {}, "elixir": {},
	"emulsion": {}, "cream": {}, "ointment": {}, "gel": {}, "lotion": {},
	"drops": {}, "spray": {}, "inhaler": {}, "powder": {}, "granule": {},
	"granules": {}, "patch": {}, "foam": {}, "suppository": {},
	"lozenge": {}, "gum": {}, "strip": {}, "disk": {}, "device": {},
	"ring": {}, "insert": {}, "implant": {}, "puff": {}, "pad": {},
	"swab": {}, "sponge": {}, "tape": {}, "pill": {}, "caps": {},
}

// strengthUnits is the set of unit tokens that, when adjacent to a numeric
// token, are folded into the parsed Strength.
var strengthUnits = map[string]struct{}{
	"mg": {}, "ml": {}, "mcg": {}, "meq": {}, "units": {}, "unit": {},
	"mmol": {}, "mol": {}, "g": {}, "gm": {}, "grm": {}, "gram": {}, "grams": {},
	"kg": {}, "ug": {}, "iu": {}, "meq/l": {}, "mmol/l": {}, "%": {},
	"mg/ml": {}, "mg/5ml": {},
}

// ParseDescription splits a raw RxNorm description such as
// "acetaminophen 500 MG Oral Tablet" into its {strength, form, route}
// components. It is intentionally heuristic: it scans whitespace-delimited
// tokens, gathering the numeric token plus any adjacent unit tokens into the
// strength, and recognizing routes/forms from a fixed vocabulary.
//
// Examples:
//
//	"acetaminophen 500 MG Oral Tablet" -> {Strength:"500 mg", Form:"Tablet", Route:"Oral"}
//	"amoxicillin 250 MG / 5 ML Oral Suspension" -> {Strength:"250 mg", Form:"Suspension", Route:"Oral"}
//	"insulin glargine" -> {Strength:"", Form:"", Route:""}
func ParseDescription(desc string) DescriptionParts {
	var parts DescriptionParts
	tokens := splitWhitespace(desc)
	if len(tokens) == 0 {
		return parts
	}

	for i := 0; i < len(tokens); i++ {
		tok := tokens[i]
		low := strings.ToLower(tok)

		// Route: single-token match.
		if _, ok := routeTokens[low]; ok && parts.Route == "" {
			parts.Route = tok
			continue
		}

		// Form: single-token match.
		if _, ok := formTokens[low]; ok && parts.Form == "" {
			parts.Form = tok
			continue
		}

		// Strength: a numeric token plus any immediately following unit tokens.
		if parts.Strength == "" && isNumericToken(tok) {
			strengthParts := []string{low}
			j := i + 1
			for j < len(tokens) {
				if _, isUnit := strengthUnits[strings.ToLower(tokens[j])]; isUnit {
					strengthParts = append(strengthParts, strings.ToLower(tokens[j]))
					j++
					continue
				}
				break
			}
			parts.Strength = strings.Join(strengthParts, " ")
			i = j - 1 // skip consumed unit tokens
			continue
		}
	}

	return parts
}

// splitWhitespace splits s on runs of whitespace, preserving the original
// tokens (no lowercasing). It is the lighter tokenizer used by ParseDescription,
// which must keep the original casing of form/route tokens.
func splitWhitespace(s string) []string {
	out := make([]string, 0, 8)
	for _, tok := range strings.Fields(s) {
		out = append(out, tok)
	}
	return out
}

// isNumericToken reports whether tok looks like the numeric lead of a strength,
// i.e. it contains at least one digit (covering "500", "0.9", "1,000", "325-1").
func isNumericToken(tok string) bool {
	for _, r := range tok {
		if unicode.IsDigit(r) {
			return true
		}
	}
	return false
}
