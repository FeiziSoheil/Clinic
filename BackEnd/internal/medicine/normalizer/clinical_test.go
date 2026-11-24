package normalizer

import (
	"reflect"
	"testing"
)

func TestExtractBrand(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"ibuprofen 200 MG Oral Tablet [Advil]", "Advil"},
		{"famotidine 26.6 MG / ibuprofen 800 MG Oral Tablet [Duexis]", "Duexis"},
		{"ibuprofen 200 MG Oral Tablet", ""}, // no bracket
		{"{12 C (pack)} acetaminophen", ""},  // braces are not brackets
	}
	for _, tc := range cases {
		if got := ExtractBrand(tc.in); got != tc.want {
			t.Errorf("ExtractBrand(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestParseMedicineSingleGeneric(t *testing.T) {
	// SCD: clean generic product, no brand. Strength is the single active
	// ingredient; ingredient strength/unit are split.
	got := ParseMedicine("ibuprofen 200 MG Oral Tablet", "SCD")
	want := ClinicalParts{
		GenericName:   "Ibuprofen",
		Brand:         "",
		Strength:      "200 mg",
		DosageForm:    "Tablet",
		Route:         "Oral",
		IsCombination: false,
		Ingredients: []ClinicalIngredient{
			{Name: "Ibuprofen", Strength: "200", Unit: "MG"},
		},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ParseMedicine single = %+v\nwant %+v", got, want)
	}
}

func TestParseMedicineBrand(t *testing.T) {
	// SBD: branded product — brand pulled from the bracket suffix.
	got := ParseMedicine("ibuprofen 200 MG Oral Tablet [Advil]", "SBD")
	if got.Brand != "Advil" {
		t.Errorf("brand = %q, want Advil", got.Brand)
	}
	if got.GenericName != "Ibuprofen" {
		t.Errorf("generic = %q, want Ibuprofen", got.GenericName)
	}
	if got.IsCombination {
		t.Errorf("brand product must not be a combination")
	}
}

func TestParseMedicineCombination(t *testing.T) {
	// The spec's headline example. Combination strength is EMPTY (strengths live
	// in ingredients[]), each ingredient carries its split strength+unit.
	got := ParseMedicine("famotidine 26.6 MG / ibuprofen 800 MG Oral Tablet [Duexis]", "SBD")
	want := ClinicalParts{
		GenericName:   "Famotidine + Ibuprofen",
		Brand:         "Duexis",
		Strength:      "",
		DosageForm:    "Tablet",
		Route:         "Oral",
		IsCombination: true,
		Ingredients: []ClinicalIngredient{
			{Name: "Famotidine", Strength: "26.6", Unit: "MG"},
			{Name: "Ibuprofen", Strength: "800", Unit: "MG"},
		},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ParseMedicine combination = %+v\nwant %+v", got, want)
	}
}

func TestParseMedicineIngredientExtraction(t *testing.T) {
	// Spec ingredient example: strength = number, unit = separate.
	got := ParseMedicine("Acetaminophen 325 MG / Ibuprofen 97.5 MG Tablet", "SCD")
	if !got.IsCombination || len(got.Ingredients) != 2 {
		t.Fatalf("expected 2-ingredient combination, got %+v", got)
	}
	want := []ClinicalIngredient{
		{Name: "Acetaminophen", Strength: "325", Unit: "MG"},
		{Name: "Ibuprofen", Strength: "97.5", Unit: "MG"},
	}
	if !reflect.DeepEqual(got.Ingredients, want) {
		t.Errorf("ingredients = %+v, want %+v", got.Ingredients, want)
	}
	if got.GenericName != "Acetaminophen + Ibuprofen" {
		t.Errorf("generic = %q, want Acetaminophen + Ibuprofen", got.GenericName)
	}
}

func TestParseMedicineConcentrationIsNotCombination(t *testing.T) {
	// A ratio strength ("250 MG / 5 ML") is a concentration, NOT two ingredients.
	got := ParseMedicine("amoxicillin 250 MG / 5 ML Oral Suspension", "SCD")
	if got.IsCombination {
		t.Errorf("concentration must NOT be a combination, got %+v", got)
	}
	if got.GenericName != "Amoxicillin" {
		t.Errorf("generic = %q, want Amoxicillin", got.GenericName)
	}
	if len(got.Ingredients) != 1 || got.Ingredients[0].Name != "Amoxicillin" {
		t.Errorf("want single ingredient Amoxicillin, got %+v", got.Ingredients)
	}
	if got.Strength != "250 mg / 5 ml" {
		t.Errorf("strength = %q, want 250 mg / 5 ml", got.Strength)
	}
	if got.DosageForm != "Suspension" {
		t.Errorf("form = %q, want Suspension", got.DosageForm)
	}
}

func TestUnitsAreNotIngredients(t *testing.T) {
	// The headline parser bug: units/forms must never become ingredients.
	cases := []struct {
		in          string
		wantGeneric string
		wantComb    bool
	}{
		{"100 ML Sulfasalazine Oral Suspension", "Sulfasalazine", false}, // name after strength
		{"Sulfasalazine 500 MG/ML Enema", "Sulfasalazine", false},        // "ML" must not be an ingredient
		{"Sulfasalazine 3 G Rectal Suspension", "Sulfasalazine", false},
	}
	for _, tc := range cases {
		got := ParseMedicine(tc.in, "SCD")
		if got.GenericName != tc.wantGeneric {
			t.Errorf("ParseMedicine(%q).GenericName = %q, want %q", tc.in, got.GenericName, tc.wantGeneric)
		}
		if got.IsCombination != tc.wantComb {
			t.Errorf("ParseMedicine(%q).IsCombination = %v, want %v", tc.in, got.IsCombination, tc.wantComb)
		}
		for _, ing := range got.Ingredients {
			low := ing.Name
			// No ingredient should be a bare unit or form word.
			if _, isUnit := clinUnits[low]; isUnit {
				t.Errorf("ParseMedicine(%q): unit %q leaked as an ingredient", tc.in, ing.Name)
			}
		}
	}
}

func TestParseMedicineIngredientOnly(t *testing.T) {
	// IN: bare ingredient, no strength/form/route.
	got := ParseMedicine("insulin glargine", "IN")
	if got.GenericName != "Insulin Glargine" {
		t.Errorf("generic = %q, want Insulin Glargine", got.GenericName)
	}
	if got.IsCombination {
		t.Errorf("bare ingredient must not be a combination")
	}
	if got.Strength != "" || got.DosageForm != "" || got.Route != "" {
		t.Errorf("want empty structural fields, got %+v", got)
	}
}

func TestNormalizeDosageForm(t *testing.T) {
	cases := map[string]string{
		"Extended Release Oral Tablet": "Tablet (ER)",
		"Delayed Release Capsule":      "Capsule (DR)",
		"Oral Suspension":              "Suspension",
		"Topical Gel":                  "Gel",
		"Metformin 500 MG Oral Tablet": "Tablet",
		"":                             "",
	}
	for in, want := range cases {
		if got := NormalizeDosageForm(in); got != want {
			t.Errorf("NormalizeDosageForm(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestClassifyCategory(t *testing.T) {
	cases := []struct {
		comb bool
		tty  string
		want string
	}{
		{false, "SCD", "generic"},
		{false, "IN", "generic"},
		{false, "SBD", "brand"},
		{true, "SBD", "combination"}, // combination wins over TTY
		{true, "SCD", "combination"},
		{false, "scd", "generic"}, // case-insensitive
	}
	for _, tc := range cases {
		if got := ClassifyCategory(tc.comb, tc.tty); got != tc.want {
			t.Errorf("ClassifyCategory(%v,%q) = %q, want %q", tc.comb, tc.tty, got, tc.want)
		}
	}
}

func TestStrengthMagnitude(t *testing.T) {
	cases := []struct {
		in   string
		want float64
	}{
		{"200 mg", 200},
		{"26.6 mg / 800 mg", 26.6},
		{"5 ml", 5},
		{"", 0},
		{"Oral Tablet", 0},
	}
	for _, tc := range cases {
		if got := StrengthMagnitude(tc.in); got != tc.want {
			t.Errorf("StrengthMagnitude(%q) = %v, want %v", tc.in, got, tc.want)
		}
	}
}

func TestTitleCase(t *testing.T) {
	cases := map[string]string{
		"ibuprofen":        "Ibuprofen",
		"famotidine":       "Famotidine",
		"insulin glargine": "Insulin Glargine",
		"":                 "",
	}
	for in, want := range cases {
		if got := TitleCase(in); got != want {
			t.Errorf("TitleCase(%q) = %q, want %q", in, got, want)
		}
	}
}
