# Git Integration

## Table of Contents
- [Repository Detection](#repository-detection)
- [Change Detection](#change-detection)
- [Diff Generation](#diff-generation)
- [Commit Subjects](#commit-subjects)
- [Hook Installation and Management](#hook-installation-and-management)
- [Integration with Wiki Update](#integration-with-wiki-update)
- [Internal: Agent Diff Preview](#internal-agent-diff-preview)
- [Referenced Files](#referenced-files)

## Repository Detection

Kaioken first verifies if a directory is a Git repository using the `IsRepo` function. This is essential before performing any Git operations.

`internal/gitx/gitx.go:44-47`
```go
func IsRepo(repo string) bool {
	out, err := run(context.Background(), repo, "rev-parse", "--is-inside-work-tree")
	return err == nil && strings.TrimSpace(out) == "true"
}
```
This function executes `git rev-parse --is-inside-work-tree` in the specified directory and returns `true` only if the command succeeds and outputs exactly "true". It confirms the presence of a Git worktree without requiring additional Git configuration.

## Change Detection

To detect modifications since a baseline (such as the last documentation build), Kaioken uses the `Changes` function. This function identifies all differences between a baseline commit and the current working tree, including staged, unstaged, committed, and untracked files.

The `Change` struct represents each modified path:
`internal/gitx/gitx.go:17-20`
```go
// Change is one changed path between a baseline and the current working tree.
type Change struct {
	Status string // A added, M modified, D deleted, R renamed, ? untracked
	Path   string // repo-relative, slash-separated
}
```

The `Changes` function combines `git diff` for tracked changes and `git ls-files` for untracked files:
`internal/gitx/gitx.go:79-118`
```go
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
```
Key behaviors:
- Uses `--no-renames` to prevent Git from detecting renames (which would appear as separate delete/add operations), ensuring renames show as 'R' status.
- Deduplicates paths using a map to avoid reporting the same file multiple times.
- Untracked files are fetched separately via `git ls-files --others --exclude-standard` and added with status '?'.
- If the untracked files command fails, it returns the diff results anyway (non-fatal).

## Diff Generation

Kaioken generates unified diffs between a baseline and the working tree using the `Patch` function. This is used to display detailed changes (e.g., in status commands) or for debugging.

`internal/gitx/gitx.go:122-136`
```go
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
```
Features:
- `--no-color` ensures plain text output for consistent parsing.
- `--no-renames` maintains consistency with `Changes` behavior.
- `--unified=3` provides 3 lines of context around changes.
- Optional `paths` argument limits the diff to specific files.
- Output is truncated at `maxBytes` with a truncation notice if exceeded.

## Commit Subjects

The `Subjects` function retrieves commit messages from a baseline to HEAD, useful for generating changelogs or summarizing updates.

`internal/gitx/gitx.go:140-153`
```go
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
```
- Uses `git log --pretty=format:%h %s` to output abbreviated commit hash and subject line.
- The `-n%d` flag limits results to the most recent `limit` commits.
- Returns empty slice if no commits exist between `base` and `HEAD` (only uncommitted changes).

## Hook Installation and Management

Kaioken can install a self-contained post-commit hook that automatically triggers wiki updates after each commit. The hook is isolated via clearly marked delimiters to coexist with existing hooks.

### Hook Path Resolution
`internal/gitx/hook.go:24-30`
```go
// HookPath returns the post-commit hook path for a repository, resolving the
// real git directory (which is a file, not a directory, inside a worktree).
func HookPath(repo string) (string, error) {
	out, err := run(context.Background(), repo, "rev-parse", "--absolute-git-dir")
	if err != nil {
		return "", err
	}
	return filepath.Join(strings.TrimSpace(out), "hooks", "post-commit"), nil
}
```
Resolves the absolute Git directory (handling worktrees and symbolic links) then appends `/hooks/post-commit`.

### Installation
`internal/gitx/hook.go:67-106`
```go
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
```
Key steps:
1. Verifies repository validity via `IsRepo`.
2. Determines hook path and ensures directory exists.
3. Converts repo path to absolute to support worktrees and external invocations.
4. Reads existing hook content (if any).
5. Generates Kaioken's hook block via `hookBlock`.
6. Handles three cases:
   - Empty file: inserts shebang + block.
   - Existing Kaioken block: replaces it in-place (preserving surrounding content).
   - No Kaioken block: appends block after existing content.
7. Sets executable permissions (0o755) as Git requires hooks to be executable.

### Hook Block Content
`internal/gitx/hook.go:36-44`
```go
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
```
- Runs `kaioken update -repo <absolute_path>` in background (`&`) to avoid delaying commits.
- Redirects output to `/dev/null` to prevent hook noise.
- Uses forward slashes and single quotes for cross-platform shell compatibility.

### Safety Helpers
`internal/gitx/hook.go:48-53`
```go
// shellQuote renders a path as a single-quoted sh literal, normalising
// separators so a Windows path works under Git's bundled shell.
func shellQuote(p string) string {
	p = filepath.ToSlash(p)
	// The only character single quotes cannot contain is a single quote; the
	// usual idiom closes the string, emits an escaped quote, and reopens.
	return "'" + strings.ReplaceAll(p, "'", `'\''") + "'"
}
```
Con

<!-- kaioken:files internal/gitx/gitx.go,internal/gitx/hook.go,internal/agent/diff.go -->
