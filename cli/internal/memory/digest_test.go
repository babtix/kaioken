package memory

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRenderParseDigestRoundTrip(t *testing.T) {
	d := &Digest{
		SessionID: "20260101-120000-0001",
		Title:     "Add export command",
		Date:      "2026-01-01T12:00:00Z",
		Goal:      "Export the wiki to a static site",
		Files:     []string{"cli/cmd/kaioken/main.go", "cli/internal/export/export.go"},
		Outcome:   "success",
		Gotchas:   []string{"Vite prebuild must run before the export step"},
	}
	raw := renderDigest(d)
	got, err := parseDigest(raw, d.SessionID)
	if err != nil {
		t.Fatal(err)
	}
	if got.SessionID != d.SessionID {
		t.Errorf("SessionID = %q, want %q", got.SessionID, d.SessionID)
	}
	if got.Title != d.Title {
		t.Errorf("Title = %q, want %q", got.Title, d.Title)
	}
	if got.Goal != d.Goal {
		t.Errorf("Goal = %q, want %q", got.Goal, d.Goal)
	}
	if got.Outcome != d.Outcome {
		t.Errorf("Outcome = %q, want %q", got.Outcome, d.Outcome)
	}
	if len(got.Files) != 2 || got.Files[0] != d.Files[0] || got.Files[1] != d.Files[1] {
		t.Errorf("Files = %v, want %v", got.Files, d.Files)
	}
	if len(got.Gotchas) != 1 || got.Gotchas[0] != d.Gotchas[0] {
		t.Errorf("Gotchas = %v, want %v", got.Gotchas, d.Gotchas)
	}
}

func TestRecallScansDigests(t *testing.T) {
	repo := t.TempDir()
	dir := filepath.Join(repo, ".kaioken", "sessions")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	write := func(name, content string) {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("a.digest.md", "```yaml\ntitle: Export wiki\ngoal: export the wiki\noutcome: success\nfiles:\n  - cli/cmd/kaioken/main.go\n```\n")
	write("b.digest.md", "```yaml\ntitle: Fix tests\ngoal: make the tests pass\noutcome: success\nfiles:\n  - cli/internal/x/x_test.go\n```\n")

	got, err := Recall(repo, "export", 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || !strings.Contains(got[0].Title, "Export") {
		t.Errorf("expected only the export digest, got %+v", got)
	}
	// Empty query returns all, newest first.
	all, err := Recall(repo, "", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 {
		t.Errorf("empty query should list all, got %d", len(all))
	}
}

func TestRecallMissingDirIsEmpty(t *testing.T) {
	got, err := Recall(t.TempDir(), "anything", 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Errorf("missing dir should yield nothing, got %+v", got)
	}
}

func TestScoreTermFrequency(t *testing.T) {
	if got := score("export export export wiki", "export"); got < 3 {
		t.Errorf("score should count occurrences, got %d", got)
	}
	if got := score("nothing relevant", "export"); got != 0 {
		t.Errorf("no match should score 0, got %d", got)
	}
}
