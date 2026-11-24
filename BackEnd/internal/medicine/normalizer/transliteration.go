// This file holds the transliteration and diacritic-folding tables used by
// Normalize. They are kept separate from normalizer.go so the normalization
// pipeline reads as a linear sequence while the (large, mechanical) tables live
// in their own file. Both helpers are pure and allocation-light.
package normalizer

import (
	"strings"
)

// persianToLatin maps a single Persian (and the common Arabic-coined) rune to a
// Latin approximation. The goal is a comparable, script-agnostic form so a
// doctor typing "استامینوفن" can be matched against the Latin index; it is a
// lossy phonetic transliteration, not a perfect reversible mapping.
var persianToLatin = map[rune]string{
	// Persian letters.
	'ا': "a", 'آ': "a", 'أ': "a", 'إ': "i", 'ب': "b", 'پ': "p", 'ت': "t",
	'ث': "s", 'ج': "j", 'چ': "ch", 'ح': "h", 'خ': "kh", 'د': "d", 'ذ': "z",
	'ر': "r", 'ز': "z", 'ژ': "zh", 'س': "s", 'ش': "sh", 'ص': "s", 'ض': "z",
	'ط': "t", 'ظ': "z", 'ع': "a", 'غ': "gh", 'ف': "f", 'ق': "gh", 'ک': "k",
	'گ': "g", 'ل': "l", 'م': "m", 'ن': "n", 'و': "v", 'ه': "h", 'ی': "y",
	// Arabic-coined variants that appear in Persian medical text.
	'ك': "k", 'ي': "y", 'ؤ': "v", 'ئ': "y", 'ة': "h", 'ى': "a",
	// Persian zero-width non-joiner / ZWNJ and Tatweel — drop silently.
	'\u200c': "", '\u200d': "", '\u0640': "",
}

// transliteratePersian replaces any Persian/Arabic runes in s with their Latin
// approximation. Non-Persian runes are passed through unchanged so Latin input
// is unaffected.
func transliteratePersian(s string) string {
	if !needsPersian(s) {
		return s
	}
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if lat, ok := persianToLatin[r]; ok {
			b.WriteString(lat)
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

// needsPersian reports whether s contains any rune covered by the
// persianToLatin table. It lets transliteratePersian skip the builder
// allocation for the overwhelmingly common all-Latin input.
func needsPersian(s string) bool {
	for _, r := range s {
		if _, ok := persianToLatin[r]; ok {
			return true
		}
	}
	return false
}

// latinFold maps accented Latin runes to their plain ASCII base so that
// "café", "naïve" and "ibuprofène" collapse to their unaccented form. The value
// is a string (rather than a single rune) so multi-letter folds such as
// þ→"th", ß→"ss" and æ→"ae" can be expressed. Only the commonly encountered
// Latin-1 Supplement / Latin Extended-A accented letters are covered; anything
// else is left intact.
var latinFold = map[rune]string{
	'à': "a", 'á': "a", 'â': "a", 'ã': "a", 'ä': "a", 'å': "a", 'ā': "a", 'ă': "a", 'ą': "a",
	'À': "a", 'Á': "a", 'Â': "a", 'Ã': "a", 'Ä': "a", 'Å': "a", 'Ā': "a", 'Ă': "a", 'Ą': "a",
	'ç': "c", 'ć': "c", 'ĉ': "c", 'č': "c", 'ċ': "c",
	'Ç': "c", 'Ć': "c", 'Ĉ': "c", 'Č': "c", 'Ċ': "c",
	'è': "e", 'é': "e", 'ê': "e", 'ë': "e", 'ē': "e", 'ĕ': "e", 'ę': "e", 'ė': "e",
	'È': "e", 'É': "e", 'Ê': "e", 'Ë': "e", 'Ē': "e", 'Ĕ': "e", 'Ę': "e", 'Ė': "e",
	'ì': "i", 'í': "i", 'î': "i", 'ï': "i", 'ī': "i", 'ĭ': "i", 'į': "i", 'ı': "i",
	'Ì': "i", 'Í': "i", 'Î': "i", 'Ï': "i", 'Ī': "i", 'Ĭ': "i", 'Į': "i",
	'ñ': "n", 'ń': "n", 'ņ': "n", 'ň': "n",
	'Ñ': "n", 'Ń': "n", 'Ņ': "n", 'Ň': "n",
	'ò': "o", 'ó': "o", 'ô': "o", 'õ': "o", 'ö': "o", 'ø': "o", 'ō': "o", 'ŏ': "o", 'ő': "o",
	'Ò': "o", 'Ó': "o", 'Ô': "o", 'Õ': "o", 'Ö': "o", 'Ø': "o", 'Ō': "o", 'Ŏ': "o", 'Ő': "o",
	'ù': "u", 'ú': "u", 'û': "u", 'ü': "u", 'ū': "u", 'ŭ': "u", 'ů': "u", 'ű': "u", 'ų': "u",
	'Ù': "u", 'Ú': "u", 'Û': "u", 'Ü': "u", 'Ū': "u", 'Ŭ': "u", 'Ů': "u", 'Ű': "u", 'Ų': "u",
	'ý': "y", 'ÿ': "y", 'ŷ': "y",
	'Ý': "y", 'Ÿ': "y", 'Ŷ': "y",
	'ś': "s", 'ŝ': "s", 'š': "s", 'ş': "s",
	'Ś': "s", 'Ŝ': "s", 'Š': "s", 'Ş': "s",
	'ź': "z", 'ż': "z", 'ž': "z",
	'Ź': "z", 'Ż': "z", 'Ž': "z",
	'ł': "l", 'Ł': "l",
	'đ': "d", 'Đ': "d",
	'ğ': "g", 'Ğ': "g",
	'þ': "th", 'Þ': "th",
	'ß': "ss",
	'æ': "ae", 'Æ': "ae",
	'œ': "oe", 'Œ': "oe",
}

// foldDiacritics replaces accented Latin letters in s with their plain ASCII
// base (lowercased folding is applied later by Normalize). Non-mapped runes are
// preserved unchanged.
func foldDiacritics(s string) string {
	if !needsFold(s) {
		return s
	}
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if base, ok := latinFold[r]; ok {
			b.WriteString(base)
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

// needsFold reports whether s contains any rune present in latinFold, so
// foldDiacritics can skip the builder allocation for plain-ASCII input.
func needsFold(s string) bool {
	for _, r := range s {
		if _, ok := latinFold[r]; ok {
			return true
		}
	}
	return false
}
