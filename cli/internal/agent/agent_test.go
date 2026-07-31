package agent

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type fakeUI struct{ approve bool }

func (f fakeUI) AssistantDelta(string)           {}
func (f fakeUI) Assistant(string)                {}
func (f fakeUI) Tool(string, string)             {}
func (f fakeUI) ToolResult(string, string, bool) {}
func (f fakeUI) Info(string)                     {}
func (f fakeUI) Approve(ApprovalRequest) bool    { return f.approve }
func (f fakeUI) RecordUndo(UndoEntry)            {}

func newAgent(t *testing.T, approve bool) *Agent {
	t.Helper()
	dir := t.TempDir()
	return &Agent{Root: dir, UI: fakeUI{approve}, AllowRun: true}
}

func TestWriteReadEdit(t *testing.T) {
	a := newAgent(t, true)

	if got := a.writeFile("sub/a.txt", "hello world"); !strings.HasPrefix(got, "wrote") {
		t.Fatalf("writeFile: %q", got)
	}
	if got := a.readFile("sub/a.txt"); got != "hello world" {
		t.Fatalf("readFile: %q", got)
	}
	if got := a.editFile("sub/a.txt", []Edit{{Old: "world", New: "gophers"}}); !strings.HasPrefix(got, "edited") {
		t.Fatalf("editFile: %q", got)
	}
	if got := a.readFile("sub/a.txt"); got != "hello gophers" {
		t.Fatalf("after edit: %q", got)
	}
}

func TestEditRejectsAmbiguous(t *testing.T) {
	a := newAgent(t, true)
	a.writeFile("b.txt", "x x x")
	if got := a.editFile("b.txt", []Edit{{Old: "x", New: "y"}}); !strings.Contains(got, "3 occurrences") {
		t.Fatalf("expected ambiguity error, got %q", got)
	}
}

func TestDeclinedWriteDoesNotTouchDisk(t *testing.T) {
	a := newAgent(t, false) // user declines
	if got := a.writeFile("c.txt", "nope"); !strings.HasPrefix(got, "user declined") {
		t.Fatalf("expected decline, got %q", got)
	}
	if _, err := os.Stat(filepath.Join(a.Root, "c.txt")); !os.IsNotExist(err) {
		t.Fatal("file was written despite decline")
	}
}

func TestPathConfinement(t *testing.T) {
	a := newAgent(t, true)
	if got := a.writeFile("../escape.txt", "x"); !strings.Contains(got, "outside the repository") {
		t.Fatalf("expected confinement error, got %q", got)
	}
	if got := a.readFile("../../etc/passwd"); !strings.Contains(got, "outside the repository") {
		t.Fatalf("expected confinement error, got %q", got)
	}
}

func TestSearch(t *testing.T) {
	a := newAgent(t, true)
	a.writeFile("x.go", "package main\nfunc Foo() {}\n")
	a.writeFile("y.go", "package main\nfunc Bar() {}\n")
	got := a.search("foo")
	if !strings.Contains(got, "x.go:2") {
		t.Fatalf("search miss: %q", got)
	}
	if strings.Contains(got, "y.go") {
		t.Fatalf("search false positive: %q", got)
	}
}

func TestRunCommand(t *testing.T) {
	a := newAgent(t, true)
	out := a.runCommand(context.Background(), "echo ainow_ok", "call_test")
	if !strings.Contains(out, "ainow_ok") {
		t.Fatalf("run_command: %q", out)
	}
}

func TestRestore(t *testing.T) {
	a := newAgent(t, true)
	a.writeFile("r.txt", "v1")
	// Simulate the undo entry captured before a v1→v2 edit.
	entry := UndoEntry{Path: "r.txt", HadPrevious: true, PreviousContent: "v1"}
	a.writeFile("r.txt", "v2") // overwrite to v2
	if got := a.readFile("r.txt"); got != "v2" {
		t.Fatalf("setup: %q", got)
	}
	if err := Restore(a.Root, entry); err != nil {
		t.Fatalf("Restore: %v", err)
	}
	if got := a.readFile("r.txt"); got != "v1" {
		t.Fatalf("after restore: %q", got)
	}

	// New-file case: restoring should delete it.
	a.writeFile("new.txt", "x")
	if err := Restore(a.Root, UndoEntry{Path: "new.txt", HadPrevious: false}); err != nil {
		t.Fatalf("Restore(new file): %v", err)
	}
	if _, err := os.Stat(filepath.Join(a.Root, "new.txt")); !os.IsNotExist(err) {
		t.Fatal("new.txt should have been removed by Restore")
	}
}

func TestDiffPreview(t *testing.T) {
	d := diffPreview("a\nb\nc\n", "a\nB\nc\n")
	if !strings.Contains(d, "- b") || !strings.Contains(d, "+ B") {
		t.Fatalf("diff: %q", d)
	}
	if !strings.Contains(diffPreview("", "new"), "(new file)") {
		t.Fatal("new-file diff missing marker")
	}
}
