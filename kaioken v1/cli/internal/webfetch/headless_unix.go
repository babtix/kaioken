//go:build !windows

package webfetch

import (
	"os/exec"
	"syscall"
)

// setBrowserProcAttr puts the browser in its own process group, so a signal
// sent to kaioken's group does not reach the browser's children directly and
// leave the tree half torn down.
func setBrowserProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}
