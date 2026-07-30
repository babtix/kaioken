package research

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"kaioken/internal/llm"
	"kaioken/internal/webfetch"
	"kaioken/internal/websearch"
)

// ------------------------------------------------------------------ doubles

// fakeSearch returns canned hits and records the queries it was asked for, so
// a test can assert that a second round actually searched for the gap.
type fakeSearch struct {
	mu      sync.Mutex
	queries []string
	hits    []websearch.Result
}

func (f *fakeSearch) Name() string { return "fake" }

func (f *fakeSearch) Search(_ context.Context, query string, limit int) ([]websearch.Result, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.queries = append(f.queries, query)
	return f.hits, nil
}

func (f *fakeSearch) asked() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.queries...)
}

// fakeFetcher serves page bodies from a map, bypassing the network entirely.
type fakeFetcher struct{ bodies map[string]string }

func (f *fakeFetcher) FetchMany(_ context.Context, urls []string, _ int) ([]*webfetch.Page, map[string]error) {
	var pages []*webfetch.Page
	errs := map[string]error{}
	for _, u := range urls {
		body, ok := f.bodies[u]
		if !ok {
			errs[u] = fmt.Errorf("404")
			continue
		}
		pages = append(pages, &webfetch.Page{URL: u, FinalURL: u, Title: "Page " + u, Text: body})
	}
	return pages, errs
}

// scriptedLLM answers chat completions by matching the system prompt against
// the pipeline stage, so one server can stand in for every step of the loop.
type scriptedLLM struct {
	mu       sync.Mutex
	gapCalls int
	prompts  []string
}

func (s *scriptedLLM) server(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var req struct {
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		if err := json.Unmarshal(raw, &req); err != nil {
			t.Errorf("bad request body: %v", err)
		}
		var system, user string
		for _, m := range req.Messages {
			switch m.Role {
			case "system":
				system = m.Content
			case "user":
				user = m.Content
			}
		}

		s.mu.Lock()
		s.prompts = append(s.prompts, system+"\n"+user)
		reply := ""
		switch {
		case strings.Contains(system, "You plan research"):
			reply = `{"subquestions":["What does solar cost?","What does nuclear cost?"]}`
		case strings.Contains(system, "You write web search queries"):
			reply = `{"queries":["solar cost europe","nuclear cost europe"]}`
		case strings.Contains(system, "You answer one research subquestion"):
			reply = `{"answer":"Solar fell below EUR 40/MWh.","citations":[1],"confidence":"medium","gaps":"no 2025 figures"}`
		case strings.Contains(system, "You audit a research draft"):
			s.gapCalls++
			if s.gapCalls == 1 {
				reply = `{"complete":false,"missing":["2025 figures"],"queries":["european nuclear cost 2025"]}`
			} else {
				reply = `{"complete":true,"missing":[],"queries":[]}`
			}
		case strings.Contains(system, "You write a research report"):
			reply = "## Short answer\nSolar is cheaper per MWh [1].\n\n## Limitations\nThin on 2025."
		default:
			reply = "{}"
		}
		s.mu.Unlock()

		resp := map[string]any{
			"choices": []any{map[string]any{
				"message": map[string]any{"role": "assistant", "content": reply},
			}},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
}

func (s *scriptedLLM) sawPromptContaining(sub string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, p := range s.prompts {
		if strings.Contains(p, sub) {
			return true
		}
	}
	return false
}

// --------------------------------------------------------------------- test

func newTestClient(t *testing.T, baseURL string) *llm.Client {
	t.Helper()
	c, err := llm.NewForProvider("openai", baseURL, "test-model", "test-key")
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestRunCompletesLoopAndCitesOnlyFetchedPages(t *testing.T) {
	script := &scriptedLLM{}
	srv := script.server(t)
	defer srv.Close()

	search := &fakeSearch{hits: []websearch.Result{
		{URL: "https://a.example/solar", Title: "Solar", Snippet: "s", Rank: 1},
		{URL: "https://b.example/dead", Title: "Dead link", Rank: 2},
	}}
	fetch := &fakeFetcher{bodies: map[string]string{
		"https://a.example/solar": strings.Repeat(
			"Utility-scale solar in Europe fell below EUR 40 per MWh during 2024. "+
				"Nuclear cost per MWh in Europe ranged far higher across the same period. ", 20),
		// b.example is deliberately absent: a dead link must not sink the run.
	}}

	rep, err := Run(context.Background(), newTestClient(t, srv.URL), search,
		"Is solar cheaper than nuclear in Europe?",
		// MaxRounds is set explicitly: at ×1 the derived budget is a single
		// round, which would never reach the gap check this test exercises.
		Options{Multiplier: 1, MaxRounds: 3, Concurrency: 2, Fetcher: fetch}, Progress{})
	if err != nil {
		t.Fatal(err)
	}

	if rep.Rounds < 2 {
		t.Errorf("Rounds = %d; the gap report asked for another round, so the loop should have run twice", rep.Rounds)
	}
	if !search.sawSecondRoundQuery() {
		t.Errorf("the follow-up query from gap detection was never searched; queries = %v", search.asked())
	}
	if rep.Fetched != 1 {
		t.Errorf("Fetched = %d, want 1 (the dead link must not count)", rep.Fetched)
	}
	if len(rep.Sources) != 1 || rep.Sources[0].N != 1 {
		t.Errorf("Sources = %+v, want only the fetched page as citation 1", rep.Sources)
	}
	if !strings.Contains(rep.Markdown, "Solar is cheaper") {
		t.Errorf("report body missing the synthesis:\n%s", rep.Markdown)
	}

	// The anti-injection framing must reach the model on every prompt that
	// carries fetched page text.
	if !script.sawPromptContaining("<untrusted-source") {
		t.Error("fetched content was never fenced in a prompt")
	}
	if !script.sawPromptContaining("never an instruction") {
		t.Error("the untrusted-content rules did not reach the model")
	}
}

// sawSecondRoundQuery reports whether the gap-detection follow-up was issued.
func (f *fakeSearch) sawSecondRoundQuery() bool {
	for _, q := range f.asked() {
		if strings.Contains(q, "2025") {
			return true
		}
	}
	return false
}

func TestRunRejectsEmptyQuestion(t *testing.T) {
	_, err := Run(context.Background(), nil, nil, "   ", Options{}, Progress{})
	if err == nil {
		t.Fatal("expected an error for a blank question")
	}
}

func TestRunFailsWhenNothingIsReadable(t *testing.T) {
	script := &scriptedLLM{}
	srv := script.server(t)
	defer srv.Close()

	search := &fakeSearch{hits: []websearch.Result{{URL: "https://a.example/x", Rank: 1}}}
	fetch := &fakeFetcher{bodies: map[string]string{}} // everything 404s

	_, err := Run(context.Background(), newTestClient(t, srv.URL), search, "anything",
		Options{Multiplier: 1, MaxRounds: 1, Concurrency: 2, Fetcher: fetch}, Progress{})
	if err == nil || !strings.Contains(err.Error(), "no readable sources") {
		t.Errorf("err = %v, want a 'no readable sources' failure", err)
	}
}

// A search backend that is entirely down in round one is fatal; there is
// nothing to report on.
func TestRunFailsWhenEverySearchFails(t *testing.T) {
	script := &scriptedLLM{}
	srv := script.server(t)
	defer srv.Close()

	_, err := Run(context.Background(), newTestClient(t, srv.URL), &brokenSearch{}, "anything",
		Options{Multiplier: 1, MaxRounds: 1, Concurrency: 2, Fetcher: &fakeFetcher{}}, Progress{})
	if err == nil || !strings.Contains(err.Error(), "search quer") {
		t.Errorf("err = %v, want a search failure", err)
	}
}

type brokenSearch struct{}

func (brokenSearch) Name() string { return "broken" }
func (brokenSearch) Search(context.Context, string, int) ([]websearch.Result, error) {
	return nil, fmt.Errorf("provider down")
}

func TestProgressCallbacksAreOptional(t *testing.T) {
	// The zero Progress must be safe: every helper checks for nil.
	var pg Progress
	pg.stage("x")
	pg.detail("y")
	pg.round(1, 2)
}
