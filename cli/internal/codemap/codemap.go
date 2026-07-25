// Package codemap extracts a structural skeleton from source files: what a
// file declares, and where.
//
// Kaioken's bundler used to feed the model a file's first three quarters and
// last quarter, which meant that for any large file the middle — where the
// logic lives — was never seen. A skeleton fixes that: every declaration is
// always visible within a tiny token budget, and the remaining budget can be
// spent on the bodies that actually matter for the task at hand.
//
// The same index answers two other questions: "does this symbol the model
// just claimed actually exist?" (grounding verification) and "which lines back
// this excerpt?" (line anchors).
package codemap

import (
	"bufio"
	"path/filepath"
	"sort"
	"strings"
)

// Kind classifies a declaration.
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

// Span returns the symbol's line range, usable as a source anchor.
func (s Symbol) Span() (start, end int) {
	if s.EndLine < s.Line {
		return s.Line, s.Line
	}
	return s.Line, s.EndLine
}

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

// Exported returns only the symbols that form the file's public surface.
func (f *FileMap) Exported() []Symbol {
	var out []Symbol
	for _, s := range f.Symbols {
		if s.Exported {
			out = append(out, s)
		}
	}
	return out
}

// Lookup finds a symbol by name.
func (f *FileMap) Lookup(name string) (Symbol, bool) {
	for _, s := range f.Symbols {
		if s.Name == name {
			return s, true
		}
	}
	return Symbol{}, false
}

// langByExt maps a file extension to the parser family used for it.
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

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}

// ---- helpers shared by the line-based parsers ----

// lineScanner walks a file's lines with 1-indexed numbering.
func eachLine(content string, fn func(n int, line string)) {
	sc := bufio.NewScanner(strings.NewReader(content))
	sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	n := 0
	for sc.Scan() {
		n++
		fn(n, sc.Text())
	}
}

// indentOf counts leading whitespace, tabs expanded to one column each.
func indentOf(line string) int {
	n := 0
	for _, r := range line {
		if r != ' ' && r != '\t' {
			break
		}
		n++
	}
	return n
}

func isBlankOrComment(line string) bool {
	t := strings.TrimSpace(line)
	return t == "" || strings.HasPrefix(t, "//") || strings.HasPrefix(t, "#") ||
		strings.HasPrefix(t, "*") || strings.HasPrefix(t, "/*")
}

// exportedName reports whether a name is part of a public surface. Go uses
// capitalisation; most other languages use a leading underscore for private.
func exportedName(lang, name string) bool {
	if name == "" {
		return false
	}
	if lang == "go" {
		r := rune(name[0])
		return r >= 'A' && r <= 'Z'
	}
	return !strings.HasPrefix(name, "_")
}

// trimSig normalises a declaration line for display.
func trimSig(line string) string {
	s := strings.TrimSpace(line)
	s = strings.TrimSuffix(s, "{")
	s = strings.TrimSuffix(s, ":")
	return strings.TrimSpace(s)
}
