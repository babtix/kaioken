# Viewing and Editing Configuration

Kaioken manages configuration at two levels: global (user-wide) and per-repository. Configuration controls LLM providers, models, API keys, token budgets, scanning exclusions, and behavior toggles. This chapter explains how to inspect the current configuration and modify settings via configuration files or CLI flags.

## Table of Contents
- [Configuration Files](#configuration-files)
  - [Global Configuration](#global-configuration)
  - [Per-Repository Configuration](#per-repository-configuration)
- [Viewing Configuration](#viewing-configuration)
  - [Inspecting Config Files](#inspecting-config-files)
  - [Limitations of `kaioken status`](#limitations-of-kaioken-status)
- [Editing Configuration](#editing-configuration)
  - [Modifying Global Settings](#modifying-global-settings)
  - [Modifying Per-Repo Settings](#modifying-per-repo-settings)
- [CLI Flag Overrides](#cli-flag-overrides)
  - [Available Override Flags](#available-override-flags)
  - [Command-Scope of Overrides](#scope-of-overrides)

## Configuration Files

Kaioken uses YAML configuration files. Global settings apply to all repositories unless overridden by per-repo settings. Per-repo settings live in the repository's `.kaioken` directory.

### Global Configuration

The global configuration file (`~/.kaioken/config.yaml` or `$KAIOKEN_HOME/config.yaml`) stores:
- Default provider and model
- API keys per provider (never committed with repositories)

**Structure** (`internal/config/global.go:14-18`):
```go
type Global struct {
	DefaultProvider string            `yaml:"default_provider,omitempty"`
	DefaultModel    string            `yaml:"default_model,omitempty"`
	Keys            map[string]string `yaml:"keys,omitempty"` // provider → API key
}
```

Keys are stored per-provider (e.g., `openrouter`, `openai`). The file is written with restrictive permissions (`0o600`) as it contains secrets.

### Per-Repository Configuration

The per-repo configuration file (`.kaioken/config.yaml`) overrides global defaults for a specific repository and controls scanning behavior.

**Structure** (`internal/config/config.go:18-41`):
```go
type Config struct {
	Version int `yaml:"version"`
	Model   string `yaml:"model"`          // e.g. "anthropic/claude-sonnet-4.5"
	Provider string `yaml:"provider"`       // openrouter, openai, groq, etc.
	BaseURL  string `yaml:"base_url"`       // overrides provider default endpoint
	Concurrency int `yaml:"concurrency"`   // parallel module generation
	MaxModuleTokens int `yaml:"max_module_tokens"` // source context per module (approx tokens)
	MaxTokens int   `yaml:"max_tokens,omitempty"` // reply length cap (0 = llm.DefaultMaxTokens)
	Scope     Scope `yaml:"scope"`
	Notes     []string `yaml:"notes"`          // injected into every LLM prompt
}

type Scope struct {
	Include []string `yaml:"include"` // restricts scanning to these prefixes
	Exclude []string `yaml:"exclude"` // skips these globs/prefixes (added to DefaultExcludes)
}
```

**Default Exclusions** (`internal/config/config.go:55-60`):
```go
var DefaultExcludes = []string{
	".git", ".kaioken", ".ainow", ".qoder", "node_modules", "dist", "build", "out",
	".venv", "venv", "__pycache__", ".ruff_cache", ".pytest_cache",
	".mypy_cache", ".next", ".nuxt", "target", "vendor", "coverage",
	".idea", ".vscode", ".DS_Store",
}
```
`.kaioken` is always excluded to prevent self-scanning of generated knowledge.

## Viewing Configuration

### Inspecting Config Files

To view configuration, directly examine the YAML files:
- **Global**: `cat ~/.kaioken/config.yaml`
- **Per-repo**: `cat .kaioken/config.yaml` (within the repository)

The `kaioken init` command creates a default per-repo config and prints its location:
```
`internal/config/config.go:110-129` (Load function) reads this file when executing commands.
```

### Limitations of `kaioken status`

The `kaioken status` command shows module freshness (generated/up-to-date/changed) but **does not display configuration values**. It loads the configuration internally to perform scanning and planning, but outputs only module status.

**Status command flow** (`cmd/kaioken/main.go:279-317`):
```go
func cmdStatus(f flags) error {
	cfg, err := config.Load(f.repo) // Loads per-repo config
	if err != nil { return err }
	p, err := plan.Load(f.repo)
	if err != nil { return err }
	st, err := state.Load(f.repo)
	if err != nil { return err }
	res, err := scan.Repo(f.repo, cfg) // Uses config for scanning
	if err != nil { return err }
	// ... compares module state with source files
}
```
While `status` uses the config to determine what files to scan and how to plan modules, it only reports on knowledge generation state—not the config itself. To verify configuration effects, check:
- Scanning behavior: `kaioken scan` output reflects `Scope.Include`/`Scope.Exclude`
- Model used: `kaioken models` shows available providers/models
- Token limits: adjust `MaxModuleTokens`/`MaxTokens` and observe generation behavior

## Editing Configuration

### Modifying Global Settings

Edit `~/.kaioken/config.yaml` (or `$KAIOKEN_HOME/config.yaml`) to change:
- `default_provider`: Fallback provider when per-repo config omits `provider`
- `default_model`: Fallback model when per-repo config omits `model`
- `keys`: Map provider names to API keys (e.g., `openrouter: "sk-or-..."`)

**Saving global config** (`internal/config/global.go:53-65`):
```go
func (g *Global) Save() error {
	path := GlobalPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil { return err }
	raw, err := yaml.Marshal(g)
	if err != nil { return err }
	header := []byte("# kaioken user configuration — holds API keys and defaults.\n" +
		"# Keys are stored per provider; do not commit this file anywhere.\n")
	return os.WriteFile(path, append(header, raw...), 0o600)
```
The `Save` method ensures the directory exists (`0o700`) and writes the file with restricted permissions (`0o600`).

### Modifying Per-Repo Settings

Edit `.kaioken/config.yaml` in the repository root to override:
- `model`/`provider`: LLM settings for this repo
- `base_url`: Custom endpoint (e.g., for self-hosted LLMs)
- `concurrency`: Parallelism (adjusted for free-tier models via `EffectiveConcurrency`)
- `max_module_tokens`: Context size per module (must be ≥4000; see `Load` validation)
- `max_tokens`: Reply length cap (0 uses LLM default)
- `scope.include`/`scope.exclude`: File scanning filters
- `notes`: Custom prompt instructions

**Saving per-repo config** (`internal/config/config.go:132-144`):
```go
func (c *Config) Save(repo string) error {
	if err := os.MkdirAll(filepath.Join(repo, Dir), 0o755); err != nil { return err }
	raw, err := yaml.Marshal(c)
	if err != nil { return err }
	header := []byte("# ainow configuration — edit freely.\n" +
		"# `notes` are injected into every generation prompt: use them to teach\n" +
		"# the model conventions, guardrails, and tribal knowledge.\n")
	return os.WriteFile(Path(repo), append(header, raw...), 0o644)
```
The `Save` method creates `.kaioken` directory (`0o755`) and writes config with a header explaining the `notes` field.

## CLI Flag Overrides

CLI flags temporarily override configuration for a single command invocation. Flags are parsed via `parseFlags` (`cmd/kaioken/main.go:133-169`).

### Available Override Flags

| Flag          | Argument   | Overrides                          | Affected Commands                                                                 |
|---------------|------------|------------------------------------|---------------------------------------------------------------------------------|
| `-repo`       | `<path>`   | Repository root                    | All commands (changes target repo)                                              |
| `-model`      | `<id>`     | `Config.Model`                     | `plan`, `generate`, `wiki`, `update`, `models`, `skills`                        |
| `-module`     | `<id>`     | Limits generation to module(s)     | `generate` (comma-separated list via `-module a,-module b`)                     |
| `-base`       | `<rev>`    | Baseline commit for `update`       | `update`                                                                        |
| `-port`       | `<n>`      | Server port                        | `serve`                                                                         |
| `-force`      | (boolean)  | Bypass unchanged-skip optimization | `generate`, `wiki`, `update`, `skills`                                          |

**Flag parsing** (`cmd/kaioken/main.go:133-169`):
```go
func parseFlags(argv []string) flags {
	f := flags{repo: "."} // Default to current directory
	for i := 0; i < len(argv); i++ {
		switch argv[i] {
		case "-repo", "--repo":
			if i+1 < len(argv) { i++; f.repo = argv[i] }
		case "-model", "--model":
			if i+1 < len(argv) { i++; f.model = argv[i] }
		case "-module", "--module":
			if i+1 < len(argv) { i++; f.module = argv[i] }
		case "-base", "--base":
			if i+1 < len(argv) { i++; f.base = argv[i] }
		case "-port", "--port":
			if i+1 < len(argv) { i++; fmt.Sscanf(argv[i], "%d", &f.port) }
		case "-force", "--force":
			f.force = true
		default:
			f.positional = argv[i] // Used by models (filter) and update (base)
		}
	}
	return f
}
```

### Scope of Overrides

- **`-model`**: Overrides `Config.Model` in `newClient` (`cmd/kaioken/main.go:339-361`):
  ```go
  model := cfg.Model
  if f.model != "" {
      model = f.model
  }
  ```
  Affects LLM client creation for commands that call `newClient`.

- **`-module`**: Passed to `generate.Run` via `generate.Options{Only: splitComma(f.module)}` (`cmd/kaioken/main.go:248-250`).

- **`-force`**: Sets `generate.Options.Force` (`cmd/kaioken/main.go:247`) and `wiki.Run`/`skills.Run` force parameters.

- **`-base`**: Used as baseline for `wiki.Update` (`cmd/kaioken/main.go:434-436`):
  ```go
  base := f.base
  if base == "" && f.positional != "" {
      base = f.positional
  }
  ```

- **`-port`**: Sets serve address (`cmd/kaioken/main.go:552-556`):
  ```go
  port := f.port
  if port == 0 { port = 7777 }
  addr := fmt.Sprintf("127.0.0.1:%d", port)
  ```

- **`-repo`**: Changes the target repository for all config loading/scanning operations.

**Note**: The `status` command only uses `-repo` (to change target repository). It ignores `-model`, `-module`, `-base`, `-port`, and `-force` as they are irrelevant to module freshness reporting.

### Environment Variable Fallback

API keys can alternatively be set via environment variables (checked after global config):
- **Provider-specific**: e.g., `OPENROUTER_API_KEY` for OpenRouter (see `llm.Providers` map)
- **Resolution order** (`cmd/kaioken/main.go:345-352`):
  1. Global config key: `config.LoadGlobal().Keys[provider]`
  2. Environment variable: `os.Getenv(p.KeyEnv)` where `p.KeyEnv` is provider-specific (e.g., `"OPENROUTER_API_KEY"`)

This allows keeping secrets out of configuration files while still overriding defaults. However, note that environment variables only affect the API key—not other settings like model or concurrency.

<!-- kaioken:files cmd/kaioken/main.go,internal/config/config.go,internal/config/global.go -->
