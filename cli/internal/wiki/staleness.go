package wiki

import (
	"context"
	"fmt"

	"kaioken/internal/gitx"
)

// Staleness reports how many commits HEAD has moved past the commit a
// generated wiki reflects. ok is false when there is nothing to compare: no
// stamp recorded yet, no git repo, or the stamped commit no longer resolves
// (rebased history, or a different clone).
func Staleness(repo string) (commits int, ok bool) {
	if !gitx.IsRepo(repo) {
		return 0, false
	}
	stamp := LoadStamp(repo)
	if stamp.Commit == "" {
		return 0, false
	}
	ctx := context.Background()
	if !gitx.HasCommit(ctx, repo, stamp.Commit) {
		return 0, false
	}
	n, err := gitx.CommitsBehind(ctx, repo, stamp.Commit)
	if err != nil {
		return 0, false
	}
	return n, true
}

// StalenessNote renders Staleness for display, or "" when the wiki is current
// or there is nothing to compare against.
func StalenessNote(repo string) string {
	n, ok := Staleness(repo)
	if !ok || n == 0 {
		return ""
	}
	plural := "s"
	if n == 1 {
		plural = ""
	}
	return fmt.Sprintf("generated %d commit%s ago; may be stale", n, plural)
}
