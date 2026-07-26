# Configuration Structure and Key Settings

Kaioken uses a two-layer configuration system: global user settings and per-repository settings. The global configuration stores API keys and default provider/model selections, while the per-repository configuration controls scanning, planning, and generation behavior for a specific repository.

## Table of Contents
- [Global Configuration](#global-configuration)
- [Per-Repository Configuration](#per-repository-configuration)
- [Configuration Loading and Saving](#configuration-loading-and-saving)
- [Behavior Toggles and Helper Functions](#behavior-toggles-and-helper-functions)
- [Referenced Files](#referenced-files)

## Global Configuration

The `Global` struct (in `cli/internal/config/global.go`) holds user-specific settings that persist across repositories and sessions. It is stored at `$HOME/.kaioken/config.yaml` (or customized via `KAIOKEN_HOME`) and contains sensitive data like API keys that should never be committed to a repository.

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

The `Config` struct (in `cli/internal/config/config.go`) defines settings for a specific repository, stored at `.kaioken/config.yaml` inside the repository root. This file is intended to be committed to version control (excluding the global keys).

### Config Struct Fields

| Field | Type | YAML Tag | Description |
|-------|------|----------|-------------|
| `Version` | int | `version` | Configuration schema version (currently fixed at 1). |
| `Model` | string | `model` | Model ID for LLM requests (e.g., `"nvidia/nemotron-3-ultra-550b-a55b:free"`). Overrides global default. |
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

The `DefaultExcludes` variable (in `cli/internal/config/config.go`) contains path patterns always skipped during scanning, regardless of repository configuration. This prevents scanning generated files, dependencies, and IDE directories:

```go
var DefaultExcludes = []string{
	".git", Dir, ".ainow", ".qoder", "node_modules", "dist", "build", "out",
	".venv", "venv", "__pycache__

<!-- kaioken:files internal/config/config.go,internal/config/global.go -->
