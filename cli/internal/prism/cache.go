package prism

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sync"
	"time"
)

// The Python reference caches retrievals in Redis and calls an explicit
// invalidation function whenever a module's corpus changes. Two things differ
// here.
//
// The cache is in memory, because Kaioken has no Redis and a retrieval cache
// is a latency optimisation, not a source of truth. A one-shot CLI invocation
// never hits it; the daemon and the TUI, which live long enough for a user to
// ask a follow-up, do.
//
// Invalidation is derived rather than performed. The key carries the corpus
// fingerprint and the embedding model, so importing a document or switching
// model orphans every prior entry automatically. An explicit invalidate call
// is a thing you can forget, and forgetting it looks exactly like "my upload
// didn't work" for the length of the TTL.

// DefaultCacheTTL bounds how stale a repeated question's answer can be. Short,
// because the value is in the follow-up asked seconds later, not in serving
// yesterday's retrieval.
const DefaultCacheTTL = 5 * time.Minute

type cacheEntry struct {
	result  Result
	expires time.Time
}

// Cache is a TTL cache of retrieval results, safe for concurrent use.
type Cache struct {
	mu  sync.Mutex
	ttl time.Duration
	m   map[string]cacheEntry
}

// NewCache returns a cache with the given TTL; a non-positive TTL uses
// DefaultCacheTTL.
func NewCache(ttl time.Duration) *Cache {
	if ttl <= 0 {
		ttl = DefaultCacheTTL
	}
	return &Cache{ttl: ttl, m: map[string]cacheEntry{}}
}

// cacheKey identifies one retrieval configuration.
//
// Every input that changes the result belongs in it. topK and variant count
// are here because without them a top_k=3 call collides with a top_k=20 one;
// the fingerprint and embedding model are here so a changed corpus or vector
// space cannot be answered from the old one.
func cacheKey(query, module, fingerprint, embedModel string, topK, variants int, graded bool) string {
	sum := sha256.Sum256([]byte(query))
	return fmt.Sprintf("%s|%s|%s|k%d|n%d|g%t|%s",
		module, fingerprint, embedModel, topK, variants, graded,
		hex.EncodeToString(sum[:])[:24])
}

// Get returns a cached result, if one is present and unexpired.
func (c *Cache) Get(key string) (Result, bool) {
	if c == nil {
		return Result{}, false
	}
	c.mu.Lock()
	defer c.mu.Unlock()

	e, ok := c.m[key]
	if !ok {
		return Result{}, false
	}
	if time.Now().After(e.expires) {
		delete(c.m, key)
		return Result{}, false
	}
	return e.result, true
}

// Set stores a result.
//
// A degraded result is not cached. Degradation means an outage — a dead
// embedding endpoint, an unreadable index — and caching it would keep serving
// the impaired answer for the whole TTL after the problem was fixed, which is
// the one moment a user is most likely to retry.
func (c *Cache) Set(key string, r Result) {
	if c == nil || r.Degraded {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()

	// Bound the map. Retrieval results hold whole parent sections, so an
	// unbounded cache in a long-lived daemon is a slow memory leak.
	if len(c.m) >= maxCacheEntries {
		c.evictExpiredLocked()
		if len(c.m) >= maxCacheEntries {
			clear(c.m)
		}
	}
	c.m[key] = cacheEntry{result: r, expires: time.Now().Add(c.ttl)}
}

// maxCacheEntries bounds the cache. A few hundred retrievals is far more than
// one session asks and still only a handful of megabytes.
const maxCacheEntries = 256

func (c *Cache) evictExpiredLocked() {
	now := time.Now()
	for k, e := range c.m {
		if now.After(e.expires) {
			delete(c.m, k)
		}
	}
}
