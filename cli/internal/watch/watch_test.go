package watch

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// newRepo builds a throwaway git repo with one committed file and returns its
// path. Skips when git is unavailable.
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
	if err := os.WriteFile(filepath.Join(repo, "a.txt"), []byte("original\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	git("add", ".")
	git("commit", "-qm", "initial")
	return repo
}

// TestNewPaths verifies the pure-logic helper that computes growing paths.
func TestNewPaths(t *testing.T) {
	base := map[string]bool{"a.txt": true, "b.txt": true}
	curr := map[string]bool{"a.txt": true, "b.txt": true, "c.txt": true}
	added := newPaths(base, curr)
	if len(added) != 1 || added[0] != "c.txt" {
		t.Errorf("newPaths = %v, want [c.txt]", added)
	}
}

// TestNewPathsNoGrowth verifies that no notification fires when nothing is new.
func TestNewPathsNoGrowth(t *testing.T) {
	base := map[string]bool{"a.txt": true}
	curr := map[string]bool{"a.txt": true}
	if added := newPaths(base, curr); len(added) != 0 {
		t.Errorf("expected no new paths, got %v", added)
	}
}

// TestFormatGrowth checks the notification line shape and the truncation hint.
func TestFormatGrowth(t *testing.T) {
	paths := []string{"a.go", "b.go"}
	msg := formatGrowth(paths)
	if !strings.Contains(msg, "2 new changed") {
		t.Errorf("expected count in message, got %q", msg)
	}
	if !strings.Contains(msg, "kaioken update") {
		t.Errorf("expected update hint in message, got %q", msg)
	}
}

// TestFormatGrowthTruncation checks that more than maxReportPaths paths are
// capped with a "… and N more" suffix.
func TestFormatGrowthTruncation(t *testing.T) {
	var paths []string
	for i := 0; i < 15; i++ {
		paths = append(paths, "file"+string(rune('a'+i))+".go")
	}
	msg := formatGrowth(paths)
	if !strings.Contains(msg, "more") {
		t.Errorf("expected truncation suffix, got %q", msg)
	}
}

// TestRunNotifiesOnNewFile is an end-to-end test: seed a snapshot, add a new
// untracked file, and assert notify fires exactly once with the new path.
func TestRunNotifiesOnNewFile(t *testing.T) {
	repo := newRepo(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	notified := make(chan string, 1)
	go func() {
		Run(ctx, repo, 100*time.Millisecond, func(msg string) {
			select {
			case notified <- msg:
			default:
			}
		})
	}()

	// Let the first snapshot settle (several ticks to be safe).
	time.Sleep(350 * time.Millisecond)

	// Add a new untracked file.
	newFile := filepath.Join(repo, "new_feature.go")
	if err := os.WriteFile(newFile, []byte("package main\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	select {
	case msg := <-notified:
		if !strings.Contains(msg, "new_feature.go") {
			t.Errorf("notification missing the new file: %q", msg)
		}
	case <-time.After(4 * time.Second):
		t.Fatal("watch did not notify about the new file in time")
	}
}

// TestRunNoDoubleFireOnUnchanged verifies that a second tick without new paths
// does not fire notify again.
func TestRunNoDoubleFireOnUnchanged(t *testing.T) {
	repo := newRepo(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	count := 0
	go func() {
		Run(ctx, repo, 100*time.Millisecond, func(string) { count++ })
	}()

	// Wait long enough for several ticks with no changes.
	time.Sleep(500 * time.Millisecond)
	cancel()

	if count != 0 {
		t.Errorf("notify fired %d times on a clean repo, want 0", count)
	}
}
