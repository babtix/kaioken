package ext

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"kaioken/internal/config"
)

// The community registry is a plain JSON index in a public repository,
// submitted to by pull request. It stores pointers, never code — an
// extension always downloads from its author's own GitHub releases, so
// listing costs nothing to host and ownership stays with authors.

// defaultRegistryURL is the community extension index.
const defaultRegistryURL = "https://raw.githubusercontent.com/babtix/kaioken-extensions/main/community-extensions.json"

// registryTTL is how long a cached index is served without revalidation.
const registryTTL = 24 * time.Hour

// RegistryEntry is one community extension listing.
type RegistryEntry struct {
	ID          string `json:"id"`
	Repo        string `json:"repo"` // owner/name
	Name        string `json:"name"`
	Description string `json:"description"`
	Author      string `json:"author"`
	// Schema v2 optional fields — decoded when present; older indexes omit
	// them and we degrade gracefully (empty slice / empty string = unset).
	Type        string   `json:"type,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	Homepage    string   `json:"homepage,omitempty"`
	Permissions []string `json:"permissions,omitempty"`
	// Flags carries moderation state; "malicious" blocks installation and
	// is checked on install and update — the community kill switch.
	Flags []string `json:"flags,omitempty"`
}

// TierLabel is the entry's capability tier for display: an absent type
// means declarative, the code-free default. Users see the trust tier
// before they install — that is the point of listing it.
func (e RegistryEntry) TierLabel() string {
	if e.Type == "" {
		return TypeDeclarative
	}
	return e.Type
}

// RegistryURL is the index location: the global config's ext_registry when
// set, the community default otherwise.
func RegistryURL() string {
	if u := config.LoadGlobal().ExtRegistry; u != "" {
		return u
	}
	return defaultRegistryURL
}

// registryCache persists the entries with enough metadata to revalidate
// cheaply (ETag) and to notice when the configured URL changed.
type registryCache struct {
	URL       string          `json:"url"`
	ETag      string          `json:"etag,omitempty"`
	FetchedAt time.Time       `json:"fetched_at"`
	Entries   []RegistryEntry `json:"entries"`
}

func registryCachePath() string { return filepath.Join(Root(), "registry.json") }

func loadRegistryCache() *registryCache {
	raw, err := os.ReadFile(registryCachePath())
	if err != nil {
		return nil
	}
	var c registryCache
	if json.Unmarshal(raw, &c) != nil {
		return nil
	}
	return &c
}

func saveRegistryCache(c *registryCache) {
	if os.MkdirAll(Root(), 0o755) != nil {
		return
	}
	raw, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(registryCachePath(), raw, 0o644)
}

// Registry returns the community index: from cache while it is fresh, from
// the network otherwise. Offline, a stale cache is still served — discovery
// degrading beats discovery breaking, and direct installs never need the
// registry at all. force skips the freshness check.
func Registry(ctx context.Context, force bool) ([]RegistryEntry, error) {
	url := RegistryURL()
	cache := loadRegistryCache()
	if cache != nil && cache.URL != url {
		cache = nil // the configured registry changed; the cache is for another index
	}
	if cache != nil && !force && time.Since(cache.FetchedAt) < registryTTL {
		return cache.Entries, nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	if cache != nil && cache.ETag != "" {
		req.Header.Set("If-None-Match", cache.ETag)
	}
	resp, err := extHTTP.Do(req)
	if err != nil {
		if cache != nil {
			return cache.Entries, nil // offline: serve stale
		}
		return nil, fmt.Errorf("extension registry unreachable: %w", err)
	}
	defer resp.Body.Close()

	switch {
	case resp.StatusCode == http.StatusNotModified && cache != nil:
		cache.FetchedAt = time.Now()
		saveRegistryCache(cache)
		return cache.Entries, nil
	case resp.StatusCode != http.StatusOK:
		if cache != nil {
			return cache.Entries, nil
		}
		return nil, fmt.Errorf("extension registry: %s", resp.Status)
	}

	var entries []RegistryEntry
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxArchiveBytes)).Decode(&entries); err != nil {
		if cache != nil {
			return cache.Entries, nil
		}
		return nil, fmt.Errorf("parsing extension registry: %w", err)
	}
	saveRegistryCache(&registryCache{
		URL: url, ETag: resp.Header.Get("ETag"), FetchedAt: time.Now(), Entries: entries,
	})
	return entries, nil
}

// SearchRegistry filters entries by a case-insensitive term over id, name,
// description and author. An empty term returns everything.
func SearchRegistry(entries []RegistryEntry, term string) []RegistryEntry {
	term = strings.ToLower(strings.TrimSpace(term))
	if term == "" {
		return entries
	}
	var out []RegistryEntry
	for _, e := range entries {
		hay := strings.ToLower(e.ID + " " + e.Repo + " " + e.Name + " " + e.Description + " " + e.Author + " " + strings.Join(e.Tags, " "))
		if strings.Contains(hay, term) {
			out = append(out, e)
		}
	}
	return out
}
