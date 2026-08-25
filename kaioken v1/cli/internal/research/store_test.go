package research

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestStoreRoundTrip(t *testing.T) {
	dir := t.TempDir()
	rep := &Report{
		Question:   "Is solar cheaper than nuclear?",
		Markdown:   "## Short answer\nYes [1].",
		Sources:    []Source{{N: 1, URL: "https://a.example", Title: "A"}},
		Rounds:     2,
		Searched:   6,
		Fetched:    4,
		Incomplete: true,
	}

	saved, err := Save(dir, rep, ".kaioken/research/is-solar-cheaper-than-nuclear.md", Provenance{})
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if saved.Slug != "is-solar-cheaper-than-nuclear" {
		t.Errorf("slug = %q", saved.Slug)
	}
	if saved.CreatedAt.IsZero() {
		t.Error("CreatedAt not set")
	}

	got, err := Load(dir, saved.Slug)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got.Question != rep.Question || got.Markdown != rep.Markdown {
		t.Errorf("loaded report differs: %+v", got)
	}
	if len(got.Sources) != 1 || got.Sources[0].URL != "https://a.example" {
		t.Errorf("sources not preserved: %+v", got.Sources)
	}
	if !got.Incomplete || got.Rounds != 2 || got.Searched != 6 || got.Fetched != 4 {
		t.Errorf("counters not preserved: %+v", got)
	}

	// List strips markdown and finds the entry.
	list := List(dir)
	if len(list) != 1 || list[0].Slug != saved.Slug {
		t.Fatalf("List = %+v", list)
	}
	if list[0].Markdown != "" {
		t.Error("List should strip markdown")
	}

	if err := Delete(dir, saved.Slug); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if got := List(dir); len(got) != 0 {
		t.Errorf("after delete, List = %+v", got)
	}
}

func TestStoreListNewestFirst(t *testing.T) {
	dir := t.TempDir()
	older, err := Save(dir, &Report{Question: "first question"}, "", Provenance{})
	if err != nil {
		t.Fatal(err)
	}
	// Backdate the first entry on disk so ordering does not depend on
	// sub-millisecond clock resolution.
	older.CreatedAt = older.CreatedAt.Add(-time.Hour)
	data, _ := json.Marshal(older)
	if err := os.WriteFile(filepath.Join(dir, older.Slug+".json"), data, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Save(dir, &Report{Question: "second question"}, "", Provenance{}); err != nil {
		t.Fatal(err)
	}

	list := List(dir)
	if len(list) != 2 {
		t.Fatalf("List returned %d entries", len(list))
	}
	if list[0].Question != "second question" {
		t.Errorf("newest first, got %q then %q", list[0].Question, list[1].Question)
	}
}

// TestStoreRejectsHostileSlugs is the same bug class as the daemon's
// safeJoin table: slugs reach Load and Delete straight from an HTTP path
// segment, so anything that is not Slug output must be rejected.
func TestStoreRejectsHostileSlugs(t *testing.T) {
	dir := t.TempDir()
	hostile := []string{
		"",
		"..",
		"../../etc/passwd",
		`..\..\windows`,
		"a/b",
		"C:",
		"report.md",
		"UPPER",
	}
	for _, slug := range hostile {
		if _, err := Load(dir, slug); err == nil {
			t.Errorf("Load(%q) succeeded, want rejection", slug)
		}
		if err := Delete(dir, slug); err == nil {
			t.Errorf("Delete(%q) succeeded, want rejection", slug)
		}
	}
}

func TestSlug(t *testing.T) {
	cases := []struct{ in, want string }{
		{"Is solar cheaper?", "is-solar-cheaper"},
		{"  ", "research"},
		{"Ünïcode & symbols!!", "n-code-symbols"},
	}
	for _, c := range cases {
		if got := Slug(c.in); got != c.want {
			t.Errorf("Slug(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
