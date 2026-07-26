We are the current document (the old one) and the git diff showing new files (the source code). The task: produce the updated chapter (markdown) reflecting the changes.

We need to see what changed: The diff shows new files: cli/cmd/kaioken/main.go, cli/internal/config/config.go, cli/internal/config/global.go. This is the initial commit moving Go source into cli/, adding website etc. So the codebase has been restructured: previously the code might have been at root? The current document references paths like `internal/config/global.go:14-18` etc. Those paths are now under `cli/internal/config/...`? Actually the diff shows the new location is under `cli/`. The old document likely referenced paths without the `cli/` prefix. We need to update those references to reflect the new location.

Also note that the document mentions `internal/config/global.go:14-18` and `internal/config/config.go:18-41` etc. Now those files are at `cli/internal/config/global.go` and `cli/internal/config/config.go`. Also the main.go is now at `cli/cmd/kaioken/main.go`. The document also references `cmd/kaioken/main.go` in the "Referenced Files" list at the end. We need to update that to `cli/cmd/kaioken/main.go`.

Additionally, the document may have mentioned `internal/config/config.go:55-60` for DefaultExcludes. That is now `cli/internal/config/config.go:55-60`.

Also the document mentions `internal/config/config.go:110-129` (Load function). That is now `cli/internal/config/config.go:110-129`.

Also the document mentions `internal/config/global.go:53-65` (Save method). That is now `cli/internal/config/global.go:53-65`.

Also the document mentions `internal/config/config.go:132-144` (Save method). That is now `cli/internal/config/config.go:132-144`.

Also the document mentions `cmd/kaioken/main.go:279-317` (status command flow). That is now `cli/cmd/kaioken/main.go:296-334`? Let's check line numbers in the new file: In the new main.go, the cmdStatus function starts at line 296 (as per the structure). Actually the structure shows:

L296-334  func cmdStatus(f flags) error

So we need to update that reference.

Also the document mentions `cmd/kaioken/main.go:133-169` (parseFlags). That is now `cli/cmd/kaioken/main.go:143-186`.

Also the document mentions `cmd/kaioken/main.go:339-361` (newClient usage for -model). That is now `cli/cmd/kaioken/main.go:356-378`? Actually newClient function is at L356-378.

Also the document mentions `cmd/kaioken/main.go:248-250` (-module). That is now `cli/cmd/kaioken/main.go:250-294`? Actually cmdGenerate is at L250-294, and the module handling is inside that function. We need to find the exact lines: In cmdGenerate, we have:

	if f.module != "" {
		opts.Only = splitComma(f.module)
	}

That is around line? Let's approximate: In the structure, cmdGenerate is L250-294. The module handling is inside that function. We'll keep the reference but update the path.

Also the document mentions `cmd/kaioken/main.go:247` (-force). That is inside cmdGenerate: opts := generate.Options{Force: f.force} at line? We'll update.

Also the document mentions `cmd/kaioken/main.go:434-436` (-base). That is inside cmdUpdate. In the new file, cmdUpdate is at L437-474. The base handling is near the start: base := f.base; if base == "" && f.positional != "" { base = f.positional }. That is around line 447? We'll update.

Also the document mentions `cmd/kaioken/main.go:552-556` (-port). That is inside cmdServe. In new file, cmdServe is at L563-573. The port handling is at the start: port := f.port; if port == 0 { port = 7777 }. That is around line 565? We'll update.

Also the document mentions `cmd/kaioken/main.go:345-352` (environment variable fallback). That is inside newClient? Actually the comment about environment variable fallback is in the old document, but in the new code, the key resolution is in newClient function (lines 356-378). The environment variable fallback is there: after checking global key, if empty, check provider's env var. So we need to update that reference.

Also the document mentions `cmd/kaioken/main.go:133-169` for flag parsing. Already updated.

Also the document mentions `cmd/kaioken/main.go:279-317` for status command flow. Already updated.

Also the document mentions `cmd/kaioken/main.go:339-361` for -model override. Already updated.

Also the document mentions `cmd/kaioken/main.go:248-250` for -module. Already updated.

Also the document mentions `cmd/kaioken/main.go:247` for -force. Already updated.

Also the document mentions `cmd/kaioken/main.go:434-436` for -base. Already updated.

Also the document mentions `cmd/kaioken/main.go:552-556` for -port. Already updated.

Also the document mentions `cmd/kaioken/main.go:345-352` for environment variable fallback. Already updated.

Also the document mentions `cmd/kaioken/main.go:133-169` for flag parsing. Already updated.

Also the document mentions `cmd/kaioken/main.go:279-317` for status command flow. Already updated.

Also the document mentions `cmd/kaioken/main.go:339-361` for -model override. Already updated.

Also the document mentions `cmd/kaioken/main.go:248-250` for -module. Already updated.

Also the document mentions `cmd/kaioken/main.go:247` for -force. Already updated.

Also the document mentions `cmd/kaioken/main.go:434-436` for -base. Already updated.

Also the document mentions `cmd/kaioken/main.go:552-556` for -port. Already updated.

Also the document mentions `cmd/kaioken/main.go:345-352` for environment variable fallback. Already updated.

Now we need to update the markdown accordingly.

Let's go through the current document and replace the paths.

Current document:

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
		" ... (truncated in original)
```
Actually the original snippet in the document is:

```go
func (c *Config) Save(repo string) error {
	if err := os.MkdirAll(filepath.Join(repo, Dir), 0o755); err != nil { return err }
	raw, err := yaml.Marshal(c)
	if err != nil { return err }
	header := []byte("# ainow configuration — edit freely.\n" +
		"# `notes` are injected into every generation prompt: use them to teach\n" +
		"# the model conventions, guardrails, and tribal knowledge.\n")
	return os.WriteFile(Path(repo), append(header, raw...), 0o644)
}
```

We need to update the path references.

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



Now we need to update all those internal paths to prefix with `cli/`.

Also note that the referenced files list at the end should be updated: `cmd/kaioken/main.go` -> `cli/cmd/kaioken/main.go`, `internal/config/config.go` -> `cli/internal/config/config.go`, `internal/config/global.go` -> `cli/internal/config/global.go`.

Also note that the document mentions `internal/config/config.go:55-60` for DefaultExcludes. That is now `cli/internal/config/config.go:55-60`.

Also note that the document mentions `internal/config/config.go:110-129` (Load function). That is now `cli/internal/config/config.go:110-129`.

Also note that the document mentions `internal/config/global.go:53-65` (Save method). That is now `cli/internal/config/global.go:53-65`.

Also note that the document mentions `internal/config/config.go:132-144` (Save method). That is now `cli/internal/config/config.go:132-144`.

Also note that the document mentions `cmd/kaioken/main.go:279-317` (status command flow). That is now `cli/cmd/kaioken/main.go:296-334`.

Also note that the document mentions `cmd/kaioken/main.go:133-169` (parseFlags). That is now `cli/cmd/kaioken/main.go:143-186`.

Also note that the document mentions `cmd/kaioken/main.go:339-361` (newClient usage for -model). That is now `cli/cmd/kaioken/main.go:356-378`.

Also note that the document mentions `cmd/kaioken/main.go:248-250` (-module). That is now `cli/cmd/kaioken/main.go:250-294`? Actually the line numbers for the module handling inside cmdGenerate: we need to find the exact line. In the new file, cmdGenerate is from L250 to L294. The module handling is inside that function. Let's look at the source:

func cmdGenerate(ctx context.Context, f flags) error {
	cfg, err := config.Load(f.repo)
	if err != nil {
		return err
	}
	client, err := newClient(cfg, f)
	if err != nil {
		return err
	}
	p, err := plan.Load(f.repo)
	if err != nil {
		return err
	}
	res, err := scan.Repo(f.repo, cfg)
	if err != nil {
		return err
	}

	opts := generate.Options{Force: f.force}
	if f.module != "" {
		opts.Only = splitComma(f.module)
	}
	started := time.Now()
	done, skipped, failed := 0, 0, 0
	opts.OnStart = func(id string) { fmt.Printf("  → generating %s\n", id) }
	opts.OnDone = func(id string, err error, wasSkipped bool) {
		switch {
		case err != nil:
			failed++
			fmt.Printf("  ✗ %s: %v\n", id, err)
		case wasSkipped:
			skipped++
		default:
			done++
			fmt.Printf("  ✓ %s\n", id)
		}
	}

	fmt.Printf("generating cards with %s (concurrency %d) …\n", client.Model, cfg.Concurrency)
	err = generate.Run(ctx, f.repo, cfg, client, p, res, opts)
	fmt.Printf("\n%d generated, %d up-to-date, %d failed in %s\n",
		done, skipped, failed, time.Since(started).Round(time.Second))
	fmt.Printf("index: %s\n", config.Dir+"/KNOWLEDGE.md")
	return err
}

The line `if f.module != "" {` is after the opts initialization. Let's count lines: The function starts at line 250. Let's approximate: line 250: func cmdGenerate... line 251: { line 252: cfg, err := config.Load(f.repo) line 253: if err != nil { ... } line 254: return err line 255: } line 256: client, err := newClient(cfg, f) line 257: if err != nil { ... } line 258: return err line 259: } line 260: p, err := plan.Load(f.repo) line 261: if err != nil { ... } line 262: return err line 263: } line 264: res, err := scan.Repo(f.repo, cfg) line 265: if err != nil { ... } line 266: return err line 267: } line 268: (blank) line 269: opts := generate.Options{Force: f.force} line 270: if f.module != "" { line 271: opts.Only = splitComma(f.module) line 272: } line 273: started := time.Now() line 274: done, skipped, failed := 0, 0, 0 line 275: opts.OnStart = func(id string) { fmt.Printf("  → generating %s\n", id) } line 276: opts.OnDone = func(id string, err error, wasSkipped bool) { ... } line 277: } line 278: (blank) line 279: fmt.Printf("generating cards with %s (concurrency %d) …\n", client.Model, cfg.Concurrency) line 280: err = generate.Run(...) line 281: fmt.Printf(...) line 282: fmt.Printf("index: %s\n", config.Dir+"/KNOWLEDGE.md") line 283: return err

So the module handling is at lines 270-271. We'll update the reference to `cli/cmd/kaioken/main.go:270-271`.

Similarly, the `-force` handling: `opts := generate.Options{Force: f.force}` is at line 269. So we can reference `cli/cmd/kaioken/main.go:269`.

The `-base` handling: in cmdUpdate, we have:

func cmdUpdate(ctx context.Context, f flags) error {
	cfg, err := config.Load(f.repo)
	if err != nil {
		return err
	}
	client, err := newClient(cfg, f)
	if err != nil {
		return err
	}
	res, err := scan.Repo(f.repo, cfg)
	if err != nil {
		return err
	}
	base := f.base
	if base == "" && f.positional != "" {
		base = f.positional
	}
	started := time.Now()
	rep, err := wiki.Update(ctx, f.repo, cfg, client, res, base, cliProgress())
	if err != nil {
		return err
	}
	...
}

The base assignment is after loading res. Let's find line numbers: cmdUpdate starts at L437. Let's approximate:

L437: func cmdUpdate(ctx context.Context, f flags) error {
L438:	cfg, err := config.Load(f.repo)
L439:	if err != nil {
L440:		return err
L441:	}
L442:	client, err := newClient(cfg, f)
L443:	if err != nil {
L444:		return err
L445:	}
L446:	res, err := scan.Repo(f.repo, cfg)
L447:	if err != nil {
L448:		return err
L449:	}
L450:	base := f.base
L451:	if base == "" && f.positional != "" {
L452:		base = f.positional
L453:	}
L454:	started := time.Now()
L455:	rep, err := wiki.Update(ctx, f.repo, cfg, client, res, base, cliProgress())
L456:	if err != nil {
L457:		return err
L458:	}
L459:	switch {
L460:	case len(rep.Changes) == 0:
L461:		fmt.Printf("wiki is already current — nothing changed since %s\n", gitx.Short(rep.Base))
L462:	case len(rep.Updated) == 0:
L463:		fmt.Printf("%d files changed but no section claims them — run `kaioken wiki -force` to re-plan\n",
L464:			len(rep.Changes))
L465:	default:
L466:		fmt.Printf("\nupdated %d document(s) from %d changed files in %s\n",
L467:			len(rep.Updated), len(rep.Changes), time.Since(started).Round(time.Second))
L468:		fmt.Printf("changelog: %s\n", config.Dir+"/wiki/CHANGELOG.md")
L469:	}
L470:	for _, u := range rep.Unassigned {
L471:		fmt.Printf("  ! %s is outside every section's scope\n", u)
L472:	}
L473:	return nil
L474:}

So the base handling is at lines 450-452. We'll update reference to `cli/cmd/kaioken/main.go:450-452`.

The `-port` handling: in cmdServe:

func cmdServe(ctx context.Context, f flags) error {
	port := f.port
	if port == 0 {
		port = 7777
	}
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	return serve.Run(ctx, f.repo, addr, func(url string) {
		fmt.Printf("serving %s/wiki at %s\n", config.Dir, url)
		fmt.Println("ctrl+c to stop")
	})
}

cmdServe starts at L563. Let's approximate:

L563: func cmdServe(ctx context.Context, f flags) error {
L564:	port := f.port
L565:	if port == 0 {
L566:		port = 7777
L567:	}
L568:	addr := fmt.Sprintf("127.0.0.1:%d", port)
L569:	return serve.Run(ctx, f.repo, addr, func(url string) {
L570:		fmt.Printf("serving %s/wiki at %s\n", config.Dir, url)
L571:		fmt.Println("ctrl+c to stop")
L572:	})
L573:}

So port handling is lines 564-566. We'll update reference to `cli/cmd/kaioken/main.go:564-566`.

The environment variable fallback: in newClient function:

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

newClient starts at L356. Let's approximate:

L356: func newClient(cfg *config.Config, f flags) (*llm.Client, error) {
L357:	model := cfg.Model
L358:	if f.model != "" {
L359:		model = f.model
L360:	}
L361:	provider := cfg.Provider
L362:	if provider == "" {
L363:		provider = "openrouter"
L364:	}
L365:	// Key resolution: saved global key → provider env var.
L366:	key := config.LoadGlobal().Keys[provider]
L367:	if key == "" {
L368:		if p, ok := llm.Providers[provider]; ok {
L369:			key = os.Getenv(p.KeyEnv)
L370:		}
L371:	}
L372:	c, err := llm.NewForProvider(provider, cfg.BaseURL, model, key)
L373:	if err != nil {
L374:		return nil, err
L375:	}
L376:	c.MaxTokens = cfg.MaxTokens
L377:	return c, nil
L378:}

The environment variable fallback is at lines 366-371. We'll update reference to `cli/cmd/kaioken/main.go:366-371`.

Now we also need to update the "Referenced Files" list at the end: change to the new paths.

Also note that the document mentions `internal/config/config.go:55-60` for DefaultExcludes. That is now `cli/internal/config/config.go:55-60`.

Also note that the document mentions `internal/config/config.go:110-129` (Load function). That is now `cli/internal/config/config.go:110-129`.

Also note that the document mentions `internal/config/global.go:53-65` (Save method). That is now `cli/internal/config/global.go:53-65`.

Also note that the document mentions `internal/config/config.go:132-144` (Save method). That is now `cli/internal/config/config.go:132-144`.

Also note that the document mentions `cmd/kaioken/main.go:279-317` (status command flow). That is now `cli/cmd/kaioken/main.go:296-334`.

Also note that the document mentions `cmd/kaioken/main.go:133-169` (parseFlags). That is now `cli/cmd/kaioken/main.go:143-186`.

Also note that the document mentions `cmd/kaioken/main.go:339-361` (newClient usage for -model). That is now `cli/cmd/kaioken/main.go:356-378`.

Also note that the document mentions `cmd/kaioken/main.go:248-250` (-module). That is now `cli/cmd/kaioken/main.go:270-271`.

Also note that the document mentions `cmd/kaioken/main.go:247` (-force). That is now `cli/cmd/kaioken/main.go:269`.

Also note that the document mentions `cmd/kaioken/main.go:434-436` (-base). That is now `cli/cmd/kaioken/main.go:450-452`.

Also note that the document mentions `cmd/kaioken/main.go:552-556` (-port). That is now `cli/cmd/kaioken/main.go:564-566`.

Also note that the document mentions `cmd/kaioken/main.go:345-352` (environment variable fallback). That is now `cli/cmd/kaioken/main.go:366-371`.

Now we need to produce the updated markdown document.

We'll go through and replace all those paths.

Also note that the document mentions `internal/config/global.go:14-18` for Global struct. That is now `cli/internal/config/global.go:14-18`.

Also note that the document mentions `internal/config/config.go:18-41` for Config struct. That is now `cli/internal/config/config.go:18-41`.

Also note that the document mentions `internal/config/config.go:55-60` for DefaultExcludes. That is now `cli/internal/config/config.go:55-60`.

Also note that the document mentions `internal/config/config.go:110-129` (Load function). That is now `cli/internal/config/config.go:110-129`.

Also note that the document mentions `internal/config/global.go:53-65` (Save method). That is now `cli/internal/config/global.go:53-65`.

Also note that the document mentions `internal/config/config.go:132-144` (Save method). That

<!-- kaioken:files cmd/kaioken/main.go,internal/config/config.go,internal/config/global.go -->
