package gitx

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Worktree support is what lets Kaioken run a writable sub-agent somewhere
// disposable: a detached checkout of the repo the agent can change freely,
// while the user's working tree stays untouched until the result is applied
// back as a single patch.

// WorktreeAdd creates a detached worktree of repo checked out at rev, in a
// fresh directory under the OS temp dir. Detached (rather than a throwaway
// branch) keeps cleanup trivial — removing the worktree leaves nothing else
// behind to prune.
func WorktreeAdd(ctx context.Context, repo, rev string) (string, error) {
	dir := filepath.Join(os.TempDir(), fmt.Sprintf("kaioken-wt-%d", time.Now().UnixNano()))
	if _, err := run(ctx, repo, "worktree", "add", "--detach", dir, rev); err != nil {
		return "", err
	}
	return dir, nil
}

// WorktreePatch stages everything inside the worktree — modifications,
// deletions and untracked files alike — and returns the unified diff against
// its checked-out commit. This is the portable shape of a sub-agent's work:
// it applies cleanly to the original repo with Apply.
func WorktreePatch(ctx context.Context, dir string) (string, error) {
	if _, err := run(ctx, dir, "add", "-A"); err != nil {
		return "", err
	}
	// Raw on purpose: the patch must keep its trailing newline or git apply
	// rejects it as corrupt.
	return runRaw(ctx, dir, "diff", "--cached", "--binary")
}

// WorktreeRemove deletes the worktree directory and detaches it from the
// repo's worktree bookkeeping. Best treated as final cleanup — it is called
// even when the delegated work is discarded.
func WorktreeRemove(ctx context.Context, repo, dir string) error {
	_, err := run(ctx, repo, "worktree", "remove", "--force", dir)
	return err
}

// Apply feeds a unified patch to `git apply` inside repo. Binary hunks are
// supported because WorktreePatch emits --binary diffs.
func Apply(ctx context.Context, repo, patch string) error {
	cmd := exec.CommandContext(ctx, "git", "-C", repo, "apply", "--whitespace=nowarn")
	cmd.Stdin = strings.NewReader(patch)
	var errb bytes.Buffer
	cmd.Stderr = &errb
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(errb.String())
		if msg == "" {
			msg = err.Error()
		}
		return fmt.Errorf("git apply: %s", msg)
	}
	return nil
}
