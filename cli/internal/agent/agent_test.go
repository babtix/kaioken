package agent

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
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
	if got := a.readFile("sub/a.txt", 0, 0); !strings.Contains(got, "hello world") {
		t.Fatalf("readFile: %q", got)
	}
	if got := a.editFile("sub/a.txt", []Edit{{Old: "world", New: "gophers"}}); !strings.HasPrefix(got, "edited") {
		t.Fatalf("editFile: %q", got)
	}
	if got := a.readFile("sub/a.txt", 0, 0); !strings.Contains(got, "hello gophers") {
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
	if got := a.readFile("../../etc/passwd", 0, 0); !strings.Contains(got, "outside the repository") {
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
	out := a.runCommand(context.Background(), "echo ainow_ok", "call_test", 0)
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
	if got := a.readFile("r.txt", 0, 0); !strings.Contains(got, "v2") {
		t.Fatalf("setup: %q", got)
	}
	if err := Restore(a.Root, entry); err != nil {
		t.Fatalf("Restore: %v", err)
	}
	if got := a.readFile("r.txt", 0, 0); !strings.Contains(got, "v1") {
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

// read_file used to read the whole file and cut it at 100 KB with no way to
// ask for the rest — a long file was permanently half-visible. offset/limit
// page through it, the way pi's and opencode's read tools do.
func TestReadFileOffsetAndLimit(t *testing.T) {
	a := newAgent(t, true)
	var lines []string
	for i := 1; i <= 50; i++ {
		lines = append(lines, fmt.Sprintf("line %d", i))
	}
	if err := os.WriteFile(filepath.Join(a.Root, "long.txt"),
		[]byte(strings.Join(lines, "\n")), 0o644); err != nil {
		t.Fatal(err)
	}

	got := a.readFile("long.txt", 10, 5)
	if !strings.Contains(got, "line 10") || !strings.Contains(got, "line 14") {
		t.Errorf("window missing its own lines: %q", got)
	}
	if strings.Contains(got, "line 9\n") || strings.Contains(got, "line 15") {
		t.Errorf("window leaked neighbouring lines: %q", got)
	}
	if !strings.Contains(got, "offset=15") {
		t.Errorf("expected a continuation hint naming the next offset: %q", got)
	}

	if got := a.readFile("long.txt", 500, 0); !strings.Contains(got, "past the end") {
		t.Errorf("out-of-range offset should say so, got %q", got)
	}
	// Lines carry their number, right-aligned so the code stays in one column.
	full := a.readFile("long.txt", 0, 0)
	if !strings.Contains(full, " 1: line 1\n") || !strings.Contains(full, "50: line 50") {
		t.Errorf("expected right-aligned line numbers: %q", clipLine(full, 120))
	}
}

// Decoding a PNG as UTF-8 costs thousands of tokens of replacement characters
// and tells the model nothing it can act on.
func TestReadFileRefusesBinary(t *testing.T) {
	a := newAgent(t, true)
	png := append([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}, make([]byte, 64)...)
	if err := os.WriteFile(filepath.Join(a.Root, "img.png"), png, 0o644); err != nil {
		t.Fatal(err)
	}
	if got := a.readFile("img.png", 0, 0); !strings.Contains(got, "binary") {
		t.Errorf("expected a binary-file refusal, got %q", got)
	}
}

// search walked .kaioken, so it matched Kaioken's own session transcripts,
// generated wiki, and spilled tool output — including the conversation that
// asked the question.
func TestSearchSkipsKaiokenOwnOutput(t *testing.T) {
	a := newAgent(t, true)
	own := filepath.Join(a.Root, ".kaioken", "sessions")
	if err := os.MkdirAll(own, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(own, "s.jsonl"), []byte("needle_xyz in a transcript"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(a.Root, "real.go"), []byte("needle_xyz in source"), 0o644); err != nil {
		t.Fatal(err)
	}

	got := a.search("needle_xyz")
	if !strings.Contains(got, "real.go") {
		t.Errorf("search missed the source hit: %q", got)
	}
	if strings.Contains(got, ".kaioken") {
		t.Errorf("search matched Kaioken's own output: %q", got)
	}
}

func TestCommandTimeoutClamping(t *testing.T) {
	if got := commandTimeout(0); got != defaultCommandTimeout {
		t.Errorf("absent timeout = %v, want the default", got)
	}
	if got := commandTimeout(-5); got != defaultCommandTimeout {
		t.Errorf("negative timeout = %v, want the default", got)
	}
	if got := commandTimeout(30); got != 30*time.Second {
		t.Errorf("timeout(30) = %v", got)
	}
	if got := commandTimeout(99_999); got != maxCommandTimeout {
		t.Errorf("oversized timeout = %v, want the ceiling", got)
	}
}

// A command that outruns its timeout must be killed and reported, not left to
// hold the session open forever.
func TestRunCommandTimesOut(t *testing.T) {
	a := newAgent(t, true)
	sleep := "sleep 30"
	if runtime.GOOS == "windows" {
		sleep = "Start-Sleep -Seconds 30"
	}
	start := time.Now()
	got := a.runCommand(context.Background(), sleep, "call_t", 1)
	if elapsed := time.Since(start); elapsed > 20*time.Second {
		t.Fatalf("runCommand took %v — the timeout did not fire", elapsed)
	}
	if !strings.Contains(got, "timed out") {
		t.Errorf("expected a timeout report, got %q", got)
	}
}

// The hang this guards against: the shell spawns a child that inherits the
// output pipe, so killing the shell alone leaves os/exec blocked in Wait —
// the user sees "stopped" while the agent's goroutine is wedged for good.
func TestRunCommandCancelDoesNotHangOnGrandchild(t *testing.T) {
	if testing.Short() {
		t.Skip("spawns a process tree")
	}
	a := newAgent(t, true)
	spawner := "sh -c 'sleep 25' & sleep 25"
	if runtime.GOOS == "windows" {
		spawner = `Start-Process powershell -ArgumentList '-NoProfile','-Command','Start-Sleep 25' -NoNewWindow; Start-Sleep 25`
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan string, 1)
	go func() { done <- a.runCommand(ctx, spawner, "call_h", 0) }()

	time.Sleep(2 * time.Second)
	cancel()
	select {
	case got := <-done:
		if !strings.Contains(got, "interrupted") {
			t.Errorf("expected an interruption report, got %q", got)
		}
	case <-time.After(15 * time.Second):
		t.Fatal("runCommand never returned after cancellation")
	}
}

// Lexical containment only proves where a path is *spelled*. A symlink
// committed into a repository resolves wherever it points, so a repo the user
// merely cloned could hand the agent a private key — which then travels to
// the model provider in the transcript.
func TestSymlinkEscapeIsRefused(t *testing.T) {
	a := newAgent(t, true)
	outside := t.TempDir()
	secret := filepath.Join(outside, "secret.txt")
	if err := os.WriteFile(secret, []byte("private key"), 0o600); err != nil {
		t.Fatal(err)
	}
	// Creating a file symlink needs privilege on Windows; a directory
	// junction does not, and Go resolves both as reparse points. So the
	// directory case runs everywhere and the file case runs where it can.
	if err := os.Symlink(secret, filepath.Join(a.Root, "innocent.txt")); err == nil {
		if got := a.readFile("innocent.txt", 0, 0); !strings.Contains(got, "outside the repository") {
			t.Errorf("read through a symlink was not refused: %q", got)
		}
		if got := a.editFile("innocent.txt", []Edit{{Old: "private", New: "public"}}); !strings.Contains(got, "outside the repository") {
			t.Errorf("edit through a symlink was not refused: %q", got)
		}
	} else if runtime.GOOS != "windows" {
		t.Fatalf("symlink: %v", err)
	}

	if err := linkDir(outside, filepath.Join(a.Root, "linkdir")); err != nil {
		t.Skipf("directory links unavailable: %v", err)
	}
	if got := a.readFile("linkdir/secret.txt", 0, 0); !strings.Contains(got, "outside the repository") {
		t.Errorf("read through a linked directory was not refused: %q", got)
	}
	// A write to a file that does not exist yet still has to be checked
	// against the real location of the directory it would land in.
	if got := a.writeFile("linkdir/new.txt", "x"); !strings.Contains(got, "outside the repository") {
		t.Errorf("write through a linked directory was not refused: %q", got)
	}
	if _, err := os.Stat(filepath.Join(outside, "new.txt")); !os.IsNotExist(err) {
		t.Error("the write landed outside the repository")
	}
	if got := a.editFile("linkdir/secret.txt", []Edit{{Old: "private", New: "public"}}); !strings.Contains(got, "outside the repository") {
		t.Errorf("edit through a linked directory was not refused: %q", got)
	}
}

// linkDir creates a directory link, using a junction on Windows because
// os.Symlink there requires a privilege ordinary accounts do not have.
func linkDir(target, link string) error {
	if runtime.GOOS == "windows" {
		return exec.Command("cmd", "/c", "mklink", "/J", link, target).Run()
	}
	return os.Symlink(target, link)
}

// slowApproveUI changes the file on disk while the approval prompt is up —
// the user fixing a typo in their editor while Kaioken waits for an answer.
type slowApproveUI struct {
	fakeUI
	onPrompt func()
}

func (s slowApproveUI) Approve(ApprovalRequest) bool {
	s.onPrompt()
	return true
}

// The write path reads the file, renders a diff, blocks for the user, and
// only then writes. Anything that changed the file in that gap used to be
// overwritten by content computed from the stale bytes, silently.
func TestWriteAbortsWhenFileChangesDuringApproval(t *testing.T) {
	a := newAgent(t, true)
	target := filepath.Join(a.Root, "race.txt")
	if err := os.WriteFile(target, []byte("original"), 0o644); err != nil {
		t.Fatal(err)
	}
	a.UI = slowApproveUI{onPrompt: func() {
		_ = os.WriteFile(target, []byte("the user's own fix"), 0o644)
	}}

	if got := a.writeFile("race.txt", "agent content"); !strings.Contains(got, "changed while") {
		t.Errorf("expected the stale write to be refused, got %q", got)
	}
	after, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != "the user's own fix" {
		t.Errorf("the user's edit was clobbered: %q", after)
	}
}

func TestEditAbortsWhenFileChangesDuringApproval(t *testing.T) {
	a := newAgent(t, true)
	target := filepath.Join(a.Root, "race.go")
	if err := os.WriteFile(target, []byte("func old() {}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	a.UI = slowApproveUI{onPrompt: func() {
		_ = os.WriteFile(target, []byte("func old() {} // user comment\n"), 0o644)
	}}

	got := a.editFile("race.go", []Edit{{Old: "old", New: "new"}})
	if !strings.Contains(got, "changed while") {
		t.Errorf("expected the stale edit to be refused, got %q", got)
	}
	after, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(after), "user comment") {
		t.Errorf("the user's edit was clobbered: %q", after)
	}
}

// Numbering the read output is only safe if quoting it back is not a silent
// corruption. write_file refuses it outright; the edit matcher strips it.
func TestWriteRefusesLineNumberedContent(t *testing.T) {
	a := newAgent(t, true)
	pasted := "1: package main\n2: \n3: func main() {}\n"
	got := a.writeFile("main.go", pasted)
	if !strings.Contains(got, "line-numbered") {
		t.Errorf("expected a refusal, got %q", got)
	}
	if _, err := os.Stat(filepath.Join(a.Root, "main.go")); !os.IsNotExist(err) {
		t.Error("line-numbered content was written to disk")
	}

	// Content that merely starts with a number and a colon is not a paste.
	if got := a.writeFile("ok.yaml", "404: not found\nkey: value\n"); !strings.HasPrefix(got, "wrote") {
		t.Errorf("legitimate content was refused: %q", got)
	}
}

func TestEditStripsLineNumbersFromOldText(t *testing.T) {
	a := newAgent(t, true)
	if err := os.WriteFile(filepath.Join(a.Root, "n.go"),
		[]byte("func a() {\n\treturn 1\n}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	// The model quotes read_file's output back verbatim, numbers and all.
	got := a.editFile("n.go", []Edit{{Old: "1: func a() {\n2: \treturn 1", New: "func a() {\n\treturn 2"}})
	if !strings.HasPrefix(got, "edited") {
		t.Fatalf("edit with line-numbered old text failed: %q", got)
	}
	after, err := os.ReadFile(filepath.Join(a.Root, "n.go"))
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != "func a() {\n\treturn 2\n}\n" {
		t.Errorf("line numbers leaked into the file: %q", after)
	}
}
