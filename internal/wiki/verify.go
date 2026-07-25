package wiki

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"kaioken/internal/codemap"
	"kaioken/internal/scan"
)

// The doc prompt asks the model not to invent files, symbols or excerpts. That
// is a request, and requests are not guarantees. This pass checks the claims a
// document actually makes against the code index, so a hallucinated API is
// caught rather than shipped — documentation that is confidently wrong is worse
// than documentation that is missing.

// Claim kinds reported by verification.
const (
	claimFile    = "file"
	claimSymbol  = "symbol"
	claimAnchor  = "anchor"
	claimExcerpt = "excerpt"
)

// Problem is one unverifiable claim.
type Problem struct {
	Kind   string // file, symbol, anchor, excerpt
	Claim  string // what the document asserted
	Detail string // why it did not check out
}

func (p Problem) String() string { return p.Kind + " " + p.Claim + ": " + p.Detail }

// Report is the outcome of verifying one document.
type Report struct {
	FilesChecked   int
	SymbolsChecked int
	AnchorsChecked int
	Problems       []Problem
}

// Clean reports whether every claim checked out.
func (r Report) Clean() bool { return len(r.Problems) == 0 }

// Summary is a one-line status for progress output.
func (r Report) Summary() string {
	checked := r.FilesChecked + r.SymbolsChecked + r.AnchorsChecked
	if r.Clean() {
		return fmt.Sprintf("grounding OK (%d claims verified)", checked)
	}
	byKind := map[string]int{}
	for _, p := range r.Problems {
		byKind[p.Kind]++
	}
	var parts []string
	for _, k := range []string{claimFile, claimSymbol, claimAnchor, claimExcerpt} {
		if byKind[k] > 0 {
			parts = append(parts, fmt.Sprintf("%d %s", byKind[k], k))
		}
	}
	return fmt.Sprintf("grounding: %d unverified of %d claims (%s)",
		len(r.Problems), checked, strings.Join(parts, ", "))
}

// Detail renders the problems for a correction prompt.
func (r Report) Detail(limit int) string {
	var b strings.Builder
	for i, p := range r.Problems {
		if i >= limit {
			fmt.Fprintf(&b, "- … and %d more\n", len(r.Problems)-limit)
			break
		}
		b.WriteString("- " + p.String() + "\n")
	}
	return b.String()
}

var (
	// Backticked spans: file paths, identifiers, anchors.
	reCode = regexp.MustCompile("`([^`\n]{2,160})`")
	// A path looks like a/b.ext, optionally with :12 or :12-34.
	rePathish = regexp.MustCompile(`^([\w./\-]+\.[A-Za-z]\w{0,9})(?::(\d+)(?:-(\d+))?)?$`)
	// An identifier worth checking: CamelCase or snake_case, optionally with ().
	reIdent = regexp.MustCompile(`^([A-Za-z_]\w*)(?:\(\))?$`)
	// A fenced code block, with its language tag.
	reFence = regexp.MustCompile("(?s)```([a-zA-Z]*)\\n(.*?)```")
)

// verify checks a document's claims against the code index. scopeFiles are the
// files the document was generated from; a path outside that scope but present
// in the repo is fine (chapters legitimately reference neighbours), but a path
// present nowhere is not.
func verify(doc string, idx *codemap.Index, scopeFiles []scan.File) Report {
	var rep Report
	if idx == nil {
		return rep
	}
	body := stripFences(doc)

	seenPath := map[string]bool{}
	seenIdent := map[string]bool{}

	for _, m := range reCode.FindAllStringSubmatch(body, -1) {
		claim := strings.TrimSpace(m[1])

		if pm := rePathish.FindStringSubmatch(claim); pm != nil {
			path := strings.TrimPrefix(pm[1], "./")
			if seenPath[claim] {
				continue
			}
			seenPath[claim] = true

			if !idx.HasFile(path) {
				// Only flag paths that look like they belong to this repo; a
				// chapter may legitimately name a third-party or output file.
				if looksInternal(path, idx) {
					rep.Problems = append(rep.Problems, Problem{
						Kind: claimFile, Claim: path,
						Detail: "no such file in the repository",
					})
				}
				rep.FilesChecked++
				continue
			}
			rep.FilesChecked++

			// A line anchor must be inside the file.
			if pm[2] != "" {
				rep.AnchorsChecked++
				start, _ := strconv.Atoi(pm[2])
				end := start
				if pm[3] != "" {
					end, _ = strconv.Atoi(pm[3])
				}
				lines := idx.Files[path].Lines
				switch {
				case start < 1 || end < start:
					rep.Problems = append(rep.Problems, Problem{
						Kind: claimAnchor, Claim: claim, Detail: "malformed line range",
					})
				case lines > 0 && start > lines:
					rep.Problems = append(rep.Problems, Problem{
						Kind: claimAnchor, Claim: claim,
						Detail: fmt.Sprintf("line %d is past end of file (%d lines)", start, lines),
					})
				}
			}
			continue
		}

		if im := reIdent.FindStringSubmatch(claim); im != nil {
			name := im[1]
			if seenIdent[name] || !worthChecking(name) {
				continue
			}
			seenIdent[name] = true
			rep.SymbolsChecked++
			if _, ok := idx.HasSymbol(name); !ok {
				rep.Problems = append(rep.Problems, Problem{
					Kind: claimSymbol, Claim: name,
					Detail: "not declared anywhere in the repository",
				})
			}
		}
	}

	rep.Problems = append(rep.Problems, verifyExcerpts(doc, idx)...)
	sort.SliceStable(rep.Problems, func(i, j int) bool {
		return rep.Problems[i].Kind < rep.Problems[j].Kind
	})
	return rep
}

// verifyExcerpts checks that a fenced code block preceded by an anchor really
// does appear at those lines. This is what stops plausible-looking but
// fabricated code from shipping as if it were quoted.
func verifyExcerpts(doc string, idx *codemap.Index) []Problem {
	var problems []Problem
	lines := strings.Split(doc, "\n")

	for i, line := range lines {
		m := reCode.FindStringSubmatch(strings.TrimSpace(line))
		if m == nil {
			continue
		}
		pm := rePathish.FindStringSubmatch(strings.TrimSpace(m[1]))
		if pm == nil || pm[2] == "" {
			continue // not an anchor
		}
		// Find the fence that follows within a few lines.
		fenceStart := -1
		for j := i + 1; j < len(lines) && j <= i+4; j++ {
			if strings.HasPrefix(strings.TrimSpace(lines[j]), "```") {
				fenceStart = j
				break
			}
		}
		if fenceStart == -1 {
			continue
		}
		fenceEnd := -1
		for j := fenceStart + 1; j < len(lines); j++ {
			if strings.HasPrefix(strings.TrimSpace(lines[j]), "```") {
				fenceEnd = j
				break
			}
		}
		if fenceEnd == -1 {
			continue
		}

		path := strings.TrimPrefix(pm[1], "./")
		fm, ok := idx.Files[path]
		if !ok {
			continue // already reported as a bad path
		}
		start, _ := strconv.Atoi(pm[2])
		end := start
		if pm[3] != "" {
			end, _ = strconv.Atoi(pm[3])
		}
		raw, err := os.ReadFile(filepath.Join(idx.Root, filepath.FromSlash(fm.Path)))
		if err != nil {
			continue
		}
		srcLines := strings.Split(string(raw), "\n")
		if start < 1 || start > len(srcLines) {
			continue // anchor problem already reported
		}
		if end > len(srcLines) {
			end = len(srcLines)
		}
		region := strings.Join(srcLines[start-1:end], "\n")

		quoted := strings.Join(lines[fenceStart+1:fenceEnd], "\n")
		if !excerptMatches(quoted, region) {
			problems = append(problems, Problem{
				Kind:   claimExcerpt,
				Claim:  fmt.Sprintf("%s:%d-%d", path, start, end),
				Detail: "quoted code does not appear at those lines",
			})
		}
	}
	return problems
}

// excerptMatches reports whether a quoted block is genuinely drawn from the
// source region. Models legitimately elide with "…" and re-indent, so the test
// is that every substantial quoted line appears in the region.
func excerptMatches(quoted, region string) bool {
	norm := func(s string) string { return strings.Join(strings.Fields(s), " ") }
	haystack := norm(region)
	checked, matched := 0, 0
	for _, l := range strings.Split(quoted, "\n") {
		t := norm(l)
		if len(t) < 8 || strings.HasPrefix(t, "//") || strings.HasPrefix(t, "#") ||
			strings.Contains(t, "…") || strings.Contains(t, "...") {
			continue
		}
		checked++
		if strings.Contains(haystack, t) {
			matched++
		}
	}
	if checked == 0 {
		return true // nothing substantial to verify
	}
	// Allow a little slack for reflowed lines, but not wholesale invention.
	return matched*100/checked >= 70
}

// looksInternal reports whether a path plausibly belongs to this repo, so that
// naming a third-party file is not reported as a hallucination.
func looksInternal(path string, idx *codemap.Index) bool {
	if strings.HasPrefix(path, "node_modules/") || strings.HasPrefix(path, "vendor/") {
		return false
	}
	// If some other file shares its top-level directory, it should have existed.
	top := path
	if i := strings.IndexByte(path, '/'); i > 0 {
		top = path[:i]
	} else {
		return true // a bare filename like main.go
	}
	for p := range idx.Files {
		if strings.HasPrefix(p, top+"/") {
			return true
		}
	}
	return false
}

// worthChecking filters identifiers too generic to verify meaningfully.
func worthChecking(name string) bool {
	if len(name) < 4 {
		return false
	}
	switch strings.ToLower(name) {
	case "true", "false", "null", "nil", "none", "string", "int", "bool", "error",
		"float", "list", "dict", "map", "array", "object", "number", "void",
		"self", "this", "type", "func", "class", "const", "return", "import",
		"json", "yaml", "http", "https", "null_", "any", "all", "data", "value",
		"name", "path", "file", "line", "text", "main", "test", "config":
		return false
	}
	// Require some structure: CamelCase, snake_case, or a known-ish shape.
	hasUpper := strings.ToLower(name) != name
	hasUnderscore := strings.Contains(name, "_")
	return hasUpper || hasUnderscore
}

// stripFences removes fenced code blocks, so verification reads the prose
// claims rather than the contents of quoted code.
func stripFences(doc string) string {
	return reFence.ReplaceAllString(doc, "\n")
}
