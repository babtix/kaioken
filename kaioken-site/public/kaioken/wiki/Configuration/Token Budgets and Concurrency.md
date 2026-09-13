# Token Budgets and Concurrency

This chapter explains how Kaioken manages token usage and concurrency for LLM interactions, focusing on configuration-driven controls that prevent rate limits, credit exhaustion, and context overflow. It covers model-specific concurrency clamping for free tiers, dynamic token budgeting based on provider feedback, and input token limits for knowledge generation.

## Table of Contents
- [Configuration-Driven Concurrency Limits](#configuration-driven-concurrency-limits)
- [Token Budgeting for Output Tokens](#token-budgeting-for-output-tokens)
- [Input Token Management via MaxModuleTokens](#input-token-management-via-maxmoduletokens)
- [Interaction Between Concurrency and Token Budgeting](#interaction-between-concurrency-and-token-budgeting)
- [Default Configuration and Validation](#default-configuration-and-validation)
- [Referenced Files](#referenced-files)

## Configuration-Driven Concurrency Limits

Kaioken controls parallel LLM requests through the `Concurrency` field in the repository configuration, but automatically adjusts this value for free-tier models to avoid rate limits (HTTP 429). The adjustment happens in `EffectiveConcurrency`, which returns the actual parallelism to use and whether it was clamped.

`internal/config/config.go:85-87`
```go
// IsFreeModel reports whether a model id names a provider's free tier, which
// OpenRouter and others mark with a ":free" suffix.
func IsFreeModel(model string) bool {
	return strings.HasSuffix(strings.ToLower(strings.TrimSpace(model)), ":free")
}
```

`internal/config/config.go:93-102`
```go
// EffectiveConcurrency is the parallelism to actually use for a model. Free
// tiers enforce tight per-minute limits, so fanning out the configured four
// requests at once mostly buys 429s and backoff — those get capped instead.
// Returns the limit and whether it was clamped, so callers can say so.
func (c *Config) EffectiveConcurrency(model string) (limit int, clamped bool) {
	n := c.Concurrency
	if n < 1 {
		n = 1
	}
	if IsFreeModel(model) && n > FreeModelConcurrency {
		return FreeModelConcurrency, true
	}
	return n, false
}
```

**Key behaviors:**
- For non-free models, the configured `Concurrency` is used directly (with a minimum of 1).
- For free models (identified by the `:free` suffix), `Concurrency` is clamped to `FreeModelConcurrency` (value 2) if the configured value exceeds this limit.
- The function returns a boolean `clamped` so callers can log or warn about the adjustment.
- `FreeModelConcurrency` is a package-level constant set to 2.

`internal/config/config.go:81`
```go
// FreeModelConcurrency caps parallel requests against a provider's free tier.
const FreeModelConcurrency = 2
```

This mechanism prevents overwhelming free-tier endpoints with excessive parallel requests while allowing paid models to utilize the full configured concurrency.

## Token Budgeting for Output Tokens

Kaioken dynamically adjusts the maximum output tokens per LLM request to avoid credit exhaustion errors (HTTP 402) from providers like OpenRouter. When a request fails due to insufficient credits, the provider returns the maximum affordable token count, which Kaioken remembers for subsequent requests.

`internal/llm/budget.go:27-28`
```go
// DefaultMaxTokens is the reply ceiling used when nothing else is configured.
// Generous enough for a long wiki chapter, small enough to stay affordable on
// a modest balance.
const DefaultMaxTokens = 8192
```

`internal/llm/budget.go:32`
```go
// minTokenCeiling is the floor below which a request is not worth sending: a
// reply that short cannot carry a useful chapter, and the real problem is an
// empty account.
const minTokenCeiling = 512
```

`internal/llm/budget.go:36-48`
```go
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
```

`internal/llm/budget.go:53-59`
```go
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
```

`internal/llm/budget.go:68-90`
```go
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
```

**Key behaviors:**
- `tokenCeiling()` returns the effective max tokens for the next request:
  - Uses `c.MaxTokens` if positive, otherwise `DefaultMaxTokens` (8192).
  - If a learned budget cap (`c.budgetCap`) exists and is lower than the configured value, returns the budget cap.
- `learnCeiling()` updates the budget cap only when a new affordable token count is lower than the current cap (or if no cap exists), ensuring the cap only decreases over time.
- `affordableTokens()` parses 402 error messages to extract the maximum affordable token count, returning 0 if:
  - The error is not a 402.
  - The extracted number is invalid or ≤0.
  - The number is below `minTokenCeiling` (512), indicating the account is too low for useful requests.
- The system is provider-specific: it only activates for errors matching OpenRouter's 402 format (e.g., "You requested up to 32768 tokens, but can only afford 10757").

When a 402 error occurs, the calling code (not shown in `budget.go`) should:
1. Extract the affordable token count via `affordableTokens`.
2. Pass that count to `learnCeiling` to reduce future request sizes.
3. Present a user-friendly error via `creditError` (see below).

`internal/llm/budget.go:115-128`
```go
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
```

This function formats 402 errors to suggest either adding credits or reducing `max_tokens` in the config, including the affordable token count when available.

## Input Token Management via MaxModuleTokens

While token budgeting controls output tokens, Kaioken separately limits input tokens (context size) for knowledge generation tasks via the `MaxModuleTokens` configuration. This prevents excessive context window usage and reduces input costs.

`internal/config/config.go:18-41`
```go
// Config is the user-editable configuration for one target repository.
type Config struct {
	Version int `yaml:"version"`
	// Model is a model id, e.g. "anthropic/claude-sonnet-4.5".
	Model string `yaml:"model"`
	// Provider names an entry in llm.Providers (openrouter, openai, groq, …).
	Provider string `yaml:"provider"`
	// BaseURL, when non-empty, overrides the provider's default endpoint
	// (useful for self-hosted / OpenAI-compatible gateways).
	BaseURL string `yaml:"base_url"`
	// Concurrency is the number of modules generated in parallel.
	Concurrency int `yaml:"concurrency"`
	// MaxModuleTokens caps the source context bundled per module (approx tokens).
	MaxModuleTokens int `yaml:"max_module_tokens"`
	// MaxTokens caps the reply length. It is a spending control as much as a
	// length one: providers reserve credit for the full ceiling before running
	// the request, so an unset cap can make a large-context model unaffordable
	// even when every reply is short. Zero falls back to llm.DefaultMaxTokens.
	MaxTokens int   `yaml:"max_tokens,omitempty"`
	Scope     Scope `yaml:"scope"`
	// Notes are steering instructions injected verbatim into every LLM prompt.
	// This is the human-in-the-loop channel

<!-- kaioken:files internal/llm/budget.go,internal/config/config.go -->
