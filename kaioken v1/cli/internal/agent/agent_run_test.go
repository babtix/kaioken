package agent

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"kaioken/internal/llm"
)

// scriptedServer serves canned assistant messages in order, recording each
// request's messages so a test can assert what the model actually saw. When
// onRequest is set it runs as each request is served — after the request is
// recorded, before the reply is written — which is how a test injects
// steering from inside the run it observes.
type scriptedServer struct {
	mu        sync.Mutex
	replies   []map[string]any // choices[0].message payloads, served in order
	requests  [][]llm.Message
	onRequest func()
}

func (s *scriptedServer) server(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Messages []llm.Message `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("bad request body: %v", err)
		}
		s.mu.Lock()
		s.requests = append(s.requests, req.Messages)
		var reply map[string]any
		if len(s.replies) > 0 {
			reply = s.replies[0]
			s.replies = s.replies[1:]
		} else {
			reply = map[string]any{"role": "assistant", "content": "out of script"}
		}
		hook := s.onRequest
		s.mu.Unlock()
		if hook != nil {
			hook()
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{"message": reply}},
		})
	}))
}

func (s *scriptedServer) requestCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.requests)
}

// sawUserMessage reports whether any recorded request contained a user
// message whose content includes sub.
func (s *scriptedServer) sawUserMessage(reqIdx int, sub string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if reqIdx >= len(s.requests) {
		return false
	}
	for _, m := range s.requests[reqIdx] {
		if m.Role == "user" && strings.Contains(m.Content, sub) {
			return true
		}
	}
	return false
}

func toolCallReply(name, args string) map[string]any {
	return map[string]any{
		"role":    "assistant",
		"content": "",
		"tool_calls": []any{map[string]any{
			"id":   "call_1",
			"type": "function",
			"function": map[string]any{
				"name":      name,
				"arguments": args,
			},
		}},
	}
}

func finalReply(text string) map[string]any {
	return map[string]any{"role": "assistant", "content": text}
}

func newRunAgent(t *testing.T, baseURL string) *Agent {
	t.Helper()
	client, err := llm.NewForProvider("openai", baseURL, "test-model", "test-key")
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("alpha"), 0o644); err != nil {
		t.Fatal(err)
	}
	return &Agent{
		Client:   client,
		Root:     dir,
		UI:       fakeUI{approve: true},
		NoStream: true,
		MaxSteps: 6,
	}
}

func TestRunSteeringJoinsBetweenTurns(t *testing.T) {
	script := &scriptedServer{replies: []map[string]any{
		toolCallReply("read_file", `{"path":"a.txt"}`),
		finalReply("done after steering"),
	}}
	srv := script.server(t)
	defer srv.Close()

	a := newRunAgent(t, srv.URL)
	// Queued before Run for determinism: it must be drained after the first
	// tool batch, i.e. visible to the second model call.
	a.Steer("actually, focus on b.txt")

	history, err := a.Run(context.Background(), []llm.Message{
		{Role: "system", Content: "test"},
		{Role: "user", Content: "look at a.txt"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !script.sawUserMessage(1, "focus on b.txt") {
		t.Error("second model call did not include the steered message")
	}
	if script.sawUserMessage(0, "focus on b.txt") {
		t.Error("steered message leaked into the first model call")
	}
	// In the final history the steered message must come after the tool
	// result, never between a tool call and its result.
	toolIdx, steerIdx := -1, -1
	for i, m := range history {
		if m.Role == "tool" {
			toolIdx = i
		}
		if m.Role == "user" && strings.Contains(m.Content, "focus on b.txt") {
			steerIdx = i
		}
	}
	if toolIdx == -1 || steerIdx == -1 || steerIdx < toolIdx {
		t.Errorf("steering position wrong: tool=%d steer=%d", toolIdx, steerIdx)
	}
}

func TestRunFollowUpRunsAfterFinalAnswer(t *testing.T) {
	script := &scriptedServer{replies: []map[string]any{
		finalReply("first answer"),
		finalReply("second answer"),
	}}
	srv := script.server(t)
	defer srv.Close()

	a := newRunAgent(t, srv.URL)
	a.FollowUp("now also summarize")

	history, err := a.Run(context.Background(), []llm.Message{
		{Role: "system", Content: "test"},
		{Role: "user", Content: "hello"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := script.requestCount(); got != 2 {
		t.Fatalf("expected 2 model calls, got %d", got)
	}
	if !script.sawUserMessage(1, "now also summarize") {
		t.Error("follow-up did not reach the second model call")
	}
	last := history[len(history)-1]
	if last.Role != "assistant" || last.Content != "second answer" {
		t.Errorf("unexpected final message: %+v", last)
	}
}

func TestRunNoQueuesStopsAtFinalAnswer(t *testing.T) {
	script := &scriptedServer{replies: []map[string]any{finalReply("done")}}
	srv := script.server(t)
	defer srv.Close()

	a := newRunAgent(t, srv.URL)
	history, err := a.Run(context.Background(), []llm.Message{
		{Role: "system", Content: "test"},
		{Role: "user", Content: "hello"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := script.requestCount(); got != 1 {
		t.Fatalf("expected 1 model call, got %d", got)
	}
	if history[len(history)-1].Content != "done" {
		t.Errorf("unexpected history tail: %+v", history[len(history)-1])
	}
}

func TestClearQueuesDropsPending(t *testing.T) {
	a := &Agent{}
	a.Steer("x")
	a.FollowUp("y")
	if a.QueuedCount() != 2 {
		t.Fatalf("QueuedCount = %d", a.QueuedCount())
	}
	a.ClearQueues()
	if a.QueuedCount() != 0 {
		t.Fatalf("after clear, QueuedCount = %d", a.QueuedCount())
	}
}

// Steering must not consume the step budget: with MaxSteps k, steering three
// times mid-run must not leave the agent short. The script needs five turns
// to finish — the corrections join three of them for free — so the old
// accounting, which capped total turns at k, died on the fourth request with
// "stopped after 4 steps without a final answer".
func TestRunSteeringDoesNotConsumeBudget(t *testing.T) {
	script := &scriptedServer{replies: []map[string]any{
		toolCallReply("read_file", `{"path":"a.txt"}`),
		toolCallReply("read_file", `{"path":"a.txt"}`),
		toolCallReply("read_file", `{"path":"a.txt"}`),
		toolCallReply("read_file", `{"path":"a.txt"}`),
		finalReply("done"),
	}}
	srv := script.server(t)
	defer srv.Close()

	a := newRunAgent(t, srv.URL)
	a.MaxSteps = 4
	steers := []string{"first correction", "second correction", "third correction"}
	script.onRequest = func() {
		// Injected from inside the handler, so each is guaranteed to be in
		// the queue when the iteration that requested it drains steering.
		if n := script.requestCount(); n <= len(steers) {
			a.Steer(steers[n-1])
		}
	}

	history, err := a.Run(context.Background(), []llm.Message{
		{Role: "system", Content: "test"},
		{Role: "user", Content: "hello"},
	})
	if err != nil {
		t.Fatalf("run failed after %d steerings: %v", len(steers), err)
	}
	// Five model calls went out: three steering turns on top of what the
	// four-step budget paid for. More calls than MaxSteps is the point.
	if got, want := script.requestCount(), len(steers)+2; got != want {
		t.Fatalf("got %d model calls, want %d (%d steering turns + the budgeted rounds)",
			got, want, len(steers))
	}
	for i, s := range steers {
		if !script.sawUserMessage(i+1, s) {
			t.Errorf("steering %q did not reach model call %d", s, i+1)
		}
	}
	if last := history[len(history)-1]; last.Role != "assistant" || last.Content != "done" {
		t.Errorf("unexpected final message: %+v", last)
	}
}

// A follow-up hand-off is not progress on the original request either, so it
// must not be billed: with MaxSteps 1 the agent can still finish the original
// request and then answer the follow-up.
func TestRunFollowUpDoesNotConsumeBudget(t *testing.T) {
	script := &scriptedServer{replies: []map[string]any{
		finalReply("first answer"),
		finalReply("second answer"),
	}}
	srv := script.server(t)
	defer srv.Close()

	a := newRunAgent(t, srv.URL)
	a.MaxSteps = 1
	a.FollowUp("now also summarize")

	history, err := a.Run(context.Background(), []llm.Message{
		{Role: "system", Content: "test"},
		{Role: "user", Content: "hello"},
	})
	if err != nil {
		t.Fatalf("follow-up consumed the one-step budget: %v", err)
	}
	if got := script.requestCount(); got != 2 {
		t.Fatalf("expected 2 model calls, got %d", got)
	}
	last := history[len(history)-1]
	if last.Role != "assistant" || last.Content != "second answer" {
		t.Errorf("unexpected final message: %+v", last)
	}
}

// A relentless steering flood must still terminate. The refund is bounded by
// a hard ceiling independent of the step budget, and when the ceiling fires
// the error says so — a caller debugging a loop has to be able to tell it
// apart from an exhausted budget.
func TestRunSteeringFloodHitsCeiling(t *testing.T) {
	script := &scriptedServer{} // serves final answers forever
	srv := script.server(t)
	defer srv.Close()

	a := newRunAgent(t, srv.URL) // MaxSteps 6 → ceiling 24
	script.onRequest = func() { a.Steer("flood") }

	_, err := a.Run(context.Background(), []llm.Message{
		{Role: "system", Content: "test"},
		{Role: "user", Content: "hello"},
	})
	if err == nil {
		t.Fatal("steering flood did not terminate the run")
	}
	if !strings.Contains(err.Error(), "ceiling") {
		t.Errorf("error does not name the ceiling: %v", err)
	}
	// Every turn makes exactly one model call, and the ceiling stopped the
	// run — so the count must exceed MaxSteps (the refunds worked) while
	// staying within it (the flood did not run away).
	if got := script.requestCount(); got <= a.MaxSteps || got > 4*a.MaxSteps {
		t.Errorf("requestCount = %d, want (%d, %d]", got, a.MaxSteps, 4*a.MaxSteps)
	}
}

// TestRunRemindersNotDuplicated: after steering with plan mode active, the
// conversation must carry exactly one reminder block.
func TestRunRemindersNotDuplicated(t *testing.T) {
	script := &scriptedServer{replies: []map[string]any{
		toolCallReply("read_file", `{"path":"a.txt"}`),
		finalReply("done"),
	}}
	srv := script.server(t)
	defer srv.Close()

	a := newRunAgent(t, srv.URL)
	a.Mode = ModePlan
	a.Steer("also consider the tests")

	history, err := a.Run(context.Background(), []llm.Message{
		{Role: "system", Content: "test"},
		{Role: "user", Content: "plan something"},
	})
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, m := range history {
		count += strings.Count(m.Content, "<system-reminder>")
	}
	if count != 1 {
		t.Errorf("expected exactly 1 reminder block in history, found %d", count)
	}
}
