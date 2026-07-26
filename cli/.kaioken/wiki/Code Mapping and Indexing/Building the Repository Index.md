# Building the Repository Index

## Table of Contents
- [Overview](#overview)
- [Index Structure](#index-structure)
- [Building the Index: the Build Function](#building-the-index-the-build-function)
- [Lookup Methods](#lookup-methods)
- [Generating Skeletons](#generating-skeletons)
- [Constants](#constants)
- [Referenced Files](#referenced-files)

## Overview

The repository index (`cli/internal/codemap/index.go`) builds a searchable symbol map from scan results, enabling fast lookups for the knowledge engine and agent context awareness. It processes scanned files in parallel, extracts symbols, and provides methods to check file/symbol existence, count symbols, and generate structural skeletons for LLM context.

## Index Structure

The `Index` struct represents the repository-wide codemap:

`cli/internal/codemap/index.go:20-26`
```go
// Index is the codemap for a whole repository.
type Index struct {
	Root  string
	Files map[string]*FileMap // keyed by repo-relative slash path

	// symbols maps a symbol name to every file declaring it, for verification.
	symbols map[string][]string
}
```

- **Root**: Repository root path from scan results
- **Files**: Map of repo-relative paths (normalized with slashes) to `*FileMap` objects containing per-file symbol data
- **symbols**: Reverse index mapping symbol names to slice of files declaring them (for cross-file symbol verification)

## Building the Index: the Build Function

The `Build` function constructs the index from scan results in parallel:

`cli/internal/codemap/index.go:29-71`
```go
// Build parses every scanned file into a skeleton, in parallel.
func Build(res *scan.Result) *Index {
	idx := &Index{
		Root:    res.Root,
		Files:   make(map[string]*FileMap, len(res.Files)),
		symbols: map[string][]string{},
	}
	var mu sync.Mutex
	g := new(errgroup.Group)
	g.SetLimit(8)

	for _, f := range res.Files {
		f := f
		if f.Size > maxParseBytes || Lang(f.Path) == "" {
			// Still record the file so path verification knows it exists.
			mu.Lock()
			idx.Files[f.Path] = &FileMap{Path: f.Path, Lang: Lang(f.Path), Lines: f.Lines}
			mu.Unlock()
			continue
		}
		g.Go(func() error {
			raw, err := os.ReadFile(filepath.Join(res.Root, filepath.FromSlash(f.Path)))
			if err != nil {
				return nil // an unreadable file is not fatal to the index
			}
			fm := Parse(f.Path, string(raw))
			mu.Lock()
			idx.Files[f.Path] = fm
			mu.Unlock()
			return nil
		})
	}
	_ = g.Wait()

	for path, fm := range idx.Files {
		for _, s := range fm.Symbols {
			idx.symbols[s.Name] = append(idx.symbols[s.Name], path)
		}
	}
	for name := range idx.symbols {
		sort.Strings(idx.symbols[name])
	}
	return idx
}
```

**Process**:
1. Initialize index with scan result root and empty maps
2. Process files concurrently (8-worker limit via `errgroup`)
3. For each file:
   - Skip parsing if:
     - File size exceeds `maxParseBytes` (2 MiB) to avoid large blobs
     - Language detection returns empty string (unsupported file type)
   - Still record basic file metadata (`Path`, `Lang`, `Lines`) in `Files` map for path verification
   - For parseable files: read content, call `Parse()` (from same package), store resulting `*FileMap`
4. After parallel processing:
   - Build reverse symbol index: iterate files, append each file's path to symbol's file list
   - Sort file lists for each symbol alphabetically
5. Return populated index

**Error Handling**: Unreadable files return `nil` error (non-fatal) but still appear in index with basic metadata.

## Lookup Methods

Three methods provide fast symbol and file existence checks:

### HasFile
`cli/internal/codemap/index.go:74-77`
```go
// HasFile reports whether a repo-relative path was scanned.
func (i *Index) HasFile(path string) bool {
	_, ok := i.Files[strings.Trim(filepath.ToSlash(path), "/")]
	return ok
}
```
- Normalizes input path (converts to slash, trims surrounding slashes)
- Checks existence in `Files` map
- Used by agent to verify file accessibility before operations

### HasSymbol
`cli/internal/codemap/index.go:80-83`
```go
// HasSymbol reports whether any file declares a symbol by this name, and where.
func (i *Index) HasSymbol(name string) ([]string, bool) {
	files, ok := i.symbols[name]
	return files, ok
}
```
- Returns slice of files declaring symbol and boolean success
- Enables symbol cross-reference (e.g., "where is this function defined?")
- Returns empty slice and false if symbol not found

### SymbolCount
`cli/internal/codemap/index.go:86-92`
```go
// SymbolCount is the total number of indexed declarations.
func (i *Index) SymbolCount() int {
	n := 0
	for _, fm := range i.Files {
		n += len(fm.Symbols)
	}
	return n
}
```
- Sums symbols across all files
- Provides metric for index completeness

## Generating Skeletons

Two methods generate structural overviews for LLM context:

### Skeleton
`cli/internal/codemap/index.go:95-106`
```go
// Skeleton renders the structure of the given files, in the order supplied.
func (i *Index) Skeleton(paths []string) string {
	var b strings.Builder
	for _, p := range paths {
		fm, ok := i.Files[p]
		if !ok {
			continue
		}
		b.WriteString(fm.Skeleton())
		b.WriteString("\n")
	}
	return b.String()
}
```
- Concatenates skeletons of specified files in order
- Skips missing files silently
- Used for targeted context (e.g., specific files mentioned in prompt)

### RepoSkeleton
`cli/internal/codemap/index.go:111-161`
```go
// RepoSkeleton renders a whole-repo structural overview within a rough token
// budget, richest files first. It is what the planner sees instead of only a
// directory listing, so sections can be named after real subsystems.
func (i *Index) RepoSkeleton(maxTokens int) string {
	type entry struct {
		fm    *FileMap
		score int
	}
	var entries []entry
	for _, fm := range i.Files {
		if !fm.Analyzed || len(fm.Symbols) == 0 {
			continue
		}
		// Prefer files with a large public surface: those define the system.
		entries = append(entries, entry{fm, len(fm.Exported())*3 + len(fm.Symbols)})
	}
	sort.Slice(entries, func(a, b int) bool {
		if entries[a].score != entries[b].score {
			return entries[a].score > entries[b].score
		}
		return entries[a].fm.Path < entries[b].fm.Path
	})

	budget := maxTokens * charsPerToken
	var b strings.Builder
	skipped := 0
	for _, e := range entries {
		if b.Len() >= budget {
			skipped++
			continue
		}
		// A compact form: path plus exported signatures only.
		b.WriteString(e.fm.Path)
		if e.fm.Package != "" {
			b.WriteString(" (package " + e.fm.Package + ")")
		}
		b.WriteString("\n")
		shown := e.fm.Exported()
		if len(shown) == 0 {
			shown = e.fm.Symbols
		}
		if len(shown) > 25 {
			shown = shown[:25]
		}
		for _, s := range shown {
			b.WriteString("  " + s.Signature + "\n")
		}
		b.WriteString("\n")
	}
	if skipped > 0 {
		b.WriteString("[" + itoa(skipped) + " more files omitted from this overview]\n")
	}
	return b.String()
}
```
**Algorithm**:
1. Filter files: only analyzed files with ≥1 symbol
2. Score files: `(exported symbols × 3) + total symbols` (weights public interface higher)
3. Sort: descending score, then ascending path
4. Render within token budget (`maxTokens × charsPerToken`):
   - File path + package (if any)
   - Top symbols: exported symbols first (max 25), fallback to all symbols
   - Indented signatures
5. Append omission notice if files skipped due to budget

**Purpose**: Provides planner with high-relevance structural overview instead of raw file list, enabling subsystem-based module naming.

## Constants

Two constants govern parsing limits and token estimation:

`cli/internal/codemap/index.go:17`
```go
// maxParseBytes skips files too large to be worth skeletonising (minified
// bundles, generated blobs).
const maxParseBytes = 2 << 20
```
- 2 MiB threshold: skips minified/binary files during parsing (still records metadata)

`cli/internal/codemap/index.go:163`
```go
const charsPerToken = 4
```
- Approximation: 4 characters per token for token budget calculations in `RepoSkeleton`

## Mermaid Diagram: Index Build Flow

```mermaid
flowchart TD
    A[scan.Result] --> B[Build Function]
    B --> C{File Size > maxParseBytes<br>OR Lang Unknown?}
    C -->|Yes| D[Record Basic Metadata<br>in Files Map]
    C -->|No| E[Read File Content]
    E --> F[Parse File → *FileMap]
    F --> G[Store in Files Map<br>(with mutex)]
    D --> H[Wait for All Goroutines]
    G --> H
    H --> I[Build Symbol Index:<br>For each file,<br>for each symbol:<br>append file to symbol's list]
    I --> J[Sort Symbol File Lists]
    J --> K[Return *Index]
```

## Referenced Files
- cli/internal/codemap/index.go

This chapter exclusively covers the repository index implementation in `cli/internal/codemap/index.go`, detailing how scan results are transformed into a searchable symbol map that powers context-aware operations throughout the Kaioken system. All exported declarations are documented, with behavior derived directly from the provided source code.

<!-- kaioken:files internal/codemap/index.go -->
