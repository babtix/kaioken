package serve

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"kaioken/internal/wiki"
)

// Export renders the whole wiki into outDir as a fully static site: one
// index.html, one .html per document, no server and no runtime required.
// Everything the HTTP server renders goes through the same renderIndex /
// renderDoc cores, so the static site and `kaioken serve` cannot drift.
// Returns the number of pages written.
func Export(repo, outDir string) (int, error) {
	if _, err := os.Stat(wiki.WikiDir(repo)); err != nil {
		return 0, fmt.Errorf("no generated wiki at %s — run the wiki first", wiki.WikiDir(repo))
	}
	s := New(repo)
	s.static = true

	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return 0, err
	}

	pages := 0
	write := func(name string, render func(io.Writer) error) error {
		f, err := os.Create(filepath.Join(outDir, name))
		if err != nil {
			return err
		}
		defer f.Close()
		if err := render(f); err != nil {
			return err
		}
		pages++
		return nil
	}

	if err := write("index.html", s.renderIndex); err != nil {
		return pages, err
	}
	for _, sec := range s.sections() {
		for _, doc := range sec.Docs {
			name := staticHref(doc.Rel)
			if err := write(name, func(w io.Writer) error {
				return s.renderDoc(w, doc.Rel)
			}); err != nil {
				return pages, err
			}
		}
	}
	return pages, nil
}
