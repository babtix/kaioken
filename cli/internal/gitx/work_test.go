package gitx

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// statusOf indexes Status by path so a test can assert on one file without
// caring where git ordered it.
func statusOf(t *testing.T, repo string) map[string]FileStatus {
	t.Helper()
	list, err := Status(repo)
	if err != nil {
		t.Fatalf("Status: %v", err)
	}
	byPath := make(map[string]FileStatus, len(list))
	for _, s := range list {
		byPath[s.Path] = s
	}
	return byPath
}

func TestStageAndUnstageRoundTrip(t *testing.T) {
	repo, _ := newRepo(t)
	ctx := context.Background()
	write(t, repo, "a.go", "package a\n// edited\n")

	if err := Stage(ctx, repo, []string{"a.go"}); err != nil {
		t.Fatalf("Stage: %v", err)
	}
	if got := statusOf(t, repo)["a.go"]; !got.Staged || got.Unstaged {
		t.Errorf("after Stage: staged=%v unstaged=%v, want staged only", got.Staged, got.Unstaged)
	}

	if err := Unstage(ctx, repo, []string{"a.go"}); err != nil {
		t.Fatalf("Unstage: %v", err)
	}
	if got := statusOf(t, repo)["a.go"]; got.Staged || !got.Unstaged {
		t.Errorf("after Unstage: staged=%v unstaged=%v, want unstaged only", got.Staged, got.Unstaged)
	}
}

func TestStageUntrackedThenUnstageOnUnbornBranch(t *testing.T) {
	repo, _ := newRepo(t)
	ctx := context.Background()

	// A fresh repo with no commit at all: `git reset HEAD` has nothing to
	// reset against, so Unstage has to fall back to dropping the index entry.
	unborn := t.TempDir()
	if _, err := run(ctx, unborn, "init", "-q"); err != nil {
		t.Skipf("git init: %v", err)
	}
	write(t, unborn, "new.go", "package new\n")
	if err := Stage(ctx, unborn, []string{"new.go"}); err != nil {
		t.Fatalf("Stage on unborn branch: %v", err)
	}
	if got := statusOf(t, unborn)["new.go"]; !got.Staged {
		t.Errorf("after Stage on unborn branch: staged=%v, want true", got.Staged)
	}
	if err := Unstage(ctx, unborn, []string{"new.go"}); err != nil {
		t.Fatalf("Unstage on unborn branch: %v", err)
	}
	if got := statusOf(t, unborn)["new.go"]; got.Kind != "untracked" {
		t.Errorf("after Unstage on unborn branch: kind=%q, want untracked", got.Kind)
	}

	// Unstaging something that was never staged is a no-op, not an error —
	// a checkbox toggling off twice must not fail.
	write(t, repo, "loose.go", "package loose\n")
	if err := Unstage(ctx, repo, []string{"loose.go"}); err != nil {
		t.Errorf("Unstage of an unstaged path: %v", err)
	}
}

func TestStageRejectsEmptyPathList(t *testing.T) {
	repo, _ := newRepo(t)
	ctx := context.Background()
	for name, fn := range map[string]func() error{
		"Stage":   func() error { return Stage(ctx, repo, nil) },
		"Unstage": func() error { return Unstage(ctx, repo, nil) },
		"Discard": func() error { return Discard(ctx, repo, nil) },
	} {
		if err := fn(); err != ErrNoPaths {
			t.Errorf("%s(nil) = %v, want ErrNoPaths", name, err)
		}
	}
}

func TestDiscardRestoresTrackedAndDeletesUntracked(t *testing.T) {
	repo, _ := newRepo(t)
	ctx := context.Background()

	write(t, repo, "a.go", "package a\n// unwanted\n")
	write(t, repo, "junk.go", "package junk\n")
	// b.go is staged before discarding, to prove Discard clears the index too.
	write(t, repo, "b.go", "package b\n// unwanted\n")
	if err := Stage(ctx, repo, []string{"b.go"}); err != nil {
		t.Fatalf("Stage: %v", err)
	}

	if err := Discard(ctx, repo, []string{"a.go", "b.go", "junk.go"}); err != nil {
		t.Fatalf("Discard: %v", err)
	}

	body, err := os.ReadFile(filepath.Join(repo, "a.go"))
	if err != nil {
		t.Fatalf("read a.go: %v", err)
	}
	// Normalise line endings: a checkout on Windows honours core.autocrlf, so
	// the restored file legitimately comes back with CRLF.
	if got := strings.ReplaceAll(string(body), "\r\n", "\n"); got != "package a\n" {
		t.Errorf("a.go = %q, want the committed content back", got)
	}
	if _, err := os.Stat(filepath.Join(repo, "junk.go")); !os.IsNotExist(err) {
		t.Errorf("junk.go still exists; untracked files should be deleted")
	}
	if left := statusOf(t, repo); len(left) != 0 {
		t.Errorf("working tree not clean after Discard: %v", left)
	}
}

func TestDiscardDeletesStagedAddition(t *testing.T) {
	repo, _ := newRepo(t)
	ctx := context.Background()

	// A staged addition has an index entry but no HEAD version — discarding it
	// must delete the file rather than "restore" it from the very index entry
	// being thrown away.
	write(t, repo, "added.go", "package added\n")
	if err := Stage(ctx, repo, []string{"added.go"}); err != nil {
		t.Fatalf("Stage: %v", err)
	}
	if err := Discard(ctx, repo, []string{"added.go"}); err != nil {
		t.Fatalf("Discard: %v", err)
	}
	if _, err := os.Stat(filepath.Join(repo, "added.go")); !os.IsNotExist(err) {
		t.Errorf("added.go still exists after discarding a staged addition")
	}
}

func TestCommitRecordsIndexAndReturnsSHA(t *testing.T) {
	repo, head := newRepo(t)
	ctx := context.Background()

	write(t, repo, "a.go", "package a\n// v2\n")
	if err := Stage(ctx, repo, []string{"a.go"}); err != nil {
		t.Fatalf("Stage: %v", err)
	}
	sha, err := Commit(ctx, repo, "edit a", false)
	if err != nil {
		t.Fatalf("Commit: %v", err)
	}
	if sha == "" || sha == head {
		t.Errorf("Commit returned %q, want a new SHA (head was %q)", sha, head)
	}
	if left := statusOf(t, repo); len(left) != 0 {
		t.Errorf("working tree not clean after Commit: %v", left)
	}
	subjects, err := Subjects(ctx, repo, head, 5)
	if err != nil {
		t.Fatalf("Subjects: %v", err)
	}
	if len(subjects) != 1 || !strings.Contains(subjects[0], "edit a") {
		t.Errorf("Subjects = %v, want one entry mentioning \"edit a\"", subjects)
	}
}

func TestCommitRejectsBlankMessage(t *testing.T) {
	repo, _ := newRepo(t)
	if _, err := Commit(context.Background(), repo, "   \n\t ", false); err == nil {
		t.Error("Commit with a whitespace-only message should fail")
	}
}

func TestFileDiffCoversStagedUnstagedAndUntracked(t *testing.T) {
	repo, _ := newRepo(t)
	ctx := context.Background()

	write(t, repo, "a.go", "package a\n// unstaged\n")
	unstaged, err := FileDiff(ctx, repo, "a.go", false, 0)
	if err != nil {
		t.Fatalf("FileDiff unstaged: %v", err)
	}
	if !strings.Contains(unstaged, "+// unstaged") {
		t.Errorf("unstaged diff missing the added line:\n%s", unstaged)
	}

	if err := Stage(ctx, repo, []string{"a.go"}); err != nil {
		t.Fatalf("Stage: %v", err)
	}
	staged, err := FileDiff(ctx, repo, "a.go", true, 0)
	if err != nil {
		t.Fatalf("FileDiff staged: %v", err)
	}
	if !strings.Contains(staged, "+// unstaged") {
		t.Errorf("staged diff missing the added line:\n%s", staged)
	}

	// An untracked file has no git-side diff at all; the synthesised one has to
	// carry a /dev/null header so a unified-diff renderer accepts it.
	write(t, repo, "fresh.go", "package fresh\nfunc F() {}\n")
	fresh, err := FileDiff(ctx, repo, "fresh.go", false, 0)
	if err != nil {
		t.Fatalf("FileDiff untracked: %v", err)
	}
	for _, want := range []string{"--- /dev/null", "+++ b/fresh.go", "@@ -0,0 +1,2 @@", "+func F() {}"} {
		if !strings.Contains(fresh, want) {
			t.Errorf("untracked diff missing %q:\n%s", want, fresh)
		}
	}
}

func TestFileDiffTruncates(t *testing.T) {
	repo, _ := newRepo(t)
	write(t, repo, "big.go", strings.Repeat("// filler\n", 500))
	out, err := FileDiff(context.Background(), repo, "big.go", false, 200)
	if err != nil {
		t.Fatalf("FileDiff: %v", err)
	}
	if !strings.HasSuffix(out, "[diff truncated]") {
		t.Errorf("expected a truncation marker, got %d bytes ending %q", len(out), tail(out, 40))
	}
}

func TestLineStatsSumsStagedUnstagedAndUntracked(t *testing.T) {
	repo, _ := newRepo(t)
	ctx := context.Background()

	// a.go: one staged addition, then one more unstaged on top. The panel wants
	// the file's total delta, not whichever half it happens to look at.
	write(t, repo, "a.go", "package a\n// one\n")
	if err := Stage(ctx, repo, []string{"a.go"}); err != nil {
		t.Fatalf("Stage: %v", err)
	}
	write(t, repo, "a.go", "package a\n// one\n// two\n")
	write(t, repo, "fresh.go", "package fresh\nfunc F() {}\nfunc G() {}\n")

	stats, err := LineStats(ctx, repo)
	if err != nil {
		t.Fatalf("LineStats: %v", err)
	}
	if got := stats["a.go"]; got.Added != 2 || got.Removed != 0 {
		t.Errorf("a.go stats = %+v, want {Added:2 Removed:0}", got)
	}
	if got := stats["fresh.go"]; got.Added != 3 {
		t.Errorf("fresh.go stats = %+v, want Added:3 for an untracked file", got)
	}
}

func TestLineStatsSkipsBinary(t *testing.T) {
	repo, _ := newRepo(t)
	if err := os.WriteFile(filepath.Join(repo, "blob.bin"), []byte{0x00, 0x01, 0x02, 0x00}, 0o644); err != nil {
		t.Fatal(err)
	}
	stats, err := LineStats(context.Background(), repo)
	if err != nil {
		t.Fatalf("LineStats: %v", err)
	}
	if _, ok := stats["blob.bin"]; ok {
		t.Errorf("binary file got a line stat: %+v", stats["blob.bin"])
	}
}

func TestUpstreamReportsAheadBehind(t *testing.T) {
	repo, _ := newRepo(t)
	ctx := context.Background()

	// No upstream configured is a normal state, reported as empty/zero.
	if name, ahead, behind := Upstream(ctx, repo); name != "" || ahead != 0 || behind != 0 {
		t.Errorf("Upstream with no tracking branch = (%q, %d, %d), want (\"\", 0, 0)", name, ahead, behind)
	}

	// Clone so the clone has a real upstream, then commit locally to go ahead.
	clone := filepath.Join(t.TempDir(), "clone")
	if _, err := run(ctx, ".", "clone", "-q", repo, clone); err != nil {
		t.Skipf("git clone: %v", err)
	}
	if _, err := run(ctx, clone, "config", "user.email", "k@example.com"); err != nil {
		t.Fatal(err)
	}
	if _, err := run(ctx, clone, "config", "user.name", "k"); err != nil {
		t.Fatal(err)
	}
	write(t, clone, "c.go", "package c\n")
	if err := Stage(ctx, clone, []string{"c.go"}); err != nil {
		t.Fatalf("Stage: %v", err)
	}
	if _, err := Commit(ctx, clone, "add c", false); err != nil {
		t.Fatalf("Commit: %v", err)
	}

	name, ahead, behind := Upstream(ctx, clone)
	if name == "" {
		t.Fatal("clone reported no upstream")
	}
	if ahead != 1 || behind != 0 {
		t.Errorf("Upstream = (%q, ahead=%d, behind=%d), want ahead=1 behind=0", name, ahead, behind)
	}
}

func tail(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[len(s)-n:]
}
