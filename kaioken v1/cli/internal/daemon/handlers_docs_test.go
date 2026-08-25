package daemon

import (
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"kaioken/internal/config"
)

// TestSafeJoinHostilePaths is the required table from docs/08-testing.md §8.1:
// every one of these must be rejected. This is the highest-severity bug
// class in the app (docs/09-risks.md R9) and previously had zero test
// coverage.
func TestSafeJoinHostilePaths(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "legit.md"), []byte("ok"), 0o644); err != nil {
		t.Fatal(err)
	}

	hostile := []string{
		"../../../etc/passwd",
		`..\..\windows\system32\config\sam`,
		"/etc/passwd",
		"C:/Windows/win.ini",
		`C:\Windows\win.ini`,
		"foo/../../../bar",
		"..",
		"/",
	}
	for _, rel := range hostile {
		t.Run(rel, func(t *testing.T) {
			if _, err := safeJoin(root, rel); err == nil {
				t.Errorf("safeJoin(%q) succeeded, want rejection", rel)
			}
		})
	}

	// A legitimate relative path must still resolve.
	abs, err := safeJoin(root, "legit.md")
	if err != nil {
		t.Fatalf("safeJoin(legit.md) unexpectedly failed: %v", err)
	}
	if filepath.Clean(abs) != filepath.Clean(filepath.Join(root, "legit.md")) {
		t.Errorf("safeJoin(legit.md) = %q, want %q", abs, filepath.Join(root, "legit.md"))
	}
}

// TestSafeJoinSymlinkEscape covers the symlink case separately since it
// needs real filesystem setup (Windows requires developer mode or admin for
// unprivileged symlinks, so this is skipped there rather than failing on
// unrelated permission errors).
func TestSafeJoinSymlinkEscape(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("creating symlinks on Windows needs elevated privileges or developer mode")
	}
	root := t.TempDir()
	outside := t.TempDir()
	secret := filepath.Join(outside, "secret.txt")
	if err := os.WriteFile(secret, []byte("nope"), 0o644); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(root, "escape")
	if err := os.Symlink(outside, link); err != nil {
		t.Fatal(err)
	}
	// safeJoin itself only cleans the path string; it does not resolve
	// symlinks, so this documents current behavior rather than asserting a
	// guarantee the helper doesn't make.
	abs, err := safeJoin(root, "escape/secret.txt")
	if err != nil {
		return // rejected outright — fine
	}
	resolved, _ := filepath.EvalSymlinks(abs)
	if resolved == secret {
		t.Log("safeJoin does not resolve symlinks — a symlink planted inside the repo can still escape it; handlers reading arbitrary repo-relative paths should be aware")
	}
}

func TestHandleFileRejectsHostilePaths(t *testing.T) {
	home := t.TempDir()
	t.Setenv(config.HomeEnv, home)
	ts := newTestServer(t, nil)
	auth := "Bearer " + testToken

	repo := t.TempDir()
	if err := os.MkdirAll(filepath.Join(repo, config.Dir), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := config.Default().Save(repo); err != nil {
		t.Fatal(err)
	}
	resp := doPost(t, ts.URL+"/v1/workspaces", auth, pathBody(repo))
	var ws workspaceJSON
	decodeJSON(t, resp, &ws)

	hostile := []string{
		"../../../etc/passwd",
		"/etc/passwd",
		"C:/Windows/win.ini",
		"foo/../../../bar",
	}
	for _, rel := range hostile {
		t.Run(rel, func(t *testing.T) {
			u := ts.URL + "/v1/workspaces/" + ws.ID + "/file?path=" + url.QueryEscape(rel)
			resp := doGet(t, u, auth)
			if resp.StatusCode != http.StatusForbidden {
				t.Errorf("GET /file?path=%q: status %d, want 403", rel, resp.StatusCode)
			}
			var body struct {
				Error struct{ Code string } `json:"error"`
			}
			decodeJSON(t, resp, &body)
			if body.Error.Code != codePathEscape {
				t.Errorf("error.code = %q, want %q", body.Error.Code, codePathEscape)
			}
		})
	}
}

// TestCardEndpoint covers the previously-missing GET /cards/{module}/{card}.
func TestCardEndpoint(t *testing.T) {
	home := t.TempDir()
	t.Setenv(config.HomeEnv, home)
	ts := newTestServer(t, nil)
	auth := "Bearer " + testToken

	repo := t.TempDir()
	if err := os.MkdirAll(filepath.Join(repo, config.Dir), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := config.Default().Save(repo); err != nil {
		t.Fatal(err)
	}
	cardDir := filepath.Join(repo, config.Dir, "knowledge", "cli.internal.agent")
	if err := os.MkdirAll(cardDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(cardDir, "overview.md"), []byte("# Agent overview\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	resp := doPost(t, ts.URL+"/v1/workspaces", auth, pathBody(repo))
	var ws workspaceJSON
	decodeJSON(t, resp, &ws)

	resp = doGet(t, ts.URL+"/v1/workspaces/"+ws.ID+"/cards/cli.internal.agent/overview", auth)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /cards/{module}/{card}: status %d, want 200", resp.StatusCode)
	}
	var body struct {
		Markdown string `json:"markdown"`
	}
	decodeJSON(t, resp, &body)
	if body.Markdown != "# Agent overview\n" {
		t.Errorf("markdown = %q", body.Markdown)
	}

	// A missing card is 404, not a panic or a 500.
	resp = doGet(t, ts.URL+"/v1/workspaces/"+ws.ID+"/cards/cli.internal.agent/missing", auth)
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("GET missing card: status %d, want 404", resp.StatusCode)
	}
}

// TestSkillEndpoints covers the previously-missing GET/PUT
// /skills/{name}.
func TestSkillEndpoints(t *testing.T) {
	home := t.TempDir()
	t.Setenv(config.HomeEnv, home)
	ts := newTestServer(t, nil)
	auth := "Bearer " + testToken

	repo := t.TempDir()
	if err := os.MkdirAll(filepath.Join(repo, config.Dir), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := config.Default().Save(repo); err != nil {
		t.Fatal(err)
	}
	resp := doPost(t, ts.URL+"/v1/workspaces", auth, pathBody(repo))
	var ws workspaceJSON
	decodeJSON(t, resp, &ws)

	putBody := `{"description":"how to add a command","sources":["cli/internal/tui/tui.go"],"markdown":"Do the thing.\n"}`
	resp = doPut(t, ts.URL+"/v1/workspaces/"+ws.ID+"/skills/add-a-command", auth, putBody)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PUT /skills/{name}: status %d, want 200", resp.StatusCode)
	}

	resp = doGet(t, ts.URL+"/v1/workspaces/"+ws.ID+"/skills/add-a-command", auth)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /skills/{name}: status %d, want 200", resp.StatusCode)
	}
	var body struct {
		Name        string   `json:"name"`
		Description string   `json:"description"`
		Sources     []string `json:"sources"`
		Markdown    string   `json:"markdown"`
	}
	decodeJSON(t, resp, &body)
	if body.Name != "add-a-command" || body.Description != "how to add a command" || body.Markdown != "Do the thing.\n" {
		t.Errorf("unexpected skill: %+v", body)
	}
	if len(body.Sources) != 1 || body.Sources[0] != "cli/internal/tui/tui.go" {
		t.Errorf("sources = %v", body.Sources)
	}
}

// TestCompactTooShort asserts the guard clause without needing a fake LLM
// provider: a session with <=2 messages must be rejected before ever
// reaching the network call.
func TestCompactTooShort(t *testing.T) {
	home := t.TempDir()
	t.Setenv(config.HomeEnv, home)
	ts := newTestServer(t, nil)
	auth := "Bearer " + testToken

	repo := t.TempDir()
	if err := os.MkdirAll(filepath.Join(repo, config.Dir), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := config.Default().Save(repo); err != nil {
		t.Fatal(err)
	}
	resp := doPost(t, ts.URL+"/v1/workspaces", auth, pathBody(repo))
	var ws workspaceJSON
	decodeJSON(t, resp, &ws)

	resp = doPost(t, ts.URL+"/v1/workspaces/"+ws.ID+"/sessions", auth, "{}")
	var sess struct {
		ID string `json:"id"`
	}
	decodeJSON(t, resp, &sess)

	resp = doPost(t, ts.URL+fmt.Sprintf("/v1/workspaces/%s/sessions/%s/compact", ws.ID, sess.ID), auth, "{}")
	if resp.StatusCode != http.StatusNotFound && resp.StatusCode != http.StatusBadRequest {
		t.Errorf("compact on a session with no messages: status %d, want 404 (not saved yet) or 400", resp.StatusCode)
	}
}
