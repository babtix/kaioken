package impact

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"kaioken/internal/codemap"
	"kaioken/internal/config"
	"kaioken/internal/plan"
	"kaioken/internal/scan"
	"kaioken/internal/skills"
	"kaioken/internal/wiki"
)

// Evidence gathering is the deterministic half of the pipeline: everything
// here is a lookup or a grep, so it is fast, testable and never hallucinates.
// The LLM only interprets what this file has already proven.

const (
	// maxGrepBytes matches codemap's parse cap: minified bundles and blobs
	// are not worth grepping.
	maxGrepBytes = 2 << 20
	// maxRefFiles / maxRefLines bound what the prompt carries per run.
	maxRefFiles = 60
	maxRefLines = 6
	maxLineLen  = 160
)

type symbolHit struct {
	Name string
	// Files declare the symbol; Sigs are "path:line: signature" anchors.
	Files []string
	Sigs  []string
}

type refHit struct {
	Path  string
	Lines []string // "N: matching line", clipped
}

type moduleHit struct {
	ID    string
	Title string
	Scope []string
	Hit   bool // scope contains an affected file
}

type skillHit struct {
	Name        string
	Description string
	Sources     []string
	Path        string // repo-relative SKILL.md
}

// evidence is the full deterministic bundle for one intent.
type evidence struct {
	symbols []symbolHit
	seeds   []string // files declaring a matched symbol
	refs    []refHit // files whose content references a matched symbol
	// affected is seeds + ref paths, deduped, in discovery order.
	affected   []string
	modules    []moduleHit
	hitModules []string
	skills     []skillHit
	docs       []string // repo-relative wiki documents
	tests      []string
	notes      []string
}

// gather runs every deterministic evidence pass. Missing knowledge sources
// (no module plan, no skills, no wiki) degrade to notes, never to errors.
func gather(repo string, res *scan.Result, idx *codemap.Index, intent string) *evidence {
	ev := &evidence{}

	ev.symbols = matchSymbols(idx, intent)
	seen := map[string]bool{}
	for _, s := range ev.symbols {
		for _, f := range s.Files {
			if !seen[f] {
				seen[f] = true
				ev.seeds = append(ev.seeds, f)
			}
		}
	}

	names := make([]string, len(ev.symbols))
	for i, s := range ev.symbols {
		names[i] = s.Name
	}
	ev.refs = findReferences(res, names, seen)

	ev.affected = append(ev.affected, ev.seeds...)
	for _, r := range ev.refs {
		ev.affected = append(ev.affected, r.Path)
	}

	ev.modules, ev.hitModules = matchModules(repo, ev.affected, &ev.notes)
	ev.skills = matchSkills(repo, ev.affected, &ev.notes)
	ev.docs = matchDocs(repo, ev.affected, &ev.notes)
	ev.tests = findTests(res, ev.affected, ev.seeds)
	return ev
}

// identRe splits an intent into identifier-shaped tokens; backticks, quotes
// and punctuation all fall away, so "rename `parseArgs`" yields parseArgs.
var identRe = regexp.MustCompile(`[A-Za-z_][A-Za-z0-9_]*`)

// matchSymbols keeps the intent tokens the symbol index actually declares,
// in order of first appearance. Matching is case-sensitive: symbol names are.
func matchSymbols(idx *codemap.Index, intent string) []symbolHit {
	var out []symbolHit
	seen := map[string]bool{}
	for _, tok := range identRe.FindAllString(intent, -1) {
		if len(tok) < 2 || seen[tok] {
			continue
		}
		seen[tok] = true
		files, ok := idx.HasSymbol(tok)
		if !ok {
			continue
		}
		hit := symbolHit{Name: tok, Files: files}
		for i, f := range files {
			if i >= 8 {
				hit.Sigs = append(hit.Sigs, fmt.Sprintf("… and %d more declarations", len(files)-i))
				break
			}
			if fm, ok := idx.Files[f]; ok {
				if s, ok := fm.Lookup(tok); ok {
					hit.Sigs = append(hit.Sigs, fmt.Sprintf("%s:%d: %s", f, s.Line, s.Signature))
				}
			}
		}
		out = append(out, hit)
	}
	return out
}

// findReferences greps every scanned file for word-boundary uses of the
// matched symbols. Declaring files (seeds) are skipped — they are already in
// the change set — as is Kaioken's own output directory.
func findReferences(res *scan.Result, symbols []string, seeds map[string]bool) []refHit {
	if len(symbols) == 0 {
		return nil
	}
	patterns := make([]*regexp.Regexp, len(symbols))
	for i, s := range symbols {
		patterns[i] = regexp.MustCompile(`\b` + regexp.QuoteMeta(s) + `\b`)
	}

	var out []refHit
	for _, f := range res.Files {
		if len(out) >= maxRefFiles {
			out = append(out, refHit{Path: "…", Lines: []string{"(more referencing files omitted)"}})
			break
		}
		if seeds[f.Path] || f.Size > maxGrepBytes || strings.HasPrefix(f.Path, config.Dir+"/") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(res.Root, filepath.FromSlash(f.Path)))
		if err != nil {
			continue
		}
		var lines []string
		for n, line := range strings.Split(string(raw), "\n") {
			for _, re := range patterns {
				if re.MatchString(line) {
					lines = append(lines, fmt.Sprintf("%d: %s", n+1, clipText(strings.TrimSpace(line), maxLineLen)))
					break
				}
			}
			if len(lines) >= maxRefLines {
				lines = append(lines, "…")
				break
			}
		}
		if len(lines) > 0 {
			out = append(out, refHit{Path: f.Path, Lines: lines})
		}
	}
	return out
}

// matchModules loads the module plan and marks every module whose scope
// contains an affected file. A missing modules.yaml is a note, not an error.
func matchModules(repo string, affected []string, notes *[]string) ([]moduleHit, []string) {
	p, err := plan.Load(repo)
	if err != nil {
		*notes = append(*notes, "no module plan — run /plan for module-level mapping")
		return nil, nil
	}
	var out []moduleHit
	var hit []string
	for _, fm := range p.Flatten() {
		h := moduleHit{ID: fm.ID, Title: fm.Title, Scope: fm.Scope}
		for _, f := range affected {
			if scopeContains(fm.Scope, f) {
				h.Hit = true
				hit = append(hit, fm.ID)
				break
			}
		}
		out = append(out, h)
	}
	return out, hit
}

// scopeContains mirrors the scope semantics used across the knowledge engine:
// an entry is a repo-relative file, or a directory prefix covering everything
// under it.
func scopeContains(scope []string, file string) bool {
	file = strings.Trim(filepath.ToSlash(file), "/")
	for _, s := range scope {
		s = strings.Trim(filepath.ToSlash(strings.TrimSpace(s)), "/")
		if s == "" {
			continue
		}
		if file == s || strings.HasPrefix(file, s+"/") {
			return true
		}
	}
	return false
}

// matchSkills keeps the skills whose recorded sources intersect the affected
// files — the same staleness rule /update applies after a real change.
func matchSkills(repo string, affected []string, notes *[]string) []skillHit {
	all, err := skills.List(repo)
	if err != nil || len(all) == 0 {
		*notes = append(*notes, "no skills yet — run /skills for skill-level mapping")
		return nil
	}
	var out []skillHit
	for _, s := range all {
		if !scopeIntersects(s.Sources, affected) {
			continue
		}
		out = append(out, skillHit{
			Name:        s.Name,
			Description: s.Description,
			Sources:     s.Sources,
			Path:        filepath.ToSlash(filepath.Join(config.Dir, "skills", s.Name, "SKILL.md")),
		})
	}
	return out
}

func scopeIntersects(sources, affected []string) bool {
	for _, f := range affected {
		if scopeContains(sources, f) {
			return true
		}
	}
	return false
}

// matchDocs walks the generated wiki and keeps every document whose
// provenance footer cites an affected file.
func matchDocs(repo string, affected []string, notes *[]string) []string {
	dir := wiki.WikiDir(repo)
	if _, err := os.Stat(dir); err != nil {
		*notes = append(*notes, "no generated wiki — run /wiki for document-level mapping")
		return nil
	}
	var out []string
	_ = filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(strings.ToLower(d.Name()), ".md") {
			return nil
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		cited := wiki.ReadProvenance(string(raw))
		if len(cited) == 0 {
			return nil
		}
		for _, f := range affected {
			if scopeContains(cited, f) {
				rel, rerr := filepath.Rel(repo, path)
				if rerr != nil {
					rel = path
				}
				out = append(out, filepath.ToSlash(rel))
				break
			}
		}
		return nil
	})
	sort.Strings(out)
	return out
}

// findTests collects test files in the predicted change set: affected files
// that are themselves tests, plus tests sharing a directory with a seed file
// (the convention-based sibling _test.go / .spec.ts and friends).
func findTests(res *scan.Result, affected, seeds []string) []string {
	seedDirs := map[string]bool{}
	for _, s := range seeds {
		seedDirs[dirOf(s)] = true
	}
	affectedSet := map[string]bool{}
	for _, f := range affected {
		affectedSet[f] = true
	}

	var out []string
	seen := map[string]bool{}
	for _, f := range res.Files {
		if !isTestPath(f.Path) || seen[f.Path] {
			continue
		}
		if affectedSet[f.Path] || seedDirs[dirOf(f.Path)] {
			seen[f.Path] = true
			out = append(out, f.Path)
		}
	}
	sort.Strings(out)
	return out
}

// isTestPath is the convention detector: suffix patterns first, then the
// well-known test directories anywhere in the path.
func isTestPath(p string) bool {
	base := strings.ToLower(baseName(p))
	if strings.HasSuffix(base, "_test.go") || strings.HasSuffix(base, "_test.py") {
		return true
	}
	if strings.Contains(base, ".test.") || strings.Contains(base, ".spec.") ||
		strings.HasPrefix(base, "test_") {
		return true
	}
	for _, seg := range strings.Split(strings.ToLower(p), "/") {
		switch seg {
		case "test", "tests", "__tests__", "testdata", "spec":
			return true
		}
	}
	return false
}

func dirOf(p string) string {
	if i := strings.LastIndex(p, "/"); i >= 0 {
		return p[:i]
	}
	return ""
}
