package cache

import (
	"testing"
	"time"
)

func TestMemoryCacheHitAndMiss(t *testing.T) {
	c := NewMemoryCache(10)

	if _, ok := c.Get("missing"); ok {
		t.Fatal("expected miss on an unset key")
	}

	c.Set("k", "v", time.Minute)
	got, ok := c.Get("k")
	if !ok {
		t.Fatal("expected hit after Set")
	}
	if got != "v" {
		t.Errorf("got %v, want v", got)
	}
}

func TestMemoryCacheExpiry(t *testing.T) {
	c := NewMemoryCache(10)

	c.Set("temp", 42, 30*time.Millisecond)
	if _, ok := c.Get("temp"); !ok {
		t.Fatal("expected hit before TTL elapsed")
	}

	time.Sleep(60 * time.Millisecond)
	if _, ok := c.Get("temp"); ok {
		t.Fatal("expected miss after TTL elapsed")
	}
}

func TestMemoryCacheZeroTTLNeverExpires(t *testing.T) {
	c := NewMemoryCache(10)
	c.Set("forever", "x", 0) // <= 0 means never expire
	time.Sleep(20 * time.Millisecond)
	if _, ok := c.Get("forever"); !ok {
		t.Fatal("expected a zero-TTL entry to still be present")
	}
}

func TestMemoryCacheLRUEviction(t *testing.T) {
	c := NewMemoryCache(2)
	c.Set("a", 1, 0)
	c.Set("b", 2, 0)

	// Touch "a" so "b" becomes the least-recently-used.
	if _, ok := c.Get("a"); !ok {
		t.Fatal("expected a hit on a")
	}

	// Inserting "c" exceeds the bound of 2 and must evict the LRU entry "b".
	c.Set("c", 3, 0)

	if _, ok := c.Get("b"); ok {
		t.Fatal("expected b to be evicted as the LRU entry")
	}
	if _, ok := c.Get("a"); !ok {
		t.Fatal("expected a to survive (it was recently used)")
	}
	if _, ok := c.Get("c"); !ok {
		t.Fatal("expected c to survive")
	}
}

func TestMemoryCacheUpdatePromotes(t *testing.T) {
	c := NewMemoryCache(2)
	c.Set("a", 1, 0)
	c.Set("b", 2, 0)

	// Updating "a" in place promotes it, making "b" the LRU candidate.
	c.Set("a", 11, 0)
	c.Set("c", 3, 0)

	if _, ok := c.Get("b"); ok {
		t.Fatal("expected b to be evicted after a was promoted by update")
	}
	if v, ok := c.Get("a"); !ok || v != 11 {
		t.Errorf("expected a to hold updated value 11, got %v (ok=%v)", v, ok)
	}
}

func TestNoOpCacheIsNoOp(t *testing.T) {
	var c Cache = NoOpCache{}
	c.Set("k", "v", time.Minute)
	if _, ok := c.Get("k"); ok {
		t.Fatal("NoOpCache must always report a miss")
	}
}

func TestNewMemoryCacheClampsNonPositive(t *testing.T) {
	c := NewMemoryCache(0)
	c.Set("a", 1, 0)
	c.Set("b", 2, 0) // bound is clamped to 1, so this evicts "a"

	if _, ok := c.Get("a"); ok {
		t.Fatal("expected a to be evicted when bound is clamped to 1")
	}
	if _, ok := c.Get("b"); !ok {
		t.Fatal("expected b to survive")
	}
}
