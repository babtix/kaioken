package gitx

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// newRepo builds a throwaway git repo with one commit and returns its path
// plus that commit's SHA. It skips the test when git is unavailable.
func newRepo(t *testing.T) (string, string) {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not on PATH")
	}
	repo := t.TempDir()
	git := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", append([]string{"-C", repo}, args...)...)
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=k", "GIT_AUTHOR_EMAIL=k@example.com",
			"GIT_COMMITTER_NAME=k", "GIT_COMMITTER_EMAIL=k@example.com")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
		}
	}
	git("init", "-q")
	git("config", "user.email", "k@example.com")
	git("config", "user.name", "k")

	write(t, repo, "a.go", "package a\n")
	write(t, repo, "b.go", "package b\n")
	git("add", ".")
	git("commit", "-qm", "initial")

	head, err := Head(context.Background(), repo)
	if err != nil {
		t.Fatal(err)
	}
	return repo, head
}

func write(t *testing.T, repo, rel, body string) {
	t.Helper()
	p := filepath.Join(repo, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestIsRepo(t *testing.T) {
	repo, _ := newRepo(t)
	if !IsRepo(repo) {
		t.Error("expected a git work tree")
	}
	if IsRepo(t.TempDir()) {
		t.Error("a bare temp dir is not a git work tree")
	}
}

// Changes must span committed, uncommitted AND untracked work — the wiki
// documents the code on disk, not only what has been committed.
func TestChangesCoversWorkingTree(t *testing.T) {
	repo, base := newRepo(t)
	ctx := context.Background()

	write(t, repo, "a.go", "package a\n\nfunc New() {}\n") // modified, uncommitted
	write(t, repo, "c.go", "package c\n")                  // brand new, untracked
	if err := os.Remove(filepath.Join(repo, "b.go")); err != nil {
		t.Fatal(err)
	}

	changes, err := Changes(ctx, repo, base)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, c := range changes {
		got[c.Path] = c.Status
	}
	if got["a.go"] != "M" {
		t.Errorf("a.go status = %q, want M", got["a.go"])
	}
	if got["b.go"] != "D" {
		t.Errorf("b.go status = %q, want D", got["b.go"])
	}
	if got["c.go"] != "?" {
		t.Errorf("c.go status = %q, want ? (untracked)", got["c.go"])
	}
}

func TestChangesEmptyWhenClean(t *testing.T) {
	repo, base := newRepo(t)
	changes, err := Changes(context.Background(), repo, base)
	if err != nil {
		t.Fatal(err)
	}
	if len(changes) != 0 {
		t.Errorf("clean tree should report no changes, got %v", changes)
	}
}

func TestPatchScopedAndTruncated(t *testing.T) {
	repo, base := newRepo(t)
	ctx := context.Background()
	write(t, repo, "a.go", "package a\n\nfunc New() {}\n")
	write(t, repo, "b.go", "package b\n\nfunc Other() {}\n")

	patch, err := Patch(ctx, repo, base, []string{"a.go"}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(patch, "func New()") {
		t.Error("patch should contain the a.go change")
	}
	if strings.Contains(patch, "func Other()") {
		t.Error("patch scoped to a.go leaked b.go")
	}

	short, err := Patch(ctx, repo, base, nil, 40)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(short, "[diff truncated]") {
		t.Errorf("expected a truncation marker, got %q", short)
	}
}

func TestHasCommitAndResolve(t *testing.T) {
	repo, head := newRepo(t)
	ctx := context.Background()
	if !HasCommit(ctx, repo, head) {
		t.Error("HEAD should resolve")
	}
	if HasCommit(ctx, repo, "0123456789abcdef0123456789abcdef01234567") {
		t.Error("a bogus SHA must not resolve")
	}
	got, err := Resolve(ctx, repo, "HEAD")
	if err != nil || got != head {
		t.Errorf("Resolve(HEAD) = %q, %v; want %q", got, err, head)
	}
}

func TestShort(t *testing.T) {
	if got := Short("0123456789abcdef"); got != "01234567" {
		t.Errorf("Short = %q", got)
	}
	if got := Short("abc"); got != "abc" {
		t.Errorf("Short should pass through short input, got %q", got)
	}
}
