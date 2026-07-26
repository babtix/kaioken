# Configuration Layers and Precedence

## Table of Contents
- [Global Configuration](#global-configuration)
- [Per-Repository Configuration](#per-repository-configuration)
- [CLI Flags and Environment Variables](#cli-flags-and-environment-variables)
- [Configuration Precedence](#configuration-precedence)
- [Referenced Files](#referenced-files)

## Global Configuration

The global configuration is stored in the user's home directory (or a custom directory via the `KAIOKEN_HOME` environment variable) and is intended to hold sensitive data such as API keys, as well as default values for the provider and model that apply across all repositories.

The global configuration is defined by the `Global` struct in `cli/internal/config/global.go`:

`cli/internal/config/global.go:14-18`
```go
type Global struct {
    DefaultProvider string            `yaml:"default_provider,omitempty"`
    DefaultModel    string            `yaml:"default_model,omitempty"`
    Keys            map[string]string `yaml:"keys,omitempty"` // provider → API key
}
```

The global configuration is loaded by `config.LoadGlobal()` and saved by `(g *Global) Save()`.

The file location is determined by `GlobalPath()`:
- If the environment variable `KAIOKEN_HOME` is set, it uses `$KAIOKEN_HOME/config.yaml`.
- Otherwise, it uses `$HOME/.kaioken/config.yaml`.

The global configuration is used primarily for:
- API keys: stored in the `Keys` map, keyed by provider name (e.g., "openrouter").
- Default provider and model: note that while these fields exist, they are not currently used in the LLM client setup (see below). The per-repo configuration (or its defaults) is used for the provider and model, with the global configuration only providing the API keys.

## Per-Repository Configuration

Each repository can have its own configuration file at `.kaioken/config.yaml` (relative to the repository root). This file is edited by the user (or created by `kaioken init`) and contains non-sensitive settings that steer the scanning, planning, and generation processes.

The per-repo configuration is defined by the `Config` struct in `cli/internal/config/config.go`:

`cli/internal/config/config.go:18-41`
```go
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
    // For free tier models (marked with ":free" suffix), the effective concurrency
    // may be clamped to avoid rate limits (see EffectiveConcurrency method).
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

The `Scope` struct controls which files are considered part of the repository:

`cli/internal/config/config.go:44-49`
```go
type Scope struct {
    // Include, when non-empty, restricts scanning to these path prefixes.
    Include []string `yaml:"include"`
    // Exclude lists path globs/prefixes skipped in addition to .gitignore.
    Exclude []string `yaml:"exclude"`
}
```

The per-repo configuration is loaded by `config.Load(repo string)` and saved by `(c *Config) Save(repo string) error`.

When the configuration file does not exist or cannot be read, `config.Load` returns an error. The `config.Default()` function provides a hardcoded default configuration that is used as a starting point before merging with the file contents (if present). The defaults include:

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

## CLI Flags and Environment Variables

The kaioken CLI accepts command-specific flags that can override configuration values for a single invocation. Additionally, environment variables are used to provide API keys when they are not present in the global configuration.

### Common CLI Flags

The following flags are available across multiple commands (as defined in the `flags` struct in `cli/cmd/kaioken/main.go`):

`cli/cmd/kaioken/main.go:131-141`
```go
// flags is a tiny flag parser: -key value pairs plus boolean -force, with a
// trailing positional (used by `models <filter>`).
type flags struct {
    repo       string
    model      string
    module     string
    base       string
    port       int
    force      bool
    positional string
    token      string
    tokenStdin bool
}
```

The flags are parsed by `parseFlags`:

`cli/cmd/kaioken/main.go:143-186`
```go
func parseFlags(argv []string) flags {
    f := flags{repo: "."}
    for i := 0; i < len(argv); i++ {
        switch argv[i] {
        case "-repo", "--repo":
            if i+1 < len(argv) {
                i++
                f.repo = argv[i]
            }
        case "-model", "--model":
            if i+1 < len(argv) {
                i++
                f.model = argv[i]
            }
        case "-module", "--module":
            if i+1 < len(argv) {
                i++
                f.module = argv[i]
            }
        case "-base", "--base":
            if i+1 < len(argv) {
                i++
                f.base = argv[i]
            }
        case "-port", "--port":
            if i+1 < len(argv) {
                i++
                fmt.Sscanf(argv[i], "%d", &f.port)
            }
        case "-force", "--force":
            f.force = true
        case "-token", "--token":
            if i+1 < len(argv) {
                i++
                f.token = argv[i]
            }
        case "-token-stdin", "--token-stdin":
            f.tokenStdin = true
        default:
            f.positional = argv[i]
        }
    }
    return f
}
```

### Environment Variables for API Keys

The usage message indicates that API keys can be provided via environment variables, specific to the provider:

```
Environment:
  OPENROUTER_API_KEY   (or the active provider's key env) — for plan/generate/models
```

In the `newClient` function (used by several commands to create an LLM client), the API key is resolved as follows:

`cli/cmd/kaioken/main.go:356-378`
```go
func newClient(cfg *config.Config, f flags) (*llm.Client, error) {
    model := cfg.Model
    if f.model != "" {
        model = f.model
    }
    provider := cfg.Provider
    if provider == "" {
        provider = "openrouter"
    }
    // Key resolution: saved global key → provider env var.
    key := config.LoadGlobal().Keys[provider]
    if key == "" {
        if p, ok := llm.Providers[provider]; ok {
            key = os.Getenv(p.KeyEnv)
        }
    }
    c, err := llm.NewForProvider(provider, cfg.BaseURL, model, key)
    if err != nil {
        return nil, err
    }
    c.MaxTokens = cfg.MaxTokens
    return c, nil
}
```

This shows that the API key is first taken from the global configuration (for the given provider) and, if not found, from the environment variable associated with the provider (as defined in `llm.Providers[provider].KeyEnv`).

## Configuration Precedence

The configuration system follows a clear precedence order, where more specific sources override more general ones.

### For the LLM Client (Model, Provider, Base URL, API Key, MaxTokens)

The values used to create the LLM client (in `newClient`) are determined as follows:

1. **Model**:
    - CLI flag `-model` (if set) overrides the per-repo configuration.
    - Otherwise, the per-repo configuration's `Model` field is used (which may be the value from the config file or the default from `config.Default()`).
    - The global configuration's `DefaultModel` is not used in the LLM client setup.

2. **Provider**:
    - There is no CLI flag to override the provider.
    - The per-repo configuration's `Provider` field is used (which may be the value from the config file or the default from `config.Default()`).
    - If the per-repo provider is empty, it defaults to "openrouter" (hardcoded in `newClient`).
    - The global configuration's `DefaultProvider` is not used.

3. **BaseURL**:
    - There is no CLI flag to override the base URL.
    - The per-repo configuration's `BaseURL` field is used (which may be the value from the config file or the empty string default from `config.Default()`).

4. **API Key**:
    - First, the global configuration is consulted for the provider's key (from `config.LoadGlobal().Keys[provider]`).
    - If not found, the environment variable specific to the provider (as defined in `llm.Providers[provider].KeyEnv`) is used.
    - If still not found, the key is empty, which may cause the LLM provider to return an authentication error.

5. **MaxTokens**:
    - The per-repo configuration's `MaxTokens` field is used (which may be the value from the config file or the zero default from `config.Default()`).
    - There is no CLI flag to override MaxTokens.

### For Other Configuration Values (Concurrency, MaxModuleTokens, Scope, Notes)

These values are taken solely from the per-repo configuration (with the file contents overriding the defaults from `config.Default()`) and are not affected by CLI flags or the global configuration. However, note that the effective concurrency used may be clamped for free tier models (see the `EffectiveConcurrency` method in `cli/internal/config/config.go`).

### Example: Precedence in Action

Consider a user who has:
- Global configuration: sets the OpenRouter API key and sets `DefaultProvider` to "openrouter" and `DefaultModel` to "anthropic/claude-3-opus".
- Per-repo configuration (in `.kaioken/config.yaml`): sets `Provider` to "openai" and `Model` to "gpt-4-turbo".
- CLI invocation: `kaioken plan -model "anthropic/claude-3-sonnet"`

The LLM client will be created with:
- Provider: "openai" (from the per-repo config, because there is no CLI flag for provider and the per-repo config is set)
- Model: "anthropic/claude-3-sonnet" (from the CLI flag, overriding the per-repo config's "gpt-4-turbo")
- API key: taken from the global configuration for the provider "openai" (if set) or the environment variable `OPENAI_API_KEY` (if the global key for openai is not set).
- BaseURL: from the per-repo config (if set) or empty (meaning use the provider's default).
- Other values (Concurrency, MaxModuleTokens, etc.): from the per-repo config (with concurrency potentially clamped for free models).

## Referenced Files

- `cli/cmd/kaioken/main.go`: Contains the CLI flag parsing and the `newClient` function that demonstrates how configuration layers are combined.
- `cli/internal/config/global.go`: Defines the global configuration structure and loading/saving logic.
- `cli/internal/config/config.go`: Defines the per-repo configuration structure, defaults, and loading/saving logic.

<!-- kaioken:files internal/config/config.go,internal/config/global.go,cmd/kaioken/main.go -->
