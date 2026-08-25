//go:build windows

package termpty

import (
	"context"
	"os/exec"

	"github.com/UserExistsError/conpty"
)

type windowsPTY struct {
	cpty *conpty.ConPty
}

// Start launches the default shell attached to a Windows ConPTY pseudo
// console — the same API Windows Terminal is built on. conpty.Start takes a
// single command-line string rather than argv (Windows processes always did;
// CreateProcess itself has no argv), which is fine here since the command
// line is exactly the shell's own name with no arguments.
func Start(opts StartOptions) (PTY, error) {
	cols, rows := clampSize(opts.Cols, opts.Rows)
	cpty, err := conpty.Start(
		DefaultShell(),
		conpty.ConPtyDimensions(cols, rows),
		conpty.ConPtyWorkDir(opts.Dir),
	)
	if err != nil {
		return nil, err
	}
	return &windowsPTY{cpty: cpty}, nil
}

func (p *windowsPTY) Read(b []byte) (int, error)  { return p.cpty.Read(b) }
func (p *windowsPTY) Write(b []byte) (int, error) { return p.cpty.Write(b) }
func (p *windowsPTY) Resize(cols, rows int) error {
	cols, rows = clampSize(cols, rows)
	return p.cpty.Resize(cols, rows)
}

// Close tears down the pseudo console, which (per the Windows API) also
// terminates the attached process — there is no separate "kill" step needed.
func (p *windowsPTY) Close() error { return p.cpty.Close() }

func (p *windowsPTY) Wait() int {
	code, err := p.cpty.Wait(context.Background())
	if err != nil {
		return -1
	}
	return int(code)
}

// DefaultShell prefers PowerShell 7 (pwsh.exe) when it is installed, falling
// back to the Windows PowerShell that ships with every Windows install since
// version 7 (a separate download) is not guaranteed to be present.
func DefaultShell() string {
	if _, err := exec.LookPath("pwsh.exe"); err == nil {
		return "pwsh.exe"
	}
	return "powershell.exe"
}
