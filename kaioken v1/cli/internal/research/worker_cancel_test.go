package research

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"kaioken/internal/llm"
)

// countingTransport fronts the server's own transport and counts provider
// call ATTEMPTS. The httptest handler cannot do this job: once the context
// is dead, http.Transport refuses requests before they touch the wire, so a
// spend intent the worker acted on leaves no trace in the handler. A
// RoundTripper runs ahead of that refusal — which is where an attempted
// second bill shows up.
type countingTransport struct {
	mu       sync.Mutex
	attempts int
	next     http.RoundTripper
}

func (t *countingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	t.mu.Lock()
	t.attempts++
	t.mu.Unlock()
	return t.next.RoundTrip(req)
}

func (t *countingTransport) count() int {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.attempts
}

// cancelOnSearch stands in for a search backend and plays the user hitting
// Ctrl-C mid-strand: cancellation lands while the worker is busy with its
// tools — strictly after its first provider reply has been fully processed,
// and strictly before it could ask for another. Sequencing the kill here
// rather than inside the provider reply matters: a cancel raced against an
// in-flight response can abort the very call being served, which would make
// every later assertion true for the wrong reason.
type cancelOnSearch struct {
	cancel context.CancelFunc
	once   sync.Once
}

func (c *cancelOnSearch) Name() string { return "stub" }
func (c *cancelOnSearch) Search(_ context.Context, _ string, _ int) ([]Hit, error) {
	c.once.Do(func() { c.cancel() })
	return nil, nil
}
func (c *cancelOnSearch) Fetch(context.Context, string) (Document, error) {
	return Document{}, errors.New("not fetched")
}

// The rule pinned here: cancelling a run must stop a worker from ATTEMPTING
// provider calls, not merely stop those attempts from arriving. The fake
// provider's replies carry a tool call, so the worker always has a reason to
// come back around, and the context dies during the tool batch that follows
// the first reply. The load-bearing assertion is the attempt count: after
// cancellation it must stay at 1 — no second ChatWithTools may even be
// tried, and compress must never be reached either.
func TestWorkerStopsSpendingWhenRunIsCancelled(t *testing.T) {
	pinHome(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"choices":[{"message":{"role":"assistant","content":"",
			"tool_calls":[{"id":"call_1","type":"function",
			"function":{"name":"search","arguments":"{\"query\":\"solar cost\"}"}}]}}]}`))
	}))
	defer srv.Close()

	ct := &countingTransport{next: srv.Client().Transport}
	client := &llm.Client{
		APIKey:  "k",
		BaseURL: srv.URL,
		Model:   "m",
		HTTP:    &http.Client{Transport: ct},
	}
	clients := NewClients(client, nil)
	state, err := NewRun("is solar cheaper than nuclear?", "fast")
	if err != nil {
		t.Fatal(err)
	}
	e := &engine{
		budget:  Budget{MaxToolCallsPerWorker: 8},
		clients: clients,
		meter:   NewMeter(clients),
		store:   NewSourceStore(state.SourcesDir()),
		state:   state,
		web:     &cancelOnSearch{cancel: cancel},
	}

	f, err := e.runWorker(ctx, Subtopic{
		ID: "sub-1", Objective: "solar vs nuclear cost",
		Format: "prose", Sources: []string{"web"},
	})
	if err == nil || !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
	if f.Summary != "" {
		t.Errorf("a cancelled strand produced a finding summary %q", f.Summary)
	}

	if n := ct.count(); n != 1 {
		t.Errorf("the worker attempted %d provider calls, want 1 — it attempted another billed provider call after the run was cancelled", n)
	}
}
