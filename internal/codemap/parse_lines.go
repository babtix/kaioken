package codemap

import (
	"regexp"
	"strings"
)

// Languages without a Go-native parser get a line-based one. It is deliberately
// conservative: it recognises the declaration forms that actually matter for a
// skeleton (functions, classes, types) and skips anything ambiguous, because a
// wrong symbol is worse than a missing one — grounding verification trusts this
// index.

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
