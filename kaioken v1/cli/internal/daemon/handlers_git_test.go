package daemon

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/config"
)

// gitStatusJSON mirrors the full §2.4 status body, including the line counts
// and tracking position the source-control panel renders.
type gitStatusJSON struct {
	IsRepo      bool   `json:"is_repo"`
	Branch      string `json:"branch"`
	Upstream    string `json:"upstream"`
	Ahead       int    `json:"ahead"`
	Behind      int    `json:"behind"`
	DirtyCount  int    `json:"dirty_count"`
	StagedCount int    `json:"staged_count"`
	Changes     []struct {
		Path     string `json:"path"`
		Kind     string `json:"kind"`
		Staged   bool   `json:"staged"`
		Unstaged bool   `json:"unstaged"`
		Added    int    `json:"added"`
		Removed  int    `json:"removed"`
	} `json:"changes"`
	Commit *struct {
		SHA   string `json:"sha"`
		Short string `json:"short"`
	} `json:"commit"`
}

func (g gitStatusJSON) byPath(p string) (int, bool) {
	for i, c := range g.Changes {
		if c.Path == p {
			return i, true
		}
	}
	return 0, false
}

// gitRepoWorkspace creates a git repo with one commit, opens it as a workspace
// and returns (workspaceID, repoPath). Skips when git is unavailable.
func gitRepoWorkspace(t *testing.T, serverURL, auth string) (string, string) {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not on PATH")
	}
	repo := filepath.Join(t.TempDir(), "gitops")
	if err := os.MkdirAll(repo, 0o755); err != nil {
		t.Fatal(err)
	}
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
	git("config", "commit.gpgsign", "false")
	writeRepoFile(t, repo, "committed.go", "package main\n")
	git("add", ".")
	git("commit", "-qm", "initial")

	resp := doPost(t, serverURL+"/v1/workspaces", auth, pathBody(repo))
	var ws workspaceJSON
	decodeJSON(t, resp, &ws)
	return ws.ID, repo
}

func writeRepoFile(t *testing.T, repo, rel, body string) {
	t.Helper()
	full := filepath.Join(repo, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

// TestGitStageUnstageEndpoints covers the staging round trip and the contract
// that each mutation answers with the refreshed status.
func TestGitStageUnstageEndpoints(t *testing.T) {
	t.Setenv(config.HomeEnv, t.TempDir())
	ts := newTestServer(t, nil)
	auth := "Bearer " + testToken
	id, repo := gitRepoWorkspace(t, ts.URL, auth)

	writeRepoFile(t, repo, "committed.go", "package main\n\nfunc New() {}\n")

	resp := doPost(t, ts.URL+"/v1/workspaces/"+id+"/git/stage", auth, `{"paths":["committed.go"]}`)
	if resp.StatusCode != 200 {
		t.Fatalf("git/stage: status %d", resp.StatusCode)
	}
	var staged gitStatusJSON
	decodeJSON(t, resp, &staged)
	i, ok := staged.byPath("committed.go")
	if !ok {
		t.Fatalf("committed.go missing from the response: %+v", staged.Changes)
	}
	if !staged.Changes[i].Staged || staged.Changes[i].Unstaged {
		t.Errorf("after stage: %+v, want staged only", staged.Changes[i])
	}
	if staged.StagedCount != 1 {
		t.Errorf("staged_count = %d, want 1", staged.StagedCount)
	}
	if staged.Changes[i].Added != 2 {
		t.Errorf("added = %d, want 2 line counts in the payload", staged.Changes[i].Added)
	}

	resp = doPost(t, ts.URL+"/v1/workspaces/"+id+"/git/unstage", auth, `{"paths":["committed.go"]}`)
	if resp.StatusCode != 200 {
		t.Fatalf("git/unstage: status %d", resp.StatusCode)
	}
	var unstaged gitStatusJSON
	decodeJSON(t, resp, &unstaged)
	i, ok = unstaged.byPath("committed.go")
	if !ok {
		t.Fatalf("committed.go missing after unstage: %+v", unstaged.Changes)
	}
	if unstaged.Changes[i].Staged || !unstaged.Changes[i].Unstaged {
		t.Errorf("after unstage: %+v, want unstaged only", unstaged.Changes[i])
	}
	if unstaged.StagedCount != 0 {
		t.Errorf("staged_count = %d, want 0", unstaged.StagedCount)
	}
}

// TestGitCommitEndpoint covers a successful commit and the 409 a commit with
// nothing staged produces.
func TestGitCommitEndpoint(t *testing.T) {
	t.Setenv(config.HomeEnv, t.TempDir())
	ts := newTestServer(t, nil)
	auth := "Bearer " + testToken
	id, repo := gitRepoWorkspace(t, ts.URL, auth)

	// Nothing staged yet — git refuses, and that surfaces as a conflict rather
	// than a 500 or a silent success.
	resp := doPost(t, ts.URL+"/v1/workspaces/"+id+"/git/commit", auth, `{"message":"nothing here"}`)
	if resp.StatusCode != 409 {
		t.Errorf("commit with an empty index: status %d, want 409", resp.StatusCode)
	}

	writeRepoFile(t, repo, "committed.go", "package main\n\nfunc New() {}\n")
	doPost(t, ts.URL+"/v1/workspaces/"+id+"/git/stage", auth, `{"paths":["committed.go"]}`)

	resp = doPost(t, ts.URL+"/v1/workspaces/"+id+"/git/commit", auth, `{"message":"add New"}`)
	if resp.StatusCode != 200 {
		t.Fatalf("git/commit: status %d", resp.StatusCode)
	}
	var after gitStatusJSON
	decodeJSON(t, resp, &after)
	if after.Commit == nil || after.Commit.SHA == "" {
		t.Errorf("commit response missing the new SHA: %+v", after.Commit)
	}
	if after.DirtyCount != 0 {
		t.Errorf("dirty_count = %d after committing everything, want 0", after.DirtyCount)
	}
}

func TestGitCommitRejectsBlankMessage(t *testing.T) {
	t.Setenv(config.HomeEnv, t.TempDir())
	ts := newTestServer(t, nil)
	auth := "Bearer " + testToken
	id, _ := gitRepoWorkspace(t, ts.URL, auth)

	resp := doPost(t, ts.URL+"/v1/workspaces/"+id+"/git/commit", auth, `{"message":"   "}`)
	if resp.StatusCode != 400 {
		t.Errorf("blank commit message: status %d, want 400", resp.StatusCode)
	}
}

// TestGitDiscardEndpoint covers the destructive path: a modified file is
// restored and an untracked one is deleted.
func TestGitDiscardEndpoint(t *testing.T) {
	t.Setenv(config.HomeEnv, t.TempDir())
	ts := newTestServer(t, nil)
	auth := "Bearer " + testToken
	id, repo := gitRepoWorkspace(t, ts.URL, auth)

	writeRepoFile(t, repo, "committed.go", "package main\n// unwanted\n")
	writeRepoFile(t, repo, "junk.txt", "scratch\n")

	resp := doPost(t, ts.URL+"/v1/workspaces/"+id+"/git/discard", auth,
		`{"paths":["committed.go","junk.txt"]}`)
	if resp.StatusCode != 200 {
		t.Fatalf("git/discard: status %d", resp.StatusCode)
	}
	var after gitStatusJSON
	decodeJSON(t, resp, &after)
	if after.DirtyCount != 0 {
		t.Errorf("dirty_count = %d after discarding everything, want 0", after.DirtyCount)
	}
	if _, err := os.Stat(filepath.Join(repo, "junk.txt")); !os.IsNotExist(err) {
		t.Error("junk.txt survived a discard; untracked files should be deleted")
	}
}

// TestGitDiffEndpoint covers tracked and untracked diffs plus the staged flag.
func TestGitDiffEndpoint(t *testing.T) {
	t.Setenv(config.HomeEnv, t.TempDir())
	ts := newTestServer(t, nil)
	auth := "Bearer " + testToken
	id, repo := gitRepoWorkspace(t, ts.URL, auth)

	writeRepoFile(t, repo, "committed.go", "package main\n\nfunc New() {}\n")
	writeRepoFile(t, repo, "fresh.go", "package fresh\n")

	var diffResp struct {
		Path      string `json:"path"`
		Staged    bool   `json:"staged"`
		Diff      string `json:"diff"`
		Truncated bool   `json:"truncated"`
	}
	resp := doGet(t, ts.URL+"/v1/workspaces/"+id+"/git/diff?path=committed.go", auth)
	if resp.StatusCode != 200 {
		t.Fatalf("git/diff: status %d", resp.StatusCode)
	}
	decodeJSON(t, resp, &diffResp)
	if !strings.Contains(diffResp.Diff, "+func New() {}") {
		t.Errorf("tracked diff missing the added line:\n%s", diffResp.Diff)
	}

	resp = doGet(t, ts.URL+"/v1/workspaces/"+id+"/git/diff?path=fresh.go", auth)
	decodeJSON(t, resp, &diffResp)
	if !strings.Contains(diffResp.Diff, "--- /dev/null") {
		t.Errorf("untracked diff should be synthesised against /dev/null:\n%s", diffResp.Diff)
	}
}

// TestGitPathTraversalRejected is the security case: a path outside the
// workspace must never reach git, on any of the path-taking routes.
func TestGitPathTraversalRejected(t *testing.T) {
	t.Setenv(config.HomeEnv, t.TempDir())
	ts := newTestServer(t, nil)
	auth := "Bearer " + testToken
	id, _ := gitRepoWorkspace(t, ts.URL, auth)

	for _, route := range []string{"stage", "unstage", "discard"} {
		resp := doPost(t, ts.URL+"/v1/workspaces/"+id+"/git/"+route, auth,
			`{"paths":["../../etc/passwd"]}`)
		if resp.StatusCode != 400 {
			t.Errorf("git/%s with a traversing path: status %d, want 400", route, resp.StatusCode)
		}
	}
	resp := doGet(t, ts.URL+"/v1/workspaces/"+id+"/git/diff?path=../../etc/passwd", auth)
	if resp.StatusCode != 400 {
		t.Errorf("git/diff with a traversing path: status %d, want 400", resp.StatusCode)
	}
}

// TestGitEmptyPathListRejected guards the footgun: an empty list must not fall
// through to git's "apply to everything" default.
func TestGitEmptyPathListRejected(t *testing.T) {
	t.Setenv(config.HomeEnv, t.TempDir())
	ts := newTestServer(t, nil)
	auth := "Bearer " + testToken
	id, repo := gitRepoWorkspace(t, ts.URL, auth)
	writeRepoFile(t, repo, "committed.go", "package main\n// keep me\n")

	for _, route := range []string{"stage", "unstage", "discard"} {
		resp := doPost(t, ts.URL+"/v1/workspaces/"+id+"/git/"+route, auth, `{"paths":[]}`)
		if resp.StatusCode != 400 {
			t.Errorf("git/%s with no paths: status %d, want 400", route, resp.StatusCode)
		}
	}
	// The edit must still be there — none of those calls touched anything.
	body, err := os.ReadFile(filepath.Join(repo, "committed.go"))
	if err != nil || !strings.Contains(string(body), "keep me") {
		t.Errorf("committed.go was modified by a no-op request: %q (%v)", body, err)
	}
}

// TestGitOpsOnNonRepo confirms the mutating routes refuse a plain directory
// rather than shelling out to git and returning its raw failure.
func TestGitOpsOnNonRepo(t *testing.T) {
	t.Setenv(config.HomeEnv, t.TempDir())
	ts := newTestServer(t, nil)
	auth := "Bearer " + testToken

	resp := doPost(t, ts.URL+"/v1/workspaces", auth, pathBody(t.TempDir()))
	var ws workspaceJSON
	decodeJSON(t, resp, &ws)

	resp = doPost(t, ts.URL+"/v1/workspaces/"+ws.ID+"/git/stage", auth, `{"paths":["a.go"]}`)
	if resp.StatusCode != 400 {
		t.Errorf("stage on a non-repo: status %d, want 400", resp.StatusCode)
	}
	resp = doPost(t, ts.URL+"/v1/workspaces/"+ws.ID+"/git/commit", auth, `{"message":"x"}`)
	if resp.StatusCode != 400 {
		t.Errorf("commit on a non-repo: status %d, want 400", resp.StatusCode)
	}
}
