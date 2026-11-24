// Package service implements the orchestration layer of the Medicine domain.
//
// It sits between the HTTP handler and the lower-level collaborators (the search
// engine, the cache, the repository and the RxNorm client) and owns the business
// rules described in plans/medicine-search-refactor.md §8 step 8:
//
//   - cache-first search with a normalized query key, falling back to a live
//     RxNorm lookup when the local index yields nothing and the feature flag
//     allows it;
//   - detail lookups against the local index first, then RxNorm, with an
//     asynchronous best-effort upsert so a remote miss populates the local
//     index for future queries;
//   - local-index seeding from RxNorm's prescribable concept set;
//   - per-doctor favorites CRUD.
//
// The service maps repository errors onto its own sentinel vocabulary so the
// handler can translate them to HTTP statuses without importing the repository
// package, keeping Clean Architecture's dependency direction intact.
//
// Per the project's Clean Architecture rules this package imports only the
// sibling medicine sub-packages, the standard library and pkg/logger.
package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"clinic-api/internal/medicine/cache"
	"clinic-api/internal/medicine/model"
	"clinic-api/internal/medicine/normalizer"
	"clinic-api/internal/medicine/repository"
	"clinic-api/internal/medicine/rxnorm"
	"clinic-api/internal/medicine/search"
	"clinic-api/pkg/logger"
)

// ---------------------------------------------------------------------------
// Sentinel errors
// ---------------------------------------------------------------------------

// Sentinel errors returned by the service. The handler branches on these (via
// errors.Is) to select the HTTP status, so the service stays free of HTTP
// concerns. They are distinct from the repository's sentinels: the service maps
// repository errors onto this vocabulary, mirroring how the prescription domain
// keeps database.ErrNotFound separate from prescription.ErrNotFound.
var (
	// ErrInvalidRequest is returned when a request argument fails domain
	// validation (empty query, empty rxcui, missing doctor identity).
	ErrInvalidRequest = errors.New("medicine: invalid request")
	// ErrNotFound is returned when a medicine or favorite cannot be found
	// locally and RxNorm fallback is disabled, unavailable or also empty.
	ErrNotFound = errors.New("medicine: not found")
	// ErrAlreadyFavorite is returned when a doctor tries to favorite a drug
	// they have already favorited.
	ErrAlreadyFavorite = errors.New("medicine: already favorited")
	// ErrSearchFailed wraps a failure in the upstream RxNorm fallback path
	// (network/parse/non-2xx). It is only ever returned in fallback mode.
	ErrSearchFailed = errors.New("medicine: search failed")
)

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

// fallbackCacheTTL is the (short) time-to-live used for results served from the
// RxNorm fallback. Local-index hits are cached for the full configured TTL;
// fallback results are inherently less authoritative (and may be transiently
// incomplete), so they are cached only briefly to absorb a burst of identical
// keystrokes without holding potentially stale upstream data for minutes.
const fallbackCacheTTL = 60 * time.Second

// defaultSearchLimit is used when a caller requests a non-positive limit.
const defaultSearchLimit = 20

// backgroundUpsertTimeout bounds the asynchronous local-index upserts that run
// after a fallback miss so they can never leak a goroutine indefinitely.
const backgroundUpsertTimeout = 30 * time.Second

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// Service is the Medicine domain orchestrator. It composes the search engine,
// the cache, the repository and the RxNorm client and applies the cache-first /
// fallback business rules. It is safe for concurrent use because every
// collaborator is goroutine-safe.
type Service struct {
	repo   repository.Repository
	engine *search.Engine
	cache  cache.Cache
	rxnorm rxnorm.Client
	// cacheTTL is the time-to-live applied to local-index search results.
	cacheTTL time.Duration
	// fallbackToRxNorm gates the live-RxNorm fallback for search/detail.
	fallbackToRxNorm bool
	// log is the structured logger; defaults to the package singleton.
	log *slog.Logger
}

// New constructs a Service from its collaborators. The repository, engine,
// cache and rxnorm client are the already-built core components (see
// plans/medicine-search-refactor.md §2.2); cacheTTL is the per-entry cache
// lifetime for local search results; fallbackToRxNorm gates the live upstream
// fallback. A nil logger degrades to the package singleton and a nil cache
// degrades to a NoOpCache, so the service is always usable.
func New(
	repo repository.Repository,
	engine *search.Engine,
	cch cache.Cache,
	client rxnorm.Client,
	cacheTTL time.Duration,
	fallbackToRxNorm bool,
	log *slog.Logger,
) *Service {
	if log == nil {
		log = logger.Get()
	}
	if cch == nil {
		cch = cache.NoOpCache{}
	}
	return &Service{
		repo:             repo,
		engine:           engine,
		cache:            cch,
		rxnorm:           client,
		cacheTTL:         cacheTTL,
		fallbackToRxNorm: fallbackToRxNorm,
		log:              log,
	}
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

// Search runs the medicine search pipeline for q and returns the ranked
// response. The pipeline is:
//
//  1. Validate the query (ErrInvalidRequest on empty/whitespace).
//  2. Cache lookup keyed by normalized(q)+limit; a hit is returned with
//     ServedFromCache=true.
//  3. On a miss, run the search engine against the local index and cache the
//     result for cacheTTL.
//  4. If the local index yields nothing AND fallbackToRxNorm is enabled, query
//     RxNorm, normalize concepts (dropping disallowed term types), return them
//     (cached for the short fallbackCacheTTL), and kick off a non-blocking
//     background upsert so the next identical query is served locally. A
//     fallback failure is wrapped in ErrSearchFailed.
//
// An empty/whitespace query yields ErrInvalidRequest; a non-positive limit is
// coerced to defaultSearchLimit.
func (s *Service) Search(ctx context.Context, q string, limit int) (model.SearchResponse, error) {
	q = strings.TrimSpace(q)
	if q == "" {
		return model.SearchResponse{}, ErrInvalidRequest
	}
	if limit <= 0 {
		limit = defaultSearchLimit
	}

	cacheKey := searchCacheKey(q, limit)

	// (1) Cache hit short-circuits the engine entirely.
	if v, ok := s.cache.Get(cacheKey); ok {
		if cached, okCast := v.([]model.MedicineSearchResult); okCast {
			return model.SearchResponse{
				Query:           q,
				Results:         cached,
				Groups:          model.GroupResults(cached),
				Total:           len(cached),
				ServedFromCache: true,
			}, nil
		}
	}

	// (2) Run the local-index search engine.
	results, err := s.engine.Search(ctx, q, limit)
	if err != nil {
		s.log.Error("medicine search: engine failed", "q", q, "limit", limit, "error", err)
		return model.SearchResponse{}, err
	}

	// Cache positive local results for the full TTL.
	if len(results) > 0 {
		s.cache.Set(cacheKey, results, s.cacheTTL)
	}

	// (3) Fallback to RxNorm only when the local index is empty and the flag
	// allows it. This keeps the clinic usable while the local index is still
	// being seeded (or for concepts that were never seeded).
	if len(results) == 0 && s.fallbackToRxNorm && s.rxnorm != nil {
		concepts, fbErr := s.rxnorm.SearchByName(ctx, q)
		if fbErr != nil {
			s.log.Error("medicine search: rxnorm fallback failed", "q", q, "error", fbErr)
			return model.SearchResponse{}, fmt.Errorf("%w: %v", ErrSearchFailed, fbErr)
		}
		mapped := s.fallbackResults(q, concepts, limit)
		// Cache the fallback result for a short TTL so a burst of identical
		// keystrokes does not re-hit RxNorm, but we do not hold transient
		// upstream data for the full TTL.
		if len(mapped) > 0 {
			s.cache.Set(cacheKey, mapped, fallbackCacheTTL)
			// Best-effort: hydrate the local index so future queries are local.
			go s.upsertConceptsBestEffort(q, concepts)
		}
		return model.SearchResponse{
			Query:           q,
			Results:         mapped,
			Groups:          model.GroupResults(mapped),
			Total:           len(mapped),
			ServedFromCache: false,
		}, nil
	}

	if results == nil {
		results = []model.MedicineSearchResult{}
	}
	return model.SearchResponse{
		Query:           q,
		Results:         results,
		Groups:          model.GroupResults(results),
		Total:           len(results),
		ServedFromCache: false,
	}, nil
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

// GetDetail returns the full MedicineDetail for rxcui. The local index is
// consulted first; on a miss, and only when RxNorm fallback is enabled, the
// service queries RxNorm's approximate-term endpoint, picks the candidate whose
// RxCUI matches (falling back to the top candidate) and asynchronously upserts
// it into the local index so subsequent lookups are local. A genuine absence
// (disabled fallback, or RxNorm also empty) yields ErrNotFound.
func (s *Service) GetDetail(ctx context.Context, rxcui string) (*model.MedicineDetail, error) {
	rxcui = strings.TrimSpace(rxcui)
	if rxcui == "" {
		return nil, ErrInvalidRequest
	}

	med, err := s.repo.FindByRxCUI(ctx, rxcui)
	if err == nil {
		return med.ToDetail(), nil
	}
	if !errors.Is(err, repository.ErrNotFound) {
		s.log.Error("medicine getDetail: local lookup failed", "rxcui", rxcui, "error", err)
		return nil, err
	}

	// Local miss → RxNorm fallback (best-effort).
	if !s.fallbackToRxNorm || s.rxnorm == nil {
		return nil, ErrNotFound
	}
	concepts, fbErr := s.rxnorm.GetApproximateMatch(ctx, rxcui)
	if fbErr != nil {
		s.log.Error("medicine getDetail: rxnorm fallback failed", "rxcui", rxcui, "error", fbErr)
		return nil, fmt.Errorf("%w: %v", ErrSearchFailed, fbErr)
	}

	picked := pickConcept(concepts, rxcui)
	if picked == nil {
		return nil, ErrNotFound
	}

	remote := conceptToMedicine(*picked)
	// Hydrate the local index so the next lookup is a local hit.
	go s.upsertMedicinesBestEffort([]model.Medicine{remote})
	return remote.ToDetail(), nil
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

// Seed refreshes the local medicine index from RxNorm's prescribable concept
// set. It fetches the seed concepts, filters out disallowed term types,
// normalizes each into a Medicine (building its prefix-friendly SearchName and
// parsing its strength/form/route), bulk-upserts them keyed by the unique rxcui
// and returns the number of concepts written. A fetch failure is wrapped in
// ErrSearchFailed.
//
// Re-running Seed is idempotent: the unique rxcui index makes it a no-op for
// already-present concepts.
func (s *Service) Seed(ctx context.Context) (int, error) {
	if s.rxnorm == nil {
		return 0, ErrSearchFailed
	}
	concepts, err := s.rxnorm.FetchSeedConcepts(ctx)
	if err != nil {
		s.log.Error("medicine seed: fetch concepts failed", "error", err)
		return 0, fmt.Errorf("%w: %v", ErrSearchFailed, err)
	}

	meds := conceptsToMedicines(concepts)
	if err := s.repo.BulkUpsert(ctx, meds); err != nil {
		s.log.Error("medicine seed: bulk upsert failed", "count", len(meds), "error", err)
		return 0, err
	}

	s.log.Info("medicine seed complete", "fetched", len(concepts), "upserted", len(meds))
	return len(meds), nil
}

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------

// AddFavorite records a (doctorID, rxcui) favorite. A duplicate (already
// favorited) yields ErrAlreadyFavorite; an empty rxcui or missing doctor yields
// ErrInvalidRequest. The returned response echoes the created favorite; its
// CreatedAt is set to the current time (the authoritative value lives in the
// collection and is returned by ListFavorites).
func (s *Service) AddFavorite(ctx context.Context, doctorID primitive.ObjectID, rxcui string) (*model.FavoriteMedicineResponse, error) {
	rxcui = strings.TrimSpace(rxcui)
	if rxcui == "" || doctorID.IsZero() {
		return nil, ErrInvalidRequest
	}
	if err := s.repo.AddFavorite(ctx, doctorID, rxcui); err != nil {
		if errors.Is(err, repository.ErrAlreadyFavorite) {
			return nil, ErrAlreadyFavorite
		}
		s.log.Error("medicine addFavorite failed", "doctor_id", doctorID.Hex(), "rxcui", rxcui, "error", err)
		return nil, err
	}
	return &model.FavoriteMedicineResponse{
		DoctorID:  doctorID,
		RxCUI:     rxcui,
		CreatedAt: time.Now().UTC(),
	}, nil
}

// RemoveFavorite deletes a (doctorID, rxcui) favorite. Removing a non-existent
// favorite yields ErrNotFound so the handler can return 404; an empty rxcui or
// missing doctor yields ErrInvalidRequest.
func (s *Service) RemoveFavorite(ctx context.Context, doctorID primitive.ObjectID, rxcui string) error {
	rxcui = strings.TrimSpace(rxcui)
	if rxcui == "" || doctorID.IsZero() {
		return ErrInvalidRequest
	}
	if err := s.repo.RemoveFavorite(ctx, doctorID, rxcui); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotFound
		}
		s.log.Error("medicine removeFavorite failed", "doctor_id", doctorID.Hex(), "rxcui", rxcui, "error", err)
		return err
	}
	return nil
}

// ListFavorites returns a doctor's favorites (most-recently-created first),
// mapped onto the API response DTO. An empty result is valid and yields an
// empty (non-nil) slice.
func (s *Service) ListFavorites(ctx context.Context, doctorID primitive.ObjectID) ([]model.FavoriteMedicineResponse, error) {
	if doctorID.IsZero() {
		return nil, ErrInvalidRequest
	}
	favs, err := s.repo.ListFavorites(ctx, doctorID)
	if err != nil {
		s.log.Error("medicine listFavorites failed", "doctor_id", doctorID.Hex(), "error", err)
		return nil, err
	}
	out := make([]model.FavoriteMedicineResponse, 0, len(favs))
	for i := range favs {
		if r := favs[i].ToResponse(); r != nil {
			out = append(out, *r)
		}
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// RxNorm → Medicine mapping helpers
// ---------------------------------------------------------------------------

// conceptsToMedicines converts the raw RxNorm concepts into Medicine entities
// ready for BulkUpsert: disallowed term types are dropped, the prefix-friendly
// SearchName is derived from the generic name and the structured
// strength/form/route are parsed out of the RxNorm description.
func conceptsToMedicines(concepts []rxnorm.RxNormConcept) []model.Medicine {
	meds := make([]model.Medicine, 0, len(concepts))
	seen := make(map[string]struct{}, len(concepts))
	for _, c := range concepts {
		if c.RxCUI == "" || normalizer.IsDisallowedTTY(c.TTY) {
			continue
		}
		if _, dup := seen[c.RxCUI]; dup {
			continue
		}
		seen[c.RxCUI] = struct{}{}
		meds = append(meds, conceptToMedicine(c))
	}
	return meds
}

// conceptToMedicine maps a single RxNorm concept onto a CLINICAL Medicine
// entity. It runs the clinical normalizer (ParseMedicine) which strips the raw
// RxNorm description into a clean GenericName, brand, ingredients, strength,
// dosage form and route, then classifies the clinical category. The result never
// carries a raw RxNorm description string: doctors see "Ibuprofen 400 mg Tablet"
// rendered from the structured fields, never "ibuprofen 400 MG Oral Tablet".
func conceptToMedicine(c rxnorm.RxNormConcept) model.Medicine {
	parts := normalizer.ParseMedicine(c.Name, c.TTY)
	category := model.Category(normalizer.ClassifyCategory(parts.IsCombination, c.TTY))

	brandNames := []string{}
	if parts.Brand != "" {
		brandNames = []string{parts.Brand}
	}
	var synonyms []string
	if c.Synonym != "" {
		synonyms = []string{c.Synonym}
	}

	ingredients := make([]model.Ingredient, 0, len(parts.Ingredients))
	for _, ing := range parts.Ingredients {
		ingredients = append(ingredients, model.Ingredient{
			Name:     ing.Name,
			Strength: ing.Strength,
			Unit:     ing.Unit,
		})
	}

	return model.Medicine{
		RxCUI:         c.RxCUI,
		GenericName:   parts.GenericName,
		BrandName:     parts.Brand,
		BrandNames:    brandNames,
		SearchTerms:   buildSearchTerms(parts, synonyms),
		Synonyms:      synonyms,
		Ingredients:   ingredients,
		Strength:      parts.Strength,
		DosageForm:    parts.DosageForm,
		Route:         parts.Route,
		TTY:           c.TTY,
		Category:      category,
		IsCombination: parts.IsCombination,
		Priority:      model.PriorityByCategory(category),
		SearchName:    normalizer.BuildSearchName(parts.GenericName),
		IsActive:      true,
	}
}

// buildSearchTerms assembles the normalized alias list that feeds the text index
// (alongside generic_name/brand_names/synonyms): the generic name, brand,
// ingredient names and synonyms. This guarantees combination ingredients and any
// transliterated names are searchable. Values are de-duplicated and normalized.
func buildSearchTerms(parts normalizer.ClinicalParts, synonyms []string) []string {
	seen := make(map[string]struct{}, 4)
	terms := make([]string, 0, 4)
	push := func(s string) {
		n := normalizer.Normalize(s)
		if n == "" {
			return
		}
		if _, dup := seen[n]; dup {
			return
		}
		seen[n] = struct{}{}
		terms = append(terms, n)
	}
	push(parts.GenericName)
	push(parts.Brand)
	for _, ing := range parts.Ingredients {
		push(ing.Name)
	}
	for _, s := range synonyms {
		push(s)
	}
	return terms
}

// fallbackResults normalizes RxNorm search concepts into CLINICAL Medicine
// entities and ranks them with the same search engine used for the local index,
// so fallback results get the identical clinical ordering (generics first,
// brands next, combinations last). This keeps the doctor's experience
// consistent whether a result came from the local index or a live RxNorm miss.
func (s *Service) fallbackResults(q string, concepts []rxnorm.RxNormConcept, limit int) []model.MedicineSearchResult {
	meds := conceptsToMedicines(concepts)
	return search.Rank(q, meds, limit)
}

// pickConcept selects the concept from candidates whose RxCUI exactly matches
// rxcui; when none matches it falls back to the first candidate (RxNorm ranks
// the top result highest). It returns nil when candidates is empty.
func pickConcept(candidates []rxnorm.RxNormConcept, rxcui string) *rxnorm.RxNormConcept {
	for i := range candidates {
		if candidates[i].RxCUI == rxcui {
			return &candidates[i]
		}
	}
	if len(candidates) > 0 {
		return &candidates[0]
	}
	return nil
}

// ---------------------------------------------------------------------------
// Background upsert (best-effort)
// ---------------------------------------------------------------------------

// upsertConceptsBestEffort converts RxNorm concepts into Medicine entities and
// upserts them into the local index on a background goroutine. It is intended
// to be called as `go s.upsertConceptsBestEffort(...)` after serving a fallback
// result so the local index is progressively hydrated. The originating query is
// logged purely for diagnostics; all errors (and panics) are swallowed.
func (s *Service) upsertConceptsBestEffort(query string, concepts []rxnorm.RxNormConcept) {
	meds := conceptsToMedicines(concepts)
	if len(meds) == 0 {
		return
	}
	s.upsertMedicinesBestEffort(meds)
	s.log.Debug("medicine: scheduled background upsert from fallback", "query", query, "count", len(meds))
}

// upsertMedicinesBestEffort bulk-upserts meds into the local index on a fresh
// background context (the request context may already be cancelled by the time
// the goroutine runs). It is bounded by backgroundUpsertTimeout and recovers
// from panics so it can never propagate a failure to the caller that scheduled
// it.
func (s *Service) upsertMedicinesBestEffort(meds []model.Medicine) {
	if len(meds) == 0 {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), backgroundUpsertTimeout)
	defer cancel()
	defer func() {
		if r := recover(); r != nil {
			s.log.Error("medicine: background upsert panic recovered", "panic", r)
		}
	}()
	if err := s.repo.BulkUpsert(ctx, meds); err != nil {
		s.log.Error("medicine: background upsert failed", "count", len(meds), "error", err)
	}
}

// ---------------------------------------------------------------------------
// Cache key
// ---------------------------------------------------------------------------

// searchCacheKey derives a stable cache key from the normalized query and the
// limit so that queries differing only by case/whitespace share a cache entry.
// The limit is part of the key because different limits return different result
// windows.
func searchCacheKey(q string, limit int) string {
	return fmt.Sprintf("med:search:%s:%d", normalizer.Normalize(q), limit)
}
