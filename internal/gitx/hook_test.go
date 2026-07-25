package gitx

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func readHook(t *testing.T, repo string) string {
	t.Helper()
	path, err := HookPath(repo)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func TestInstallPostCommitFresh(t *testing.T) {
	repo, _ := newRepo(t)
	if PostCommitInstalled(repo) {
		t.Fatal("a fresh repo should have no kaioken hook")
	}

	path, err := InstallPostCommit(repo, "/usr/local/bin/kaioken")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(path, "post-commit") {
		t.Errorf("unexpected hook path %q", path)
	}
	if !PostCommitInstalled(repo) {
		t.Error("hook should report as installed")
	}

	body := readHook(t, repo)
	if !strings.HasPrefix(body, shebang) {
		t.Error("a new hook needs a shebang to be runnable")
	}
	if !strings.Contains(body, "kaioken") || !strings.Contains(body, "update") {
		t.Errorf("hook does not invoke the updater:\n%s", body)
	}
	if !strings.Contains(body, "&") {
		t.Error("the hook should run detached so it does not delay commits")
	}
	// Git runs hooks through sh, so paths must be forward-slashed and quoted
	// in a way sh reads literally.
	if strings.Contains(body, `\\`) {
		t.Errorf("hook contains backslash escapes that sh must reinterpret:\n%s", body)
	}
	if !strings.Contains(body, "'/usr/local/bin/kaioken'") {
		t.Errorf("binary path should be single-quoted:\n%s", body)
	}
	// The repo path must be absolute, not the relative form passed in.
	if strings.Contains(body, `-repo '.'`) {
		t.Errorf("hook recorded a relative repo path:\n%s", body)
	}

	// git only runs executable hooks.
	if runtime.GOOS != "windows" {
		info, err := os.Stat(path)
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm()&0o100 == 0 {
			t.Errorf("hook is not executable: %v", info.Mode())
		}
	}
}

func TestShellQuote(t *testing.T) {
	cases := map[string]string{
		`C:\Program Files\kaioken.exe`: `'C:/Program Files/kaioken.exe'`,
		`/usr/local/bin/kaioken`:       `'/usr/local/bin/kaioken'`,
		`/tmp/it's odd/k`:              `'/tmp/it'\''s odd/k'`,
	}
	for in, want := range cases {
		if got := shellQuote(in); got != want {
			t.Errorf("shellQuote(%q) = %s, want %s", in, got, want)
		}
	}
}

// The installer must never destroy a hook someone else wrote.
func TestInstallPreservesExistingHook(t *testing.T) {
	repo, _ := newRepo(t)
	path, err := HookPath(repo)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	const existing = "#!/bin/sh\necho \"my important hook\"\nmake lint\n"
	if err := os.WriteFile(path, []byte(existing), 0o755); err != nil {
		t.Fatal(err)
	}

	if _, err := InstallPostCommit(repo, "/bin/kaioken"); err != nil {
		t.Fatal(err)
	}
	body := readHook(t, repo)
	if !strings.Contains(body, "my important hook") || !strings.Contains(body, "make lint") {
		t.Errorf("the existing hook was clobbered:\n%s", body)
	}
	if !strings.Contains(body, hookStart) {
		t.Error("kaioken block missing after install")
	}
}

// Installing twice must refresh in place, not stack duplicate blocks.
func TestInstallIsIdempotent(t *testing.T) {
	repo, _ := newRepo(t)
	if _, err := InstallPostCommit(repo, "/old/path/kaioken"); err != nil {
		t.Fatal(err)
	}
	if _, err := InstallPostCommit(repo, "/new/path/kaioken"); err != nil {
		t.Fatal(err)
	}

	body := readHook(t, repo)
	if n := strings.Count(body, hookStart); n != 1 {
		t.Errorf("found %d kaioken blocks, want 1:\n%s", n, body)
	}
	if strings.Contains(body, "/old/path/kaioken") {
		t.Error("reinstall should refresh the binary path")
	}
	if !strings.Contains(body, "/new/path/kaioken") {
		t.Error("reinstall did not record the new binary path")
	}
}

// Removing our block from a shared hook must leave the rest untouched.
func TestRemoveKeepsForeignHook(t *testing.T) {
	repo, _ := newRepo(t)
	path, err := HookPath(repo)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("#!/bin/sh\nmake lint\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := InstallPostCommit(repo, "/bin/kaioken"); err != nil {
		t.Fatal(err)
	}

	removed, err := RemovePostCommit(repo)
	if err != nil {
		t.Fatal(err)
	}
	if !removed {
		t.Fatal("expected the hook to be reported as removed")
	}
	body := readHook(t, repo)
	if !strings.Contains(body, "make lint") {
		t.Errorf("removal destroyed the foreign hook:\n%s", body)
	}
	if strings.Contains(body, "kaioken") {
		t.Errorf("kaioken block survived removal:\n%s", body)
	}
}

// A hook file that is only ours should be deleted, not left as a stub.
func TestRemoveDeletesOwnHookFile(t *testing.T) {
	repo, _ := newRepo(t)
	if _, err := InstallPostCommit(repo, "/bin/kaioken"); err != nil {
		t.Fatal(err)
	}
	removed, err := RemovePostCommit(repo)
	if err != nil {
		t.Fatal(err)
	}
	if !removed {
		t.Fatal("expected removal")
	}
	path, _ := HookPath(repo)
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Error("a hook file containing only kaioken's block should be deleted")
	}
	if PostCommitInstalled(repo) {
		t.Error("hook should no longer report as installed")
	}
}

func TestRemoveWhenNothingInstalled(t *testing.T) {
	repo, _ := newRepo(t)
	removed, err := RemovePostCommit(repo)
	if err != nil {
		t.Errorf("removing a nonexistent hook should not error, got %v", err)
	}
	if removed {
		t.Error("nothing was installed, so nothing should be reported removed")
	}
}

func TestInstallRejectsNonRepo(t *testing.T) {
	if _, err := InstallPostCommit(t.TempDir(), "/bin/kaioken"); err == nil {
		t.Error("expected an error outside a git repository")
	}
}

// A truncated block (hand-edited, interrupted write) must not leave a broken
// script behind.
func TestReplaceBlockHandlesTruncation(t *testing.T) {
	body := "#!/bin/sh\nmake lint\n" + hookStart + "\nhalf a block, no end marker\n"
	got := replaceBlock(body, "")
	if strings.Contains(got, hookStart) {
		t.Errorf("truncated block survived:\n%s", got)
	}
	if !strings.Contains(got, "make lint") {
		t.Errorf("truncation cleanup destroyed the foreign hook:\n%s", got)
	}
}
