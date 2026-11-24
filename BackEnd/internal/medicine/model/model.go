// Package model defines the persisted MongoDB entity and the request/response
// DTOs for the Medicine domain.
//
// The Medicine domain is a reference-data domain: it owns a locally indexed set
// of CLINICALLY normalized drug concepts (seeded from RxNorm and enriched with
// local brand/synonym knowledge, including Persian/transliterated names) plus
// the per-doctor favorites that speed up clinical authoring. The entities map
// 1:1 to the "medicines" and "medicine_favorites" MongoDB collections.
//
// The clinical model intentionally decouples the stored concept from the raw
// RxNorm description: a concept carries a clean GenericName (e.g. "Ibuprofen"),
// a structured Ingredients list (so combination drugs are first-class), a
// Category (generic / brand / combination) used to keep combinations from
// crowding out single-ingredient results, and a Priority weight. Raw RxNorm
// description strings never reach the API consumer.
//
// Per the project's Clean Architecture rules this package lives in `internal/`
// and imports only the standard library plus the mongo-driver primitive types,
// so it has no dependencies on the rest of the domain.
package model

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// ---------------------------------------------------------------------------
// Match classification
// ---------------------------------------------------------------------------

// MatchType classifies how a single medicine result matched the user's query.
// It is a typed string so the valid values are auditable at the call site while
// remaining JSON-friendly; the JSON wire values are the snake_case tokens used
// by the public API contract.
type MatchType string

const (
	// MatchExactGeneric marks a result whose normalized generic name exactly
	// equals the normalized query (highest relevance, score 100).
	MatchExactGeneric MatchType = "exact_generic"
	// MatchPrefixGeneric marks a result whose normalized generic name starts with
	// the normalized query (score 95).
	MatchPrefixGeneric MatchType = "prefix_generic"
	// MatchExactBrand marks a result whose brand name exactly equals the
	// normalized query (score 90).
	MatchExactBrand MatchType = "exact_brand"
	// MatchPrefixBrand marks a result whose brand name starts with the normalized
	// query (score 80).
	MatchPrefixBrand MatchType = "prefix_brand"
	// MatchFuzzy marks a result matched by a small (≤2) Damerau-Levenshtein
	// distance against a generic token, i.e. a tolerated typo (score 75).
	MatchFuzzy MatchType = "fuzzy"
	// MatchSynonym marks a result whose synonyms (including Persian/transliterated
	// alternates) or search terms contain/equal the normalized query (score 70).
	MatchSynonym MatchType = "synonym"
	// MatchCombination marks a multi-ingredient (combination) drug that matched
	// the query. Combinations are deliberately demoted to the lowest tier (score
	// 30) so they never crowd out single-ingredient generics/brands.
	MatchCombination MatchType = "combination"
)

// ---------------------------------------------------------------------------
// Clinical classification
// ---------------------------------------------------------------------------

// Category classifies a medicine for clinical ranking and UI grouping. It is a
// typed string whose JSON wire values are the tokens used by the public API
// contract.
type Category string

const (
	// CategoryGeneric is a generic clinical drug (RxNorm SCD/IN): the canonical
	// prescribable form, ranked highest.
	CategoryGeneric Category = "generic"
	// CategoryBrand is a branded clinical drug (RxNorm SBD): a specific trade
	// product, ranked below generics.
	CategoryBrand Category = "brand"
	// CategoryCombination is a multi-ingredient drug; ranked lowest so it never
	// appears before the single-ingredient matches the doctor most likely wants.
	CategoryCombination Category = "combination"
)

// CategoryRank returns a sortable weight for c: generic(0) < brand(1) <
// combination(2). It is used as a stable tie-breaker so that, within the same
// relevance score, generics precede brands precede combinations. Unknown
// categories sort last.
func CategoryRank(c Category) int {
	switch c {
	case CategoryGeneric:
		return 0
	case CategoryBrand:
		return 1
	case CategoryCombination:
		return 2
	default:
		return 3
	}
}

// PriorityByCategory returns the default stored priority weight for a category.
// It mirrors the search engine's tier ceiling so the persisted Priority is
// consistent with how the medicine will rank.
func PriorityByCategory(c Category) int {
	switch c {
	case CategoryGeneric:
		return 100
	case CategoryBrand:
		return 70
	case CategoryCombination:
		return 30
	default:
		return 0
	}
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

// Ingredient is a single active ingredient of a medicine with its strength.
// Combination drugs carry more than one; single-ingredient drugs carry one.
type Ingredient struct {
	// Name is the canonical ingredient name, e.g. "Ibuprofen".
	Name string `bson:"name" json:"name"`
	// Strength is the per-ingredient strength value with unit, e.g. "800 mg".
	Strength string `bson:"strength,omitempty" json:"strength,omitempty"`
	// Unit is the optional parsed unit, e.g. "mg". Kept distinct so the UI can
	// render strengths uniformly; empty when not parsed.
	Unit string `bson:"unit,omitempty" json:"unit,omitempty"`
}

// Medicine is the persisted representation of a clinically normalized drug
// concept. It maps 1:1 to a document in the "medicines" MongoDB collection.
//
// The concept is anchored by its RxNorm CUI (globally unique) and is searchable
// through three indexed surfaces: the prefix-friendly SearchName (normalized
// generic name), a compound text index over GenericName/BrandNames/SearchTerms/
// Synonyms, and the structured fields (Strength, DosageForm, Route, Ingredients)
// used to render a clean clinical view.
//
// Raw RxNorm description strings are NOT stored as the display name: GenericName
// holds the clean, title-cased name (e.g. "Ibuprofen") and the original
// components live in Strength/DosageForm/Route/Ingredients.
type Medicine struct {
	// ID is the MongoDB primary key.
	ID primitive.ObjectID `bson:"_id" json:"id"`
	// RxCUI is the RxNorm Concept Unique Identifier; globally unique and the
	// idempotency key used during seeding (BulkUpsert).
	RxCUI string `bson:"rxcui" json:"rxcui"`
	// GenericName is the clean, title-cased canonical name for display, e.g.
	// "Ibuprofen" or "Famotidine + Ibuprofen" (combinations join ingredients).
	GenericName string `bson:"generic_name" json:"generic_name"`
	// BrandName is the primary trade name for a branded product (SBD), e.g.
	// "Advil"; empty for generics. Derived from the RxNorm "[...]" suffix.
	BrandName string `bson:"brand_name,omitempty" json:"brand_name,omitempty"`
	// BrandNames holds all known trade names, e.g. ["Tylenol","Panadol"]. For a
	// branded product this typically has one entry; for an ingredient (IN) it may
	// carry several known brands.
	BrandNames []string `bson:"brand_names,omitempty" json:"brand_names,omitempty"`
	// SearchTerms are normalized aliases that feed the text index alongside the
	// generic/brand/synonym fields (generic, brands, synonyms, ingredients).
	SearchTerms []string `bson:"search_terms,omitempty" json:"search_terms,omitempty"`
	// Synonyms holds alternate names including Persian/transliterated forms,
	// e.g. ["paracetamol","پاراسیتامول"].
	Synonyms []string `bson:"synonyms,omitempty" json:"synonyms,omitempty"`
	// Ingredients lists the active ingredient(s) with their strengths. A
	// combination drug has more than one; a concentration (e.g. "250 MG / 5 ML")
	// is modeled as a single ingredient with a ratio strength.
	Ingredients []Ingredient `bson:"ingredients,omitempty" json:"ingredients,omitempty"`
	// Strength is the clean display strength, e.g. "400 mg" or "26.6 mg / 800 mg".
	Strength string `bson:"strength,omitempty" json:"strength,omitempty"`
	// DosageForm is the dosage form, e.g. "Tablet".
	DosageForm string `bson:"dosage_form,omitempty" json:"dosage_form,omitempty"`
	// Route is the administration route, e.g. "Oral".
	Route string `bson:"route,omitempty" json:"route,omitempty"`
	// TTY is the RxNorm term type (IN/SCD/SBD/...). Disallowed packaging types
	// (BPCK/GPCK/PACK/KIT) are filtered out during ingestion.
	TTY string `bson:"tty,omitempty" json:"tty,omitempty"`
	// Category is the clinical classification (generic/brand/combination).
	Category Category `bson:"category" json:"category"`
	// IsCombination reports whether this is a multi-ingredient drug.
	IsCombination bool `bson:"is_combination" json:"is_combination"`
	// Priority is the default ranking weight by category (generic 100, brand 70,
	// combination 30); reserved for future "frequently prescribed" boosting.
	Priority int `bson:"priority" json:"priority"`
	// SearchName is normalizer.Normalize(GenericName); it drives the prefix
	// tier of the search engine and is indexed for index-backed ^regex lookups.
	SearchName string `bson:"search_name" json:"search_name"`
	// IsActive is the soft-disable flag. Inactive medicines are excluded from
	// search but retained for historical linkage.
	IsActive bool `bson:"is_active" json:"is_active"`
	// CreatedAt is the timestamp the concept was first persisted.
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	// UpdatedAt is the timestamp of the most recent mutation.
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

// ToDetail converts the Medicine entity into a MedicineDetail DTO, normalizing
// the optional slice fields so the JSON payload never renders a null array. It
// returns nil for a nil receiver so callers can chain safely.
func (m *Medicine) ToDetail() *MedicineDetail {
	if m == nil {
		return nil
	}
	ingredients := make([]Ingredient, 0, len(m.Ingredients))
	for _, ing := range m.Ingredients {
		ingredients = append(ingredients, ing)
	}
	return &MedicineDetail{
		RxCUI:         m.RxCUI,
		GenericName:   m.GenericName,
		BrandName:     m.BrandName,
		BrandNames:    nonNilStrings(m.BrandNames),
		Synonyms:      nonNilStrings(m.Synonyms),
		Ingredients:   ingredients,
		Strength:      m.Strength,
		DosageForm:    m.DosageForm,
		Route:         m.Route,
		TTY:           m.TTY,
		Category:      m.Category,
		IsCombination: m.IsCombination,
	}
}

// FavoriteMedicine is the persisted representation of a doctor's favorited drug
// shortcut. It maps 1:1 to a document in the "medicine_favorites" collection.
// The (DoctorID, RxCUI) pair is unique so a doctor can favorite a given drug at
// most once.
type FavoriteMedicine struct {
	// ID is the MongoDB primary key.
	ID primitive.ObjectID `bson:"_id" json:"id"`
	// DoctorID references the user account (role DOCTOR) that owns the favorite.
	DoctorID primitive.ObjectID `bson:"doctor_id" json:"doctor_id"`
	// RxCUI is the RxNorm CUI of the favorited drug, denormalized for stable
	// linkage even if the drug document is later re-seeded.
	RxCUI string `bson:"rxcui" json:"rxcui"`
	// CreatedAt is the timestamp the favorite was created (drives the
	// most-recent-first listing).
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
}

// ToResponse converts the FavoriteMedicine entity into a FavoriteMedicineResponse
// DTO. It returns nil for a nil receiver so callers can chain safely.
func (f *FavoriteMedicine) ToResponse() *FavoriteMedicineResponse {
	if f == nil {
		return nil
	}
	return &FavoriteMedicineResponse{
		DoctorID:  f.DoctorID,
		RxCUI:     f.RxCUI,
		CreatedAt: f.CreatedAt,
	}
}

// ---------------------------------------------------------------------------
// Response / search DTOs
// ---------------------------------------------------------------------------

// MedicineSearchResult is a single ranked hit in a SearchResponse. It carries
// the clean clinical display fields plus the Category/MatchType/Score assigned
// by the search engine. Raw RxNorm descriptions, the raw RxCUI as an opaque
// identifier and the raw synonyms are NOT surfaced — only the normalized,
// human-friendly fields.
type MedicineSearchResult struct {
	// RxCUI is the display RxNorm CUI of the logical medicine (the primary
	// concept); the API never returns raw RxNorm identifiers beyond this.
	RxCUI string `json:"rxcui"`
	// RelatedRxCUIs are additional RxCUIs that resolve to the SAME logical
	// clinical medicine (same generic+strength+form+route+category after the
	// deduplication pass). Kept so the client can resolve details for any
	// equivalent concept. Never null.
	RelatedRxCUIs []string `json:"related_rxcuis"`
	// GenericName is the clean canonical name, e.g. "Ibuprofen".
	GenericName string `json:"generic_name"`
	// BrandName is the primary trade name for a branded product; empty for
	// generics. Serializes to a single field per the clinical contract.
	BrandName string `json:"brand_name,omitempty"`
	// BrandNames is the (possibly empty) set of trade names; never null.
	BrandNames []string `json:"brand_names"`
	// Strength is the clean display strength, e.g. "400 mg".
	Strength string `json:"strength,omitempty"`
	// Form is the dosage form, e.g. "Tablet".
	Form string `json:"form,omitempty"`
	// Route is the administration route, e.g. "Oral".
	Route string `json:"route,omitempty"`
	// Category is the clinical classification (generic/brand/combination).
	Category Category `json:"category"`
	// IsCombination reports whether this is a multi-ingredient drug.
	IsCombination bool `json:"is_combination"`
	// MatchType is the highest-priority tier the result qualified for.
	MatchType MatchType `json:"match_type"`
	// Score is the relevance score (higher is better).
	Score int `json:"score"`
}

// MedicineDetail is the full-document response returned by the detail endpoint.
// It exposes the structured clinical view (ingredients, category, strengths)
// without any raw RxNorm description.
type MedicineDetail struct {
	RxCUI         string       `json:"rxcui"`
	GenericName   string       `json:"generic_name"`
	BrandName     string       `json:"brand_name,omitempty"`
	BrandNames    []string     `json:"brand_names"`
	Synonyms      []string     `json:"synonyms"`
	Ingredients   []Ingredient `json:"ingredients"`
	Strength      string       `json:"strength,omitempty"`
	DosageForm    string       `json:"dosage_form,omitempty"`
	Route         string       `json:"route,omitempty"`
	TTY           string       `json:"tty,omitempty"`
	Category      Category     `json:"category"`
	IsCombination bool         `json:"is_combination"`
}

// MedicineResultGroups is the pre-grouped view of search results by clinical
// category, so the frontend only renders instead of re-partitioning. Each slice
// preserves the backend's clinical ranking (score desc -> category -> ascending
// strength -> name). Never-null slices.
type MedicineResultGroups struct {
	// Generic holds the generic clinical drugs.
	Generic []MedicineSearchResult `json:"generic"`
	// Brand holds the branded clinical drugs.
	Brand []MedicineSearchResult `json:"brand"`
	// Combination holds the multi-ingredient drugs (lowest priority).
	Combination []MedicineSearchResult `json:"combination"`
}

// SearchResponse is the payload returned by the medicine search endpoint. It
// echoes the query, the ranked+deduplicated results (flat), the pre-grouped
// view, the total count and whether the answer was served from the cache.
type SearchResponse struct {
	// Query is the (trimmed) search term that produced the results.
	Query string `json:"query"`
	// Results is the ranked, de-duplicated list of logical medicines; never null.
	Results []MedicineSearchResult `json:"results"`
	// Groups is the same results pre-partitioned by clinical category so the
	// frontend can render sections without re-grouping.
	Groups MedicineResultGroups `json:"groups"`
	// Total is the number of results in Results.
	Total int `json:"total"`
	// ServedFromCache reports whether the response was served from the cache
	// without re-running the search engine.
	ServedFromCache bool `json:"served_from_cache"`
}

// GroupResults partitions ranked results into the generic/brand/combination
// sections by Category. It is the single grouping rule shared by the search
// engine and the service so the API response's Groups and the flat Results stay
// consistent.
func GroupResults(results []MedicineSearchResult) MedicineResultGroups {
	g := MedicineResultGroups{
		Generic:     make([]MedicineSearchResult, 0),
		Brand:       make([]MedicineSearchResult, 0),
		Combination: make([]MedicineSearchResult, 0),
	}
	for _, r := range results {
		switch r.Category {
		case CategoryBrand:
			g.Brand = append(g.Brand, r)
		case CategoryCombination:
			g.Combination = append(g.Combination, r)
		default:
			g.Generic = append(g.Generic, r)
		}
	}
	return g
}

// FavoriteMedicineResponse is the DTO returned by the favorites endpoints. It
// omits the internal ObjectID and exposes only the doctor/rxcui/created-at
// triple.
type FavoriteMedicineResponse struct {
	// DoctorID is the ObjectID of the doctor that owns the favorite.
	DoctorID primitive.ObjectID `json:"doctor_id"`
	// RxCUI is the RxNorm CUI of the favorited drug.
	RxCUI string `json:"rxcui"`
	// CreatedAt is the timestamp the favorite was created.
	CreatedAt time.Time `json:"created_at"`
}

// nonNilStrings returns in if it is non-nil, otherwise a freshly allocated empty
// slice. It keeps JSON payloads free of null arrays without changing semantics.
func nonNilStrings(in []string) []string {
	if in == nil {
		return []string{}
	}
	return in
}
