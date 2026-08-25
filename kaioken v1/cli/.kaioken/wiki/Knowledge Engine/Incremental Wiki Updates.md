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
	pg.info(fmt.Sprintf("%d document(s) affected", len(targets)))
	idx := codemap.Build(res)

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
	if err := g.Wait(); err != nil {
		return rep, err
	}
	for _, u := range updated {
		if u != "" {
			rep.Updated = append(rep.Updated, u)
		}
	}
	if len(rep.Updated) == 0 {
		return rep, fmt.Errorf("every affected document failed to update")
	}

	if err := writeChangelog(ctx, repo, client, rep); err != nil {
		pg.failed("changelog", err)
	}
	if err := writeIndex(repo, outline); err != nil {
		return rep, err
	}
	// An update does not regenerate sections, so any outstanding failures from
	// the last full run still stand.
	return rep, SaveStamp(repo, client.Model, outline.Multiplier, LoadStamp(repo).Failed)
}
```

### cli/internal/wiki/update.go: The `resolveBase` function picks the baseline commit:
```go
func resolveBase(ctx context.Context, repo, override string) (string, error) {
	if override != "" {
		sha, err := gitx.Resolve(ctx, repo, override)
		if err != nil {
			return "", fmt.Errorf("baseline %q does not resolve to a commit: %w", override, err)
		}
		return sha, nil
	}
	stamp := LoadStamp(repo)
	if stamp.Commit == "" {
		return "", fmt.Errorf("no baseline recorded — this wiki predates diff tracking.\n" +
			"Re-run the wiki once to set a baseline, or pass an explicit one (e.g. HEAD~10)")
	}
	if !gitx.HasCommit(ctx, repo, stamp.Commit) {
		return "", fmt.Errorf("baseline commit %s is not in this repository (rebased or a different clone?)\n"+
			"Pass an explicit baseline, or re-run the wiki to re-baseline", gitx.Short(stamp.Commit))
	}
	return stamp.Commit, nil
}
```

### cli/internal/wiki/update.go: The `filterChanges` function drops Kaioken's own output:
```go
func filterChanges(in []gitx.Change) []gitx.Change {
	var out []gitx.Change
	for _, c := range in {
		if c.Path == config.Dir || strings.HasPrefix(c.Path, config.Dir+"/") {
			continue
		}
		out = append(out, c)
	}
	return out
}
```

### cli/internal/wiki/update.go: The `Stamp` structure in `wiki_state.yaml` records:
```go
type Stamp struct {
	Commit      string    `yaml:"commit"`
	GeneratedAt time.Time `yaml:"generated_at"`
	Model       string    `yaml:"model"`
	Multiplier  int       `yaml:"multiplier"`
	// Failed lists the section titles that did not generate cleanly.
	Failed []string  `yaml:"failed,omitempty"`
}
```

## Identifying Affected Documentation

Changed files are mapped to documentation sections using provenance tracking:

```go
func affectedDocs(repo string, outline *Outline, changes []gitx.Change) (targets []docTarget, unassigned []string) {
	claimed := map[string]bool{}

	for _, sec := range outline.Sections {
		dir := filepath.Join(WikiDir(repo), safeName(sec.Title))
		mainName := safeName(sec.Title) + ".md"
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			name := e.Name()
			if e.IsDir() || !strings.HasSuffix(name, ".md") {
				continue
			}
			docPath := filepath.Join(dir, name)
			raw, err := os.ReadFile(docPath)
			if err != nil {
				continue
			}
			body := string(raw)
			isMain := name == mainName

			hits := docHits(body, sec, changes, isMain)
			if len(hits) == 0 {
				continue
			}
			for _, h := range hits {
				claimed[h] = true
			}
			title := sec.Title
			if !isMain {
				title = sec.Title + " / " + strings.TrimSuffix(name, ".md")
			}
			targets = append(targets, docTarget{
				Path: docPath, Section: sec, Title: title, Files: hits,
			})
		}
	}

	for _, c := range changes {
		if !claimed[c.Path] {
			unassigned = append(unassigned, c.Path)
		}
	}
	sort.Strings(unassigned)
	return targets, unassigned
}
```

### cli/internal/wiki/update.go: The `docHits` function implements the matching logic:
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
			// Legacy document: fall back to citation scanning.
			add(c.Path)
		}
		if isMain && matchScope(sec.Files, c.Path) {
			add(c.Path)
		}
	}
	return hits
}
```

### cli/internal/wiki/update.go: The `matchScope` helper function:
```go
func matchScope(scope []string, path string) bool {
	path = filepath.ToSlash(path)
	for _, s := range scope {
		s = strings.Trim(filepath.ToSlash(strings.TrimSpace(s)), "/")
		if s == "" {
			continue
		}
		if path == s || strings.HasPrefix(path, s+"/") {
			return true
		}
	}
	return false
}
```

**Key mechanisms:**
1. **Provenance tracking**: Each generated document includes a footer listing source files it was built from
2. **Two-phase matching**:
   - Primary: Match changed files against document provenance footer (`parseProvenance`)
   - Fallback: For documents without provenance (pre-stamp builds), scan document body for file paths
   - Section scope: Main documents also match against the section's declared file scope from `modules.yaml`
3. **Unassigned file detection**: Changed files not claimed by any section indicate potential outline staleness

## Regenerating Invalidated Sections

Affected documents are revised in parallel using the LLM with contextual constraints:

```go
func reviseDoc(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
	res *scan.Result, idx *codemap.Index, outline *Outline, t docTarget,
	base string, commits []string) (string, error) {

	existing, err := os.ReadFile(t.Path)
	if err != nil {
		return "", err
	}
	patch, err := gitx.Patch(ctx, repo, base, t.Files, maxPatchBytes)
	if err != nil {
		return "", err
	}

	var user strings.Builder
	fmt.Fprintf(&user, "Document: %s\nSection goal: %s\n\n", t.Title, t.Section.Goal)
	user.WriteString("Global wiki context (sibling chapters exist — stay in your lane):\n")
	user.WriteString(outlineContext(outline, t.Section.ID))
	if len(commits) > 0 {
		user.WriteString("\nCommits since the documented baseline:\n")
		for _, c := range commits {
			user.WriteString("  " + c + "\n")
		}
	}
	if len(cfg.Notes) > 0 {
		user.WriteString("\nMaintainer steering notes (authoritative):\n")
		for _, n := range cfg.Notes {
			user.WriteString("- " + n + "\n")
		}
	}
	user.WriteString("\n===== CURRENT DOCUMENT =====\n")
	user.Write(existing)
	user.WriteString("\n\n===== GIT DIFF =====\n")
	if strings.TrimSpace(patch) == "" {
		user.WriteString("(no textual diff — files were added or removed)\n")
	} else {
		user.WriteString(patch)
	}
	user.WriteString("\n\n===== CURRENT CONTENTS OF THE CHANGED FILES =====\n")
	user.WriteString(bundleFiles(idx, resolveFiles(res, t.Files, nil),
		t.Title+" "+t.Section.Goal, cfg.MaxModuleTokens))

	doc, err := client.Chat(ctx, updateSystem, user.String())
	if err != nil {
		return "", err
	}
	// Carry the provenance forward, widened by whatever this revision covered,
	// so the next update can still tell what this document describes.
	sources := livePaths(res, append(parseProvenance(string(existing)), t.Files...))
	return stampProvenance(unfence(doc), sources), nil
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
has changed and your job is to produce the U

<!-- kaioken:files internal/wiki/update.go,internal/state/state.go,internal/scan/scan.go,internal/wiki/wiki.go -->
