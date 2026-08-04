package daemon

import (
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"kaioken/internal/config"
)

// TestKeyChangeInvalidatesCachedClients: a workspace caches its LLM client,
// built from the global key at open time. Saving or deleting a key from the
// settings endpoints must drop that cache — otherwise a corrected key never
// reaches the running daemon, and the stale one keeps producing 401s until
// the daemon restarts.
func TestKeyChangeInvalidatesCachedClients(t *testing.T) {
	home := t.TempDir()
	t.Setenv(config.HomeEnv, home)
	// No env fallback may paper over the deletion below.
	t.Setenv("OPENROUTER_API_KEY", "")

	g := config.LoadGlobal()
	g.Keys["openrouter"] = "old-key"
	if err := g.Save(); err != nil {
		t.Fatal(err)
	}

	srv := &Server{opts: Options{Token: testToken, Quiet: true}, started: time.Now(), cancel: func() {}, hub: NewHub(), mgr: NewManager()}
	srv.runs = NewRuns(srv.hub)
	srv.approvals = NewApprovals()
	ts := newTestServer(t, srv)
	auth := "Bearer " + testToken

	repo := filepath.Join(t.TempDir(), "repo")
	cfg := config.Default()
	cfg.Provider = "openrouter"
	cfg.Model = "test-model"
	if err := cfg.Save(repo); err != nil {
		t.Fatal(err)
	}

	resp := doPost(t, ts.URL+"/v1/workspaces", auth, pathBody(repo))
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		t.Fatalf("open workspace: status %d", resp.StatusCode)
	}
	opened := srv.mgr.List()
	if len(opened) != 1 {
		t.Fatalf("opened %d workspaces, want 1", len(opened))
	}
	ws := opened[0]

	c1, err := ws.Client()
	if err != nil {
		t.Fatal(err)
	}
	if c1.APIKey != "old-key" {
		t.Fatalf("initial client key = %q", c1.APIKey)
	}

	// Save a new key from settings (with the stray whitespace a paste drags
	// along): the workspace must rebuild its client around the trimmed key.
	resp = keyRequest(t, "PUT", ts.URL+"/v1/settings/keys/openrouter", auth, `{"key":"  new-key\n"}`)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("put key: status %d", resp.StatusCode)
	}
	c2, err := ws.Client()
	if err != nil {
		t.Fatal(err)
	}
	if c2 == c1 {
		t.Fatal("client cache survived a key change")
	}
	if c2.APIKey != "new-key" {
		t.Fatalf("rebuilt client key = %q, want the trimmed new key", c2.APIKey)
	}

	// Delete the key: with no fallback left, the next build must fail.
	resp = keyRequest(t, "DELETE", ts.URL+"/v1/settings/keys/openrouter", auth, "")
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("delete key: status %d", resp.StatusCode)
	}
	if _, err := ws.Client(); err == nil {
		t.Fatal("client rebuilt after the key was deleted — cache not invalidated")
	}
}

// keyRequest is like doPost but supports any method and an optional body.
func keyRequest(t *testing.T, method, url, auth, body string) *http.Response {
	t.Helper()
	var rd io.Reader
	if body != "" {
		rd = strings.NewReader(body)
	}
	req, err := http.NewRequest(method, url, rd)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", auth)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { resp.Body.Close() })
	return resp
}
