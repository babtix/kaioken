# Generating Diff Patches and Previews

## Table of Contents
- [Generating Git Patches](#generating-git-patches)
- [Generating Diff Previews for Approval](#generating-diff-previews-for-approval)
- [Referenced Files](#referenced-files)

## Generating Git Patches

Kaioken generates Git patch outputs via the `gitx.Patch` function, which produces a unified diff between a baseline commit and the current working tree. This is used for creating patch files and displaying changes in the TUI.

### Function Signature
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

### Key Behavior
1. **Command Construction**: 
   - Base command: `git diff --no-color --no-renames --unified=3 <base>`
   - If `paths` is non-empty, appends `--` followed by the paths to limit the diff
   - `--no-color` ensures plain text output
   - `--no-renames` prevents rename detection (simplifies diff parsing)
   - `--unified=3` sets 3 lines of context

2. **Execution**:
   - Uses `gitx.run` to execute the command in the repository directory
   - Returns trimmed stdout (removing trailing `\r\n`)

3. **Truncation**:
   - If `maxBytes > 0` and output exceeds `maxBytes`, truncates to `maxBytes` and appends `\n… [diff truncated]`
   - Prevents overwhelming output while indicating truncation

### Usage Context
- Called during wiki generation to capture changes since last build
- Used in TUI to display file changes before applying edits
- Path filtering allows focusing on specific files (e.g., when user edits a single file)

## Generating Diff Previews for Approval

Kaioken creates human-readable diff previews for user approval in the TUI using functions in `internal/agent/diff.go`. These previews show changes in a compact format suitable for terminal display.

### File-Level Diff Preview (`diffPreview`)
`internal/agent/diff.go:12-45`

```go
// diffPreview renders a compact line diff between old and new content for the
// approval prompt. New files (empty old) show a content preview.
func diffPreview(oldContent, newContent string) string {
	if oldContent == "" {
		return "(new file)\n" + capLines(prefixLines(newContent, "+"), maxDiffLines)
	}
	oldLines := strings.Split(oldContent, "\n")
	newLines := strings.Split(newContent, "\n")

	// Trim common prefix/suffix so the hunk shows just what changed.
	start := 0
	for start < len(oldLines) && start < len(newLines) && oldLines[start] == newLines[start] {
		start++
	}
	endO, endN := len(oldLines), len(newLines)
	for endO > start && endN > start && oldLines[endO-1] == newLines[endN-1] {
		endO--
		endN--
	}

	var b strings.Builder
	if start > 0 {
		fmt.Fprintf(&b, "  … %d unchanged line(s)\n", start)
	}
	for _, l := range oldLines[start:endO] {
		b.WriteString("- " + l + "\n")
	}
	for _, l := range newLines[start:endN] {
		b.WriteString("+ " + l + "\n")
	}
	tail := len(oldLines) - endO
	if tail > 0 {
		fmt.Fprintf(&b, "  … %d unchanged line(s)\n", tail)
	}
	return capLines(b.String(), maxDiffLines)
}
```

#### Workflow
1. **New File Handling**: 
   - If `oldContent` is empty, returns `(new file)\n` followed by capped, prefixed new content
   - New lines are prefixed with `+ `

2. **Common Line Trimming**:
   - Removes identical prefix lines from both contents
   - Removes identical suffix lines from both contents
   - Reports skipped unchanged lines at start/end (e.g., `  … 5 unchanged line(s)`)

3. **Change Display**:
   - Removed lines (from `oldLines`) prefixed with `- `
   - Added lines (from `newLines`) prefixed with `+ `
   - Uses `capLines` to limit output to `maxDiffLines` (40 lines)

4. **Output Format**:
   - Shows contextual unchanged lines only when trimming occurred
   - Always ends with newline
   - Truncates with `  … X more line(s)` when exceeding limit

### Inline Edit Preview (`hunkPreview`)
`internal/agent/diff.go:48-53`

```go
// hunkPreview renders an edit_file change as a removed/added hunk.
func hunkPreview(oldStr, newStr string) string {
	var b strings.Builder
	b.WriteString(capLines(prefixLines(oldStr, "-"), maxDiffLines/2))
	b.WriteString(capLines(prefixLines(newStr, "+"), maxDiffLines/2))
	return b.String()
}
```

#### Workflow
1. **Split Display**:
   - First half: removed content (prefixed with `- `), capped to `maxDiffLines/2`
   - Second half: added content (prefixed with `+ `), capped to `maxDiffLines/2`
   - Total lines limited to `maxDiffLines` (20 removed + 20 added)

2. **Helper Functions**:
   - `prefixLines`: Adds specified prefix (`- ` or `+ `) to each line
   - `capLines`: Limits lines to `n`, appending `  … X more line(s)` if exceeded

### Constants
`internal/agent/diff.go:8`

```go
const maxDiffLines = 40
```
- Controls maximum lines shown in previews
- Applied differently in `diffPreview` (total) vs `hunkPreview` (split)

### Usage in Approval Flow
1. When LLM requests `edit_file` tool:
   - Agent computes preview using `diffPreview` (full file) or `hunkPreview` (inline edit)
   - TUI displays preview in approval prompt
   - User approves/rejects based on preview
2. Previews help users:
   - Verify scope of changes
   - Spot unintended modifications
   - Review new file content

## Referenced Files
- internal/gitx/gitx.go
- internal/agent/diff.go

<!-- kaioken:files internal/gitx/gitx.go,internal/agent/diff.go -->
