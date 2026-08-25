package ext

import (
	"context"
	"testing"
)

func TestRegistryFetchCacheAndOffline(t *testing.T) {
	h := newFakeHub(t)
	h.registry = []RegistryEntry{
		{ID: "alice.demo", Repo: "alice/kaioken-demo", Name: "Demo", Description: "Git helpers", Author: "Alice"},
		{ID: "bob.notes", Repo: "bob/kaioken-notes", Name: "Notes", Description: "Note-taking skills", Author: "Bob"},
	}
	ctx := context.Background()

	entries, err := Registry(ctx, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 || h.regHits != 1 {
		t.Fatalf("first fetch: %d entries, %d hits", len(entries), h.regHits)
	}

	// Fresh cache: no second request.
	if _, err := Registry(ctx, false); err != nil {
		t.Fatal(err)
	}
	if h.regHits != 1 {
		t.Errorf("a fresh cache should not refetch, hits = %d", h.regHits)
	}

	// force revalidates; the ETag makes it a 304 and the cache survives.
	entries, err = Registry(ctx, true)
	if err != nil {
		t.Fatal(err)
	}
	if h.regHits != 2 || len(entries) != 2 {
		t.Errorf("forced revalidation: %d hits, %d entries", h.regHits, len(entries))
	}

	// Offline: the stale cache is still served, because discovery degrading
	// beats discovery breaking.
	h.srv.Close()
	entries, err = Registry(ctx, true)
	if err != nil {
		t.Fatalf("offline with a cache should not error: %v", err)
	}
	if len(entries) != 2 {
		t.Errorf("offline should serve the cached entries, got %d", len(entries))
	}
}

func TestSearchRegistry(t *testing.T) {
	entries := []RegistryEntry{
		{ID: "alice.git-flow", Repo: "alice/kaioken-git-flow", Name: "Git Flow", Description: "Branching skills"},
		{ID: "bob.notes", Repo: "bob/kaioken-notes", Name: "Notes", Description: "Note-taking", Author: "Bob", Tags: []string{"productivity"}},
	}
	if got := SearchRegistry(entries, ""); len(got) != 2 {
		t.Errorf("empty term should return everything, got %d", len(got))
	}
	if got := SearchRegistry(entries, "GIT"); len(got) != 1 || got[0].ID != "alice.git-flow" {
		t.Errorf("case-insensitive id/name match failed: %+v", got)
	}
	if got := SearchRegistry(entries, "bob"); len(got) != 1 || got[0].ID != "bob.notes" {
		t.Errorf("author match failed: %+v", got)
	}
	if got := SearchRegistry(entries, "productivity"); len(got) != 1 || got[0].ID != "bob.notes" {
		t.Errorf("tag match failed: %+v", got)
	}
	if got := SearchRegistry(entries, "zzz"); len(got) != 0 {
		t.Errorf("no-match term returned %+v", got)
	}
}

// A schema v2 index decodes with the optional fields; a v1 index (fields
// absent) still decodes — the wire format only ever grows.
func TestRegistryDecodesV2Fields(t *testing.T) {
	h := newFakeHub(t)
	h.registry = []RegistryEntry{
		{
			ID: "bob.wasm", Repo: "bob/kaioken-wasm", Name: "W", Description: "sandboxed tools", Author: "Bob",
			Type: "wasm", Tags: []string{"tools", "sandbox"},
			Homepage: "https://example.com", Permissions: []string{"fs:read:workspace"},
		},
		{ID: "old.plain", Repo: "old/kaioken-plain", Name: "Plain", Description: "v1 shape", Author: "Old"},
	}

	entries, err := Registry(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Fatalf("got %d entries", len(entries))
	}
	w := entries[0]
	if w.Type != "wasm" || w.TierLabel() != "wasm" || len(w.Tags) != 2 || w.Homepage == "" || len(w.Permissions) != 1 {
		t.Errorf("v2 fields lost in decode: %+v", w)
	}
	if p := entries[1]; p.Type != "" || p.TierLabel() != TypeDeclarative || p.Tags != nil {
		t.Errorf("v1 entry should decode with zero values and a declarative tier: %+v", p)
	}
}
