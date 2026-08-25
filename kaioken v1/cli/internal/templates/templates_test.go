package templates

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeTemplate(t *testing.T, repo, name, content string) {
	t.Helper()
	dir := Dir(repo)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, name+".md"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestListAndLoad(t *testing.T) {
	repo := t.TempDir()
	if got, err := List(repo); err != nil || got != nil {
		t.Fatalf("empty repo: List = %v, %v", got, err)
	}
	writeTemplate(t, repo, "review", "Review {{file}} for {{args}}")
	writeTemplate(t, repo, "audit", "Audit everything")

	got, err := List(repo)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].Name != "audit" || got[1].Name != "review" {
		t.Fatalf("List = %+v", got)
	}
	if len(got[1].Vars) != 1 || got[1].Vars[0] != "file" {
		t.Errorf("review vars = %v, want [file]", got[1].Vars)
	}
}

func TestLoadRejectsTraversal(t *testing.T) {
	repo := t.TempDir()
	for _, name := range []string{"../evil", `..\evil`, "a/b", ""} {
		if _, err := Load(repo, name); err == nil {
			t.Errorf("Load(%q) should fail", name)
		}
	}
}

func TestExpand(t *testing.T) {
	tpl := Template{Content: "Review {{file}} focusing on {{focus}}. Extra: {{args}}"}

	out, missing := Expand(tpl, "file=main.go focus=errors and edge cases")
	if len(missing) != 0 {
		t.Fatalf("missing = %v", missing)
	}
	want := "Review main.go focusing on errors. Extra: and edge cases"
	if out != want {
		t.Errorf("Expand = %q, want %q", out, want)
	}

	// Unfilled placeholders stay visible and are reported.
	out, missing = Expand(tpl, "file=x.go")
	if len(missing) != 1 || missing[0] != "focus" {
		t.Errorf("missing = %v, want [focus]", missing)
	}
	if got := out; !strings.Contains(got, "{{focus}}") {
		t.Errorf("unfilled placeholder should stay literal: %q", got)
	}

	// {{args}} alone, no named vars.
	tpl2 := Template{Content: "Explain {{args}}"}
	out, missing = Expand(tpl2, "the build system")
	if out != "Explain the build system" || len(missing) != 0 {
		t.Errorf("Expand = %q, %v", out, missing)
	}
}
