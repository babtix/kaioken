# Parsing Individual Files

This chapter explains how kaioken parses a single source file into a `FileMap` containing symbols, including language detection and the use of AST for Go versus regex-based parsing for other languages. The `FileMap` serves as a lightweight structural skeleton used by the knowledge engine for context-aware operations.

## Table of Contents
- [Introduction](#introduction)
- [Language Detection](#language-detection)
- [The Parse Function](#the-parse-function)
- [Parsing Go Files](#parsing-go-files)
- [Parsing Python Files](#parsing-python-files)
- [Parsing C-like Languages](#parsing-c-like-languages)
- [FileMap Structure](#filemap-structure)
- [Symbol Structure](#symbol-structure)
- [Skeleton Rendering](#skeleton-rendering)
- [Helper Functions](#helper-functions)
- [Error Handling and Edge Cases](#error-handling-and-edge-cases)
- [Parsing Flow Diagram](#parsing-flow-diagram)
- [Supported Languages Table](#supported-languages-table)
- [Referenced Files](#referenced-files)

## Introduction

The `codemap` package extracts a structural skeleton from source files: what a file declares, and where. This skeleton enables two critical functions:
1. **Grounding verification**: Confirming whether a symbol the LLM claims to use actually exists in the file.
2. **Line anchoring**: Providing exact line ranges for code excerpts referenced in LLM responses.

Unlike the previous approach of feeding only the first and last quarters of large files to the model, the skeleton ensures every declaration is always visible within a tiny token budget, allowing the remaining budget to be spent on relevant function bodies.

## Language Detection

The `Lang` function determines the parser family based on file extension:

```go
// Lang reports the parser family for a path, or "" when unsupported.
func Lang(path string) string { return langByExt[strings.ToLower(filepath.Ext(path))] }
```

It uses the `langByExt` map:

```go
// langByExt maps a file extension to the parser family used for it.
var langByExt = map[string]string{
	".go": "go", ".py": "python", ".rb": "ruby", ".rs": "rust",
	".js": "javascript", ".jsx": "javascript", ".mjs": "javascript",
	".ts": "typescript", ".tsx": "typescript",
	".java": "java", ".kt": "kotlin", ".cs": "csharp",
	".php": "php", ".swift": "swift", ".c": "c", ".h": "c",
	".cc": "cpp", ".cpp": "cpp", ".hpp": "cpp",
}
```

If the extension is not found (e.g., `.json`, `.yaml`, `.md`), `Lang` returns an empty string, indicating an unsupported language.

## The Parse Function

`Parse` is the entry point for building a `FileMap`:

```go
// Parse builds a skeleton for one file's contents. Unsupported languages come
// back with Analyzed false rather than an error — a repo is full of JSON, YAML
// and markdown, and none of it should look like a failure.
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

The function:
1. Initializes a `FileMap` with the normalized path, detected language, and line count.
2. Returns early if the language is unsupported (`Lang` returns empty string), leaving `Analyzed` false.
3. For supported languages, sets `Analyzed` to true and dispatches to the appropriate parser:
   - `parseGo` for Go files (AST-based)
   - `parsePython` for Python files (line-based, indentation-aware)
   - `parseCLike` for all other supported languages (line-based, brace-depth)
4. Sorts symbols by line number for consistent output.

## Parsing Go Files

Go files use the standard Go parser for exact symbol extraction and line ranges:

```go
// parseGo uses the real Go parser, which gives exact line ranges. A file that
// does not compile (mid-edit, or a template) falls back to the line-based
// parser rather than yielding nothing.
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

Key behaviors:
- Uses `go/parser.ParseFile` with `ParseComments` to capture documentation and `SkipObjectResolution` to avoid type-checking (faster, works on incomplete code).
- On parse failure (e.g., mid-edit), falls back to `parseCLike` to avoid returning no symbols.
- Extracts package name from `file.Name`.
- Collects import paths by unquoting `imp.Path.Value`.
- Processes declarations:
  - `FuncDecl`: Creates a `Symbol` with `KindFunc` (or `KindMethod` if it has a receiver). Signature recovered via `goFuncSignature` for accuracy.
  - `GenDecl`:
    - `TypeSpec`: Creates `KindType` (or `KindInterface` for interfaces). Signature formatted as "type <name> <keyword>".
    - `ValueSpec`: Creates `KindVar` or `KindConst` based on `d.Tok`. Skips blank identifiers (`_`).
- For each symbol:
  - `Line` and `EndLine` derived from AST positions (exact ranges).
  - `Exported` set via `IsExported()` (Go's capitalization rule).
  - `Receiver` set for methods from the first parameter in the receiver list.
  - `Doc` extracted from the leading comment line (stripping `//` prefix).

Helper functions for Go parsing:
```go
// goFuncSignature recovers the declaration text up to the opening brace, which
// is more informative than reconstructing it from the AST.
func goFuncSignature(d *ast.FuncDecl, content string, fset *token.FileSet) string {
	start := fset.Position(d.Pos()).Offset
	end := len(content)
	if d.Body != nil {
		end = fset.Position(d.Body.Lbrace).Offset
	} else if d.Type != nil {
		end = fset.Position(d.Type.End()).Offset
	}
	if start < 0 || end > len(content) || start >= end {
		return "func " + d.Name.Name
	}
	sig := strings.Join(strings.Fields(content[start:end]), " ")
	return trimSig(sig)
}

func goTypeKeyword(expr ast.Expr) string {
	switch expr.(type) {
	case *ast.StructType:
		return "struct"
	case *ast.InterfaceType:
		return "interface"
	case *ast.FuncType:
		return "func"
	case *ast.MapType:
		return "map"
	case *ast.ArrayType:
		return "slice/array"
	default:
		return goTypeString(expr)
}

func goTypeString(expr ast.Expr) string {
	switch t := expr.(type) {
	case *ast.Ident:
		return t.Name
	case *ast.StarExpr:
		return "*" + goTypeString(t.X)
	case *ast.SelectorExpr:
		return goTypeString(t.X) + "." + t.Sel.Name
	case *ast.IndexExpr: // generic instantiation
		return goTypeString(t.X)
	default:
		return "?"
	}
}
```

## Parsing Python Files

Python uses a line-based parser that tracks indentation to determine body extent:

```go
// parsePython tracks indentation to find where a def/class body ends, which is
// what makes line anchors meaningful in Python.
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

Key behaviors:
- Uses regex patterns:
  - `pyDef`: Matches `def` or `async def` function declarations (captures indentation and function name).
  - `pyClass`: Matches `class` declarations (captures indentation and class name).
  - `pyImp`: Matches import statements (`import` or `from ... import`).
- Tracks indentation to build a stack of open blocks (functions/classes).
- When a new declaration is found at a given indentation level:
  - Closes all blocks in the stack with equal or greater indentation (setting their `EndLine` to the line before the current declaration).
  - Pushes the new declaration onto the stack.
- For functions:
  - Determines if it's a method by checking if it's nested inside a class (sets `KindMethod` and `Receiver` to the class name).
  - Sets `Exported` based on whether the name starts with underscore (private) or not (public) via `exportedName`.
- For classes: Sets `KindClass` and `Exported` similarly.
- After processing all lines, closes any remaining blocks by setting their `EndLine` to the last line of the file.
- Import statements are added to `fm.Imports` (only the module name).

## Parsing C-like Languages

Languages like JavaScript, TypeScript, Java, C#, Rust, etc., use a line-based parser with brace depth to estimate body extent:

```go
// parseCLike uses brace depth to bound bodies. It is approximate — braces
// inside strings and comments are not tracked — so end lines are a hint, not a
// guarantee, and callers clamp anchors to the real file length.
func parseCLike(fm *FileMap, content string) {
	type open struct {
		idx   int
		depth int
	}
	var stack []open
	depth := 0

	lastLine := 0
	eachLine(content, func(n int, line string) {
		lastLine = n
		trimmed := strings.TrimSpace(line)

		if m := reImport.FindStringSubmatch(line); m != nil && depth == 0 {
			imp := strings.Trim(strings.TrimSuffix(strings.TrimSpace(m[1]), ";"), `"'<>`)
			if imp != "" && len(fm.Imports) < 200 {
				fm.Imports = append(fm.Imports, imp)
			}
		}

		if !isBlankOrComment(line) {
			var sym *Symbol
			switch {
			case reClass.MatchString(line):
				m := reClass.FindStringSubmatch(line)
				kind := KindClass
				switch m[1] {
				case "interface", "protocol", "trait":
					kind = KindInterface
				case "struct", "enum", "impl":
					kind = KindType
				}
				sym = &Symbol{Name: m[2], Kind: kind, Line: n, Signature: trimSig(line)}
			case reFunc.MatchString(line):
				m := reFunc.FindStringSubmatch(line)
				sym = &Symbol{Name: m[1], Kind: KindFunc, Line: n, Signature: trimSig(line)}
			case reArrow.MatchString(line):
				m := reArrow function and method-shorthand forms common in JS/TS.
				m := reArrow.FindStringSubmatch(line)
				sym = &Symbol{Name: m[1], Kind: KindFunc, Line: n, Signature: trimSig(line)}
			case reType.MatchString(line):
				m := reType.FindStringSubmatch(line)
				sym = &Symbol{Name: m[1], Kind: KindType, Line: n, Signature: trimSig(line)}
			case depth > 0 && reMethod.MatchString(line):
				m := reMethod.FindStringSubmatch(line)
				// Filter out control-flow keywords that look like calls.
				switch m[1] {
				case "if", "for", "while", "switch", "catch", "return", "else", "do", "try":
				default:
					recv := ""
					for i := len(stack) - 1; i >= 0; i-- {
						k := fm.Symbols[stack[i].idx].Kind
						if k == KindClass || k == KindInterface || k == KindType {
							recv = fm.Symbols[stack[i].idx].Name
							break
						}
					}
					sym = &Symbol{Name: m[1], Kind: KindMethod, Line: n,
						Receiver: recv, Signature: trimSig(line)}
				}
			}
			if sym != nil {
				sym.Exported = exportedName(fm.Lang, sym.Name)
				if strings.Contains(line, "export ") || strings.Contains(line, "public ") ||
					strings.Contains(line, "pub ") {
					sym.Exported = true
				}
				fm.Symbols = append(fm.Symbols, *sym)
				if strings.Contains(trimmed, "{") {
					stack = append(stack, open{len(fm.Symbols) - 1, depth})
				} else {
					// Declaration without a body on this line (signature only).
					fm.Symbols[len(fm.Symbols)-1].EndLine = n
				}
			}
		}

		depth += strings.Count(line, "{") - strings.Count(line, "}")
		if depth < 0 {
			depth = 0
		}
		for len(stack) > 0 && depth <= stack[len(stack)-1].depth {
			top := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			if fm.Symbols[top.idx].EndLine == 0 {
				fm.Symbols[top.idx].EndLine = n
			}
		}
	})
	for _, o := range stack {
		if fm.Symbols[o.idx].EndLine == 0 {
			fm.Symbols[o.idx].EndLine = lastLine
		}
	}
}
```

Key behaviors:
- Uses regex patterns to detect declarations:
  - `reClass`: Matches class/interface/struct/etc. declarations (with optional modifiers).
  - `reFunc`: Matches function declarations (with optional modifiers like `public`, `async`, etc.).
  - `reArrow`: Matches arrow functions and method shorthand (e.g., `const foo = () => {}`).
  - `reType`: Matches type aliases (e.g., `type MyType = string`).
  - `reImport`: Matches import/include/require statements.
- Tracks brace depth (`{` and `}`) to estimate when a symbol's body ends.
- When a declaration is found:
  - Creates a `Symbol` with appropriate `Kind` (based on matched pattern).
  - Sets `Exported` using `exportedName` (underscore prefix = private for non-Go languages), then overrides to `true` if the line contains `export`, `public`, or `pub`.
  - For method-like declarations (matched by `reMethod` inside a block), sets `KindMethod` and `Receiver` to the innermost class/interface/type name from the stack.
  - If the declaration line contains `{`, pushes it onto the stack to track its body; otherwise, sets `EndLine` to the current line (signature only).
- Uses brace depth to close blocks: when current depth is less than or equal to the depth of the top stack item, pops the stack and sets that symbol's `EndLine` to the current line.
- After processing, sets `EndLine` for any remaining open symbols to the last line of the file.

## FileMap Structure

The `FileMap` struct represents the parsed skeleton of a single file:

```go
// FileMap is the skeleton of one file.
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

Fields:
- `Path`: Normalized repo-relative path (using forward slashes).
- `Lang`: Language identifier from `Lang(path)` (empty for unsupported languages).
- `Package`: Package name (only set for Go from AST; empty for other languages).
- `Imports`: Slice of import paths/module names.
- `Symbols`: Slice of `Symbol` structs, sorted by line number.
- `Lines`: Total lines in the file (1-indexed, calculated as `strings.Count(content, "\n") + 1`).
- `Analyzed`: `true` if language was supported and parsed; `false` for unsupported languages (no symbols parsed).

## Symbol Structure

Each declaration in a file is represented by a `Symbol`:

```go
// Symbol is one declaration found in a file.
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

Fields:
- `Name`: Identifier of the symbol (function, type, variable name).
- `Kind`: Declaration type (`KindFunc`, `KindMethod`, `KindType`, `KindClass`, `KindInterface`, `KindConst`, `KindVar`).
- `Signature`: The declaration line with trailing `{` or `:` removed and extra whitespace collapsed (via `trimSig`).
- `Line`: Starting line number (1-indexed).
- `EndLine`: Ending line number (best effort):
  - For Go: Exact from AST (`line(d.End())`).
  - For Python: Last line of the indentation block.
  - For C-like: Estimated by brace depth (may be approximate due to braces in strings/comments).
- `Exported`: Whether the symbol is part of the public interface:
  - Go: Determined by `IsExported()` (first letter uppercase).
  - Other languages: `true` unless name starts with `_` (private convention), overridden to `true` if line contains `export`, `public`, or `pub`.
- `Receiver`: For methods, the type they are attached to (empty for non-methods).
- `Doc`: Leading comment line (if present), with comment prefix stripped (e.g., `//` or `#`).

The `Span` method returns the symbol's line range for anchoring:

```go
// Span returns the symbol's line range, usable as a source anchor.
func (s Symbol) Span() (start, end int) {
	if s.EndLine < s.Line {
		return s.Line, s.Line
	}
	return s.Line, s.EndLine
}
```

## Skeleton Rendering

The `Skeleton` method renders the `FileMap` into a compact string for LLM prompts:

```go
// Skeleton renders the file's structure compactly: what it declares, with line
// anchors, and nothing else. This is what every prompt gets for every file,
// regardless of budget.
func (f *FileMap) Skeleton() string {
	var b strings.Builder
	b.WriteString(f.Path)
	if f.Package != "" {
		b.WriteString("  (" + f.Lang + ", package " + f.Package + ")")
	} else if f.Lang != "" {
		b.WriteString("  (" + f.Lang + ")")

<!-- kaioken:files internal/codemap/codemap.go,internal/codemap/parse_go.go,internal/codemap/parse_lines.go -->
