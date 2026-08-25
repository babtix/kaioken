//go:build windows

package termpty

import (
	"strings"
	"testing"
	"time"

	"github.com/UserExistsError/conpty"
)

func skipIfUnsupported(t *testing.T) {
	t.Helper()
	if !conpty.IsConPtyAvailable() {
		t.Skip("ConPTY not available on this Windows build")
	}
}

// readUntil drains p in a background goroutine (Read blocks, and PTY exposes
// no deadline) until marker appears or timeout elapses. On timeout the
// goroutine is abandoned rather than joined — the test's own Close() call
// unblocks its Read shortly after, so it does not leak past the test.
func readUntil(t *testing.T, p PTY, marker string, timeout time.Duration) string {
	t.Helper()
	return readUntilN(t, p, marker, 1, timeout)
}

// readUntilN is readUntil, but waits for marker to appear at least want times.
// Waiting for a single occurrence is not enough when the caller needs both the
// shell's keystroke echo and the command's own output: the echo alone satisfies
// a count of one, so the read stops early and the second occurrence is only
// ever seen when it happens to land in the same chunk.
func readUntilN(t *testing.T, p PTY, marker string, want int, timeout time.Duration) string {
	t.Helper()
	type chunk struct {
		b   []byte
		err error
	}
	ch := make(chan chunk, 64)
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := p.Read(buf)
			if n > 0 {
				cp := make([]byte, n)
				copy(cp, buf[:n])
				ch <- chunk{b: cp}
			}
			if err != nil {
				ch <- chunk{err: err}
				return
			}
		}
	}()

	var sb strings.Builder
	deadline := time.After(timeout)
	for {
		select {
		case c := <-ch:
			if c.err != nil {
				return sb.String()
			}
			sb.Write(c.b)
			if strings.Count(sb.String(), marker) >= want {
				return sb.String()
			}
		case <-deadline:
			return sb.String()
		}
	}
}

func TestStartWritesAreEchoedByTheShell(t *testing.T) {
	skipIfUnsupported(t)
	p, err := Start(StartOptions{Dir: t.TempDir(), Cols: 80, Rows: 24})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer p.Close()

	// PowerShell prints what you type back at you (it is a real terminal, not
	// a pipe), so a marker written to stdin should reappear in the output
	// even before pressing Enter — proving Write actually reaches the shell.
	if _, err := p.Write([]byte("echo kaioken-pty-marker")); err != nil {
		t.Fatalf("Write: %v", err)
	}
	got := readUntil(t, p, "kaioken-pty-marker", 15*time.Second)
	if !strings.Contains(got, "kaioken-pty-marker") {
		t.Fatalf("expected the typed marker to be echoed back, got:\n%s", got)
	}
}

func TestStartRunsACommand(t *testing.T) {
	skipIfUnsupported(t)
	p, err := Start(StartOptions{Dir: t.TempDir(), Cols: 80, Rows: 24})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer p.Close()

	// A bare \r is what a real Enter keypress sends (and what xterm.js's
	// onData emits for it); PSReadLine's line editor does not treat \r\n as
	// Enter, so it never submits the line and the command never runs.
	if _, err := p.Write([]byte("echo kaioken-run-marker\r")); err != nil {
		t.Fatalf("Write: %v", err)
	}
	got := readUntilN(t, p, "kaioken-run-marker", 2, 15*time.Second)
	// The marker must appear at least twice: once as the shell echoes the
	// keystrokes, once as the actual command output.
	if strings.Count(got, "kaioken-run-marker") < 2 {
		t.Fatalf("expected the command to actually run and print its output, got:\n%s", got)
	}
}

func TestResizeDoesNotError(t *testing.T) {
	skipIfUnsupported(t)
	p, err := Start(StartOptions{Dir: t.TempDir(), Cols: 80, Rows: 24})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer p.Close()

	if err := p.Resize(120, 40); err != nil {
		t.Fatalf("Resize: %v", err)
	}
	// Absurd sizes are clamped rather than handed to the OS API verbatim.
	if err := p.Resize(100000, -5); err != nil {
		t.Fatalf("Resize with out-of-range values: %v", err)
	}
}

func TestCloseUnblocksWait(t *testing.T) {
	skipIfUnsupported(t)
	p, err := Start(StartOptions{Dir: t.TempDir(), Cols: 80, Rows: 24})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}

	done := make(chan int, 1)
	go func() { done <- p.Wait() }()

	if err := p.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	select {
	case <-done:
	case <-time.After(15 * time.Second):
		t.Fatal("Wait did not return within 15s of Close")
	}
}

func TestDefaultShellPicksAResolvableExecutable(t *testing.T) {
	shell := DefaultShell()
	if shell != "pwsh.exe" && shell != "powershell.exe" {
		t.Errorf("DefaultShell() = %q, want pwsh.exe or powershell.exe", shell)
	}
}
