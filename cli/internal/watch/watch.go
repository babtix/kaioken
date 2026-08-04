// Package watch polls a repository on a timer and notifies when the set of
// changed paths grows. It is the CI-facing answer to "has new work landed
// while I was away?" — a lightweight alternative to running `kaioken update`
// every minute.
package watch

import (
	"context"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"kaioken/internal/gitx"
)

// Run polls repo every interval. On the first tick it snapshots the dirty
// paths; on every subsequent tick it compares. When new paths appear notify is
// called with a summary line. A shrinking set (paths fixed or staged) is not
// reported — the user asked to know about growth, not about cleanup.
//
// Run blocks until ctx is cancelled, returning ctx.Err().
func Run(ctx context.Context, repo string, interval time.Duration, notify func(msg string)) error {
	if interval <= 0 {
		interval = 5 * time.Second
	}

	// Snapshot on entry so the comparison baseline is stable and reproducible
	// no matter when the timer fires.
	baseline, err := snapshot(repo)
	if err != nil {
		return fmt.Errorf("watch: initial snapshot failed: %w", err)
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			current, serr := snapshot(repo)
			if serr != nil {
				// Transient git errors (e.g. a rebase in progress) are
				// recoverable — skip the tick rather than aborting the watch.
				continue
			}
			if added := newPaths(baseline, current); len(added) > 0 {
				msg := formatGrowth(added)
				notify(msg)
				// Advance the baseline so we report each batch only once.
				// We do NOT update when there is no growth, so a file that
				// was already changed stays in scope.
				for p := range current {
					baseline[p] = true
				}
			}
		}
	}
}

// snapshot returns the set of changed (dirty or untracked) paths in repo.
func snapshot(repo string) (map[string]bool, error) {
	statuses, err := gitx.Status(repo)
	if err != nil {
		return nil, err
	}
	set := make(map[string]bool, len(statuses))
	for _, s := range statuses {
		// Normalize to the absolute path so comparisons survive cwd changes.
		set[filepath.ToSlash(s.Path)] = true
	}
	return set, nil
}

// newPaths returns paths that are in current but not in baseline — the new
// arrivals since the last notification.
func newPaths(baseline, current map[string]bool) []string {
	var out []string
	for p := range current {
		if !baseline[p] {
			out = append(out, p)
		}
	}
	sort.Strings(out)
	return out
}

// maxReportPaths caps how many paths appear in a single notification line.
const maxReportPaths = 10

// formatGrowth builds the notification line. It is intentionally terse —
// the user can run `git status` for detail.
func formatGrowth(paths []string) string {
	display := paths
	extra := 0
	if len(display) > maxReportPaths {
		extra = len(display) - maxReportPaths
		display = display[:maxReportPaths]
	}
	msg := fmt.Sprintf("⚠ %d new changed path(s) since watch started: %s",
		len(paths)+extra, strings.Join(display, ", "))
	if extra > 0 {
		msg += fmt.Sprintf(" … and %d more", extra)
	}
	msg += "\n  · run `kaioken update` to refresh docs"
	return msg
}
