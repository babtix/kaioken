package gitx

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// gitRunner returns a closure that runs git inside repo, failing the test on
// error. Mirrors the unexported helper in gitx_test.go's newRepo.
func gitRunner(t *testing.T, repo string) func(args ...string) {
	t.Helper()
	return func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", append([]string{"-C", repo}, args...)...)
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=k", "GIT_AUTHOR_EMAIL=k@example.com",
			"GIT_COMMITTER_NAME=k", "GIT_COMMITTER_EMAIL=k@example.com")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
		}
	}
}

// TestStatusClassifiesXY asserts that the porcelain parser distinguishes
// staged, unstaged, untracked and deleted paths the way a real IDE's source
// control panel does.
func TestStatusClassifiesXY(t *testing.T) {
	repo, _ := newRepo(t)
	git := gitRunner(t, repo)

	write(t, repo, "a.go", "package a\n\nfunc New() {}\n") // modified, unstaged
	write(t, repo, "c.go", "package c\n")                  // brand new, untracked
	// Stage a new file and a deletion so staged vs unstaged is observable.
	write(t, repo, "d.go", "package d\n")
	git("add", "d.go")
	if err := os.Remove(filepath.Join(repo, "b.go")); err != nil {
		t.Fatal(err)
	}
	git("add", "b.go")

	statuses, err := Status(repo)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]FileStatus{}
	for _, s := range statuses {
		got[s.Path] = s
	}
	if s, ok := got["a.go"]; !ok || s.Kind != "modified" || !s.Unstaged {
		t.Errorf("a.go = %+v, want modified/unstaged", s)
	}
	if s, ok := got["c.go"]; !ok || s.Kind != "untracked" || !s.Unstaged || s.Staged {
		t.Errorf("c.go = %+v, want untracked/unstaged", s)
	}
	if s, ok := got["d.go"]; !ok || s.Kind != "added" || !s.Staged {
		t.Errorf("d.go = %+v, want added/staged", s)
	}
	if s, ok := got["b.go"]; !ok || s.Kind != "deleted" || !s.Staged {
		t.Errorf("b.go = %+v, want deleted/staged", s)
	}
}

// TestStatusCleanCoversEmpty asserts the non-nil empty slice contract so the
// front-end can map over it without a nil check.
func TestStatusCleanCoversEmpty(t *testing.T) {
	repo, _ := newRepo(t)
	statuses, err := Status(repo)
	if err != nil {
		t.Fatal(err)
	}
	if len(statuses) != 0 {
		t.Errorf("clean tree reported %d changes, want 0", len(statuses))
	}
}

// TestStatusNonRepoErrors confirms a non-git directory surfaces the git error
// rather than panicking — the daemon handler turns this into a 500.
func TestStatusNonRepoErrors(t *testing.T) {
	if _, err := Status(t.TempDir()); err == nil {
		t.Fatal("expected an error for a non-git directory")
	}
}
