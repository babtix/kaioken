//go:build !windows

package agent

// Process-tree control on Unix. See proc_windows.go for why killing the
// direct child is not enough: the shell's descendants hold the same stdout
// pipe, and a surviving grandchild keeps cmd.Run() blocked after a cancel.
// Setpgid puts the shell in its own process group; a negative PID signals the
// whole group.

import (
	"os/exec"
	"path/filepath"
	"syscall"
)

// realPath resolves a path to its true location. Unix has only one kind of
// link, and EvalSymlinks follows it; see proc_windows.go for why the same
// call is not sufficient there.
func realPath(abs string) (string, error) { return filepath.EvalSymlinks(abs) }

// setProcessGroup puts the command in a new process group so a signal or kill
// aimed at it does not reach Kaioken itself.
func setProcessGroup(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

// killProcessTree terminates the command and every process it spawned.
func killProcessTree(cmd *exec.Cmd) error {
	if cmd.Process == nil {
		return nil
	}
	pgid, err := syscall.Getpgid(cmd.Process.Pid)
	if err != nil {
		return cmd.Process.Kill()
	}
	return syscall.Kill(-pgid, syscall.SIGKILL)
}
