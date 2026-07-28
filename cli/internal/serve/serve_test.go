package serve

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"kaioken/internal/wiki"
)

// seedWiki writes a small generated wiki into a temp repo.
func seedWiki(t *testing.T) string {
	t.Helper()
	repo := t.TempDir()
	write := func(rel, body string) {
		t.Helper()
		p := filepath.Join(wiki.WikiDir(repo), filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("README.md", "# Repository Wiki\n\nWelcome to the index.\n")
	write("Architecture/Architecture.md",
		"# Architecture\n\nThe system has a **core** and a shell.\n\n"+
			"| part | role |\n| --- | --- |\n| core | logic |\n\n"+
			"```mermaid\ngraph TD; A-->B;\n```\n")
	write("Architecture/Data Flow.md", "# Data Flow\n\nRequests flow inward.\n")
	write("Storage/Storage.md", "# Storage\n\nsqlite lives here.\n")
	return repo
}

func get(t *testing.T, h http.Handler, path string) (int, string) {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	body, _ := io.ReadAll(rec.Result().Body)
	return rec.Code, string(body)
}

func TestIndexRendersReadmeAndNav(t *testing.T) {
	h := New(seedWiki(t)).routes()
	code, body := get(t, h, "/")

	if code != http.StatusOK {
		t.Fatalf("status = %d", code)
	}
	if !strings.Contains(body, "Welcome to the index") {
		t.Error("index should render README.md")
	}
	// Every chapter belongs in the sidebar.
	for _, want := range []string{"Architecture", "Data Flow", "Storage"} {
		if !strings.Contains(body, want) {
			t.Errorf("nav missing %q", want)
		}
	}
}

func TestDocRendersMarkdown(t *testing.T) {
	h := New(seedWiki(t)).routes()
	code, body := get(t, h, "/d/Architecture/Architecture.md")

	if code != http.StatusOK {
		t.Fatalf("status = %d", code)
	}
	if !strings.Contains(body, "<strong>core</strong>") {
		t.Error("markdown emphasis was not rendered")
	}
	if !strings.Contains(body, "<table") {
		t.Error("GFM tables should render as HTML tables")
	}
	if !strings.Contains(body, "language-mermaid") {
		t.Error("mermaid fences should survive for the client-side upgrade")
	}
}

// A document with a space in its name must be reachable.
func TestDocWithSpaceInName(t *testing.T) {
	h := New(seedWiki(t)).routes()
	code, body := get(t, h, "/d/Architecture/Data%20Flow.md")
	if code != http.StatusOK {
		t.Fatalf("status = %d", code)
	}
	if !strings.Contains(body, "Requests flow inward") {
		t.Error("document body missing")
	}
}

// The server must not serve files outside the wiki directory.
func TestPathEscapeRefused(t *testing.T) {
	repo := seedWiki(t)
	secret := filepath.Join(repo, "secret.txt")
	if err := os.WriteFile(secret, []byte("TOPSECRET"), 0o644); err != nil {
		t.Fatal(err)
	}
	h := New(repo).routes()

	for _, path := range []string{
		"/d/../secret.txt",
		"/d/../../secret.txt",
		"/d/Architecture/../../secret.txt",
	} {
		code, body := get(t, h, path)
		if strings.Contains(body, "TOPSECRET") {
			t.Errorf("%s leaked a file outside the wiki", path)
		}
		if code == http.StatusOK && strings.Contains(body, "secret") {
			t.Errorf("%s returned 200 for an out-of-tree file", path)
		}
	}
}

func TestSearchFindsMatches(t *testing.T) {
	h := New(seedWiki(t)).routes()

	code, body := get(t, h, "/search?q=sqlite")
	if code != http.StatusOK {
		t.Fatalf("status = %d", code)
	}
	if !strings.Contains(body, "Storage") {
		t.Error("search should locate the Storage chapter")
	}

	_, body = get(t, h, "/search?q=definitelynotpresent")
	if !strings.Contains(body, "No matches") {
		t.Error("a search with no hits should say so")
	}
}

func TestSearchIsCaseInsensitive(t *testing.T) {
	h := New(seedWiki(t)).routes()
	_, body := get(t, h, "/search?q=SQLITE")
	if !strings.Contains(body, "Storage") {
		t.Error("search should ignore case")
	}
}

func TestUnknownPathIs404(t *testing.T) {
	h := New(seedWiki(t)).routes()
	if code, _ := get(t, h, "/d/Nope/Missing.md"); code != http.StatusNotFound {
		t.Errorf("missing doc status = %d, want 404", code)
	}
	if code, _ := get(t, h, "/nonsense"); code != http.StatusNotFound {
		t.Errorf("unknown path status = %d, want 404", code)
	}
}

// Run must refuse to start when there is no wiki to serve.
func TestRunWithoutWiki(t *testing.T) {
	err := Run(context.Background(), t.TempDir(), "127.0.0.1:0", nil)
	if err == nil || !strings.Contains(err.Error(), "no generated wiki") {
		t.Errorf("expected a helpful error, got %v", err)
	}
}

// Run binds, serves, and shuts down cleanly when the context is cancelled.
func TestRunServesAndShutsDown(t *testing.T) {
	repo := seedWiki(t)
	ctx, cancel := context.WithCancel(context.Background())
	urls := make(chan string, 1)
	done := make(chan error, 1)

	go func() { done <- Run(ctx, repo, "127.0.0.1:0", func(u string) { urls <- u }) }()

	var url string
	select {
	case url = <-urls:
	case <-time.After(5 * time.Second):
		t.Fatal("server never reported its address")
	}

	resp, err := http.Get(url + "/d/Storage/Storage.md")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if !strings.Contains(string(body), "sqlite lives here") {
		t.Error("served document body missing")
	}

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Errorf("shutdown returned %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("server did not shut down on cancel")
	}
}

// ---- new UI: collapsible tree navigation ----

func TestTreeNavMarkup(t *testing.T) {
	h := New(seedWiki(t)).routes()
	_, body := get(t, h, "/")

	for _, want := range []string{
		`<details class="sec-group"`, // collapsible chapter groups
		`class="sec-name"`,
		`class="count"`,
		`id="tree"`,
		`id="nav-search"`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("sidebar tree missing %q", want)
		}
	}
	// Nothing is the current section on the index, so nothing is forced open.
	if n := strings.Count(body, `<details class="sec-group" open>`); n != 0 {
		t.Errorf("index should have no forced-open section, got %d", n)
	}
}

// The section containing the active document is expanded and marked current.
func TestCurrentSectionExpanded(t *testing.T) {
	h := New(seedWiki(t)).routes()
	_, body := get(t, h, "/d/Storage/Storage.md")

	if n := strings.Count(body, `<details class="sec-group" open>`); n != 1 {
		t.Errorf("exactly one section should be open, got %d", n)
	}
	if !strings.Contains(body, `<summary class="current">`) {
		t.Error("active section summary should be marked current")
	}
	if !strings.Contains(body, `class="active"`) {
		t.Error("active doc link should carry the active class")
	}
}

// ---- new UI: breadcrumbs, meta line, prev/next pager ----

func TestBreadcrumbsAndMeta(t *testing.T) {
	h := New(seedWiki(t)).routes()
	_, body := get(t, h, "/d/Architecture/Data%20Flow.md")

	if !strings.Contains(body, `class="crumbs"`) {
		t.Error("doc page should render breadcrumbs")
	}
	if !strings.Contains(body, "Architecture") || !strings.Contains(body, "Data Flow") {
		t.Error("breadcrumbs should name the section and the doc")
	}
	if !strings.Contains(body, "min read") {
		t.Error("doc page should show a reading-time estimate")
	}
}

func TestPrevNextPager(t *testing.T) {
	h := New(seedWiki(t)).routes()

	// Middle doc: has both a previous and a next.
	_, body := get(t, h, "/d/Architecture/Data%20Flow.md")
	if !strings.Contains(body, `class="pager"`) {
		t.Fatal("doc page should render the pager")
	}
	if !strings.Contains(body, "pager-prev") || !strings.Contains(body, "pager-next") {
		t.Error("a middle doc should link both neighbors")
	}
	if !strings.Contains(body, "Storage") {
		t.Error("next link should point at the following doc (Storage)")
	}

	// First doc in reading order: no previous link.
	_, body = get(t, h, "/d/Architecture/Architecture.md")
	if strings.Contains(body, "pager-prev") {
		t.Error("the first doc should have no previous link")
	}
	if !strings.Contains(body, "pager-next") {
		t.Error("the first doc should still have a next link")
	}
}

// ---- new UI: table of contents + heading anchors ----

func TestTOCAndHeadingAnchors(t *testing.T) {
	repo := t.TempDir()
	doc := "# Deep Dive\n\n## Alpha\n\ntext\n\n## Beta\n\n### Gamma\n\ntext\n\n## Beta\n\ndup\n"
	p := filepath.Join(wiki.WikiDir(repo), "Guide", "Deep Dive.md")
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(doc), 0o644); err != nil {
		t.Fatal(err)
	}

	h := New(repo).routes()
	code, body := get(t, h, "/d/Guide/Deep%20Dive.md")
	if code != http.StatusOK {
		t.Fatalf("status = %d", code)
	}

	// Every h2/h3 gets a stable anchor id; duplicates are suffixed.
	for _, id := range []string{`id="alpha"`, `id="beta"`, `id="gamma"`, `id="beta-1"`} {
		if !strings.Contains(body, id) {
			t.Errorf("heading anchor %s missing", id)
		}
	}
	if !strings.Contains(body, `class="toc"`) || !strings.Contains(body, "On this page") {
		t.Error("a structured doc should render the table-of-contents rail")
	}
	if !strings.Contains(body, `class="lvl3"`) {
		t.Error("h3 entries should be marked level 3 in the TOC")
	}
}

// A doc with a single heading has no TOC rail (not enough structure).
func TestNoTOCForFlatDoc(t *testing.T) {
	h := New(seedWiki(t)).routes()
	_, body := get(t, h, "/d/Storage/Storage.md")
	if strings.Contains(body, `class="toc"`) {
		t.Error("a doc without h2/h3 headings should not render a TOC rail")
	}
}

// ---- new UI: index cards + search highlighting ----

func TestIndexCards(t *testing.T) {
	h := New(seedWiki(t)).routes()
	_, body := get(t, h, "/")
	if !strings.Contains(body, `class="cards"`) || !strings.Contains(body, `class="card"`) {
		t.Error("index should render the chapter card grid")
	}
}

func TestSearchHighlightsMatches(t *testing.T) {
	h := New(seedWiki(t)).routes()
	_, body := get(t, h, "/search?q=sqlite")
	if !strings.Contains(body, "<mark>") {
		t.Error("search results should wrap matches in <mark>")
	}
	if !strings.Contains(body, `class="result"`) {
		t.Error("search results should be grouped per document")
	}
}

// ---- graph view ----

func TestGraphJSON(t *testing.T) {
	h := New(seedWiki(t)).routes()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/graph.json", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
	var g wiki.Graph
	if err := json.Unmarshal(rec.Body.Bytes(), &g); err != nil {
		t.Fatalf("payload is not a graph: %v", err)
	}
	if g.Stats.Docs != 4 {
		t.Errorf("Stats.Docs = %d, want 4", g.Stats.Docs)
	}
	if len(g.Edges) == 0 {
		t.Error("seeded wiki should produce contains edges")
	}
}

func TestGraphPage(t *testing.T) {
	h := New(seedWiki(t)).routes()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/graph", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
		t.Errorf("Content-Type = %q, want text/html", ct)
	}
	body := rec.Body.String()
	for _, want := range []string{
		`id="graph-canvas"`, // the canvas the engine mounts
		"KaioGraph",          // the embedded engine bundle
		`id="f-files"`,       // the control strip
		"/graph.json",        // the boot script fetches the payload
	} {
		if !strings.Contains(body, want) {
			t.Errorf("graph page missing %q", want)
		}
	}
}

// The sidebar on regular pages links to the graph view.
func TestSidebarLinksGraph(t *testing.T) {
	h := New(seedWiki(t)).routes()
	_, body := get(t, h, "/")
	if !strings.Contains(body, `href="/graph"`) {
		t.Error("sidebar should link to /graph")
	}
}

// ---- helpers under test ----

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Data Flow":             "data-flow",
		"Chat Agent & Tools":    "chat-agent-tools",
		"  Spaces  Everywhere ": "spaces-everywhere",
		"TUI (Bubble Tea)":      "tui-bubble-tea",
		"already-dashed":        "already-dashed",
		"C++ & Rust":            "c-rust",
	}
	for in, want := range cases {
		if got := slugify(in); got != want {
			t.Errorf("slugify(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestHighlightHTMLEscapesAndMarks(t *testing.T) {
	got := highlightHTML("a <b> SQLITE & more", "sqlite")
	if !strings.Contains(got, "<mark>SQLITE</mark>") {
		t.Errorf("needle should be marked, got %q", got)
	}
	if !strings.Contains(got, "&lt;b&gt;") || !strings.Contains(got, "&amp;") {
		t.Errorf("surrounding HTML must stay escaped, got %q", got)
	}
}
