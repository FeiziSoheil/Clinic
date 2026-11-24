// Dosage-form normalization and the clinical vocabulary used to parse a raw
// RxNorm description into structured clinical parts.
//
// Two concerns live here:
//
//  1. NormalizeDosageForm collapses verbose RxNorm form phrases into a clean,
//     compact clinical form ("Extended Release Oral Tablet" -> "Tablet (ER)",
//     "Delayed Release Capsule" -> "Capsule (DR)", "Oral Suspension" ->
//     "Suspension", "Topical Gel" -> "Gel").
//
//  2. The vocabulary sets (units, dosage forms, containers, release modifiers,
//     routes, descriptors) back isNameWord: the single rule that decides whether
//     a token is part of an active-ingredient name or a structural/numeric token.
//     This is what stops units ("ML", "MG"), forms ("Tablet", "Enema"), routes
//     ("Oral"), containers ("Bottle") and modifiers ("Extended") from ever being
//     mistaken for ingredients.
//
// Everything here is pure (no I/O, no external dependencies).
package normalizer

import "strings"

// ---------------------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------------------

// clinForms maps a dosage-form token (lowercased) to its clean title-cased base
// form. It is the authoritative set for both base-form detection and the
// non-name vocabulary.
var clinForms = map[string]string{
	"tablet":      "Tablet",
	"tablets":     "Tablet",
	"caplet":      "Tablet",
	"capsule":     "Capsule",
	"capsules":    "Capsule",
	"cap":         "Capsule",
	"caps":        "Capsule",
	"pill":        "Tablet",
	"solution":    "Solution",
	"suspension":  "Suspension",
	"syrup":       "Syrup",
	"elixir":      "Elixir",
	"emulsion":    "Emulsion",
	"cream":       "Cream",
	"ointment":    "Ointment",
	"gel":         "Gel",
	"lotion":      "Lotion",
	"paste":       "Paste",
	"drops":       "Drops",
	"drop":        "Drops",
	"spray":       "Spray",
	"inhaler":     "Inhaler",
	"aerosol":     "Aerosol",
	"powder":      "Powder",
	"granule":     "Granule",
	"granules":    "Granule",
	"patch":       "Patch",
	"foam":        "Foam",
	"suppository": "Suppository",
	"enema":       "Enema",
	"lozenge":     "Lozenge",
	"troche":      "Lozenge",
	"gum":         "Gum",
	"strip":       "Strip",
	"disk":        "Disk",
	"disc":        "Disk",
	"device":      "Device",
	"ring":        "Ring",
	"insert":      "Insert",
	"implant":     "Implant",
	"pad":         "Pad",
	"swab":        "Swab",
	"sponge":      "Sponge",
	"tape":        "Tape",
	"bar":         "Bar",
	"injectable":  "Injection",
	"injection":   "Injection",
}

// clinUnits are strength/volume unit tokens that must never be ingredient
// names. Keys are lowercased; lookup lowercases the token.
var clinUnits = map[string]struct{}{
	"mg": {}, "ml": {}, "mcg": {}, "ug": {}, "meq": {}, "mmol": {}, "mol": {},
	"units": {}, "unit": {}, "iu": {}, "g": {}, "gm": {}, "grm": {}, "gram": {},
	"grams": {}, "kg": {}, "%": {}, "l": {}, "cc": {},
	"mg/ml": {}, "mg/5ml": {}, "meq/l": {}, "mmol/l": {}, "ml/hr": {},
}

// clinContainers are packaging/volume tokens that must never be ingredient
// names (bottles, vials, packs, etc.).
var clinContainers = map[string]struct{}{
	"bottle": {}, "vial": {}, "ampule": {}, "ampoule": {}, "cartridge": {},
	"syringe": {}, "bag": {}, "pouch": {}, "packet": {}, "tube": {}, "pack": {},
	"packs": {}, "box": {}, "carton": {}, "kit": {}, "kits": {}, "dose": {},
	"doses": {}, "actuation": {}, "actuations": {}, "puff": {}, "puffs": {},
	"each": {}, "container": {}, "jar": {}, "can": {}, "amp": {},
}

// clinModifiers are release-modifier tokens ("extended", "delayed", "xr", ...)
// that must never be ingredient names.
var clinModifiers = map[string]struct{}{
	"extended": {}, "delayed": {}, "immediate": {}, "sustained": {},
	"prolonged": {}, "continuous": {}, "controlled": {}, "release": {},
	"enteric": {}, "coated": {}, "acting": {}, "long": {}, "xr": {}, "er": {},
	"cr": {}, "dr": {}, "ir": {}, "sr": {}, "la": {}, "sa": {}, "cd": {},
	"cc": {}, "xl": {}, "contin": {}, "tr": {},
}

// clinDescriptors are formulation descriptors ("chewable", "soluble", ...) that
// must never be ingredient names.
var clinDescriptors = map[string]struct{}{
	"chewable": {}, "chew": {}, "soluble": {}, "dispersible": {},
	"effervescent": {}, "modified": {}, "conventional": {}, "bipolar": {},
	"film": {}, "coated": {}, "scored": {}, "oral": {},
}

// clinRoutes are administration-route tokens that must never be ingredient
// names. (Kept in sync with the routeTokens used by ParseDescription.)
var clinRoutes = map[string]struct{}{
	"oral": {}, "topical": {}, "intravenous": {}, "injection": {},
	"rectal": {}, "vaginal": {}, "nasal": {}, "ophthalmic": {}, "otic": {},
	"inhalation": {}, "sublingual": {}, "buccal": {}, "transdermal": {},
	"subcutaneous": {}, "intramuscular": {}, "intrathecal": {}, "epidural": {},
	"intracervical": {}, "intraocular": {}, "auricular": {}, "respiratory": {},
	"urethral": {}, "iv": {}, "sl": {}, "td": {},
}

// nonName is the union of every token class that is NOT an active-ingredient
// name word. isNameWord uses it to keep units/forms/routes/containers/modifiers
// out of ingredient names.
var nonName = func() map[string]struct{} {
	m := make(map[string]struct{}, 256)
	for k := range clinUnits {
		m[k] = struct{}{}
	}
	for k := range clinContainers {
		m[k] = struct{}{}
	}
	for k := range clinModifiers {
		m[k] = struct{}{}
	}
	for k := range clinDescriptors {
		m[k] = struct{}{}
	}
	for k := range clinRoutes {
		m[k] = struct{}{}
	}
	for k := range clinForms {
		m[k] = struct{}{}
	}
	return m
}()

// isNameWord reports whether tok is plausibly part of an active-ingredient name:
// it is neither numeric, nor a unit, nor a dosage form, nor a container, nor a
// release modifier, nor a descriptor, nor a route. This single rule is what
// stops "ML", "Tablet", "Enema", "Bottle", "Extended" and "Oral" from being
// treated as ingredients.
func isNameWord(tok string) bool {
	if tok == "" || isNumericToken(tok) {
		return false
	}
	if _, ok := nonName[strings.ToLower(tok)]; ok {
		return false
	}
	return true
}

// isClinUnit reports whether tok is a strength/volume unit token.
func isClinUnit(tok string) bool {
	_, ok := clinUnits[strings.ToLower(tok)]
	return ok
}

// ---------------------------------------------------------------------------
// Dosage-form normalization
// ---------------------------------------------------------------------------

// NormalizeDosageForm collapses a verbose RxNorm form phrase into a clean,
// compact clinical form:
//
//	"Extended Release Oral Tablet" -> "Tablet (ER)"
//	"Delayed Release Capsule"      -> "Capsule (DR)"
//	"Oral Suspension"              -> "Suspension"
//	"Topical Gel"                  -> "Gel"
//
// It detects a release modifier (ER/DR/IR/SR) from phrases or standalone
// abbreviations, then the first base dosage form, and joins them. Route and
// ingredient tokens are ignored (they are not base forms).
func NormalizeDosageForm(desc string) string {
	low := strings.ToLower(desc)
	mod := detectModifier(low, splitWhitespace(low))

	base := ""
	for _, tok := range splitWhitespace(desc) {
		if b, ok := clinForms[strings.ToLower(tok)]; ok {
			base = b
			break
		}
	}

	switch {
	case base == "" && mod == "":
		return ""
	case base == "":
		return strings.TrimSpace(mod)
	case mod == "":
		return base
	default:
		return base + " " + mod
	}
}

// detectModifier returns the release-modifier suffix ("(ER)", "(DR)", "(IR)",
// "(SR)") or "". Phrase matches take precedence over standalone abbreviations.
func detectModifier(lowDesc string, lowerTokens []string) string {
	switch {
	case strings.Contains(lowDesc, "extended release"),
		strings.Contains(lowDesc, "prolonged release"),
		strings.Contains(lowDesc, "continuous release"),
		strings.Contains(lowDesc, "controlled release"),
		strings.Contains(lowDesc, "long acting"):
		return "(ER)"
	case strings.Contains(lowDesc, "delayed release"),
		strings.Contains(lowDesc, "enteric"):
		return "(DR)"
	case strings.Contains(lowDesc, "immediate release"):
		return "(IR)"
	case strings.Contains(lowDesc, "sustained release"):
		return "(SR)"
	}
	for _, tok := range lowerTokens {
		switch tok {
		case "xr", "er", "cd", "cc", "xl", "contin", "cr", "la", "sa", "tr":
			return "(ER)"
		case "dr":
			return "(DR)"
		case "ir":
			return "(IR)"
		case "sr":
			return "(SR)"
		}
	}
	return ""
}

// firstClinRoute returns the original-cased first route token found in desc, or
// "". Used by the clinical parser to populate the route independently of the
// dosage form.
func firstClinRoute(desc string) string {
	for _, tok := range splitWhitespace(desc) {
		if _, ok := clinRoutes[strings.ToLower(tok)]; ok {
			return tok
		}
	}
	return ""
}
