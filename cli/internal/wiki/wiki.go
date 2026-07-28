// Package wiki implements Kaioken's deep documentation engine, modeled on the
// multi-pass flow of Qoder's Repo Wiki:
//
//	pass 1  — GLOBAL PLAN: the model surveys the whole repo and produces a
//	          wiki outline (sections with goals and relevant files).
//	pass 2  — per section: SUB-PLAN layered on the global plan — the model
//	          plans that section in detail (subsections, focus files).
//	pass 3  — per section: generate a long-form .md document; then one more
//	          document per planned subsection, each from its own file bundle.
//
// The multiplier (kaioken ×N) scales depth: ×1 section docs only, ×2 adds
// subsection docs (default), ×3+ pushes longer docs and more subsections.
package wiki

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"
	"gopkg.in/yaml.v3"

	"kaioken/internal/agentsmd"
	"kaioken/internal/codemap"
	"kaioken/internal/config"
	"kaioken/internal/llm"
	"kaioken/internal/scan"
)

// Section is one planned wiki chapter.
type Section struct {
	ID    string   `yaml:"id" json:"id"`
	Title string   `yaml:"title" json:"title"`
	Goal  string   `yaml:"goal" json:"goal"`
	Files []string `yaml:"files" json:"files"`
}

// Outline is the persisted global plan (pass 1) — user-editable.
type Outline struct {
	Version    int       `yaml:"version"`
	Multiplier int       `yaml:"multiplier"`
	Sections   []Section `yaml:"sections"`
}

// SubPlan is the per-section plan (pass 2).
type SubPlan struct {
	Summary     string       `json:"summary"`
	FocusFiles  []string     `json:"focus_files"`
	Subsections []Subsection `json:"subsections"`
}

// Subsection is one planned child document.
type Subsection struct {
	Title string   `json:"title"`
	Goal  string   `json:"goal"`
	Files []string `json:"files"`
}

// Progress receives live updates; any callback may be nil.
type Progress struct {
	Info    func(text string)
	Started func(what string)
	Wrote   func(path string, lines int)
	Failed  func(what string, err error)
}

func (p Progress) info(t string) {
	if p.Info != nil {
		p.Info(t)
	}
}
func (p Progress) started(w string) {
	if p.Started != nil {
		p.Started(w)
	}
}
func (p Progress) wrote(path string, lines int) {
	if p.Wrote != nil {
		p.Wrote(path, lines)
	}
}
func (p Progress) failed(w string, err error) {
	if p.Failed != nil {
		p.Failed(w, err)
	}
}

// OutlinePath is where the editable global plan lives.
func OutlinePath(repo string) string {
	return filepath.Join(repo, config.Dir, "wiki_plan.yaml")
}

// WikiDir is the output root for generated documents.
func WikiDir(repo string) string {
	return filepath.Join(repo, config.Dir, "wiki")
}

const outlineSystem = `You are a principal engineer planning a comprehensive wiki for a
repository — the kind of documentation a company builds for onboarding: complete,
hierarchical, grounded in the real code.

Design 8–16 top-level SECTIONS covering the whole system. Typical shapes: Getting Started,
Architecture Overview, each major subsystem/feature area, Data Models, API Reference,
Deployment & Infrastructure, Development Guide, Troubleshooting. Adapt to THIS repo — name
real subsystems, not generic placeholders.

For each section give:
- id: short snake_case
- title: human title
- goal: 1–2 sentences on what the section must explain
- files: the most relevant repo-relative files/dirs (used to gather source later)

Return ONLY JSON: {"sections":[{"id":"...","title":"...","goal":"...","files":["..."]}]}`

const subplanSystem = `You are planning ONE SECTION of a repository wiki in detail, building on
the global outline you are given. Think of this as zooming in: given the section's goal and
the actual source files, decide the structure of this chapter.

Return ONLY JSON:
{"summary":"2-3 sentence summary of what this section will cover",
 "focus_files":["files most important for the section's own overview document"],
 "subsections":[{"title":"...","goal":"one sentence","files":["repo-relative files for this subsection"]}]}

Rules: %d–%d subsections, each a real cohesive topic grounded in the provided files. Every
subsection's files must come from the section's file list. Order subsections logically.`

const docSystem = `You write one chapter of a repository wiki: comprehensive, factual,
long-form technical documentation grounded ONLY in the provided source files. Audience:
engineers onboarding onto the codebase.

The input gives you a STRUCTURE block (every file in scope, every declaration, with line
anchors) and a SOURCE block (full text of the most relevant files, plus selected complete
declarations from the larger ones). The STRUCTURE block is the authoritative inventory: it
lists everything that exists, even where the body was not included.

COMPLETENESS — this is how the chapter is judged, not by length:
- Every exported/public declaration in the STRUCTURE block is either documented or
  deliberately grouped into a described category. Nothing simply goes unmentioned.
- Every endpoint, route, CLI command, config key, environment variable and data model
  visible in the sources appears, in a table when there is more than one.
- Every non-obvious behavior you can support from the sources is explained.
Do NOT pad to reach a length. Do not restate the same point in different words. A shorter
chapter that covers everything beats a longer one that repeats itself.

STRUCTURE the document with:
- A title (# heading) and a short intro saying what the chapter covers
- A **Table of Contents** with anchor links
- Deep sections: architecture, data flow, key components — name REAL files, functions and
  types, and explain how they fit together
- Mermaid diagrams (graph/sequenceDiagram/classDiagram/erDiagram in fenced mermaid blocks)
  wherever structure or flow benefits from one. Diagram syntax must be valid.
- Tables for enumerable things (endpoints, models, config keys, commands)
- A "Referenced Files" list at the end citing every file you drew from

CODE EXCERPTS must be copied VERBATIM from the sources — never paraphrased, never
reconstructed from memory — and each must be immediately preceded by its anchor on its own
line, in this exact form:

` + "```" + `
` + anchorExample + `
` + "```" + `

For example:

    ### Client construction

    The provider registry is resolved before the key check:

    ` + "`internal/llm/openrouter.go:40-60`" + `

    ` + "```go" + `
    func NewForProvider(provName, baseURLOverride, model, apiKey string) (*Client, error) {
    ` + "```" + `

Only cite line ranges that appear in the STRUCTURE or SOURCE blocks. If you cannot quote
something verbatim, describe it in prose instead of inventing an excerpt.

NEVER invent files, functions, types, endpoints or behavior that are absent from the input.
Output ONLY the markdown document — no JSON, no commentary.`

// anchorExample documents the citation format in the prompt without tempting
// the model to copy a fake path.
const anchorExample = "`<repo-relative-path>:<startLine>-<endLine>`"

// depthDirective turns the Kaioken multiplier into a depth instruction. It
// describes how much ground to cover, never a line count — length targets make
// models pad.
func depthDirective(multiplier int) string {
	switch {
	case multiplier <= 1:
		return "\nDEPTH ×1: cover the public surface and the main flow. Keep explanations tight; " +
			"skip minor internal helpers."
	case multiplier == 2:
		return "\nDEPTH ×2: cover the public surface thoroughly, plus the internal structures a " +
			"maintainer needs. Include at least one diagram."
	default:
		return "\nDEPTH ×3+: exhaustive. Cover every declaration in the STRUCTURE block, internal " +
			"helpers included, with diagrams for each significant flow and tables for every " +
			"enumerable set. Explain error paths and edge cases the code actually handles."
	}
}

// run carries the state shared by every pass of a single wiki run, so adding a
// pass does not mean threading another parameter through five signatures.
type run struct {
	repo       string
	cfg        *config.Config
	client     *llm.Client
	res        *scan.Result
	idx        *codemap.Index
	outline    *Outline
	brief      string // the shared architecture brief injected into every prompt
	multiplier int
	force      bool
	pg         Progress
}

// Run executes the full multi-pass pipeline. If an outline already exists on
// disk it is reused (the user may have edited it); pass force to re-plan.
func Run(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
	res *scan.Result, multiplier int, force bool, pg Progress) error {

	if multiplier < 1 {
		multiplier = 3 // x3 is the default depth
	}
	if multiplier > 10 {
		multiplier = 10
	}

	r := &run{
		repo: repo, cfg: cfg, client: client, res: res,
		multiplier: multiplier, force: force, pg: pg,
	}

	// ---- pass 0: index the code's structure ----
	pg.started("indexing code structure")
	r.idx = codemap.Build(res)
	pg.info(fmt.Sprintf("indexed %d declarations across %d files",
		r.idx.SymbolCount(), len(r.idx.Files)))

	// ---- pass 1: global plan ----
	outline, err := loadOutline(repo)
	if err != nil || force || outline == nil || len(outline.Sections) == 0 {
		pg.started("global plan")
		outline, err = r.planOutline(ctx)
		if err != nil {
			return fmt.Errorf("global plan: %w", err)
		}
		outline.Multiplier = multiplier
		if err := saveOutline(repo, outline); err != nil {
			return err
		}
		pg.info(fmt.Sprintf("global plan: %d sections → %s", len(outline.Sections), OutlinePath(repo)))
	} else {
		pg.info(fmt.Sprintf("reusing existing wiki_plan.yaml (%d sections) — delete it or use force to re-plan", len(outline.Sections)))
	}
	r.outline = outline

	// Coverage: a plan that silently ignores half the repo should be visible
	// before generation spends tokens on it.
	r.reportCoverage()

	// ---- pass 1b: the shared architecture brief ----
	if err := r.loadOrBuildBrief(ctx); err != nil {
		pg.failed("architecture brief", err)
	}

	return r.runSections(ctx, outline.Sections)
}

// Retry regenerates only the sections the last run failed on, so one flaky
// timeout does not mean repeating a run that takes minutes. It reports how
// many sections were attempted.
func Retry(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
	res *scan.Result, pg Progress) (int, error) {

	outline, err := loadOutline(repo)
	if err != nil || outline == nil || len(outline.Sections) == 0 {
		return 0, fmt.Errorf("no wiki plan at %s — run the wiki first", OutlinePath(repo))
	}
	failed := LoadStamp(repo).Failed
	if len(failed) == 0 {
		return 0, nil
	}
	want := make(map[string]bool, len(failed))
	for _, f := range failed {
		want[f] = true
	}
	var sections []Section
	for _, sec := range outline.Sections {
		if want[sec.Title] {
			sections = append(sections, sec)
		}
	}
	if len(sections) == 0 {
		// The plan was edited since the failure; nothing left to retry.
		return 0, SaveStamp(repo, client.Model, outline.Multiplier, nil)
	}
	pg.info(fmt.Sprintf("retrying %d failed section(s)", len(sections)))
	multiplier := outline.Multiplier
	if multiplier < 1 {
		multiplier = 3
	}
	r := &run{
		repo: repo, cfg: cfg, client: client, res: res, outline: outline,
		multiplier: multiplier,
		force:      true, // a failed section may have left a partial document behind
		pg:         pg,
	}
	r.idx = codemap.Build(res)
	if err := r.loadOrBuildBrief(ctx); err != nil {
		pg.failed("architecture brief", err)
	}
	return len(sections), r.runSections(ctx, sections)
}

// failures collects section labels from the parallel workers.
type failures struct {
	mu   sync.Mutex
	list []string
}

func (f *failures) add(label string) {
	f.mu.Lock()
	f.list = append(f.list, label)
	f.mu.Unlock()
}

func (f *failures) sorted() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := append([]string(nil), f.list...)
	sort.Strings(out)
	return out
}

// runSections executes passes 2+3 over the given sections in parallel, then
// refreshes the index and the baseline stamp.
func (r *run) runSections(ctx context.Context, sections []Section) error {
	limit, clamped := r.cfg.EffectiveConcurrency(r.client.Model)
	if clamped {
		r.pg.info(fmt.Sprintf("free-tier model — concurrency capped at %d to avoid rate limits", limit))
	}
	fail := &failures{}
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(limit)
	for _, sec := range sections {
		sec := sec
		g.Go(func() error {
			if err := r.runSection(gctx, sec); err != nil {
				r.pg.failed(sec.Title, err)
				fail.add(sec.Title) // section failures don't abort the whole wiki
			}
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return err
	}
	// Cross-link chapters now that every document exists.
	if n, err := crossLink(r.repo, r.outline); err != nil {
		r.pg.failed("cross-linking", err)
	} else if n > 0 {
		r.pg.info(fmt.Sprintf("cross-linked %d reference(s) between chapters", n))
	}
	if err := writeIndex(r.repo, r.outline); err != nil {
		return err
	}
	if failed := fail.sorted(); len(failed) > 0 {
		r.pg.info(fmt.Sprintf("%d section(s) failed — retry just those with `wiki retry`", len(failed)))
	}
	// Record the commit this wiki reflects so `update` can diff against it.
	if err := SaveStamp(r.repo, r.client.Model, r.multiplier, fail.sorted()); err != nil {
		r.pg.failed("baseline", err)
	}
	// Point AGENTS.md at the chapters that now exist. This is a rewrite of a
	// delimited block, not an LLM call, and a no-op when there is no AGENTS.md.
	if changed, err := agentsmd.RefreshKnowledge(r.repo); err == nil && changed {
		r.pg.info("refreshed the knowledge section of " + agentsmd.FileName)
	}
	return nil
}

func (r *run) runSection(ctx context.Context, sec Section) error {
	dir := filepath.Join(WikiDir(r.repo), safeName(sec.Title))
	mainDoc := filepath.Join(dir, safeName(sec.Title)+".md")
	if !r.force {
		if _, err := os.Stat(mainDoc); err == nil {
			r.pg.info("skip (exists): " + sec.Title)
			return nil
		}
	}

	// ---- pass 2: sub-plan layered on the global outline ----
	r.pg.started("plan: " + sec.Title)
	sp, err := r.planSection(ctx, sec)
	if err != nil {
		return fmt.Errorf("sub-plan: %w", err)
	}

	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	meta := map[string]any{
		"section": sec, "summary": sp.Summary,
		"generated_at": time.Now().UTC().Format(time.RFC3339), "model": r.client.Model,
	}
	if raw, err := yaml.Marshal(meta); err == nil {
		_ = os.WriteFile(filepath.Join(dir, "_section.yaml"), raw, 0o644)
	}

	// ---- pass 3a: the section's own long-form document ----
	r.pg.started("write: " + sec.Title)
	secFiles := resolveFiles(r.res, sec.Files, sp.FocusFiles)
	doc, err := r.generateDoc(ctx, docRequest{
		Title:   sec.Title,
		Goal:    sec.Goal + "\n\nSection plan: " + sp.Summary,
		Outline: outlineContext(r.outline, sec.ID),
		Files:   secFiles,
	})
	if err != nil {
		return fmt.Errorf("section doc: %w", err)
	}
	if err := os.WriteFile(mainDoc, []byte(doc), 0o644); err != nil {
		return err
	}
	r.pg.wrote(rel(r.repo, mainDoc), countLines(doc))

	// ---- pass 3b: one document per planned subsection ----
	if r.multiplier < 2 {
		return nil
	}
	for _, sub := range sp.Subsections {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		subPath := filepath.Join(dir, safeName(sub.Title)+".md")
		if !r.force {
			if _, err := os.Stat(subPath); err == nil {
				continue
			}
		}
		r.pg.started("write: " + sec.Title + " / " + sub.Title)
		subFiles := resolveFiles(r.res, sub.Files, nil)
		if len(subFiles) == 0 {
			subFiles = secFiles
		}
		subDoc, err := r.generateDoc(ctx, docRequest{
			Title: sub.Title,
			Goal: sub.Goal + "\n\nThis document is a child of the section \"" +
				sec.Title + "\" (" + sec.Goal + ").",
			Outline: outlineContext(r.outline, sec.ID),
			Files:   subFiles,
		})
		if err != nil {
			r.pg.failed(sec.Title+" / "+sub.Title, err)
			continue
		}
		if err := os.WriteFile(subPath, []byte(subDoc), 0o644); err != nil {
			return err
		}
		r.pg.wrote(rel(r.repo, subPath), countLines(subDoc))
	}
	return nil
}

// ---- LLM passes ----

// planOutline designs the global wiki structure. It sees a structural skeleton
// of the repository, not just a directory listing, so sections can be named
// after real subsystems rather than plausible-sounding generic ones.
func (r *run) planOutline(ctx context.Context) (*Outline, error) {
	var user strings.Builder
	user.WriteString("Repository layout (dir → file count, sample files):\n\n")
	user.WriteString(r.res.TreeSummary(12))
	user.WriteString("\n\nKey manifest/config file contents:\n\n")
	user.WriteString(r.res.ManifestContents(4000))
	if r.idx != nil {
		user.WriteString("\n\nCode structure — the public surface of the richest files:\n\n")
		user.WriteString(r.idx.RepoSkeleton(planSkeletonTokens))
	}
	if facts := detectFacts(r.res, r.idx); facts.Any() {
		user.WriteString("\nDetected framework facts (real, extracted from the code):\n")
		user.WriteString(facts.Summary(40))
	}
	user.WriteString(r.notesBlock())

	var out struct {
		Sections []Section `json:"sections"`
	}
	if err := r.client.ChatJSON(ctx, outlineSystem, user.String(), &out); err != nil {
		return nil, err
	}
	if len(out.Sections) == 0 {
		return nil, fmt.Errorf("model returned an empty outline")
	}
	return &Outline{Version: 1, Sections: out.Sections}, nil
}

func (r *run) planSection(ctx context.Context, sec Section) (*SubPlan, error) {
	minSubs, maxSubs := 2, 4*r.multiplier
	if maxSubs > 12 {
		maxSubs = 12
	}
	files := resolveFiles(r.res, sec.Files, nil)

	var user strings.Builder
	user.WriteString("Global wiki outline (for context — do not duplicate other sections):\n")
	user.WriteString(outlineContext(r.outline, sec.ID))
	if r.brief != "" {
		user.WriteString("\nAuthoritative architecture brief for this repository:\n")
		user.WriteString(r.brief)
		user.WriteString("\n")
	}
	fmt.Fprintf(&user, "\nYOUR section:\n  id: %s\n  title: %s\n  goal: %s\n", sec.ID, sec.Title, sec.Goal)
	user.WriteString("\nStructure of the files available to this section:\n\n")
	if r.idx != nil {
		paths := make([]string, 0, len(files))
		for _, f := range files {
			paths = append(paths, f.Path)
		}
		user.WriteString(r.idx.Skeleton(paths))
	} else {
		for _, f := range files {
			fmt.Fprintf(&user, "  %s (%d lines)\n", f.Path, f.Lines)
		}
	}

	var sp SubPlan
	if err := r.client.ChatJSON(ctx, fmt.Sprintf(subplanSystem, minSubs, maxSubs), user.String(), &sp); err != nil {
		return nil, err
	}
	return &sp, nil
}

// notesBlock renders the maintainer's steering notes for any prompt.
func (r *run) notesBlock() string {
	if len(r.cfg.Notes) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("\nMaintainer steering notes (authoritative):\n")
	for _, n := range r.cfg.Notes {
		b.WriteString("- " + n + "\n")
	}
	return b.String()
}

// docRequest describes one document to write.
type docRequest struct {
	Title   string
	Goal    string
	Outline string // sibling chapters, for staying in lane
	Files   []scan.File
}

// generateDoc writes one document, then runs the quality passes the current
// multiplier pays for: a self-critique revision at ×4+, and grounding
// verification with a correction pass at ×10.
func (r *run) generateDoc(ctx context.Context, req docRequest) (string, error) {
	user := r.docPrompt(req)

	doc, err := r.client.Chat(ctx, docSystem+depthDirective(r.multiplier), user)
	if err != nil {
		return "", err
	}
	doc = unfence(doc)

	if r.multiplier >= critiqueMultiplier {
		if revised, cerr := r.critique(ctx, req, doc); cerr == nil && revised != "" {
			doc = revised
		} else if cerr != nil {
			r.pg.info("critique pass skipped for " + req.Title + ": " + cerr.Error())
		}
	}

	// Grounding: always report, and at the highest multiplier also correct.
	report := verify(doc, r.idx, req.Files)
	if !report.Clean() {
		r.pg.info(fmt.Sprintf("%s: %s", req.Title, report.Summary()))
		if r.multiplier >= verifyMultiplier {
			if fixed, verr := r.correct(ctx, req, doc, report); verr == nil && fixed != "" {
				doc = fixed
				report = verify(doc, r.idx, req.Files)
				r.pg.info(req.Title + " after correction: " + report.Summary())
			}
		}
	}

	doc = sanitizeMermaid(doc)
	// The provenance footer records which sources this document covers, so a
	// later update can tell exactly which documents a change invalidates.
	return stampProvenance(doc, filePaths(req.Files)), nil
}

// docPrompt assembles the user message shared by generation and revision.
func (r *run) docPrompt(req docRequest) string {
	var user strings.Builder
	fmt.Fprintf(&user, "Document title: %s\n\nGoal:\n%s\n", req.Title, req.Goal)
	if r.brief != "" {
		user.WriteString("\nAuthoritative architecture brief for this repository — use these\n")
		user.WriteString("names and this model of the system; do not re-derive or rename them:\n")
		user.WriteString(r.brief)
		user.WriteString("\n")
	}
	user.WriteString("\nGlobal wiki context (sibling chapters exist — stay in your lane):\n")
	user.WriteString(req.Outline)
	if facts := detectFacts(r.res, r.idx); facts.Any() {
		user.WriteString("\nFramework facts extracted from the code (real; cover the ones in scope):\n")
		user.WriteString(facts.ScopedSummary(filePaths(req.Files), 60))
	}
	user.WriteString(r.notesBlock())
	user.WriteString("\n")
	user.WriteString(bundleFiles(r.idx, req.Files, req.Title+" "+req.Goal, r.cfg.MaxModuleTokens))
	return user.String()
}

// ---- helpers ----

func outlineContext(o *Outline, selfID string) string {
	var b strings.Builder
	for _, s := range o.Sections {
		marker := "-"
		if s.ID == selfID {
			marker = "▶"
		}
		fmt.Fprintf(&b, "%s %s: %s\n", marker, s.Title, s.Goal)
	}
	return b.String()
}

// resolveFiles maps scope entries (files or dir prefixes) plus optional focus
// hints onto scanned files; focus files are ordered first.
func resolveFiles(res *scan.Result, scope, focus []string) []scan.File {
	seen := map[string]bool{}
	var out []scan.File
	add := func(entries []string) {
		for _, s := range entries {
			s = strings.Trim(filepath.ToSlash(strings.TrimSpace(s)), "/")
			if s == "" {
				continue
			}
			for _, f := range res.Files {
				if f.Path == s || strings.HasPrefix(f.Path, s+"/") {
					if !seen[f.Path] {
						seen[f.Path] = true
						out = append(out, f)
					}
				}
			}
		}
	}
	add(focus)
	add(scope)
	return out
}

// bundleFiles assembles source context: a complete structural skeleton for
// every file in scope, then full bodies for the files most relevant to goal.
// See internal/codemap for why this beats truncating each file's middle out.
func bundleFiles(idx *codemap.Index, files []scan.File, goal string, maxTokens int) string {
	paths := make([]string, 0, len(files))
	for _, f := range files {
		paths = append(paths, f.Path)
	}
	return idx.Bundle(paths, codemap.BundleOptions{Goal: goal, MaxTokens: maxTokens})
}

func loadOutline(repo string) (*Outline, error) {
	raw, err := os.ReadFile(OutlinePath(repo))
	if err != nil {
		return nil, err
	}
	var o Outline
	if err := yaml.Unmarshal(raw, &o); err != nil {
		return nil, err
	}
	return &o, nil
}

// LoadOutline is the exported form of loadOutline, for consumers outside the
// package that need the section ordering of a generated wiki (kaioken export).
func LoadOutline(repo string) (*Outline, error) { return loadOutline(repo) }

// SafeName is the exported form of safeName: the filesystem-safe form of a
// section title, matching the directory and file names the generator wrote.
func SafeName(s string) string { return safeName(s) }

func saveOutline(repo string, o *Outline) error {
	if err := os.MkdirAll(filepath.Dir(OutlinePath(repo)), 0o755); err != nil {
		return err
	}
	raw, err := yaml.Marshal(o)
	if err != nil {
		return err
	}
	header := []byte("# kaioken wiki plan — pass 1 of the deep documentation pipeline.\n" +
		"# EDIT FREELY: rename sections, adjust goals/files, add or remove sections,\n" +
		"# then run the wiki again. Delete this file to force a fresh global plan.\n")
	return os.WriteFile(OutlinePath(repo), append(header, raw...), 0o644)
}

func writeIndex(repo string, o *Outline) error {
	var b strings.Builder
	b.WriteString("# Repository Wiki\n\nGenerated by Kaioken (multiplier ×")
	fmt.Fprintf(&b, "%d).\n\n", o.Multiplier)
	for _, s := range o.Sections {
		dir := safeName(s.Title)
		fmt.Fprintf(&b, "## [%s](%s/%s.md)\n%s\n\n", s.Title, dir, dir, s.Goal)
		entries, err := os.ReadDir(filepath.Join(WikiDir(repo), dir))
		if err != nil {
			continue
		}
		for _, e := range entries {
			name := e.Name()
			if !strings.HasSuffix(name, ".md") || name == dir+".md" {
				continue
			}
			fmt.Fprintf(&b, "- [%s](%s/%s)\n", strings.TrimSuffix(name, ".md"), dir, name)
		}
		b.WriteString("\n")
	}
	return os.WriteFile(filepath.Join(WikiDir(repo), "README.md"), []byte(b.String()), 0o644)
}

func safeName(s string) string {
	s = strings.TrimSpace(s)
	repl := strings.NewReplacer("/", "_", "\\", "_", ":", "", "*", "", "?", "", "\"", "", "<", "", ">", "", "|", "", "\n", " ")
	s = repl.Replace(s)
	if len(s) > 80 {
		s = s[:80]
	}
	return s
}

func rel(repo, p string) string {
	if r, err := filepath.Rel(repo, p); err == nil {
		return filepath.ToSlash(r)
	}
	return p
}

func countLines(s string) int { return strings.Count(s, "\n") + 1 }

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
