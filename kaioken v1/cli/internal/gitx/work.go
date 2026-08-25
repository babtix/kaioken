package gitx

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// ErrNoPaths is returned by the staging operations when handed an empty path
// list. Every one of them would otherwise fall through to git's "apply to
// everything" default, which is never what a per-file panel button means.
var ErrNoPaths = errors.New("no paths given")

// LineStat is the added/removed line count for one changed path — the "+12 −3"
// a source-control panel shows next to a file name.
type LineStat struct {
	Added   int `json:"added"`
	Removed int `json:"removed"`
}

// maxUntrackedStat caps how much of a brand-new file is read to count its
// lines. Past this size the count stops mattering to a UI badge, and reading a
// multi-hundred-megabyte blob to render "+N" is a bad trade.
const maxUntrackedStat = 2 << 20 // 2 MiB

// Stage adds paths to the index. Deletions and untracked files are included —
// `git add` has staged removals since git 2.0, so one verb covers every row a
// panel can show.
func Stage(ctx context.Context, repo string, paths []string) error {
	if len(paths) == 0 {
		return ErrNoPaths
	}
	_, err := run(ctx, repo, append([]string{"add", "--"}, paths...)...)
	return err
}

// Unstage drops paths from the index while leaving the working tree alone.
//
// On an unborn branch there is no HEAD to reset against, so `git reset HEAD`
// fails outright; removing the entry from the index is the same operation
// there. --ignore-unmatch keeps unstaging an already-unstaged path a no-op
// rather than an error, which is what a checkbox toggling off should do.
func Unstage(ctx context.Context, repo string, paths []string) error {
	if len(paths) == 0 {
		return ErrNoPaths
	}
	if !HasCommit(ctx, repo, "HEAD") {
		_, err := run(ctx, repo,
			append([]string{"rm", "--cached", "--force", "--ignore-unmatch", "--quiet", "--"}, paths...)...)
		return err
	}
	_, err := run(ctx, repo, append([]string{"reset", "--quiet", "HEAD", "--"}, paths...)...)
	return err
}

// Discard throws away every uncommitted change to paths — staged and unstaged
// alike — and deletes the ones that were never tracked.
//
// This is irreversible: git keeps no reflog for work that was never committed.
// Callers are expected to have confirmed with the user first.
//
// The index is reset before the working tree is touched so that a path staged
// as an addition becomes untracked and gets deleted, rather than being
// "restored" from an index entry that is itself the thing being discarded.
func Discard(ctx context.Context, repo string, paths []string) error {
	if len(paths) == 0 {
		return ErrNoPaths
	}
	if err := Unstage(ctx, repo, paths); err != nil {
		return err
	}
	// Re-read status after unstaging: what counts as tracked has just changed
	// for anything that was a staged addition.
	statuses, err := Status(repo)
	if err != nil {
		return err
	}
	kind := make(map[string]string, len(statuses))
	for _, st := range statuses {
		kind[st.Path] = st.Kind
	}
	var tracked, untracked []string
	for _, p := range paths {
		k, ok := kind[p]
		switch {
		case !ok: // already clean — nothing left to discard
		case k == "untracked":
			untracked = append(untracked, p)
		default:
			tracked = append(tracked, p)
		}
	}
	if len(tracked) > 0 {
		if _, err := run(ctx, repo, append([]string{"checkout", "--force", "--"}, tracked...)...); err != nil {
			return err
		}
	}
	if len(untracked) > 0 {
		if _, err := run(ctx, repo, append([]string{"clean", "--force", "--quiet", "--"}, untracked...)...); err != nil {
			return err
		}
	}
	return nil
}

// Commit records the current index and returns the new commit's SHA. Hooks run
// normally — a repo that installs a pre-commit check expects it to fire whether
// the commit came from a terminal or from a panel button.
func Commit(ctx context.Context, repo, message string, amend bool) (string, error) {
	message = strings.TrimSpace(message)
	if message == "" {
		return "", errors.New("empty commit message")
	}
	args := []string{"commit", "--message", message}
	if amend {
		args = append(args, "--amend")
	}
	if _, err := run(ctx, repo, args...); err != nil {
		return "", err
	}
	return Head(ctx, repo)
}

// FileDiff returns the unified diff for a single path. staged selects the
// index-vs-HEAD diff instead of the working-tree-vs-index one.
//
// Untracked files are synthesised rather than handed to `git diff --no-index`:
// that mode exits non-zero whenever the files differ (i.e. always, here) and
// needs a null-device path that is spelled differently per platform.
func FileDiff(ctx context.Context, repo, p string, staged bool, maxBytes int) (string, error) {
	if p == "" {
		return "", ErrNoPaths
	}
	if !staged && isUntracked(repo, p) {
		return untrackedDiff(repo, p, maxBytes), nil
	}
	args := []string{"diff", "--no-color", "--no-ext-diff", "--unified=3"}
	if staged {
		args = append(args, "--cached")
	}
	args = append(args, "--", p)
	out, err := run(ctx, repo, args...)
	if err != nil {
		return "", err
	}
	if maxBytes > 0 && len(out) > maxBytes {
		out = out[:maxBytes] + "\n… [diff truncated]"
	}
	return out, nil
}

// LineStats returns added/removed counts per path, summing the staged and
// unstaged diffs so a file changed in both shows its full delta.
//
// Renames are disabled (--no-renames) so every numstat row carries a plain
// path. A renamed file then reports the line count of its new copy, which is
// what the destination path's row wants to show anyway.
func LineStats(ctx context.Context, repo string) (map[string]LineStat, error) {
	stats := map[string]LineStat{}
	collect := func(args ...string) error {
		out, err := run(ctx, repo, args...)
		if err != nil {
			return err
		}
		for _, line := range strings.Split(out, "\n") {
			add, del, p, ok := parseNumstat(line)
			if !ok {
				continue
			}
			s := stats[p]
			s.Added += add
			s.Removed += del
			stats[p] = s
		}
		return nil
	}
	if err := collect("diff", "--numstat", "--no-renames", "--no-ext-diff"); err != nil {
		return nil, err
	}
	if HasCommit(ctx, repo, "HEAD") {
		if err := collect("diff", "--cached", "--numstat", "--no-renames", "--no-ext-diff"); err != nil {
			return nil, err
		}
	}
	// Untracked files never appear in a diff, but every line in one is an
	// addition — counting them keeps a new file's row from reading "+0".
	out, err := run(ctx, repo, "ls-files", "--others", "--exclude-standard")
	if err != nil {
		return stats, nil // the diffs already succeeded; don't fail the whole call
	}
	for _, line := range strings.Split(out, "\n") {
		p := filepath.ToSlash(strings.TrimSpace(line))
		if p == "" {
			continue
		}
		if _, ok := stats[p]; ok {
			continue
		}
		if n, ok := countLines(repo, p); ok {
			stats[p] = LineStat{Added: n}
		}
	}
	return stats, nil
}

// Upstream reports the tracking branch and how far HEAD is ahead of and behind
// it. A branch with no upstream is a normal state, not an error: it reports an
// empty name and zero counts.
func Upstream(ctx context.Context, repo string) (name string, ahead, behind int) {
	out, err := run(ctx, repo, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}")
	if err != nil {
		return "", 0, 0
	}
	name = strings.TrimSpace(out)
	if name == "" {
		return "", 0, 0
	}
	counts, err := run(ctx, repo, "rev-list", "--left-right", "--count", "HEAD..."+name)
	if err != nil {
		return name, 0, 0
	}
	// "<ahead>\t<behind>" — left-hand commits are HEAD's, right-hand the
	// upstream's.
	fields := strings.Fields(counts)
	if len(fields) == 2 {
		ahead, _ = strconv.Atoi(fields[0])
		behind, _ = strconv.Atoi(fields[1])
	}
	return name, ahead, behind
}

// parseNumstat reads one "added\tremoved\tpath" row. Binary files report "-"
// for both counts and are skipped — there are no lines to report.
func parseNumstat(line string) (add, del int, p string, ok bool) {
	parts := strings.SplitN(strings.TrimSpace(line), "\t", 3)
	if len(parts) != 3 {
		return 0, 0, "", false
	}
	if parts[0] == "-" || parts[1] == "-" {
		return 0, 0, "", false
	}
	add, err := strconv.Atoi(parts[0])
	if err != nil {
		return 0, 0, "", false
	}
	del, err = strconv.Atoi(parts[1])
	if err != nil {
		return 0, 0, "", false
	}
	p = filepath.ToSlash(strings.TrimSpace(parts[2]))
	if p == "" {
		return 0, 0, "", false
	}
	return add, del, p, true
}

// isUntracked reports whether p exists in the working tree but not the index.
func isUntracked(repo, p string) bool {
	out, err := run(context.Background(), repo, "ls-files", "--error-unmatch", "--", p)
	return err != nil || strings.TrimSpace(out) == ""
}

// untrackedDiff synthesises the unified diff for a file git has never seen:
// every line is an addition against /dev/null.
func untrackedDiff(repo, p string, maxBytes int) string {
	body, err := readCapped(repo, p)
	if err != nil {
		return ""
	}
	if bytes.IndexByte(body, 0) >= 0 {
		return fmt.Sprintf("diff --git a/%s b/%s\nnew file\nBinary file %s differs\n", p, p, p)
	}
	lines := splitLines(string(body))
	var b strings.Builder
	fmt.Fprintf(&b, "diff --git a/%s b/%s\nnew file mode 100644\n--- /dev/null\n+++ b/%s\n@@ -0,0 +1,%d @@\n",
		p, p, p, len(lines))
	for _, l := range lines {
		b.WriteString("+")
		b.WriteString(l)
		b.WriteString("\n")
	}
	out := b.String()
	if maxBytes > 0 && len(out) > maxBytes {
		out = out[:maxBytes] + "\n… [diff truncated]"
	}
	return out
}

// countLines returns the line count of an untracked file, and false for one
// that is binary, unreadable, or past the size cap.
func countLines(repo, p string) (int, bool) {
	body, err := readCapped(repo, p)
	if err != nil || bytes.IndexByte(body, 0) >= 0 {
		return 0, false
	}
	if len(body) == 0 {
		return 0, true
	}
	return len(splitLines(string(body))), true
}

// readCapped reads at most maxUntrackedStat bytes of a repo-relative path.
func readCapped(repo, p string) ([]byte, error) {
	f, err := os.Open(filepath.Join(repo, filepath.FromSlash(p)))
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return io.ReadAll(io.LimitReader(f, maxUntrackedStat))
}

// splitLines splits on \n and drops the empty tail a trailing newline leaves,
// so a file ending in a newline is not counted as having one extra blank line.
func splitLines(s string) []string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	lines := strings.Split(s, "\n")
	if n := len(lines); n > 0 && lines[n-1] == "" {
		lines = lines[:n-1]
	}
	return lines
}
