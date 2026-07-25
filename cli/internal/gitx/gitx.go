// Package gitx wraps the handful of git plumbing calls Kaioken needs in order
// to answer one question: what changed in this repository since the last
// documentation run? It shells out to the git binary rather than linking a
// library, so it works with whatever git the user already has.
package gitx

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

// Change is one changed path between a baseline and the current working tree.
type Change struct {
	Status string // A added, M modified, D deleted, R renamed, ? untracked
	Path   string // repo-relative, slash-separated
}

func (c Change) String() string { return c.Status + " " + c.Path }

// Deleted reports whether the path no longer exists in the working tree.
func (c Change) Deleted() bool { return c.Status == "D" }

// run executes a git subcommand inside repo and returns trimmed stdout.
func run(ctx context.Context, repo string, args ...string) (string, error) {
	full := append([]string{"-C", repo}, args...)
	cmd := exec.CommandContext(ctx, "git", full...)
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(errb.String())
		if msg == "" {
			msg = err.Error()
		}
		return "", fmt.Errorf("git %s: %s", strings.Join(args, " "), msg)
	}
	return strings.TrimRight(out.String(), "\r\n"), nil
}

// IsRepo reports whether repo sits inside a git work tree (and git is on PATH).
func IsRepo(repo string) bool {
	out, err := run(context.Background(), repo, "rev-parse", "--is-inside-work-tree")
	return err == nil && strings.TrimSpace(out) == "true"
}

// Head returns the current commit SHA.
func Head(ctx context.Context, repo string) (string, error) {
	return run(ctx, repo, "rev-parse", "HEAD")
}

// Short abbreviates a SHA for display.
func Short(sha string) string {
	if len(sha) > 8 {
		return sha[:8]
	}
	return sha
}

// Resolve turns a revision expression (a SHA, "HEAD~5", a tag) into a commit
// SHA, and errors if it does not name a commit in this repo.
func Resolve(ctx context.Context, repo, rev string) (string, error) {
	return run(ctx, repo, "rev-parse", "--verify", rev+"^{commit}")
}

// HasCommit reports whether rev still resolves here — a baseline recorded on a
// branch that was since rebased or from a different clone will not.
func HasCommit(ctx context.Context, repo, rev string) bool {
	_, err := Resolve(ctx, repo, rev)
	return err == nil
}

// Changes lists every path that differs between base and the CURRENT WORKING
// TREE — committed, staged, unstaged and untracked alike. That is deliberately
// wider than `base..HEAD`: documentation should describe the code on disk, not
// only what has been committed.
func Changes(ctx context.Context, repo, base string) ([]Change, error) {
	out, err := run(ctx, repo, "diff", "--name-status", "--no-renames", base)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	var changes []Change
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}
		p := filepath.ToSlash(parts[len(parts)-1])
		if seen[p] {
			continue
		}
		seen[p] = true
		changes = append(changes, Change{Status: string(parts[0][0]), Path: p})
	}

	// Untracked files never show up in `git diff`, but a brand-new source file
	// is exactly the kind of thing the wiki must learn about.
	untracked, err := run(ctx, repo, "ls-files", "--others", "--exclude-standard")
	if err != nil {
		return changes, nil // diff already succeeded; don't fail the whole run
	}
	for _, line := range strings.Split(untracked, "\n") {
		p := filepath.ToSlash(strings.TrimSpace(line))
		if p == "" || seen[p] {
			continue
		}
		seen[p] = true
		changes = append(changes, Change{Status: "?", Path: p})
	}
	return changes, nil
}

// Patch returns the unified diff from base to the working tree, restricted to
// paths (all paths when empty) and truncated to maxBytes.
func Patch(ctx context.Context, repo, base string, paths []string, maxBytes int) (string, error) {
	args := []string{"diff", "--no-color", "--no-renames", "--unified=3", base}
	if len(paths) > 0 {
		args = append(args, "--")
		args = append(args, paths...)
	}
	out, err := run(ctx, repo, args...)
	if err != nil {
		return "", err
	}
	if maxBytes > 0 && len(out) > maxBytes {
		out = out[:maxBytes] + "\n… [diff truncated]"
	}
	return out, nil
}

// Subjects lists commit subjects in base..HEAD, newest first, capped at limit.
// It returns nothing when the only changes are uncommitted.
func Subjects(ctx context.Context, repo, base string, limit int) ([]string, error) {
	out, err := run(ctx, repo, "log", "--no-decorate", "--pretty=format:%h %s",
		fmt.Sprintf("-n%d", limit), base+"..HEAD")
	if err != nil {
		return nil, err
	}
	var subjects []string
	for _, l := range strings.Split(out, "\n") {
		if l = strings.TrimSpace(l); l != "" {
			subjects = append(subjects, l)
		}
	}
	return subjects, nil
}
