package agent

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/llm"
)

// newGitRepo creates a throwaway git repository with one commit and returns
// its path. It skips the test when git is unavailable.
func newGitRepo(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not on PATH")
	}
	repo := t.TempDir()
	git := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", append([]string{"-C", repo}, args...)...)
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=k", "GIT_AUTHOR_EMAIL=k@example.com",
			"GIT_COMMITTER_NAME=k", "GIT_COMMITTER_EMAIL=k@example.com")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
		}
	}
	git("init", "-q")
	git("config", "user.email", "k@example.com")
	git("config", "user.name", "k")
	if err := os.WriteFile(filepath.Join(repo, "readme.txt"), []byte("hello\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	git("add", ".")
	git("commit", "-qm", "initial")
	return repo
}

// delegateAgent builds an Agent wired to a scripted HTTP server and rooted at
// a real git repository.
func delegateAgent(t *testing.T, srv *httptest.Server, approve bool) *Agent {
	t.Helper()
	repo := newGitRepo(t)
	client, err := llm.NewForProvider("openai", srv.URL, "test-model", "test-key")
	if err != nil {
		t.Fatal(err)
	}
	return &Agent{
		Client:   client,
		Root:     repo,
		UI:       fakeUI{approve: approve},
		NoStream: true,
		MaxSteps: 10,
		AllowRun: true,
	}
}

// TestDelegateAbsentAtDepth1 checks that the delegate tool is not offered to a
// sub-agent (Depth ≥ 1), preventing infinite nesting.
func TestDelegateAbsentAtDepth1(t *testing.T) {
	a := &Agent{Depth: 1}
	for _, tool := range a.Tools() {
		if tool.Function.Name == "delegate" {
			t.Error("delegate tool must not appear at Depth 1")
		}
	}
}

// TestDelegateAbsentInReadOnlyMode checks that the delegate tool is not offered
// when the agent cannot write — a read-only delegate has nothing extra to offer.
func TestDelegateAbsentInReadOnlyMode(t *testing.T) {
	for _, mode := range []Mode{ModePlan, ModeExplore, ModeReview, ModePrism} {
		a := &Agent{Depth: 0, Mode: mode}
		for _, tool := range a.Tools() {
			if tool.Function.Name == "delegate" {
				t.Errorf("delegate tool must not appear in mode %q", mode)
			}
		}
	}
}

// TestDelegatePresentInBuildMode verifies the tool is offered at Depth 0
// in a write-enabled mode.
func TestDelegatePresentInBuildMode(t *testing.T) {
	a := &Agent{Depth: 0, Mode: ModeBuild}
	found := false
	for _, tool := range a.Tools() {
		if tool.Function.Name == "delegate" {
			found = true
		}
	}
	if !found {
		t.Error("delegate tool must be present at Depth 0 in ModeBuild")
	}
}

// TestDelegateRefuseFirstApproval checks that when the user declines the spawn
// prompt no worktree is created and the error message is returned.
func TestDelegateRefuseFirstApproval(t *testing.T) {
	script := &scriptedServer{} // no replies needed — approval blocks first
	srv := script.server(t)
	defer srv.Close()

	a := delegateAgent(t, srv, false /* user declines */)
	result := a.runDelegate(context.Background(), "test task", "do something")
	if !strings.Contains(result, "declined") {
		t.Errorf("expected a declined message, got %q", result)
	}
	// No model call should have been made.
	if n := script.requestCount(); n != 0 {
		t.Errorf("expected 0 model calls, got %d", n)
	}
}

// TestDelegateEmptyPromptReturnsError checks that a blank prompt is rejected
// immediately without hitting the network or git.
func TestDelegateEmptyPromptReturnsError(t *testing.T) {
	a := &Agent{Root: ".", UI: fakeUI{approve: true}}
	result := a.runDelegate(context.Background(), "", "   ")
	if !strings.Contains(result, "error") {
		t.Errorf("expected an error for an empty prompt, got %q", result)
	}
}

// TestDelegateNonRepoReturnsError checks that pointing the agent at a plain
// directory produces a clear error.
func TestDelegateNonRepoReturnsError(t *testing.T) {
	a := &Agent{Root: t.TempDir(), UI: fakeUI{approve: true}}
	result := a.runDelegate(context.Background(), "lbl", "do something")
	if !strings.Contains(result, "error") {
		t.Errorf("expected an error for a non-repo root, got %q", result)
	}
}

// TestDelegateFlowWriteFileLandsInMainRepo is the integration-level flow test:
// the scripted model calls write_file, then finishes. On the first approval
// (spawn) and second approval (apply diff) the UI says yes; we verify the file
// lands in the main (non-worktree) repo.
func TestDelegateFlowWriteFileLandsInMainRepo(t *testing.T) {
	writeArgs, _ := json.Marshal(map[string]string{
		"path":    "generated.txt",
		"content": "delegate wrote this\n",
	})
	script := &scriptedServer{replies: []map[string]any{
		toolCallReply("write_file", string(writeArgs)),
		finalReply("I wrote generated.txt with the requested content."),
	}}
	srv := script.server(t)
	defer srv.Close()

	a := delegateAgent(t, srv, true /* both approvals accepted */)
	result := a.runDelegate(context.Background(), "add file", "Write generated.txt")
	if strings.Contains(result, "error") {
		t.Fatalf("unexpected error in delegate result: %q", result)
	}
	// The file must appear in the main repo (a.Root), not just the worktree.
	content, err := os.ReadFile(filepath.Join(a.Root, "generated.txt"))
	if err != nil {
		t.Fatalf("generated.txt was not applied to the main repo: %v", err)
	}
	if !strings.Contains(string(content), "delegate wrote this") {
		t.Errorf("unexpected file content: %q", content)
	}
}

// TestDelegateRefuseSecondApproval ensures that when the user declines the
// apply-diff prompt the main repo is left untouched.
func TestDelegateRefuseSecondApproval(t *testing.T) {
	writeArgs, _ := json.Marshal(map[string]string{
		"path":    "secret.txt",
		"content": "should not appear\n",
	})
	script := &scriptedServer{replies: []map[string]any{
		toolCallReply("write_file", string(writeArgs)),
		finalReply("done"),
	}}
	srv := script.server(t)
	defer srv.Close()

	// Two-phase UI: accept the spawn, reject the diff.
	call := 0
	twoPhaseUI := &twoApprovalUI{results: []bool{true, false}}
	client, err := llm.NewForProvider("openai", srv.URL, "test-model", "test-key")
	if err != nil {
		t.Fatal(err)
	}
	_ = call
	repo := newGitRepo(t)
	a := &Agent{
		Client:   client,
		Root:     repo,
		UI:       twoPhaseUI,
		NoStream: true,
		MaxSteps: 10,
		AllowRun: true,
	}

	result := a.runDelegate(context.Background(), "add file", "Write secret.txt")
	if !strings.Contains(result, "declined") && !strings.Contains(result, "discarded") {
		t.Errorf("expected discarded message, got %q", result)
	}
	if _, err := os.Stat(filepath.Join(repo, "secret.txt")); !os.IsNotExist(err) {
		t.Error("secret.txt must not exist in main repo when the diff is rejected")
	}
}

// twoApprovalUI returns successive bools from a slice. Each Approve call
// consumes one entry; extras default to false.
type twoApprovalUI struct {
	fakeUI
	results []bool
	idx     int
}

func (u *twoApprovalUI) Approve(req ApprovalRequest) bool {
	// The write_file inside the worktree is itself an approval call —
	// we want to accept all writes but control only the spawn+apply prompts.
	// Keying on "worktree" and "apply" keeps the test deterministic.
	if strings.Contains(req.Target, "worktree") || strings.Contains(req.Target, "apply") {
		if u.idx >= len(u.results) {
			return false
		}
		r := u.results[u.idx]
		u.idx++
		return r
	}
	// In-worktree write_file approvals: always accept so the delegate can act.
	return true
}

// TestPatchFiles verifies the helper that extracts changed paths from a diff.
func TestPatchFiles(t *testing.T) {
	diff := `diff --git a/foo.go b/foo.go
index abc..def 100644
--- a/foo.go
+++ b/foo.go
@@ -1 +1 @@
-old
+new
diff --git a/bar.go b/bar.go
index 111..222 100644
--- a/bar.go
+++ b/bar.go
@@ -1 +1 @@
-x
+y
`
	paths := patchFiles(diff)
	if len(paths) != 2 {
		t.Fatalf("expected 2 paths, got %v", paths)
	}
	if paths[0] != "foo.go" || paths[1] != "bar.go" {
		t.Errorf("unexpected paths: %v", paths)
	}
}
