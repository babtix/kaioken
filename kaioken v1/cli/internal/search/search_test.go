package search

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/config"
	"kaioken/internal/embed"
)

// fixture builds a small repo with a wiki, a card and a skill.
func fixture(t *testing.T) string {
	t.Helper()
	repo := t.TempDir()

	write := func(rel, body string) {
		full := filepath.Join(repo, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	write(config.Dir+"/wiki/networking/retries.md", `# Retry Policy

## Table of Contents
- [Backoff](#backoff)
- [Ceilings](#ceilings)
- [Jitter](#jitter)
- [Budgets](#budgets)

## Backoff

Failed requests are retried with exponential backoff and full jitter. The
handleRetryBudget function refuses a retry once the caller's budget is spent,
which is what keeps a struggling upstream from being hammered.
`)

	write(config.Dir+"/wiki/storage/layout.md", `# Storage Layout

Records are packed into segments. Each segment is immutable once sealed, which
makes compaction a pure append.
`)

	write(config.Dir+"/knowledge/api/architecture.md", `# API Architecture

The gateway terminates TLS and forwards to the router.
`)

	write(config.Dir+"/skills/add-endpoint/SKILL.md", `---
name: add-endpoint
description: How to add a new HTTP endpoint to the gateway.
origin: learned
---

Register the handler in mux.go, then add a table-driven test.
`)

	return repo
}

func TestOpenIndexesAllStores(t *testing.T) {
	repo := fixture(t)
	ix, err := Open(repo)
	if err != nil {
		t.Fatal(err)
	}

	kinds := map[Kind]int{}
	for _, d := range ix.Docs {
		kinds[d.Kind]++
	}
	if kinds[KindWiki] != 2 {
		t.Errorf("wiki docs = %d, want 2", kinds[KindWiki])
	}
	if kinds[KindCard] != 1 {
		t.Errorf("card docs = %d, want 1", kinds[KindCard])
	}
	if kinds[KindSkill] != 1 {
		t.Errorf("skill docs = %d, want 1", kinds[KindSkill])
	}
}

func TestSearchFindsContentNotNavigation(t *testing.T) {
	repo := fixture(t)
	ix, err := Open(repo)
	if err != nil {
		t.Fatal(err)
	}

	hits, err := ix.Search(context.Background(), Query{Text: "backoff jitter", Limit: 5})
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) == 0 {
		t.Fatal("no hits for a phrase that appears verbatim in the corpus")
	}
	if hits[0].Path != "networking/retries.md" {
		t.Errorf("top hit = %q, want networking/retries.md", hits[0].Path)
	}
	// The table of contents lists "Backoff" and "Jitter" as bare links; if it
	// were indexed it would outrank the prose that explains them.
	if strings.Contains(hits[0].Snippet, "Table of Contents") {
		t.Errorf("top hit is a table of contents:\n%s", hits[0].Snippet)
	}
}

func TestSearchSplitsCompoundIdentifiers(t *testing.T) {
	repo := fixture(t)
	ix, err := Open(repo)
	if err != nil {
		t.Fatal(err)
	}

	// The corpus writes handleRetryBudget; the query says "retry budget".
	hits, err := ix.Search(context.Background(), Query{Text: "retry budget", Limit: 5})
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) == 0 || hits[0].Path != "networking/retries.md" {
		t.Fatalf("camelCase identifier not matched by its words: %+v", hits)
	}
}

func TestSearchFiltersByKind(t *testing.T) {
	repo := fixture(t)
	ix, err := Open(repo)
	if err != nil {
		t.Fatal(err)
	}

	hits, err := ix.Search(context.Background(), Query{
		Text:  "endpoint gateway",
		Kinds: []Kind{KindSkill},
		Limit: 5,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) != 1 {
		t.Fatalf("kind filter returned %d hits, want 1", len(hits))
	}
	if hits[0].Kind != KindSkill || hits[0].Path != "add-endpoint" {
		t.Errorf("got %+v, want the add-endpoint skill", hits[0])
	}
}

func TestSearchFiltersBySection(t *testing.T) {
	repo := fixture(t)
	ix, err := Open(repo)
	if err != nil {
		t.Fatal(err)
	}

	hits, err := ix.Search(context.Background(), Query{
		Text:    "segment compaction backoff",
		Section: "storage",
		Limit:   5,
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, h := range hits {
		if !strings.HasPrefix(h.Path, "storage/") {
			t.Errorf("section filter leaked %q", h.Path)
		}
	}
	if len(hits) == 0 {
		t.Error("section filter excluded everything")
	}
}

func TestIndexPersistsAndReloads(t *testing.T) {
	repo := fixture(t)
	if _, err := Open(repo); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(repo, config.Dir, "search_index.json")); err != nil {
		t.Fatalf("index was not persisted: %v", err)
	}

	// A second Open with an unchanged corpus must reuse the file rather than
	// rebuild — the fingerprint is what makes a query cheap.
	ix, err := Open(repo)
	if err != nil {
		t.Fatal(err)
	}
	if ix.Fingerprint == "" {
		t.Error("reloaded index has no fingerprint")
	}
}

func TestIndexRebuildsWhenCorpusChanges(t *testing.T) {
	repo := fixture(t)
	first, err := Open(repo)
	if err != nil {
		t.Fatal(err)
	}

	newDoc := filepath.Join(repo, config.Dir, "wiki", "storage", "compaction.md")
	if err := os.WriteFile(newDoc, []byte("# Compaction\n\nSealed segments merge on a schedule.\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	second, err := Open(repo)
	if err != nil {
		t.Fatal(err)
	}
	if second.Fingerprint == first.Fingerprint {
		t.Error("fingerprint unchanged after adding a document")
	}
	if len(second.Docs) != len(first.Docs)+1 {
		t.Errorf("docs = %d, want %d", len(second.Docs), len(first.Docs)+1)
	}
}

func TestEmptyRepoSearchesWithoutError(t *testing.T) {
	repo := t.TempDir()
	ix, err := Open(repo)
	if err != nil {
		t.Fatal(err)
	}
	hits, err := ix.Search(context.Background(), Query{Text: "anything"})
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) != 0 {
		t.Errorf("got %d hits from an empty repo", len(hits))
	}
}

// stubEmbedder returns a deterministic vector keyed on whether the text
// mentions the concept under test, which is enough to prove fusion runs and
// that a semantically-close-but-lexically-distant passage can win.
type stubEmbedder struct{ calls int }

func (s *stubEmbedder) ID() string { return "stub@test" }
func (s *stubEmbedder) Dims() int  { return 2 }
func (s *stubEmbedder) Embed(_ context.Context, texts []string) ([][]float32, error) {
	s.calls++
	out := make([][]float32, len(texts))
	for i, t := range texts {
		if strings.Contains(strings.ToLower(t), "segment") ||
			strings.Contains(strings.ToLower(t), "durability") {
			out[i] = embed.Normalize([]float32{1, 0})
		} else {
			out[i] = embed.Normalize([]float32{0, 1})
		}
	}
	return out, nil
}

func TestHybridSearchUsesVectors(t *testing.T) {
	repo := fixture(t)
	emb := &stubEmbedder{}

	ix, err := Build(context.Background(), repo, emb, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !ix.Semantic() {
		t.Fatal("index reports no vectors after an embedded build")
	}
	_, _, embedded := ix.Stats()
	if embedded != len(ix.Chunks) {
		t.Errorf("embedded %d of %d chunks", embedded, len(ix.Chunks))
	}

	// "durability" appears nowhere in the corpus, so BM25 has nothing. Only
	// the vector half can surface the storage chapter.
	hits, err := ix.Search(context.Background(), Query{Text: "durability", Limit: 3, Embedder: emb})
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) == 0 {
		t.Fatal("semantic-only query returned nothing")
	}
	if !strings.HasPrefix(hits[0].Path, "storage/") {
		t.Errorf("top hit = %q, want the storage chapter", hits[0].Path)
	}
}

func TestBuildReusesVectorsForUnchangedChunks(t *testing.T) {
	repo := fixture(t)
	emb := &stubEmbedder{}

	if _, err := Build(context.Background(), repo, emb, nil); err != nil {
		t.Fatal(err)
	}
	afterFirst := emb.calls

	// Adding one document must not re-embed the ones that did not change.
	newDoc := filepath.Join(repo, config.Dir, "wiki", "storage", "compaction.md")
	if err := os.WriteFile(newDoc, []byte("# Compaction\n\nSealed segments merge on a schedule.\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	ix, err := Build(context.Background(), repo, emb, nil)
	if err != nil {
		t.Fatal(err)
	}
	if emb.calls != afterFirst+1 {
		t.Errorf("embed batches = %d, want %d — unchanged chunks were re-embedded",
			emb.calls, afterFirst+1)
	}
	_, _, embedded := ix.Stats()
	if embedded != len(ix.Chunks) {
		t.Errorf("embedded %d of %d chunks after incremental build", embedded, len(ix.Chunks))
	}
}

func TestSearchDegradesWhenEmbedderFails(t *testing.T) {
	repo := fixture(t)
	if _, err := Build(context.Background(), repo, &stubEmbedder{}, nil); err != nil {
		t.Fatal(err)
	}
	ix, err := Open(repo)
	if err != nil {
		t.Fatal(err)
	}

	// A dead embedding endpoint mid-query must not fail the search: BM25
	// already has an answer.
	hits, err := ix.Search(context.Background(), Query{
		Text: "backoff jitter", Limit: 3, Embedder: brokenEmbedder{},
	})
	if err != nil {
		t.Fatalf("search failed instead of degrading: %v", err)
	}
	if len(hits) == 0 || hits[0].Path != "networking/retries.md" {
		t.Errorf("lexical fallback did not rank correctly: %+v", hits)
	}
}

type brokenEmbedder struct{}

func (brokenEmbedder) ID() string { return "stub@test" }
func (brokenEmbedder) Dims() int  { return 2 }
func (brokenEmbedder) Embed(context.Context, []string) ([][]float32, error) {
	return nil, os.ErrDeadlineExceeded
}

func TestSnippetStaysWithinBudget(t *testing.T) {
	long := strings.Repeat("word ", 500)
	s := snippet(long)
	if len(s) > snippetMax+2 {
		t.Errorf("snippet length %d exceeds budget %d", len(s), snippetMax)
	}
}
