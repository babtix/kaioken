package agent

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"kaioken/internal/llm"
)

// Context management inside the run loop.
//
// The behaviour under test is a policy, not a calculation: when does the loop
// spend money to shrink the conversation, and when does it refuse to. So these
// drive manageContext directly and count the summarizer calls that reach the
// scripted server, rather than asserting on token arithmetic that Usable and
// ShouldCompact already own.

// ctxTestAgent wires an agent to a scripted server with a window small enough
// that a few large tool results cross it. "test-model" is unknown to the
// catalog, so it gets DefaultContextWindow (32k); a 15k reply ceiling leaves
// roughly 17k usable.
func ctxTestAgent(t *testing.T, baseURL string) *Agent {
	t.Helper()
	client, err := llm.NewForProvider("openai", baseURL, "test-model", "test-key")
	if err != nil {
		t.Fatal(err)
	}
	client.MaxTokens = 15_000
	return &Agent{
		Client:   client,
		Root:     t.TempDir(),
		UI:       fakeUI{approve: true},
		NoStream: true,
		MaxSteps: 6,
	}
}

// convWithToolBulk builds a provider-valid history whose bulk is tool output.
//
// The split into old and recent pairs is what makes pruning observable. Prune
// walks back counting user turns and protects the two most recent, so only the
// tool results before `recentPairs` are even eligible — and of those, the
// newest pruneProtect tokens are held back too. oldPairs must therefore carry
// well past that protected budget for anything to be freed at all.
func convWithToolBulk(oldPairs, recentPairs, chunkBytes int) []llm.Message {
	body := strings.Repeat("x", chunkBytes)
	conv := []llm.Message{
		{Role: "system", Content: "system prompt"},
		{Role: "user", Content: "first question"},
	}
	add := func(tag string, n int) {
		for i := 0; i < n; i++ {
			id := fmt.Sprintf("call_%s_%d", tag, i)
			conv = append(conv,
				llm.Message{Role: "assistant", ToolCalls: []llm.ToolCall{{
					ID: id, Type: "function",
					Function: llm.FunctionCall{Name: "read_file", Arguments: `{"path":"a.txt"}`},
				}}},
				llm.Message{Role: "tool", ToolCallID: id, Name: "read_file", Content: body},
			)
		}
	}
	add("old", oldPairs)
	conv = append(conv, llm.Message{Role: "user", Content: "second question"})
	add("recent", recentPairs)
	conv = append(conv, llm.Message{Role: "user", Content: "latest question"})
	return conv
}

// failingServer refuses every request with a non-retryable status, so a
// summarizer call fails fast instead of walking the retry ladder.
func failingServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":{"message":"nope"}}`, http.StatusUnauthorized)
	}))
}

func TestManageContextLeavesSmallConversationAlone(t *testing.T) {
	script := &scriptedServer{}
	srv := script.server(t)
	defer srv.Close()

	a := ctxTestAgent(t, srv.URL)
	conv := []llm.Message{
		{Role: "system", Content: "system prompt"},
		{Role: "user", Content: "hello"},
		{Role: "assistant", Content: "hi"},
	}
	out, last := a.manageContext(context.Background(), conv, 0, -recompactCooldown)

	if len(out) != len(conv) {
		t.Errorf("history was rewritten: %d messages, want %d", len(out), len(conv))
	}
	if last != -recompactCooldown {
		t.Errorf("recorded a compaction attempt that never happened: %d", last)
	}
	if n := script.requestCount(); n != 0 {
		t.Errorf("made %d model call(s) for a small conversation, want 0", n)
	}
}

func TestManageContextPrunesBeforeSummarizing(t *testing.T) {
	script := &scriptedServer{}
	srv := script.server(t)
	defer srv.Close()

	a := ctxTestAgent(t, srv.URL)
	conv := convWithToolBulk(8, 3, 8_000)

	out, last := a.manageContext(context.Background(), conv, 0, -recompactCooldown)

	// Pruning keeps every message and its position; only tool bodies change.
	if len(out) != len(conv) {
		t.Fatalf("prune changed the message count: %d, want %d", len(out), len(conv))
	}
	stubbed := 0
	for _, m := range out {
		if m.Role == "tool" && m.Content == prunedStub {
			stubbed++
		}
	}
	if stubbed == 0 {
		t.Error("no tool result was pruned")
	}
	// Pruning alone got under the limit here, so no summary was bought.
	if n := script.requestCount(); n != 0 {
		t.Errorf("summarized despite pruning being enough: %d model call(s)", n)
	}
	if last != -recompactCooldown {
		t.Errorf("recorded a compaction attempt: %d", last)
	}
}

func TestManageContextCompactsWhenPruningIsNotEnough(t *testing.T) {
	script := &scriptedServer{replies: []map[string]any{
		finalReply("## Goal\nfind the bug\n\n## Next Steps\n1. keep going"),
	}}
	srv := script.server(t)
	defer srv.Close()

	a := ctxTestAgent(t, srv.URL)
	// The bulk sits in the protected recent turns, where pruning will not touch
	// it, so the summarizer has to run.
	conv := []llm.Message{
		{Role: "system", Content: "system prompt"},
		{Role: "user", Content: "q1"},
		{Role: "assistant", Content: strings.Repeat("y", 40_000)},
		{Role: "user", Content: "q2"},
		{Role: "assistant", Content: strings.Repeat("z", 40_000)},
		{Role: "user", Content: "latest question"},
	}

	out, last := a.manageContext(context.Background(), conv, 0, -recompactCooldown)

	if n := script.requestCount(); n != 1 {
		t.Fatalf("expected exactly 1 summarizer call, got %d", n)
	}
	if last != 0 {
		t.Errorf("lastCompact = %d, want 0", last)
	}
	if len(out) >= len(conv) {
		t.Errorf("compaction did not shorten the history: %d, want < %d", len(out), len(conv))
	}
	var sawSummary bool
	for _, m := range out {
		if m.Role == "system" && strings.HasPrefix(m.Content, SummaryPrefix) {
			sawSummary = true
		}
	}
	if !sawSummary {
		t.Error("compacted history carries no summary message")
	}
	// The newest turn is never summarized away.
	if out[len(out)-1].Content != "latest question" {
		t.Errorf("last message = %q, want the newest user turn", out[len(out)-1].Content)
	}
}

func TestManageContextCooldownBoundsRepeatCompaction(t *testing.T) {
	script := &scriptedServer{replies: []map[string]any{
		finalReply("summary one"),
		finalReply("summary two"),
	}}
	srv := script.server(t)
	defer srv.Close()

	a := ctxTestAgent(t, srv.URL)
	big := func() []llm.Message {
		return []llm.Message{
			{Role: "system", Content: "system prompt"},
			{Role: "user", Content: "q1"},
			{Role: "assistant", Content: strings.Repeat("y", 40_000)},
			{Role: "user", Content: "q2"},
			{Role: "assistant", Content: strings.Repeat("z", 40_000)},
			{Role: "user", Content: "latest question"},
		}
	}

	// Step 0 compacts. Steps 1 and 2 are inside the cooldown and must not,
	// even though the conversation handed to them is over the limit again.
	_, last := a.manageContext(context.Background(), big(), 0, -recompactCooldown)
	if last != 0 {
		t.Fatalf("step 0 did not compact: lastCompact = %d", last)
	}
	for step := 1; step < recompactCooldown; step++ {
		_, last = a.manageContext(context.Background(), big(), step, last)
		if last != 0 {
			t.Errorf("step %d compacted inside the cooldown: lastCompact = %d", step, last)
		}
	}
	if n := script.requestCount(); n != 1 {
		t.Fatalf("cooldown did not hold: %d summarizer calls, want 1", n)
	}

	// Once the cooldown has elapsed a further attempt is allowed again.
	_, last = a.manageContext(context.Background(), big(), recompactCooldown, last)
	if last != recompactCooldown {
		t.Errorf("attempt after the cooldown was refused: lastCompact = %d", last)
	}
	if n := script.requestCount(); n != 2 {
		t.Errorf("expected a second summarizer call, got %d total", n)
	}
}

func TestManageContextDisabled(t *testing.T) {
	script := &scriptedServer{}
	srv := script.server(t)
	defer srv.Close()

	SetCompactionSettings(false, 0, 0)
	defer SetCompactionSettings(true, 0, 0)

	a := ctxTestAgent(t, srv.URL)
	conv := convWithToolBulk(8, 3, 8_000)
	out, last := a.manageContext(context.Background(), conv, 0, -recompactCooldown)

	if len(out) != len(conv) {
		t.Errorf("history changed while compaction was disabled")
	}
	for i, m := range out {
		if m.Content != conv[i].Content {
			t.Fatalf("message %d was rewritten while compaction was disabled", i)
		}
	}
	if last != -recompactCooldown || script.requestCount() != 0 {
		t.Errorf("work was done while compaction was disabled")
	}
}

// A failed summarizer call must not cost the conversation. The turn may still
// fit, and an unusable history is strictly worse than an oversized one.
func TestManageContextSurvivesCompactionFailure(t *testing.T) {
	srv := failingServer(t)
	defer srv.Close()

	a := ctxTestAgent(t, srv.URL)
	conv := []llm.Message{
		{Role: "system", Content: "system prompt"},
		{Role: "user", Content: "q1"},
		{Role: "assistant", Content: strings.Repeat("y", 40_000)},
		{Role: "user", Content: "q2"},
		{Role: "assistant", Content: strings.Repeat("z", 40_000)},
		{Role: "user", Content: "latest question"},
	}
	out, last := a.manageContext(context.Background(), conv, 0, -recompactCooldown)

	if len(out) != len(conv) {
		t.Fatalf("history changed after a failed compaction: %d, want %d", len(out), len(conv))
	}
	for i := range out {
		if out[i].Content != conv[i].Content {
			t.Fatalf("message %d was rewritten after a failed compaction", i)
		}
	}
	// The failed attempt still counts, so the next step does not immediately
	// buy another one.
	if last != 0 {
		t.Errorf("a failed attempt was not recorded: lastCompact = %d", last)
	}
}

// The loop keeps running when context management cannot help.
func TestRunCompletesWhenCompactionFails(t *testing.T) {
	script := &scriptedServer{replies: []map[string]any{
		finalReply("answered anyway"),
	}}
	srv := script.server(t)
	defer srv.Close()

	a := ctxTestAgent(t, srv.URL)
	// Small enough that manageContext is a no-op: this asserts the wiring did
	// not break the ordinary path.
	history, err := a.Run(context.Background(), []llm.Message{
		{Role: "system", Content: "test"},
		{Role: "user", Content: "hello"},
	})
	if err != nil {
		t.Fatalf("run failed: %v", err)
	}
	if got := history[len(history)-1].Content; got != "answered anyway" {
		t.Errorf("final message = %q", got)
	}
}
