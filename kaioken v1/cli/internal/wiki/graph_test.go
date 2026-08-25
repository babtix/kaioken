package wiki

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// seedGraphRepo writes a small generated wiki plus one real source file into a
// temp repo, covering every edge kind BuildGraph knows how to recover.
func seedGraphRepo(t *testing.T) string {
	t.Helper()
	repo := t.TempDir()
	write := func(rel, body string) {
		t.Helper()
		p := wikiPathFor(repo, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	// A real source file, so one provenance target exists on disk.
	src := filepath.Join(repo, "internal", "core", "engine.go")
	if err := os.MkdirAll(filepath.Dir(src), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(src, []byte("package core\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Architecture has a lead doc and one sibling; the sibling links back to
	// the lead, out to another chapter, to a missing page, and out of the root.
	write("Architecture/Architecture.md",
		stampProvenance("# Architecture\n\nOverview prose.\n", []string{"internal/core/engine.go"}))
	write("Architecture/Data Flow.md",
		"# Data Flow\n\nSee [Architecture](Architecture.md) and "+
			"[Storage](../Storage/Notes.md).\n\n"+
			"A dead link: [Ghost](Ghost.md). An escape: [Out](../../secret.md).\n\n"+
			"```mermaid\ngraph TD; cmd[cli/cmd/main.go]-->core\n```\n\n"+
			"A fenced link stays put:\n\n```\n[Not a link](Nope.md)\n```\n"+
			stampProvenance("", []string{"internal/core/engine.go", "internal/core/gone.go"}))

	// Storage has no lead doc (no Storage/Storage.md) — synthetic section hub.
	write("Storage/Notes.md", "# Notes\n\nsqlite lives here.\n")

	write("README.md", "# Repository Wiki\n")
	return repo
}

// wikiPathFor joins a wiki-relative path under WikiDir, keeping the seeder
// readable.
func wikiPathFor(repo, rel string) string {
	return filepath.Join(WikiDir(repo), filepath.FromSlash(rel))
}

func nodeByID(g *Graph, id string) *GraphNode {
	for i := range g.Nodes {
		if g.Nodes[i].ID == id {
			return &g.Nodes[i]
		}
	}
	return nil
}

func hasEdge(g *Graph, source, target, kind string) bool {
	for _, e := range g.Edges {
		if e.Source == source && e.Target == target && e.Kind == kind {
			return true
		}
	}
	return false
}

func TestBuildGraphNodesAndStats(t *testing.T) {
	g, err := BuildGraph(seedGraphRepo(t))
	if err != nil {
		t.Fatal(err)
	}

	if g.Stats.Docs != 4 {
		t.Errorf("Stats.Docs = %d, want 4", g.Stats.Docs)
	}
	if g.Stats.Files != 2 {
		t.Errorf("Stats.Files = %d, want 2 (one live, one deleted)", g.Stats.Files)
	}
	if g.Stats.Sections != 1 {
		t.Errorf("Stats.Sections = %d, want 1 (Storage has no lead doc)", g.Stats.Sections)
	}
	if g.Stats.Edges != len(g.Edges) {
		t.Errorf("Stats.Edges = %d, but len(Edges) = %d", g.Stats.Edges, len(g.Edges))
	}

	lead := nodeByID(g, "doc:Architecture/Architecture.md")
	if lead == nil || !lead.IsSectionDoc || lead.Section != "Architecture" {
		t.Errorf("lead doc node wrong: %+v", lead)
	}
	if n := nodeByID(g, "doc:README.md"); n == nil || n.Section != "" {
		t.Errorf("root README should be a doc node with no section: %+v", n)
	}
}

func TestBuildGraphContainsEdges(t *testing.T) {
	g, err := BuildGraph(seedGraphRepo(t))
	if err != nil {
		t.Fatal(err)
	}

	// The lead doc is the hub for its siblings.
	if !hasEdge(g, "doc:Architecture/Architecture.md", "doc:Architecture/Data Flow.md", EdgeContains) {
		t.Error("lead doc should contain its sibling")
	}
	// Storage has no lead doc: a synthetic section node stands in.
	if nodeByID(g, "section:Storage") == nil {
		t.Error("expected a synthetic section node for Storage")
	}
	if !hasEdge(g, "section:Storage", "doc:Storage/Notes.md", EdgeContains) {
		t.Error("section node should contain its docs")
	}
}

func TestBuildGraphLinkEdges(t *testing.T) {
	g, err := BuildGraph(seedGraphRepo(t))
	if err != nil {
		t.Fatal(err)
	}

	if !hasEdge(g, "doc:Architecture/Data Flow.md", "doc:Architecture/Architecture.md", EdgeLinks) {
		t.Error("same-directory link should produce an edge")
	}
	if !hasEdge(g, "doc:Architecture/Data Flow.md", "doc:Storage/Notes.md", EdgeLinks) {
		t.Error("../ link into a sibling chapter should produce an edge")
	}
	// A link to a page that does not exist draws nothing.
	for _, e := range g.Edges {
		if e.Kind == EdgeLinks && e.Target == "doc:Architecture/Ghost.md" {
			t.Error("link to a non-existent page produced an edge")
		}
	}
	// A "../" walking off the wiki root draws nothing.
	for _, e := range g.Edges {
		if e.Kind == EdgeLinks && e.Target == "doc:secret.md" {
			t.Error("link escaping the wiki root produced an edge")
		}
	}
	// Bracketed mermaid node syntax inside fences is not a link.
	for _, n := range g.Nodes {
		if n.Kind == NodeDoc && n.Rel == "cli/cmd/main.go" {
			t.Error("mermaid node syntax was mistaken for a link")
		}
	}
}

func TestBuildGraphSourceEdges(t *testing.T) {
	g, err := BuildGraph(seedGraphRepo(t))
	if err != nil {
		t.Fatal(err)
	}

	if !hasEdge(g, "doc:Architecture/Architecture.md", "file:internal/core/engine.go", EdgeSource) {
		t.Error("provenance should produce a source edge")
	}
	live := nodeByID(g, "file:internal/core/engine.go")
	if live == nil || live.Missing {
		t.Errorf("existing file should not be marked missing: %+v", live)
	}
	if live != nil && live.Lang != "go" {
		t.Errorf("file node Lang = %q, want go", live.Lang)
	}
	gone := nodeByID(g, "file:internal/core/gone.go")
	if gone == nil || !gone.Missing {
		t.Errorf("deleted file should be marked missing: %+v", gone)
	}
	// Two docs citing the same file share one node.
	count := 0
	for _, n := range g.Nodes {
		if n.ID == "file:internal/core/engine.go" {
			count++
		}
	}
	if count != 1 {
		t.Errorf("shared file cited twice appears %d times, want 1", count)
	}
}

// A repository with no generated wiki yields an empty graph, not an error —
// the UIs render an empty state from it.
func TestBuildGraphNoWiki(t *testing.T) {
	g, err := BuildGraph(t.TempDir())
	if err != nil {
		t.Fatalf("no-wiki repo should not error: %v", err)
	}
	if len(g.Nodes) != 0 || len(g.Edges) != 0 {
		t.Errorf("expected an empty graph, got %d nodes / %d edges", len(g.Nodes), len(g.Edges))
	}
	if g.Nodes == nil || g.Edges == nil {
		t.Error("Nodes and Edges must be non-nil so JSON encodes [] not null")
	}
}

// Both transports serve this payload for the same repo, so ordering must be
// total: two builds of the same tree are deep-equal.
func TestBuildGraphDeterministic(t *testing.T) {
	repo := seedGraphRepo(t)
	a, err := BuildGraph(repo)
	if err != nil {
		t.Fatal(err)
	}
	b, err := BuildGraph(repo)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(a, b) {
		t.Error("BuildGraph is not deterministic for the same tree")
	}
}

func TestResolveWikiRef(t *testing.T) {
	cases := []struct {
		href, from, want string
	}{
		{"Architecture.md", "Architecture/Data Flow.md", "Architecture/Architecture.md"},
		{"../Storage/Notes.md", "Architecture/Data Flow.md", "Storage/Notes.md"},
		{"./Data%20Flow.md", "Architecture/Architecture.md", "Architecture/Data Flow.md"},
		{"Doc.md#section", "A/A.md", "A/Doc.md"},
		{"../../out.md", "Architecture/Data Flow.md", ""}, // escapes the root
		{"#anchor", "A/A.md", ""},
		{"https://example.com/x.md", "A/A.md", ""},
		{"/absolute.md", "A/A.md", ""},
		{"image.png", "A/A.md", ""},
	}
	for _, c := range cases {
		if got := resolveWikiRef(c.href, c.from); got != c.want {
			t.Errorf("resolveWikiRef(%q, %q) = %q, want %q", c.href, c.from, got, c.want)
		}
	}
}
