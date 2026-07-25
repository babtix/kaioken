package wiki

import (
	"os"
	"path/filepath"
	"sync"
	"testing"

	"kaioken/internal/gitx"
)

func TestMatchScope(t *testing.T) {
	scope := []string{"internal/tui", "cmd/kaioken/main.go", "docs/"}
	cases := []struct {
		path string
		want bool
	}{
		{"internal/tui/tui.go", true},
		{"internal/tui/deep/nested/file.go", true},
		{"cmd/kaioken/main.go", true},
		{"docs/guide.md", true},
		{"internal/tuivm/other.go", false}, // prefix must stop at a separator
		{"cmd/kaioken/other.go", false},
		{"README.md", false},
	}
	for _, c := range cases {
		if got := matchScope(scope, c.path); got != c.want {
			t.Errorf("matchScope(%q) = %v, want %v", c.path, got, c.want)
		}
	}
}

// writeDoc creates a wiki document containing body.
func writeDoc(t *testing.T, repo, section, name, body string) string {
	t.Helper()
	dir := filepath.Join(WikiDir(repo), safeName(section))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	p := filepath.Join(dir, safeName(name)+".md")
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestAffectedDocs(t *testing.T) {
	repo := t.TempDir()
	outline := &Outline{Sections: []Section{
		{ID: "tui", Title: "Terminal UI", Goal: "the TUI", Files: []string{"internal/tui"}},
		{ID: "llm", Title: "LLM Client", Goal: "the client", Files: []string{"internal/llm"}},
	}}

	mainTUI := writeDoc(t, repo, "Terminal UI", "Terminal UI", "# Terminal UI\n")
	// A subsection doc that cites a changed file in its Referenced Files list.
	subTUI := writeDoc(t, repo, "Terminal UI", "Command Dispatch",
		"# Command Dispatch\n\n## Referenced Files\n- internal/tui/tui.go\n")
	writeDoc(t, repo, "LLM Client", "LLM Client", "# LLM Client\n")

	changes := []gitx.Change{
		{Status: "M", Path: "internal/tui/tui.go"},
		{Status: "?", Path: "scripts/deploy.sh"}, // claimed by no section
	}

	targets, unassigned := affectedDocs(repo, outline, changes)

	var got []string
	for _, tg := range targets {
		got = append(got, tg.Path)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 affected docs, got %d: %v", len(got), got)
	}
	want := map[string]bool{mainTUI: true, subTUI: true}
	for _, p := range got {
		if !want[p] {
			t.Errorf("unexpected affected doc %s", p)
		}
	}
	// The untouched LLM chapter must not be rewritten.
	for _, p := range got {
		if filepath.Base(p) == "LLM Client.md" {
			t.Error("LLM Client chapter should not be affected by a TUI-only change")
		}
	}
	if len(unassigned) != 1 || unassigned[0] != "scripts/deploy.sh" {
		t.Errorf("unassigned = %v, want [scripts/deploy.sh]", unassigned)
	}
}

func TestFilterChangesDropsOwnOutput(t *testing.T) {
	in := []gitx.Change{
		{Status: "M", Path: "internal/tui/tui.go"},
		{Status: "M", Path: ".kaioken/wiki/Terminal UI/Terminal UI.md"},
		{Status: "M", Path: ".kaioken/wiki_plan.yaml"},
	}
	out := filterChanges(in)
	if len(out) != 1 || out[0].Path != "internal/tui/tui.go" {
		t.Errorf("filterChanges = %v, want only the source file", out)
	}
}

func TestStampRoundTrip(t *testing.T) {
	repo := t.TempDir()
	if s := LoadStamp(repo); s.Commit != "" {
		t.Errorf("missing stamp should load empty, got %+v", s)
	}
	if err := SaveStamp(repo, "some/model", 3, []string{"Broken Section"}); err != nil {
		t.Fatal(err)
	}
	got := LoadStamp(repo)
	if got.Model != "some/model" || got.Multiplier != 3 {
		t.Errorf("stamp round-trip lost data: %+v", got)
	}
	if got.GeneratedAt.IsZero() {
		t.Error("stamp should record a generation time")
	}
	if len(got.Failed) != 1 || got.Failed[0] != "Broken Section" {
		t.Errorf("failed sections lost: %v", got.Failed)
	}

	// A clean run clears the failure list.
	if err := SaveStamp(repo, "some/model", 3, nil); err != nil {
		t.Fatal(err)
	}
	if got := LoadStamp(repo); len(got.Failed) != 0 {
		t.Errorf("a clean run should clear failures, got %v", got.Failed)
	}
}

func TestFailuresCollector(t *testing.T) {
	f := &failures{}
	var wg sync.WaitGroup
	for _, name := range []string{"Zebra", "Alpha", "Middle"} {
		wg.Add(1)
		go func(n string) {
			defer wg.Done()
			f.add(n)
		}(name)
	}
	wg.Wait()

	got := f.sorted()
	if len(got) != 3 {
		t.Fatalf("expected 3 failures, got %v", got)
	}
	if got[0] != "Alpha" || got[2] != "Zebra" {
		t.Errorf("failures should come back sorted, got %v", got)
	}
}

func TestUnfence(t *testing.T) {
	cases := map[string]string{
		"```markdown\n# Title\n\ntext\n```": "# Title\n\ntext\n",
		"```md\n# Title\n```":               "# Title\n",
		"# Plain\n":                         "# Plain\n",
	}
	for in, want := range cases {
		if got := unfence(in); got != want {
			t.Errorf("unfence(%q) = %q, want %q", in, got, want)
		}
	}
}
