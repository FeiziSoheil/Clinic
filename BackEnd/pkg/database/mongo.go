// Package database provides a thin connectivity layer plus a generic,
// thread-safe repository abstraction over MongoDB.
//
// It uses the official go.mongodb.org/mongo-driver and follows the project's
// Clean Architecture rules: this package lives in pkg/ and therefore MUST NOT
// import anything from internal/.
package database

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"
)

// connectTimeout is the maximum time spent establishing the TCP connection
// and performing the initial handshake/roundtrip.
const connectTimeout = 10 * time.Second

// Connect establishes a connection to a MongoDB deployment identified by uri
// and returns a ready-to-use *mongo.Client.
//
// The client is created with a sensible server-side timeout and is verified
// via Ping using the primary read preference, so callers can be confident the
// cluster is reachable once this function returns successfully.
//
// The returned *mongo.Client is safe for concurrent use by multiple
// goroutines and should be reused for the lifetime of the process (a single
// client manages an internal connection pool).
func Connect(ctx context.Context, uri string) (*mongo.Client, error) {
	if uri == "" {
		return nil, fmt.Errorf("database: mongo uri must not be empty")
	}

	// Use a dedicated context with a timeout so a hung endpoint cannot block
	// startup indefinitely.
	ctx, cancel := context.WithTimeout(ctx, connectTimeout)
	defer cancel()

	// Apply default client options. The driver will negotiate a connection
	// pool size appropriate for the deployment.
	clientOpts := options.Client().
		ApplyURI(uri).
		SetConnectTimeout(connectTimeout).
		SetServerSelectionTimeout(connectTimeout)

	client, err := mongo.Connect(ctx, clientOpts)
	if err != nil {
		return nil, fmt.Errorf("database: failed to create mongo client: %w", err)
	}

	// Ping the primary node to verify the cluster is actually reachable. We
	// use readpref.Primary which is the strictest and most common choice.
	if err := client.Ping(ctx, readpref.Primary()); err != nil {
		// Best-effort disconnect to release any partial resources.
		_ = client.Disconnect(ctx)
		return nil, fmt.Errorf("database: unable to ping mongo: %w", err)
	}

	return client, nil
}
