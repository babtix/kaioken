package prism

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"kaioken/internal/embed"
)

// seeded builds a module holding two clearly separated topics, so a test can
// assert which one a query reached.
func seeded(t *testing.T, emb embed.Embedder) (*Store, string) {
	t.Helper()
	s := newStore(t)
	m := mustModule(t, s, "Corpus")

	in := NewIngestor(s, emb, ChunkConfig{
		ParentTokens: 40, ChildTokens: 12, ChildOverlap: 2, CharsPerToken: 4,
	})
	in.backoff = time.Millisecond

	body := "# Retry Policy\n\n" +
		strings.Repeat("Failed requests retry with exponential backoff and full jitter. ", 8) +
		"\n\n# Storage Layout\n\n" +
		strings.Repeat("Records pack into segments that seal and compact later. ", 8)

	if _, err := in.ImportText(context.Background(), m.Slug, "doc.md", "", body, nil); err != nil {
		t.Fatal(err)
	}
	return s, m.Slug
}

func TestRetrieveFindsTheRelevantSection(t *testing.T) {
	s, slug := seeded(t, nil)
	r := NewRetriever(s, nil, nil, NewCache(0))

	res, err := r.Retrieve(context.Background(), "exponential backoff jitter", Options{Module: slug})
	if err != nil {
		t.Fatal(err)
	}
	if !res.SourceFound {
		t.Fatal("no source found for a phrase that appears verbatim")
	}
	if !strings.Contains(strings.ToLower(res.Chunks[0]), "backoff") {
		t.Errorf("top chunk is not the retry section:\n%.120s", res.Chunks[0])
	}
}

func TestRetrieveReturnsParentsNotChildren(t *testing.T) {
	// The point of chunking twice: the match is precise, the context is whole.
	s, slug := seeded(t, nil)
	r := NewRetriever(s, nil, nil, NewCache(0))

	res, err := r.Retrieve(context.Background(), "segments seal compact", Options{Module: slug})
	if err != nil {
		t.Fatal(err)
	}
	if !res.SourceFound {
		t.Fatal("no source found")
	}

	c, _ := s.LoadCorpus(slug)
	parents := map[string]bool{}
	for _, ch := range c.Chunks {
		if ch.Type == Parent {
			parents[ch.Text] = true
		}
	}
	if !parents[res.Chunks[0]] {
		t.Errorf("top result is not a stored parent — expansion did not run:\n%.120s", res.Chunks[0])
	}
}

func TestRetrieveDeduplicatesSharedParents(t *testing.T) {
	// Several children of one parent will win a broad query. The parent must
	// appear once, or the context budget fills with one repeated section.
	s, slug := seeded(t, nil)
	r := NewRetriever(s, nil, nil, NewCache(0))

	res, err := r.Retrieve(context.Background(), "retry backoff jitter requests failed",
		Options{Module: slug, TopK: 10})
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, c := range res.Chunks {
		if seen[c] {
			t.Error("the same parent text was returned twice")
		}
		seen[c] = true
	}
}

func TestRetrieveWithoutEmbedderIsDegraded(t *testing.T) {
	// Lexical-only still answers, but half the pipeline did not run and the
	// caller is entitled to know that before trusting a thin result.
	s, slug := seeded(t, nil)
	r := NewRetriever(s, nil, nil, NewCache(0))

	res, err := r.Retrieve(context.Background(), "backoff", Options{Module: slug})
	if err != nil {
		t.Fatal(err)
	}
	if !res.Degraded {
		t.Error("lexical-only retrieval did not report itself degraded")
	}
}

func TestRetrieveIsUngradedWithoutAUtilityModel(t *testing.T) {
	// Graded false is the honest state while no relevance gate runs. A caller
	// that sees Graded true is entitled to assume something checked.
	s, slug := seeded(t, nil)
	r := NewRetriever(s, nil, nil, NewCache(0))

	res, _ := r.Retrieve(context.Background(), "backoff", Options{Module: slug})
	if res.Graded {
		t.Error("result claims to be graded with no grader wired in")
	}
}

func TestRetrieveUsesVectorsWhenLexicalCannotMatch(t *testing.T) {
	// "durability" appears nowhere in the corpus, so BM25 has nothing. Only
	// the semantic leg can surface the storage section.
	emb := &fakeEmbedder{}
	s := newStore(t)
	m := mustModule(t, s, "Semantic")

	in := NewIngestor(s, emb, ChunkConfig{ParentTokens: 40, ChildTokens: 12, ChildOverlap: 2, CharsPerToken: 4})
	body := "# Alpha\n\n" + strings.Repeat("Alpha content about one thing. ", 8) +
		"\n\n# Other\n\n" + strings.Repeat("Unrelated content about something else. ", 8)
	if _, err := in.ImportText(context.Background(), m.Slug, "d.md", "", body, nil); err != nil {
		t.Fatal(err)
	}

	r := NewRetriever(s, emb, nil, NewCache(0))
	res, err := r.Retrieve(context.Background(), "alpha", Options{Module: m.Slug})
	if err != nil {
		t.Fatal(err)
	}
	if !res.SourceFound {
		t.Fatal("semantic leg returned nothing")
	}
	if res.Degraded {
		t.Error("a working hybrid retrieval reported itself degraded")
	}
	if !strings.Contains(strings.ToLower(res.Chunks[0]), "alpha") {
		t.Errorf("semantic ranking missed:\n%.120s", res.Chunks[0])
	}
}

func TestRetrieveDegradesWhenTheEmbedderFailsMidQuery(t *testing.T) {
	// A dead endpoint must not fail the search. BM25 already has an answer,
	// and a query that degrades quietly beats one that errors.
	emb := &fakeEmbedder{}
	s := newStore(t)
	m := mustModule(t, s, "Flaky")
	in := NewIngestor(s, emb, ChunkConfig{ParentTokens: 40, ChildTokens: 12, ChildOverlap: 2, CharsPerToken: 4})
	if _, err := in.ImportText(context.Background(), m.Slug, "d.md", "",
		strings.Repeat("Alpha content about backoff and retries. ", 10), nil); err != nil {
		t.Fatal(err)
	}

	broken := &fakeEmbedder{failNext: 99, err: errors.New("connection refused")}
	r := NewRetriever(s, broken, nil, NewCache(0))

	res, err := r.Retrieve(context.Background(), "backoff retries", Options{Module: m.Slug})
	if err != nil {
		t.Fatalf("retrieval errored instead of degrading: %v", err)
	}
	if !res.SourceFound {
		t.Error("lexical fallback found nothing")
	}
	if !res.Degraded {
		t.Error("a failed embedding leg was not reported as degraded")
	}
}

func TestRetrieveOnEmptyModuleIsNotDegraded(t *testing.T) {
	// Nothing is wrong with an empty module; there is simply nothing there.
	// Calling that degraded would send a caller looking for an outage.
	s := newStore(t)
	m := mustModule(t, s, "Empty")
	r := NewRetriever(s, nil, nil, NewCache(0))

	res, err := r.Retrieve(context.Background(), "anything", Options{Module: m.Slug})
	if err != nil {
		t.Fatal(err)
	}
	if res.SourceFound || len(res.Chunks) != 0 {
		t.Errorf("empty module returned %+v", res)
	}
	if res.Degraded {
		t.Error("an empty module was reported as a degraded pipeline")
	}
}

func TestRetrieveUnknownModule(t *testing.T) {
	s := newStore(t)
	r := NewRetriever(s, nil, nil, NewCache(0))
	if _, err := r.Retrieve(context.Background(), "q", Options{Module: "ghost"}); !errors.Is(err, ErrNoModule) {
		t.Errorf("returned %v, want ErrNoModule", err)
	}
}

// Concurrent first-queries on one module must collapse onto a single
// LoadCorpus+newCandidates build rather than each goroutine tokenising the
// whole corpus independently. Before the module's fingerprint is memoised,
// every caller that arrives while a build is already in flight for that
// fingerprint must be handed that same build's result, not start its own.
func TestCandidatesForCollapsesConcurrentBuilds(t *testing.T) {
	s, slug := seeded(t, nil)
	r := NewRetriever(s, nil, nil, NewCache(0))

	const n = 50
	start := make(chan struct{})
	results := make([]*candidates, n)
	errs := make([]error, n)
	var wg sync.WaitGroup
	wg.Add(n)
	for i := 0; i < n; i++ {
		go func(i int) {
			defer wg.Done()
			<-start
			cand, _, err := r.candidatesFor(slug)
			results[i], errs[i] = cand, err
		}(i)
	}
	close(start)
	wg.Wait()

	first := results[0]
	for i, err := range errs {
		if err != nil {
			t.Fatalf("goroutine %d: %v", i, err)
		}
	}
	for i, c := range results {
		if c != first {
			t.Errorf("goroutine %d got a distinct *candidates from goroutine 0 — "+
				"concurrent builds were not collapsed into one", i)
		}
	}
}

func TestRetrieveCachesRepeatedQueries(t *testing.T) {
	emb := &fakeEmbedder{}
	s := newStore(t)
	m := mustModule(t, s, "Cached")
	in := NewIngestor(s, emb, DefaultChunkConfig())
	if _, err := in.ImportText(context.Background(), m.Slug, "d.md", "",
		strings.Repeat("Alpha content worth retrieving. ", 20), nil); err != nil {
		t.Fatal(err)
	}

	r := NewRetriever(s, emb, nil, NewCache(time.Minute))
	before := emb.calls
	for i := 0; i < 3; i++ {
		if _, err := r.Retrieve(context.Background(), "alpha", Options{Module: m.Slug}); err != nil {
			t.Fatal(err)
		}
	}
	if got := emb.calls - before; got != 1 {
		t.Errorf("embedder called %d times for three identical queries, want 1", got)
	}
}

func TestCacheIsInvalidatedByIngestion(t *testing.T) {
	// Deriving invalidation from the corpus fingerprint is what stops a module
	// serving pre-import results for the length of the TTL.
	emb := &fakeEmbedder{}
	s := newStore(t)
	m := mustModule(t, s, "Growing")
	in := NewIngestor(s, emb, DefaultChunkConfig())
	if _, err := in.ImportText(context.Background(), m.Slug, "a.md", "",
		strings.Repeat("Alpha content here. ", 20), nil); err != nil {
		t.Fatal(err)
	}

	r := NewRetriever(s, emb, nil, NewCache(time.Minute))
	first, _ := r.Retrieve(context.Background(), "bravo", Options{Module: m.Slug})

	if _, err := in.ImportText(context.Background(), m.Slug, "b.md", "",
		strings.Repeat("Bravo content that answers the question. ", 20), nil); err != nil {
		t.Fatal(err)
	}

	second, _ := r.Retrieve(context.Background(), "bravo", Options{Module: m.Slug})
	if len(second.Chunks) == len(first.Chunks) && !strings.Contains(strings.ToLower(strings.Join(second.Chunks, " ")), "bravo") {
		t.Error("the second query was answered from a cache built before the import")
	}
}

func TestCacheDoesNotStoreDegradedResults(t *testing.T) {
	// Caching an outage keeps serving it for the whole TTL after it is fixed —
	// exactly when a user is most likely to retry.
	c := NewCache(time.Minute)
	c.Set("k", Result{Chunks: []string{"x"}, Degraded: true})
	if _, ok := c.Get("k"); ok {
		t.Error("a degraded result was cached")
	}
	c.Set("k", Result{Chunks: []string{"x"}})
	if _, ok := c.Get("k"); !ok {
		t.Error("a healthy result was not cached")
	}
}

func TestCacheExpires(t *testing.T) {
	c := NewCache(10 * time.Millisecond)
	c.Set("k", Result{Chunks: []string{"x"}, SourceFound: true})
	time.Sleep(25 * time.Millisecond)
	if _, ok := c.Get("k"); ok {
		t.Error("an expired entry was served")
	}
}

func TestCacheKeySeparatesConfigurations(t *testing.T) {
	base := cacheKey("q", "mod", "fp", "model", 5, 1, false)
	for name, other := range map[string]string{
		"query":       cacheKey("q2", "mod", "fp", "model", 5, 1, false),
		"module":      cacheKey("q", "mod2", "fp", "model", 5, 1, false),
		"fingerprint": cacheKey("q", "mod", "fp2", "model", 5, 1, false),
		"embed model": cacheKey("q", "mod", "fp", "model2", 5, 1, false),
		"top k":       cacheKey("q", "mod", "fp", "model", 20, 1, false),
		"variants":    cacheKey("q", "mod", "fp", "model", 5, 4, false),
		"graded":      cacheKey("q", "mod", "fp", "model", 5, 1, true),
	} {
		if other == base {
			t.Errorf("changing the %s did not change the cache key", name)
		}
	}
}

func TestBuildContextTrimsWholeChunks(t *testing.T) {
	// A truncated final paragraph reads as though the source trails off, and a
	// model asked to be faithful reproduces the truncation.
	long := strings.Repeat("x", 4000) // ~1000 tokens
	got := BuildContext([]string{long, long, long}, 1500)

	if strings.Count(got, "---") != 0 {
		t.Errorf("expected a single chunk to fit in the budget, got %d separators",
			strings.Count(got, "---"))
	}
	if len(got) != len(long) {
		t.Errorf("a chunk was cut mid-way: length %d, want %d", len(got), len(long))
	}
}

func TestBuildContextEmpty(t *testing.T) {
	if got := BuildContext(nil, 0); !strings.Contains(got, "No additional context") {
		t.Errorf("BuildContext(nil) = %q", got)
	}
}
