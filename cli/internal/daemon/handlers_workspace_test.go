package daemon

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/config"
)

// pathBody builds a JSON body with a slash-normalised path.
func pathBody(repo string) string {
	return fmt.Sprintf(`{"path":%q}`, filepath.ToSlash(repo))
}

func TestWorkspaceEndpoints(t *testing.T) {
	home := t.TempDir()
	t.Setenv(config.HomeEnv, home)

	ts := newTestServer(t, nil)
	auth := "Bearer " + testToken

	// Create a fake repo.
	repo := filepath.Join(t.TempDir(), "testrepo")
	if err := os.MkdirAll(filepath.Join(repo, config.Dir), 0o755); err != nil {
		t.Fatal(err)
	}
	cfg := config.Default()
	if err := cfg.Save(repo); err != nil {
		t.Fatal(err)
	}

	// POST /v1/workspaces — open
	resp := doPost(t, ts.URL+"/v1/workspaces", auth, pathBody(repo))
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("POST /workspaces: status %d, want 201", resp.StatusCode)
	}
	var ws workspaceJSON
	decodeJSON(t, resp, &ws)
	if ws.ID == "" || ws.Path == "" || ws.Name != "testrepo" {
		t.Fatalf("unexpected workspace: %+v", ws)
	}
	if !ws.HasConfig {
		t.Fatal("expected has_config true")
	}
	if ws.Model == "" {
		t.Fatal("expected model from config")
	}
	wsID := ws.ID

	// GET /v1/workspaces — list
	resp = doGet(t, ts.URL+"/v1/workspaces", auth)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /workspaces: status %d", resp.StatusCode)
	}
	var listResp struct {
		Workspaces []workspaceJSON `json:"workspaces"`
		Recents    []recentEntry   `json:"recents"`
	}
	decodeJSON(t, resp, &listResp)
	if len(listResp.Workspaces) != 1 {
		t.Fatalf("expected 1 workspace, got %d", len(listResp.Workspaces))
	}
	if len(listResp.Recents) == 0 {
		t.Fatal("expected recents")
	}

	// GET /v1/workspaces/{id}
	resp = doGet(t, ts.URL+"/v1/workspaces/"+wsID, auth)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /workspaces/{id}: status %d", resp.StatusCode)
	}

	// GET /v1/workspaces/{id} — not found
	resp = doGet(t, ts.URL+"/v1/workspaces/ws_nope", auth)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown workspace, got %d", resp.StatusCode)
	}

	// GET /v1/workspaces/{id}/config
	resp = doGet(t, ts.URL+"/v1/workspaces/"+wsID+"/config", auth)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET config: status %d", resp.StatusCode)
	}
	var cfgResp configJSON
	decodeJSON(t, resp, &cfgResp)
	if cfgResp.Concurrency != 4 {
		t.Fatalf("expected concurrency 4, got %d", cfgResp.Concurrency)
	}
	if cfgResp.EffectiveConcurrency != 2 || !cfgResp.ConcurrencyClamped {
		// Default model is :free so it should be clamped.
		t.Fatalf("expected clamped concurrency for free model, got eff=%d clamped=%v",
			cfgResp.EffectiveConcurrency, cfgResp.ConcurrencyClamped)
	}

	// PUT /v1/workspaces/{id}/config
	resp = doPut(t, ts.URL+"/v1/workspaces/"+wsID+"/config", auth,
		`{"model":"anthropic/claude-sonnet-4.5","provider":"openrouter","concurrency":8,"max_module_tokens":60000,"notes":["test note"],"scope":{"exclude":["**/*.lock"]}}`)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PUT config: status %d", resp.StatusCode)
	}
	decodeJSON(t, resp, &cfgResp)
	if cfgResp.Concurrency != 8 {
		t.Fatalf("expected concurrency 8 after PUT, got %d", cfgResp.Concurrency)
	}
	if cfgResp.EffectiveConcurrency != 8 || cfgResp.ConcurrencyClamped {
		t.Fatalf("non-free model should not be clamped")
	}

	// Verify on disk.
	raw, err := os.ReadFile(config.Path(repo))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "concurrency: 8") {
		t.Fatal("config on disk does not reflect PUT")
	}
	if !strings.Contains(string(raw), "# ainow configuration") {
		t.Fatal("config header comment lost after PUT")
	}

	// DELETE /v1/workspaces/{id}
	req, _ := http.NewRequest("DELETE", ts.URL+"/v1/workspaces/"+wsID+"?forget=true", nil)
	req.Header.Set("Authorization", auth)
	resp2, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp2.Body.Close()
	if resp2.StatusCode != http.StatusNoContent {
		t.Fatalf("DELETE: status %d, want 204", resp2.StatusCode)
	}

	// Confirm gone.
	resp = doGet(t, ts.URL+"/v1/workspaces/"+wsID, auth)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 after delete, got %d", resp.StatusCode)
	}
}

func TestWorkspaceInit(t *testing.T) {
	home := t.TempDir()
	t.Setenv(config.HomeEnv, home)

	ts := newTestServer(t, nil)
	auth := "Bearer " + testToken

	// A directory with no config.
	repo := filepath.Join(t.TempDir(), "bare")
	if err := os.MkdirAll(repo, 0o755); err != nil {
		t.Fatal(err)
	}

	// Open it.
	resp := doPost(t, ts.URL+"/v1/workspaces", auth, pathBody(repo))
	var ws workspaceJSON
	decodeJSON(t, resp, &ws)
	if ws.HasConfig {
		t.Fatal("bare dir should not have config")
	}

	// Init.
	resp = doPost(t, ts.URL+"/v1/workspaces/"+ws.ID+"/init", auth, `{"model":"openai/gpt-4o"}`)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("init: status %d, want 201", resp.StatusCode)
	}
	decodeJSON(t, resp, &ws)
	if !ws.HasConfig {
		t.Fatal("expected has_config true after init")
	}

	// Verify file exists.
	if _, err := os.Stat(config.Path(repo)); err != nil {
		t.Fatalf("config.yaml not written: %v", err)
	}

	// Init again → 409.
	resp = doPost(t, ts.URL+"/v1/workspaces/"+ws.ID+"/init", auth, `{}`)
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("second init: status %d, want 409", resp.StatusCode)
	}
}

func TestScanEndpoint(t *testing.T) {
	home := t.TempDir()
	t.Setenv(config.HomeEnv, home)

	ts := newTestServer(t, nil)
	auth := "Bearer " + testToken

	// Create a repo with a Go file.
	repo := filepath.Join(t.TempDir(), "scanrepo")
	if err := os.MkdirAll(filepath.Join(repo, config.Dir), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := config.Default().Save(repo); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo, "main.go"), []byte("package main\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Open.
	resp := doPost(t, ts.URL+"/v1/workspaces", auth, pathBody(repo))
	var ws workspaceJSON
	decodeJSON(t, resp, &ws)

	// Scan.
	resp = doGet(t, ts.URL+"/v1/workspaces/"+ws.ID+"/scan", auth)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("scan: status %d", resp.StatusCode)
	}
	var scanResp struct {
		Files     int    `json:"files"`
		Stats     string `json:"stats"`
		Languages []struct {
			Lang  string `json:"lang"`
			Files int    `json:"files"`
		} `json:"languages"`
		Tree string `json:"tree"`
	}
	decodeJSON(t, resp, &scanResp)
	if scanResp.Files < 1 {
		t.Fatal("expected at least 1 file")
	}
	if scanResp.Stats == "" {
		t.Fatal("expected stats string")
	}
}

// --- helpers ---

func doGet(t *testing.T, url, auth string) *http.Response {
	t.Helper()
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", auth)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { resp.Body.Close() })
	return resp
}

func doPost(t *testing.T, url, auth, body string) *http.Response {
	t.Helper()
	req, err := http.NewRequest("POST", url, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", auth)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { resp.Body.Close() })
	return resp
}

func doPut(t *testing.T, url, auth, body string) *http.Response {
	t.Helper()
	req, err := http.NewRequest("PUT", url, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", auth)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { resp.Body.Close() })
	return resp
}

func decodeJSON(t *testing.T, resp *http.Response, v any) {
	t.Helper()
	if err := json.NewDecoder(resp.Body).Decode(v); err != nil {
		t.Fatalf("decode JSON: %v", err)
	}
}
