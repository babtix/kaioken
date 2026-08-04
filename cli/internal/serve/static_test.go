package serve

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/wiki"
)

// seedStaticWiki lays down a minimal generated-wiki tree: one section directory
// holding two documents, plus a README for the index page.
func seedStaticWiki(t *testing.T) string {
	t.Helper()
	repo := t.TempDir()
	root := wiki.WikiDir(repo)
	sec := filepath.Join(root, "Architecture")
	if err := os.MkdirAll(sec, 0o755); err != nil {
		t.Fatal(err)
	}
	write := func(p, body string) {
		t.Helper()
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write(filepath.Join(root, "README.md"), "# My Repo\n\nOverview text.\n")
	write(filepath.Join(sec, "Architecture.md"), "# Architecture\n\nTop of the chapter.\n")
	write(filepath.Join(sec, "Data Flow.md"), "# Data Flow\n\nHow data moves.\n")
	return repo
}

func TestStaticHref(t *testing.T) {
	cases := map[string]string{
		"Architecture/Data Flow.md": "architecture--data-flow.html",
		"Getting Started.md":        "getting-started.html",
		"Setup/Quick Start.md":      "setup--quick-start.html",
	}
	for in, want := range cases {
		if got := staticHref(in); got != want {
			t.Errorf("staticHref(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestExport(t *testing.T) {
	repo := seedStaticWiki(t)
	out := filepath.Join(repo, "site")

	n, err := Export(repo, out)
	if err != nil {
		t.Fatalf("Export: %v", err)
	}
	// index + the two section docs.
	if n != 3 {
		t.Errorf("Export wrote %d pages, want 3", n)
	}

	index, err := os.ReadFile(filepath.Join(out, "index.html"))
	if err != nil {
		t.Fatalf("index.html missing: %v", err)
	}
	// The chapter card must point at the produced slug, not a server route.
	if !strings.Contains(string(index), `href="architecture--architecture.html"`) {
		t.Errorf("index does not link to the chapter slug:\n%s", index)
	}

	doc, err := os.ReadFile(filepath.Join(out, "architecture--data-flow.html"))
	if err != nil {
		t.Fatalf("data-flow page missing: %v", err)
	}
	if !strings.Contains(string(doc), "How data moves.") {
		t.Errorf("doc body not rendered")
	}

	// No absolute server routes may leak into the static output: the site
	// must work from a plain file share, so /d/ and root links are gone.
	for _, page := range []string{string(index), string(doc)} {
		if strings.Contains(page, `href="/d/`) || strings.Contains(page, `action="/search"`) {
			t.Errorf("static page still contains a server route")
		}
	}
}

func TestExportWithoutWiki(t *testing.T) {
	repo := t.TempDir()
	if _, err := Export(repo, filepath.Join(repo, "site")); err == nil {
		t.Error("expected an error when no wiki has been generated")
	}
}
