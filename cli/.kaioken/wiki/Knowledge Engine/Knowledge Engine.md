# Knowledge Engine

The Knowledge Engine scans repositories to inventory files, plans logical modules, generates detailed knowledge cards for each module using LLMs and code context, assembles them into a structured wiki with critique/correction passes, and maintains the wiki over time through incremental updates that only regenerate affected sections based on file changes.

## Table of Contents
- [Scanning the Repository](#scanning-the-repository)
- [Planning Modules](#planning-modules)
- [Generating Knowledge Cards](#generating-knowledge-cards)
- [Building the Wiki](#building-the-wiki)
- [Incremental Updates](#incremental-updates)
- [Data Flow and Component Interaction](#data-flow-and-component-interaction)
- [Referenced Files](#referenced-files)

## Scanning the Repository

The scanning phase inventories repository files while respecting `.gitignore` and configuration excludes. It produces a `scan.Result` containing file metadata, manifest files, and extension statistics.

The `scan.Repo` function walks the repository root, applies ignore rules, and collects file information:

`cli/internal/scan/scan.go:65-149`
```go
func Repo(root string, cfg *config.Config) (*Result, error) {
	root, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}

	var gi *ignore.GitIgnore
	if raw, err := os.ReadFile(filepath.Join(root, ".gitignore")); err == nil {
		gi = ignore.CompileIgnoreLines(strings.Split(string(raw), "\n")...)
	}
	var extra *ignore.GitIgnore
	if len(cfg.Scope.Exclude) > 0 {
		extra = ignore.CompileIgnoreLines(cfg.Scope.Exclude...)
	}

	res := &Result{Root: root, ByExt: map[string]int{}}

	err = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // unreadable entries are skipped, not fatal
		}
		rel, rerr := filepath.Rel(root, path)
		if rerr != nil || rel == "." {
			return nil
		}
		rel = filepath.ToSlash(rel)

		base := filepath.Base(path)
		if d.IsDir() {
			for _, ex := range config.DefaultExcludes {
				if base == ex {
					return filepath.SkipDir
				}
			}
			if gi != nil && gi.MatchesPath(rel+"/") {
				return filepath.SkipDir
			}
			if extra != nil && extra.MatchesPath(rel+"/") {
				return filepath.SkipDir
			}
			return nil
		}

		if gi != nil && gi.MatchesPath(rel) {
			return nil
		}
		if extra != nil && extra.MatchesPath(rel) {
			return nil
		}
		if len(cfg.Scope.Include) > 0 && !underAny(rel, cfg.Scope.Include) {
			return nil
		}

		ext := strings.ToLower(filepath.Ext(base))
		if binaryExts[ext] {
			return nil
		}
		info, ierr := d.Info()
		if ierr != nil {
			return nil
		}

		f := File{Path: rel, Size: info.Size(), Ext: ext}
		if info.Size() <= maxFileBytes {
			if raw, rerr := os.ReadFile(path); rerr == nil {
				if bytes.IndexByte(raw, 0) != -1 {
					return nil // binary content sniffed
				}
				f.Lines = bytes.Count(raw, []byte("\n")) + 1
			}
		}
		res.Files = append(res.Files, f)
		res.ByExt[ext]++
		res.TotalSize += f.Size
		if manifestNames[base] {
			res.Manifests = append(res.Manifests, rel)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(res.Files, func(i, j int) bool { return res.Files[i].Path < res.Files[j].Path })
	return res, nil
}
```

The result includes:
- `Files`: slice of `File` objects with repo-relative paths, sizes, line counts, and extensions
- `Manifests`: paths to recognized manifest files (e.g., `go.mod`, `package.json`)
- `ByExt`: map of file extensions to counts
- `TotalSize`: cumulative size of all scanned files

## Planning Modules

The planning phase splits the scanned repository into a hierarchical module tree persisted as `.kaioken/modules.yaml`. Each module represents a cohesive functional area with explicit file scopes.

The `plan.Generate` function uses the scan result and LLM to propose modules:

`cli/internal/plan/plan.go:123-151`
```go
func Generate(ctx context.Context, client *llm.Client, cfg *config.Config, res *scan.Result) (*Plan, error) {
	var user strings.Builder
	user.WriteString("Repository layout (dir → file count, sample files):\n\n")
	user.WriteString(res.TreeSummary(12))
	user.WriteString("\n\nKey manifest/config file contents:\n\n")
	user.WriteString(res.ManifestContents(4000))
	if len(cfg.Notes) > 0 {
		user.WriteString("\nProject steering notes from the maintainer (authoritative):\n")
		for _, n := range cfg.Notes {
			user.WriteString("- " + n + "\n")
		}
	}

	var out struct {
		Modules []Module `json:"modules"`
	}
	if err := client.ChatJSON(ctx, plannerSystem, user.String(), &out); err != nil {
		return nil, fmt.Errorf("planning modules: %w", err)
	}
	if len(out.Modules) == 0 {
		return nil, fmt.Errorf("model returned an empty module list")
	}
	p := &Plan{Version: 1, Modules: out.Modules}
	warnings := Validate(p, res)
	for _, w := range warnings {
		fmt.Fprintln(os.Stderr, "warn:", w)
	}
	return p, nil
}
```

Key structures:
- `Module`: Contains `ID`, `Title`, `Description`, `Scope` (file paths/directory prefixes), and optional `Children`
- `Plan`: Top-level container with `Version` and `Modules` slice

The planner follows these rules:
- Top level: one module per major deliverable (backend service, frontend app, etc.)
- Children: split deliverables by functional area (feature groups, router groups) - not technical layers alone
- Scope: repo-relative file paths or directory prefixes; every important source file covered by exactly one leaf module
- IDs: short snake_case, stable, path-like for children (no slashes inside one ID)

Validation ensures scope entries match scanned files, reporting warnings for mismatches.

## Generating Knowledge Cards

Knowledge card generation occurs during the wiki build process via a multi-pass pipeline. Each module from `modules.yaml` becomes a wiki section, with optional subsections for deeper documentation.

The pipeline executes in `wiki.Run`:

`cli/internal/wiki/wiki.go:224-273`
```go
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
```

### Pass 0: Code Structure Indexing
Builds a symbol index using `codemap.Build` to extract declarations (functions, types, etc.) for context.

### Pass 1: Global Plan
The LLM surveys the repository to produce a wiki outline (top-level sections). Input includes:
- Repository layout (tree summary)
- Manifest file contents
- Code skeleton from the symbol index
- Detected framework facts
- Maintainer steering notes

Output is saved to `.kaioken/wiki_plan.yaml` as an `Outline` containing:
- `Version`: schema version
- `Multiplier`: depth setting (controls documentation detail)
- `Sections`: slice of `Section` objects with `ID`, `Title`, `Goal`, and relevant `Files`

### Pass 1b: Architecture Brief
Loads or generates an authoritative architecture brief that constrains subsequent LLM prompts to use real system names and avoid re-derivation.

### Pass 2: Section Sub-Planning
For each section, the LLM creates a detailed plan including:
- `Summary`: 2-3 sentence overview
- `FocusFiles`: most important files for the section's overview document
- `Subsections`: planned child documents (2 to 4×multiplier subsections, capped at 12)

### Pass 3a: Section Document Generation
Generates the section's long-form Markdown document using:
- Section title and goal
- Section plan summary
- Global wiki context (sibling sections)
- Resolved source files (via `resolveFiles`)
- Code bundling via `codemap.Index.Bundle` (structural skeletons + relevant file bodies)

### Pass 3b: Subsection Documents
If multiplier ≥ 2, generates child documents for each planned subsection using similar context.

### Quality Passes
Based on multiplier:
- **×4+**: Self-critique pass - reviews draft against sources for coverage, accuracy, padding, concreteness, and structure
- **×10**: Grounding correction pass - fixes unverifiable claims (missing files, symbols, line anchors) using automated verification

Document generation uses `generateDoc`:

`cli/internal/wiki/wiki.go:559-593`
```go
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
```

The `docPrompt` assembles context including:
- Document title and goal
- Architecture brief (if available)
- Global wiki context (sibling sections)
- Framework facts scoped to relevant files
- Maintainer steering notes
- Bundled source code (structural skeletons + goal-relevant file bodies)

## Building the Wiki

After generation, the wiki is assembled into a navigable structure:

1. **Document Storage**: Each section's documents are stored in `.kaioken/wiki/<section-title>/`:
   - `<section-title>.md`: main section document
   - `<subsection-title>.md`: subsection documents (if applicable)
   - `_section.yaml`: metadata (section info, generation timestamp, model used)

2. **Index Generation**: `writeIndex` creates `.kaioken/wiki/README.md` with:
   - Wiki title and generation multiplier
   - Section list with links to main documents
   - Subsection links indented under each section

3. **State Recording**: `SaveStamp` records the current Git commit (baseline) for incremental updates, along with any failed sections and the LLM model/multiplier used.

## Incremental Updates

The update process revises only documentation affected by changes since the last build, using Git to detect modifications.

The `wiki.Update` function:

`cli/internal/wiki/update.go:123-214`
```go
func Update(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
	res *scan.Result, baseOverride string, pg Progress) (*UpdateReport, error) {

	outline, err := loadOutline(repo)
	if err != nil || outline == nil || len(outline.Sections) == 0 {
		return nil, fmt.Errorf("no wiki plan at %s — run the wiki first", OutlinePath(repo))
	}
	if _, err := os.Stat(WikiDir(repo)); err != nil {
		return nil, fmt.Errorf("no generated wiki at %s — run the wiki first", WikiDir(repo))
	}
	if !gitx.IsRepo(repo) {
		return nil, fmt.Errorf("update needs git: %s is not a git repository (git must also be on PATH)", repo)
	}

	base, err := resolveBase(ctx, repo, baseOverride)
	if err != nil {
		return nil, err
	}
	head, err := gitx.Head(ctx, repo)
	if err != nil {
		return nil, err
	}

	changes, err := gitx.Changes(ctx, repo, base)
	if err != nil {
		return nil, err
	}
	changes = filterChanges(changes)
	rep := &UpdateReport{Base: base, Head: head, Changes: changes}
	if len(changes) == 0 {
		return rep, nil
	}
	rep.Commits, _ = gitx.Subjects(ctx, repo, base, 40)

	pg.info(fmt.Sprintf("%s → %s: %d changed files", gitx.Short(base), gitx.Short(head), len(changes)))

	targets, unassigned := affectedDocs(repo, outline, changes)
	rep.Unassigned = unassigned
	if len(targets) == 0 {
		return rep, nil
	}
	pg.info(fmt.Sprintf("%d document(s) affected", len

<!-- kaioken:files internal/wiki/wiki.go,internal/plan/plan.go,internal/scan/scan.go,internal/state/state.go,internal/wiki/passes.go,internal/wiki/update.go -->
