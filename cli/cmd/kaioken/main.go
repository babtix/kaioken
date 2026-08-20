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
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"kaioken/internal/agentsmd"
	"kaioken/internal/config"
	"kaioken/internal/daemon"
	"kaioken/internal/export"
	"kaioken/internal/generate"
	"kaioken/internal/gitx"
	"kaioken/internal/llm"
	"kaioken/internal/plan"
	"kaioken/internal/reportpdf"
	"kaioken/internal/research"
	"kaioken/internal/scan"
	"kaioken/internal/selfupdate"
	"kaioken/internal/serve"
	"kaioken/internal/setup"
	"kaioken/internal/skills"
	"kaioken/internal/tui"
	"kaioken/internal/version"
	"kaioken/internal/websearch"
	"kaioken/internal/wiki"
)

const usage = `kaioken — AI coding agent + knowledge engine

Usage: kaioken <command> [flags]

Commands:
  tui        Launch the interactive terminal UI (also the default with no args)
  run        Run the agent headless on one prompt and exit: -p "..." gives the
             prompt, -mode picks the permission preset (default build), -json
             emits typed events as JSON lines, -approve sets the policy for
             state-changing actions (never | edits | all; default never)
  rpc        Drive the agent over JSON-RPC 2.0 on stdio — methods like
             agent.prompt/steer/approve, events as notifications (for editors,
             scripts and other processes embedding kaioken)
  init       Full first-run setup: create .kaioken/config.yaml, scan the repo, and
             write AGENTS.md — the instruction file agents read before editing
             (-force rewrites an existing AGENTS.md)
  scan       Scan the repo and print an inventory summary
  plan       Propose a module tree with the LLM → .kaioken/modules.yaml (editable)
  generate   Generate knowledge cards for all modules (skips unchanged ones)
  status     Show module freshness (changed / up-to-date / missing). -check is
             the CI drift gate: exit 0 fresh, 1 stale, 2 error; -json emits a
             machine-readable staleness summary
  models     List provider models (optional filter argument)
  wiki       Deep multi-pass wiki (positional arg: x1..x10 multiplier)
  update     Incremental refresh: git-diff the repo against the commit the
             wiki was generated from, revise only the affected documents,
             then revise the knowledge cards of changed modules
  skills     Build task-oriented skills an AI agent loads while working in the
             repo (positional: "list", or a skill name; -force to rewrite)
  impact     Predict the blast radius of a proposed change before editing:
             affected symbols, files, modules, wiki docs, skills and tests
             (positional: the change description; -format markdown|json,
             -out writes the report to a file). -compare scores the newest
             saved prediction against what actually changed (positional: base
             rev, default HEAD)
  export     Flatten the generated knowledge into another tool's context file
             (claude-md | agents-md | cursor-rules | context-md; -out overrides
             the path, -force overwrites, -full inlines wiki chapters)
  ext        Manage community extensions installed from GitHub releases
             (install | dev | validate | remove | list | update | search |
             enable | disable | trust | untrust | tools)
  mcp        Serve this repo's knowledge to any MCP client — Claude Desktop,
             Claude Code, Cursor (serve | manifest | validate)
  index      Build the search index over the generated wiki, cards and skills
             (-force rebuilds from scratch; embeddings when configured)
  search     Query that index from the terminal (positional: the query)
  prism      Retrieve over documents you import, grouped into modules, with a
             relevance gate that says when nothing actually answers the
             question (modules | new | rm | import | docs | ask | status)
  review     Review a diff against the repo's documented conventions and
             skills (-base sets the baseline; -out writes the report)
  research   Answer a question from the open web: a router picks the fast
             single-loop path or the deep multi-agent path, researches it,
             grounds the claims against the raw sources, and writes a cited
             report (positional: optional xN multiplier, then the question;
             -out overrides the report path). -mode auto|fast|deep pins the
             path; -resume <run id> continues an interrupted run; -verify
             cross-checks load-bearing claims independently. -fetcher
             auto|http|headless|firecrawl picks how pages are read: auto
             re-reads client-rendered pages in a local headless browser.
             x10 — or -deep at any multiplier — produces a deep dossier
             instead: up to ~480 pages read over 8 rounds, written as a
             sectioned document with a findings register, a search log and a
             coverage log, and rendered to a signed PDF beside the Markdown
  usage      Show what Kaioken has spent — by operation, model and workspace
             (positional: a day count like "7d", or "refresh" / "prune")
  serve      Browse the generated wiki in a browser (-port, default 7777)
  publish    Render the wiki as a static site anyone can browse — no server,
             no Kaioken needed (-out overrides .kaioken/site)
  pack       Bundle the generated knowledge into one portable .tar.gz for an
             offline or air-gapped machine (-extract <file> unpacks one,
             -out overrides the archive path)
  onboard    Write ONBOARDING.md — a day-one guide assembled from the wiki,
             cards, skills and scan (-force overwrites an existing one)
  gitdraft   Draft a commit message + PR description for the current change,
             grounded in the diff and the repo's own commit style
             (positional: baseline rev, default HEAD = uncommitted work)
  handoff    Write a continuation briefing for a saved session — goal,
             decisions, state, open threads, plus the transcript
             (positional: session id, default most recent; -out overrides)
  verify     Run the repo's build/test commands green: an agent diagnoses and
             fixes failures, then every command is re-run in plain Go as the
             final gate (-approve defaults to all here; exit 1 if the gate fails)
  watch      Poll the working tree and print a line whenever new changed paths
             appear since the watch started (-interval N seconds, default 5)
  hub        Manage a cross-repo registry at ~/.kaioken/hub.yaml (list | add
             [path] | remove <name> | status — exits 1 when any repo is stale)
  hook       Manage the post-commit auto-update hook (install|remove|status)
  daemon     Serve the engine over a loopback HTTP API (used by Kaioken Desktop)
  upgrade    Update kaioken itself to the latest GitHub release
             (positional "check" only reports whether a newer version exists)
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
	// A previous `kaioken upgrade` may have left the replaced binary behind
	// as *.old (Windows locks a running exe); remove it now, best-effort.
	selfupdate.CleanupOld()

	// Bare `kaioken` and `kaioken tui` hand the terminal to the alt-screen,
	// where a stray line of stderr corrupts the display — those runs refresh
	// the update cache silently and let a later command print the notice.
	interactive := len(os.Args) < 2 || os.Args[1] == "tui"
	updateNotice(interactive)

	if len(os.Args) < 2 {
		// Bare `kaioken` launches the interactive TUI.
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
	case "run":
		err = cmdRun(ctx, args)
	case "rpc":
		err = cmdRPC(ctx, args)
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
	case "impact":
		err = cmdImpact(ctx, args)
	case "export":
		err = cmdExport(args)
	case "ext", "extension", "extensions":
		err = cmdExt(ctx, args)
	case "mcp":
		err = cmdMCP(ctx, args, os.Args[2:])
	case "index":
		err = cmdIndex(ctx, args)
	case "search":
		err = cmdSearch(ctx, args)
	case "prism":
		err = cmdPrism(ctx, args)
	case "review":
		err = cmdReview(ctx, args)
	case "usage", "cost":
		err = cmdUsage(ctx, args)
	case "research":
		err = cmdResearch(ctx, args)
	case "serve":
		err = cmdServe(ctx, args)
	case "publish":
		err = cmdPublish(args)
	case "pack":
		err = cmdPack(args)
	case "onboard":
		err = cmdOnboard(args)
	case "gitdraft", "draft":
		err = cmdGitDraft(ctx, args)
	case "handoff":
		err = cmdHandoff(ctx, args)
	case "verify":
		err = cmdVerify(ctx, args)
	case "watch":
		err = cmdWatch(ctx, args)
	case "hub":
		err = cmdHub(ctx, args)
	case "hook":
		err = cmdHook(args)
	case "daemon":
		err = cmdDaemon(ctx, args)
	case "upgrade", "self-update", "selfupdate":
		err = cmdUpgrade(ctx, args)
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

	// Booked before the error branch on purpose: a run that failed halfway
	// still spent what it spent, and os.Exit would skip a deferred call.
	bookSpend(cmd, args.repo)

	if err != nil {
		// status -check speaks in exit codes: stale is a finding, not an
		// error, so it gets no "error:" prefix.
		if errors.Is(err, errStale) {
			os.Exit(1)
		}
		var ce *cliExit
		if errors.As(err, &ce) {
			if ce.err != nil {
				fmt.Fprintln(os.Stderr, "error:", ce.err)
			}
			os.Exit(ce.code)
		}
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
	full       bool
	out        string
	positional string
	// positionals keeps every positional in order, for commands like `ext`
	// that take a subcommand plus an argument. positional stays the last one
	// so existing single-positional commands are unaffected.
	positionals []string
	token       string
	tokenStdin  bool
	// run/rpc flags: the headless prompt, permission mode, approval policy,
	// and JSON event output.
	prompt  string
	mode    string
	approve string
	jsonOut bool
	// deep turns on the long-form research dossier below ×10, and pdf asks
	// for the PDF artifact. Deep runs write one anyway; the flag is for
	// re-rendering or for a shallower run the user still wants as a document.
	deep bool
	pdf  bool
	// resume reopens an interrupted research run by id; verify turns on
	// opt-in cross-path checking of load-bearing claims; fetcher pins how
	// pages are read.
	resume  string
	verify  bool
	fetcher string
	// check turns `status` into the CI drift gate: no fixes, just an exit
	// code a pipeline can gate on.
	check bool
	// extract names a knowledge bundle for `pack -extract <file>`.
	extract string
	// compare turns `impact` into a prediction-vs-reality check against the
	// newest saved report.
	compare bool
	// interval sets the polling interval in seconds for `watch`.
	interval int
}

// cliExit carries an explicit process exit code alongside the error, for
// commands whose contract is coded in exit codes (status -check: 1 stale,
// 2 error). err may be nil when the command already printed its output.
type cliExit struct {
	code int
	err  error
}

func (e *cliExit) Error() string {
	if e.err != nil {
		return e.err.Error()
	}
	return fmt.Sprintf("exit %d", e.code)
}

func (e *cliExit) Unwrap() error { return e.err }

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
		case "-deep", "--deep":
			f.deep = true
		case "-pdf", "--pdf":
			f.pdf = true
		case "-resume", "--resume":
			if i+1 < len(argv) {
				i++
				f.resume = argv[i]
			}
		case "-verify", "--verify":
			f.verify = true
		case "-check", "--check":
			f.check = true
		case "-extract", "--extract":
			if i+1 < len(argv) {
				i++
				f.extract = argv[i]
			}
		case "-compare", "--compare":
			f.compare = true
		case "-interval", "--interval":
			if i+1 < len(argv) {
				i++
				fmt.Sscanf(argv[i], "%d", &f.interval)
			}
		case "-force", "--force":
			f.force = true
		case "-full", "--full":
			f.full = true
		case "-out", "--out":
			if i+1 < len(argv) {
				i++
				f.out = argv[i]
			}
		case "-token", "--token":
			if i+1 < len(argv) {
				i++
				f.token = argv[i]
			}
		case "-token-stdin", "--token-stdin":
			f.tokenStdin = true
		case "-p", "-prompt", "--prompt":
			if i+1 < len(argv) {
				i++
				f.prompt = argv[i]
			}
		case "-mode", "--mode":
			if i+1 < len(argv) {
				i++
				f.mode = argv[i]
			}
		case "-fetcher", "--fetcher":
			if i+1 < len(argv) {
				i++
				f.fetcher = argv[i]
			}
		case "-approve", "--approve":
			if i+1 < len(argv) {
				i++
				f.approve = argv[i]
			}
		case "-json", "--json":
			f.jsonOut = true
		default:
			f.positional = argv[i]
			f.positionals = append(f.positionals, argv[i])
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
	printRiskFlags(f.repo, res)
	return nil
}

// printRiskFlags surfaces the scan's risk findings and persists them to
// .kaioken/risk.json so the approval dialog can consult them later. A save
// failure never fails the scan itself — the findings were already printed.
func printRiskFlags(repo string, res *scan.Result) {
	if len(res.Flags) == 0 {
		return
	}
	fmt.Printf("\nrisk: %d finding(s)\n", len(res.Flags))
	for _, fl := range res.Flags {
		fmt.Printf("  ⚠ %-16s %s — %s\n", fl.Kind, fl.Path, fl.Detail)
	}
	if err := res.SaveFlags(repo); err != nil {
		fmt.Printf("  · could not persist risk.json: %v\n", err)
	}
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
	done, revised, skipped, failed := 0, 0, 0, 0
	var revisedIDs sync.Map
	opts.OnStart = func(id string) { fmt.Printf("  → generating %s\n", id) }
	opts.OnRevised = func(id string) { revisedIDs.Store(id, true) }
	opts.OnDone = func(id string, err error, wasSkipped bool) {
		switch {
		case err != nil:
			failed++
			fmt.Printf("  ✗ %s: %v\n", id, err)
		case wasSkipped:
			skipped++
		default:
			if _, ok := revisedIDs.Load(id); ok {
				revised++
				fmt.Printf("  ↻ %s (revised from diff)\n", id)
			} else {
				done++
				fmt.Printf("  ✓ %s\n", id)
			}
		}
	}

	fmt.Printf("generating cards with %s (concurrency %d) …\n", client.Model, cfg.Concurrency)
	err = generate.Run(ctx, f.repo, cfg, client, p, res, opts)
	fmt.Printf("\n%d generated, %d revised, %d up-to-date, %d failed in %s\n",
		done, revised, skipped, failed, time.Since(started).Round(time.Second))
	fmt.Printf("index: %s\n", config.Dir+"/KNOWLEDGE.md")
	return err
}

func cmdModels(ctx context.Context, f flags) error {
	// `kaioken models local` is the discovery path: probe every known local
	// inference server and report what is actually running. It is the answer
	// to "what can I use without a key", which the hosted catalog cannot give.
	if f.positional == "local" {
		return listLocalModels(ctx)
	}

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

// listLocalModels probes the local inference servers and prints what each one
// is serving, with the config line needed to use it.
func listLocalModels(ctx context.Context) error {
	found := llm.DiscoverLocal(ctx)

	running := 0
	for _, st := range found {
		label := st.Label
		if label == "" {
			label = st.Name
		}
		if !st.Running {
			fmt.Printf("  · %-12s %s\n", label, st.Error)
			continue
		}
		running++
		fmt.Printf("  ✓ %-12s %s (%dms)\n", label, st.BaseURL, st.LatencyMS)
		for _, m := range st.Models {
			fmt.Printf("      %s\n", m)
		}
		if len(st.Models) == 0 {
			fmt.Printf("      (no models pulled yet)\n")
		}
	}

	if running == 0 {
		fmt.Println("\nno local inference server is running.")
		fmt.Println("start one — Ollama, LM Studio, llama.cpp, vLLM or Jan — then run this again.")
		return nil
	}
	fmt.Printf("\n%d local server(s) running. To use one, set in .kaioken/config.yaml:\n", running)
	for _, st := range found {
		if st.Running && len(st.Models) > 0 {
			fmt.Printf("  provider: %s\n  model: %s\n", st.Name, st.Models[0])
			break
		}
	}
	fmt.Println("\nNo API key is needed for a local provider.")
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
	// Registering here rather than at each command's exit is what keeps the
	// spending ledger complete: every model-using command builds its client
	// through this function.
	trackSpend(c, provider)
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

	// Cards are part of the update story too: modules whose sources changed
	// get revised (or rebuilt) so `update` refreshes everything the engine
	// generated. No module plan simply means there are no cards to refresh.
	if p, perr := plan.Load(f.repo); perr == nil {
		fmt.Println("\nrefreshing knowledge cards …")
		cardStart := time.Now()
		done, revised, failed := 0, 0, 0
		var revisedIDs sync.Map
		cardOpts := generate.Options{
			OnRevised: func(id string) { revisedIDs.Store(id, true) },
			OnDone: func(id string, err error, wasSkipped bool) {
				switch {
				case err != nil:
					failed++
					fmt.Printf("  ✗ %s: %v\n", id, err)
				case wasSkipped:
				default:
					if _, ok := revisedIDs.Load(id); ok {
						revised++
						fmt.Printf("  ↻ %s (revised from diff)\n", id)
					} else {
						done++
						fmt.Printf("  ✓ %s\n", id)
					}
				}
			},
		}
		if gerr := generate.Run(ctx, f.repo, cfg, client, p, res, cardOpts); gerr != nil {
			fmt.Printf("  card refresh finished with errors: %v\n", gerr)
		}
		if done+revised+failed == 0 {
			fmt.Println("  cards already up-to-date")
		} else {
			fmt.Printf("  %d rebuilt, %d revised, %d failed in %s\n",
				done, revised, failed, time.Since(cardStart).Round(time.Second))
		}
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

// cmdExport flattens the generated knowledge into another tool's context
// file. Pure assembly — no client, no key, no cost.
func cmdExport(f flags) error {
	if f.positional == "" {
		fmt.Println("usage: kaioken export <target> [-out path] [-force] [-full]\n\ntargets:")
		for _, t := range export.Targets() {
			fmt.Printf("  %-14s → %-14s %s\n", t.Name, t.Default, t.Desc)
		}
		return nil
	}
	opts := export.Options{Out: f.out, Force: f.force, Full: f.full}
	out, err := export.Run(f.repo, f.positional, opts)
	if err != nil {
		return err
	}
	fmt.Printf("wrote %s\n", out)
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

// cmdUpgrade updates the kaioken binary itself from the latest GitHub
// release. `kaioken upgrade check` only reports; `kaioken upgrade` applies.
// `kaioken upgrade rollback` restores the previous version.
func cmdUpgrade(ctx context.Context, f flags) error {
	// The positional argument is either a verb (check / rollback) or a
	// channel name. They share one slot, so they must not be conflated:
	// passing "check" through as a channel would query a channel nobody
	// publishes to and report that no build exists for this machine.
	var (
		arg       = strings.ToLower(strings.TrimSpace(f.positional))
		checkOnly bool
		channel   string
	)
	switch arg {
	case "":
		// no argument: install from the configured channel
	case "check":
		checkOnly = true
	case "rollback":
		if err := selfupdate.Rollback(); err != nil {
			return fmt.Errorf("rollback failed: %w", err)
		}
		fmt.Println("✓ rolled back to the previous version")
		fmt.Println("the restored version is used from your next invocation")
		return nil
	case selfupdate.ChannelStable, selfupdate.ChannelBeta, selfupdate.ChannelNightly:
		channel = arg
	default:
		fmt.Fprintf(os.Stderr, "unknown upgrade subcommand %q\n", f.positional)
		fmt.Fprintln(os.Stderr, "usage: kaioken upgrade [check|stable|beta|nightly|rollback]")
		os.Exit(2)
	}

	cfg := config.LoadGlobal()
	if channel == "" {
		channel = cfg.SelfUpdate.Channel
	}
	channel = selfupdate.NormalizeChannel(channel)

	rel, newer, err := selfupdate.Check(ctx, version.Version, channel)
	switch {
	case errors.Is(err, selfupdate.ErrNoRelease):
		return fmt.Errorf("nothing has been published on the %s channel yet", channel)
	case errors.Is(err, selfupdate.ErrNoAssetForPlatform):
		return fmt.Errorf("%w — build from source instead", err)
	case err != nil:
		return err
	}
	if !newer {
		fmt.Printf("kaioken %s is up to date (latest %s release: %s)\n", version.Version, channel, rel.Version)
		return nil
	}
	if checkOnly {
		fmt.Printf("update available: %s → %s (%s channel)\n", version.Version, rel.Version, channel)
		fmt.Println("run `kaioken upgrade` to install it")
		return nil
	}
	fmt.Printf("updating %s → %s (%s, %s channel)…\n", version.Version, rel.Version, rel.AssetName, channel)
	// No pre-flight warnings: missing verification material is not something
	// to note on the way past. Apply refuses the install and says which
	// artifact was absent.

	// The progress line redraws itself with \r, so it needs a closing
	// newline before the result — but only when it was actually drawn.
	var progressFunc func(downloaded, total int64)
	if cfg.SelfUpdate.ShowProgress {
		progressFunc = func(downloaded, total int64) {
			pct := float64(downloaded) / float64(total) * 100
			fmt.Printf("\r  downloading: %.1f%% (%s / %s)", pct, formatBytes(downloaded), formatBytes(total))
		}
	}

	path, err := selfupdate.Apply(ctx, rel, progressFunc)
	if err != nil {
		return err
	}
	if progressFunc != nil {
		fmt.Println()
	}
	fmt.Printf("✓ installed kaioken %s at %s\n", rel.Version, path)
	fmt.Println("the new version is used from your next invocation")
	return nil
}

// cmdResearch answers a question from the open web: it plans subquestions,
// searches, reads pages, reasons over them, then looks for what is still
// missing and searches again. The positional argument may lead with a
// multiplier like "x3"; everything after it is the question.
func cmdResearch(ctx context.Context, f flags) error {
	mult, question := parseResearchArgs(f.positionals)
	if question == "" {
		return fmt.Errorf("usage: kaioken research [xN] \"<question>\"")
	}

	cfg, err := config.Load(f.repo)
	if err != nil {
		// Research never reads the repository, so an uninitialised directory
		// is no reason to refuse. Fall back to defaults plus whatever
		// provider and model the user set globally.
		cfg = config.Default()
		g := config.LoadGlobal()
		if g.DefaultProvider != "" {
			cfg.Provider = g.DefaultProvider
		}
		if g.DefaultModel != "" {
			cfg.Model = g.DefaultModel
		}
	}
	client, err := newClient(cfg, f)
	if err != nil {
		return err
	}

	global := config.LoadGlobal()
	provider, err := websearch.Resolve(global.Research.SearchProvider, global.Keys)
	if err != nil {
		return err
	}
	// The cascade's derived role-clients join the spending ledger too: a
	// run with per-role models configured is a multi-model spend, and the
	// ledger is the one place the user sees all of it.
	ledgerProvider := cfg.Provider
	if ledgerProvider == "" {
		ledgerProvider = "openrouter"
	}
	research.TrackClient = func(c *llm.Client) { trackSpend(c, ledgerProvider) }

	opts := research.Options{
		Multiplier:  mult,
		MaxRounds:   global.Research.MaxRounds,
		MaxDuration: global.Research.ResearchTimeout(),
		Deep:        f.deep || f.pdf,
		Mode:        f.mode,
		Resume:      f.resume,
		Verify:      f.verify || global.Research.Verify,
		FetcherMode: f.fetcher,
		Repo:        f.repo,
	}

	limit, _ := cfg.EffectiveConcurrency(client.Model)
	opts.Concurrency = limit
	deep := mult >= research.DeepMultiplier || opts.Deep
	fmt.Printf("kaioken ×%d research (%s preset) with %s via %s (concurrency %d) …\n",
		mult, research.PresetName(mult, deep), client.Model, provider.Name(), limit)
	fmt.Printf("  question: %s\n", question)
	if f.resume != "" {
		fmt.Printf("  resuming run %s\n", f.resume)
	}
	if deep {
		// A deep run reads hundreds of pages and makes dozens of model calls.
		// Saying so before it starts is cheaper than a surprised user
		// cancelling ten minutes in.
		fmt.Printf("  deep dossier: up to %d pages read, sectioned report with appendices, PDF output\n",
			research.ScanCeiling(mult, opts.Deep))
		fmt.Printf("  highest quality this app can produce, at the highest token cost — check your balance before you press go\n")
	}

	started := time.Now()
	rep, err := research.Run(ctx, client, provider, question, opts, research.Progress{
		Stage:  func(s string) { fmt.Println("  → " + s) },
		Detail: func(s string) { fmt.Println("    " + s) },
		Round:  func(n, of int) { fmt.Printf("  round %d/%d\n", n, of) },
	})
	if err != nil {
		return err
	}

	out := f.out
	if out == "" {
		out = filepath.Join(f.repo, config.Dir, "research", slugify(question)+".md")
	}
	if err := os.MkdirAll(filepath.Dir(out), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(out, []byte(rep.Render()), 0o644); err != nil {
		return err
	}

	// Keep the structured JSON twin in the repo's research directory so the
	// run shows up in the saved history (daemon and desktop) even when the
	// markdown itself went elsewhere via -out.
	relOut, relErr := filepath.Rel(f.repo, out)
	if relErr != nil || strings.HasPrefix(relOut, "..") {
		relOut = ""
	}
	prov := research.Provenance{
		Model: client.Model, SearchProvider: provider.Name(), Multiplier: mult,
	}
	if _, err := research.Save(filepath.Join(f.repo, config.Dir, "research"), rep, filepath.ToSlash(relOut), prov); err != nil {
		fmt.Printf("  warning: could not save research history: %v\n", err)
	}

	fmt.Printf("\nresearch done in %s → %s\n", time.Since(started).Round(time.Second), out)
	if rep.RunID != "" {
		fmt.Printf("  run state: %s (resume with --resume %s)\n",
			filepath.Join(config.GlobalDir(), "runs", rep.RunID), rep.RunID)
	}
	if rep.Path != "" {
		if rep.Escalated {
			fmt.Printf("  path: %s (promoted from the fast path mid-run)\n", rep.Path)
		} else {
			fmt.Printf("  path: %s\n", rep.Path)
		}
	}

	// The dossier's own artifact. The Markdown twin is still written above:
	// it is what the repo, the desktop history and any diff can read.
	if rep.Deep != nil {
		pdfPath := strings.TrimSuffix(out, filepath.Ext(out)) + ".pdf"
		pages, perr := reportpdf.WriteFile(rep, reportpdf.Meta{
			Tool: "kaioken", Version: version.Version, Model: client.Model,
			Provider: provider.Name(), Multiplier: mult,
		}, pdfPath)
		if perr != nil {
			fmt.Printf("  warning: could not write the PDF: %v\n", perr)
		} else {
			fmt.Printf("  dossier → %s (%d pages, %d chapters)\n",
				pdfPath, pages, len(rep.Deep.Chapters()))
		}
	}

	fmt.Printf("  %d round(s), %d queries, %d sources read, %d cited\n",
		rep.Rounds, rep.Searched, rep.Fetched, len(rep.Sources))
	if rep.Incomplete {
		fmt.Println("  note: some subquestions stayed thinly evidenced when the run ended")
	}
	for _, w := range rep.Warnings {
		fmt.Println("  note: " + w)
	}
	// The line-itemised meter: one price, computed the same way, whichever
	// path ran — searches and fetches alongside the token classes, with the
	// reasoning column that dominates a research run shown of its own.
	cost := rep.Cost
	estimate := ""
	if !cost.Exact {
		estimate = " (estimated)"
	}
	fmt.Printf("  cost%s: %d searches, %d fetches, %d in + %d out + %d reasoning tokens, $%.4f\n",
		estimate, cost.Searches, cost.Fetches,
		cost.InputTokens, cost.OutputTokens, cost.ReasoningTokens, cost.USD)
	calls, promptToks, completionToks := client.Usage()
	fmt.Printf("  primary model: %d calls, %d prompt + %d completion tokens\n",
		calls, promptToks, completionToks)
	return nil
}

// parseResearchArgs splits an optional leading ×N multiplier from the
// question. The multiplier is only consumed when the whole word is "x" plus
// digits: a question like "xbox exclusives 2025" must keep its first word.
func parseResearchArgs(args []string) (mult int, question string) {
	mult = 3 // x3 by default, matching the wiki pipeline
	if len(args) > 0 {
		if n, ok := parseMultiplier(args[0]); ok {
			mult, args = n, args[1:]
		}
	}
	return mult, strings.TrimSpace(strings.Join(args, " "))
}

// parseMultiplier recognises "x3", "X10" and nothing else.
func parseMultiplier(s string) (int, bool) {
	s = strings.ToLower(strings.TrimSpace(s))
	if len(s) < 2 || s[0] != 'x' {
		return 0, false
	}
	n := 0
	for _, r := range s[1:] {
		if r < '0' || r > '9' {
			return 0, false
		}
		n = n*10 + int(r-'0')
	}
	if n < 1 {
		return 0, false
	}
	return n, true
}

// slugify turns a question into a filename stem.
func slugify(s string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(s) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			dash = false
		default:
			if !dash && b.Len() > 0 {
				b.WriteByte('-')
				dash = true
			}
		}
		if b.Len() >= 60 {
			break
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "research"
	}
	return out
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

func formatBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

// updateNotice prints the pending "update available" line from the last
// background check, then starts the next check if the cached one has aged
// past the configured interval. The check never prints anything itself: it
// outlives nothing, races the command's own output, and would have to hold
// up every invocation for a network round-trip to be worth reporting live.
//
// Checks only ever notify — kaioken does not replace its own binary behind
// the user's back, so `upgrade` stays an explicit command.
func updateNotice(interactive bool) {
	su := config.LoadGlobal().SelfUpdate
	if !su.Enabled || su.IntervalHours <= 0 {
		return
	}
	if !interactive {
		if msg, ok := selfupdate.CachedNotice(config.GlobalDir(), version.Version, su.Channel); ok {
			fmt.Fprintln(os.Stderr, msg)
		}
	}
	selfupdate.RefreshInBackground(config.GlobalDir(), version.Version, su.Channel,
		time.Duration(su.IntervalHours)*time.Hour)
}
