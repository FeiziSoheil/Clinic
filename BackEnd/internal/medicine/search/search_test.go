package search

import (
	"context"
	"errors"
	"testing"

	"clinic-api/internal/medicine/model"
)

// fakeRepo is a controllable searcher for unit-testing the ranking logic. Each
// method returns exactly the canned slice/error the test sets, ignoring the
// query, so tests can assert precisely on the engine's tier classification and
// ordering.
type fakeRepo struct {
	prefix    []model.Medicine
	text      []model.Medicine
	prefixErr error
	textErr   error
}

func (f *fakeRepo) SearchPrefix(_ context.Context, _ string, _ int) ([]model.Medicine, error) {
	return f.prefix, f.prefixErr
}

func (f *fakeRepo) SearchText(_ context.Context, _ string, _ int) ([]model.Medicine, error) {
	return f.text, f.textErr
}

// acetaminophen is a reusable candidate concept used across tier tests.
func acetaminophen() model.Medicine {
	return model.Medicine{
		RxCUI:       "161",
		GenericName: "Acetaminophen",
		SearchName:  "acetaminophen",
		BrandName:   "Tylenol",
		BrandNames:  []string{"Tylenol"},
		Synonyms:    []string{"paracetamol"},
		TTY:         "IN",
		Category:    model.CategoryGeneric,
		Strength:    "500 mg",
		DosageForm:  "Tablet",
	}
}

func TestSearchEmptyQueryReturnsEmpty(t *testing.T) {
	e := New(&fakeRepo{prefix: []model.Medicine{acetaminophen()}})
	got, err := e.Search(context.Background(), "   ", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty result for blank query, got %d", len(got))
	}
}

func TestSearchExactGeneric(t *testing.T) {
	e := New(&fakeRepo{prefix: []model.Medicine{acetaminophen()}})
	got, err := e.Search(context.Background(), "acetaminophen", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 result, got %d", len(got))
	}
	if got[0].MatchType != model.MatchExactGeneric || got[0].Score != 100 {
		t.Errorf("got %+v, want exact_generic / 100", got[0])
	}
}

func TestSearchPrefixGeneric(t *testing.T) {
	e := New(&fakeRepo{prefix: []model.Medicine{acetaminophen()}})
	got, err := e.Search(context.Background(), "aceta", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 || got[0].MatchType != model.MatchPrefixGeneric || got[0].Score != 95 {
		t.Errorf("got %+v, want prefix_generic / 95", got[0])
	}
}

func TestSearchExactBrand(t *testing.T) {
	e := New(&fakeRepo{text: []model.Medicine{acetaminophen()}})
	got, err := e.Search(context.Background(), "tylenol", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 || got[0].MatchType != model.MatchExactBrand || got[0].Score != 90 {
		t.Errorf("got %+v, want exact_brand / 90", got[0])
	}
}

func TestSearchFuzzyTypo(t *testing.T) {
	// Candidate surfaced by the $text window; query is a one-edit typo.
	e := New(&fakeRepo{text: []model.Medicine{acetaminophen()}})
	got, err := e.Search(context.Background(), "acetaminophn", 10) // missing 'e'
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 || got[0].MatchType != model.MatchFuzzy || got[0].Score != 75 {
		t.Errorf("got %+v, want fuzzy / 75", got[0])
	}
}

func TestSearchSynonym(t *testing.T) {
	e := New(&fakeRepo{text: []model.Medicine{acetaminophen()}})
	got, err := e.Search(context.Background(), "paracetamol", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 || got[0].MatchType != model.MatchSynonym || got[0].Score != 70 {
		t.Errorf("got %+v, want synonym / 70", got[0])
	}
}

func TestHighestTierWins(t *testing.T) {
	// The same medicine is an exact generic AND a brand match; exact must win.
	m := acetaminophen()
	m.BrandNames = []string{"acetaminophen"} // contrived so brand would also match
	e := New(&fakeRepo{prefix: []model.Medicine{m}})
	got, err := e.Search(context.Background(), "acetaminophen", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got[0].MatchType != model.MatchExactGeneric {
		t.Errorf("expected exact_generic to outrank brand, got %v", got[0].MatchType)
	}
}

// TestDedupMergesSameClinicalMedicine is the headline deduplication test: two
// RxCUIs for the SAME clinical medicine (Sulfasalazine 500 mg Tablet Oral) are
// folded into one logical result with both RxCUIs in related_rxcuis and the
// brand unioned (Problem 1/2/7).
func TestDedupMergesSameClinicalMedicine(t *testing.T) {
	m1 := model.Medicine{
		RxCUI: "198232", GenericName: "Sulfasalazine", SearchName: "sulfasalazine",
		Strength: "500 mg", DosageForm: "Tablet", Route: "Oral",
		Category: model.CategoryGeneric, BrandNames: []string{},
	}
	m2 := model.Medicine{
		RxCUI: "313142", GenericName: "Sulfasalazine", SearchName: "sulfasalazine",
		Strength: "500 mg", DosageForm: "Tablet", Route: "Oral",
		Category: model.CategoryGeneric, BrandNames: []string{"Azulfidine"}, BrandName: "Azulfidine",
	}
	e := New(&fakeRepo{prefix: []model.Medicine{m1, m2}})
	got, err := e.Search(context.Background(), "sulfasalazine", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 merged logical medicine, got %d: %+v", len(got), got)
	}
	r := got[0]
	if len(r.RelatedRxCUIs) != 2 {
		t.Errorf("expected 2 related rxcuis, got %v", r.RelatedRxCUIs)
	}
	// Brand unioned and de-duplicated: Azulfidine appears exactly once.
	if len(r.BrandNames) != 1 || r.BrandNames[0] != "Azulfidine" {
		t.Errorf("expected deduped brands [Azulfidine], got %v", r.BrandNames)
	}
}

// TestDedupKeepsDistinctClinicalMedicines verifies that the same generic at a
// different strength/form/route stays as separate logical medicines.
func TestDedupKeepsDistinctClinicalMedicines(t *testing.T) {
	meds := []model.Medicine{
		{RxCUI: "a", GenericName: "Sulfasalazine", SearchName: "sulfasalazine", Strength: "500 mg", DosageForm: "Tablet", Route: "Oral", Category: model.CategoryGeneric, BrandNames: []string{}},
		{RxCUI: "b", GenericName: "Sulfasalazine", SearchName: "sulfasalazine", Strength: "500 mg", DosageForm: "Suppository", Route: "Rectal", Category: model.CategoryGeneric, BrandNames: []string{}},
	}
	e := New(&fakeRepo{prefix: meds})
	got, err := e.Search(context.Background(), "sulfasalazine", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 distinct medicines (Tablet vs Suppository), got %d: %+v", len(got), got)
	}
}

func TestSearchOrderingAndDedupe(t *testing.T) {
	// Two concepts; "acetaminophen" exact (100) must precede a prefix match (95).
	exact := acetaminophen() // exact_generic for "acetaminophen"
	prefix := model.Medicine{
		RxCUI:       "856917",
		GenericName: "Acetaminophen-DP", // sorts after "Acetaminophen"
		SearchName:  "acetaminophen-dp",
		BrandNames:  []string{},
		Category:    model.CategoryGeneric,
	}
	repo := &fakeRepo{
		prefix: []model.Medicine{exact, prefix},
		text:   []model.Medicine{exact}, // duplicate rxcui 161 (deduped upstream)
	}
	e := New(repo)
	got, err := e.Search(context.Background(), "acetaminophen", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 results, got %d: %+v", len(got), got)
	}
	if got[0].RxCUI != "161" || got[0].Score != 100 {
		t.Errorf("expected 161/100 first, got %+v", got[0])
	}
	if got[1].RxCUI != "856917" || got[1].Score != 95 {
		t.Errorf("expected 856917/95 second, got %+v", got[1])
	}
}

// TestCombinationDemotedBelowGeneric is the headline clinical-correctness test:
// searching a shared ingredient must surface the single-ingredient generic FIRST
// and the combination LAST.
func TestCombinationDemotedBelowGeneric(t *testing.T) {
	generic := model.Medicine{
		RxCUI: "g1", GenericName: "Ibuprofen", SearchName: "ibuprofen",
		BrandNames: []string{}, Category: model.CategoryGeneric,
		Strength: "400 mg", DosageForm: "Tablet",
	}
	combo := model.Medicine{
		RxCUI: "c1", GenericName: "Famotidine + Ibuprofen", SearchName: "famotidine ibuprofen",
		BrandNames: []string{}, Category: model.CategoryCombination, IsCombination: true,
		Strength: "", DosageForm: "Tablet",
		Ingredients: []model.Ingredient{{Name: "Famotidine"}, {Name: "Ibuprofen"}},
	}
	e := New(&fakeRepo{text: []model.Medicine{combo, generic}})
	got, err := e.Search(context.Background(), "ibuprofen", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 results, got %d: %+v", len(got), got)
	}
	if got[0].RxCUI != "g1" || got[0].Score != 100 || got[0].MatchType != model.MatchExactGeneric {
		t.Errorf("expected generic ibuprofen (100) first, got %+v", got[0])
	}
	if got[1].RxCUI != "c1" || got[1].Score != 30 || got[1].MatchType != model.MatchCombination {
		t.Errorf("expected combination (30) last, got %+v", got[1])
	}
}

// TestStrengthAscendingTiebreak verifies the clinical ordering: equal-relevance
// generic matches sort by ascending strength (200, 400, 600, 800).
func TestStrengthAscendingTiebreak(t *testing.T) {
	meds := []model.Medicine{
		{RxCUI: "800", GenericName: "Ibuprofen", SearchName: "ibuprofen", Strength: "800 mg", BrandNames: []string{}, Category: model.CategoryGeneric},
		{RxCUI: "200", GenericName: "Ibuprofen", SearchName: "ibuprofen", Strength: "200 mg", BrandNames: []string{}, Category: model.CategoryGeneric},
		{RxCUI: "600", GenericName: "Ibuprofen", SearchName: "ibuprofen", Strength: "600 mg", BrandNames: []string{}, Category: model.CategoryGeneric},
	}
	e := New(&fakeRepo{prefix: meds})
	got, err := e.Search(context.Background(), "ibuprofen", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Note: these share the same clinical key (same generic+strength+form+route),
	// so different STRENGTHS keep them distinct — sorted ascending.
	wantOrder := []string{"200", "600", "800"}
	if len(got) != len(wantOrder) {
		t.Fatalf("expected %d results, got %d", len(wantOrder), len(got))
	}
	for i, want := range wantOrder {
		if got[i].RxCUI != want {
			t.Errorf("position %d: got %s, want %s (full: %+v)", i, got[i].RxCUI, want, got)
		}
	}
}

// TestGenericBeforeBrandBeforeCombination verifies the full Phase 7 ordering for
// "Ibuprofen": generic strengths, then brands, then the combination.
func TestGenericBeforeBrandBeforeCombination(t *testing.T) {
	generic := model.Medicine{RxCUI: "g", GenericName: "Ibuprofen", SearchName: "ibuprofen", Strength: "200 mg", BrandNames: []string{}, Category: model.CategoryGeneric}
	brand := model.Medicine{RxCUI: "b", GenericName: "Ibuprofen", BrandName: "Advil", SearchName: "ibuprofen", Strength: "200 mg", BrandNames: []string{"Advil"}, Category: model.CategoryBrand}
	combo := model.Medicine{RxCUI: "c", GenericName: "Ibuprofen + Famotidine", SearchName: "ibuprofen famotidine", IsCombination: true, Category: model.CategoryCombination, BrandNames: []string{}}
	e := New(&fakeRepo{prefix: []model.Medicine{generic}, text: []model.Medicine{brand, combo}})
	got, err := e.Search(context.Background(), "ibuprofen", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// generic exact (100) < brand exact-brand (90) < combination (30).
	if len(got) != 3 {
		t.Fatalf("expected 3 results, got %d: %+v", len(got), got)
	}
	if got[0].RxCUI != "g" || got[1].RxCUI != "b" || got[2].RxCUI != "c" {
		t.Errorf("expected [generic, brand, combination], got %s,%s,%s", got[0].RxCUI, got[1].RxCUI, got[2].RxCUI)
	}
}

func TestSearchCapsAtLimit(t *testing.T) {
	// Three concepts whose search_name shares the "aa" prefix; limit to 2.
	meds := []model.Medicine{
		{RxCUI: "1", GenericName: "Aaa", SearchName: "aaa", BrandNames: []string{}, Category: model.CategoryGeneric},
		{RxCUI: "2", GenericName: "Aab", SearchName: "aab", BrandNames: []string{}, Category: model.CategoryGeneric},
		{RxCUI: "3", GenericName: "Aac", SearchName: "aac", BrandNames: []string{}, Category: model.CategoryGeneric},
	}
	e := New(&fakeRepo{prefix: meds})
	got, err := e.Search(context.Background(), "aa", 2) // "aa" prefixes all three
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 2 {
		t.Errorf("expected limit of 2 to cap results, got %d", len(got))
	}
	for _, r := range got {
		if r.MatchType != model.MatchPrefixGeneric {
			t.Errorf("expected prefix_generic match, got %v", r.MatchType)
		}
	}
	if got[0].GenericName != "Aaa" || got[1].GenericName != "Aab" {
		t.Errorf("expected [Aaa, Aab] after cap, got %s, %s", got[0].GenericName, got[1].GenericName)
	}
}

func TestSearchPropagatesPrefixError(t *testing.T) {
	boom := errors.New("prefix boom")
	e := New(&fakeRepo{prefixErr: boom})
	if _, err := e.Search(context.Background(), "x", 5); !errors.Is(err, boom) {
		t.Errorf("expected prefix error to propagate, got %v", err)
	}
}

func TestSearchPropagatesTextError(t *testing.T) {
	boom := errors.New("text boom")
	e := New(&fakeRepo{textErr: boom})
	if _, err := e.Search(context.Background(), "x", 5); !errors.Is(err, boom) {
		t.Errorf("expected text error to propagate, got %v", err)
	}
}

func TestToResultSeedsRelatedRxCUIs(t *testing.T) {
	// A matched concept seeds RelatedRxCUIs with its own RxCUI and a non-nil
	// BrandNames slice.
	m := model.Medicine{RxCUI: "9", GenericName: "X", SearchName: "x"}
	r := toResult(m, model.MatchExactGeneric, 100)
	if r.BrandNames == nil {
		t.Errorf("expected non-nil BrandNames, got %v", r.BrandNames)
	}
	if len(r.RelatedRxCUIs) != 1 || r.RelatedRxCUIs[0] != "9" {
		t.Errorf("expected RelatedRxCUIs=[9], got %v", r.RelatedRxCUIs)
	}
}
