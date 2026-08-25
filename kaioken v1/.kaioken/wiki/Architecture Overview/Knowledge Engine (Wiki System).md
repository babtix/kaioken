# Knowledge Engine (Wiki System)

This chapter explains the wiki generation process in kaioken, which scans repositories, plans modules, generates knowledge cards, builds structured documentation, and supports incremental updates. The wiki system is implemented in `internal/wiki/wiki.go` and follows a multi-pass pipeline inspired by Qoder's Repo Wiki.

## Table of Contents
- [Overview of the Wiki Generation Process](#overview-of-the-wiki-generation-process)
- [Data Structures](#data-structures)
- [Main Entry Point: `Run` Function](#main-entry-point-run-function)
- [Retry Mechanism](#retry-mechanism)
- [Internal State: `run` and `failures`](#internal-state-run-and-failures)
- [Multi-Pass Pipeline](#multi-pass-pipeline)
  - [Pass 0: Code Structure Indexing](#pass-0-code-structure-indexing)
  - [Pass 1: Global Outline Planning](#pass-1-global-outline-planning)
  - [Pass 1b: Architecture Brief](#pass-1b-architecture-brief)
  - [Pass 2: Per-Section Sub-Planning](#pass-2-per-section-sub-planning)
  - [Pass 3a: Section Document Generation](#pass-3a-section-document-generation)
  - [Pass 3b: Subsection Document Generation](#pass-3b-subsection-document-generation)
- [Supporting Functions](#supporting-functions)
- [File Operations](#file-operations)
- [Incremental Updates](#incremental-updates)
- [Referenced Files](#referenced-files)

## Overview of the Wiki Generation Process

The wiki generation executes in these stages:
1. **Repository Scanning**: Uses `internal/scan` to inventory files (respecting config excludes)
2. **Code Mapping**: Builds symbol indexes via `internal/codemap` for structural context
3. **Global Planning**: Creates a wiki outline (sections with goals/files) using LLM
4. **Per-Section Planning**: For each section, plans subsections and focus files
5. **Document Generation**: 
   - Generates long-form section documents
   - Creates subsection documents (when multiplier ≥ 2)
6. **Quality Passes**: Applies critique/correction based on multiplier depth
7. **State Recording**: Saves build state (commit hash, model, multiplier, failures) for incremental updates

The process runs via `kaioken wiki` CLI command or `/wiki` in TUI, invoking `wiki.Run()`.

## Data Structures

These types define the wiki plan and progress tracking:

### Section
Represents one planned wiki chapter.
`internal/wiki/wiki.go:35-40`
```go
type Section struct {
    ID    string   `yaml:"id" json:"id"`
    Title string   `yaml:"title" json:"title"`
    Goal  string   `yaml:"goal" json:"goal"`
    Files []string `yaml:"files" json:"files"`
}
```

### Outline
Persisted global plan (pass 1) stored in `.kaioken/wiki_plan.yaml`.
`internal/wiki/wiki.go:43-47`
```go
type Outline struct {
    Version    int       `yaml:"version"`
    Multiplier int       `yaml:"multiplier"`
    Sections   []Section `yaml:"sections"`
}
```

### SubPlan
Per-section plan (pass 2) detailing subsections and focus files.
`internal/wiki/wiki.go:50-54`
```go
type SubPlan struct {
    Summary     string       `json:"summary"`
    FocusFiles  []string     `json:"focus_files"`
    Subsections []Subsection `json:"subsections"`
}
```

### Subsection
One planned child document within a section.
`internal/wiki/wiki.go:57-61`
```go
type Subsection struct {
    Title string   `json:"title"`
    Goal  string   `json:"goal"`
    Files []string `json:"files"`
}
```

### Progress
Receives live updates during generation; callbacks may be nil.
`internal/wiki/wiki.go:64-69`
```go
type Progress struct {
    Info    func(text string)
    Started func(what string)
    Wrote   func(path string, lines int)
    Failed  func(what string, err error)
}
```

## Main Entry Point: `Run` Function

Executes the full multi-pass pipeline. Reuses existing outline if present (unless `force=true`).
`internal/wiki/wiki.go:224-273`
```go
func Run(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
    res *scan.Result, multiplier int, force bool, pg Progress) error {
    // ... (implementation details in following sections)
}
```
Key steps:
1. Validates and clamps `multiplier` (1-10, default 3)
2. Initializes `run` state
3. **Pass 0**: Indexes code structure via `codemap.Build()`
4. **Pass 1**: Loads or generates global outline (`planOutline()`)
5. **Pass 1b**: Loads or builds architecture brief (`loadOrBuildBrief()`)
6. Executes section processing in parallel (`runSections()`)
7. Performs cross-linking, writes index, saves build state

## Retry Mechanism

Regenerates only sections that failed in the last run, avoiding full re-generation.
`internal/wiki/wiki.go:278-319`
```go
func Retry(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
    res *scan.Result, pg Progress) (int, error) {
    // ... loads outline, identifies failed sections from stamp, retries them
}
```
Returns count of attempted sections. Used via `wiki retry` command.

## Internal State: `run` and `failures`

### run
Carries state shared across all passes of a single wiki run.
`internal/wiki/wiki.go:209-220`
```go
type run struct {
    repo       string
    cfg        *config.Config
    client     *llm.Client
    res        *scan.Result
    idx        *codemap.Index
    outline    *Outline
    brief      string // shared architecture brief
    multiplier int
    force      bool
    pg         Progress
}
```

### failures
Collects section labels from parallel workers for reporting.
`internal/wiki/wiki.go:322-325`
```go
type failures struct {
    mu   sync.Mutex
    list []string
}
```
Methods:
- `add(label string)`: Thread-safe append
- `sorted()`: Returns sorted failure list

## Multi-Pass Pipeline

### Pass 0: Code Structure Indexing

Builds symbol index from scan results for structural context.
`internal/wiki/wiki.go:224-273` (within `Run`)
```go
// ---- pass 0: index the code's structure ----
pg.started("indexing code structure")
r.idx = codemap.Build(res)
pg.info(fmt.Sprintf("indexed %d declarations across %d files",
    r.idx.SymbolCount(), len(r.idx.Files)))
```
Uses `internal/codemap` to parse declarations and build skeletons.

### Pass 1: Global Outline Planning

Generates wiki outline (sections) using LLM with repository context.
`internal/wiki/wiki.go:471-497` (`planOutline`)
```go
func (r *run) planOutline(ctx context.Context) (*Outline, error) {
    var user strings.Builder
    user.WriteString("Repository layout (dir → file count, sample files):\n\n")
    user.WriteString(r.res.TreeSummary(12))
    // ... manifest contents, code skeleton, detected facts, maintainer notes
    var out struct {
        Sections []Section `json:"sections"`
    }
    if err := r.client.ChatJSON(ctx, outlineSystem, user.String(), &out); err != nil {
        return nil, err
    }
    return &Outline{Version: 1, Sections: out.Sections}, nil
}
```
Uses `outlineSystem` prompt to generate 8-16 sections covering real subsystems.

### Pass 1b: Architecture Brief

Loads maintainer notes from config and detects framework facts for shared context.
`internal/wiki/wiki.go:549-554` (`docRequest` type) and `notesBlock()` (L536-546)
```go
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
```
Detected facts come from `detectFacts()` (not shown in source but referenced).

### Pass 2: Per-Section Sub-Planning

Plans subsections and focus files for each section using global outline context.
`internal/wiki/wiki.go:499-533` (`planSection`)
```go
func (r *run) planSection(ctx context.Context, sec Section) (*SubPlan, error) {
    minSubs, maxSubs := 2, 4*r.multiplier
    // ... clamp maxSubs to 12
    files := resolveFiles(r.res, sec.Files, nil)
    // ... build user context with global outline, architecture brief, file structure
    var sp SubPlan
    if err := r.client.ChatJSON(ctx, fmt.Sprintf(subplanSystem, minSubs, maxSubs), user.String(), &sp); err != nil {
        return nil, err
    }
    return &sp, nil
}
```
Uses `subplanSystem` prompt (with dynamic subsection count based on multiplier).

### Pass 3a: Section Document Generation

Generates long-form section document, then applies quality passes.
`internal/wiki/wiki.go:383-464` (`runSection` - section doc generation)
```go
// ---- pass 3a: the section's own long-form document ----
r.pg.started("write: " + sec.Title)
secFiles := resolveFiles(r.res, sec.Files, sp.FocusFiles)
doc, err := r.generateDoc(ctx, docRequest{
    Title:   sec.Title,
    Goal:    sec.Goal + "\n\nSection plan: " + sp.Summary,
    Outline: outlineContext(r.outline, sec.ID),
    Files:   secFiles,
})
// ... write document, report progress
```
Calls `generateDoc()` with section goal and plan summary.

### Pass 3b: Subsection Document Generation

Creates documents for each planned subsection (when multiplier ≥ 2).
`internal/wiki/wiki.go:464-497` (continuation of `runSection`)
```go
// ---- pass 3b: one document per planned subsection ----
if r.multiplier < 2 {
    return nil
}
for _, sub := range sp.Subsections {
    // ... skip if exists and !force
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
    // ... write subsection document or log failure
}
```
Subsection documents inherit section context and goal.

## Supporting Functions

### depthDirective
Converts multiplier to depth instruction for LLM prompts.
`internal/wiki/wiki.go:209-220`
```go
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
```
Directly influences documentation depth and detail level.

### outlineContext
Builds context string from global outline for LLM prompts.
`internal/wiki/wiki.go:619-629`
```go
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
```
Marks current section with `▶` to help LLM stay in lane.

### resolveFiles
Maps scope/focus entries to scanned files, ordering focus first.
`internal/wiki/wiki.go:633-655`
```go
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
```
Focus files are prioritized in the returned slice.

### bundleFiles
Assembles source context: structural skeletons + relevant file bodies.
`internal/wiki/wiki.go:660-666`
```go
func bundleFiles(idx *codemap.Index, files []scan.File, goal string, maxTokens int) string {
    paths := make([]string, 0, len(files))
    for _, f := range files {
        paths = append(paths, f.Path)
    }
    return idx.Bundle(paths, codemap.BundleOptions{Goal: goal, MaxTokens: maxTokens})
}
```
Uses `internal/codemap.Index.Bundle()` to optimize token usage.

## File Operations

### OutlinePath/WikiDir
Defines file locations for wiki plan and output.
`internal/wiki/wiki.go:93-100`
```go
func OutlinePath(repo string) string {
    return filepath.Join(repo, config.Dir, "wiki_plan.yaml")
}

func WikiDir(repo string) string {
    return filepath.Join(repo, config.Dir, "wiki")
}
```
Where `config.Dir` is `.kaioken`.

### loadOutline/saveOutline
Handles persistent storage of the global plan.
`internal/wiki/wiki.go:668-692`
```go
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
```
Includes editable header encouraging user customization.

### writeIndex
Generates wiki README.md with section links.
`internal/wiki/wiki.go:717-725`
```go
func writeIndex(repo string, o *Outline) error {
    var b strings.Builder
    b.WriteString("# Repository Wiki\n\nGenerated by Kaioken (multiplier ×")
    fmt.Fprintf(&b, "%d).\n\n", o.Multiplier)
    for _, s := range o.Sections {
        dir := safeName(s.Title)
        fmt.Fprintf(&b, "## [%s](%s/%s.md)\n%s\n\n", s.Title, dir, dir, s.Goal)
        // ... list subsection documents
    }
    return os.WriteFile(filepath.Join(WikiDir(repo), "README.md"), []byte(b.String()), 0o644)
}
```
Creates navigable table of contents.

### safeName/rel/countLines/maxInt
Utility functions for path handling and metrics.
`internal/wiki/wiki.go:727-741`
```go
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
```
`safeName` sanitizes section titles for filesystem use.

## Incremental Updates

The wiki system supports incremental updates via build state tracking:
1. After generation, `Run()` saves a stamp recording:
   - Current commit hash (via `gitx.Head()`)
   - LLM model used
   - Multiplier depth
   - List of failed sections
   `internal/wiki/wiki.go:268-273` (within `runSections`)
   ```go
   // Record the commit this wiki reflects so `update` can diff against it.
   if err := SaveStamp(r.repo, r.client.Model, r.multiplier, fail.sorted()); err != nil {
       r.pg.failed("baseline", err)
   }
   ```
2. The `update` command (not in this file) uses:
   - `gitx.Changes()` to find modified files since last build
   - `state.Load()` to retrieve previous stamp
   - Determines which documents need regeneration based on file provenance
3. Failed sections can be retried via `wiki.Retry()` or `wiki retry` command

This avoids full re-generation when only parts of the repository change.

## Referenced Files
- `internal/wiki/wiki.go` (primary implementation)
- `internal/scan/scan.go` (repository inventory)
- `internal/plan/plan.go` (module planning - referenced in Architecture Overview)
- `internal/codemap/codemap.go` (code parsing and indexing)
- `internal/state/state.go` (build state management - referenced in Architecture Overview)
- `internal/gitx/gitx.go` (git operations for incremental updates)
- `internal/config/config.go` (configuration management)
- `internal/llm/llm.go` (LLM client interface)

<!-- kaioken:files internal/wiki/wiki.go -->
