package websearch

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// withBase points a provider at a test server for the duration of a test.
func withBase(t *testing.T, name, base string) {
	t.Helper()
	old := Registry[name]
	patched := old
	patched.BaseURL = base
	Registry[name] = patched
	t.Cleanup(func() { Registry[name] = old })
}

func TestResolvePrefersConfiguredKeyOverEnv(t *testing.T) {
	t.Setenv("TAVILY_API_KEY", "from-env")
	p, err := Resolve("tavily", map[string]string{"tavily": "from-config"})
	if err != nil {
		t.Fatal(err)
	}
	if got := p.(*tavily).key; got != "from-config" {
		t.Errorf("key = %q, want the config value to win over the environment", got)
	}
}

func TestResolveFallsBackToEnv(t *testing.T) {
	t.Setenv("BRAVE_API_KEY", "env-key")
	p, err := Resolve("brave", nil)
	if err != nil {
		t.Fatal(err)
	}
	if p.Name() != "brave" {
		t.Errorf("Name = %q, want brave", p.Name())
	}
}

func TestResolveHonorsPreferenceOrder(t *testing.T) {
	// Both configured: the new Resolve fans out to a multi containing both in
	// preference order. Tavily must lead in the name because it is earlier.
	p, err := Resolve("", map[string]string{"exa": "k1", "tavily": "k2"})
	if err != nil {
		t.Fatal(err)
	}
	name := p.Name()
	if !strings.HasPrefix(name, "tavily") {
		t.Errorf("Name = %q, want tavily to lead (preference order)", name)
	}
	// Both appear.
	if !strings.Contains(name, "exa") {
		t.Errorf("Name = %q, want exa present too", name)
	}
}

func TestResolveWithoutAnyKeyExplainsHow(t *testing.T) {
	// Ensure no ambient key leaks in from the developer's environment.
	for _, info := range Registry {
		t.Setenv(info.KeyEnv, "")
	}
	_, err := Resolve("", nil)
	if err == nil {
		t.Fatal("expected an error when no provider is configured")
	}
	for _, want := range []string{"TAVILY_API_KEY", "tavily.com"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error %q does not mention %q", err, want)
		}
	}
}

func TestResolveUnknownProvider(t *testing.T) {
	if _, err := Resolve("goggle", map[string]string{"goggle": "k"}); err == nil {
		t.Error("expected an error for an unknown provider")
	}
}

func TestTavilySearch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer key123" {
			t.Errorf("Authorization = %q", got)
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["query"] != "solar lcoe europe" {
			t.Errorf("query = %v", body["query"])
		}
		w.Write([]byte(`{"results":[
			{"title":"A","url":"https://a.example/1","content":"alpha"},
			{"title":"B","url":"https://b.example/2","content":"beta"}]}`))
	}))
	defer srv.Close()
	withBase(t, "tavily", srv.URL)

	p, err := Resolve("tavily", map[string]string{"tavily": "key123"})
	if err != nil {
		t.Fatal(err)
	}
	hits, err := p.Search(context.Background(), "solar lcoe europe", 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) != 2 {
		t.Fatalf("got %d hits, want 2", len(hits))
	}
	if hits[0].Rank != 1 || hits[1].Rank != 2 {
		t.Errorf("ranks = %d,%d; want 1,2", hits[0].Rank, hits[1].Rank)
	}
	if hits[0].URL != "https://a.example/1" || hits[0].Snippet != "alpha" {
		t.Errorf("hit[0] = %+v", hits[0])
	}
	if hits[0].Provider != "tavily" {
		t.Errorf("Provider = %q", hits[0].Provider)
	}
}

func TestBraveSearchStripsMarkup(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("X-Subscription-Token"); got != "btok" {
			t.Errorf("token header = %q", got)
		}
		if got := r.URL.Query().Get("q"); got != "nuclear capacity factor" {
			t.Errorf("q = %q", got)
		}
		w.Write([]byte(`{"web":{"results":[
			{"title":"<strong>Nuclear</strong> facts","url":"https://n.example","description":"cap <strong>factor</strong> 80%"}]}}`))
	}))
	defer srv.Close()
	withBase(t, "brave", srv.URL)

	p, _ := Resolve("brave", map[string]string{"brave": "btok"})
	hits, err := p.Search(context.Background(), "nuclear capacity factor", 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) != 1 {
		t.Fatalf("got %d hits, want 1", len(hits))
	}
	if hits[0].Title != "Nuclear facts" {
		t.Errorf("Title = %q, want markup stripped", hits[0].Title)
	}
	if hits[0].Snippet != "cap factor 80%" {
		t.Errorf("Snippet = %q, want markup stripped", hits[0].Snippet)
	}
}

func TestExaFallsBackToTextWhenNoSnippet(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("x-api-key"); got != "ekey" {
			t.Errorf("x-api-key = %q", got)
		}
		w.Write([]byte(`{"results":[{"title":"T","url":"https://e.example","text":"body text"}]}`))
	}))
	defer srv.Close()
	withBase(t, "exa", srv.URL)

	p, _ := Resolve("exa", map[string]string{"exa": "ekey"})
	hits, err := p.Search(context.Background(), "q", 3)
	if err != nil {
		t.Fatal(err)
	}
	if hits[0].Snippet != "body text" {
		t.Errorf("Snippet = %q, want the text field used as fallback", hits[0].Snippet)
	}
}

// An authentication failure must be reported as such: a bad key and an empty
// result set are very different problems for the user to act on.
func TestSearchSurfacesAuthFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "bad key", http.StatusUnauthorized)
	}))
	defer srv.Close()
	withBase(t, "tavily", srv.URL)

	p, _ := Resolve("tavily", map[string]string{"tavily": "nope"})
	_, err := p.Search(context.Background(), "q", 3)
	if err == nil {
		t.Fatal("expected an error on 401")
	}
	if !strings.Contains(err.Error(), "API key") {
		t.Errorf("error %q should point at the API key", err)
	}
}

func TestSearchSurfacesRateLimit(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "slow down", http.StatusTooManyRequests)
	}))
	defer srv.Close()
	withBase(t, "brave", srv.URL)

	p, _ := Resolve("brave", map[string]string{"brave": "k"})
	_, err := p.Search(context.Background(), "q", 3)
	if err == nil || !strings.Contains(err.Error(), "rate limited") {
		t.Errorf("err = %v, want a rate-limit message", err)
	}
}

func TestClampLimit(t *testing.T) {
	for _, c := range []struct{ in, want int }{{0, 1}, {-5, 1}, {7, 7}, {50, 20}} {
		if got := clampLimit(c.in); got != c.want {
			t.Errorf("clampLimit(%d) = %d, want %d", c.in, got, c.want)
		}
	}
}

func TestStripTags(t *testing.T) {
	cases := map[string]string{
		"<b>bold</b> text":     "bold text",
		"plain":                "plain",
		"<a href='x'>link</a>": "link",
		"unclosed <tag":        "unclosed",
	}
	for in, want := range cases {
		if got := stripTags(in); got != want {
			t.Errorf("stripTags(%q) = %q, want %q", in, got, want)
		}
	}
}

// ── Firecrawl provider ─────────────────────────────────────────────────────

func TestFirecrawlSearchParsesResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer fc-key" {
			t.Errorf("Authorization = %q", got)
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["query"] != "kaioken" {
			t.Errorf("query = %v", body["query"])
		}
		w.Write([]byte(`{"success":true,"data":[
			{"title":"FC1","url":"https://fc.example/1","description":"desc one"},
			{"title":"FC2","url":"https://fc.example/2","description":"desc two"}]}`))
	}))
	defer srv.Close()
	withBase(t, "firecrawl", srv.URL)

	p, err := Resolve("firecrawl", map[string]string{"firecrawl": "fc-key"})
	if err != nil {
		t.Fatal(err)
	}
	hits, err := p.Search(context.Background(), "kaioken", 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) != 2 {
		t.Fatalf("got %d hits, want 2", len(hits))
	}
	if hits[0].URL != "https://fc.example/1" || hits[0].Provider != "firecrawl" {
		t.Errorf("hit[0] = %+v", hits[0])
	}
	if hits[1].Rank != 2 || hits[1].Snippet != "desc two" {
		t.Errorf("hit[1] = %+v", hits[1])
	}
}

// ── Multi fan-out ──────────────────────────────────────────────────────────

func TestMultiMergeDedupesAndKeepsBestRank(t *testing.T) {
	results := mergeResults([][]Result{
		{{URL: "https://a.example", Title: "A", Snippet: "short", Rank: 3}},
		{{URL: "https://a.example/", Title: "A", Snippet: "longer snippet", Rank: 1}}, // same URL, trailing slash
		{{URL: "https://b.example", Title: "B", Snippet: "bb", Rank: 2}},
	}, 10)

	if len(results) != 2 {
		t.Fatalf("got %d results, want 2 (deduped)", len(results))
	}
	// a.example should have the better rank (1) and the longer snippet.
	aHit := results[0]
	if aHit.Rank != 1 {
		t.Errorf("rank = %d, want 1 (best of 3 and 1)", aHit.Rank)
	}
	if aHit.Snippet != "longer snippet" {
		t.Errorf("snippet = %q, want the longer one kept", aHit.Snippet)
	}
}

func TestMultiToleratesOneChildFailing(t *testing.T) {
	// One provider returns an error, the other returns hits — the multi must
	// succeed and return the healthy provider's results.
	m := &multi{providers: []Provider{
		&failProvider{name: "dead"},
		&staticProvider{name: "alive", hits: []Result{{URL: "https://ok.example", Rank: 1}}},
	}}
	hits, err := m.Search(context.Background(), "q", 5)
	if err != nil {
		t.Fatalf("expected success when one child survives, got: %v", err)
	}
	if len(hits) != 1 || hits[0].URL != "https://ok.example" {
		t.Errorf("hits = %v", hits)
	}
}

func TestMultiErrorsWhenAllChildrenFail(t *testing.T) {
	m := &multi{providers: []Provider{
		&failProvider{name: "dead1"},
		&failProvider{name: "dead2"},
	}}
	_, err := m.Search(context.Background(), "q", 5)
	if err == nil {
		t.Fatal("expected an error when every child fails")
	}
	if !strings.Contains(err.Error(), "dead1") || !strings.Contains(err.Error(), "dead2") {
		t.Errorf("error %q should name both failed providers", err)
	}
}

// ── Resolve subset ─────────────────────────────────────────────────────────

func TestResolveCommaSeparatedSubset(t *testing.T) {
	for _, info := range Registry {
		t.Setenv(info.KeyEnv, "")
	}
	p, err := Resolve("tavily,firecrawl", map[string]string{"tavily": "k1", "firecrawl": "k2"})
	if err != nil {
		t.Fatal(err)
	}
	name := p.Name()
	if !strings.Contains(name, "tavily") || !strings.Contains(name, "firecrawl") {
		t.Errorf("Name = %q, want both tavily and firecrawl", name)
	}
	// brave and exa should NOT appear.
	if strings.Contains(name, "brave") || strings.Contains(name, "exa") {
		t.Errorf("Name = %q, should not contain brave or exa", name)
	}
}

func TestResolveSinglePinsOne(t *testing.T) {
	for _, info := range Registry {
		t.Setenv(info.KeyEnv, "")
	}
	p, err := Resolve("firecrawl", map[string]string{"firecrawl": "fk", "tavily": "tk"})
	if err != nil {
		t.Fatal(err)
	}
	if p.Name() != "firecrawl" {
		t.Errorf("Name = %q, want a single firecrawl (no fan-out)", p.Name())
	}
}

// ── helpers ────────────────────────────────────────────────────────────────

type failProvider struct{ name string }

func (f *failProvider) Name() string { return f.name }
func (f *failProvider) Search(context.Context, string, int) ([]Result, error) {
	return nil, fmt.Errorf("%s: simulated failure", f.name)
}

type staticProvider struct {
	name string
	hits []Result
}

func (s *staticProvider) Name() string { return s.name }
func (s *staticProvider) Search(context.Context, string, int) ([]Result, error) {
	return s.hits, nil
}
