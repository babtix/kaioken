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
	"time"

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
	// asked records every subquestion that reached the answering stage, in
	// order, so a test can assert both what was researched and what was not
	// researched twice.
	asked []string
	// chapters records the dossier chapter titles that reached the writer.
	chapters []string
	// highFor makes the answer for any subquestion containing this substring
	// come back high confidence. "*" makes every answer high; empty leaves
	// every answer at medium.
	highFor string
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
			sub := subquestionOf(user)
			s.asked = append(s.asked, sub)
			conf := "medium"
			if s.highFor == "*" || (s.highFor != "" && strings.Contains(sub, s.highFor)) {
				conf = "high"
			}
			reply = `{"answer":"Solar fell below EUR 40/MWh.","citations":[1],"confidence":"` +
				conf + `","gaps":"no 2025 figures"}`
		case strings.Contains(system, "You audit a research draft"):
			s.gapCalls++
			if s.gapCalls == 1 {
				reply = `{"complete":false,"missing":["2025 figures"],"queries":["european nuclear cost 2025"]}`
			} else {
				reply = `{"complete":true,"missing":[],"queries":[]}`
			}
		case strings.Contains(system, "You write a research report"):
			reply = "## Short answer\nSolar is cheaper per MWh [1].\n\n## Limitations\nThin on 2025."

		// ---- the deep dossier stages ----
		case strings.Contains(system, "You plan the structure of a long research report"):
			reply = `{"sections":[
				{"title":"How the two costs are measured","brief":"Define LCOE."},
				{"title":"What drives the gap","brief":"Explain the drivers."},
				{"title":"Where the comparison breaks down","brief":"System costs."}]}`
		case strings.Contains(system, "You write the opening answer"):
			reply = "On a levelized basis solar is the cheaper of the two per MWh [1]."
		case strings.Contains(system, "You write one chapter"):
			s.chapters = append(s.chapters, subjectOf(user))
			reply = "### Basis\n\nThe levelized cost of electricity discounts lifetime cost " +
				"over lifetime output [1]. Solar carries no fuel cost [1].\n\n" +
				"- A bulleted point [1]\n- Another point\n"
		case strings.Contains(system, "You deepen one chapter"):
			reply = "### Basis\n\nExpanded with more of the same evidence [1], at greater length " +
				"than the draft it replaces so the expansion is detectable.\n"

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

func (s *scriptedLLM) asksFor(sub string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	var n int
	for _, a := range s.asked {
		if a == sub {
			n++
		}
	}
	return n
}

// subjectOf pulls the chapter title back out of a section-writing prompt.
func subjectOf(user string) string {
	_, rest, ok := strings.Cut(user, "This chapter: ")
	if !ok {
		return ""
	}
	line, _, _ := strings.Cut(rest, "
")
	return strings.TrimSpace(line)
}

// subquestionOf pulls the subquestion back out of an answering prompt.
func subquestionOf(user string) string {
	_, rest, ok := strings.Cut(user, "Subquestion: ")
	if !ok {
		return ""
	}
	line, _, _ := strings.Cut(rest, "\n")
	return strings.TrimSpace(line)
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

// The point of a second round is not that it searches again — it is that the
// thing it went back for gets answered. Fetching pages about a gap and then
// only re-asking the original subquestions is how a run ends up reporting that
// nobody supplied a figure whose source is sitting in its own corpus.
func TestRunAnswersTheGapsItFinds(t *testing.T) {
	script := &scriptedLLM{}
	srv := script.server(t)
	defer srv.Close()

	search := &fakeSearch{hits: []websearch.Result{
		{URL: "https://a.example/solar", Title: "Solar", Snippet: "cost per MWh", Rank: 1},
	}}
	fetch := &fakeFetcher{bodies: map[string]string{
		"https://a.example/solar": strings.Repeat(
			"Utility-scale solar in Europe fell below EUR 40 per MWh during 2024. "+
				"Nuclear cost per MWh in Europe ranged far higher across the same period. "+
				// The gap the audit will ask for is present in the corpus, so a
				// round that actually asks the question can retrieve it.
				"Provisional 2025 figures for both technologies were published in March. ", 20),
	}}

	rep, err := Run(context.Background(), newTestClient(t, srv.URL), search,
		"Is solar cheaper than nuclear in Europe?",
		Options{Multiplier: 1, MaxRounds: 3, Concurrency: 2, Fetcher: fetch}, Progress{})
	if err != nil {
		t.Fatal(err)
	}

	// The gap audit reported "2025 figures" as missing; that has to become a
	// subquestion the pipeline actually researches.
	if script.asksFor("2025 figures") == 0 {
		t.Errorf("the gap was searched for but never asked as a subquestion; asked = %v", script.asked)
	}
	if rep.Rounds < 2 {
		t.Errorf("Rounds = %d, want the loop to have run again for the gap", rep.Rounds)
	}
}

// A subquestion that came back solid must not be paid for again every round.
func TestRunDoesNotRepeatSettledSubquestions(t *testing.T) {
	script := &scriptedLLM{highFor: "solar"}
	srv := script.server(t)
	defer srv.Close()

	search := &fakeSearch{hits: []websearch.Result{
		{URL: "https://a.example/solar", Title: "Solar", Rank: 1},
	}}
	fetch := &fakeFetcher{bodies: map[string]string{
		"https://a.example/solar": strings.Repeat(
			"Utility-scale solar in Europe fell below EUR 40 per MWh during 2024. "+
				"Nuclear cost per MWh in Europe ranged far higher. ", 20),
	}}

	if _, err := Run(context.Background(), newTestClient(t, srv.URL), search,
		"Is solar cheaper than nuclear in Europe?",
		Options{Multiplier: 1, MaxRounds: 3, Concurrency: 2, Fetcher: fetch}, Progress{}); err != nil {
		t.Fatal(err)
	}

	if n := script.asksFor("What does solar cost?"); n != 1 {
		t.Errorf("the high-confidence subquestion was asked %d times, want 1", n)
	}
	if n := script.asksFor("What does nuclear cost?"); n < 2 {
		t.Errorf("the medium-confidence subquestion was asked %d times, want it revisited", n)
	}
}

// A run whose later round closed its gaps is complete. Latching the flag the
// first time a gap appeared trains the reader to ignore the warning.
func TestRunDoesNotLatchIncomplete(t *testing.T) {
	script := &scriptedLLM{highFor: "*"}
	srv := script.server(t)
	defer srv.Close()

	search := &fakeSearch{hits: []websearch.Result{{URL: "https://a.example/solar", Rank: 1}}}
	fetch := &fakeFetcher{bodies: map[string]string{
		"https://a.example/solar": strings.Repeat(
			"Solar cost per MWh in Europe during 2024 was low. "+
				"Provisional 2025 figures were published in March. ", 40),
	}}

	rep, err := Run(context.Background(), newTestClient(t, srv.URL), search,
		"Is solar cheaper than nuclear in Europe?",
		Options{Multiplier: 1, MaxRounds: 3, Concurrency: 2, Fetcher: fetch}, Progress{})
	if err != nil {
		t.Fatal(err)
	}
	if rep.Incomplete {
		t.Error("Incomplete is set although every finding came back high confidence")
	}
}

// The model's sense of "now" is its training cutoff. Every stage that judges
// recency has to be told the actual date.
func TestRunTellsTheModelTheDate(t *testing.T) {
	script := &scriptedLLM{}
	srv := script.server(t)
	defer srv.Close()

	search := &fakeSearch{hits: []websearch.Result{{URL: "https://a.example/solar", Rank: 1}}}
	fetch := &fakeFetcher{bodies: map[string]string{
		"https://a.example/solar": strings.Repeat("Solar cost per MWh in Europe was low. ", 40),
	}}

	if _, err := Run(context.Background(), newTestClient(t, srv.URL), search, "Is solar cheap?",
		Options{
			Multiplier: 1, MaxRounds: 1, Concurrency: 2, Fetcher: fetch,
			Now: time.Date(2031, time.March, 14, 0, 0, 0, 0, time.UTC),
		}, Progress{}); err != nil {
		t.Fatal(err)
	}
	if !script.sawPromptContaining("Today's date is 14 March 2031") {
		t.Error("no prompt carried the current date")
	}
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
