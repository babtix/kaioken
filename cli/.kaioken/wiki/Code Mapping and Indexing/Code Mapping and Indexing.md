# Code Mapping and Indexing

## Table of Contents
- [Architecture](#architecture)
- [Key Components](#key-components)
  - [FileMap Structure](#filemap-structure)
  - [Index Construction](#index-construction)
  - [Bundle Assembly](#bundle-assembly)
  - [Language Parsers](#language-parsers)
- [Data Flow](#data-flow)
  - [File Parsing](#file-parsing)
  - [Index Building](#index-building)
  - [Skeleton Generation](#skeleton-generation)
  - [Context Bundling](#context-bundling)
- [Diagrams](#diagrams)
  - [Code Map Data Flow](#code-map-data-flow)
  - [Symbol Resolution](#symbol-resolution)
- [Reference Tables](#reference-tables)
  - [Symbol Kinds](#symbol-kinds)
  - [Bundle Options](#bundle-options)
  - [File Priority Rules](#file-priority-rules)
- [Referenced Files](#referenced-files)

## Architecture

The codemap package provides structural analysis of source files to support the knowledge engine and agent's context awareness. It creates three key artifacts:
1. **FileMap**: Per-file skeleton containing symbols (functions, types, etc.) with line anchors
2. **Index**: Repository-wide symbol index enabling cross-file verification
3. **Bundle**: Context assembly prioritizing structural visibility within token budgets

This system replaces naive truncation strategies (like "first three quarters + last quarter") by ensuring all declarations remain visible regardless of file size, while allocating remaining tokens to relevant implementation details.

## Key Components

### FileMap Structure

`internal/codemap/codemap.go` defines the core data structures for representing parsed source files.

#### Symbol Representation
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

Each symbol captures:
- Declaration metadata (name, kind, signature)
- Precise line range via `Span()` method
- Export status (language-specific rules)
- Associated documentation and receiver (for methods)

#### Symbol Kinds
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

#### FileMap Container
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

Key behaviors:
- `Exported()`: Returns only public symbols (language-specific rules)
- `Lookup(name)`: Finds symbol by name with O(n) search
- `Skeleton()`: Generates compact structural view with line anchors

#### Language Detection
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

#### Parsing Entry Point
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

Unsupported languages return `Analyzed:false` rather than errors to accommodate config/data files.

### Index Construction

`internal/codemap/index.go` builds repository-wide symbol indexes from scan results.

#### Index Structure
`internal/codemap/index.go:20-26`
```go
type Index struct {
	Root  string
	Files map[string]*FileMap // keyed by repo-relative slash path

	// symbols maps a symbol name to every file declaring it, for verification.
	symbols map[string][]string
}
```

#### Parallel Building
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

Key behaviors:
- Skips files >2MB (`maxParseBytes`) or unsupported languages
- Records all files in index (even unanalyzed ones) for path verification
- Builds symbol→file mapping for grounding verification
- Uses 8-worker parallel parsing with error group

#### Query Methods
`internal/codemap/index.go:74-92`
```go
// HasFile reports whether a repo-relative path was scanned.
func (i *Index) HasFile(path string) bool {
	_, ok := i.Files[strings.Trim(filepath.ToSlash(path), "/")]
	return ok
}

// HasSymbol reports whether any file declares a symbol by this name, and where.
func (i *Index) HasSymbol(name string) ([]string, bool) {
	files, ok := i.symbols[name]
	return files, ok
}

// SymbolCount is the total number of indexed declarations.
func (i *Index) SymbolCount() int {
	n := 0
	for _, fm := range i.Files {
		n += len(fm.Symbols)
	}
	return n
}
```

### Bundle Assembly

`internal/codemap/bundle.go` creates LLM-optimized context by combining structural skeletons with relevant source excerpts.

#### Bundle Options
`internal/codemap/bundle.go:32-40`
```go
type BundleOptions struct {
	// Goal is what the document is about; it drives relevance ranking.
	Goal string
	// MaxTokens is the approximate total budget.
	MaxTokens int
	// SkeletonShare is the fraction of the budget reserved for skeletons.
	// Zero means the default.
	SkeletonShare float64
}
```

#### Core Bundling Algorithm
`internal/codemap/bundle.go:43-129`
```go
func (i *Index) Bundle(paths []string, opt BundleOptions) string {
	if opt.MaxTokens <= 0 {
		opt.MaxTokens = 30000
	}
	share := opt.SkeletonShare
	if share <= 0 || share >= 1 {
		share = defaultSkeletonShare
	}
	total := opt.MaxTokens * charsPerToken
	skeletonBudget := int(float64(total) * share)

	ranked := i.rank(paths, opt.Goal)

	var b strings.Builder
	b.WriteString("===== STRUCTURE: every file in scope, with line anchors =====\n")
	b.WriteString("(Use these anchors when citing code, e.g. path/file.go:42-58.)\n\n")

	used, skipped := 0, 0
	for _, p := range ranked {
		fm, ok := i.Files[p]
		if !ok {
			continue
		}
		sk := fm.Skeleton()
		if used+len(sk) > skeletonBudget && used > 0 {
			skipped++
			continue
		}
		b.WriteString(sk)
		b.WriteString("\n")
		used += len(sk)
	}
	if skipped > 0 {
		fmt.Fprintf(&b, "[%d further files in scope, structure omitted for length]\n\n", skipped)
	}

	// ---- full source, most relevant first ----
	bodyBudget := total - used
	if bodyBudget < 2000 {
		return b.String()
	}
	b.WriteString("\n===== SOURCE =====\n\n")

	bodyUsed, partial, omitted := 0, 0, 0
	for _, p := range ranked {
		if bodyUsed >= bodyBudget {
			omitted++
			continue
		}
		abs := filepath.Join(i.Root, filepath.FromSlash(p))
		raw, err := os.ReadFile(abs)
		if err != nil {
			continue
		}
		content := string(raw)
		room := bodyBudget - bodyUsed

		if len(content) <= room {
			fmt.Fprintf(&b, "===== %s =====\n%s\n\n", p, content)
			bodyUsed += len(content)
			continue
		}

		// Too big for what is left: contribute whole declarations instead of a
		// byte slice, so every excerpt is syntactically complete.
		fm := i.Files[p]
		if fm == nil || !fm.Analyzed || len(fm.Symbols) == 0 {
			omitted++
			continue
		}
		excerpt := fm.excerptSymbols(content, opt.Goal, room)
		if excerpt == "" {
			omitted++
			continue
		}
		fmt.Fprintf(&b, "===== %s (selected declarations; full structure above) =====\n%s\n\n", p, excerpt)
		bodyUsed += len(excerpt)
		partial++
	}
	if partial > 0 {
		fmt.Fprintf(&b, "[%d file(s) contributed selected declarations rather than full text]\n", partial)
	}
	if omitted > 0 {
		fmt.Fprintf(&b, "[%d file(s) omitted from SOURCE; their structure is listed above]\n", omitted)
	}
	return b.String()
}
```

Key strategies:
- **Structure First**: Skeletons consume reserved budget (default 30%)
- **Relevance Ranking**: Files ordered by goal relevance and priority rules
- **Smart Excerpts**: Large files contribute complete declarations (not arbitrary slices)
- **Fallback Handling**: Omits files when budget exhausted but preserves structure

#### Excerpt Selection
`internal/codemap/bundle.go:133-193`
```go
func (f *FileMap) excerptSymbols(content, goal string, budget int) string {
	lines := strings.Split(content, "\n")
	terms := terms(goal)

	type scored struct {
		sym   Symbol
		score int
	}
	ranked := make([]scored, 0, len(f.Symbols))
	for _, s := range f.Symbols {
		sc := scoreText(s.Name+" "+s.Signature+" "+s.Doc, terms)
		if s.Exported {
			sc += 2 // the public surface is what documentation is about
		}
		ranked = append(ranked, scored{s, sc})
	}
	sort.SliceStable(ranked, func(a, b int) bool { return ranked[a].score > ranked[b].score })

	// Emit in file order for readability, but choose by score.
	chosen := map[int]bool{}
	used := 0
	for _, r := range ranked {
		start, end := r.sym.Span()
		if start < 1 || start > len(lines) {
			continue
		}
		if end > len(lines) {
			end = len(lines)
		}
		size := 0
		for i := start - 1; i < end; i++ {
			size += len(lines[i]) + 1
		}
		if used+size > budget {
			continue
		}
		chosen[r.sym.Line] = true
		used += size
	}
	if len(chosen) == 0 {
		return ""
	}

	var b strings.Builder
	for _, s := range f.Symbols {
		if !chosen[s.Line] {
			continue
		}
		start, end := s.Span()
		if start < 1 || start > len(lines) {
			continue
		}
		if end > len(lines) {
			end = len(lines)
		}
		fmt.Fprintf(&b, "--- %s:%d-%d ---\n", f.Path, start, end)
		b.WriteString(strings.Join(lines[start-1:end], "\n"))
		b.WriteString("\n\n")
	}
	return b.String()
}
```

Selection criteria:
- Scores symbols by goal term matches in name/signature/doc
- Exported symbols get +2 bonus (public surface priority)
- Chooses by score but emits in file order for readability
- Respects character budget while preserving syntactic completeness

#### Ranking System
`internal/codemap/bundle.go:197-227`
```go
func (i *Index) rank(paths []string, goal string) []string {
	t := terms(goal)
	type scored struct {
		path  string
		score int
	}
	out := make([]scored, 0, len(paths))
	for _, p := range paths {
		fm := i.Files[p]
		s := -filePriority(p) * 10 // lower priority number = earlier
		s += scoreText(p, t) * 3   // a path match is a strong signal
		if fm != nil {
			for _, sym := range fm.Symbols {
				s += scoreText(sym.Name+" "+sym.Doc, t)
			}
			s += len(fm.Exported())
		}
		out = append(out, scored{p, s})
	}
	sort.SliceStable(out, func(a, b int) bool {
		if out[a].score != out[b].score {
			return out[a].score > out[b].score
		}
		return out[a].path < out[b].path
	})
	ranked := make([]string, len(out))
	for n, s := range out {
		ranked[n] = s.path
	}
	return ranked
}
```

Priority rules (`filePriority`):
1. Manifests (package.json, go.mod, README, etc.)
2. Entry points (main.go, app.py, index.ts, etc.)
3. Models/schemas/entities
4. Routers/controllers/handlers/endpoints
5. Default (priority 5)
6. Tests (priority 9, lowest)

### Language Parsers

#### Go Parser
`internal/codemap/parse_go.go` uses `go/ast` for precise symbol extraction.

`internal/codemap/parse_go.go:14-98`
```go
func parseGo(fm *FileMap, content string) {
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, fm.Path, content, parser.ParseComments|parser.SkipObjectResolution)
	if err != nil {
		parseCLike(fm, content)
		return
	}
	if file.Name != nil {
		fm.Package = file.Name.Name
	}
	for _, imp := range file.Imports {
		if imp.Path == nil {
			continue
		}
		if p, uerr := strconv.Unquote(imp.Path.Value); uerr == nil {
			fm.Imports = append(fm.Imports, p)
		}
	}

	line := func(p token.Pos) int { return fset.Position(p).Line }

	for _, decl := range file.Decls {
		switch d := decl.(type) {
		case *ast.FuncDecl:
			sym := Symbol{
				Name:      d.Name.Name,
				Kind:      KindFunc,
				Line:      line(d.Pos()),
				EndLine:   line(d.End()),
				Exported:  d.Name.IsExported(),
				Signature: goFuncSignature(d, content, fset),
			}
			if d.Recv != nil && len(d.Recv.List) > 0 {
				sym.Kind = KindMethod
				sym.Receiver = goTypeString(d.Recv.List[0].Type)
			}
			if d.Doc != nil && len(d.Doc.List) > 0 {
				sym.Doc = strings.TrimSpace(strings.TrimPrefix(d.Doc.List[0].Text, "//"))
			}
			fm.Symbols = append(fm.Symbols, sym)

		case *ast.GenDecl:
			for _, spec := range d.Specs {
				switch s := spec.(type) {
				case *ast.TypeSpec:
					kind := KindType
					if _, ok := s.Type.(*ast.InterfaceType); ok {
						kind = KindInterface
					}
					sym := Symbol{
						Name:      s.Name.Name,
						Kind:      kind,
						Line:      line(s.Pos()),
						EndLine:   line(s.End()),
						Exported:  s.Name.IsExported(),
						Signature: "type " + s.Name.Name + " " + goTypeKeyword(s.Type),
					}
					if d.Doc != nil && len(d.Doc.List) > 0 {
						sym.Doc = strings.TrimSpace(strings.TrimPrefix(d.Doc.List[0].Text, "//"))
					}
					fm.Symbols = append(fm.Symbols, sym)

				case *ast.ValueSpec:
					kind := KindVar
					if d.Tok == token.CONST {
						kind = KindConst
					}
					for _, name := range s.Names {
						if name.Name == "_" {
							continue
						}
						fm.Symbols = append(fm.Symbols, Symbol{
							Name:      name.Name,
							Kind:      kind,
							Line:      line(name.Pos()),
							EndLine:   line(s.End()),
							Exported:  name.IsExported(),
							Signature: string(kind) + " " + name.Name,
						})
					}
				}
			}
		}
	}
}
```

Key features:
- Uses official Go parser for exact line ranges
- Falls back to CLike parser on parse errors (mid-edit templates)
- Extracts imports, package name, and full symbol details
- Handles methods via receiver detection
- Captures leading comment as documentation

#### Line-Based Parsers
`internal/codemap/parse_lines.go` handles non-Go languages with regex-based approaches.

`internal/codemap/parse_lines.go:16-31`
```go
var (
	// Python: def/async def and class, capturing indentation for body extent.
	pyDef   = regexp.MustCompile(`^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(`)
	pyClass = regexp.MustCompile(`^(\s*)class\s+([A-Za-z_]\w*)\s*[\(:]`)
	pyImp   = regexp.MustCompile(`^\s*(?:from\s+([\w\.]+)\s+import|import\s+([\w\.,\s]+))`)

	// C-like: JS/TS/Java/C#/Rust/PHP/Swift/Kotlin/C/C++.
	reClass = regexp.MustCompile(`^\s*(?:export\s+)?(?:public\s+|private\s+|protected\s+|internal\s+|abstract\s+|final\s+|sealed\s+|static\s+)*(class|interface|struct|enum|trait|impl|protocol)\s+([A-Za-z_]\w*)`)
	reFunc  = regexp.MustCompile(`^\s*(?:export\s+)?(?:default\s+)?(?:public\s+|private\s+|protected\s+|internal\s+|static\s+|final\s+|abstract\s+|override\s+|async\s+|pub\s+|fn\s+|func\s+|function\s+)*(?:function\s+|fn\s+|func\s+|def\s+)([A-Za-z_]\w*)\s*[\(<]`)
	// Arrow-function and method-shorthand forms common in JS/TS.
	reArrow  = regexp.MustCompile(`^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_]\w*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_]\w*)\s*(?::[^=]+)?=>`)
	reMethod = regexp.MustCompile(`^\s{2,}(?:public\s+|private\s+|protected\s+|static\s+|async\s+|override\s+)*([A-Za-z_]\w*)\s*\([^)]*\)\s*(?::\s*[\w<>\[\]\|\s,\.]+)?\s*\{`)
	reType   = regexp.MustCompile(`^\s*(?:export\s+)?(?:type|typealias)\s+([A-Za-z_]\w*)`)
	reImport = regexp.MustCompile(`^\s*(?:import|use|#include|require)\s+(.+)$`)
)
```

#### Python Parsing
`internal/codemap/parse_lines.go:32-104`
```go
func parsePython(fm *FileMap, content string) {
	type open struct {
		idx    int // index into fm.Symbols
		indent int
	}
	var stack []open

	closeTo := func(indent, lineNo int) {
		for len(stack) > 0 && stack[len(stack)-1].indent >= indent {
			top := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			if fm.Symbols[top.idx].EndLine == 0 {
				fm.Symbols[top.idx].EndLine = lineNo - 1
			}
		}
	}

	lastLine := 0
	eachLine(content, func(n int, line string) {
		lastLine = n
		if strings.TrimSpace(line) == "" {
			return
		}
		if m := pyImp.FindStringSubmatch(line); m != nil {
			mod := m[1]
			if mod == "" {
				mod = strings.TrimSpace(m[2])
			}
			if mod != "" {
				fm.Imports = append(fm.Imports, mod)
			}
			return
		}
		if isBlankOrComment(line) {
			return
		}

		if m := pyClass.FindStringSubmatch(line); m != nil {
			indent := indentOf(m[1] + "x")
			closeTo(indent, n)
			fm.Symbols = append(fm.Symbols, Symbol{
				Name: m[2], Kind: KindClass, Line: n,
				Exported: exportedName("python", m[2]), Signature: trimSig(line),
			})
			stack = append(stack, open{len(fm.Symbols) - 1, indent})
			return
		}
		if m := pyDef.FindStringSubmatch(line); m != nil {
			indent := indentOf(m[1] + "x")
			closeTo(indent, n)
			kind := KindFunc
			recv := ""
			// A def nested inside a class is a method.
			for i := len(stack) - 1; i >= 0; i-- {
				if fm.Symbols[stack[i].idx].Kind == KindClass {
					kind, recv = KindMethod, fm.Symbols[stack[i].idx].Name
					break
				}
			}
			fm.Symbols = append(fm.Symbols, Symbol{
				Name: m[2], Kind: kind, Line: n, Receiver: recv,
				Exported: exportedName("python", m[2]), Signature: trimSig(line),
			})
			stack = append(stack, open{len(fm.Symbols) - 1, indent})
			return
		}
		// A top-level statement closes any open blocks.
		if indentOf(line) == 0 {
			closeTo(0, n)
		}
	})
	closeTo(-1, lastLine+1)
}
```

Key features:
- Tracks indentation to determine block boundaries
- Handles nested functions (as methods) via stack
- Captures imports from `import` and `from ... import` statements
- Sets `EndLine` when block

<!-- kaioken:files internal/codemap/codemap.go,internal/codemap/index.go,internal/codemap/bundle.go,internal/codemap/parse_go.go,internal/codemap/parse_lines.go -->
