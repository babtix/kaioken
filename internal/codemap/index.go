package codemap

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"golang.org/x/sync/errgroup"

	"kaioken/internal/scan"
)

// maxParseBytes skips files too large to be worth skeletonising (minified
// bundles, generated blobs).
const maxParseBytes = 2 << 20

// Index is the codemap for a whole repository.
type Index struct {
	Root  string
	Files map[string]*FileMap // keyed by repo-relative slash path

	// symbols maps a symbol name to every file declaring it, for verification.
	symbols map[string][]string
}

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

const charsPerToken = 4
