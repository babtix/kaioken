package main

import (
	"fmt"
	"path/filepath"

	"kaioken/internal/config"
	"kaioken/internal/serve"
)

// cmdPublish renders the generated wiki as a fully static site — plain HTML
// that any host can serve and anyone can read without Kaioken installed. It
// is the human-sharing half of the knowledge engine: `serve` covers the live
// local case, `export` covers other tools' context files, and this covers
// teammates with nothing but a browser.
func cmdPublish(f flags) error {
	out := f.out
	if out == "" {
		out = filepath.Join(f.repo, config.Dir, "site")
	}
	n, err := serve.Export(f.repo, out)
	if err != nil {
		return err
	}
	fmt.Printf("  ✓ published %d page(s) to %s\n", n, out)
	return nil
}
