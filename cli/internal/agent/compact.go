package agent

import (
	"context"
	"fmt"
	"strings"

	"kaioken/internal/agent/events"
	"kaioken/internal/llm"
)

// Compaction.
//
// A conversation that outgrows the model's context window does not degrade —
// it stops, with a provider error, mid-task. Compaction trades the transcript
// for a summary of it: the system prompt survives, the recent turns survive
// verbatim, and everything older becomes a paragraph describing what happened.
//
// The session records this as an epoch. Everything after a compaction is a new
// context epoch: the model's view of history restarts there, even though the
// conversation the user sees does not.

// CompactSystem instructs the summarizing model. It is phrased around what a
// replacement assistant would need, because that is literally the job — the
// text it produces is all the next turn will know about everything before it.
// The structure is fixed so that what survives is predictable: goals and
// decisions always make it, prose color never does.
const CompactSystem = `Summarize the following coding-assistant conversation into a structured
brief a new assistant could use to seamlessly continue the task. Use exactly these markdown
sections, omitting any that would be empty:

## Goal
[what the user is trying to accomplish]

## Constraints & Preferences
- [requirements the user stated]

## Progress
### Done
- [completed work]
### In Progress
- [current work]
### Blocked
- [issues, if any]

## Key Decisions
- **[decision]**: [rationale]

## Next Steps
1. [what should happen next]

## Critical Context
- [facts needed to continue: commands, gotchas, code details]

Be factual and terse — this replaces the full transcript, so keep everything load-bearing and
nothing else. Do not list files read or modified; that is tracked separately. Output only the
sections, no preamble.`

// SummaryPrefix marks the injected summary message. Compaction is not hidden
// from the model: it is told that history was condensed, so it asks rather
// than assuming a detail it cannot find was never discussed.
const SummaryPrefix = "Summary of earlier conversation (compacted to save context):\n"

// keepRecentRatio is the share of usable context the preserved tail may take.
// Keeping recent turns verbatim is what makes a compaction feel seamless — the
// file just discussed is still there — but a tail that is itself most of the
// window defeats the exercise.
const keepRecentRatio = 0.25

// The tail budget is clamped at both ends. A ratio alone misbehaves at both
// extremes of the model range: a quarter of a million-token window is a
// 250k-token "tail" that shrinks nothing, and a quarter of a small one is too
// little to carry the turn under discussion.
const (
	minTailTokens = 2_000
	maxTailTokens = 8_000
)

// minCompactMessages is the shortest conversation worth compacting. Below
// this the summary would cost more tokens than the transcript it replaces.
const minCompactMessages = 6

// toolResultPreview caps how much of each tool result is shown to the
// summarizer. The full text is what made the conversation large; the first
// couple of thousand characters establish what was looked at and what it
// said, without re-reading it.
const toolResultPreview = 2000

// Settings, injectable from config. Zero values mean the built-in behavior;
// the front-end applies .kaioken/config.yaml once at startup rather than the
// agent package importing config.
var (
	compactionEnabled = true
	reserveOverride   = 0 // tokens held back for the reply; 0 = derive
	tailOverride      = 0 // verbatim tail budget; 0 = clamp by window
)

// SetCompactionSettings applies the user's compaction config. reserve and
// keepRecent of zero keep the built-in derivation.
func SetCompactionSettings(enabled bool, reserve, keepRecent int) {
	compactionEnabled = enabled
	reserveOverride = reserve
	tailOverride = keepRecent
}

// CompactionEnabled reports whether automatic compaction should run. Manual
// compaction ignores it.
func CompactionEnabled() bool { return compactionEnabled }

// Usable reports how much of a model's context window a conversation may
// occupy before the next turn is at risk.
//
// The reserve is not an arbitrary safety fraction — it is the space the turn
// about to run actually needs: the reply itself, plus room for the estimate to
// be wrong. Sizing it that way rather than as a flat percentage of the window
// matters most on large-context models, where a percentage would strand tens
// of thousands of tokens that were never going to be needed.
func Usable(model string, replyCeiling int) int {
	window := llm.ContextWindow(model)
	if replyCeiling <= 0 {
		replyCeiling = llm.DefaultMaxTokens
	}
	// EstimateTokens counts characters, not tokens, so it can run under the
	// truth. A tenth of the window absorbs that error at any scale.
	reserve := replyCeiling
	if slack := window / 10; slack > reserve {
		reserve = slack
	}
	if reserveOverride > 0 {
		reserve = reserveOverride
	}
	// The reserve may never take more than half the window. On a small model
	// the reply ceiling can equal or exceed the whole context — gpt-4 is 8k
	// either way — and an unclamped reserve would compute zero usable space,
	// which reads as "never reduce the context" and silently disables the
	// whole mechanism on exactly the models that need it most.
	if half := window / 2; reserve > half {
		reserve = half
	}
	return window - reserve
}

// ShouldCompact reports whether a conversation should be reduced before the
// next turn runs, and the estimate that decided it.
func ShouldCompact(conv []llm.Message, model string, replyCeiling int) (bool, int) {
	used := llm.EstimateTokens(conv)
	if len(conv) < minCompactMessages {
		return false, used
	}
	limit := Usable(model, replyCeiling)
	return limit > 0 && used > limit, used
}

// tailBudget is how many tokens of recent conversation survive a compaction
// verbatim.
func tailBudget(model string, replyCeiling int) int {
	if tailOverride > 0 {
		return tailOverride
	}
	budget := int(float64(Usable(model, replyCeiling)) * keepRecentRatio)
	if budget < minTailTokens {
		return minTailTokens
	}
	if budget > maxTailTokens {
		return maxTailTokens
	}
	return budget
}

// Compact summarizes the older part of a conversation and returns a
// replacement history: the original system prompt, a summary of what was
// dropped, and the most recent turns kept verbatim.
//
// It also returns a one-line note describing what happened, suitable for
// showing the user and for storing on the session epoch.
//
// Compaction is reported on the default event bus: compaction has no agent
// — the TUI and daemon both invoke it directly — so the process-wide bus is
// the one place every caller's subscribers already listen.
func Compact(ctx context.Context, client *llm.Client, conv []llm.Message, model string, replyCeiling int) (_ []llm.Message, _ string, err error) {
	events.Default.Emit(&events.Event{Type: events.CompactionStart})
	defer func() { events.Default.Emit(&events.Event{Type: events.CompactionEnd, Err: err}) }()
	if len(conv) < minCompactMessages {
		return conv, "", fmt.Errorf("conversation is too short to compact")
	}

	head, tail := splitForCompaction(conv, tailBudget(model, replyCeiling))
	if len(head) == 0 {
		return conv, "", fmt.Errorf("conversation is too short to compact")
	}

	summary, err := Summarize(ctx, client, head)
	if err != nil {
		return conv, "", err
	}
	// File tracking is deterministic, not delegated to the summarizer: the
	// paths come from the tool calls themselves, merged with whatever earlier
	// summaries already tracked, so the lists stay cumulative across repeated
	// compactions.
	reads, mods := fileOps(head)
	summary = withFileBlocks(summary, reads, mods)

	kept := make([]llm.Message, 0, len(tail)+3)
	if len(conv) > 0 && conv[0].Role == "system" {
		kept = append(kept, conv[0])
	}
	kept = append(kept, llm.Message{Role: "system", Content: SummaryPrefix + summary})
	// Carry the most recent mode switch across the boundary. A summary
	// describes the conversation in prose, which later turns cannot parse —
	// and this marker is how they know the session had a read-only phase. Lose
	// it and a compaction that lands between planning and building silently
	// costs the model the reminder that planning is over.
	if marker, ok := lastModeSwitch(head); ok {
		kept = append(kept, marker)
	}
	kept = append(kept, tail...)

	before, after := llm.EstimateTokens(conv), llm.EstimateTokens(kept)
	note := fmt.Sprintf("compacted %d messages → ~%d tokens (was ~%d)",
		len(conv)-len(kept), after, before)
	return kept, note, nil
}

// splitForCompaction divides a conversation into the part to summarize and the
// part to keep verbatim.
//
// The split may only fall on a user message. Chat APIs reject a tool result
// whose originating assistant message is missing, so cutting between an
// assistant's tool_calls and the tool replies that answer them produces a
// history the provider will not accept — a failure that would surface as an
// opaque 400 on the next turn rather than here.
func splitForCompaction(conv []llm.Message, tailBudget int) (head, tail []llm.Message) {
	// Never summarize the system prompt; it is carried over intact.
	start := 0
	if len(conv) > 0 && conv[0].Role == "system" {
		start = 1
	}

	// Walk back from the end collecting whole turns, and remember the last
	// boundary that still fit. Stopping at the first over-budget turn would
	// discard a long final exchange entirely.
	cut := len(conv)
	lastTurn := len(conv) // the newest user message, budget or not
	used := 0
	for i := len(conv) - 1; i > start; i-- {
		used += llm.EstimateTokens(conv[i : i+1])
		if conv[i].Role != "user" {
			continue
		}
		if lastTurn == len(conv) {
			lastTurn = i
		}
		if used > tailBudget {
			break
		}
		cut = i
	}

	// The newest turn is never summarized away, even when it alone blows the
	// budget. Compaction runs just before that turn is answered, so dropping
	// it would hand the model a summary of the question instead of the
	// question — it would answer a paraphrase, or ask what was meant.
	if cut == len(conv) && lastTurn < len(conv) {
		cut = lastTurn
	}

	// Leave at least one message to summarize; otherwise there is no head and
	// nothing was gained.
	if cut <= start {
		return nil, conv[start:]
	}
	return conv[start:cut], conv[cut:]
}

// Summarize renders a conversation as plain text and asks the model to
// condense it. Tool results are previewed rather than included in full: their
// bulk is what triggered compaction, and the summarizer only needs to know
// what was consulted, not to re-read it.
func Summarize(ctx context.Context, client *llm.Client, conv []llm.Message) (string, error) {
	var b strings.Builder
	for _, msg := range conv {
		switch msg.Role {
		case "system":
			// Skip the system prompt, but keep injected context updates and
			// earlier summaries — those record state changes (a mode switch, a
			// prior compaction) that the next assistant still needs.
			if strings.HasPrefix(msg.Content, SummaryPrefix) {
				b.WriteString("Earlier summary: " + strings.TrimPrefix(msg.Content, SummaryPrefix) + "\n")
			} else if strings.HasPrefix(msg.Content, contextUpdatePrefix) {
				b.WriteString(msg.Content + "\n")
			}
		case "user":
			// Reminders are stripped: they are Kaioken's own text, regenerated
			// every turn, and summarizing them would put the model's standing
			// instructions into the record as though the user had said them.
			b.WriteString("[User]: " + stripReminders(msg.Content) + "\n")
		case "assistant":
			if strings.TrimSpace(msg.Content) != "" {
				b.WriteString("[Assistant]: " + msg.Content + "\n")
			}
			if len(msg.ToolCalls) > 0 {
				calls := make([]string, 0, len(msg.ToolCalls))
				for _, tc := range msg.ToolCalls {
					calls = append(calls, tc.Function.Name+"("+clipLine(tc.Function.Arguments, 200)+")")
				}
				b.WriteString("[Assistant tool calls]: " + strings.Join(calls, "; ") + "\n")
			}
		case "tool":
			b.WriteString("[Tool result " + msg.Name + "]: " + clipLine(msg.Content, toolResultPreview) + "\n")
		}
	}
	if strings.TrimSpace(b.String()) == "" {
		return "", fmt.Errorf("nothing to summarize")
	}
	return client.Chat(ctx, CompactSystem, b.String())
}
