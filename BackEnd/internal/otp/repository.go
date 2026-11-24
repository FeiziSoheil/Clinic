package otp

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// ErrStoreUnavailable is returned by the BanLevelRepository when the backing
// collection is nil (e.g. the feature is disabled). It is non-fatal: a missing
// ban history simply means the offender starts at level 1.
var ErrStoreUnavailable = errors.New("otp: ban level store unavailable")

// BanLevelRepository persists the escalating ban tier per normalized phone
// number. It owns its own collection (otp_ban_levels) because the document is
// keyed by the phone string rather than an ObjectID, which the generic
// database.Repository helper cannot express.
//
// The repository is safe for concurrent use: it holds only an immutable
// *mongo.Collection and the mongo driver is goroutine-safe.
type BanLevelRepository struct {
	collection *mongo.Collection
}

// NewBanLevelRepository binds the repository to the otp_ban_levels collection.
// A nil collection is permitted: every method degrades to a sensible default
// (level 1) and returns ErrStoreUnavailable, so the OTP flow keeps working even
// when persistence is intentionally disabled (e.g. in tests).
func NewBanLevelRepository(collection *mongo.Collection) *BanLevelRepository {
	return &BanLevelRepository{collection: collection}
}

// Collection exposes the underlying *mongo.Collection so bootstrap can create
// the unique index on the phone _id.
func (r *BanLevelRepository) Collection() *mongo.Collection {
	return r.collection
}

// Get returns the current ban level for phone, or 0 when no record exists. A
// zero level means "never blocked". Any store unavailability is collapsed to
// level 0 so the service can proceed (treating a first offence as level 1).
func (r *BanLevelRepository) Get(ctx context.Context, phone string) (int, error) {
	if r == nil || r.collection == nil {
		return 0, ErrStoreUnavailable
	}
	var bl BanLevel
	err := r.collection.FindOne(ctx, bson.M{"_id": phone}).Decode(&bl)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return 0, nil
		}
		return 0, fmt.Errorf("otp: ban level get failed: %w", err)
	}
	return bl.Level, nil
}

// Increment atomically bumps the ban level for phone by one and returns the new
// (1-based) level. It performs an upsert so the first offence creates the
// document. The stored UpdatedAt is refreshed so operators can see when the last
// escalation happened.
func (r *BanLevelRepository) Increment(ctx context.Context, phone string) (int, error) {
	if r == nil || r.collection == nil {
		// Degrade gracefully: assume escalation from level 0 → 1.
		return 1, ErrStoreUnavailable
	}
	filter := bson.M{"_id": phone}
	update := bson.M{
		"$inc": bson.M{"level": 1},
		"$set": bson.M{"updated_at": time.Now()},
		// $setOnInit only applies on insert (upsert create), seeding the level
		// base value before $inc runs. Without it a fresh insert would $inc an
		// absent field (which mongo treats as 0→1, the desired result), but
		// being explicit makes the intent unambiguous.
		"$setOnInsert": bson.M{"level": 0},
	}
	opts := options.FindOneAndUpdate().
		SetUpsert(true).
		SetReturnDocument(options.After)

	var bl BanLevel
	if err := r.collection.FindOneAndUpdate(ctx, filter, update, opts).Decode(&bl); err != nil {
		return 0, fmt.Errorf("otp: ban level increment failed: %w", err)
	}
	return bl.Level, nil
}

// Reset clears the ban history for phone. It is called after a successful
// verification (per the configured reset-on-success policy) so a returning,
// legitimately-verified user starts with a fresh escalation slate.
func (r *BanLevelRepository) Reset(ctx context.Context, phone string) error {
	if r == nil || r.collection == nil {
		return ErrStoreUnavailable
	}
	if _, err := r.collection.DeleteOne(ctx, bson.M{"_id": phone}); err != nil {
		return fmt.Errorf("otp: ban level reset failed: %w", err)
	}
	return nil
}
