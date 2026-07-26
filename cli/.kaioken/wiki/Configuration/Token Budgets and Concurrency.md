# Configuration

This chapter explains how Kaioken manages configuration for a repository, covering the per-repo configuration file, default values, and how settings control LLM providers, models, token budgets, and behavior toggles.

Kaioken uses a per-repo configuration file (`.kaioken/config.yaml`) to store user-editable settings. The application also provides sensible defaults (defined in `config.Default()`) for any omitted values.

## Table of Contents
- [Configuration File Structure](#configuration-file-structure)
- [Configuration-Driven Concurrency Limits](#configuration-driven-concurrency-limits)
- [Token Budgeting for Output Tokens](#token-budgeting-for-output-tokens)
- [Input Token Management via MaxModuleTokens](#input-token-management-via-maxmoduletokens)
- [Interaction Between Concurrency and Token Budgeting](#interaction-between-concurrency-and-token-budgeting)
- [Default Configuration and Validation](#default-configuration-and-validation)
- [Referenced Files](#referenced-files)

## Configuration File Structure

The configuration is stored in `.kaioken/config.yaml` within the target repository. The file defines the following fields:

- `Version`: Configuration schema version (currently 1).
- `Model`: The model identifier (e.g., `"anthropic/claude-sonnet-4.5"`).
- `Provider`: The LLM provider to use (e.g., `"openrouter"`, `"openai"`, `"groq"`).
- `BaseURL`: Optional override for the provider's API endpoint (useful for self-hosted or OpenAI-compatible gateways).
- `Concurrency`: The number of modules to process in parallel.
- `MaxModuleTokens`: The maximum input tokens (approximate) to bundle per module for knowledge generation.
- `MaxTokens`: The maximum output tokens for LLM replies. A value of 0 falls back to the default (8192).
- `Scope`: Controls which files are scanned:
  - `Include`: Path prefixes to restrict scanning to (if non-empty).
  - `Exclude`: Path globs/prefixes to skip (in addition to `.gitignore` and built-in exclusions).
- `Notes`: A list of strings that are injected verbatim into every LLM prompt, used for steering instructions, conventions, warnings, and guardrails.

Default values are applied when the configuration file omits a field or sets it to a zero value. See [Default Configuration and Validation](#default-configuration-and-validation) for details.

## Configuration-Driven Concurrency Limits

Kaioken controls parallel LLM requests through the `Concurrency` field in the repository configuration, but automatically adjusts this value for free-tier models to avoid rate limits (HTTP 429). The adjustment happens in `EffectiveConcurrency`, which returns the actual parallelism to use and whether it was clamped.

`cli/internal/config/config.go:85-87`
```go
// IsFreeModel reports whether a model id names a provider's free tier, which
// OpenRouter and others mark with a ":free" suffix.
func IsFreeModel(model string) bool {
	return strings.HasSuffix(strings.ToLower(strings.TrimSpace(model)), ":free")
}
```

`cli/internal/config/config.go:93-102`
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

`cli/internal/config/config.go:81`
```go
// FreeModelConcurrency caps parallel requests against a provider's free tier.
const FreeModelConcurrency = 2
```

This mechanism prevents overwhelming free-tier endpoints with excessive parallel requests while allowing paid models to utilize the full configured concurrency.

## Token Budgeting for Output Tokens

Kaioken dynamically adjusts the maximum output tokens per LLM request to avoid credit exhaustion errors (HTTP 402) from providers like OpenRouter. When a request fails due to insufficient credits, the provider returns the maximum affordable token count, which Kaioken remembers for subsequent requests.

`cli/internal/llm/budget.go:27-28`
```go
// DefaultMaxTokens is the reply ceiling used when nothing else is configured.
// Generous enough for a long wiki chapter, small enough to stay affordable on
// a modest balance.
const DefaultMaxTokens = 8192
```

`cli/internal/llm/budget.go:32`
```go
// minTokenCeiling is the floor below which a request is not worth sending: a
// reply that short cannot carry a useful chapter, and the real problem is an
// empty account.
const minTokenCeiling = 512
```

`cli/internal/llm/budget.go:36-48`
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

`cli/internal/llm/budget.go:53-59`
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

`cli/internal/llm/budget.go:63`
```go
// affordableRe matches the ceiling out of OpenRouter's 402 body, e.g.
// "You requested up to 32768 tokens, but can only afford 10757".
var affordableRe = regexp.MustCompile(`can only afford (\d+)`)
```

`cli/internal/llm/budget.go:68-90`
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
		< minTokenCeiling {
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

`cli/internal/llm/budget.go:115-128`
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

`cli/internal/config/config.go:18-41`
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
	// This is the human-in-the-loop channel: conventions the code alone does
	// not state, warnings, and "do not do X" guardrails.
	Notes []string `yaml:"notes"`
}
```

**Key behaviors:**
- `MaxModuleTokens` sets the approximate token limit for source code context included in each knowledge generation prompt.
- Lower values reduce input costs and context window pressure but may reduce the amount of code the model can see per module.
- The configuration loader enforces a minimum value of 4000 tokens (see [Default Configuration and Validation](#default-configuration-and-validation)).

## Interaction Between Concurrency and Token Budgeting

The concurrency limits and token budgeting systems work together to manage LLM resource usage:
- Concurrency controls how many LLM requests run in parallel.
- Token budgeting controls the size of each request's output.
- For free-tier models, concurrency is clamped to prevent rate limits, while token budgeting protects against credit exhaustion.
- Adjusting one may affect the other: lower concurrency reduces parallel load but may increase total time, while lower token ceilings reduce per-request cost but may require more requests for the same output.

## Default Configuration and Validation

The `Default()` function provides a baseline configuration that is merged with user settings from `.kaioken/config.yaml`. During loading, values are validated and corrected if necessary.

`cli/internal/config/config.go:63-78`
```go
// Default returns a fresh config with sensible defaults.
func Default() *Config {
	return &Config{
		Version:         1,
		Model:           "nvidia/nemotron-3-ultra-550b-a55b:free",
		Provider:        "openrouter",
		Concurrency:     4,
		MaxModuleTokens: 60000,
		Scope: Scope{
			Exclude: []string{
				"**/*.lock", "**/pnpm-lock.yaml", "**/package-lock.json",
				"**/uv.lock", "**/*.min.js", "**/*.map",
			},
		},
		Notes: []string{},
	}
}
```

`cli/internal/config/config.go:110-129`
```go
// Load reads the config for a repo, returning a helpful error if missing.
func Load(repo string) (*Config, error) {
	raw, err := os.ReadFile(Path(repo))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("no %s/config.yaml found in %s — run `kaioken init` first", Dir, repo)
		}
		return nil, err
	}
	cfg := Default()
	if err := yaml.Unmarshal(raw, cfg); err != nil {
		return nil, fmt.Errorf("parsing %s: %w", Path(repo), err)
	}
	if cfg.Concurrency < 1 {
		cfg.Concurrency = 1
	}
	if cfg.MaxModuleTokens < 4000 {
		cfg.MaxModuleTokens = 4000
	}
	return cfg, nil
}
```

**Validation rules:**
- `Concurrency` is forced to at least 1.
- `MaxModuleTokens` is forced to at least 4000 tokens to ensure useful context for knowledge generation.
- All other fields use the zero-value defaults from `Default()` if not set or invalid.

## Referenced Files
- `cli/internal/config/config.go`
- `cli/internal/llm/budget.go`

<!-- kaioken:files internal/llm/budget.go,internal/config/config.go -->
