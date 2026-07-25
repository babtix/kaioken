package codemap

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Bundling strategy
//
// The old approach gave each file an equal byte cap and cut anything longer
// into "first three quarters + last quarter". For a 600-line file that means
// the model saw the imports and the trailing helpers and never the middle —
// then wrote documentation about it anyway.
//
// This version spends the budget in two parts:
//
//	1. STRUCTURE — every file's skeleton. Complete coverage of what exists,
//	   for a few hundred tokens per file regardless of its length.
//	2. SOURCE — full bodies, most relevant first. A file that does not fit
//	   whole contributes complete functions (bounded by the line ranges the
//	   codemap recorded) rather than an arbitrary byte slice.
//
// The result: nothing is invisible, and detail goes where it is asked for.

// defaultSkeletonShare is the fraction of the budget reserved for structure.
const defaultSkeletonShare = 0.3

// BundleOptions controls context assembly.
type BundleOptions struct {
	// Goal is what the document is about; it drives relevance ranking.
	Goal string
	// MaxTokens is the approximate total budget.
	MaxTokens int
	// SkeletonShare is the fraction of the budget reserved for skeletons.
	// Zero means the default.
	SkeletonShare float64
}

// Bundle assembles prompt context for a set of repo-relative paths.
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

// excerptSymbols emits whole declarations from a file, most relevant to goal
// first, within a character budget. Each excerpt carries its line anchor.
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

// rank orders paths by relevance to goal, with manifests and entry points
// pulled forward — they orient everything else.
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

// stopwords are too common in section goals to carry signal.
var stopwords = map[string]bool{
	"the": true, "and": true, "for": true, "this": true, "that": true,
	"with": true, "from": true, "how": true, "what": true, "its": true,
	"explain": true, "describe": true, "document": true, "section": true,
	"must": true, "should": true, "all": true, "each": true, "into": true,
	"are": true, "was": true, "were": true, "will": true, "can": true,
	"repository": true, "project": true, "code": true, "codebase": true,
}

// terms splits a goal into lowercase keywords worth matching.
func terms(goal string) []string {
	var out []string
	for _, w := range strings.FieldsFunc(strings.ToLower(goal), func(r rune) bool {
		return !(r >= 'a' && r <= 'z') && !(r >= '0' && r <= '9')
	}) {
		if len(w) > 2 && !stopwords[w] {
			out = append(out, w)
		}
	}
	return out
}

// scoreText counts how many terms appear in text.
func scoreText(text string, terms []string) int {
	if len(terms) == 0 {
		return 0
	}
	lower := strings.ToLower(text)
	n := 0
	for _, t := range terms {
		if strings.Contains(lower, t) {
			n++
		}
	}
	return n
}

// filePriority orders a bundle: manifests, entry points, then models/routes,
// then everything else, tests last.
func filePriority(path string) int {
	base := strings.ToLower(filepath.Base(path))
	p := strings.ToLower(path)
	switch {
	case base == "package.json" || base == "pyproject.toml" || base == "go.mod" ||
		base == "cargo.toml" || base == "readme.md" || base == "claude.md" ||
		base == "agents.md" || base == "dockerfile":
		return 0
	case base == "main.py" || base == "main.go" || base == "main.tsx" ||
		base == "main.ts" || base == "app.tsx" || base == "app.py" ||
		base == "index.ts" || base == "index.tsx" || base == "__init__.py":
		return 1
	case strings.Contains(p, "model") || strings.Contains(p, "schema") ||
		strings.Contains(p, "entity"):
		return 2
	case strings.Contains(p, "router") || strings.Contains(p, "route") ||
		strings.Contains(p, "controller") || strings.Contains(p, "handler") ||
		strings.Contains(p, "endpoint"):
		return 3
	case strings.Contains(p, "_test.") || strings.Contains(p, "test_") ||
		strings.Contains(p, ".test.") || strings.Contains(p, ".spec."):
		return 9
	default:
		return 5
	}
}
