//go:build windows

package agent

// Process-tree control on Windows.
//
// exec.CommandContext kills the process it started and nothing else. A shell
// command is almost never a leaf — `npm run dev` is powershell → npm → node,
// and killing powershell leaves node running with the inherited stdout handle,
// which is what makes cmd.Run() block forever after a cancel. So the shell is
// started in its own process group and torn down through taskkill /T, which
// walks the descendants Windows tracks for us.

import (
	"os/exec"
	"strconv"
	"strings"
	"syscall"

	"golang.org/x/sys/windows"
)

// realPath resolves a path to its true location, following symlinks *and*
// junctions.
//
// filepath.EvalSymlinks is not enough on Windows. Go does not classify a
// junction as a symlink — os.Lstat leaves ModeSymlink clear on one — so
// EvalSymlinks hands a junction back unchanged and a containment check built
// on it passes a directory that actually lives elsewhere. `mklink /J` needs
// no privilege, unlike a real symlink, which makes the junction the easier
// escape of the two to plant. GetFinalPathNameByHandle resolves both, because
// it asks the filesystem where the open handle actually landed.
// GetFinalPathNameByHandle flags. x/sys/windows declares the function but not
// these; both are zero, and naming them keeps the call site readable —
// "normalized path, drive-letter form" rather than a bare 0.
const (
	fileNameNormalized = 0x0
	volumeNameDOS      = 0x0
)

func realPath(abs string) (string, error) {
	p, err := windows.UTF16PtrFromString(abs)
	if err != nil {
		return "", err
	}
	// No access rights requested: this opens the file for metadata only, so it
	// works on files another process holds exclusively. BACKUP_SEMANTICS is
	// what allows a directory handle.
	h, err := windows.CreateFile(p, 0,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE,
		nil, windows.OPEN_EXISTING, windows.FILE_FLAG_BACKUP_SEMANTICS, 0)
	if err != nil {
		return "", err
	}
	defer windows.CloseHandle(h)

	buf := make([]uint16, windows.MAX_PATH)
	for {
		n, err := windows.GetFinalPathNameByHandle(h, &buf[0], uint32(len(buf)), fileNameNormalized|volumeNameDOS)
		if err != nil {
			return "", err
		}
		if n < uint32(len(buf)) {
			return trimExtendedPrefix(windows.UTF16ToString(buf[:n])), nil
		}
		buf = make([]uint16, n)
	}
}

// trimExtendedPrefix turns the \\?\ form GetFinalPathNameByHandle returns back
// into an ordinary path, so it compares equal to what filepath produces.
func trimExtendedPrefix(p string) string {
	if rest, ok := strings.CutPrefix(p, `\\?\UNC\`); ok {
		return `\\` + rest
	}
	return strings.TrimPrefix(p, `\\?\`)
}

// setProcessGroup puts the command in a new process group so a signal or kill
// aimed at it does not reach Kaioken itself.
func setProcessGroup(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP}
}

// killProcessTree terminates the command and every process it spawned.
func killProcessTree(cmd *exec.Cmd) error {
	if cmd.Process == nil {
		return nil
	}
	kill := exec.Command("taskkill", "/T", "/F", "/PID", strconv.Itoa(cmd.Process.Pid))
	kill.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if err := kill.Run(); err != nil {
		// taskkill is absent or refused; the direct child is still better than
		// nothing, and WaitDelay bounds the wait either way.
		return cmd.Process.Kill()
	}
	return nil
}
