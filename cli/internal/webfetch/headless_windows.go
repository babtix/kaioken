//go:build windows

package webfetch

import (
	"os/exec"
	"syscall"
)

// setBrowserProcAttr puts the browser in its own process group and keeps its
// console window hidden.
//
// A browser is a process tree, not a process. Putting it in its own group
// means a console signal aimed at kaioken does not also land on Chrome's
// children, which is how a renderer ends up outliving the run that started it
// and keeping a lock on the temp profile.
func setBrowserProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP,
		HideWindow:    true,
	}
}
