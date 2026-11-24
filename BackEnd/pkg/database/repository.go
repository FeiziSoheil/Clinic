package database

import (
	"context"
	"errors"
	"fmt"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// Sentinel errors returned by the repository. Callers can use errors.Is to
// branch on them without inspecting the underlying driver error.
var (
	// ErrNotFound is returned when a query matches no document.
	ErrNotFound = errors.New("database: document not found")
)

// Repository is a generic, MongoDB-backed data access object parameterized by
// the entity type T. It centralizes CRUD operations so each domain can reuse
// the same battle-tested logic instead of re-implementing boilerplate.
//
// Type T must be a struct whose documents use a `primitive.ObjectID` field
// (typically named _id with a bson tag of "_id") so FindByID/Update/Delete
// can operate by id.
//
// Concurrency: Repository itself is stateless beyond holding a pointer to the
// *mongo.Collection. The MongoDB driver is safe for concurrent use, so a
// single Repository instance may be shared across goroutines freely.
type Repository[T any] struct {
	collection *mongo.Collection
}

// NewRepository returns a Repository bound to the given collection. The
// collection is obtained from a *mongo.Database via Database("name").Collection("name").
//
// Example:
//
//	repo := database.NewRepository[User](db.Collection("users"))
func NewRepository[T any](collection *mongo.Collection) *Repository[T] {
	return &Repository[T]{collection: collection}
}

// Collection exposes the underlying *mongo.Collection, allowing domain code to
// perform specialized queries (aggregations, indexes, etc.) that fall outside
// the generic CRUD surface.
func (r *Repository[T]) Collection() *mongo.Collection {
	return r.collection
}

// Insert persists a single document and returns its generated _id.
func (r *Repository[T]) Insert(ctx context.Context, doc T) (primitive.ObjectID, error) {
	result, err := r.collection.InsertOne(ctx, doc)
	if err != nil {
		return primitive.NilObjectID, fmt.Errorf("database: insert failed: %w", err)
	}

	// InsertOne returns the _id as an interface{}; assert to ObjectID. If a
	// custom _id type was used this will fail gracefully.
	oid, ok := result.InsertedID.(primitive.ObjectID)
	if !ok {
		return primitive.NilObjectID, fmt.Errorf("database: inserted _id is not a primitive.ObjectID: %v", result.InsertedID)
	}
	return oid, nil
}

// FindByID retrieves the single document whose _id equals the given id.
// It returns ErrNotFound when no such document exists.
func (r *Repository[T]) FindByID(ctx context.Context, id primitive.ObjectID) (*T, error) {
	return r.FindOne(ctx, bson.M{"_id": id})
}

// FindOne returns the first document matching filter, or ErrNotFound when
// nothing matches.
func (r *Repository[T]) FindOne(ctx context.Context, filter bson.M) (*T, error) {
	var result T
	err := r.collection.FindOne(ctx, filter).Decode(&result)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("database: findOne failed: %w", err)
	}
	return &result, nil
}

// FindAll returns every document matching filter (pass nil/empty for all).
// A nil slice with no error is returned when the filter matches nothing.
func (r *Repository[T]) FindAll(ctx context.Context, filter bson.M) ([]*T, error) {
	// Normalize nil to an empty filter so the caller can pass "everything".
	if filter == nil {
		filter = bson.M{}
	}

	cur, err := r.collection.Find(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("database: findAll failed: %w", err)
	}
	defer func() {
		// Closing the cursor is best-effort; surface nothing that would mask
		// the actual result/error of the query.
		_ = cur.Close(ctx)
	}()

	results := make([]*T, 0)
	for cur.Next(ctx) {
		var item T
		if err := cur.Decode(&item); err != nil {
			return nil, fmt.Errorf("database: decode failed during findAll: %w", err)
		}
		// Copy the loop variable's value so each entry is distinct.
		val := item
		results = append(results, &val)
	}

	if err := cur.Err(); err != nil {
		return nil, fmt.Errorf("database: cursor error during findAll: %w", err)
	}

	return results, nil
}

// FindAllWithOpts is like FindAll but accepts arbitrary mongo FindOptions
// (sort, limit, projection, etc.). It is the escape hatch for read paths that
// need ordering or paging that the plain FindAll does not support. A nil slice
// with no error is returned when the filter matches nothing.
func (r *Repository[T]) FindAllWithOpts(ctx context.Context, filter bson.M, opts *options.FindOptions) ([]*T, error) {
	if filter == nil {
		filter = bson.M{}
	}

	cur, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, fmt.Errorf("database: findAllWithOpts failed: %w", err)
	}
	defer func() {
		_ = cur.Close(ctx)
	}()

	results := make([]*T, 0)
	for cur.Next(ctx) {
		var item T
		if err := cur.Decode(&item); err != nil {
			return nil, fmt.Errorf("database: decode failed during findAllWithOpts: %w", err)
		}
		val := item
		results = append(results, &val)
	}

	if err := cur.Err(); err != nil {
		return nil, fmt.Errorf("database: cursor error during findAllWithOpts: %w", err)
	}

	return results, nil
}

// Update performs an update by _id using the provided update document, which
// must already be $set-shaped (e.g. bson.M{"$set": bson.M{"name": "x"}}).
// It returns ErrNotFound when no document with the given id exists.
func (r *Repository[T]) Update(ctx context.Context, id primitive.ObjectID, update bson.M) error {
	result, err := r.collection.UpdateByID(ctx, id, update)
	if err != nil {
		return fmt.Errorf("database: update failed: %w", err)
	}

	// MatchedCount == 0 means no document had that _id.
	if result.MatchedCount == 0 {
		return ErrNotFound
	}
	return nil
}

// Delete removes the document identified by id. It returns ErrNotFound when
// no document matched the id (so callers can distinguish "deleted" from
// "nothing to delete").
func (r *Repository[T]) Delete(ctx context.Context, id primitive.ObjectID) error {
	result, err := r.collection.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return fmt.Errorf("database: delete failed: %w", err)
	}

	if result.DeletedCount == 0 {
		return ErrNotFound
	}
	return nil
}

// EnsureIndexes is a convenience helper that creates the given indexes if they
// do not already exist. Each input model is a mongo driver IndexModel.
// Callers typically invoke this once during bootstrap.
func (r *Repository[T]) EnsureIndexes(ctx context.Context, models ...mongo.IndexModel) error {
	if len(models) == 0 {
		return nil
	}
	_, err := r.collection.Indexes().CreateMany(ctx, models, options.CreateIndexes())
	if err != nil {
		return fmt.Errorf("database: ensureIndexes failed: %w", err)
	}
	return nil
}
