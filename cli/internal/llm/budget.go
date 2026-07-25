package llm

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// Credit budgeting.
//
// OpenRouter charges against a *reserved* amount, not the actual reply length:
// it multiplies max_tokens by the model's output price and refuses the request
// outright — HTTP 402 — if the balance cannot cover that reservation. A model
// with a 32k output ceiling therefore becomes unusable on a small balance even
// when every reply would be a few hundred tokens.
//
// Two things fix that. We always send an explicit max_tokens, so the
// reservation is a number we chose rather than the model's maximum. And when a
// 402 comes back anyway, the provider states what it *would* have accepted —
// so we take that number, remember it for the rest of the session, and retry.

// DefaultMaxTokens is the reply ceiling used when nothing else is configured.
// Generous enough for a long wiki chapter, small enough to stay affordable on
// a modest balance.
const DefaultMaxTokens = 8192

// minTokenCeiling is the floor below which a request is not worth sending: a
// reply that short cannot carry a useful chapter, and the real problem is an
// empty account.
const minTokenCeiling = 512

// tokenCeiling is the cap to send on the next request: whatever was
// configured, lowered to anything the provider has told us it will accept.
func (c *Client) tokenCeiling() int {
	c.budgetMu.Lock()
	defer c.budgetMu.Unlock()

	want := c.MaxTokens
	if want <= 0 {
		want = DefaultMaxTokens
	}
	if c.budgetCap > 0 && c.budgetCap < want {
		return c.budgetCap
	}
	return want
}

// learnCeiling records an affordability limit reported by the provider so the
// remaining calls in a run do not each have to rediscover it. It only ever
// ratchets downward.
func (c *Client) learnCeiling(n int) {
	c.budgetMu.Lock()
	defer c.budgetMu.Unlock()
	if n > 0 && (c.budgetCap == 0 || n < c.budgetCap) {
		c.budgetCap = n
	}
}

// affordableRe matches the ceiling out of OpenRouter's 402 body, e.g.
// "You requested up to 32768 tokens, but can only afford 10757".
var affordableRe = regexp.MustCompile(`can only afford (\d+)`)

// affordableTokens reports the ceiling a 402 says the account can cover.
// The response embeds earlier attempts under "previous_errors", each with its
// own number, so the smallest one is the only safe choice.
func affordableTokens(err error) (int, bool) {
	if err == nil {
		return 0, false
	}
	s := err.Error()
	if !strings.Contains(s, "402") {
		return 0, false
	}
	best := 0
	for _, m := range affordableRe.FindAllStringSubmatch(s, -1) {
		n, convErr := strconv.Atoi(m[1])
		if convErr != nil || n <= 0 {
			continue
		}
		if best == 0 || n < best {
			best = n
		}
	}
	if best < minTokenCeiling {
		return 0, false
	}
	return best, true
}

// withMaxTokens rewrites a marshalled request body to carry a max_tokens cap.
// It works on the raw JSON so both the plain and tool-calling request shapes go
// through one path; a body that cannot be parsed is passed through untouched
// rather than failing the call.
func withMaxTokens(body []byte, n int) []byte {
	if n <= 0 {
		return body
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(body, &m); err != nil {
		return body
	}
	m["max_tokens"] = json.RawMessage(strconv.Itoa(n))
	out, err := json.Marshal(m)
	if err != nil {
		return body
	}
	return out
}

// creditError turns a 402 into something a user can act on. The raw body is a
// wall of nested JSON listing every upstream provider that declined, which
// tells the reader nothing they can use.
func creditError(err error, ceiling int) error {
	if err == nil {
		return nil
	}
	if !strings.Contains(err.Error(), "402") {
		return err
	}
	msg := fmt.Sprintf("out of credits: the account cannot cover a %d-token reply", ceiling)
	if n, ok := affordableTokens(err); ok {
		msg += fmt.Sprintf(" (it can afford about %d)", n)
	}
	return fmt.Errorf("%s — add credits at openrouter.ai/settings/credits, "+
		"or lower max_tokens in .kaioken/config.yaml", msg)
}
