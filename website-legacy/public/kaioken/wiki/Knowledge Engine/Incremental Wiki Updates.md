# Incremental Wiki Updates

## Table of Contents
- [Overview](#overview)
- [Detecting Changes](#detecting-changes)
- [Identifying Affected Documentation](#identifying-affected-documentation)
- [Regenerating Invalidated Sections](#regenerating-invalidated-sections)
- [Preserving Unchanged Content](#preserving-unchanged-content)
- [Error Handling and Edge Cases](#error-handling-and-edge-cases)
- [Referenced Files](#referenced-files)

## Overview

Kaioken's incremental update mechanism (`kaioken update` command) efficiently maintains repository documentation by:
1. Detecting changes since the last full wiki build using Git
2. Identifying which documentation sections are invalidated by those changes
3. Regenerating only the affected sections while preserving unchanged content
4. Updating auxiliary artifacts (changelog, index) and recording the new baseline

This process avoids costly full regenerations when only small portions of the codebase change, preserving documentation accuracy while minimizing rebuild time.

## Detecting Changes

The update process begins by establishing a baseline commit against which to measure changes:

```go
func Update(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
	res *scan.Result, baseOverride string, pg Progress) (*UpdateReport, error) {
	// ...
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
	// ...
}
```

### internal/wiki/update.go:1143. The `HEAD~10) or an explicit override (e.g., `HEAD~5 steps:**
1. **Baseline resolution** (`resolveBase`):
   - Uses explicit `baseOverride` if provided (SHA, tag, or expression like `HEAD~5`)
   - Otherwise reads commit from `wiki_state.yaml` (created during last full build)
   - Validates that the baseline commit exists in the current repository

2. **Change detection** (`gitx.Changes`):
   - Computes diff between baseline and current HEAD
   - Filters out changes to Kaioken's own wiki directory (`filterChanges`) to prevent self-referential updates

3. **Change reporting**:
   - Retrieves commit subjects for changelog generation
   - Reports changed file count via progress callback

The `Stamp` structure in `wiki_state.yaml` records:
```go
type Stamp struct {
	Commit      string    `yaml:"commit"`
	GeneratedAt time.Time `yaml:"generated_at"`
	Model       string    `yaml:"model"`
	Multiplier  int       `yaml:"multiplier"`
	Failed      []string  `yaml:"failed,omitempty"`
}
```

## Identifying Affected Documentation

Changed files are mapped to documentation sections using provenance tracking:

```go
func affectedDocs(repo string, outline *Outline, changes []gitx.Change) (targets []docTarget, unassigned []string) {
	claimed := map[string]bool{}

	for _, sec := range outline.Sections {
		// ... load each document in section directory ...
		hits := docHits(body, sec, changes, isMain)
		if len(hits) == 0 {
			continue
		}
		for _, h := range hits {
			claimed[h] = true
		}
		// ... create docTarget for each matching document ...
	}

	for _, c := range changes {
		if !claimed[c.Path] {
			unassigned = append(unassigned, c.Path)
		}
	}
	// ...
}
```

**Key mechanisms:**
1. **Provenance tracking**: Each generated document includes a footer listing source files it was built from
2. **Two-phase matching**:
   - Primary: Match changed files against document provenance footer (`parseProvenance`)
   - Fallback: For documents without provenance (pre-stamp builds), scan document body for file paths
   - Section scope: Main documents also match against the section's declared file scope from `modules.yaml
3. **Unassigned file detection**: Changed files not claimed by any section indicate potential outline staleness

The `docHits` function implements the matching logic:
```go
func docHits(body string, sec Section, changes []gitx.Change, isMain bool) []string {
	prov := parseProvenance(body)
	seen := map[string]bool{}
	var hits []string
	add := func(p string) {
		if !seen[p] {
			seen[p] = true
			hits = append(hits, p)
		}
	}

	for _, c := range changes {
		switch {
		case len(prov) > 0 && matchScope(prov, c.Path):
			add(c.Path)
		case len(prov) == 0 && !isMain && strings.Contains(body, c.Path):
			add(c.Path)
		}
		if isMain && matchScope(sec.Files, c.Path) {
			add(c.Path)
		}
	}
	return hits
}
```

## Regenerating Invalidated Sections

Affected documents are revised in parallel using the LLM with contextual constraints:

```go
// Revise each affected document in parallel, bounded like a full run.
updated := make([]string, len(targets))
limit, clamped := cfg.EffectiveConcurrency(client.Model)
if clamped {
	pg.info(fmt.Sprintf("free-tier model — concurrency capped at %d to avoid rate limits", limit))
}
g, gctx := errgroup.WithContext(ctx)
g.SetLimit(limit)
for i, t := range targets {
	i, t := i, t
	g.Go(func() error {
		pg.started("update: " + t.Title)
		doc, err := reviseDoc(gctx, repo, cfg, client, res, idx, outline, t, base, rep.Commits)
		if err != nil {
			pg.failed(t.Title, err)
			return nil // one failed document must not abort the run
		}
		if err := os.WriteFile(t.Path, []byte(doc), 0o644); err != nil {
			pg.failed(t.Title, err)
			return nil
		}
		updated[i] = rel(repo, t.Path)
		pg.wrote(rel(repo, t.Path), countLines(doc))
		return nil
	})
}
```

**Revision workflow per document** (`reviseDoc`):
1. Read existing document content
2. Generate Git patch for relevant files (capped at `maxPatchBytes` to prevent token overflow)
3. Construct LLM prompt containing:
   - Document title and section goal
   - Global wiki context (to maintain topical boundaries)
   - Commit subjects since baseline
   - Maintainer steering notes (from config)
   - Current document content
   - Git diff
   - Bundled source contents of changed files (via `codemap` index)
4. Call LLM with `updateSystem` prompt instructing preservation of accurate content
5. Update provenance footer to include newly covered files
6. Write revised document to disk

The `updateSystem` LLM instruction enforces conservation principles:
```go
const updateSystem = `You are maintaining an existing chapter of a repository wiki. The code
has changed and your job is to produce the UPDATED chapter.

You are given: the current document, the git diff of what changed, and the current contents of
the changed files.

Rules:
- PRESERVE everything still accurate — keep the document's structure, headings, anchors,
  tables, mermaid diagrams and depth. This is a revision, not a rewrite.
- Rewrite only what the diff invalidates: changed signatures, renamed or deleted files,
  altered flows, new components. Add real coverage for genuinely new functionality.
- DELETE documentation for code that no longer exists.
- Keep the "Referenced Files" list accurate.
- Never invent APIs, files or behavior absent from the sources.

Output ONLY the complete updated markdown document — no commentary, no diff, no JSON.`
```

## Preserving Unchanged Content

Unchanged documentation is preserved through three mechanisms:

1. **Selective processing**: Only documents identified by `affectedDocs` are revised
2. **LLM constraints**: The `updateSystem` prompt explicitly forbids rewriting accurate content
3. **Provenance-aware revision**: The LLM receives the full existing document and must output a complete revised version, ensuring unchanged sections remain identical

The system preserves:
- Document structure (heading levels, anchor links)
- Tables and Mermaid diagrams (unless invalidated by code changes)
- Explanatory text unaffected by diffs
- "Referenced Files" lists (updated only when file coverage changes)
- Depth and detail level consistent with original build multiplier

## Error Handling and Edge Cases

### Error Conditions
- Missing wiki outline or directory: Requires initial `kaioken wiki` run
- Non-Git repository: Update requires Git for diff computation
- Unresolvable baseline: Either missing stamp or commit not in current repo
- LLM failures: Individual document failures don't abort the entire update
- Write failures: Document write errors are logged but don't halt processing

### Special Handling
- **Empty changes**: Early return when no relevant changes detected
- **No affected documents**: Early return when changes don't impact any documentation
- **Failed documents**: Failed revisions are logged but update continues; stamp preserves prior failure list
- **Unassigned files**: Changes not claimed by any section are reported in `UpdateReport.Unassigned` as a re-planning hint
- **Binary files**: Automatically excluded from scanning via `scan` package
- **Large diffs**: Patch size capped at `maxPatchBytes` (60KB) to manage LLM context

### State Persistence
The update concludes by saving a new stamp:
```go
return rep, SaveStamp(repo, client.Model, outline.Multiplier, LoadStamp(repo).Failed)
```
Note: The stamp preserves the previous failure list (`LoadStamp(repo).Failed`) because:
- Update doesn't regenerate section outlines/subplans
- Outstanding generation failures from the last full build remain relevant
- New failures during update don't affect baseline validity for future updates

## Referenced Files
- `internal/wiki/update.go`: Core update logic
- `internal/wiki/wiki.go`: Document generation and outline management
- `internal/state/state.py`: State tracking (referenced for context, though not directly used in update)
- `internal/scan/scan.go`: Repository inventorying
- `internal/codemap/codemap.go`: Code structure indexing
- `internal/gitx/gitx.go`: Git operations
- `internal/config/config.go`: [Configuration](../Configuration/Configuration.md) management
- `internal/llm/openrouter.go`: LLM provider integration

The update mechanism relies on the provenance tracking established during initial wiki generation (see `internal/wiki/wiki.go` `stampProvenance` function) to efficiently determine which documentation requires revision when the codebase evolves.

<!-- kaioken:files internal/wiki/update.go,internal/state/state.go,internal/scan/scan.go,internal/wiki/wiki.go -->
