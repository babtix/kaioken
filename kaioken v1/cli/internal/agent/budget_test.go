package agent

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"kaioken/internal/llm"
)

func TestBudgetGuardCheck(t *testing.T) {
	// Nil guard and unknown spend are both silent.
	var nilGuard *BudgetGuard
	if warn, stop := nilGuard.Check(99, true); warn != "" || stop != nil {
		t.Error("nil guard must be a no-op")
	}
	g := NewBudgetGuard(1, 5)
	if warn, stop := g.Check(99, false); warn != "" || stop != nil {
		t.Error("unknown spend must not trigger the guard")
	}

	// Below both thresholds: nothing.
	if warn, stop := g.Check(0.5, true); warn != "" || stop != nil {
		t.Errorf("below thresholds: warn=%q stop=%v", warn, stop)
	}
	// Past warn: fires exactly once.
	warn, stop := g.Check(1.5, true)
	if warn == "" || stop != nil {
		t.Errorf("past warn threshold: warn=%q stop=%v", warn, stop)
	}
	if warn, _ := g.Check(2, true); warn != "" {
		t.Error("warning fired twice")
	}
	// Past stop: errors every time, and names the numbers.
	_, stop = g.Check(5, true)
	if stop == nil || !strings.Contains(stop.Error(), "$5.00") {
		t.Errorf("past hard stop: %v", stop)
	}
	if _, stop = g.Check(6, true); stop == nil {
		t.Error("hard stop must repeat")
	}

	// Zero thresholds build no guard at all.
	if NewBudgetGuard(0, 0) != nil {
		t.Error("zero thresholds must yield a nil guard")
	}
}

// infoUI records Info lines so the warning's surfacing can be asserted.
type infoUI struct {
	fakeUI
	infos []string
}

func (u *infoUI) Info(text string) { u.infos = append(u.infos, text) }

// costClient builds a real client against a test server whose first reply
// carries the given cost, so CostUSD is primed without touching recordUsage.
func costClient(t *testing.T, cost string, requests *atomic.Int32) *llm.Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		w.Write([]byte(`{"choices":[{"message":{"content":"done"}}],
			"usage":{"prompt_tokens":1,"completion_tokens":1,"cost":` + cost + `}}`))
	}))
	t.Cleanup(srv.Close)
	return &llm.Client{APIKey: "k", BaseURL: srv.URL, Model: "m", HTTP: srv.Client()}
}

func TestRunStopsAtHardStop(t *testing.T) {
	var requests atomic.Int32
	client := costClient(t, "5.0", &requests)

	// Prime the spend: one real call books $5.
	if _, err := client.Chat(context.Background(), "s", "u"); err != nil {
		t.Fatal(err)
	}
	before := requests.Load()

	a := &Agent{
		Client:   client,
		Root:     t.TempDir(),
		UI:       &infoUI{},
		NoStream: true,
		Budget:   NewBudgetGuard(0, 1),
	}
	_, err := a.Run(context.Background(), []llm.Message{{Role: "user", Content: "hi"}})
	if err == nil || !strings.Contains(err.Error(), "session budget reached") {
		t.Fatalf("Run past hard stop: %v", err)
	}
	if requests.Load() != before {
		t.Error("Run called the provider despite the hard stop")
	}
}

func TestRunWarnsOnceAndInjectsContextUpdate(t *testing.T) {
	var requests atomic.Int32
	client := costClient(t, "2.0", &requests)
	if _, err := client.Chat(context.Background(), "s", "u"); err != nil {
		t.Fatal(err)
	}

	ui := &infoUI{}
	a := &Agent{
		Client:   client,
		Root:     t.TempDir(),
		UI:       ui,
		NoStream: true,
		Budget:   NewBudgetGuard(1, 0), // warn only
	}
	hist, err := a.Run(context.Background(), []llm.Message{{Role: "user", Content: "hi"}})
	if err != nil {
		t.Fatal(err)
	}

	var warned int
	for _, m := range hist {
		if m.Role == "system" && strings.Contains(m.Content, "warn threshold") {
			warned++
		}
	}
	if warned != 1 {
		t.Errorf("context updates carrying the warning = %d, want 1", warned)
	}
	if len(ui.infos) == 0 || !strings.Contains(ui.infos[0], "warn threshold") {
		t.Errorf("warning not surfaced to the UI: %v", ui.infos)
	}

	// A second turn on the same guard must not warn again.
	hist, err = a.Run(context.Background(), append(hist, llm.Message{Role: "user", Content: "more"}))
	if err != nil {
		t.Fatal(err)
	}
	warned = 0
	for _, m := range hist {
		if m.Role == "system" && strings.Contains(m.Content, "warn threshold") {
			warned++
		}
	}
	if warned != 1 {
		t.Errorf("warning duplicated across turns: %d", warned)
	}
}
