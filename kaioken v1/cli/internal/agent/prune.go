package agent

import (
	"fmt"
	"strings"

	"kaioken/internal/llm"
)

// Pruning.
//
// Compaction is the heavy answer to a full context: it costs an LLM call, and
// it trades the transcript for a paraphrase of it. Most of the time a much
// cheaper one works, because most of what fills a coding session's context is
// not conversation at all — it is the output of tools. Twenty file reads and a
// dozen searches, nearly all of them long since acted on.
//
// Pruning erases those outputs and leaves everything else exactly as it was.
// The messages stay, their positions stay, the tool_call_id pairing stays — so
// the history remains something the provider will accept — but the bodies of
// old tool results become a one-line stub. No model is consulted and nothing
// the user or the assistant actually said is touched.
//
// It runs first, and compaction only follows if it was not enough.

// prunedStub replaces an erased tool result. It says what happened, so the
// model reads a gap rather than an empty result and knows the remedy is to
// call the tool again.
const prunedStub = "[output pruned to free context — call the tool again if you still need it]"

// protectRecentTurns is how many trailing turns are never pruned. The current
// turn and the one before it are what the model is actively reasoning over;
// erasing a file it read ninety seconds ago is how an agent starts re-reading
// in a loop.
const protectRecentTurns = 2

// pruneProtectCap and pruneMinimumCap bound the budgets derived from the
// usable window, so the policy behaves on both a 32k model and a 1M one.
const (
	pruneProtectCap = 40_000
	pruneMinimumCap = 20_000
)

// pruneBudgets returns how many tokens of the newest tool output to leave
// alone, and the least amount worth erasing. Rewriting history is only worth
// it when it buys back a meaningful share of the window — below that the
// churn costs more in model confusion than it returns in space.
func pruneBudgets(model string, replyCeiling int) (protect, minimum int) {
	usable := Usable(model, replyCeiling)
	protect, minimum = usable/2, usable/8
	if protect > pruneProtectCap {
		protect = pruneProtectCap
	}
	if minimum > pruneMinimumCap {
		minimum = pruneMinimumCap
	}
	return protect, minimum
}

// Prune erases the bodies of old tool results, returning the rewritten
// conversation, how many tokens it freed, and a note for the user. When there
// is not enough to gain it returns the conversation untouched and freed == 0.
func Prune(conv []llm.Message, model string, replyCeiling int) ([]llm.Message, int, string) {
	protect, minimum := pruneBudgets(model, replyCeiling)

	// Walk backwards so "newest" is measured from the live end of the
	// conversation. Everything within the protected budget is passed over;
	// what remains beyond it is what nobody has looked at in a long time.
	victims := map[int]bool{}
	freed, seen, turns := 0, 0, 0
	for i := len(conv) - 1; i >= 0; i-- {
		msg := conv[i]
		if msg.Role == "user" {
			turns++
			continue
		}
		// Stop at an earlier compaction: everything before it is already a
		// summary, and there is nothing left there to reclaim.
		if msg.Role == "system" && strings.HasPrefix(msg.Content, SummaryPrefix) {
			break
		}
		if turns < protectRecentTurns || msg.Role != "tool" {
			continue
		}
		if msg.Content == prunedStub {
			continue // already pruned on an earlier pass
		}
		size := llm.EstimateTokens(conv[i : i+1])
		seen += size
		if seen <= protect {
			continue
		}
		victims[i] = true
		freed += size
	}

	if freed < minimum || len(victims) == 0 {
		return conv, 0, ""
	}

	// Copy rather than mutate: the caller's slice is the live conversation and
	// may also be referenced by the session about to be saved.
	out := make([]llm.Message, len(conv))
	copy(out, conv)
	for i := range victims {
		out[i].Content = prunedStub
	}
	note := fmt.Sprintf("pruned %d stale tool results → freed ~%d tokens", len(victims), freed)
	return out, freed, note
}
