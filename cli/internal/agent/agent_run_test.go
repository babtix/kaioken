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
// request's messages so a test can assert what the model actually saw.
type scriptedServer struct {
	mu       sync.Mutex
	replies  []map[string]any // choices[0].message payloads, served in order
	requests [][]llm.Message
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
		s.mu.Unlock()
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
