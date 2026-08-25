# Generating Code Skeletons

## Table of Contents
- [Individual File Skeletons](#individual-file-skeletons)
  - [The FileMap Structure](#the-filemap-structure)
  - [Parsing a File](#parsing-a-file)
  - [Rendering the Skeleton](#rendering-the-skeleton)
- [Repository-Level Index and Skeleton](#repository-level-index-and-skeleton)
  - [Building the Index](#building-the-index)
  - [RepoSkeleton: A Condensed Overview](#reposkeleton-a-condensed-overview)
- [How Skeletons Save Tokens](#how-skeletons-save-tokens)
- [Referenced Files](#referenced-files)

## Individual File Skeletons

Kaioken generates structural skeletons for source files to provide token-efficient context to LLMs. Each skeleton captures declarations (functions, types, variables, etc.) with line anchors while omitting function bodies. This allows the LLM to understand a file's interface without consuming tokens on implementation details.

### The FileMap Structure

The `FileMap` type represents a parsed file's skeleton:

`internal/codemap/codemap.go:56-64`
```go
type FileMap struct {
	Path     string // repo-relative, slash-separated
	Lang     string // "go", "python", "javascript", …
	Package  string // package/module name where the language has one
	Imports  []string
	Symbols  []Symbol
	Lines    int
	Analyzed bool // false when the language is unsupported (data/config files)
}
```

Key fields:
- `Path`: Repository-relative file path using forward slashes
- `Lang`: Detected language from file extension (see `Lang` function)
- `Package`: Language-specific package/module name (e.g., Go package)
- `Imports`: List of imported modules/packages
- `Symbols`: Slice of `Symbol` structs representing declarations
- `Lines`: Total line count in the file
- `Analyzed`: Set to `false` for unsupported languages (no error returned)

Each declaration is represented by a `Symbol`:

`internal/codemap/codemap.go:36-45`
```go
type Symbol struct {
	Name      string
	Kind      Kind
	Signature string // the declaration line, trimmed
	Line      int    // 1-indexed line of the declaration
	EndLine   int    // best-effort last line of the declaration body
	Exported  bool
	Receiver  string // for methods: the type it hangs off
	Doc       string // leading comment line, when present
}
```

The `Kind` type categorizes declarations:

`internal/codemap/codemap.go:23-32`
```go
type Kind string

const (
	KindFunc      Kind = "func"
	KindMethod    Kind = "method"
	KindType      Kind = "type"
	KindClass     Kind = "class"
	KindInterface Kind = "interface"
	KindConst     Kind = "const"
	KindVar       Kind = "var"
)
```

### Parsing a File

The `Parse` function orchestrates skeleton generation for a single file:

`internal/codemap/codemap.go:103-123`
```go
func Parse(path, content string) *FileMap {
	fm := &FileMap{
		Path:  filepath.ToSlash(path),
		Lang:  Lang(path),
		Lines: strings.Count(content, "\n") + 1,
	}
	if fm.Lang == "" {
		return fm
	}
	fm.Analyzed = true
	switch fm.Lang {
	case "go":
		parseGo(fm, content)
	case "python":
		parsePython(fm, content)
	default:
		parseCLike(fm, content)
	}
	sort.SliceStable(fm.Symbols, func(i, j int) bool { return fm.Symbols[i].Line < fm.Symbols[j].Line })
	return fm
}
```

Process:
1. Initialize `FileMap` with path, detected language, and line count
2. Return early for unsupported languages (`Lang` returns empty string)
3. For supported languages:
   - Set `Analyzed = true`
   - Dispatch to language-specific parser (`parseGo`, `parsePython`, or `parseCLike`)
   - Sort symbols by line number for consistent output

Language detection uses extension mapping:

`internal/codemap/codemap.go:88-95`
```go
var langByExt = map[string]string{
	".go": "go", ".py": "python", ".rb": "ruby", ".rs": "rust",
	".js": "javascript", ".jsx": "javascript", ".mjs": "javascript",
	".ts": "typescript", ".tsx": "typescript",
	".java": "java", ".kt": "kotlin", ".cs": "csharp",
	".php": "php", ".swift": "swift", ".c": "c", ".h": "c",
	".cc": "cpp", ".cpp": "cpp", ".hpp": "cpp",
}

// Lang reports the parser family for a path, or "" when unsupported.
func Lang(path string) string { return langByExt[strings.ToLower(filepath.Ext(path))] }
```

### Rendering the Skeleton

The `Skeleton` method on `FileMap` produces the final string representation:

`internal/codemap/codemap.go:128-163`
```go
func (f *FileMap) Skeleton() string {
	var b strings.Builder
	b.WriteString(f.Path)
	if f.Package != "" {
		b.WriteString("  (" + f.Lang + ", package " + f.Package + ")")
	} else if f.Lang != "" {
		b.WriteString("  (" + f.Lang + ")")
	}
	b.WriteString("\n")
	if !f.Analyzed {
		return b.String()
	}
	if len(f.Imports) > 0 {
		imports := f.Imports
		if len(imports) > 20 {
			imports = imports[:20]
		}
		b.WriteString("  imports: " + strings.Join(imports, ", "))
		if len(f.Imports) > len(imports) {
			b.WriteString(", …")
		}
		b.WriteString("\n")
	}
	for _, s := range f.Symbols {
		start, end := s.Span()
		b.WriteString("  L" + itoa(start))
		if end > start {
			b.WriteString("-" + itoa(end))
		}
		b.WriteString("  " + s.Signature + "\n")
	}
	if len(f.Symbols) == 0 {
		b.WriteString("  (no declarations found)\n")
	}
	return b.String()
}
```

Output format:
- First line: `path  (lang, package pkg)` or `path  (lang)` for package-less languages
- Second line (if imports exist): `  imports: imp1, imp2, …` (truncated after 20)
- Subsequent lines: `  Lstart-end  signature` for each symbol
- Falls back to `  (no declarations found)` if no symbols detected

Symbol line ranges use the `Span` method:

`internal/codemap/codemap.go:48-53`
```go
func (s Symbol) Span() (start, end int) {
	if s.EndLine < s.Line {
		return s.Line, s.Line
	}
	return s.Line, s.EndLine
}
```

Helper functions support rendering:
- `itoa`: Integer to string conversion (no external dependencies)
- `eachLine`: Line-by-line content scanning with 1-indexed line numbers
- `indentOf`: Counts leading whitespace (tabs = 1 space)
- `isBlankOrComment`: Detects empty lines or comments
- `exportedName`: Determines if symbol is public (Go: uppercase first char; others: not underscore-prefixed)
- `trimSig`: Removes trailing `{` or `:` from declaration lines

## Repository-Level Index and Skeleton

While `FileMap` handles individual files, the `Index` type builds a cross-repository symbol map for broader context and generates condensed overviews.

### Building the Index

The `Build` function in `index.go` creates a repository-wide index from scan results:

`internal/codemap/index.go:29-71`
```go
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

Process:
1. Initialize index with root path and empty file/symbol maps
2. Process each scanned file in parallel (8-worker limit via `errgroup`)
3. Skip files exceeding `maxParseBytes` (2MB) or unsupported languages (still record as stub `FileMap`)
4. For processable files:
   - Read file content
   - Parse into `FileMap` via `codemap.Parse`
   - Store in index under repo-relative path
5. Build reverse symbol index: map symbol name → slice of files declaring it
6. Sort file lists for each symbol

Constants:
`internal/codemap/index.go:17`
```go
const maxParseBytes = 2 << 20 // 2MB
```

### RepoSkeleton: A Condensed Overview

The `RepoSkeleton` method generates a token-budget-conscious structural overview of the entire repository, prioritizing files with large public surfaces:

`internal/codemap/index.go:111-161`
```go
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

Key aspects:
1. **Scoring**: Prioritizes files by `len(Exported())*3 + len(Symbols)` - weights public symbols 3x higher than total symbols
2. **Sorting**: Primary by score (descending), secondary by path (ascending)
3. **Token budget**: Calculated as `maxTokens * charsPerToken` (4 chars/token constant)
4. **Output per file**:
   - `path  (package pkg)` or `path`
   - Exported symbols (or all symbols if none exported), limited to 25
   - Format: `  signature` (no line numbers in repo overview)
5. **Omission notice**: Shows count of skipped files when budget exceeded

Constant:
`internal/codemap/index.go:163`
```go
const charsPerToken = 4
```

The `Skeleton` method (for arbitrary file lists) provides simpler concatenation:

`internal/codemap/index.go:95-106`
```go
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

## How Skeletons Save Tokens

Code skeletons address the token inefficiency of naively feeding large files to LLMs:

1. **Declaration-focused**: Only signatures and structural elements are included (no function bodies)
2. **Line anchors**: Each declaration includes `Lstart-end` markers enabling precise source referencing
3. **Language-agnostic**: Uniform format across supported languages (Go, Python, JavaScript, etc.)
4. **Repository-level prioritization**: `RepoSkeleton` focuses on files defining public interfaces
5. **Configurable limits**: 
   - Per-file: Import lists truncated after 20 entries
   - Repo overview: Symbols limited to 25 per file, files sorted by public surface size
   - Token budget: Hard limit via `maxTokens` parameter in `RepoSkeleton`

Example skeleton output for a Go file:
```
internal/agent/agent.go  (go, package agent)
  imports: context, errors, fmt, io, strings
  L10-10  type Agent struct
  L12-12  func NewAgent(ui UI, llmClient *llm.Client, cfg *config.Config, session *session.State, skills *skills.Manager, wiki *wiki.Wiki, codemap *codemap.Index, state *state.State, gitx *gitx.GitX) *Agent
  L15-15  func (a *Agent) Run() error
  L20-20  func (a *Agent) handleMessage(msg string) (string, error)
  L25-25  func (a *Agent) approveToolUse(toolName string, args map[string]any) (bool, error)
```

This captures the file's interface in ~15 tokens versus hundreds for full content, preserving critical structural context while minimizing token consumption.

## Referenced Files
- internal/codemap/codemap.go
- internal/codemap/index.go

<!-- kaioken:files internal/codemap/codemap.go,internal/codemap/index.go -->
