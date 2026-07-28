// Package termpty spawns a real, interactive shell attached to a pseudo
// terminal — the same mechanism a terminal emulator uses, not a plain pipe.
// That distinction matters: a plain os/exec pipe gives a program no console at
// all, so anything that checks "am I attached to a terminal" (colored output,
// line-editing, progress bars, `less`, an interactive REPL) behaves
// differently or refuses to run. A pseudo terminal makes the shell believe
// it is talking to a real console, because on Windows it is one — ConPTY is
// the same facility Windows Terminal itself is built on.
//
// The platform-specific half lives in termpty_windows.go (ConPTY) and
// termpty_unix.go (a POSIX pty via github.com/creack/pty); this file only
// holds the shape both agree to.
package termpty

// PTY is a live pseudo-terminal process. Read/Write move raw bytes exactly as
// a terminal emulator would: Write carries keystrokes in, Read carries
// rendered output (including the shell's own ANSI escape sequences) out.
type PTY interface {
	Read(p []byte) (int, error)
	Write(p []byte) (int, error)

	// Resize tells the shell its viewport changed size, the way dragging a
	// terminal window's edge does. Programs that lay out around the terminal
	// width (a REPL, a progress bar, `less`) read this back via SIGWINCH or
	// the Windows equivalent.
	Resize(cols, rows int) error

	// Close ends the session: the underlying process is killed and its
	// handles released. Safe to call even if the process has already exited.
	Close() error

	// Wait blocks until the shell process exits and returns its exit code, or
	// -1 if the code could not be determined (e.g. the process was killed).
	Wait() int
}

// StartOptions configures a new session.
type StartOptions struct {
	// Dir is the shell's starting working directory.
	Dir string
	// Cols and Rows are the initial viewport size; non-positive values fall
	// back to a conventional 80×24.
	Cols, Rows int
}

// Size bounds, shared by both platform implementations: a terminal a few
// thousand columns wide is not a real window, it is a client bug, and
// honouring it would ask the shell to allocate screen buffers to match.
const (
	minCols, maxCols = 1, 500
	minRows, maxRows = 1, 300
)

func clampSize(cols, rows int) (int, int) {
	if cols <= 0 {
		cols = 80
	}
	if rows <= 0 {
		rows = 24
	}
	if cols < minCols {
		cols = minCols
	} else if cols > maxCols {
		cols = maxCols
	}
	if rows < minRows {
		rows = minRows
	} else if rows > maxRows {
		rows = maxRows
	}
	return cols, rows
}
