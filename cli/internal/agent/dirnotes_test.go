package agent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

// A monorepo's per-package rules never reached the model: only the root
// AGENTS.md is in the system prompt. Now they arrive with the file they govern.
func TestDirNotesDeliveredWithRead(t *testing.T) {
	a := newAgent(t, true)
	a.Notes = NewDirNotes()
	writeFile(t, filepath.Join(a.Root, "AGENTS.md"), "root rule")
	writeFile(t, filepath.Join(a.Root, "api", "AGENTS.md"), "do not hand-edit generated code")
	writeFile(t, filepath.Join(a.Root, "api", "gen", "client.go"), "package gen\n")

	got := a.readFile("api/gen/client.go", 0, 0)
	if !strings.Contains(got, "do not hand-edit generated code") {
		t.Errorf("nested instructions missing: %q", got)
	}
	if !strings.Contains(got, "<system-reminder>") {
		t.Errorf("instructions not marked as a reminder: %q", got)
	}
	// The root file is already in the system prompt every turn.
	if strings.Contains(got, "root rule") {
		t.Errorf("root AGENTS.md was repeated into the read: %q", got)
	}

	// Delivered once, not on every read in the package.
	writeFile(t, filepath.Join(a.Root, "api", "gen", "other.go"), "package gen\n")
	if again := a.readFile("api/gen/other.go", 0, 0); strings.Contains(again, "do not hand-edit") {
		t.Errorf("instructions repeated on a second read: %q", again)
	}
}

// General before specific, matching how the system prompt is ordered.
func TestDirNotesOutermostFirst(t *testing.T) {
	a := newAgent(t, true)
	a.Notes = NewDirNotes()
	writeFile(t, filepath.Join(a.Root, "api", "AGENTS.md"), "OUTER")
	writeFile(t, filepath.Join(a.Root, "api", "gen", "AGENTS.md"), "INNER")
	writeFile(t, filepath.Join(a.Root, "api", "gen", "x.go"), "package gen\n")

	got := a.readFile("api/gen/x.go", 0, 0)
	outer, inner := strings.Index(got, "OUTER"), strings.Index(got, "INNER")
	if outer < 0 || inner < 0 {
		t.Fatalf("both levels should be delivered: %q", got)
	}
	if outer > inner {
		t.Errorf("outer instructions should come first: %q", got)
	}
}

func TestDirNotesEdgeCases(t *testing.T) {
	a := newAgent(t, true)
	a.Notes = NewDirNotes()

	// Reading the instruction file itself must not append itself.
	writeFile(t, filepath.Join(a.Root, "pkg", "AGENTS.md"), "the rule")
	got := a.readFile("pkg/AGENTS.md", 0, 0)
	if strings.Contains(got, "<system-reminder>") {
		t.Errorf("an instruction file instructed about itself: %q", got)
	}

	// A file with no nested instructions above it gets nothing appended.
	writeFile(t, filepath.Join(a.Root, "plain", "y.go"), "package plain\n")
	if got := a.readFile("plain/y.go", 0, 0); strings.Contains(got, "<system-reminder>") {
		t.Errorf("unexpected reminder: %q", got)
	}

	// A nil tracker (sub-agents, tests) delivers nothing and must not panic.
	b := newAgent(t, true)
	writeFile(t, filepath.Join(b.Root, "s", "AGENTS.md"), "rule")
	writeFile(t, filepath.Join(b.Root, "s", "z.go"), "package s\n")
	if got := b.readFile("s/z.go", 0, 0); strings.Contains(got, "rule") {
		t.Errorf("nil DirNotes delivered instructions: %q", got)
	}
}
