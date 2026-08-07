# Viewing Commit History

## Table of Contents
- [How Subjects Works](#how-subjects-works)
- [Usage in Incremental Updates](#usage-in-incremental-updates)
- [Error Handling](#error-handling)
- [Referenced Files](#referenced-files)

## How Subjects Works

The `Subjects` function retrieves commit subjects (messages) for a specified commit range to support changelog generation and progress tracking during incremental wiki updates.

`internal/gitx/gitx.go:140-153`
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

## Usage in Incremental Updates

During `kaioken update` operations, the `Subjects` function identifies new commits since the last documentation build. The process flow is:

1. `state.Load()` retrieves the last recorded commit SHA from `.kaioken/state.json`
2. `gitx.Subjects(ctx, repo, lastSHA, 100)` fetches subjects for commits since last build
3. If subjects are non-empty, the system:
   - Generates a changelog for release notes
   - Identifies which documentation modules may be affected by changes
   - Triggers selective regeneration of outdated wiki sections

This enables progress tracking by showing contributors exactly what commits triggered documentation updates, supporting auditability and change awareness.

## Error Handling

The function propagates errors from the underlying `git log` command. Common error scenarios include:
- Invalid repository path (`repo` not a Git worktree)
- Non-existent `base` revision (e.g., rewritten/deleted branch)
- Git executable not found in PATH

Callers should handle these errors appropriately—typically by logging and continuing with empty changelog data rather than halting the update process, since missing commit history doesn't prevent documenting current code state.

## Referenced Files
- internal/gitx/gitx.go

<!-- kaioken:files internal/gitx/gitx.go -->
