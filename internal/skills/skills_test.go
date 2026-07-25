package skills

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestSlug(t *testing.T) {
	cases := map[string]string{
		"Add a TUI Command":     "add-a-tui-command",
		"add_an_api_endpoint":   "add-an-api-endpoint",
		"  Run   the tests  ":   "run-the-tests",
		"database/migrations":   "database-migrations",
		"---weird---":           "weird",
		"":                      "skill",
		"!!!":                   "skill",
		"Already-kebab-case-42": "already-kebab-case-42",
	}
	for in, want := range cases {
		if got := Slug(in); got != want {
			t.Errorf("Slug(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSlugTruncatesCleanly(t *testing.T) {
	got := Slug(strings.Repeat("verylongword ", 20))
	if len(got) > 60 {
		t.Errorf("slug too long (%d): %q", len(got), got)
	}
	if strings.HasSuffix(got, "-") || strings.HasPrefix(got, "-") {
		t.Errorf("slug has dangling dashes: %q", got)
	}
}

func TestRenderParseRoundTrip(t *testing.T) {
	s := &Skill{
		Name:        "add-a-tui-command",
		Description: "How to add a slash command. Use when adding or changing TUI commands.",
		Sources:     []string{"internal/tui/tui.go", "internal/tui/logo.go"},
		GeneratedAt: time.Now().UTC().Truncate(time.Second),
		Model:       "test/model",
		Body:        "# Add a TUI command\n\n## Steps\n1. Edit dispatch.\n",
	}
	rendered := s.Render()

	if !strings.HasPrefix(rendered, "---\n") {
		t.Fatalf("SKILL.md must start with frontmatter:\n%s", rendered)
	}
	got, err := Parse(rendered)
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != s.Name || got.Description != s.Description {
		t.Errorf("identity lost: %+v", got)
	}
	if len(got.Sources) != 2 || got.Sources[0] != "internal/tui/tui.go" {
		t.Errorf("sources lost: %v", got.Sources)
	}
	if strings.TrimSpace(got.Body) != strings.TrimSpace(s.Body) {
		t.Errorf("body changed:\n%q", got.Body)
	}
}

// A hand-written SKILL.md without frontmatter must still load, so a user can
// drop one in beside the generated ones.
func TestParseWithoutFrontmatter(t *testing.T) {
	got, err := Parse("# Hand written\n\nJust prose.\n")
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "" {
		t.Errorf("expected no name, got %q", got.Name)
	}
	if !strings.Contains(got.Body, "Hand written") {
		t.Errorf("body lost: %q", got.Body)
	}
}

func TestSaveLoadList(t *testing.T) {
	repo := t.TempDir()
	for _, name := range []string{"beta-task", "alpha-task"} {
		s := &Skill{Name: name, Description: "does " + name, Body: "# " + name + "\n"}
		if err := s.Save(repo); err != nil {
			t.Fatal(err)
		}
	}
	all, err := List(repo)
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 {
		t.Fatalf("expected 2 skills, got %d", len(all))
	}
	if all[0].Name != "alpha-task" {
		t.Errorf("skills should be sorted by name, got %s first", all[0].Name)
	}

	one, err := Load(repo, "beta-task")
	if err != nil {
		t.Fatal(err)
	}
	if one.Description != "does beta-task" {
		t.Errorf("description lost: %q", one.Description)
	}
}

// A directory with no SKILL.md, or a malformed one, must not hide the rest.
func TestListSkipsBrokenSkills(t *testing.T) {
	repo := t.TempDir()
	good := &Skill{Name: "good", Description: "fine", Body: "# ok\n"}
	if err := good.Save(repo); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(Dir(repo), "empty-dir"), 0o755); err != nil {
		t.Fatal(err)
	}

	all, err := List(repo)
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 1 || all[0].Name != "good" {
		t.Errorf("broken entry hid the valid skill: %+v", all)
	}
}

func TestListMissingDirIsEmpty(t *testing.T) {
	all, err := List(t.TempDir())
	if err != nil {
		t.Errorf("a missing skills dir should not error, got %v", err)
	}
	if len(all) != 0 {
		t.Errorf("expected none, got %d", len(all))
	}
}

// Staleness drives incremental refresh: only skills whose sources the change
// touched should be rebuilt.
func TestStaleMatchesSources(t *testing.T) {
	all := []*Skill{
		{Name: "tui", Sources: []string{"internal/tui/tui.go"}},
		{Name: "llm", Sources: []string{"internal/llm"}}, // a directory prefix
		{Name: "docs", Sources: []string{"README.md"}},
	}

	stale := Stale(all, []string{"internal/tui/tui.go"})
	if len(stale) != 1 || stale[0].Name != "tui" {
		t.Errorf("exact file match failed: %+v", names(stale))
	}

	// A change under a directory source counts.
	stale = Stale(all, []string{"internal/llm/stream.go"})
	if len(stale) != 1 || stale[0].Name != "llm" {
		t.Errorf("directory prefix match failed: %+v", names(stale))
	}

	// Prefix matching must stop at a separator.
	if got := Stale(all, []string{"internal/llmx/other.go"}); len(got) != 0 {
		t.Errorf("prefix leaked past the separator: %+v", names(got))
	}

	// An unrelated change refreshes nothing.
	if got := Stale(all, []string{"cmd/kaioken/main.go"}); len(got) != 0 {
		t.Errorf("unrelated change marked skills stale: %+v", names(got))
	}

	// Several skills can go stale at once.
	if got := Stale(all, []string{"internal/tui/tui.go", "README.md"}); len(got) != 2 {
		t.Errorf("expected 2 stale skills, got %+v", names(got))
	}

	if got := Stale(all, nil); len(got) != 0 {
		t.Errorf("no changes should mean no refresh, got %+v", names(got))
	}
}

func TestWriteIndex(t *testing.T) {
	repo := t.TempDir()
	all := []*Skill{
		{Name: "add-a-command", Description: "Adding CLI commands."},
		{Name: "run-tests", Description: "Running the suite."},
	}
	if err := WriteIndex(repo, all); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(Dir(repo), "README.md"))
	if err != nil {
		t.Fatal(err)
	}
	body := string(raw)
	for _, want := range []string{
		"add-a-command", "Adding CLI commands.",
		"run-tests", "(add-a-command/SKILL.md)",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("index missing %q:\n%s", want, body)
		}
	}
}

func TestWriteIndexEmptyIsNoOp(t *testing.T) {
	repo := t.TempDir()
	if err := WriteIndex(repo, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(Dir(repo), "README.md")); !os.IsNotExist(err) {
		t.Error("an empty skill set should not write an index")
	}
}

func TestUnfence(t *testing.T) {
	cases := map[string]string{
		"```markdown\n# Title\n```": "# Title",
		"```\n# Title\n```":         "# Title",
		"# Plain":                   "# Plain",
	}
	for in, want := range cases {
		if got := unfence(in); got != want {
			t.Errorf("unfence(%q) = %q, want %q", in, got, want)
		}
	}
}

func names(ss []*Skill) []string {
	var out []string
	for _, s := range ss {
		out = append(out, s.Name)
	}
	return out
}
