# Basic CLI Commands Overview

This chapter provides a quick reference to the essential kaioken commands for getting started with the knowledge engine workflow: scanning a repository, planning modules, generating knowledge cards, building the wiki, and performing incremental updates.

## Table of Contents
- [Scan](#scan)
- [Plan](#plan)
- [Generate](#generate)
- [Wiki](#wiki)
- [Update](#update)
- [Other Commands](#other-commands)
- [Referenced Files](#referenced-files)

## Scan
The `scan` command inventories repository files, respecting exclusion rules from the configuration, and prints a summary statistics and tree view.

`cmd/kaioken/main.go:187-200`

```go
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
```

**Usage**: `kaioken scan [-repo <path>]`  
**Output**: Scanning duration, file statistics (total, Go, etc.), and a directory tree summary (depth 8).

## Plan
The `plan` command uses an LLM to propose a module structure (`modules.yaml`) based on the scanned inventory. The output is editable before proceeding to generation.

`cmd/kaioken/main.go:202-231`

```go
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
```

**Usage**: `kaioken plan [-repo <path>] [-model <id>]`  
**Output**: Scanned stats, planning progress, and a list of proposed modules (ID and title) written to `.kaioken/modules.yaml`.

## Generate
The `generate` command creates knowledge cards for each module in `modules.yaml`, skipping unchanged sources unless `-force` is used. It leverages the LLM and code map for context.

`cmd/kaioken/main.go:233-277`

```go
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
```

**Usage**: `kaioken generate [-repo <path>] [-model <id>] [-module <id>[,<id>...]] [-force]`  
**Output**: Progress per module (generating, up-to-date, failed), final counts, and path to the knowledge index (`.kaioken/KNOWLEDGE.md`).

## Wiki
The `wiki` command executes the deep multi-pass pipeline: scanning, planning (if needed), generating knowledge cards, and building the wiki outline with critique/correction passes. The positional argument sets a complexity multiplier (default `x3`).

`cmd/kaioken/main.go:365-406`

```go
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
```

**Usage**: `kaioken wiki [-repo <path>] [-model <id>] [-force] [xN|retry]`  
**Output**: Scanned stats, estimated duration, wiki generation progress, and final output path (`.kaioken/wiki/README.md`). Use `xN` to adjust depth (e.g., `x2` for faster, `x5` for more thorough). Use `retry` to reprocess only failed sections.

## Update
The `update` command performs an incremental refresh by detecting git changes since the last build and regenerating only affected documentation sections.

`cmd/kaioken/main.go:420-457`

```go
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
```

**Usage**: `kaioken update [-repo <path>] [-model <id>] [-base <rev>] [-force]`  
**Output**: Status of changes (no changes, changes but no updates, or updated documents with counts and duration), changelog path, and any unassigned files.

## Other Commands
The remaining commands support setup, inspection, and auxiliary functions. They are less frequently used in the core knowledge engine workflow but essential for full functionality.

| Command | Line Range | Purpose |
|---------|------------|---------|
| init    | cmd/kaioken/main.go:171-185 | Create `.kaioken/config.yaml` in the target repo |
| status  | cmd/kaioken/main.go:279-317 | Show module freshness (changed / up-to-date / missing) |
| models  | cmd/kaioken/main.go:319-337 | List provider models (optional filter argument) |
| skills  | cmd/kaioken/main.go:460-507 | Build task-oriented skills an AI agent loads while working in the repo |
| hook    | cmd/kaioken/main.go:511-543 | Manage the post-commit auto-update hook (install|remove|status) |
| serve   | cmd/kaioken/main.go:546-556 | Browse the generated wiki in a browser (-port, default 7777) |

## Referenced Files
- cmd/kaioken/main.go

<!-- kaioken:files cmd/kaioken/main.go -->
