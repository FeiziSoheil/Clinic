// Clinical normalization pipeline (RXNORM-PIPELINE / TTY-FILTER / COMBINATION).
//
// This file is the "Clinical Normalizer + Medicine Classifier" stage of the
// import pipeline:
//
//	RxNorm API -> Raw RxNorm Parser -> Clinical Normalizer -> Medicine
//	Classifier -> MongoDB Medicine Collection
//
// It turns a raw RxNorm description (the technical string RxNorm emits, e.g.
// "famotidine 26.6 MG / ibuprofen 800 MG Oral Tablet [Duexis]") into the clean,
// doctor-facing ClinicalParts:
//
//	GenericName: "Famotidine + Ibuprofen"
//	Brand:       "Duexis"
//	Ingredients: [{Famotidine, 26.6, MG}, {Ibuprofen, 800, MG}]
//	Strength:    "" (combination: strengths live in ingredients[])
//	DosageForm:  "Tablet"
//	Route:       "Oral"
//	IsCombination: true
//
// Parser guarantees (the clinical-correctness rules):
//   - Units (MG, ML, MCG, %), dosage forms (Tablet, Enema, ...), routes (Oral),
//     containers (Bottle, Vial) and release modifiers (Extended) are NEVER
//     treated as ingredients. Only active-ingredient name words are.
//   - The ingredient name is collected from ALL name-words in a segment, so a
//     description where the name follows the strength ("100 ML Sulfasalazine")
//     still yields the ingredient "Sulfasalazine" (never "ML").
//   - Ingredient strength is the numeric value and the unit is separate, e.g.
//     {Name:"Acetaminophen", Strength:"325", Unit:"MG"}.
//
// Everything here is pure (no I/O, no external dependencies) so it is trivially
// unit-testable. The normalizer owns its own output types so it never imports
// the model package; the service maps ClinicalParts onto model.Medicine.
package normalizer

import (
	"strconv"
	"strings"
	"unicode"
)

// ClinicalIngredient is a single active ingredient parsed from a raw RxNorm
// description. Strength is the numeric value (e.g. "325") and Unit the unit
// (e.g. "MG"); they are stored separately so the UI can render them uniformly.
type ClinicalIngredient struct {
	// Name is the canonical ingredient name, e.g. "Ibuprofen".
	Name string
	// Strength is the numeric strength value, e.g. "325". Empty when none.
	Strength string
	// Unit is the unit token, e.g. "MG". Empty when none.
	Unit string
}

// ClinicalParts holds the clinically normalized components extracted from a raw
// RxNorm description. This is the normalizer's own output type (the normalizer
// stays dependency-free); the service maps it onto model.Medicine.
type ClinicalParts struct {
	// GenericName is the clean, title-cased display name. For a combination it
	// joins ingredients with " + ", e.g. "Famotidine + Ibuprofen".
	GenericName string
	// Brand is the trade name parsed from the RxNorm "[...]" suffix, e.g.
	// "Advil"; empty for generics.
	Brand string
	// Ingredients lists the active ingredient(s) with their strengths.
	Ingredients []ClinicalIngredient
	// Strength is the clean display strength for a SINGLE-ingredient medicine
	// (e.g. "500 mg" or a concentration "250 mg / 5 ml"). It is EMPTY for
	// combinations — their strengths live in Ingredients[].
	Strength string
	// DosageForm is the normalized dosage form, e.g. "Tablet" or "Tablet (ER)".
	DosageForm string
	// Route is the administration route, e.g. "Oral".
	Route string
	// IsCombination reports whether more than one active ingredient was parsed.
	IsCombination bool
}

// ParseMedicine is the clinical-normalizer entry point. It converts a raw RxNorm
// description and its term type into structured ClinicalParts: it extracts the
// brand, detects combinations, parses ingredients/strengths/units, normalizes
// the dosage form, and derives the clean display name. Raw description text
// never survives into the output.
func ParseMedicine(desc, tty string) ClinicalParts {
	var p ClinicalParts

	p.Brand = ExtractBrand(desc)

	// Work on a brand/brace-stripped copy so the structural parser only sees the
	// ingredient/strength/form/route tokens.
	work := stripBraces(desc)
	work = stripBracketFragments(work)

	p.DosageForm = NormalizeDosageForm(work)
	p.Route = firstClinRoute(work)

	segments := splitIngredients(work)

	var displayPieces []string
	for _, seg := range segments {
		sp := parseSegment(seg)
		if sp.name != "" {
			p.Ingredients = append(p.Ingredients, ClinicalIngredient{
				Name:     TitleCase(sp.name),
				Strength: sp.num,
				Unit:     sp.unit,
			})
		}
		if sp.num != "" {
			piece := sp.num
			if sp.unit != "" {
				piece += " " + strings.ToLower(sp.unit)
			}
			displayPieces = append(displayPieces, piece)
		}
	}

	p.IsCombination = len(p.Ingredients) > 1

	// Combination: the authoritative strengths live in Ingredients[]. Single:
	// show the strength (covers plain strengths and concentrations).
	if p.IsCombination {
		p.Strength = ""
	} else {
		p.Strength = strings.Join(displayPieces, " / ")
	}

	// Clean display name: ingredients joined by " + " (title-cased). Fall back to
	// a name-only cleaned copy of the description when nothing parsed.
	if len(p.Ingredients) > 0 {
		names := make([]string, 0, len(p.Ingredients))
		for _, ing := range p.Ingredients {
			names = append(names, ing.Name)
		}
		p.GenericName = strings.Join(names, " + ")
	} else {
		p.GenericName = TitleCase(cleanNameFallback(work))
	}

	return p
}

// ExtractBrand pulls the content of the first "[...]" bracket from a raw RxNorm
// description (RxNorm embeds the trade name for branded products, e.g.
// "...Oral Tablet [Advil]") and returns it title-cased. Returns "" when there is
// no bracketed fragment.
func ExtractBrand(desc string) string {
	start := strings.Index(desc, "[")
	if start < 0 {
		return ""
	}
	end := strings.Index(desc[start:], "]")
	if end < 0 {
		return ""
	}
	inner := strings.TrimSpace(desc[start+1 : start+end])
	if inner == "" {
		return ""
	}
	return TitleCase(inner)
}

// ClassifyCategory maps the parsed combination flag and the RxNorm term type to
// the clinical category: combinations always win over TTY; SBD is a brand
// clinical drug; everything else (SCD/IN) is a generic clinical drug.
//
// TTY policy (TTY-FILTER): only IN/SCD/SBD reach this point — the disallowed
// packaging types (BPCK/GPCK/PACK/KIT) are dropped upstream by IsDisallowedTTY.
func ClassifyCategory(isCombination bool, tty string) string {
	if isCombination {
		return "combination"
	}
	switch strings.ToUpper(strings.TrimSpace(tty)) {
	case "SBD":
		return "brand"
	default:
		return "generic"
	}
}

// StrengthMagnitude returns the leading numeric magnitude of a strength string
// for stable tie-break sorting (e.g. "200 mg" -> 200, "26.6 mg / 800 mg" ->
// 26.6, "5 ml" -> 5). A non-numeric / empty strength yields 0.
func StrengthMagnitude(s string) float64 {
	var b strings.Builder
	started := false
	for _, r := range s {
		if (r >= '0' && r <= '9') || r == '.' {
			b.WriteRune(r)
			started = true
			continue
		}
		if started {
			break
		}
	}
	if b.Len() == 0 {
		return 0
	}
	v, err := strconv.ParseFloat(b.String(), 64)
	if err != nil {
		return 0
	}
	return v
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

// segmentParts is the per-"/" segment parse result.
type segmentParts struct {
	name string // joined ingredient name-words; "" when the segment has none
	num  string // the numeric strength value; "" when none
	unit string // the unit token (original case) following the number; "" if none
}

// parseSegment parses one "/" segment into the ingredient name (all name-words),
// the numeric strength value, and the unit. A segment with no name-words (a pure
// concentration/volume like "5 ML" or a form-only fragment) yields an empty name
// and is therefore not an ingredient.
//
// Name-words are collected from anywhere in the segment, so a description where
// the name follows the strength ("100 ML Sulfasalazine") still yields the
// ingredient "Sulfasalazine".
func parseSegment(seg string) segmentParts {
	var sp segmentParts
	var nameWords []string
	for _, tok := range splitWhitespace(seg) {
		lt := strings.ToLower(tok)
		switch {
		case isNumericToken(tok):
			if sp.num == "" {
				sp.num = tok
			}
		case isClinUnit(lt):
			// Attach the first unit that follows the number.
			if sp.unit == "" && sp.num != "" {
				sp.unit = tok
			}
		case isNameWord(tok):
			nameWords = append(nameWords, tok)
		}
		// Structural tokens (forms/routes/modifiers/containers) are ignored.
	}
	sp.name = strings.Join(nameWords, " ")
	return sp
}

// splitIngredients splits a description into its "/"-separated ingredient
// segments, trimming each. RxNorm separates combination ingredients (and
// concentration ratios) with " / ".
func splitIngredients(desc string) []string {
	if desc == "" {
		return nil
	}
	raw := strings.Split(desc, "/")
	out := make([]string, 0, len(raw))
	for _, s := range raw {
		s = strings.TrimSpace(s)
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}

// stripBracketFragments removes every "[...]" fragment from s (the trade-name
// suffix) so the structural parser does not see it. An unterminated opener
// swallows the rest of the string.
func stripBracketFragments(s string) string {
	var b strings.Builder
	depth := 0
	for _, r := range s {
		switch r {
		case '[':
			depth++
		case ']':
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

// cleanNameFallback returns a display-friendly fallback when no ingredient could
// be parsed: it keeps only name-words (dropping strength/route/form/unit tokens).
func cleanNameFallback(s string) string {
	var keep []string
	for _, tok := range splitWhitespace(s) {
		if isNameWord(tok) {
			keep = append(keep, tok)
		}
	}
	return strings.Join(keep, " ")
}

// TitleCase returns s with the first letter of each whitespace-delimited word
// upper-cased and the rest lower-cased. "ibuprofen" -> "Ibuprofen",
// "famotidine" -> "Famotidine".
func TitleCase(s string) string {
	words := strings.Fields(s)
	for i, w := range words {
		if w == "" {
			continue
		}
		r := []rune(w)
		r[0] = unicode.ToUpper(r[0])
		for j := 1; j < len(r); j++ {
			r[j] = unicode.ToLower(r[j])
		}
		words[i] = string(r)
	}
	return strings.Join(words, " ")
}
