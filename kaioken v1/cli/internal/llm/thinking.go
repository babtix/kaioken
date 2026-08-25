package llm

// Reasoning ("thinking") levels.
//
// Reasoning models trade tokens for depth, and the right depth is the
// user's call: a rename does not need what an architecture review needs.
// The client carries one requested level and translates it into whatever
// dialect the active endpoint speaks. Hosts with no known dialect get
// nothing — an unknown key is a 400 on a strict gateway, and a silently
// dropped request is worse than a shallower answer.

import (
	"encoding/json"
	"strings"
)

// ThinkingLevels are the accepted values for Client.Thinking, in order.
var ThinkingLevels = []string{"off", "low", "medium", "high"}

// ValidThinkingLevel reports whether s names a level.
func ValidThinkingLevel(s string) bool {
	s = strings.ToLower(strings.TrimSpace(s))
	for _, l := range ThinkingLevels {
		if s == l {
			return true
		}
	}
	return false
}

// anthropicThinkingBudgets maps a level to Anthropic's budget_tokens.
// The minimum Anthropic accepts is 1024.
var anthropicThinkingBudgets = map[string]int{
	"low":    4_096,
	"medium": 10_240,
	"high":   24_576,
}

// withThinking rewrites a request body to ask for the client's reasoning
// level, in the dialect of the active endpoint. ceiling is the max_tokens
// already applied to the body — Anthropic requires the thinking budget to
// fit inside it. Unknown hosts and level "off" leave the body untouched.
func (c *Client) withThinking(body []byte, ceiling int) []byte {
	level := strings.ToLower(strings.TrimSpace(c.Thinking))
	if level == "" || level == "off" {
		return body
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(body, &m); err != nil {
		return body
	}
	switch {
	case c.Protocol == protocolAnthropic:
		budget := anthropicThinkingBudgets[level]
		if budget == 0 {
			return body
		}
		// The budget must leave room for the visible answer inside
		// max_tokens; Anthropic rejects budgets at or above the ceiling.
		if ceiling > 0 && budget >= ceiling {
			budget = ceiling / 2
		}
		if budget < 1024 {
			return body // no room to think on this ceiling
		}
		m["thinking"], _ = json.Marshal(map[string]any{"type": "enabled", "budget_tokens": budget})
		// Anthropic requires default temperature with extended thinking.
		delete(m, "temperature")
	case strings.Contains(c.BaseURL, "openrouter.ai"):
		m["reasoning"], _ = json.Marshal(map[string]string{"effort": level})
	case strings.Contains(c.BaseURL, "api.openai.com"):
		m["reasoning_effort"], _ = json.Marshal(level)
	default:
		return body
	}
	out, err := json.Marshal(m)
	if err != nil {
		return body
	}
	return out
}
