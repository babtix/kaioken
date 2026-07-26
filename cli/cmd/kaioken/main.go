// kaioken — a self-hosted knowledge engine: scans a repository, splits it into
// modules with an LLM, and generates dense knowledge cards that AI coding
// agents (and humans) consume as project context.
package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"runtime"
	"strings"
	"time"

	"kaioken/internal/agentsmd"
	"kaioken/internal/config"
	"kaioken/internal/daemon"
	"kaioken/internal/generate"
	"kaioken/internal/gitx"
	"kaioken/internal/llm"
	"kaioken/internal/plan"
	"kaioken/internal/scan"
	"kaioken/internal/serve"
	"kaioken/internal/setup"
	"kaioken/internal/skills"
	"kaioken/internal/state"
	"kaioken/internal/tui"
	"kaioken/internal/version"
	"kaioken/internal/wiki"
)

const usage = `kaioken — AI coding agent + knowledge engine

Usage: kaioken <command> [flags]

Commands:
  tui        Launch the interactive terminal UI (also the default with no args)
  init       Full first-run setup: create .kaioken/config.yaml, scan the repo, and
             write AGENTS.md — the instruction file agents read before editing
             (-force rewrites an existing AGENTS.md)
  scan       Scan the repo and print an inventory summary
  plan       Propose a module tree with the LLM → .kaioken/modules.yaml (editable)
  generate   Generate knowledge cards for all modules (skips unchanged ones)
  status     Show module freshness (changed / up-to-date / missing)
  models     List provider models (optional filter argument)
  wiki       Deep multi-pass wiki (positional arg: x1..x10 multiplier)
  update     Incremental wiki refresh: git-diff the repo against the commit the
             wiki was generated from and revise only the affected documents
  skills     Build task-oriented skills an AI agent loads while working in the
             repo (positional: "list", or a skill name; -force to rewrite)
  serve      Browse the generated wiki in a browser (-port, default 7777)
  hook       Manage the post-commit auto-update hook (install|remove|status)
  daemon     Serve the engine over a loopback HTTP API (used by Kaioken Desktop)
  logo       Print the KAIOKEN wordmark
  version    Print the version

Common flags (after the command):
  -repo <path>    Target repository (default: current directory)
  -model <id>     Override the model from config.yaml
  -module <id>    Restrict generate to one module id (repeatable via comma list)
  -base <rev>     Baseline commit for update (default: the recorded baseline)
  -port <n>       Port for serve and daemon (serve default: 7777; daemon default: ephemeral)
  -force          Regenerate even when sources are unchanged
  -token <hex>    Bearer token for daemon (manual/testing use)
  -token-stdin    Read the daemon's bearer token from stdin's first line

Environment:
  OPENROUTER_API_KEY   (or the active provider's key env) — for plan/generate/models
`

func main() {
	if len(os.Args) < 2 {
		// Bare `ainow` launches the interactive TUI.
		if err := tui.Run("."); err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(1)
		}
		return
	}
	cmd := os.Args[1]
	args := parseFlags(os.Args[2:])

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	var err error
	switch cmd {
	case "tui":
		err = tui.Run(args.repo)
	case "init":
		err = cmdInit(ctx, args)
	case "scan":
		err = cmdScan(args)
	case "plan":
		err = cmdPlan(ctx, args)
	case "wiki":
		err = cmdWiki(ctx, args)
	case "update":
		err = cmdUpdate(ctx, args)
	case "generate":
		err = cmdGenerate(ctx, args)
	case "skills", "skill":
		err = cmdSkills(ctx, args)
	case "serve":
		err = cmdServe(ctx, args)
	case "hook":
		err = cmdHook(args)
	case "daemon":
		err = cmdDaemon(ctx, args)
	case "status":
		err = cmdStatus(args)
	case "models":
		err = cmdModels(ctx, args)
	case "logo":
		fmt.Print(tui.LogoPlain())
	case "version", "-v", "--version":
		fmt.Printf("kaioken %s (%s, %s/%s)\n", version.Version,
			runtime.Version(), runtime.GOOS, runtime.GOARCH)
	case "help", "-h", "--help":
		fmt.Print(usage)
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n\n%s", cmd, usage)
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

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

// cmdInit runs the full first-run setup: config, scan, and AGENTS.md. It is
// deliberately re-runnable — pointing it at an already-initialised repo
// refreshes what is safe to refresh instead of erroring out.
func cmdInit(ctx context.Context, f flags) error {
	cfg, created, err := setup.EnsureConfig(f.repo, f.model)
	if err != nil {
		return err
	}
	if created {
		fmt.Printf("  ✓ created %s\n", config.Path(f.repo))
	} else {
		fmt.Printf("  · %s already exists — kept as is\n", config.Path(f.repo))
	}

	// A missing key is not a failure here: config and scan are still worth
	// doing, and the user gets told exactly what to do about the rest.
	client, err := newClient(cfg, f)
	if err != nil {
		fmt.Printf("  · %v\n", err)
		client = nil
	}

	pg := agentsmd.Progress{
		Info:    func(t string) { fmt.Println("  " + t) },
		Started: func(w string) { fmt.Println("  → " + w) },
		Wrote:   func(p string, lines int) { fmt.Printf("  ✓ %s (%d lines)\n", p, lines) },
		Failed:  func(w string, err error) { fmt.Printf("  ✗ %s: %v\n", w, err) },
	}
	res, err := setup.Run(ctx, f.repo, cfg, client, setup.Options{Force: f.force}, pg)
	if err != nil {
		return err
	}
	if res.AgentsSkipped != "" {
		fmt.Println("  · " + res.AgentsSkipped)
	}

	fmt.Println("\nnext:")
	for _, s := range setup.NextSteps(f.repo) {
		fmt.Println("  " + s)
	}
	return nil
}

func cmdScan(f flags) error {
	cfg, err := config.Load(f.repo)
	if err != nil {
		return err
	}
	started := time.Now()
	res, err := scan.Repo(f.repo, cfg)
	if err != nil {
		return err
	}
	fmt.Printf("scanned in %s: %s\n\n", time.Since(started).Round(time.Millisecond), res.Stats())
	fmt.Print(res.TreeSummary(8))
	return nil
}

func cmdPlan(ctx context.Context, f flags) error {
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
	fmt.Printf("scanned: %s\n", res.Stats())
	fmt.Printf("planning modules with %s …\n", client.Model)
	p, err := plan.Generate(ctx, client, cfg, res)
	if err != nil {
		return err
	}
	if err := p.Save(f.repo); err != nil {
		return err
	}
	flat := p.Flatten()
	fmt.Printf("\nwrote %s with %d modules:\n", plan.FilePath(f.repo), len(flat))
	for _, fm := range flat {
		fmt.Printf("  %-40s %s\n", fm.ID, fm.Title)
	}
	fmt.Println("\nreview/edit modules.yaml, then run `kaioken generate`")
	return nil
}

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

func cmdStatus(f flags) error {
	cfg, err := config.Load(f.repo)
	if err != nil {
		return err
	}
	p, err := plan.Load(f.repo)
	if err != nil {
		return err
	}
	st, err := state.Load(f.repo)
	if err != nil {
		return err
	}
	res, err := scan.Repo(f.repo, cfg)
	if err != nil {
		return err
	}
	for _, fm := range p.Flatten() {
		files := plan.FilesFor(fm, res)
		ms, ok := st.Modules[fm.ID]
		switch {
		case len(files) == 0:
			fmt.Printf("  ∅ %-40s (no files in scope)\n", fm.ID)
		case !ok:
			fmt.Printf("  ○ %-40s not generated (%d files)\n", fm.ID, len(files))
		default:
			hash, herr := state.HashFiles(res.Root, files)
			if herr != nil {
				return herr
			}
			if hash == ms.SourceHash {
				fmt.Printf("  ✓ %-40s up-to-date (%s)\n", fm.ID, ms.GeneratedAt.Format("2006-01-02 15:04"))
			} else {
				fmt.Printf("  Δ %-40s CHANGED since %s\n", fm.ID, ms.GeneratedAt.Format("2006-01-02 15:04"))
			}
		}
	}
	return nil
}

func cmdModels(ctx context.Context, f flags) error {
	cfg, err := config.Load(f.repo)
	if err != nil {
		cfg = config.Default()
	}
	client, err := newClient(cfg, f)
	if err != nil {
		return err
	}
	models, err := client.ListModels(ctx, f.positional)
	if err != nil {
		return err
	}
	for _, m := range models {
		fmt.Printf("  %-50s %s\n", m.ID, m.Name)
	}
	fmt.Printf("%d models\n", len(models))
	return nil
}

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

// cmdWiki runs the deep multi-pass wiki pipeline from the CLI.
// The positional argument may be a multiplier like "x3".
func cmdWiki(ctx context.Context, f flags) error {
	cfg, err := config.Load(f.repo)
	if err != nil {
		return err
	}
	client, err := newClient(cfg, f)
	if err != nil {
		return err
	}
	multiplier := 3 // x3 is the default; pass x1/x2/x4… to override
	if strings.HasPrefix(strings.ToLower(f.positional), "x") {
		fmt.Sscanf(strings.ToLower(f.positional), "x%d", &multiplier)
	}
	res, err := scan.Repo(f.repo, cfg)
	if err != nil {
		return err
	}

	if strings.EqualFold(f.positional, "retry") {
		pg := cliProgress()
		n, err := wiki.Retry(ctx, f.repo, cfg, client, res, pg)
		if err != nil {
			return err
		}
		if n == 0 {
			fmt.Println("no failed sections to retry")
		} else {
			fmt.Printf("\nretried %d section(s) → %s\n", n, config.Dir+"/wiki/README.md")
		}
		return nil
	}

	fmt.Printf("scanned: %s\n", res.Stats())
	fmt.Println(wiki.EstimateRun(f.repo, cfg, res, multiplier))
	limit, _ := cfg.EffectiveConcurrency(client.Model)
	fmt.Printf("kaioken ×%d wiki with %s (concurrency %d) …\n", multiplier, client.Model, limit)
	started := time.Now()
	err = wiki.Run(ctx, f.repo, cfg, client, res, multiplier, f.force, cliProgress())
	fmt.Printf("\nwiki done in %s → %s\n", time.Since(started).Round(time.Second),
		config.Dir+"/wiki/README.md")
	return err
}

// cliProgress renders pipeline progress to stdout.
func cliProgress() wiki.Progress {
	return wiki.Progress{
		Info:    func(t string) { fmt.Println("  " + t) },
		Started: func(w string) { fmt.Println("  → " + w) },
		Wrote:   func(p string, lines int) { fmt.Printf("  ✓ %s (%d lines)\n", p, lines) },
		Failed:  func(w string, err error) { fmt.Printf("  ✗ %s: %v\n", w, err) },
	}
}

// cmdUpdate refreshes an already-generated wiki from the repository's git diff:
// only the documents the change actually invalidates get rewritten.
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
	switch {
	case len(rep.Changes) == 0:
		fmt.Printf("wiki is already current — nothing changed since %s\n", gitx.Short(rep.Base))
	case len(rep.Updated) == 0:
		fmt.Printf("%d files changed but no section claims them — run `kaioken wiki -force` to re-plan\n",
			len(rep.Changes))
	default:
		fmt.Printf("\nupdated %d document(s) from %d changed files in %s\n",
			len(rep.Updated), len(rep.Changes), time.Since(started).Round(time.Second))
		fmt.Printf("changelog: %s\n", config.Dir+"/wiki/CHANGELOG.md")
	}
	for _, u := range rep.Unassigned {
		fmt.Printf("  ! %s is outside every section's scope\n", u)
	}
	return nil
}

// cmdSkills builds (or lists) the repository's agent skills.
func cmdSkills(ctx context.Context, f flags) error {
	if strings.EqualFold(f.positional, "list") {
		all, err := skills.List(f.repo)
		if err != nil {
			return err
		}
		if len(all) == 0 {
			fmt.Println("no skills yet — run `kaioken skills` to build them")
			return nil
		}
		for _, s := range all {
			fmt.Printf("  %-32s %s\n", s.Name, s.Description)
		}
		fmt.Printf("%d skills in %s/skills\n", len(all), config.Dir)
		return nil
	}

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
	opts := skills.Options{Force: f.force}
	if f.positional != "" {
		opts.Only = []string{f.positional}
	}
	started := time.Now()
	pg := skills.Progress{
		Info:    func(t string) { fmt.Println("  " + t) },
		Started: func(w string) { fmt.Println("  → " + w) },
		Wrote:   func(p string, lines int) { fmt.Printf("  ✓ %s (%d lines)\n", p, lines) },
		Failed:  func(w string, err error) { fmt.Printf("  ✗ %s: %v\n", w, err) },
	}
	written, err := skills.Run(ctx, f.repo, cfg, client, res, opts, pg)
	if err != nil {
		return err
	}
	fmt.Printf("\n%d skill(s) in %s → %s/skills/\n", len(written),
		time.Since(started).Round(time.Second), config.Dir)
	return nil
}

// cmdHook manages the post-commit auto-update hook.
// Usage: kaioken hook [install|remove|status]
func cmdHook(f flags) error {
	switch strings.ToLower(f.positional) {
	case "install", "add", "on":
		exe, err := os.Executable()
		if err != nil {
			return fmt.Errorf("locating the kaioken binary: %w", err)
		}
		path, err := gitx.InstallPostCommit(f.repo, exe)
		if err != nil {
			return err
		}
		fmt.Printf("installed %s\n", path)
		fmt.Println("every commit now refreshes the wiki in the background")
		fmt.Println("remove it with `kaioken hook remove`")
	case "remove", "uninstall", "off":
		removed, err := gitx.RemovePostCommit(f.repo)
		if err != nil {
			return err
		}
		if !removed {
			fmt.Println("no kaioken hook was installed")
			return nil
		}
		fmt.Println("post-commit hook removed")
	default:
		if gitx.PostCommitInstalled(f.repo) {
			fmt.Println("post-commit auto-update: installed")
		} else {
			fmt.Println("post-commit auto-update: not installed  (kaioken hook install)")
		}
	}
	return nil
}

// cmdServe browses the generated wiki over HTTP until interrupted.
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

// cmdDaemon serves the engine over a loopback HTTP API for the desktop app.
// It is not intended for direct human use: the port is ephemeral and every
// request needs the bearer token supplied at startup.
func cmdDaemon(ctx context.Context, f flags) error {
	token := f.token
	parentPID := 0
	if f.tokenStdin {
		// The same pipe doubles as the parent death-watch: reading it to EOF
		// after the token line means the parent (Rust) has exited.
		line, err := bufio.NewReader(os.Stdin).ReadString('\n')
		if err != nil {
			return fmt.Errorf("reading token from stdin: %w", err)
		}
		token = strings.TrimSpace(line)
		parentPID = os.Getppid()
	}
	if token == "" {
		return errors.New("daemon requires -token or -token-stdin")
	}
	addr := "127.0.0.1:0"
	if f.port != 0 {
		addr = fmt.Sprintf("127.0.0.1:%d", f.port)
	}
	return daemon.Run(ctx, daemon.Options{Addr: addr, Token: token, ParentPID: parentPID})
}

func splitComma(s string) []string {
	var out []string
	for _, part := range splitAndTrim(s, ',') {
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func splitAndTrim(s string, sep byte) []string {
	var out []string
	start := 0
	for i := 0; i <= len(s); i++ {
		if i == len(s) || s[i] == sep {
			part := s[start:i]
			for len(part) > 0 && (part[0] == ' ' || part[0] == '\t') {
				part = part[1:]
			}
			for len(part) > 0 && (part[len(part)-1] == ' ' || part[len(part)-1] == '\t') {
				part = part[:len(part)-1]
			}
			out = append(out, part)
			start = i + 1
		}
	}
	return out
}
