package wiki

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidMermaidAcceptsRealDiagrams(t *testing.T) {
	good := []string{
		"graph TD\n  A[Start] --> B[End]",
		"sequenceDiagram\n  Alice->>Bob: hi",
		"erDiagram\n  USER ||--o{ ORDER : places",
		"%% a comment\nflowchart LR\n  A --> B",
		"classDiagram\n  class Engine {\n    +Start()\n  }",
	}
	for _, d := range good {
		if !validMermaid(d) {
			t.Errorf("valid diagram rejected:\n%s", d)
		}
	}
}

func TestValidMermaidRejectsBreakage(t *testing.T) {
	bad := map[string]string{
		"empty":            "   \n  ",
		"unknown type":     "diagramOfThings\n  A --> B",
		"declaration only": "graph TD",
		"unbalanced":       "graph TD\n  A[Start --> B[End]",
		"nested fence":     "graph TD\n```\n  A --> B",
	}
	for name, d := range bad {
		if validMermaid(d) {
			t.Errorf("%s: invalid diagram accepted:\n%s", name, d)
		}
	}
}

// A broken diagram must be demoted, not deleted: the content still says
// something and a silent drop hides the problem.
func TestSanitizeMermaidDemotesBroken(t *testing.T) {
	doc := "# Doc\n\n```mermaid\ngraph TD\n  A[Start --> B\n```\n\nAfter.\n"
	out := sanitizeMermaid(doc)

	if strings.Contains(out, "```mermaid") {
		t.Errorf("broken diagram still tagged as mermaid:\n%s", out)
	}
	if !strings.Contains(out, "A[Start --> B") {
		t.Errorf("diagram content was lost:\n%s", out)
	}
	if !strings.Contains(out, "Diagram omitted") {
		t.Errorf("no explanation for the demotion:\n%s", out)
	}
	if !strings.Contains(out, "After.") {
		t.Error("surrounding document was damaged")
	}
}

func TestSanitizeMermaidKeepsValid(t *testing.T) {
	doc := "# Doc\n\n```mermaid\nsequenceDiagram\n  A->>B: call\n```\n"
	if out := sanitizeMermaid(doc); out != doc {
		t.Errorf("a valid diagram was modified:\n%s", out)
	}
}

func TestLinkChaptersInsertsRelativeLinks(t *testing.T) {
	self := Section{ID: "core", Title: "Core Engine"}
	all := []Section{
		{ID: "core", Title: "Core Engine"},
		{ID: "models", Title: "Data Models"},
	}
	doc := "# Core Engine\n\nThe engine persists through Data Models on every write.\n"

	out, n := linkChapters(doc, self, all)
	if n != 1 {
		t.Fatalf("expected 1 link, got %d:\n%s", n, out)
	}
	if !strings.Contains(out, "[Data Models](../Data Models/Data Models.md)") {
		t.Errorf("link not inserted correctly:\n%s", out)
	}
	// A chapter must never link to itself.
	if strings.Contains(out, "[Core Engine](") {
		t.Errorf("chapter linked to itself:\n%s", out)
	}
}

// Only the first mention becomes a link; the rest stay prose.
func TestLinkChaptersLinksOnce(t *testing.T) {
	self := Section{ID: "a", Title: "Alpha"}
	all := []Section{{ID: "a", Title: "Alpha"}, {ID: "b", Title: "Beta"}}
	doc := "Beta does things.\n\nBeta again here.\n\nAnd Beta once more.\n"

	out, n := linkChapters(doc, self, all)
	if n != 1 {
		t.Errorf("expected exactly 1 link, got %d", n)
	}
	if strings.Count(out, "](../Beta/") != 1 {
		t.Errorf("expected one link total:\n%s", out)
	}
}

// Headings, code blocks and existing links must be left alone.
func TestLinkChaptersSkipsMarkup(t *testing.T) {
	self := Section{ID: "a", Title: "Alpha"}
	all := []Section{{ID: "a", Title: "Alpha"}, {ID: "b", Title: "Beta"}}

	cases := map[string]string{
		"heading":       "## Beta\n",
		"code fence":    "```go\nBeta()\n```\n",
		"existing link": "See [Beta](../Beta/Beta.md) for more.\n",
		"table row":     "| Beta | yes |\n",
		"inline code":   "Call `Beta` directly.\n",
	}
	for name, doc := range cases {
		out, n := linkChapters(doc, self, all)
		if n != 0 {
			t.Errorf("%s: rewrote protected markup (%d links):\n%s", name, n, out)
		}
	}
}

// Word boundaries: "API" must not match inside "APIs" or "rapid".
func TestLinkChaptersRespectsWordBoundaries(t *testing.T) {
	self := Section{ID: "a", Title: "Alpha"}
	all := []Section{{ID: "a", Title: "Alpha"}, {ID: "api", Title: "API"}}
	doc := "The rapid APIs are documented elsewhere.\n"

	if out, n := linkChapters(doc, self, all); n != 0 {
		t.Errorf("matched inside a word (%d links):\n%s", n, out)
	}
	doc = "The API is documented elsewhere.\n"
	if _, n := linkChapters(doc, self, all); n != 1 {
		t.Errorf("standalone mention should link, got %d", n)
	}
}

func TestCrossLinkWritesFiles(t *testing.T) {
	repo := t.TempDir()
	outline := &Outline{Sections: []Section{
		{ID: "core", Title: "Core Engine", Goal: "engine"},
		{ID: "models", Title: "Data Models", Goal: "models"},
	}}
	write := func(sec, name, body string) {
		dir := filepath.Join(WikiDir(repo), safeName(sec))
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, safeName(name)+".md"), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("Core Engine", "Core Engine", "# Core Engine\n\nWrites through Data Models.\n")
	write("Data Models", "Data Models", "# Data Models\n\nUsed by the Core Engine layer.\n")

	n, err := crossLink(repo, outline)
	if err != nil {
		t.Fatal(err)
	}
	if n != 2 {
		t.Errorf("expected 2 cross-links, got %d", n)
	}
	raw, err := os.ReadFile(filepath.Join(WikiDir(repo), "Core Engine", "Core Engine.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "](../Data Models/Data Models.md)") {
		t.Errorf("link not persisted:\n%s", raw)
	}
}

func TestCrossLinkSingleSectionIsNoOp(t *testing.T) {
	outline := &Outline{Sections: []Section{{ID: "a", Title: "Alpha"}}}
	if n, err := crossLink(t.TempDir(), outline); err != nil || n != 0 {
		t.Errorf("crossLink = (%d, %v), want (0, nil)", n, err)
	}
}
