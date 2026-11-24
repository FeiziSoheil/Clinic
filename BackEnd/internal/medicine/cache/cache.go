// Package cache defines the cache abstraction used by the Medicine search
// service to short-circuit repeated queries.
//
// The interface is intentionally minimal and value-typed (string keys, any
// values, per-entry TTL) so that an in-memory TTL-LRU implementation
// (memory.go) and a future Redis-backed implementation can satisfy it without
// the service caring which is wired. It is nil-safe via NoOpCache so callers can
// disable caching by passing a no-op implementation rather than guarding nil at
// every call site.
//
// Per the project's Clean Architecture rules this package lives in `pkg/`-like
// territory under the domain but imports only the standard library, keeping it
// free of any other domain dependency.
package cache

import "time"

// Cache is the generic, TTL-aware key/value cache abstraction the Medicine
// service depends on. Get returns the cached value and true when the key exists
// and has not expired; otherwise it returns a zero value and false. Set stores
// value under key for the given ttl; a non-positive ttl means the entry never
// expires (until evicted by the bound, if any).
type Cache interface {
	// Get returns the cached value for key and true if present and unexpired;
	// otherwise (nil, false).
	Get(key string) (any, bool)
	// Set stores value under key with the given ttl.
	Set(key string, value any, ttl time.Duration)
}

// NoOpCache is the nil-safe Cache implementation: it stores nothing and always
// reports a miss. Wire it (or nil) to disable caching without adding nil guards
// at every call site.
type NoOpCache struct{}

// Get implements Cache; it always reports a miss.
func (NoOpCache) Get(string) (any, bool) { return nil, false }

// Set implements Cache; it discards the value.
func (NoOpCache) Set(string, any, time.Duration) {}
