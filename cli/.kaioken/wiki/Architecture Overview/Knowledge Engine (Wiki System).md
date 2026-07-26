# Knowledge Engine (Wiki System)

This chapter explains the wiki generation process in kaioken, which scans repositories, plans modules, generates knowledge cards, builds structured documentation, and supports incremental updates. The wiki system is implemented in `cli/internal/wiki/wiki.go` and follows a multi-pass pipeline inspired by Qoder's Repo Wiki.

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
1. **Repository Scanning**: Uses `cli/internal/scan` to inventory files (respecting config excludes)
2. **Code Mapping**: Builds symbol indexes via `cli/internal/codemap` for structural context
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
`cli/internal/wiki/wiki.go:35-40`
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
`cli/internal/wiki/wiki.go:43-47`
```go
type Outline {
    Version    int       `yaml:"version"`
    Multiplier int       `yaml:"multiplier"`
    Sections   []Section `yaml:"sections"`
}
```

### SubPlan
Per-section plan (pass 2) detailing subsections and focus files.
`cli/internal/wiki/wiki.go:50-54`
```go
type SubPlan struct {
    Summary     string       `json:"summary"`
    FocusFiles  []string     `json:"focus_files"`
    Subsections []Subsection `json:"subsections"`
}
```

### Subsection
One planned child document within a section.
`cli/internal/wiki/wiki.go:57-61`
```go
type Subsection struct {
    Title string   `json:"title"`
    Goal  string   `json:"goal"`
    Files []string `json:"files"`
}
```

### Progress
Receives live updates during generation; callbacks may be nil.
`cli/internal/wiki/wiki.go:64-69`
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
`cli/internal/wiki/wiki.go:224-273`
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
`cli/internal/wiki/wiki.go:278-319`
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
`cli/internal/wiki/wiki.go:209-220`
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
`cli/internal/wiki/wiki.go:322-325`
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
`cli/internal/wiki/wiki.go:224-273` (within `Run`)
```go
// ---- pass 0: index the code's structure ----
pg.started("indexing code structure")
r.idx = codemap.Build(res)
pg.info(fmt.Sprintf("indexed %d declarations across %d files",
    r.idx.SymbolCount(), len(r.idx.Files)))
```
Uses `cli/internal/codemap` to parse declarations and build skeletons.

### Pass 1: Global Outline Planning

Generates wiki outline (sections) using LLM with repository context.
`cli/internal/wiki/wiki.go:471-497` (`planOutline`)
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
`cli/internal/wiki/wiki.go:549-554` (`docRequest` type) and `notesBlock()` (L536-546)
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
`cli/internal/wiki/wiki.go:499-533` (`planSection`)
```go
func (r *run) planSection(ctx context.Context, sec Section) (*SubPlan, error) {
    minSubs, maxSubs

<!-- kaioken:files internal/wiki/wiki.go -->
