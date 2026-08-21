package wiki

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"

	"kaioken/internal/gitx"
)

// newRepo builds a throwaway git repo with one commit and returns its path.
func newRepo(t *testing.T) string {
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
	if err := os.WriteFile(filepath.Join(repo, "a.go"), []byte("package a\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	git("add", ".")
	git("commit", "-qm", "initial")
	return repo
}

func commitEmpty(t *testing.T, repo, msg string) {
	t.Helper()
	cmd := exec.Command("git", "-C", repo, "commit", "--allow-empty", "-qm", msg)
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=k", "GIT_AUTHOR_EMAIL=k@example.com",
		"GIT_COMMITTER_NAME=k", "GIT_COMMITTER_EMAIL=k@example.com")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git commit: %v\n%s", err, out)
	}
}

func TestStalenessNoStamp(t *testing.T) {
	repo := newRepo(t)
	if n, ok := Staleness(repo); ok || n != 0 {
		t.Errorf("Staleness with no stamp = %d, %v; want 0, false", n, ok)
	}
	if note := StalenessNote(repo); note != "" {
		t.Errorf("StalenessNote with no stamp = %q, want empty", note)
	}
}

func TestStalenessUpToDate(t *testing.T) {
	repo := newRepo(t)
	if err := SaveStamp(repo, "test-model", 1, nil); err != nil {
		t.Fatal(err)
	}
	if n, ok := Staleness(repo); !ok || n != 0 {
		t.Errorf("Staleness at HEAD = %d, %v; want 0, true", n, ok)
	}
	if note := StalenessNote(repo); note != "" {
		t.Errorf("StalenessNote at HEAD = %q, want empty (not stale)", note)
	}
}

func TestStalenessBehind(t *testing.T) {
	repo := newRepo(t)
	if err := SaveStamp(repo, "test-model", 1, nil); err != nil {
		t.Fatal(err)
	}
	commitEmpty(t, repo, "second")
	commitEmpty(t, repo, "third")

	n, ok := Staleness(repo)
	if !ok || n != 2 {
		t.Errorf("Staleness = %d, %v; want 2, true", n, ok)
	}
	note := StalenessNote(repo)
	if !strings.Contains(note, "2 commits ago") || !strings.Contains(note, "may be stale") {
		t.Errorf("StalenessNote = %q", note)
	}
}

func TestStalenessCommitNotFound(t *testing.T) {
	repo := newRepo(t)
	if err := SaveStamp(repo, "test-model", 1, nil); err != nil {
		t.Fatal(err)
	}
	// Overwrite the stamp with a commit this repo has never seen.
	stamp := LoadStamp(repo)
	stamp.Commit = "0123456789abcdef0123456789abcdef01234567"
	raw, err := yaml.Marshal(stamp)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(StampPath(repo), raw, 0o644); err != nil {
		t.Fatal(err)
	}

	if n, ok := Staleness(repo); ok || n != 0 {
		t.Errorf("Staleness with unresolvable commit = %d, %v; want 0, false", n, ok)
	}
}

func TestStalenessNoGitRepo(t *testing.T) {
	repo := t.TempDir()
	if gitx.IsRepo(repo) {
		t.Skip("temp dir unexpectedly a git repo")
	}
	if n, ok := Staleness(repo); ok || n != 0 {
		t.Errorf("Staleness outside a repo = %d, %v; want 0, false", n, ok)
	}
}
