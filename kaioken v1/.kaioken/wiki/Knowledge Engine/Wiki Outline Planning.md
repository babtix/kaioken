# Wiki Outline Planning

## Table of Contents
- [Introduction](#introduction)
- [Global Plan (Outline) Generation](#global-plan-outline-generation)
  - [Input to the LLM](#input-to-the-llm)
  - [The Outline System Prompt](#the-outline-system-prompt)
  - [Output: Outline Structure](#output-outline-structure)
- [Per-Section Plan (Subplan) Generation](#per-section-plan-subplan-generation)
  - [Input to the LLM](#input-to-the-llm-1)
  - [The Subplan System Prompt](#the-subplan-system-prompt)
  - [Output: Subplan Structure](#output-subplan-structure)
- [Role of the Multiplier](#role-of-the-multiplier)
- [Persistence and User Editing](#persistence-and-user-editing)
- [Data Flow Diagram](#data-flow-diagram)
- [Referenced Files](#referenced-files)

## Introduction

The wiki outline planning phase defines the hierarchical structure of the generated documentation. It consists of two LLM-driven passes: first generating a global outline of top-level sections, then for each section creating a detailed subplan of subsections. This process transforms raw repository scan data into an editable `modules.yaml` (wiki plan) that guides subsequent knowledge card generation.

## Global Plan (Outline) Generation

The global plan (Pass 1) surveys the entire repository to propose 8–16 top-level sections covering major subsystems, features, and architectural concerns. This outline is persisted as `wiki_plan.yaml` and may be edited by the user before subsection planning begins.

### Input to the LLM

The `planOutline` function constructs a comprehensive prompt for the LLM by combining:

1. **Repository layout** - directory tree and file counts from `scan.Result.TreeSummary`
2. **Manifest contents** - key configuration files (e.g., `go.mod`, `Makefile`) via `scan.Result.ManifestContents`
3. **Code structure** - public symbols from richest files via `codemap.Index.RepoSkeleton` (after indexing)
4. **Framework facts** - detected patterns (e.g., web framework, ORM) via `detectFacts.Summary`
5. **Maintainer notes** - steering directives from config via `run.notesBlock`

```
`internal/wiki/wiki.go:471-497`
```

```go
func (r *run) planOutline(ctx context.Context) (*Outline, error) {
	var user strings.Builder
	user.WriteString("Repository layout (dir → file count, sample files):\n\n")
	user.WriteString(r.res.TreeSummary(12))
	user.WriteString("\n\nKey manifest/config file contents:\n\n")
	user.WriteString(r.res.ManifestContents(4000))
	if r.idx.ManifestContents(4000))
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
```

### The Outline System Prompt

The LLM receives a fixed system prompt (`outlineSystem`) that defines its role and output requirements:

```
`internal/wiki/wiki.go:102-117`
```

```go
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
```

### Output: Outline Structure

The LLM's JSON response is mapped to the `Outline` and `Section` types:

```
`internal/wiki/wiki.go:43-47`
```

```go
// Outline is the persisted global plan (pass 1) — user-editable.
type Outline struct {
	Version    int       `yaml:"version"`
	Multiplier int       `yaml:"multiplier"`
	Sections   []Section `yaml:"sections"`
}
```

```
`internal/wiki/wiki.go:35-40`
```

```go
// Section is one planned wiki chapter.
type Section struct {
	ID    string   `yaml:"id" json:"id"`
	Title string   `yaml:"title" json:"title"`
	Goal  string   `yaml:"goal" json:"goal"`
	Files []string `yaml:"files" json:"files"`
}
```

The outline is saved to disk via `saveOutline` and reloaded on subsequent runs unless `force` is true:

```
`internal/wiki/wiki.go:680-692`
```

```go
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

## Per-Section Plan (Subplan) Generation

For each section in the approved outline, Pass 2 generates a detailed subplan specifying subsection titles, goals, and focus files. This happens in parallel for all sections after the global plan is finalized.

### Input to the LLM

The `planSection` function builds a prompt containing:

1. **Global outline context** - all sections except current (via `outlineContext`)
2. **Architecture brief** - authoritative system description (if built via `loadOrBuildBrief`)
3. **Current section details** - ID, title, goal from the outline
4. **File structure** - either:
   - Codemap skeleton for files in scope (if index available) via `codemap.Index.Skeleton`
   - Simple file listing (fallback)

```
`internal/wiki/wiki.go:499-533`
```

```go
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
```

### The Subplan System Prompt

The LLM receives a dynamic system prompt (`subplanSystem`) where `%d` placeholders are replaced with subsection count bounds based on the multiplier:

```
`internal/wiki/wiki.go:119-129`
```

```go
const subplanSystem = `You are planning ONE SECTION of a repository wiki in detail, building on
the global outline you are given. Think of this as zooming in: given the section's goal and
the actual source files, decide the structure of this chapter.

Return ONLY JSON:
{"summary":"2-3 sentence summary of what this section will cover",
 "focus_files":["files most important for the section's own overview document"],
 "subsections":[{"title":"...","goal":"one sentence","files":["repo-relative files for this subsection"]}]}

Rules: %d–%d subsections, each a real cohesive topic grounded in the provided files. Every
subsection's files must come from the section's file list. Order subsections logically.`
```

### Output: Subplan Structure

The response maps to `SubPlan` and `Subsection` types:

```
`internal/wiki/wiki.go:50-54`
```

```go
// SubPlan is the per-section plan (pass 2).
type SubPlan struct {
	Summary     string       `json:"summary"`
	FocusFiles  []string     `json:"focus_files"`
	Subsections []Subsection `json:"subsections"`
}
```

```
`internal/wiki/wiki.go:57-61`
```

```go
// Subsection is one planned child document.
type Subsection struct {
	Title string   `json:"title"`
	Goal  string   `json:"goal"`
	Files []string `json:"files"`
}
```

Subsection documents are generated only when `multiplier >= 2` (default is ×2). Each subsection gets its own Markdown file in the section's directory.

## Role of the Multiplier

The `multiplier` parameter (from `kaioken wiki ×N` or default ×2) controls planning depth:

- **×1**: Only section documents (no subsections)
- **×2**: Section documents + subsection documents (default)
- **×3+**: More subsections and longer documents (via `maxSubs = 4*r.multiplier` capped at 12)

This affects:
- Subsection count bounds in `planSection` (`minSubs=2`, `maxSubs=4*multiplier`)
- Depth directives in document generation (see `depthDirective` function)

## Persistence and User Editing

The global outline is persisted as `<repo>/.kaioken/wiki_plan.yaml` and designed for user modification:

- Users can edit section titles, goals, and file lists
- Adding/removing sections is supported
- Deleting the file forces a fresh global plan on next run
- The outline includes a `Version` field (currently 1) and `Multiplier` used for generation

The `saveOutline` function adds a header encouraging edits:

```
`internal/wiki/wiki.go:680-692` (as shown above)
```

## Data Flow Diagram

```mermaid
flowchart TD
    A[Scan Result] --> B[Code Index]
    A --> C[Manifest/Tree Summary]
    B --> D[Global Plan Prompt]
    C --> D
    D --> E[LLM: outlineSystem]
    E --> F[Outline: Sections[]]
    F --> G[Save wiki_plan.yaml]
    G --> H{User Edit?}
    H -->|Yes| I[Edit wiki_plan.yaml]
    H -->|No| J[Use Outline]
    I --> J
    J --> K[For Each Section]
    K --> L[Subplan Prompt]
    L --> M[LLM: subplanSystem]
    M --> N[SubPlan: Summary + Subsections[]]
    N --> O[Generate Section Doc]
    N --> P[For Each Subsection]
    P --> Q[Generate Subsection Doc]
```

## Referenced Files

- `internal/wiki/wiki.go` - Contains all planning logic:
  - `Outline` and `Section` types (lines 43-47, 35-40)
  - `SubPlan` and `Subsection` types (lines 50-54, 57-61)
  - `planOutline` function (lines 471-497)
  - `planSection` function (lines 499-533)
  - `outlineSystem` and `subplanSystem` constants (lines 102-117, 119-129)
  - `saveOutline` and `OutlinePath` functions (lines 680-692, 93-95)
  - `resolveFiles` helper (lines 633-655) used to scope file access
  - `outlineContext` helper (lines 619-629) for sibling section awareness

<small>Document child of section "Knowledge Engine"</small>

<!-- kaioken:files internal/wiki/wiki.go -->
