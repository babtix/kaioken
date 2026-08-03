package research

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"kaioken/internal/config"
	"kaioken/internal/llm"
	"kaioken/internal/websearch"
)

// deepScript answers the deep path's tool-calling conversation: it plays
// the supervisor (dispatch one strand, then complete) and the worker
// (search, fetch, conclude), while the plain stages fall through to the
// usual canned replies.
type deepScript struct {
	mu            sync.Mutex
	supervisorN   int
	workerN       int
	dispatchN     int
	relentless    bool
	workerQueries []string
	fetchedIDs    []string
}

func (d *deepScript) server(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var req struct {
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
			Tools []json.RawMessage `json:"tools"`
		}
		if err := json.Unmarshal(raw, &req); err != nil {
			t.Errorf("bad request body: %v", err)
		}
		var system string
		for _, m := range req.Messages {
			if m.Role == "system" {
				system = m.Content
			}
		}

		d.mu.Lock()
		defer d.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")

		toolCall := func(id, name, args string) {
			resp := map[string]any{"choices": []any{map[string]any{
				"message": map[string]any{
					"role":    "assistant",
					"content": "",
					"tool_calls": []any{map[string]any{
						"id": id, "type": "function",
						"function": map[string]any{"name": name, "arguments": args},
					}},
				},
			}}}
			json.NewEncoder(w).Encode(resp)
		}
		text := func(s string) {
			resp := map[string]any{"choices": []any{map[string]any{
				"message": map[string]any{"role": "assistant", "content": s},
			}}}
			json.NewEncoder(w).Encode(resp)
		}

		switch {
		case strings.Contains(system, "You scope a research task"):
			text("# Brief\n\nCompare solar and nuclear cost in Europe.")
		case strings.Contains(system, "You plan multi-agent research"):
			text(`{"subtopics":[{"objective":"What does utility-scale solar cost in Europe?",` +
				`"format":"one figure with year and units","sources":["web"],` +
				`"bounds":"Europe only, utility scale only"}]}`)
		case strings.Contains(system, "You supervise a team"):
			d.supervisorN++
			if d.relentless {
				// A supervisor that never calls research_complete: the wave cap
				// is what stops it.
				d.dispatchN++
				toolCall("call-dispatch", "conduct_research",
					`{"objective":"extra strand `+string(rune('0'+d.dispatchN))+` outlook","format":"a dated prose answer","sources":["web"],"bounds":"only published figures"}`)
			} else if d.supervisorN == 1 {
				d.dispatchN++
				toolCall("call-dispatch", "conduct_research",
					`{"objective":"What is the 2025 outlook for solar cost in Europe?",`+
						`"format":"a dated prose answer","sources":["web"],`+
						`"bounds":"only published 2025 figures"}`)
			} else {
				toolCall("call-done", "research_complete", `{"reason":"coverage is sufficient"}`)
			}
		case strings.Contains(system, "You research ONE subtopic"):
			d.workerN++
			switch d.workerN {
			case 1:
				d.workerQueries = append(d.workerQueries, "european solar cost 2025")
				toolCall("call-search", "search", `{"query":"european solar cost 2025"}`)
			case 2:
				d.fetchedIDs = append(d.fetchedIDs, "https://a.example/solar")
				toolCall("call-fetch", "fetch", `{"id":"https://a.example/solar"}`)
			default:
				text("I have enough evidence to answer.")
			}
		case strings.Contains(system, "You compress research notes"):
			text(`{"summary":"Solar fell below EUR 40/MWh in Europe during 2024.","claims":[` +
				`{"text":"Solar fell below EUR 40/MWh in Europe in 2024","support":[]}]}`)
		case strings.Contains(system, "You write a research report"):
			text("## Short answer\nSolar is cheaper per MWh [1].\n\n## Limitations\nThin on 2025.")
		case strings.Contains(system, "citation-grounding reviewer"):
			text(`{"claims_checked":2,"ungrounded":[],"notes":"all grounded"}`)
		default:
			text("{}")
		}
	}))
}

// The deep path end to end: scope, plan, one supervisor wave with one
// worker, compression, writing, and the separate grounding pass — with the
// finding persisted to the run directory along the way.
func TestDeepPathRunsSupervisorWorkersAndGrounds(t *testing.T) {
	pinHome(t)
	script := &deepScript{}
	srv := script.server(t)
	defer srv.Close()

	search := &fakeSearch{hits: []websearch.Result{
		{URL: "https://a.example/solar", Title: "Solar", Snippet: "cost per MWh", Rank: 1},
	}}
	fetch := &fakeFetcher{bodies: map[string]string{
		"https://a.example/solar": strings.Repeat(
			"Utility-scale solar in Europe fell below EUR 40 per MWh during 2024. ", 20),
	}}

	rep, err := Run(context.Background(), newTestClient(t, srv.URL), search,
		"What is the outlook for solar cost in Europe?",
		Options{Multiplier: 3, Mode: "deep", Concurrency: 2, Fetcher: fetch}, Progress{})
	if err != nil {
		t.Fatal(err)
	}

	if rep.Path != "deep" {
		t.Errorf("Path = %q, want deep", rep.Path)
	}
	if rep.RunID == "" {
		t.Error("the report carries no run id")
	}
	if !strings.Contains(rep.Markdown, "Solar is cheaper") {
		t.Errorf("report body missing the synthesis:\n%s", rep.Markdown)
	}
	if rep.Grounding == nil || rep.Grounding.Checked != 2 {
		t.Errorf("Grounding = %+v, want the reviewer's two checked claims", rep.Grounding)
	}

	// The worker searched and fetched what the script says it did.
	if len(script.workerQueries) == 0 || len(script.fetchedIDs) == 0 {
		t.Error("the worker loop never reached search or fetch")
	}
	if rep.Cost.Searches < 1 || rep.Cost.Fetches < 1 {
		t.Errorf("the meter missed the retrieval: %+v", rep.Cost)
	}

	// The compressed finding is on disk where a resume would find it.
	findingPath := filepath.Join(config.GlobalDir(), "runs", rep.RunID, "findings", "sub-2.json")
	if _, err := os.Stat(findingPath); err != nil {
		t.Errorf("the finding was not persisted: %v", err)
	}
}

// A supervisor dispatch missing any field of the delegation contract is
// rejected, not issued — the workers must never receive a partial brief.
func TestSupervisorRejectsIncompleteContracts(t *testing.T) {
	e := &engine{}
	accepted, why := e.acceptDispatch(`{"objective":"only an objective"}`, map[string]bool{},
		new(int), new(int))
	if accepted != nil {
		t.Fatal("an incomplete contract was accepted")
	}
	if !strings.Contains(why, "delegation contract") {
		t.Errorf("rejection reason %q should name the contract", why)
	}
}

// A fast run that gathers too little escalates into the deep path, keeps
// its findings, and reports the promotion.
func TestThinFastRunEscalatesToDeep(t *testing.T) {
	pinHome(t)
	script := &scriptedLLM{}
	srv := script.server(t)
	defer srv.Close()

	search := &fakeSearch{hits: []websearch.Result{
		{URL: "https://a.example/solar", Title: "Solar", Snippet: "cost", Rank: 1},
	}}
	fetch := &fakeFetcher{bodies: map[string]string{
		"https://a.example/solar": strings.Repeat(
			"Solar cost per MWh in Europe during 2024 was low. ", 20),
	}}

	rep, err := Run(context.Background(), newTestClient(t, srv.URL), search,
		"Is solar cheaper than nuclear in Europe?",
		Options{Multiplier: 1, MaxRounds: 2, Concurrency: 2, Fetcher: fetch}, Progress{})
	if err != nil {
		t.Fatal(err)
	}

	if !rep.Escalated {
		t.Fatal("a single-source fast run must escalate")
	}
	if rep.Path != "deep" {
		t.Errorf("Path = %q after escalation, want deep", rep.Path)
	}
	// The promotion keeps the fast path's findings; the report still stands.
	if !strings.Contains(rep.Markdown, "Solar is cheaper") {
		t.Errorf("escalation lost the fast path's report:\n%s", rep.Markdown)
	}
}

// A pinned fast run never escalates, however thin: the user's explicit
// choice outranks the system's judgement.
func TestPinnedFastRunNeverEscalates(t *testing.T) {
	pinHome(t)
	script := &scriptedLLM{}
	srv := script.server(t)
	defer srv.Close()

	search := &fakeSearch{hits: []websearch.Result{
		{URL: "https://a.example/solar", Title: "Solar", Snippet: "cost", Rank: 1},
	}}
	fetch := &fakeFetcher{bodies: map[string]string{
		"https://a.example/solar": strings.Repeat(
			"Solar cost per MWh in Europe during 2024 was low. ", 20),
	}}

	rep, err := Run(context.Background(), newTestClient(t, srv.URL), search,
		"Is solar cheaper than nuclear in Europe?",
		Options{Multiplier: 1, MaxRounds: 2, Concurrency: 2, Fetcher: fetch, Mode: "fast"}, Progress{})
	if err != nil {
		t.Fatal(err)
	}
	if rep.Escalated || rep.Path != "fast" {
		t.Errorf("pinned fast run escalated (escalated=%v path=%q)", rep.Escalated, rep.Path)
	}
}

// The meter reports retrieval counts unchanged by token noise.
func TestMeterCountsRetrieval(t *testing.T) {
	clients := NewClients(&llm.Client{Model: "unpriced/test-model"}, nil)
	m := NewMeter(clients)
	m.AddSearches(3)
	m.AddFetches(2)
	if s, f := m.Retrieval(); s != 3 || f != 2 {
		t.Errorf("Retrieval = (%d, %d), want (3, 2)", s, f)
	}
	snap := m.Snapshot()
	if snap.Searches != 3 || snap.Fetches != 2 {
		t.Errorf("Snapshot retrieval = (%d, %d), want (3, 2)", snap.Searches, snap.Fetches)
	}
	if snap.Exact {
		t.Error("an unpriced model must not claim an exact dollar figure")
	}
}

// A supervisor that never calls research_complete must still stop: the
// wave cap is the hard stop, at exactly MaxSupervisorIters dispatch waves.
func TestSupervisorWavesAreCapped(t *testing.T) {
	pinHome(t)
	script := &deepScript{relentless: true}
	srv := script.server(t)
	defer srv.Close()

	search := &fakeSearch{hits: []websearch.Result{
		{URL: "https://a.example/solar", Title: "Solar", Snippet: "cost per MWh", Rank: 1},
	}}
	fetch := &fakeFetcher{bodies: map[string]string{
		"https://a.example/solar": strings.Repeat(
			"Utility-scale solar in Europe fell below EUR 40 per MWh during 2024. ", 20),
	}}

	// ×3 selects the standard preset, whose cap is two supervisor waves.
	rep, err := Run(context.Background(), newTestClient(t, srv.URL), search,
		"What is the outlook for solar cost in Europe?",
		Options{Multiplier: 3, Mode: "deep", Concurrency: 2, Fetcher: fetch}, Progress{})
	if err != nil {
		t.Fatal(err)
	}
	if rep.Path != "deep" {
		t.Errorf("Path = %q, want deep", rep.Path)
	}
	if script.dispatchN != budgetStandard.MaxSupervisorIters {
		t.Errorf("supervisor dispatched %d waves, want the cap %d",
			script.dispatchN, budgetStandard.MaxSupervisorIters)
	}
}

// A checkpointed run resumes where it stopped: the loop continues its
// rounds without re-planning the subquestions or rewriting the queries.
func TestRunResumesFromCheckpoint(t *testing.T) {
	pinHome(t)
	script := &scriptedLLM{}
	srv := script.server(t)
	defer srv.Close()

	question := "Is solar cheaper than nuclear in Europe?"

	// Simulate a run interrupted after round one: state on disk, process gone.
	rs, err := NewRun(question, "auto")
	if err != nil {
		t.Fatal(err)
	}
	rs.Mutate(func(r *RunMeta) {
		r.Path = "fast"
		r.Fast = FastState{
			Subs: []string{"What does solar cost?", "What does nuclear cost?"},
			Findings: []finding{{
				Question: "What does solar cost?",
				Answer:   "Solar fell below EUR 40/MWh.", Citations: []int{1}, Confidence: "medium",
			}},
			Queries: []string{"solar cost europe"},
			Round:   1,
		}
	})
	if err := rs.SetPhase(PhaseResearch); err != nil {
		t.Fatal(err)
	}

	search := &fakeSearch{hits: []websearch.Result{
		{URL: "https://a.example/solar", Title: "Solar", Snippet: "cost", Rank: 1},
	}}
	fetch := &fakeFetcher{bodies: map[string]string{
		"https://a.example/solar": strings.Repeat(
			"Utility-scale solar in Europe fell below EUR 40 per MWh during 2024. "+
				"Nuclear cost per MWh in Europe ranged far higher across the same period. "+
				"Provisional 2025 figures for both technologies were published in March. ", 20),
	}}

	rep, err := Run(context.Background(), newTestClient(t, srv.URL), search, question,
		Options{Multiplier: 1, MaxRounds: 3, Concurrency: 2, Fetcher: fetch, Resume: runIDOf(rs.Dir())}, Progress{})
	if err != nil {
		t.Fatal(err)
	}

	if rep.Rounds < 2 {
		t.Errorf("Rounds = %d, want the resumed run to continue past round one", rep.Rounds)
	}
	if script.sawPromptContaining("You plan research") {
		t.Error("the resumed run re-decomposed the question instead of restoring its subquestions")
	}
	if script.sawPromptContaining("You write web search queries") {
		t.Error("the resumed run rewrote its queries instead of continuing")
	}
}

// Ungrounded claims are surfaced in the report, load-bearing ones marked.
func TestGroundingFlagsRendered(t *testing.T) {
	g := &Grounding{
		Checked: 4,
		Ungrounded: []UngroundedClaim{
			{Claim: "Solar reached grid parity in 2023", LoadBearing: true},
			{Claim: "An aside about panel colors", LoadBearing: false},
		},
		Notes: "mostly grounded",
	}
	md := groundingFlags(g)
	for _, want := range []string{"## Grounding flags", "Solar reached grid parity in 2023", "load-bearing", "An aside about panel colors", "mostly grounded"} {
		if !strings.Contains(md, want) {
			t.Errorf("grounding flags missing %q:\n%s", want, md)
		}
	}
	if g.Rate() != 0.5 {
		t.Errorf("Rate = %v, want 0.5 for two of four grounded", g.Rate())
	}
	if !g.LoadBearingFailed() {
		t.Error("a load-bearing ungrounded claim must trip LoadBearingFailed")
	}
}
