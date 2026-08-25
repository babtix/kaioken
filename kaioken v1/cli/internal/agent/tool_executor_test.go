package agent

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/agent/events"
	"kaioken/internal/llm"
)

// multiToolCallReply builds an assistant message requesting several tools in
// one turn — the shape that triggers the parallel batch path.
func multiToolCallReply(calls ...[2]string) map[string]any {
	var tcs []any
	for i, c := range calls {
		tcs = append(tcs, map[string]any{
			"id":   "call_" + string(rune('a'+i)),
			"type": "function",
			"function": map[string]any{
				"name":      c[0],
				"arguments": c[1],
			},
		})
	}
	return map[string]any{"role": "assistant", "content": "", "tool_calls": tcs}
}

func TestParallelBatchPreservesCallOrder(t *testing.T) {
	script := &scriptedServer{replies: []map[string]any{
		multiToolCallReply(
			[2]string{"read_file", `{"path":"a.txt"}`},
			[2]string{"read_file", `{"path":"b.txt"}`},
			[2]string{"read_file", `{"path":"c.txt"}`},
		),
		finalReply("done"),
	}}
	srv := script.server(t)
	defer srv.Close()

	a := newRunAgent(t, srv.URL)
	a.Events = events.NewBus()
	for _, f := range []string{"b.txt", "c.txt"} {
		if err := os.WriteFile(filepath.Join(a.Root, f), []byte(strings.TrimSuffix(f, ".txt")), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	history, err := a.Run(context.Background(), []llm.Message{
		{Role: "system", Content: "test"},
		{Role: "user", Content: "read all three"},
	})
	if err != nil {
		t.Fatal(err)
	}

	// Tool results must appear in call order regardless of finish order.
	var results []llm.Message
	for _, m := range history {
		if m.Role == "tool" {
			results = append(results, m)
		}
	}
	if len(results) != 3 {
		t.Fatalf("expected 3 tool results, got %d", len(results))
	}
	want := []string{"call_a", "call_b", "call_c"}
	wantContent := []string{"alpha", "b", "c"}
	for i, r := range results {
		if r.ToolCallID != want[i] {
			t.Errorf("result %d: ToolCallID = %s, want %s", i, r.ToolCallID, want[i])
		}
		if !strings.Contains(r.Content, wantContent[i]) {
			t.Errorf("result %d: content = %q, want it to contain %q", i, r.Content, wantContent[i])
		}
	}
}

func TestToolCallHookBlocks(t *testing.T) {
	script := &scriptedServer{replies: []map[string]any{
		toolCallReply("read_file", `{"path":"a.txt"}`),
		finalReply("done"),
	}}
	srv := script.server(t)
	defer srv.Close()

	a := newRunAgent(t, srv.URL)
	a.Events = events.NewBus()
	a.Events.Subscribe(events.ToolCall, func(e *events.Event) {
		if e.ToolName == "read_file" {
			e.Block = true
			e.BlockReason = "reads are forbidden today"
		}
	})

	history, err := a.Run(context.Background(), []llm.Message{
		{Role: "system", Content: "test"},
		{Role: "user", Content: "read a.txt"},
	})
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, m := range history {
		if m.Role == "tool" && strings.Contains(m.Content, "reads are forbidden today") {
			found = true
			if !strings.HasPrefix(m.Content, "error:") {
				t.Errorf("blocked result should read as an error: %q", m.Content)
			}
		}
	}
	if !found {
		t.Fatal("blocked tool call did not produce a block result")
	}
}

func TestToolCallHookRewritesArguments(t *testing.T) {
	script := &scriptedServer{replies: []map[string]any{
		toolCallReply("read_file", `{"path":"a.txt"}`),
		finalReply("done"),
	}}
	srv := script.server(t)
	defer srv.Close()

	a := newRunAgent(t, srv.URL)
	a.Events = events.NewBus()
	if err := os.WriteFile(filepath.Join(a.Root, "other.txt"), []byte("rerouted"), 0o644); err != nil {
		t.Fatal(err)
	}
	a.Events.Subscribe(events.ToolCall, func(e *events.Event) {
		e.ToolArgs = `{"path":"other.txt"}`
	})

	history, err := a.Run(context.Background(), []llm.Message{
		{Role: "system", Content: "test"},
		{Role: "user", Content: "read a.txt"},
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range history {
		if m.Role == "tool" && strings.Contains(m.Content, "rerouted") {
			return
		}
	}
	t.Fatal("rewritten arguments were not used")
}

func TestToolResultHookRewritesResult(t *testing.T) {
	script := &scriptedServer{replies: []map[string]any{
		toolCallReply("read_file", `{"path":"a.txt"}`),
		finalReply("done"),
	}}
	srv := script.server(t)
	defer srv.Close()

	a := newRunAgent(t, srv.URL)
	a.Events = events.NewBus()
	a.Events.Subscribe(events.ToolResult, func(e *events.Event) {
		e.Result = "[scrubbed]"
	})

	history, err := a.Run(context.Background(), []llm.Message{
		{Role: "system", Content: "test"},
		{Role: "user", Content: "read a.txt"},
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range history {
		if m.Role == "tool" {
			if m.Content != "[scrubbed]" {
				t.Errorf("tool result not rewritten: %q", m.Content)
			}
			return
		}
	}
	t.Fatal("no tool result in history")
}

func TestRunEmitsLifecycleEvents(t *testing.T) {
	script := &scriptedServer{replies: []map[string]any{
		toolCallReply("read_file", `{"path":"a.txt"}`),
		finalReply("done"),
	}}
	srv := script.server(t)
	defer srv.Close()

	a := newRunAgent(t, srv.URL)
	a.Events = events.NewBus()
	var seen []events.Type
	a.Events.SubscribeAll(func(e *events.Event) { seen = append(seen, e.Type) })

	if _, err := a.Run(context.Background(), []llm.Message{
		{Role: "system", Content: "test"},
		{Role: "user", Content: "read a.txt"},
	}); err != nil {
		t.Fatal(err)
	}

	// A SubscribeAll listener sees the interceptable hook events too —
	// HasHandlers reports true for them once anything listens to everything.
	want := []events.Type{
		events.AgentStart,
		events.TurnStart, events.BeforeProviderRequest, events.MessageStart, events.MessageEnd,
		events.ToolCall, events.ToolExecutionStart, events.ToolResult, events.ToolExecutionEnd,
		events.TurnEnd,
		events.TurnStart, events.BeforeProviderRequest, events.MessageStart, events.MessageEnd,
		events.TurnEnd,
		events.AgentEnd,
	}
	if len(seen) != len(want) {
		t.Fatalf("event count = %d, want %d: %v", len(seen), len(want), seen)
	}
	for i := range want {
		if seen[i] != want[i] {
			t.Fatalf("event %d = %s, want %s (all: %v)", i, seen[i], want[i], seen)
		}
	}
}

func TestBeforeProviderRequestCanEditHistory(t *testing.T) {
	script := &scriptedServer{replies: []map[string]any{finalReply("done")}}
	srv := script.server(t)
	defer srv.Close()

	a := newRunAgent(t, srv.URL)
	a.Events = events.NewBus()
	a.Events.Subscribe(events.BeforeProviderRequest, func(e *events.Event) {
		*e.History = append(*e.History, llm.Message{Role: "user", Content: "hook says hi"})
	})

	if _, err := a.Run(context.Background(), []llm.Message{
		{Role: "system", Content: "test"},
		{Role: "user", Content: "hello"},
	}); err != nil {
		t.Fatal(err)
	}
	if !script.sawUserMessage(0, "hook says hi") {
		t.Fatal("hook-injected message did not reach the provider")
	}
}

func TestIsErrResult(t *testing.T) {
	cases := map[string]bool{
		"error: no such file":            true,
		"user declined to write x":       true,
		"command exited with error: 1\n": true,
		"alpha":                          false,
		"(empty directory)":              false,
	}
	for in, want := range cases {
		if got := isErrResult(in); got != want {
			t.Errorf("isErrResult(%q) = %v, want %v", in, got, want)
		}
	}
}

func TestParallelSafeClassification(t *testing.T) {
	for _, name := range []string{"read_file", "list_files", "search", "read_knowledge", "recall"} {
		if !parallelSafe(name) {
			t.Errorf("%s should be parallel-safe", name)
		}
	}
	for _, name := range []string{"write_file", "edit_file", "run_command", "remember", "task", "todo", "myext__tool"} {
		if parallelSafe(name) {
			t.Errorf("%s must not be parallel-safe", name)
		}
	}
}

// cancelOnApproveUI cancels the run the first time a tool asks for approval,
// standing in for the user hitting esc while a batch is being applied.
type cancelOnApproveUI struct {
	fakeUI
	cancel context.CancelFunc
}

func (c *cancelOnApproveUI) Approve(ApprovalRequest) bool {
	c.cancel()
	return false
}

// Cancelling partway through a tool batch used to return a history whose
// assistant message still carried tool_calls nobody had answered. That
// history is saved to the session, and every chat API rejects it — so one esc
// at the wrong moment made the session unusable and unresumable. Every call
// must come back with a result, even an aborted one.
func TestCancelMidBatchStillAnswersEveryToolCall(t *testing.T) {
	script := &scriptedServer{replies: []map[string]any{
		multiToolCallReply(
			[2]string{"write_file", `{"path":"x.txt","content":"1"}`},
			[2]string{"write_file", `{"path":"y.txt","content":"2"}`},
			[2]string{"write_file", `{"path":"z.txt","content":"3"}`},
		),
	}}
	srv := script.server(t)
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	a := newRunAgent(t, srv.URL)
	a.UI = &cancelOnApproveUI{cancel: cancel}

	history, _ := a.Run(ctx, []llm.Message{
		{Role: "system", Content: "test"},
		{Role: "user", Content: "write three files"},
	})

	issued, answered := 0, map[string]bool{}
	for _, m := range history {
		issued += len(m.ToolCalls)
		if m.Role == "tool" {
			answered[m.ToolCallID] = true
		}
	}
	if issued == 0 {
		t.Fatal("expected the model to have issued tool calls")
	}
	if issued != len(answered) {
		t.Errorf("%d tool_calls but %d results: the provider would reject this history", issued, len(answered))
	}
}
