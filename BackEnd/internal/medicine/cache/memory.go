// This file implements the in-memory TTL+LRU Cache. It is the ship-now
// implementation described in plans/medicine-search-refactor.md §6: a
// bounded-size, per-entry-TTL cache that is thread-safe and Redis-ready (a
// future redis.go implementing the same Cache interface drops in with zero
// service-side change).
package cache

import (
	"container/list"
	"sync"
	"time"
)

// cacheEntry holds a single cached value plus its absolute expiry. A zero
// expiresAt means the entry never expires (it lives until LRU-evicted).
type cacheEntry struct {
	key       string
	value     any
	expiresAt time.Time
}

// MemoryCache is a thread-safe in-memory Cache combining per-entry TTL with a
// least-recently-used eviction bound. Get promotes the accessed entry to the
// front of the recency list; Set evicts the back element once the configured
// maxEntries is exceeded. Expired entries are reaped lazily on access.
type MemoryCache struct {
	mu         sync.Mutex
	maxEntries int
	items      map[string]*list.Element
	ll         *list.List
}

// NewMemoryCache constructs a MemoryCache bounded to maxEntries. A non-positive
// maxEntries is clamped to 1 so the cache always holds at least one item.
func NewMemoryCache(maxEntries int) *MemoryCache {
	if maxEntries <= 0 {
		maxEntries = 1
	}
	return &MemoryCache{
		maxEntries: maxEntries,
		items:      make(map[string]*list.Element),
		ll:         list.New(),
	}
}

// Get returns the value for key and true when it exists and has not expired;
// otherwise (nil, false). A hit lazily reaps an expired entry and promotes a
// live one to the front of the recency list.
func (c *MemoryCache) Get(key string) (any, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	elem, ok := c.items[key]
	if !ok {
		return nil, false
	}
	entry := elem.Value.(*cacheEntry)
	// Lazy expiry: drop the entry and report a miss if its TTL has elapsed. A
	// zero expiresAt means "never expires".
	if !entry.expiresAt.IsZero() && time.Now().After(entry.expiresAt) {
		c.removeElement(elem)
		return nil, false
	}
	// Promote to most-recently-used.
	c.ll.MoveToFront(elem)
	return entry.value, true
}

// Set stores value under key with the given ttl. A ttl <= 0 means the entry
// never expires (until evicted by the size bound). An existing key is updated
// in place and promoted; a new key evicts the least-recently-used element when
// the bound is exceeded.
func (c *MemoryCache) Set(key string, value any, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()

	var expiresAt time.Time
	if ttl > 0 {
		expiresAt = time.Now().Add(ttl)
	}

	if elem, ok := c.items[key]; ok {
		c.ll.MoveToFront(elem)
		entry := elem.Value.(*cacheEntry)
		entry.value = value
		entry.expiresAt = expiresAt
		return
	}

	elem := c.ll.PushFront(&cacheEntry{
		key:       key,
		value:     value,
		expiresAt: expiresAt,
	})
	c.items[key] = elem

	// Evict least-recently-used entries over the bound.
	for c.ll.Len() > c.maxEntries {
		oldest := c.ll.Back()
		if oldest == nil {
			break
		}
		c.removeElement(oldest)
	}
}

// removeElement detaches a list element from both the recency list and the key
// map. The caller MUST hold c.mu.
func (c *MemoryCache) removeElement(elem *list.Element) {
	entry := c.ll.Remove(elem).(*cacheEntry)
	delete(c.items, entry.key)
}
