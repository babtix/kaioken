package gitx

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Kaioken can keep a wiki current automatically by refreshing it after every
// commit. Repositories often already have hooks, so the installer writes a
// clearly delimited block it can later find and remove, and never overwrites
// what it did not write.

const (
	hookStart = "# >>> kaioken >>>"
	hookEnd   = "# <<< kaioken <<<"
	shebang   = "#!/bin/sh"
)

// HookPath returns the post-commit hook path for a repository, resolving the
// real git directory (which is a file, not a directory, inside a worktree).
func HookPath(repo string) (string, error) {
	out, err := run(context.Background(), repo, "rev-parse", "--absolute-git-dir")
	if err != nil {
		return "", err
	}
	return filepath.Join(strings.TrimSpace(out), "hooks", "post-commit"), nil
}

// hookBlock is the script Kaioken owns inside the hook file. Git runs hooks
// through sh even on Windows, so paths are written with forward slashes and
// single-quoted — sh does no escape processing inside single quotes, which
// avoids depending on how backslashes happen to round-trip.
func hookBlock(exe, repo string) string {
	return strings.Join([]string{
		hookStart,
		"# Refresh the generated wiki against this commit. Runs detached so it",
		"# never delays a commit; remove with `kaioken hook remove`.",
		fmt.Sprintf(`%s update -repo %s >/dev/null 2>&1 &`, shellQuote(exe), shellQuote(repo)),
		hookEnd,
	}, "\n")
}

// shellQuote renders a path as a single-quoted sh literal, normalising
// separators so a Windows path works under Git's bundled shell.
func shellQuote(p string) string {
	p = filepath.ToSlash(p)
	// The only character single quotes cannot contain is a single quote; the
	// usual idiom closes the string, emits an escaped quote, and reopens.
	return "'" + strings.ReplaceAll(p, "'", `'\''`) + "'"
}

// PostCommitInstalled reports whether Kaioken's block is present.
func PostCommitInstalled(repo string) bool {
	path, err := HookPath(repo)
	if err != nil {
		return false
	}
	raw, err := os.ReadFile(path)
	return err == nil && strings.Contains(string(raw), hookStart)
}

// InstallPostCommit adds (or refreshes) Kaioken's block in the post-commit
// hook, preserving any script that is already there.
func InstallPostCommit(repo, exe string) (path string, err error) {
	if !IsRepo(repo) {
		return "", fmt.Errorf("%s is not a git repository", repo)
	}
	path, err = HookPath(repo)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", err
	}
	// Record an absolute repo path: git runs hooks from the repository root,
	// but a relative path recorded here would break for worktrees and for
	// anyone invoking the hook from elsewhere.
	if abs, aerr := filepath.Abs(repo); aerr == nil {
		repo = abs
	}

	existing := ""
	if raw, rerr := os.ReadFile(path); rerr == nil {
		existing = string(raw)
	}

	block := hookBlock(exe, repo)
	var out string
	switch {
	case existing == "":
		out = shebang + "\n\n" + block + "\n"
	case strings.Contains(existing, hookStart):
		// Refresh in place so the exe/repo path stays correct after a move.
		out = replaceBlock(existing, block)
	default:
		out = strings.TrimRight(existing, "\n") + "\n\n" + block + "\n"
	}
	// 0755: git only runs hooks that are executable.
	if err := os.WriteFile(path, []byte(out), 0o755); err != nil {
		return "", err
	}
	return path, nil
}

// RemovePostCommit strips Kaioken's block, leaving any other hook script
// intact. It deletes the file only if nothing meaningful remains.
func RemovePostCommit(repo string) (removed bool, err error) {
	path, err := HookPath(repo)
	if err != nil {
		return false, err
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	body := string(raw)
	if !strings.Contains(body, hookStart) {
		return false, nil
	}
	stripped := strings.TrimSpace(replaceBlock(body, ""))

	// Nothing but the shebang left: the file was ours alone.
	if stripped == "" || stripped == shebang {
		return true, os.Remove(path)
	}
	return true, os.WriteFile(path, []byte(stripped+"\n"), 0o755)
}

// replaceBlock swaps the delimited Kaioken block for replacement (empty to
// delete it), leaving the surrounding script untouched.
func replaceBlock(body, replacement string) string {
	start := strings.Index(body, hookStart)
	if start == -1 {
		return body
	}
	end := strings.Index(body[start:], hookEnd)
	if end == -1 {
		// Truncated block: drop everything from the marker on rather than
		// leaving a half-written script behind.
		return strings.TrimRight(body[:start], "\n") + "\n" + replacement
	}
	tail := body[start+end+len(hookEnd):]
	head := body[:start]
	if replacement == "" {
		return strings.TrimRight(head, "\n") + "\n" + strings.TrimLeft(tail, "\n")
	}
	return head + replacement + tail
}
