package agent

import (
	"strings"
	"testing"

	"kaioken/internal/llm"
)

// toolTurn builds a conversation with n complete turns, each carrying a tool
// call and a tool reply of the given size.
func toolTurn(n, resultBytes int) []llm.Message {
	conv := []llm.Message{{Role: "system", Content: "sys"}}
	for i := 0; i < n; i++ {
		conv = append(conv,
			llm.Message{Role: "user", Content: "question"},
			llm.Message{Role: "assistant", ToolCalls: []llm.ToolCall{{ID: "c"}}},
			llm.Message{Role: "tool", ToolCallID: "c", Name: "read_file",
				Content: strings.Repeat("x", resultBytes)},
			llm.Message{Role: "assistant", Content: "answer"},
		)
	}
	return conv
}

// TestSplitForCompactionBoundary is the rule that keeps a compacted history
// sendable. A tool reply whose originating assistant message was summarized
// away is rejected by the provider — as an opaque 400 on the next turn, far
// from the code that caused it.
func TestSplitForCompactionBoundary(t *testing.T) {
	conv := toolTurn(4, 400)
	for _, budget := range []int{1, 50, 500, 5_000, 1_000_000} {
		head, tail := splitForCompaction(conv, budget)
		if len(tail) > 0 && tail[0].Role != "user" {
			t.Errorf("budget %d: tail starts with %q, must start at a user message", budget, tail[0].Role)
		}
		if len(head) == 0 {
			t.Errorf("budget %d: head is empty, nothing would be summarized", budget)
		}
		if len(head)+len(tail) != len(conv)-1 { // -1 for the system prompt
			t.Errorf("budget %d: head+tail = %d, want %d", budget, len(head)+len(tail), len(conv)-1)
		}
	}
}

// TestSplitKeepsNewestTurn covers the case where the user's just-typed message
// alone exceeds the tail budget. Summarizing it away would leave the model
// answering a paraphrase of the question instead of the question.
func TestSplitKeepsNewestTurn(t *testing.T) {
	conv := toolTurn(3, 200)
	conv = append(conv, llm.Message{Role: "user", Content: strings.Repeat("q", 80_000)})

	_, tail := splitForCompaction(conv, 100)
	if len(tail) == 0 {
		t.Fatal("the newest turn was dropped entirely")
	}
	if tail[0].Role != "user" || !strings.HasPrefix(tail[0].Content, "q") {
		t.Errorf("newest user message not preserved: %q", firstRunes(tail[0].Content, 20))
	}
}

// TestSplitWithoutSystemPrompt guards the daemon's path, where a history may
// arrive with no leading system message.
func TestSplitWithoutSystemPrompt(t *testing.T) {
	conv := toolTurn(3, 200)[1:] // drop the system prompt
	head, tail := splitForCompaction(conv, 5_000)
	if len(head) == 0 {
		t.Error("head is empty")
	}
	if len(tail) > 0 && tail[0].Role != "user" {
		t.Errorf("tail starts with %q", tail[0].Role)
	}
}

// TestUsableLeavesHeadroom asserts the property the whole trigger rests on:
// there is always room left for the reply that is about to be generated.
func TestUsableLeavesHeadroom(t *testing.T) {
	for _, model := range []string{
		"anthropic/claude-sonnet-4.5", "openai/gpt-4o", "google/gemini-2.5-pro",
		"openai/gpt-4", "something/unknown-model",
	} {
		window := llm.ContextWindow(model)
		usable := Usable(model, 8192)
		if usable <= 0 || usable >= window {
			t.Errorf("%s: usable %d out of range for window %d", model, usable, window)
		}
		// The reserve covers the reply, except on models so small that the
		// ceiling exceeds half the window — there it is capped at half so the
		// mechanism stays switched on.
		reserve, want := window-usable, 8192
		if half := window / 2; want > half {
			want = half
		}
		if reserve < want {
			t.Errorf("%s: reserve %d is less than the %d it should hold back", model, reserve, want)
		}
	}
}

// TestTailBudgetClamped is the bug the opencode source caught: an unclamped
// 25% share is 250k tokens on a million-token window, so compaction would run
// and shrink almost nothing.
func TestTailBudgetClamped(t *testing.T) {
	if b := tailBudget("google/gemini-2.5-pro", 8192); b > maxTailTokens {
		t.Errorf("huge window: tail budget %d exceeds clamp %d", b, maxTailTokens)
	}
	if b := tailBudget("openai/gpt-4", 8192); b < minTailTokens {
		t.Errorf("small window: tail budget %d below clamp %d", b, minTailTokens)
	}
}

// TestShouldCompactShortConversation asserts a fresh session is never reduced.
func TestShouldCompactShortConversation(t *testing.T) {
	conv := []llm.Message{
		{Role: "system", Content: "sys"},
		{Role: "user", Content: "hi"},
	}
	if need, _ := ShouldCompact(conv, "openai/gpt-4", 8192); need {
		t.Error("a two-message conversation must not compact")
	}
}

// TestPruneProtectsRecentTurns asserts the guarantee that keeps pruning from
// making the agent re-read what it just read.
func TestPruneProtectsRecentTurns(t *testing.T) {
	conv := toolTurn(2, 500)
	out, freed, _ := Prune(conv, "openai/gpt-4", 8192)
	if freed != 0 {
		t.Errorf("only recent turns exist, but %d tokens were pruned", freed)
	}
	for i := range out {
		if out[i].Content == prunedStub {
			t.Errorf("message %d in a protected turn was pruned", i)
		}
	}
}

// TestPruneKeepsStructure is what makes pruning safe where truncation would
// not be: messages, order, and tool_call_id pairing all survive, so the
// history stays something the provider accepts.
func TestPruneKeepsStructure(t *testing.T) {
	conv := toolTurn(12, 40_000)
	out, freed, note := Prune(conv, "openai/gpt-4", 8192)
	if freed == 0 {
		t.Fatal("a conversation this large should have prunable output")
	}
	if note == "" {
		t.Error("a prune that freed tokens must report what it did")
	}
	if len(out) != len(conv) {
		t.Fatalf("message count changed: %d → %d", len(conv), len(out))
	}
	for i := range out {
		if out[i].Role != conv[i].Role {
			t.Errorf("message %d changed role: %q → %q", i, conv[i].Role, out[i].Role)
		}
		if out[i].ToolCallID != conv[i].ToolCallID {
			t.Errorf("message %d lost its tool_call_id", i)
		}
		if out[i].Role != "tool" && out[i].Content != conv[i].Content {
			t.Errorf("message %d is not a tool result but its content changed", i)
		}
	}
	if llm.EstimateTokens(out) >= llm.EstimateTokens(conv) {
		t.Error("pruning did not reduce the estimate")
	}
	// The caller's slice must be untouched.
	for i := range conv {
		if conv[i].Content == prunedStub {
			t.Fatalf("Prune mutated the input at %d", i)
		}
	}
}

// TestPruneIsStable asserts a second pass finds nothing new, so a long session
// does not re-report the same reduction every turn.
func TestPruneIsStable(t *testing.T) {
	conv := toolTurn(12, 40_000)
	once, freed, _ := Prune(conv, "openai/gpt-4", 8192)
	if freed == 0 {
		t.Fatal("expected the first pass to prune")
	}
	if _, again, _ := Prune(once, "openai/gpt-4", 8192); again != 0 {
		t.Errorf("second pass pruned another %d tokens; should be stable", again)
	}
}

func firstRunes(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n]) + "…"
	}
	return s
}
