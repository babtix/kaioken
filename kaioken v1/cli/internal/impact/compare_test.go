package impact

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/gitx"
)

// seedReport writes a report file the way save() does: markdown with the
// machine-readable footer.
func seedReport(t *testing.T, repo, name, intent, paths string) {
	t.Helper()
	dir := storeDir(repo)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	doc := "# Impact report\n\n**Intent:** " + intent + "\n\n## Files\n\n- something\n"
	if paths != "" {
		doc += "\n<!-- kaioken:files " + paths + " -->\n"
	}
	if err := os.WriteFile(filepath.Join(dir, name), []byte(doc), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestLoadLatestPicksNewest(t *testing.T) {
	repo := t.TempDir()
	seedReport(t, repo, "20260101-100000-old.md", "old change", "a.go")
	seedReport(t, repo, "20260202-100000-new.md", "new change", "b.go,c.go")

	predicted, intent, err := LoadLatest(repo)
	if err != nil {
		t.Fatalf("LoadLatest: %v", err)
	}
	if intent != "new change" {
		t.Errorf("intent = %q, want the newest report's", intent)
	}
	if strings.Join(predicted, ",") != "b.go,c.go" {
		t.Errorf("predicted = %v", predicted)
	}
}

func TestLoadLatestNoReports(t *testing.T) {
	if _, _, err := LoadLatest(t.TempDir()); err == nil {
		t.Error("expected an error when no reports exist")
	}
}

func TestLoadLatestNoFooter(t *testing.T) {
	repo := t.TempDir()
	seedReport(t, repo, "20260101-100000-x.md", "no files predicted", "")
	predicted, intent, err := LoadLatest(repo)
	if err != nil {
		t.Fatalf("LoadLatest: %v", err)
	}
	if intent != "no files predicted" || len(predicted) != 0 {
		t.Errorf("predicted = %v, intent = %q", predicted, intent)
	}
}

func TestCompare(t *testing.T) {
	predicted := []string{"a.go", "pkg/b.go", "c.go"}
	actual := []gitx.Change{
		{Status: "M", Path: "a.go"},
		{Status: "M", Path: "pkg/b.go"},
		{Status: "?", Path: "new-file.go"},
		{Status: "M", Path: ".kaioken/wiki/x.md"}, // generated — never graded
	}

	out := Compare(predicted, actual)
	if strings.Join(out.Hits, ",") != "a.go,pkg/b.go" {
		t.Errorf("Hits = %v", out.Hits)
	}
	if strings.Join(out.Missed, ",") != "c.go" {
		t.Errorf("Missed = %v", out.Missed)
	}
	if strings.Join(out.Unpredicted, ",") != "new-file.go" {
		t.Errorf("Unpredicted = %v (kaioken churn must be excluded)", out.Unpredicted)
	}
	if got := out.Accuracy(); got < 0.66 || got > 0.67 {
		t.Errorf("Accuracy = %f, want ~2/3", got)
	}
}

// Path normalization: ./ prefixes and separators must not break matching.
func TestCompareNormalizesPaths(t *testing.T) {
	out := Compare([]string{"./a.go"}, []gitx.Change{{Status: "M", Path: "a.go"}})
	if len(out.Hits) != 1 {
		t.Errorf("normalized hit missing: %+v", out)
	}
}

func TestRecordAccuracyRoundTrip(t *testing.T) {
	repo := t.TempDir()
	out := Outcome{Hits: []string{"a.go"}, Missed: []string{"b.go"}}
	if err := RecordAccuracy(repo, "test intent", out); err != nil {
		t.Fatalf("RecordAccuracy: %v", err)
	}
	raw, err := os.ReadFile(filepath.Join(storeDir(repo), "accuracy.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	line := string(raw)
	for _, want := range []string{`"intent":"test intent"`, `"accuracy":0.5`, `"hits":["a.go"]`, `"missed":["b.go"]`} {
		if !strings.Contains(line, want) {
			t.Errorf("accuracy line missing %s: %s", want, line)
		}
	}
}
