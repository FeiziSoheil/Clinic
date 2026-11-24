// Package search implements the Medicine domain's weighted clinical priority
// search engine (RXNORM-PIPELINE search stage).
//
// The engine is stateless: given a query it runs two index-backed retrievals (a
// prefix scan and a $text candidate window), unions them, classifies each
// candidate against the query to assign a weighted tier and score, sorts by the
// clinical ordering, then runs an INTELLIGENT DEDUPLICATION pass that merges
// concepts with the same generic+strength+form+route+category into a single
// logical medicine (union of brand names and related RxCUIs).
//
// Clinical ranking rule: COMBINATION drugs are always demoted to the lowest
// tier so they never crowd out the single-ingredient generics/brands the doctor
// most likely wants. Searching "Ibuprofen" therefore surfaces "Ibuprofen
// 200/400/600/800 mg" first, branded products (Advil/Motrin) next, and
// combinations (e.g. "Ibuprofen + Famotidine") last.
//
// Weighted tiers: exact_generic 100, prefix_generic 95, exact_brand 90,
// prefix_brand 80, fuzzy 75, synonym 70, combination 30 (inactive concepts are
// excluded entirely).
//
// The engine depends on a narrow searcher interface (so it is trivially faked
// in tests) and on the pure normalizer package. It has no MongoDB dependency of
// its own.
package search

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/lithammer/fuzzysearch/fuzzy"

	"clinic-api/internal/medicine/model"
	"clinic-api/internal/medicine/normalizer"
	"clinic-api/pkg/logger"
)

// ---------------------------------------------------------------------------
// Scores / tunables
// ---------------------------------------------------------------------------

// Weighted base scores per tier. Higher is more relevant. Combinations are
// pinned to the lowest tier regardless of how well their shared ingredient
// matches.
const (
	scoreExactGeneric  = 100
	scorePrefixGeneric = 95
	scoreExactBrand    = 90
	scorePrefixBrand   = 80
	scoreFuzzy         = 75
	scoreSynonym       = 70
	scoreCombination   = 30

	// fuzzyMaxDistance is the maximum Damerau-Levenshtein distance tolerated by
	// the fuzzy tier.
	fuzzyMaxDistance = 2
)

// fuzzyCandidateWindow is the size of the $text candidate set fetched for the
// fuzzy/brand/synonym tiers. It is intentionally modest so the in-process
// rerank stays cheap.
const fuzzyCandidateWindow = 60

// defaultLimit is used when a caller requests a non-positive limit.
const defaultLimit = 20

// ---------------------------------------------------------------------------
// Narrow repository interface
// ---------------------------------------------------------------------------

// searcher is the narrow slice of the repository surface the engine needs: the
// two index-backed retrievals. Declaring it locally keeps the engine decoupled
// from the concrete repository (and testable with a fake); the concrete
// repository.Repository satisfies it structurally.
type searcher interface {
	// SearchPrefix returns active medicines whose search_name starts with q.
	SearchPrefix(ctx context.Context, q string, limit int) ([]model.Medicine, error)
	// SearchText returns active medicines matching the $text query q.
	SearchText(ctx context.Context, q string, limit int) ([]model.Medicine, error)
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

// Engine is the stateless clinical priority search engine.
type Engine struct {
	repo searcher
}

// New constructs an Engine backed by the given searcher (typically the concrete
// medicine repository).
func New(repo searcher) *Engine {
	return &Engine{repo: repo}
}

// Search ranks medicines for the given query across the priority tiers and
// returns the capped, de-duplicated, scored results. An empty/whitespace query
// yields an empty (non-error) result.
func (e *Engine) Search(ctx context.Context, q string, limit int) ([]model.MedicineSearchResult, error) {
	q = strings.TrimSpace(q)
	if q == "" {
		return []model.MedicineSearchResult{}, nil
	}
	if limit <= 0 {
		limit = defaultLimit
	}

	normalized := normalizer.Normalize(q)
	if normalized == "" {
		return []model.MedicineSearchResult{}, nil
	}

	// Generic-tier retrieval: prefix scan over the normalized search_name.
	prefixHits, err := e.repo.SearchPrefix(ctx, normalized, limit)
	if err != nil {
		logger.Get().Error("medicine search: prefix query failed", "q", q, "error", err)
		return nil, err
	}

	// Brand/fuzzy/synonym/combination retrieval: a $text candidate window.
	textHits, err := e.repo.SearchText(ctx, normalized, fuzzyCandidateWindow)
	if err != nil {
		logger.Get().Error("medicine search: text query failed", "q", q, "error", err)
		return nil, err
	}

	// Union candidates by rxcui (unique index guarantees no collision semantics).
	candidates := make(map[string]model.Medicine, len(prefixHits)+len(textHits))
	order := make([]string, 0, len(prefixHits)+len(textHits))
	for _, m := range prefixHits {
		if _, dup := candidates[m.RxCUI]; !dup {
			order = append(order, m.RxCUI)
		}
		candidates[m.RxCUI] = m
	}
	for _, m := range textHits {
		if _, exists := candidates[m.RxCUI]; !exists {
			order = append(order, m.RxCUI)
			candidates[m.RxCUI] = m
		}
	}

	merged := make([]model.Medicine, 0, len(order))
	for _, rxcui := range order {
		merged = append(merged, candidates[rxcui])
	}
	return Rank(q, merged, limit), nil
}

// Rank classifies, scores, sorts, deduplicates and caps a candidate set against
// the query. It is the pure (no-I/O) ranking core, exported so the service can
// reuse it for the RxNorm-fallback path (which already holds the candidate
// medicines in memory). An empty/whitespace query yields an empty result.
func Rank(query string, candidates []model.Medicine, limit int) []model.MedicineSearchResult {
	normalized := normalizer.Normalize(query)
	if normalized == "" || limit <= 0 {
		return []model.MedicineSearchResult{}
	}

	// Classify each candidate, keeping only those that matched some tier.
	scored := make([]model.MedicineSearchResult, 0, len(candidates))
	for _, m := range candidates {
		mt, score, ok := classify(normalized, m)
		if !ok {
			continue
		}
		scored = append(scored, toResult(m, mt, score))
	}

	// Clinical ordering: score desc -> category (generic<brand<combination) ->
	// ascending strength -> generic name asc.
	sort.Slice(scored, func(i, j int) bool {
		a, b := scored[i], scored[j]
		if a.Score != b.Score {
			return a.Score > b.Score
		}
		ra, rb := model.CategoryRank(a.Category), model.CategoryRank(b.Category)
		if ra != rb {
			return ra < rb
		}
		sa, sb := normalizer.StrengthMagnitude(a.Strength), normalizer.StrengthMagnitude(b.Strength)
		if sa != sb {
			return sa < sb
		}
		return a.GenericName < b.GenericName
	})

	// Intelligent deduplication: merge concepts with the same
	// generic+strength+form+route+category into one logical medicine, unioning
	// brand names and related RxCUIs. Runs after sorting so the highest-ranked
	// concept of each group wins the display slot.
	scored = mergeByClinicalKey(scored)

	if len(scored) > limit {
		scored = scored[:limit]
	}
	if scored == nil {
		scored = []model.MedicineSearchResult{}
	}
	return scored
}

// ---------------------------------------------------------------------------
// Intelligent deduplication
// ---------------------------------------------------------------------------

// mergeByClinicalKey folds results that share the same clinical identity
// (generic+strength+form+route+category) into a single logical medicine. The
// first (highest-ranked) result of each group is kept as the display entry; the
// other RxCUIs become RelatedRxCUIs and their brand names are unioned in
// (de-duplicated). This is what stops a doctor from seeing "Sulfasalazine 500 mg
// Tablet" repeated under several RxCUIs.
func mergeByClinicalKey(scored []model.MedicineSearchResult) []model.MedicineSearchResult {
	if len(scored) == 0 {
		return scored
	}

	type bucket struct {
		display model.MedicineSearchResult
		related map[string]struct{}
		brands  map[string]struct{}
	}
	order := make([]string, 0)
	buckets := make(map[string]*bucket, len(scored))

	for _, r := range scored {
		k := clinicalKey(r)
		b, ok := buckets[k]
		if !ok {
			b = &bucket{
				display: r,
				related: map[string]struct{}{r.RxCUI: {}},
				brands:  map[string]struct{}{},
			}
			for _, br := range r.BrandNames {
				b.brands[br] = struct{}{}
			}
			if r.BrandName != "" {
				b.brands[r.BrandName] = struct{}{}
			}
			buckets[k] = b
			order = append(order, k)
			continue
		}
		// Merge this equivalent concept into the existing logical medicine.
		b.related[r.RxCUI] = struct{}{}
		for _, br := range r.BrandNames {
			b.brands[br] = struct{}{}
		}
		if r.BrandName != "" {
			b.brands[r.BrandName] = struct{}{}
		}
	}

	out := make([]model.MedicineSearchResult, 0, len(order))
	for _, k := range order {
		b := buckets[k]
		res := b.display

		related := make([]string, 0, len(b.related))
		for rxcui := range b.related {
			related = append(related, rxcui)
		}
		sort.Strings(related)
		res.RelatedRxCUIs = related

		brands := make([]string, 0, len(b.brands))
		for br := range b.brands {
			brands = append(brands, br)
		}
		sort.Strings(brands)
		res.BrandNames = brands
		// Ensure the single primary brand reflects a real (deduped) brand.
		if res.BrandName == "" && len(brands) > 0 {
			res.BrandName = brands[0]
		}
		out = append(out, res)
	}
	return out
}

// clinicalKey is the deduplication identity of a result: the lowercased generic
// name joined with strength, dosage form, route and category. Two results with
// the same key are the same logical clinical medicine.
func clinicalKey(r model.MedicineSearchResult) string {
	return fmt.Sprintf("%s|%s|%s|%s|%s",
		normalizer.Normalize(r.GenericName),
		r.Strength,
		r.Form,
		r.Route,
		string(r.Category),
	)
}

// ---------------------------------------------------------------------------
// Tier classification
// ---------------------------------------------------------------------------

// classify evaluates a single candidate against the normalized query and returns
// the highest-priority tier it qualifies for, its weighted score and whether it
// matched at all. Tiers are checked in descending-score order so the first hit
// is the strongest.
//
// Clinical rule: combination drugs are ALWAYS demoted to the combination tier
// (score 30) regardless of how well the shared ingredient matches.
func classify(normalized string, m model.Medicine) (model.MatchType, int, bool) {
	if m.IsCombination {
		if combinationMatches(normalized, m) {
			return model.MatchCombination, scoreCombination, true
		}
		return "", 0, false
	}

	searchName := m.SearchName
	if searchName == "" {
		searchName = normalizer.Normalize(m.GenericName)
	}

	// Tier 1 — exact generic match.
	if searchName == normalized && normalized != "" {
		return model.MatchExactGeneric, scoreExactGeneric, true
	}
	// Tier 2 — prefix match on the normalized generic.
	if strings.HasPrefix(searchName, normalized) {
		return model.MatchPrefixGeneric, scorePrefixGeneric, true
	}
	// Tier 3 — exact brand match.
	if brandExact(normalized, m) {
		return model.MatchExactBrand, scoreExactBrand, true
	}
	// Tier 4 — prefix brand match.
	if brandPrefix(normalized, m) {
		return model.MatchPrefixBrand, scorePrefixBrand, true
	}
	// Tier 5 — fuzzy match (typo) on the generic.
	if dist := fuzzyDistance(normalized, m); dist <= fuzzyMaxDistance {
		return model.MatchFuzzy, scoreFuzzy, true
	}
	// Tier 6 — synonym / search-term match (includes Persian/transliteration).
	if matchesField(m.Synonyms, normalized) || matchesField(m.SearchTerms, normalized) {
		return model.MatchSynonym, scoreSynonym, true
	}

	return "", 0, false
}

// combinationMatches reports whether a combination drug is relevant to the query
// at all. It accepts a match against the combination display name, any
// ingredient name, the brand, synonyms or search terms. Relevance here only
// gates inclusion (the score is fixed at the combination tier); this keeps
// unrelated combinations out while still surfacing "Ibuprofen + Famotidine" for
// "Ibuprofen".
func combinationMatches(normalized string, m model.Medicine) bool {
	if matchesField([]string{m.GenericName}, normalized) {
		return true
	}
	for _, ing := range m.Ingredients {
		if matchesField([]string{ing.Name}, normalized) {
			return true
		}
	}
	if brandExact(normalized, m) || brandPrefix(normalized, m) {
		return true
	}
	if matchesField(m.Synonyms, normalized) || matchesField(m.SearchTerms, normalized) {
		return true
	}
	return false
}

// brandExact reports whether the query exactly equals any brand name (single or
// plural), once normalized.
func brandExact(normalized string, m model.Medicine) bool {
	if normalized == "" {
		return false
	}
	if m.BrandName != "" && normalizer.Normalize(m.BrandName) == normalized {
		return true
	}
	for _, b := range m.BrandNames {
		if normalizer.Normalize(b) == normalized {
			return true
		}
	}
	return false
}

// brandPrefix reports whether any brand name, once normalized, starts with the
// query (and is not an exact match, which is handled by brandExact first).
func brandPrefix(normalized string, m model.Medicine) bool {
	if normalized == "" {
		return false
	}
	if m.BrandName != "" {
		if nb := normalizer.Normalize(m.BrandName); strings.HasPrefix(nb, normalized) && nb != normalized {
			return true
		}
	}
	for _, b := range m.BrandNames {
		nb := normalizer.Normalize(b)
		if nb != "" && strings.HasPrefix(nb, normalized) && nb != normalized {
			return true
		}
	}
	return false
}

// fuzzyDistance returns the minimum Damerau-Levenshtein distance between the
// normalized query and the medicine's GENERIC forms (the full normalized
// search_name and each generic token). math.MaxInt is returned when the medicine
// exposes no comparable text.
//
// Deliberate scope: the fuzzy tier is limited to the generic name (not
// synonyms) so an exact synonym match still surfaces under the dedicated synonym
// tier rather than being hidden behind a distance-0 "fuzzy" badge.
func fuzzyDistance(normalized string, m model.Medicine) int {
	best := math.MaxInt

	consider := func(candidate string) {
		if candidate == "" {
			return
		}
		if d := fuzzy.LevenshteinDistance(normalized, candidate); d < best {
			best = d
		}
	}

	consider(m.SearchName)
	for _, tok := range normalizer.Tokenize(m.GenericName) {
		consider(tok)
	}

	return best
}

// matchesField reports whether any value in fields, once normalized, equals or
// contains the normalized query. It backs the synonym/combination tiers.
func matchesField(fields []string, normalized string) bool {
	if normalized == "" {
		return false
	}
	for _, f := range fields {
		nf := normalizer.Normalize(f)
		if nf == "" {
			continue
		}
		if nf == normalized || strings.Contains(nf, normalized) {
			return true
		}
	}
	return false
}

// toResult maps a matched Medicine entity onto a MedicineSearchResult DTO,
// assigning the tier's match type and score, seeding RelatedRxCUIs with the
// concept's own RxCUI (the dedup pass may add more), and ensuring the slice
// fields are non-nil so the JSON payload never renders null arrays.
func toResult(m model.Medicine, mt model.MatchType, score int) model.MedicineSearchResult {
	brandNames := m.BrandNames
	if brandNames == nil {
		brandNames = []string{}
	}
	return model.MedicineSearchResult{
		RxCUI:         m.RxCUI,
		RelatedRxCUIs: []string{m.RxCUI},
		GenericName:   m.GenericName,
		BrandName:     m.BrandName,
		BrandNames:    brandNames,
		Strength:      m.Strength,
		Form:          m.DosageForm,
		Route:         m.Route,
		Category:      m.Category,
		IsCombination: m.IsCombination,
		MatchType:     mt,
		Score:         score,
	}
}
