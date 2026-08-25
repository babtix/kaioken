# Knowledge Card Generation and Refinement

## Table of Contents
- [Overview](#overview)
- [Multi-Pass Generation Process](#multi-pass-generation-process)
  - [Pass 1: Global Outline](#pass-1-global-outline)
  - [Pass 2: Section Sub-Plan](#pass-2-section-sub-plan)
  - [Pass 3a: Section Document Generation](#pass-3a-section-document-generation)
  - [Pass 3b: Subsection Documents](#pass-3b-subsection-documents)
- [Quality Refinement Passes](#quality-refinement-passes)
  - [Self-Critique Pass (×4+)](#self-critique-pass-×4+)
  - [Grounding Verification and Correction (×10)](#grounding-verification-and-correction-×10)
- [Context Assembly for LLM Prompts](#context-assembly-for-llm-prompts)
  - [Code Bundling](#code-bundling)
  - [Architecture Brief](#architecture-brief)
  - [Framework Facts](#framework-facts)
- [Error Handling and Resilience](#error-handling-and-resilience)
- [Referenced Files](#referenced-files)

## Overview

Knowledge cards are generated through a multi-pass pipeline that combines LLM-generated content with rigorous quality refinement. Each wiki section undergoes:
1. **Global planning** (Pass 1) to define the wiki structure
2. **Section-specific planning** (Pass 2) to outline subsection structure
3. **Content generation** (Pass 3a) for the section's main document
4. **Subsection generation** (Pass 3b) for detailed child documents (when multiplier ≥ 2)
5. **Quality refinement** through critique and correction passes (when multiplier ≥ 4)

The pipeline is implemented in `cli/internal/wiki/wiki.go` and `cli/internal/wiki/passes.go`, with the core orchestration in the `Run` function.

## Multi-Pass Generation Process

### Pass 1: Global Outline

The process begins by either loading an existing wiki plan or generating a new one via `planOutline`. This pass creates a structural skeleton of the repository to inform section planning:

```go
// cli/internal/wiki/wiki.go
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
```

The outline defines sections with IDs, titles, goals, and relevant files, stored in `wiki_plan.yaml` for user editing.

### Pass 2: Section Sub-Plan

For each section, the system generates a detailed sub-plan via `planSection`. This pass focuses on the section's specific goal and available files:

```go
// cli/internal/wiki/wiki.go
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

The sub-plan specifies focus files for the section overview and defines subsections with their own titles, goals, and file lists.

### Pass 3a: Section Document Generation

The main section document is generated via `generateDoc`, which creates a long-form markdown file based on the section's goal and sub-plan summary:

```go
// cli/internal/wiki/wiki.go
func (r *run) runSection(ctx context.Context, sec Section) error {
	// ... setup ...
	
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
	
	// ... subsection generation ...
}
```

The `generateDoc` function assembles context and invokes the LLM with the `docSystem` prompt and depth directive:

```go
// cli/internal/wiki/wiki.go
func (r *run) generateDoc(ctx context.Context, req docRequest) (string, error) {
	user := r.docPrompt(req)

	doc, err := r.client.Chat(ctx, docSystem+depthDirective(r.multiplier), user)
	if err != nil {
		return "", err
	}
	doc = unfence(doc)
	
	// ... quality passes ...
	
	return stampProvenance(doc, filePaths(req.Files)), nil
}
```

### Pass 3b: Subsection Documents

When the multiplier is 2 or higher, the system generates additional documents for each planned subsection:

```go
// cli/internal/wiki/wiki.go
// ---- pass 3b: one document per planned subsection ----
if r.multiplier < 2 {
	return nil
}
for _, sub := range sp.Subsections {
	// ... context setup ...
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
```

Subsection documents inherit the section's goal and global outline context, with their own specific focus.

## Quality Refinement Passes

### Self-Critique Pass (×4+)

At multiplier 4 and above, a critique pass revises the draft against a quality rubric:

```go
// cli/internal/wiki/wiki.go
if r.multiplier >= critiqueMultiplier {
	if revised, cerr := r.critique(ctx, req, doc); cerr == nil && revised != "" {
		doc = revised
	} else if cerr != nil {
		r.pg.info("critique pass skipped for " + req.Title + ": " + cerr.Error())
	}
}
```

The critique pass is implemented in `passes.go`:

```go
// cli/internal/wiki/passes.go
func (r *run) critique(ctx context.Context, req docRequest, draft string) (string, error) {
	var user strings.Builder
	fmt.Fprintf(&user, "Chapter under review: %s\n\nIts goal was:\n%s\n\n", req.Title, req.Goal)
	user.WriteString("===== DRAFT =====\n")
	user.WriteString(draft)
	user.WriteString("\n\n===== THE SOURCES IT WAS WRITTEN FROM =====\n")
	user.WriteString(bundleFiles(r.idx, req.Files, req.Title+" "+req.Goal, r.cfg.MaxModuleTokens))

	revised, err := r.client.Chat(ctx, critiqueSystem, user.String())
	if err != nil {
		return "", err
	}
	revised = unfence(revised)
	// A revision that collapses the document is a failed pass, not an
	// improvement — keep the draft rather than shipping a stub.
	if len(revised) < len(draft)/3 {
		return "", fmt.Errorf("revision collapsed the document (%d → %d chars); keeping the draft",
			len(draft), len(revised))
	}
	return revised, nil
}
```

The `critiqueSystem` prompt instructs the LLM to check for coverage, accuracy, padding, concreteness, and structure.

### Grounding Verification and Correction (×10)

At multiplier 10 and above, grounding failures trigger a correction pass:

```go
// cli/internal/wiki/wiki.go
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
```

The correction pass is implemented in `passes.go`:

```go
// cli/internal/wiki/passes.go
func (r *run) correct(ctx context.Context, req docRequest, draft string, rep Report) (string, error) {
	var user strings.Builder
	fmt.Fprintf(&user, "Chapter: %s\n\n", req.Title)
	user.WriteString("Unverifiable claims found by the automated check:\n")
	user.WriteString(rep.Detail(40))
	user.WriteString("\n===== CHAPTER =====\n")
	user.WriteString(draft)
	user.WriteString("\n\n===== THE ACTUAL SOURCES =====\n")
	user.WriteString(bundleFiles(r.idx, req.Files, req.Title+" "+req.Goal, r.cfg.MaxModuleTokens))

	fixed, err := r.client.Chat(ctx, correctSystem, user.String())
	if err != nil {
		return "", err
	}
	fixed = unfence(fixed)
	if len(fixed) < len(draft)/3 {
		return "", fmt.Errorf("correction collapsed the document; keeping the original")
	}
	return fixed, nil
}
```

The `correctSystem` prompt directs the LLM to fix only the specific unverifiable claims identified by the verification step.

## Context Assembly for LLM Prompts

### Code Bundling

Source context is assembled via `bundleFiles`, which uses the code map to provide structural skeletons and relevant file bodies:

```go
// cli/internal/wiki/wiki.go
func bundleFiles(idx *codemap.Index, files []scan.File, goal string, maxTokens int) string {
	paths := make([]string, 0, len(files))
	for _, f := range files {
		paths = append(paths, f.Path)
	}
	return idx.Bundle(paths, codemap.BundleOptions{Goal: goal, MaxTokens: maxTokens})
}
```

This approach prioritizes structural completeness over truncating file middles, ensuring LLM context includes symbol relationships.

### Architecture Brief

An authoritative architecture brief is loaded once per wiki run and injected into all prompts:

```go
// cli/internal/wiki/wiki.go
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

// cli/internal/wiki/wiki.go
// ---- pass 1b: the shared architecture brief ----
if err := r.loadOrBuildBrief(ctx); err != nil {
	pg.failed("architecture brief", err)
}
```

The brief is built from the global outline and maintained throughout the generation process to ensure consistency.

### Framework Facts

Real framework facts extracted from the code are scoped to each document's file set:

```go
// cli/internal/wiki/wiki.go
if facts := detectFacts(r.res, r.idx); facts.Any() {
	user.WriteString("\nFramework facts extracted from the code (real; cover the ones in scope):\n")
	user.WriteString(facts.ScopedSummary(filePaths(req.Files), 60))
}
```

These facts prevent hallucination by grounding the LLM in verified repository characteristics.

## Error Handling and Resilience

The wiki generation includes several resilience mechanisms:

1. **Section-level isolation**: Failures in one section don't abort the entire wiki build:
   ```go
   // cli/internal/wiki/wiki.go
   func (r *run) runSections(ctx context.Context, sections []Section) error {
	   // ...
	   g.Go(func() error {
		   if err := r.runSection(gctx, sec); err != nil {
			   r.pg.failed(sec.Title, err)
			   fail.add(sec.Title) // section failures don't abort the whole wiki
		   }
		   return nil
	   })
   }
   ```

2. **Retry capability**: Failed sections can be retried independently:
   ```go
   // cli/internal/wiki/wiki.go
   func Retry(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
   	res *scan.Result, pg Progress) (int, error) {
   	// ...
   	pg.info(fmt.Sprintf("retrying %d failed section(s)", len(sections)))
   	// ...
   }
   ```

3. **Document existence checks**: Skips regeneration unless forced:
   ```go
   // cli/internal/wiki/wiki.go
   mainDoc := filepath.Join(WikiDir(r.repo), safeName(sec.Title)+".md")
   if !r.force {
	   if _, err := os.Stat(mainDoc); err == nil {
		   r.pg.info("skip (exists): " + sec.Title)
		   return nil
	   }
   }
   ```

4. **Quality pass safeguards**: Prevents over-aggressive revision/correction:
   ```go
   // cli/internal/wiki/passes.go
   if len(revised) < len(draft)/3 {
	   return "", fmt.Errorf("revision collapsed the document (%d → %d chars); keeping the draft",
		   len(draft), len(revised))
   }
   ```

## Referenced Files

- `cli/internal/wiki/wiki.go`: Contains the main wiki generation pipeline (`Run`, `runSection`, `generateDoc`)
- `cli/internal/wiki/passes.go`: Implements critique and correction quality passes
- `internal/codemap/codemap.go`: Provides code indexing and bundling for LLM context
- `internal/scan/scan.go`: Handles repository file inventory
- `internal/plan/plan.go`: Generates the initial module plan (used for outline context)

This multi-pass approach ensures knowledge cards are both comprehensive and grounded in actual source code, with iterative refinement to eliminate inaccuracies and padding while maintaining structural integrity.

<!-- kaioken:files internal/wiki/wiki.go,internal/wiki/passes.go -->
