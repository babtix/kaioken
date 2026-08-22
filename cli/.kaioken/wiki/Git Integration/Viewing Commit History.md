# Viewing Commit History

## Table of Contents
- [How Subjects Works](#how-subjects-works)
- [How Changes Works](#how-changes-works)
- [How Patch Works](#how-patch-works)
- [Usage in Incremental Updates](#usage-in-incremental-updates)
- [Error Handling](#error-handling)
- [Referenced Files](#referenced-files)

## How Subjects Works

The `Subjects` function retrieves commit subjects (messages) for a specified commit range to support changelog generation and progress tracking during incremental wiki updates.

`internal/gitx/gitx.go:186-199`
```go
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

The function executes `git log` with these key arguments:
- `--no-decorate`: Omits ref names (like `HEAD`, `tag: v1.0`) from output
- `--pretty=format:%h %s`: Formats each commit as abbreviated hash (`%h`) followed by subject (`%s`)
- `-n<limit>`: Limits results to `limit` most recent commits
- `base..HEAD`: Specifies commit range from `base` (exclusive) to `HEAD` (inclusive)

The output is split by newline, trimmed, and filtered to remove empty lines. Each resulting string contains the abbreviated commit hash and subject (e.g., `a1b2c3d Fix typo in README`). The function returns commits in reverse chronological order (newest first).

When no commits exist in the range (e.g., `base` equals `HEAD` or only uncommitted changes exist), the function returns an empty slice.

## How Changes Works

The `Changes` function lists every path that differs between a base commit and the current working tree — committed, staged, unstaged and untracked alike. That is deliberately wider than `base..HEAD`: documentation should describe the code on disk, not only what has been committed.

`internal/gitx/gitx.go:125-164`
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

The function returns a slice of `Change` values, each indicating the status (A for added, M for modified, D for deleted, R for renamed, ? for untracked) and the repo-relative path.

The `--no-renames` flag is used to avoid detecting renames as a delete and add, instead showing them as modified (which is simpler for the wiki to handle). Untracked files are added separately via `git ls-files`.

## How Patch Works

The `Patch` function returns the unified diff from base to the working tree, restricted to paths (all paths when empty) and truncated to maxBytes.

`internal/gitx/gitx.go:168-199`
```go
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

The function executes `git diff` with these key arguments:
- `--no-color`: Disables colored output for easier parsing
- `--no-renames`: Prevents rename detection (shows renames as modify/delete/add)
- `--unified=3`: Shows 3 lines of context around changes
- `base`: The starting commit for the diff
- `paths`: Optional list of paths to limit the diff to (if empty, all paths are included)

The output is truncated to `maxBytes` if necessary, with a note indicating truncation. This unified diff format is suitable for applying with `git apply` or reviewing changes.

## Usage in Incremental Updates

During `kaioken update` operations, the Git integration functions work together to detect changes and update the wiki:

1. `state.Load()` retrieves the last recorded commit SHA from `.kaioken/state.json`
2. `gitx.HasCommit(ctx, repo, lastSHA)` verifies the last recorded commit still exists (to handle rebased branches)
3. If the commit exists:
   - `gitx.Subjects(ctx, repo, lastSHA, 100)` fetches commit subjects for changelog generation
   - `gitx.Changes(ctx, repo, lastSHA)` identifies all changed files (including untracked) since last build
   - For affected modules, `gitx.Patch(ctx, repo, lastSHA, paths, 0)` may generate detailed diffs for analysis
4. If subjects or changes are non-empty, the system:
   - Generates a changelog for release notes
   - Identifies which documentation modules may be affected by changes
   - Triggers selective regeneration of outdated wiki sections

This enables progress tracking by showing contributors exactly what commits triggered documentation updates, supporting auditability and change awareness. The combination of Subjects (for high-level commit logging), Changes (for file-level change detection), and Patch (for detailed code differences) provides comprehensive Git integration for wiki maintenance.

## Error Handling

The functions propagate errors from the underlying `git` command. Common error scenarios include:
- Invalid repository path (`repo` not a Git worktree)
- Non-existent `base` revision (e.g., rewritten/deleted branch)
- Git executable not found in PATH

Callers should handle these errors appropriately—typically by logging and continuing with empty changelog/data rather than halting the update process, since missing Git history doesn't prevent documenting the current code state. For example:
- `Subjects` returning an empty slice when no commits exist in range
- `Changes` returning changes from `git diff` even if `ls-files` fails for untracked files
- `Patch` returning an empty string when no differences exist

## Referenced Files
- internal/gitx/gitx.go

<!-- kaioken:files internal/gitx/gitx.go -->
