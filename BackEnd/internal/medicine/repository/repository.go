// Package repository implements the MongoDB data-access layer for the Medicine
// domain.
//
// It wraps two collections — "medicines" (the normalized concept index) and
// "medicine_favorites" (per-doctor shortcuts) — and exposes a narrow Repository
// interface the search engine and service depend on. The specialized text and
// prefix queries the generic database.Repository[T] cannot express are
// implemented here via the raw *mongo.Collection, exactly as the architecture
// plan sanctions (the Collection() escape hatch). Index creation for both
// collections is centralized in EnsureIndexes.
//
// Per the project's Clean Architecture rules this package imports only model,
// the mongo driver and the project logger; it never imports another domain.
package repository

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"clinic-api/internal/medicine/model"
	"clinic-api/pkg/logger"
)

// ---------------------------------------------------------------------------
// Sentinel errors
// ---------------------------------------------------------------------------

// Sentinel errors returned by the repository. The service and handler layers
// branch on these (via errors.Is) to map to the right HTTP status, keeping the
// repository free of HTTP concerns in line with Clean Architecture.
var (
	// ErrNotFound is returned when a lookup (by rxcui, or a favorite) matches no
	// document.
	ErrNotFound = errors.New("medicine: not found")
	// ErrAlreadyFavorite is returned when a favorite already exists for the
	// (doctor, rxcui) pair, surfaced from the unique index violation.
	ErrAlreadyFavorite = errors.New("medicine: already favorited")
)

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

// Repository is the data-access abstraction the Medicine domain depends on.
// Declaring it as an interface keeps the search engine and service testable with
// a fake, and lets the concrete MongoDB implementation evolve without touching
// callers.
type Repository interface {
	// EnsureIndexes creates the medicines indexes (unique rxcui, search_name
	// prefix, compound text index) and the favorites indexes (unique
	// doctor+rxcui, doctor+created_at read path). It is idempotent and safe to
	// call on every boot.
	EnsureIndexes(ctx context.Context) error

	// SearchPrefix returns active medicines whose normalized search_name starts
	// with the (already normalized) query q, ordered by generic name, capped at
	// limit. It is the index-backed retrieval tier for exact/prefix matching.
	SearchPrefix(ctx context.Context, q string, limit int) ([]model.Medicine, error)

	// SearchText returns active medicines matching the $text query q, ordered by
	// descending text score, capped at limit. It is the candidate source for the
	// fuzzy/brand/synonym tiers.
	SearchText(ctx context.Context, q string, limit int) ([]model.Medicine, error)

	// FindByRxCUI returns the single medicine identified by rxcui, or
	// ErrNotFound when no such document exists.
	FindByRxCUI(ctx context.Context, rxcui string) (*model.Medicine, error)

	// BulkUpsert idempotently inserts or updates the given medicines keyed by
	// their unique rxcui. It is the seed path: re-running it is a no-op for
	// already-present concepts. Entries without an rxcui are skipped.
	BulkUpsert(ctx context.Context, meds []model.Medicine) error

	// AddFavorite records a (doctorID, rxcui) favorite. Re-adding an existing
	// pair yields ErrAlreadyFavorite.
	AddFavorite(ctx context.Context, doctorID primitive.ObjectID, rxcui string) error

	// RemoveFavorite deletes the (doctorID, rxcui) favorite. Removing a
	// non-existent favorite yields ErrNotFound.
	RemoveFavorite(ctx context.Context, doctorID primitive.ObjectID, rxcui string) error

	// ListFavorites returns a doctor's favorites, most-recently-created first.
	ListFavorites(ctx context.Context, doctorID primitive.ObjectID) ([]model.FavoriteMedicine, error)

	// IsFavorite reports whether the (doctorID, rxcui) favorite exists.
	IsFavorite(ctx context.Context, doctorID primitive.ObjectID, rxcui string) (bool, error)
}

// Compile-time guarantee that mongoRepository satisfies Repository.
var _ Repository = (*mongoRepository)(nil)

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

// mongoRepository is the concrete MongoDB-backed Repository. It owns the
// "medicines" and "medicine_favorites" collections and is safe for concurrent
// use because the mongo driver is goroutine-safe.
type mongoRepository struct {
	medicines *mongo.Collection
	favorites *mongo.Collection
}

// New constructs a Repository bound to the given medicines and favorites
// collections (typically db.Collection("medicines") and
// db.Collection("medicine_favorites") from bootstrap).
func New(medicines, favorites *mongo.Collection) Repository {
	return &mongoRepository{
		medicines: medicines,
		favorites: favorites,
	}
}

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// EnsureIndexes creates the indexes the search and uniqueness guarantees rely
// on. It follows the same EnsureIndexes style used elsewhere in the codebase
// (CreateMany + IndexModel). A failure wraps the underlying driver error.
func (r *mongoRepository) EnsureIndexes(ctx context.Context) error {
	unique := true

	medIndexes := []mongo.IndexModel{
		// Globally unique rxcui — the idempotency key for BulkUpsert/seed.
		{
			Keys:    bson.D{{Key: "rxcui", Value: 1}},
			Options: &options.IndexOptions{Unique: &unique},
		},
		// Prefix-friendly normalized name — backs the Level 1/2 regex tier.
		{Keys: bson.D{{Key: "search_name", Value: 1}}},
		// Clinical category — backs category-aware reads/ranking.
		{Keys: bson.D{{Key: "category", Value: 1}}},
		// Compound text index over the searchable free-text fields — backs the
		// $text/$meta:textScore candidate tier (Phase 8: genericName, brandNames,
		// searchTerms, synonyms).
		{Keys: bson.D{
			{Key: "generic_name", Value: "text"},
			{Key: "brand_names", Value: "text"},
			{Key: "search_terms", Value: "text"},
			{Key: "synonyms", Value: "text"},
		}},
	}
	if _, err := r.medicines.Indexes().CreateMany(ctx, medIndexes, options.CreateIndexes()); err != nil {
		return fmt.Errorf("medicine: ensure indexes (medicines): %w", err)
	}

	favIndexes := []mongo.IndexModel{
		// One favorite per (doctor, drug).
		{
			Keys:    bson.D{{Key: "doctor_id", Value: 1}, {Key: "rxcui", Value: 1}},
			Options: &options.IndexOptions{Unique: &unique},
		},
		// List-favorites read path (most-recent first).
		{Keys: bson.D{{Key: "doctor_id", Value: 1}, {Key: "created_at", Value: -1}}},
	}
	if _, err := r.favorites.Indexes().CreateMany(ctx, favIndexes, options.CreateIndexes()); err != nil {
		return fmt.Errorf("medicine: ensure indexes (favorites): %w", err)
	}

	return nil
}

// ---------------------------------------------------------------------------
// Search helpers
// ---------------------------------------------------------------------------

// SearchPrefix returns active medicines whose search_name starts with q
// (case-insensitive), ordered by generic_name ascending and capped at limit.
// q must already be normalized by the caller; it is regex-escaped here so a
// stray punctuation character cannot corrupt the pattern. An empty query or a
// non-positive limit yields an empty result.
func (r *mongoRepository) SearchPrefix(ctx context.Context, q string, limit int) ([]model.Medicine, error) {
	if q == "" || limit <= 0 {
		return []model.Medicine{}, nil
	}

	filter := bson.M{
		"search_name": primitive.Regex{Pattern: "^" + regexp.QuoteMeta(q), Options: "i"},
		"is_active":   true,
	}
	opts := options.Find().
		SetLimit(int64(limit)).
		SetSort(bson.D{{Key: "generic_name", Value: 1}})

	return findMedicines(ctx, r.medicines, filter, opts)
}

// SearchText returns active medicines matching the $text query q, ordered by
// descending text score and capped at limit. An empty query or a non-positive
// limit yields an empty result.
func (r *mongoRepository) SearchText(ctx context.Context, q string, limit int) ([]model.Medicine, error) {
	if q == "" || limit <= 0 {
		return []model.Medicine{}, nil
	}

	filter := bson.M{
		"$text":     bson.M{"$search": q},
		"is_active": true,
	}
	opts := options.Find().
		SetLimit(int64(limit)).
		SetSort(bson.D{{Key: "score", Value: bson.M{"$meta": "textScore"}}})

	return findMedicines(ctx, r.medicines, filter, opts)
}

// FindByRxCUI returns the single medicine identified by rxcui, or ErrNotFound.
func (r *mongoRepository) FindByRxCUI(ctx context.Context, rxcui string) (*model.Medicine, error) {
	var m model.Medicine
	err := r.medicines.FindOne(ctx, bson.M{"rxcui": rxcui}).Decode(&m)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("medicine: findByRxCUI: %w", err)
	}
	return &m, nil
}

// findMedicines runs a Find with the given filter/options and decodes the cursor
// into a value (non-pointer) slice of model.Medicine. It centralizes the
// cursor/cleanup boilerplate shared by the search helpers.
func findMedicines(ctx context.Context, coll *mongo.Collection, filter any, opts *options.FindOptions) ([]model.Medicine, error) {
	cur, err := coll.Find(ctx, filter, opts)
	if err != nil {
		return nil, fmt.Errorf("medicine: search query failed: %w", err)
	}
	defer func() { _ = cur.Close(ctx) }()

	results := make([]model.Medicine, 0)
	for cur.Next(ctx) {
		var m model.Medicine
		if err := cur.Decode(&m); err != nil {
			return nil, fmt.Errorf("medicine: decode failed: %w", err)
		}
		results = append(results, m)
	}
	if err := cur.Err(); err != nil {
		return nil, fmt.Errorf("medicine: cursor error: %w", err)
	}
	return results, nil
}

// ---------------------------------------------------------------------------
// BulkUpsert (seed path)
// ---------------------------------------------------------------------------

// BulkUpsert idempotently inserts or updates the given medicines keyed by their
// unique rxcui. Existing concepts have their mutable fields refreshed; new
// concepts are inserted with a generated _id and created_at. Entries with an
// empty rxcui are skipped. Re-running a seed is therefore a safe no-op.
//
// The caller is responsible for populating SearchName (via the normalizer); the
// repository intentionally does not import the normalizer to keep its
// dependency surface limited to model + the mongo driver.
func (r *mongoRepository) BulkUpsert(ctx context.Context, meds []model.Medicine) error {
	if len(meds) == 0 {
		return nil
	}

	now := time.Now().UTC()
	models := make([]mongo.WriteModel, 0, len(meds))
	for i := range meds {
		m := meds[i]
		if strings.TrimSpace(m.RxCUI) == "" {
			continue
		}
		if m.ID.IsZero() {
			m.ID = primitive.NewObjectID()
		}

		filter := bson.M{"rxcui": m.RxCUI}
		ingredients := m.Ingredients
		if ingredients == nil {
			ingredients = []model.Ingredient{}
		}
		update := bson.M{
			"$set": bson.M{
				"generic_name":   m.GenericName,
				"brand_name":     m.BrandName,
				"brand_names":    nonNilStrings(m.BrandNames),
				"search_terms":   nonNilStrings(m.SearchTerms),
				"synonyms":       nonNilStrings(m.Synonyms),
				"ingredients":    ingredients,
				"tty":            m.TTY,
				"strength":       m.Strength,
				"dosage_form":    m.DosageForm,
				"route":          m.Route,
				"category":       string(m.Category),
				"is_combination": m.IsCombination,
				"priority":       m.Priority,
				"search_name":    m.SearchName,
				"is_active":      true,
				"updated_at":     now,
			},
			"$setOnInsert": bson.M{
				"_id":        m.ID,
				"rxcui":      m.RxCUI,
				"created_at": now,
			},
		}
		models = append(models, mongo.NewUpdateOneModel().SetFilter(filter).SetUpdate(update).SetUpsert(true))
	}
	if len(models) == 0 {
		return nil
	}

	result, err := r.medicines.BulkWrite(ctx, models, options.BulkWrite())
	if err != nil {
		return fmt.Errorf("medicine: bulkUpsert failed: %w", err)
	}
	logger.Get().Info("medicine: bulk upsert complete",
		"upserted", result.UpsertedCount, "modified", result.ModifiedCount)
	return nil
}

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------

// AddFavorite inserts a (doctorID, rxcui) favorite. A duplicate (caught by the
// unique index) is mapped to ErrAlreadyFavorite so the handler can return 409.
func (r *mongoRepository) AddFavorite(ctx context.Context, doctorID primitive.ObjectID, rxcui string) error {
	fav := model.FavoriteMedicine{
		ID:        primitive.NewObjectID(),
		DoctorID:  doctorID,
		RxCUI:     rxcui,
		CreatedAt: time.Now().UTC(),
	}
	if _, err := r.favorites.InsertOne(ctx, fav); err != nil {
		if isDuplicateKeyErr(err) {
			return ErrAlreadyFavorite
		}
		return fmt.Errorf("medicine: addFavorite: %w", err)
	}
	return nil
}

// RemoveFavorite deletes the (doctorID, rxcui) favorite. Removing a non-existent
// favorite yields ErrNotFound.
func (r *mongoRepository) RemoveFavorite(ctx context.Context, doctorID primitive.ObjectID, rxcui string) error {
	filter := bson.M{"doctor_id": doctorID, "rxcui": rxcui}
	result, err := r.favorites.DeleteOne(ctx, filter)
	if err != nil {
		return fmt.Errorf("medicine: removeFavorite: %w", err)
	}
	if result.DeletedCount == 0 {
		return ErrNotFound
	}
	return nil
}

// ListFavorites returns a doctor's favorites, most-recently-created first. An
// empty result is valid and yields an empty slice (not an error).
func (r *mongoRepository) ListFavorites(ctx context.Context, doctorID primitive.ObjectID) ([]model.FavoriteMedicine, error) {
	filter := bson.M{"doctor_id": doctorID}
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}})

	cur, err := r.favorites.Find(ctx, filter, opts)
	if err != nil {
		return nil, fmt.Errorf("medicine: listFavorites: %w", err)
	}
	defer func() { _ = cur.Close(ctx) }()

	results := make([]model.FavoriteMedicine, 0)
	for cur.Next(ctx) {
		var f model.FavoriteMedicine
		if err := cur.Decode(&f); err != nil {
			return nil, fmt.Errorf("medicine: listFavorites decode: %w", err)
		}
		results = append(results, f)
	}
	if err := cur.Err(); err != nil {
		return nil, fmt.Errorf("medicine: listFavorites cursor: %w", err)
	}
	return results, nil
}

// IsFavorite reports whether the (doctorID, rxcui) favorite exists.
func (r *mongoRepository) IsFavorite(ctx context.Context, doctorID primitive.ObjectID, rxcui string) (bool, error) {
	filter := bson.M{"doctor_id": doctorID, "rxcui": rxcui}
	count, err := r.favorites.CountDocuments(ctx, filter)
	if err != nil {
		return false, fmt.Errorf("medicine: isFavorite: %w", err)
	}
	return count > 0, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// isDuplicateKeyErr reports whether err is a MongoDB duplicate-key (E11000)
// error, used to map a unique-index violation onto ErrAlreadyFavorite. It
// mirrors the helper used in the booking domain.
func isDuplicateKeyErr(err error) bool {
	var we mongo.WriteException
	if errors.As(err, &we) {
		for _, we2 := range we.WriteErrors {
			if we2.Code == 11000 {
				return true
			}
		}
	}
	return false
}

// nonNilStrings returns in if non-nil, otherwise an empty slice. It keeps
// persisted arrays as [] rather than null, matching the model DTO contract.
func nonNilStrings(in []string) []string {
	if in == nil {
		return []string{}
	}
	return in
}
