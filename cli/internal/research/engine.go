package research

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"kaioken/internal/config"
	"kaioken/internal/llm"
	"kaioken/internal/websearch"
)

// The engine is the outer system the hybrid design describes: two execution
// paths over one shared control plane, with a router deciding which path a
// question needs and escalation promoting one into the other. Whatever runs,
// the run state, the source store and the cost meter are the same objects —
// that is what makes a promotion a continuation instead of a restart.

type engine struct {
	question string
	opts     Options
	mult     int
	dossier  bool // long-form output: deep path + sectioned document + PDF
	mode     string

	shape  plan   // the ×N-derived loop shape (rounds, subquestions, …)
	budget Budget // the hard stops this run works inside

	clients *Clients
	meter   *Meter
	store   *SourceStore
	pool    *corpus
	state   *RunState

	provider websearch.Provider
	fetcher  Fetcher
	web      Retriever
	code     Retriever
	multi    Retriever

	pg      Progress
	asOf    string
	started time.Time
	workers int

	mu        sync.Mutex
	warnings  []string
	queryLog  []string
	escalated bool
	route     Route
	reason    string
}

// newEngine assembles the control plane for one run.
func newEngine(ctx context.Context, client *llm.Client, provider websearch.Provider,
	question string, opts Options, pg Progress) (*engine, error) {

	global := config.LoadGlobal()
	mult := clampInt(opts.Multiplier, 1, 10)

	mode := strings.ToLower(strings.TrimSpace(opts.Mode))
	if mode == "" {
		mode = strings.ToLower(strings.TrimSpace(global.Research.Mode))
	}
	switch mode {
	case "", "auto":
		mode = "auto"
	case "fast", "deep":
	default:
		return nil, fmt.Errorf("unknown research mode %q (want auto, fast or deep)", opts.Mode)
	}

	budget := budgetFor(mult, opts.Deep)
	if global.Research.MaxCostUSD > 0 {
		budget.MaxCostUSD = global.Research.MaxCostUSD
	}

	// Resume reopens an existing run directory; otherwise a new one is
	// minted. Either way everything that follows shares it.
	var state *RunState
	var err error
	if opts.Resume != "" {
		state, err = OpenRun(opts.Resume)
		if err != nil {
			return nil, err
		}
		if state.Snapshot().Query != question {
			return nil, fmt.Errorf("run %s belongs to a different question (%q)", opts.Resume, state.Snapshot().Query)
		}
		// A continued run runs under the dial it started under, whatever
		// the resume request carries: shape and budgets derive from it.
		if saved := state.Snapshot().Multiplier; saved > 0 {
			mult = clampInt(saved, 1, 10)
			budget = budgetFor(mult, opts.Deep)
			if global.Research.MaxCostUSD > 0 {
				budget.MaxCostUSD = global.Research.MaxCostUSD
			}
		}
	} else {
		state, err = NewRun(question, mode)
		if err != nil {
			return nil, err
		}
		state.Mutate(func(r *RunMeta) { r.Multiplier = mult })
		_ = state.Checkpoint()
	}

	dossier := opts.Deep || mult >= DeepMultiplier

	store := NewSourceStore(state.SourcesDir())
	store.SetEventLogger(state.Event)
	if opts.Resume != "" {
		if err := LoadSources(store, state.SourcesDir()); err != nil {
			return nil, err
		}
	}

	clients := NewClients(client, global.Research.Models)
	meter := NewMeter(clients)

	fetcher, fetcherDetail, err := resolveFetcher(opts, global, provider)
	if err != nil {
		return nil, err
	}
	pg.detail(fetcherDetail)

	shape := planFor(mult, opts.Deep)
	e := &engine{
		question: question,
		opts:     opts,
		mult:     mult,
		dossier:  dossier,
		mode:     mode,
		shape:    shape,
		budget:   budget,
		clients:  clients,
		meter:    meter,
		store:    store,
		pool:     newCorpus(shape.perHost),
		state:    state,
		provider: provider,
		fetcher:  fetcher,
		pg:       pg,
		asOf:     asOfLine(opts.Now),
		started:  time.Now(),
		workers:  clampInt(opts.Concurrency, 1, 16),
	}
	e.web, e.code, e.multi = retrieversFor(provider, fetcher, store, meter, opts.Repo)

	// A resumed run rebuilds its evidence pool from the store, so citations
	// and chunk ranking work exactly as they did before the crash.
	if opts.Resume != "" {
		e.pool.addDocs(store.Docs())
	}
	return e, nil
}

// deadline reports whether the run's time budget is spent. The user's
// explicit limit wins; otherwise the preset's wall clock applies.
func (e *engine) deadline() bool {
	if e.opts.MaxDuration > 0 {
		return time.Since(e.started) >= e.opts.MaxDuration
	}
	return e.budget.WallClock > 0 && time.Since(e.started) >= e.budget.WallClock
}

// costReached reports whether the spend has hit the ceiling.
func (e *engine) costReached() bool {
	return e.meter.CostExceeded(e.budget.MaxCostUSD)
}

func (e *engine) addWarning(w string) {
	e.mu.Lock()
	e.warnings = append(e.warnings, w)
	e.mu.Unlock()
}

func (e *engine) warningsList() []string {
	e.mu.Lock()
	defer e.mu.Unlock()
	return append([]string(nil), e.warnings...)
}

// noteQuery appends to the run's search log — the audit trail a deep
// dossier publishes, and what a resumed run rebuilds from.
func (e *engine) noteQuery(queries ...string) {
	e.mu.Lock()
	e.queryLog = append(e.queryLog, queries...)
	e.mu.Unlock()
}

func (e *engine) querySnapshot() []string {
	e.mu.Lock()
	defer e.mu.Unlock()
	return append([]string(nil), e.queryLog...)
}

// execute runs the whole hybrid pipeline and returns the finished report.
func (e *engine) execute(ctx context.Context) (*Report, error) {
	snap := e.state.Snapshot()
	resuming := e.opts.Resume != ""

	// ---- routing ----------------------------------------------------------
	// Routing decides orchestration, not output format. A dossier run keeps
	// its long-form scan loop and sectioned document regardless — that is
	// the product ×10 has always been. The router chooses between paths
	// only for ordinary runs.
	var decision routeDecision
	switch {
	case resuming && snap.Path != "":
		decision = routeDecision{Route: parseRoute(snap.Path), Reason: "restored from checkpoint"}
	case e.dossier:
		decision = routeDecision{RouteFast, "deep dossier: the long-form scan loop"}
	case e.mode == "fast":
		decision = routeDecision{RouteFast, "pinned by mode=fast"}
	case e.mode == "deep":
		decision = routeDecision{RouteDeep, "pinned by mode=deep"}
	default:
		decision = triage(ctx, e.clients.For(RoleRouter), e.question)
	}
	e.route, e.reason = decision.Route, decision.Reason
	e.state.Mutate(func(r *RunMeta) {
		r.Path = e.route.String()
	})
	e.state.Event("route", fmt.Sprintf("%s — %s", e.route, decision.Reason))
	e.pg.detail(fmt.Sprintf("route: %s path (%s)", e.route, decision.Reason))

	// ---- research ---------------------------------------------------------
	if err := e.state.SetPhase(PhaseResearch); err != nil {
		return nil, err
	}

	var out pathOutcome
	var err error
	if e.route == RouteFast {
		out, err = e.runFast(ctx)
		if err != nil {
			return nil, err
		}
		// Escalation is a promotion, not a restart: the corpus and the
		// store carry straight over, and the meter keeps its totals.
		if why, ok := e.shouldEscalate(out); ok {
			e.pg.detail("escalating to the deep path: " + why)
			e.state.Event("escalate", why)
			e.markEscalated()
			e.state.Mutate(func(r *RunMeta) {
				r.Path = "deep"
				r.EscalatedFrom = "fast"
			})
			_ = e.state.Checkpoint()
			out, err = e.runDeep(ctx, out)
			if err != nil {
				return nil, err
			}
		}
	} else {
		out, err = e.runDeep(ctx, pathOutcome{})
		if err != nil {
			return nil, err
		}
	}

	findings := ordered(out.subs, out.answered)
	if len(findings) == 0 {
		return nil, fmt.Errorf("no findings produced for %q", e.question)
	}

	// ---- write ------------------------------------------------------------
	if err := e.state.SetPhase(PhaseWrite); err != nil {
		return nil, err
	}
	sources := e.pool.cited()

	var md string
	var deep *Deep
	if e.dossier {
		deep, md, err = buildDossier(ctx, e.clients.For(RoleWrite), e.question, findings, e.pool, e.shape.evidence, e.workers, e.asOf, e.pg)
	} else {
		e.pg.stage("writing the report")
		md, err = synthesize(ctx, e.clients.For(RoleWrite), e.question, findings, sources, e.asOf)
	}
	if err != nil {
		return nil, err
	}

	// ---- cite -------------------------------------------------------------
	// The grounding pass checks the draft against the raw documents. It
	// runs whenever its result could still change the run — a deep path
	// wants the grounding flags, a fast path that may still escalate needs
	// the signal — and is skipped only when nothing could follow from it.
	var grounding *Grounding
	if e.wantsCitePass() && !e.costReached() {
		if err := e.state.SetPhase(PhaseCite); err != nil {
			return nil, err
		}
		e.pg.stage("grounding claims against sources")
		grounding, err = e.citePass(ctx, md, sources)
		if err != nil {
			e.pg.detail("citation pass failed: " + err.Error())
			e.addWarning("the citation grounding pass failed: " + err.Error())
			grounding = nil
		}
	}

	// Grounding failure on a load-bearing claim escalates a contained fast
	// run after the fact: the deep path re-researches, the report is
	// rewritten. At most once per run.
	if grounding != nil && grounding.LoadBearingFailed() && e.canEscalateAfterCite() {
		e.pg.detail("escalating to the deep path: citation grounding failed a load-bearing claim")
		e.state.Event("escalate", "citation grounding failed a load-bearing claim")
		e.markEscalated()
		e.state.Mutate(func(r *RunMeta) {
			r.Path = "deep"
			if r.EscalatedFrom == "" {
				r.EscalatedFrom = "fast"
			}
		})
		_ = e.state.Checkpoint()

		out, err = e.runDeep(ctx, out)
		if err != nil {
			return nil, err
		}
		findings = ordered(out.subs, out.answered)
		sources = e.pool.cited()
		e.pg.stage("rewriting the report")
		md, err = synthesize(ctx, e.clients.For(RoleWrite), e.question, findings, sources, e.asOf)
		if err != nil {
			return nil, err
		}
		grounding, err = e.citePass(ctx, md, sources)
		if err != nil {
			grounding = nil
		}
		deep = nil // a post-cite escalation produces the standard shape
	}

	// Ungrounded claims are flagged in the report, never silently dropped.
	if grounding != nil && len(grounding.Ungrounded) > 0 {
		md += groundingFlags(grounding)
	}

	// ---- verify (opt-in) ---------------------------------------------------
	var checks []verifyResult
	if e.opts.Verify || config.LoadGlobal().Research.Verify {
		checks = e.verifyClaims(ctx, out)
		if len(checks) > 0 {
			md += verifySection(checks)
		}
	}

	// ---- assemble ---------------------------------------------------------
	// Only sources the report actually cites belong in the reference list.
	md, used := rewriteCitations(md, sources)

	if deep != nil {
		deep.Queries = out.queries
		deep.Findings = findingNotes(findings)
		deep.Scanned = scannedPages(e.pool, used)
		md += SearchLog(deep.Queries) + ScanLog(deep.Scanned)
		deep.Sections = SplitSections(md)
		deep.Summary = stripToProse(firstSection(md))
	}

	e.state.Mutate(func(r *RunMeta) {
		r.Phase = PhaseDone
	})
	_ = e.state.Checkpoint()
	_ = e.state.WriteReport(md)

	e.mu.Lock()
	escalated := e.escalated
	e.mu.Unlock()
	run := e.state.Snapshot()

	return &Report{
		Question: e.question,
		Markdown: md,
		Sources:  used,
		Rounds:   out.roundsRun,
		Searched: e.meter.searchCount(),
		Fetched:  len(sources),
		Elapsed:  time.Since(e.started),
		// Recomputed from the findings that ended up in the report, not
		// latched the first time a gap appeared.
		Incomplete:    anyLowConfidence(findings),
		Warnings:      e.warningsList(),
		Deep:          deep,
		Path:          run.Path,
		RunID:         run.ID,
		Escalated:     escalated,
		EscalatedFrom: run.EscalatedFrom,
		Grounding:     grounding,
		Cost:          e.meter.Snapshot(),
	}, nil
}

// markEscalated promotes the run to the deep path.
//
// Both the flag and the route move together, and they must. Escalation used
// to update only the persisted r.Path, leaving e.route saying "fast" for the
// rest of the run -- so wantsCitePass below failed all three of its terms at
// once and skipped grounding entirely, on exactly the runs that had just
// promoted themselves because the fast path was not rigorous enough.
func (e *engine) markEscalated() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.escalated, e.route = true, RouteDeep
}

// wantsCitePass reports whether the grounding pass could still change
// this run: a deep path wants the flags, and a fast path that may yet
// escalate needs the signal. It is skipped only when nothing could follow
// from it.
//
// This reads e.route, which is why escalation must update it. While it did
// not, an escalated auto run failed all three terms at once and skipped
// grounding entirely -- on exactly the runs that promoted themselves
// because the fast path was not rigorous enough.
func (e *engine) wantsCitePass() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.opts.Verify || e.route == RouteDeep ||
		(e.mode == "auto" && !e.escalated && !e.dossier)
}

// canEscalateAfterCite reports whether a post-cite promotion is still on
// the table: auto mode only, once per run, and with budget left.
//
// It does not test e.route. Escalation now sets it to deep, so a route test
// here would be false for every run that had escalated and true only for
// ones that had not -- which is what !e.escalated already says, and says
// without silently disabling the second promotion the first time one fires.
func (e *engine) canEscalateAfterCite() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.mode == "auto" && !e.escalated && !e.dossier &&
		!e.costReached() && !e.deadline()
}
