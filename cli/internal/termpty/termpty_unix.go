//go:build !windows

package termpty

import (
	"os"
	"os/exec"

	"github.com/creack/pty"
)

type unixPTY struct {
	f   *os.File
	cmd *exec.Cmd
}

// Start launches the default shell attached to a real POSIX pty via
// github.com/creack/pty, giving other platforms the same terminal-quality
// experience ConPTY gives Windows (colors, line-editing, interactive
// programs) rather than a plain pipe with none of that.
func Start(opts StartOptions) (PTY, error) {
	cols, rows := clampSize(opts.Cols, opts.Rows)
	cmd := exec.Command(DefaultShell())
	cmd.Dir = opts.Dir
	// TERM matters more here than the pty's own bytes: without it, curses
	// programs and shell prompts frequently fall back to a dumb-terminal
	// rendering because they cannot look up capabilities for "" or "dumb".
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	f, err := pty.StartWithSize(cmd, &pty.Winsize{Rows: uint16(rows), Cols: uint16(cols)})
	if err != nil {
		return nil, err
	}
	return &unixPTY{f: f, cmd: cmd}, nil
}

func (p *unixPTY) Read(b []byte) (int, error)  { return p.f.Read(b) }
func (p *unixPTY) Write(b []byte) (int, error) { return p.f.Write(b) }
func (p *unixPTY) Resize(cols, rows int) error {
	cols, rows = clampSize(cols, rows)
	return pty.Setsize(p.f, &pty.Winsize{Rows: uint16(rows), Cols: uint16(cols)})
}

// Close kills the shell process and releases the pty file descriptor.
// Closing the fd alone would leave the process running with a dangling
// terminal, so the kill comes first.
func (p *unixPTY) Close() error {
	if p.cmd.Process != nil {
		_ = p.cmd.Process.Kill()
	}
	return p.f.Close()
}

func (p *unixPTY) Wait() int {
	_ = p.cmd.Wait()
	if p.cmd.ProcessState != nil {
		return p.cmd.ProcessState.ExitCode()
	}
	return -1
}

// DefaultShell honours $SHELL, the same source every terminal emulator on
// these platforms uses, falling back to bash when the environment has none.
func DefaultShell() string {
	if sh := os.Getenv("SHELL"); sh != "" {
		return sh
	}
	return "/bin/bash"
}
