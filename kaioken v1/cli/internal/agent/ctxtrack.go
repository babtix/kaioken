package agent

// Context measurement.
//
// Every compaction decision rests on one number: how much of the model's
// window the conversation currently occupies. Kaioken used to derive it by
// counting characters and dividing — an estimate that is wrong in both
// directions and, worse, wrong in ways that vary by content. Code tokenizes
// far denser than prose. Tool schemas are sent on every request and appear
// nowhere in the message text being counted. Cached prompt prefixes are billed
// and occupy the window but look identical to uncached ones.
//
// The provider already knows the answer and reports it with every response. So
// the number to trust is that one, and the only thing worth estimating is what
// has been appended since it was measured — usually a couple of tool results.
// pi does exactly this (estimateContextTokens: anchor on the last assistant
// message's reported usage, estimate the trailing messages); opencode reads the
// same figure off the last assistant message. Both count cache traffic toward
// the total, which is why LastContextTokens includes it.
//
// The tracker is shared across turns like BudgetGuard, because the Agent value
// is rebuilt for each one. Sub-agents deliberately get a nil tracker: they run
// a different, much smaller conversation on the same client, and letting their
// measurements land here would tell the parent its context had shrunk.

import (
	"sync"

	"kaioken/internal/llm"
)

// ContextTracker remembers the last provider-reported context size and which
// prefix of the conversation it described. The zero value is usable and simply
// has no anchor yet. All methods are nil-safe: a nil tracker degrades to pure
// estimation, which is what sub-agents and tests get.
type ContextTracker struct {
	mu     sync.Mutex
	tokens int  // provider-reported size of the conversation at the anchor
	at     int  // len(history) when the measurement was taken
	print  int  // fingerprint of conv[:at] when the measurement was taken
	known  bool // whether a measurement has been recorded at all
}

// fingerprint is a cheap signature of a message range: enough to notice that
// the range was rewritten, not enough to tell what it says.
//
// This is what lets the anchor validate itself. Half a dozen code paths
// replace or rewrite the conversation — compaction, pruning, branch switching,
// resume, undo — and requiring each to remember to invalidate the anchor is a
// rule that will be broken by the next one added. Comparing the prefix instead
// means a stale anchor is detected rather than declared.
func fingerprint(conv []llm.Message) int {
	n := 0
	for i := range conv {
		n += len(conv[i].Content) + len(conv[i].Role) + len(conv[i].ToolCallID)
		for _, tc := range conv[i].ToolCalls {
			n += len(tc.Function.Name) + len(tc.Function.Arguments)
		}
	}
	return n
}

// Record stores a measurement taken against the first n messages of conv.
// Calls with no usage figure are ignored, leaving any earlier anchor in place.
func (t *ContextTracker) Record(tokens, n int, conv []llm.Message) {
	if t == nil || tokens <= 0 || n > len(conv) {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.tokens, t.at, t.print, t.known = tokens, n, fingerprint(conv[:n]), true
}

// Reset drops the anchor. Estimate detects a rewritten conversation on its
// own, so this is only for changes it cannot see — switching models, where the
// tokenizer itself changes and an old figure describes nothing.
func (t *ContextTracker) Reset() {
	if t == nil {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.known = false
}

// Estimate reports the conversation's size in tokens, and whether the figure
// is anchored on a provider measurement rather than derived entirely from
// character counts.
//
// The anchor is used only while it still describes this conversation's prefix.
// If the conversation grew shorter than the anchor point, or the prefix no
// longer matches the one that was measured, the measurement describes messages
// that are gone and estimating the whole thing is the honest answer.
func (t *ContextTracker) Estimate(conv []llm.Message) (int, bool) {
	if t == nil {
		return llm.EstimateTokens(conv), false
	}
	t.mu.Lock()
	tokens, at, print, known := t.tokens, t.at, t.print, t.known
	t.mu.Unlock()

	if !known || at > len(conv) || fingerprint(conv[:at]) != print {
		return llm.EstimateTokens(conv), false
	}
	return tokens + llm.EstimateTokens(conv[at:]), true
}
