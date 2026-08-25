package llm

import "strings"

// Token accounting.
//
// Nothing here talks to a tokenizer. A conversation only needs to be measured
// well enough to answer one question — "is this close to overflowing the
// model's context window?" — and for that a character-count heuristic is both
// accurate enough and free. Being wrong by 15% just moves the compaction
// trigger slightly; being wrong by an order of magnitude would not happen
// because the ratio of characters to tokens is stable across English prose,
// source code, and JSON alike.

// charsPerToken is the divisor used to turn a character count into a token
// estimate. Real tokenizers average ~3.6 on prose and ~3 on dense source; 3.5
// keeps the estimate mildly conservative, which is the direction that errs
// toward compacting a little early rather than overflowing.
const charsPerToken = 3.5

// messageOverhead is the per-message cost of the role/delimiter scaffolding
// every chat API wraps around content before it reaches the model.
const messageOverhead = 4

// EstimateTokens approximates how many tokens a conversation occupies. Tool
// calls count too: a model that requested a large edit_file carries that whole
// argument blob in its history, and ignoring it is how a conversation silently
// grows past the window.
func EstimateTokens(messages []Message) int {
	total := 0
	for _, msg := range messages {
		total += messageOverhead + estimateText(msg.Content)
		if msg.Name != "" {
			total += estimateText(msg.Name)
		}
		for _, tc := range msg.ToolCalls {
			total += messageOverhead
			total += estimateText(tc.Function.Name)
			total += estimateText(tc.Function.Arguments)
		}
	}
	return total
}

// EstimateTextTokens approximates the token cost of a single string.
func EstimateTextTokens(s string) int { return estimateText(s) }

func estimateText(s string) int {
	if s == "" {
		return 0
	}
	return int(float64(len(s))/charsPerToken) + 1
}

// DefaultContextWindow is assumed when a model's real window is unknown. It is
// deliberately modest: guessing small means compacting a conversation that did
// not strictly need it, while guessing large means a hard provider error the
// user cannot recover from without losing the turn.
const DefaultContextWindow = 32_000

// contextWindows maps a substring of a model id to that family's context
// window in tokens. Matching is by substring because ids carry provider
// prefixes and version suffixes ("anthropic/claude-sonnet-4.5",
// "openai/gpt-4o-mini-2024-07-18") that a table of exact ids cannot track.
//
// Entries are ordered longest-key-first at lookup time, so a specific match
// ("gpt-4o-mini") wins over a generic one ("gpt-4").
var contextWindows = map[string]int{
	"claude":        200_000,
	"claude-sonnet": 200_000,
	"claude-opus":   200_000,
	"claude-haiku":  200_000,
	"gpt-4o":        128_000,
	"gpt-4-turbo":   128_000,
	"gpt-4.1":       1_000_000,
	"gpt-5":         400_000,
	"gpt-4":         8_192,
	"o1":            200_000,
	"o3":            200_000,
	"gemini":        1_000_000,
	"llama-3.1":     128_000,
	"llama-3.3":     128_000,
	"llama":         8_192,
	"mistral":       32_000,
	"mixtral":       32_000,
	"qwen":          32_000,
	"deepseek":      64_000,
	"nemotron":      128_000,
	"grok":          128_000,
	"command-r":     128_000,
}

// ContextWindow reports the usable context window for a model id, falling back
// to DefaultContextWindow when the family is not recognized.
func ContextWindow(model string) int {
	id := strings.ToLower(model)
	best, bestLen := 0, 0
	for key, window := range contextWindows {
		if len(key) > bestLen && strings.Contains(id, key) {
			best, bestLen = window, len(key)
		}
	}
	if best == 0 {
		return DefaultContextWindow
	}
	return best
}
