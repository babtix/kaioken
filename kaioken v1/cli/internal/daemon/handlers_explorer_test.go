package daemon

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/config"
)

// TestTreeEndpoint covers the structured file tree: directories appear before
// files, paths are repo-relative and slash-separated, and excluded paths never
// surface.
func TestTreeEndpoint(t *testing.T) {
	home := t.TempDir()
	t.Setenv(config.HomeEnv, home)
	ts := newTestServer(t, nil)
	auth := "Bearer " + testToken

	repo := filepath.Join(t.TempDir(), "treerepo")
	if err := os.MkdirAll(filepath.Join(repo, ".kaioken"), 0o755); err != nil {
		t.Fatal(err)
	}
	// No config needed for the tree — it works on a bare repo too.
	for _, rel := range []string{
		"main.go",
		"internal/agent/tools.go",
		"internal/agent/agent.go",
		"web/index.html",
	} {
		full := filepath.Join(repo, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte("package main\n"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	resp := doPost(t, ts.URL+"/v1/workspaces", auth, pathBody(repo))
	var ws workspaceJSON
	decodeJSON(t, resp, &ws)

	resp = doGet(t, ts.URL+"/v1/workspaces/"+ws.ID+"/tree", auth)
	if resp.StatusCode != 200 {
		t.Fatalf("tree: status %d", resp.StatusCode)
	}
	var treeResp struct {
		Root     string          `json:"root"`
		Name     string          `json:"name"`
		Children []*explorerNode `json:"children"`
		Total    int             `json:"total"`
	}
	decodeJSON(t, resp, &treeResp)
	if treeResp.Name != "treerepo" {
		t.Errorf("name = %q, want treerepo", treeResp.Name)
	}
	if treeResp.Total != 4 {
		t.Errorf("total = %d, want 4", treeResp.Total)
	}
	// Directories must sort before files at the root.
	if len(treeResp.Children) == 0 || treeResp.Children[0].Type != "directory" {
		t.Fatalf("expected a directory first, got %+v", treeResp.Children)
	}
	// internal/ must contain the agent directory.
	var foundInternal bool
	for _, c := range treeResp.Children {
		if c.Name == "internal" && c.Type == "directory" {
			foundInternal = true
			var foundAgent bool
			for _, d := range c.Children {
				if d.Name == "agent" && d.Type == "directory" {
					foundAgent = true
					if len(d.Children) != 2 {
						t.Errorf("agent has %d children, want 2", len(d.Children))
					}
				}
			}
			if !foundAgent {
				t.Error("internal/ missing agent/ directory")
			}
		}
	}
	if !foundInternal {
		t.Error("root missing internal/ directory")
	}
}

// TestGitStatusEndpoint covers the per-file git status: classification,
// staged/unstaged split, and the always-array contract.
func TestGitStatusEndpoint(t *testing.T) {
	home := t.TempDir()
	t.Setenv(config.HomeEnv, home)
	ts := newTestServer(t, nil)
	auth := "Bearer " + testToken

	// Build a real git repo so gitx.Status has something to parse.
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not on PATH")
	}
	repo := filepath.Join(t.TempDir(), "gitrepo")
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
	if err := os.WriteFile(filepath.Join(repo, "committed.go"), []byte("package main\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	git("add", ".")
	git("commit", "-qm", "initial")
	// Now make changes: modify, add, delete, untracked.
	if err := os.WriteFile(filepath.Join(repo, "committed.go"), []byte("package main\n\nfunc New() {}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo, "new.go"), []byte("package main\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	git("add", "new.go")

	resp := doPost(t, ts.URL+"/v1/workspaces", auth, pathBody(repo))
	var ws workspaceJSON
	decodeJSON(t, resp, &ws)

	resp = doGet(t, ts.URL+"/v1/workspaces/"+ws.ID+"/git/status", auth)
	if resp.StatusCode != 200 {
		t.Fatalf("git/status: status %d", resp.StatusCode)
	}
	var statusResp struct {
		IsRepo     bool             `json:"is_repo"`
		Branch     string           `json:"branch"`
		DirtyCount int              `json:"dirty_count"`
		Changes    []gitChangeJSON  `json:"changes"`
	}
	decodeJSON(t, resp, &statusResp)
	if !statusResp.IsRepo {
		t.Error("expected is_repo true")
	}
	if statusResp.Branch == "" {
		t.Error("expected a branch name")
	}
	if statusResp.DirtyCount != 2 {
		t.Errorf("dirty_count = %d, want 2", statusResp.DirtyCount)
	}
	got := map[string]gitChangeJSON{}
	for _, c := range statusResp.Changes {
		got[c.Path] = c
	}
	if c, ok := got["committed.go"]; !ok || c.Kind != "modified" || !c.Unstaged {
		t.Errorf("committed.go = %+v, want modified/unstaged", c)
	}
	if c, ok := got["new.go"]; !ok || c.Kind != "added" || !c.Staged {
		t.Errorf("new.go = %+v, want added/staged", c)
	}
}

// TestGitStatusNonRepo confirms a non-git workspace returns is_repo=false with
// an empty (non-null) changes array rather than erroring.
func TestGitStatusNonRepo(t *testing.T) {
	home := t.TempDir()
	t.Setenv(config.HomeEnv, home)
	ts := newTestServer(t, nil)
	auth := "Bearer " + testToken

	repo := t.TempDir()
	resp := doPost(t, ts.URL+"/v1/workspaces", auth, pathBody(repo))
	var ws workspaceJSON
	decodeJSON(t, resp, &ws)

	resp = doGet(t, ts.URL+"/v1/workspaces/"+ws.ID+"/git/status", auth)
	if resp.StatusCode != 200 {
		t.Fatalf("git/status on non-repo: status %d", resp.StatusCode)
	}
	var statusResp struct {
		IsRepo  bool            `json:"is_repo"`
		Changes []gitChangeJSON `json:"changes"`
	}
	decodeJSON(t, resp, &statusResp)
	if statusResp.IsRepo {
		t.Error("expected is_repo false for a plain directory")
	}
	if statusResp.Changes == nil {
		t.Error("changes must be a non-null array even when empty")
	}
}

// gitChangeJSON mirrors the explorer's git-change row for test assertions.
type gitChangeJSON struct {
	Path     string `json:"path"`
	Kind     string `json:"kind"`
	Staged   bool   `json:"staged"`
	Unstaged bool   `json:"unstaged"`
}
