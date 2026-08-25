# Configuration Structure and Key Settings

Kaioken uses a two-layer configuration system: global user settings and per-repository settings. The global configuration stores API keys and default provider/model selections, while the per-repository configuration controls scanning, planning, and generation behavior for a specific repository.

## Table of Contents
- [Global Configuration](#global-configuration)
- [Per-Repository Configuration](#per-repository-configuration)
- [Configuration Loading and Saving](#configuration-loading-and-saving)
- [Behavior Toggles and Helper Functions](#behavior-toggles-and-helper-functions)
- [Referenced Files](#referenced-files)

## Global Configuration

The `Global` struct (in `internal/config/global.go`) holds user-specific settings that persist across repositories and sessions. It is stored at `$HOME/.config/kaioken/config.yaml` (or customized via `KAIOKEN_HOME`) and contains sensitive data like API keys that should never be committed to a repository.

### Global Struct Fields

| Field | Type | YAML Tag | Description |
|-------|------|----------|-------------|
| `DefaultProvider` | string | `default_provider,omitempty` | Default LLM provider (e.g., `"openrouter"`) used when no provider is specified in repo config. |
| `DefaultModel` | string | `default_model,omitempty` | Default model ID (e.g., `"anthropic/claude-sonnet-4.5"`) used when no model is specified in repo config. |
| `Keys` | map[string]string | `keys,omitempty` | Map of provider names to API keys. Keys are stored exclusively here to prevent accidental commits. |

### Global Configuration Functions

- `GlobalPath()`: Returns the absolute path to the global config file, respecting `KAIOKEN_HOME` if set, otherwise using `$HOME/.kaioken/config.yaml`.
- `LoadGlobal()`: Loads the global config from disk. Returns an empty `Global` struct (with initialized `Keys` map) if the file doesn't exist or is invalid.
- `(g *Global) Save() error`: Saves the global config with restrictive permissions (0o600) because it contains API keys. Creates the config directory if needed and prepends a header comment warning against committing the file.

## Per-Repository Configuration

The `Config` struct (in `internal/config/config.go`) defines settings for a specific repository, stored at `.kaioken/config.yaml` inside the repository root. This file is intended to be committed to version control (excluding the global keys).

### Config Struct Fields

| Field | Type | YAML Tag | Description |
|-------|------|----------|-------------|
| `Version` | int | `version` | Configuration schema version (currently fixed at 1). |
| `Model` | string | `model` | Model ID for LLM requests (e.g., `"anthropic/claude-sonnet-4.5"`). Overrides global default. |
| `Provider` | string | `provider` | LLM provider name (must match an entry in `llm.Providers`, e.g., `"openrouter"`). Overrides global default. |
| `BaseURL` | string | `base_url` | Optional override for the provider's API endpoint (useful for self-hosted or OpenAI-compatible gateways). |
| `Concurrency` | int | `concurrency` | Desired number of modules to process in parallel. May be clamped for free-tier models (see `EffectiveConcurrency`). |
| `MaxModuleTokens` | int | `max_module_tokens` | Maximum approximate token count for source context bundled per module. Minimum enforced at 4000 during load. |
| `MaxTokens` | int | `max_tokens,omitempty` | Maximum token count for LLM replies. Acts as a spending control: providers reserve credit for the full ceiling. Zero falls back to `llm.DefaultMaxTokens`. |
| `Scope` | Scope | `scope` | Controls which files are considered part of the repository during scanning. |
| `Notes` | []string | `notes` | Human-provided steering instructions injected verbatim into every LLM prompt for conventions, guardrails, or domain-specific guidance. |

### Scope Struct Fields

| Field | Type | YAML Tag | Description |
|-------|------|----------|-------------|
| `Include` | []string | `include` | If non-empty, restricts scanning to files under these path prefixes (overrides default exclusion logic). |
| `Exclude` | []string | `exclude` | Additional path globs/prefixes to skip (beyond `.gitignore` and `DefaultExcludes`). |

### Default Excludes

The `DefaultExcludes` variable (in `internal/config/config.go`) contains path patterns always skipped during scanning, regardless of repository configuration. This prevents scanning generated files, dependencies, and IDE directories:

```go
var DefaultExcludes = []string{
	".git", Dir, ".ainow", ".qoder", "node_modules", "dist", "build", "out",
	".venv", "venv", "__pycache__", ".ruff_cache", ".pytest_cache",
	".mypy_cache", ".next", ".nuxt", "target", "vendor", "coverage",
	".idea", ".vscode", ".DS_Store",
}
```
*Note: `Dir` is `.kaioken` (the knowledge directory), preventing recursive scanning of generated wiki and cards.*

## Configuration Loading and Saving

### Global Configuration Flow
1. `LoadGlobal()` reads from `GlobalPath()` (respecting `KAIOKEN_HOME`).
2. On missing/invalid file, returns an empty `Global` struct with initialized `Keys` map.
3. `(g *Global) Save()` writes to the same path with 0o600 permissions after ensuring the directory exists.

### Per-Repository Configuration Flow
1. `Load(repo string)`:
   - Reads `.kaioken/config.yaml` from the repo root.
   - On missing file, returns error prompting `kaioken init`.
   - On invalid YAML, returns parse error.
   - Applies defaults from `Default()` then enforces:
     - `Concurrency` ≥ 1
     - `MaxModuleTokens` ≥ 4000
2. `(c *Config) Save(repo string)`:
   - Creates `.kaioken` directory if needed (0o755).
   - Writes config with header comment explaining `notes` usage.
   - Uses 0o644 permissions (safe for version control).

## Behavior Toggles and Helper Functions

### Free Model Concurrency Limiting
Free-tier models (identified by `:free` suffix) enforce stricter parallelism limits to avoid rate limits:

```go
const FreeModelConcurrency = 2

func IsFreeModel(model string) bool {
	return strings.HasSuffix(strings.ToLower(strings.TrimSpace(model)), ":free")
}

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
- **Usage**: Called by LLM provider implementations to determine actual parallelism.
- **Behavior**: If `Concurrency` > 2 for a free model, returns 2 and sets `clamped=true` (callers can log this clamping).
- **Example**: With `Concurrency: 4` and model `nvidia/nemotron-3-ultra-550b-a55b:free`, effective concurrency is 2.

### Token Budgeting
- `MaxModuleTokens`: Controls input context size per module during knowledge generation. Higher values increase cost and latency but provide more context.
- `MaxTokens`: Controls output length. Critical for cost management: providers reserve credit for the full `MaxTokens` before execution, so unset values with large-context models can be prohibitively expensive even for short replies.

### Scope Behavior
- During scanning (`scan.Repo`), files are included if:
  1. Not excluded by `.gitignore`
  2. Not in `DefaultExcludes`
  3. Not in `Config.Scope.Exclude`
  4. Either `Config.Scope.Include` is empty OR the file path has a prefix in `Config.Scope.Include`
- `Include` takes precedence when non-empty: only paths matching its prefixes are considered (after applying exclusions).

## Referenced Files
- `internal/config/global.go`
- `internal/config/config.go`

<!-- kaioken:files internal/config/config.go,internal/config/global.go -->
