package gitx

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The worktree lifecycle is what the delegate tool leans on: create an
// isolated checkout, collect its work as a patch, land the patch in the real
// repo, and leave no trace of the checkout behind.
func TestWorktreeLifecycle(t *testing.T) {
	repo, _ := newRepo(t)
	ctx := context.Background()

	dir, err := WorktreeAdd(ctx, repo, "HEAD")
	if err != nil {
		t.Fatalf("WorktreeAdd: %v", err)
	}
	defer os.RemoveAll(dir)

	// The delegate's simulated work: modify an existing file, add a new one,
	// delete another.
	write(t, dir, "a.go", "package a\n\nfunc New() {}\n")
	write(t, dir, "added.txt", "hello from the worktree\n")
	if err := os.Remove(filepath.Join(dir, "b.go")); err != nil {
		t.Fatal(err)
	}

	patch, err := WorktreePatch(ctx, dir)
	if err != nil {
		t.Fatalf("WorktreePatch: %v", err)
	}
	for _, want := range []string{"a.go", "added.txt", "b.go"} {
		if !strings.Contains(patch, want) {
			t.Errorf("patch missing %s:\n%s", want, patch)
		}
	}

	if err := Apply(ctx, repo, patch); err != nil {
		t.Fatalf("Apply: %v", err)
	}
	body, err := os.ReadFile(filepath.Join(repo, "added.txt"))
	if err != nil {
		t.Fatalf("applied file missing: %v", err)
	}
	// Compare line-ending agnostic: on Windows, autocrlf rewrites the
	// checked-out bytes without changing the content.
	if got := strings.ReplaceAll(string(body), "\r\n", "\n"); got != "hello from the worktree\n" {
		t.Errorf("applied content = %q", body)
	}
	if _, err := os.Stat(filepath.Join(repo, "b.go")); !os.IsNotExist(err) {
		t.Errorf("b.go should have been deleted in the main repo, stat err = %v", err)
	}

	if err := WorktreeRemove(ctx, repo, dir); err != nil {
		t.Fatalf("WorktreeRemove: %v", err)
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Errorf("worktree dir still present after remove: %v", err)
	}
}

// An empty patch is a valid outcome — a delegate that made no changes.
func TestWorktreePatchClean(t *testing.T) {
	repo, _ := newRepo(t)
	ctx := context.Background()

	dir, err := WorktreeAdd(ctx, repo, "HEAD")
	if err != nil {
		t.Fatalf("WorktreeAdd: %v", err)
	}
	defer WorktreeRemove(ctx, repo, dir)

	patch, err := WorktreePatch(ctx, dir)
	if err != nil {
		t.Fatalf("WorktreePatch: %v", err)
	}
	if strings.TrimSpace(patch) != "" {
		t.Errorf("expected empty patch for untouched worktree, got:\n%s", patch)
	}
}

func TestWorktreeAddNonRepo(t *testing.T) {
	if _, err := WorktreeAdd(context.Background(), t.TempDir(), "HEAD"); err == nil {
		t.Error("expected an error outside a git work tree")
	}
}

func TestApplyRejectsBadPatch(t *testing.T) {
	repo, _ := newRepo(t)
	if err := Apply(context.Background(), repo, "not a patch at all\n"); err == nil {
		t.Error("expected git apply to reject garbage")
	}
}
