package daemon

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"kaioken/internal/config"
	"kaioken/internal/ext"
)

// extReq issues an authenticated JSON request against the test server.
func extReq(t *testing.T, tsURL, method, path string, body any) *http.Response {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(raw)
	} else {
		reader = bytes.NewReader(nil)
	}
	req, err := http.NewRequest(method, tsURL+path, reader)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+testToken)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { resp.Body.Close() })
	return resp
}

// writeDevExtension lays out a local extension working tree.
func writeDevExtension(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	files := map[string]string{
		"extension.yaml":        "id: alice.dev\nname: Dev Demo\nversion: 0.1.0\nrepo: alice/kaioken-dev\n",
		"skills/hello/SKILL.md": "---\nname: hello\ndescription: Say hello properly.\n---\n\n# Hello\n",
	}
	for rel, bodyText := range files {
		p := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(bodyText), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

// The full management lifecycle over the API: dev-install, list, disable,
// trust rejection for a code-free extension, update (local skip), remove.
func TestExtensionEndpointsLifecycle(t *testing.T) {
	t.Setenv(config.HomeEnv, t.TempDir())
	ts := newTestServer(t, nil)
	dir := writeDevExtension(t)

	// Install from the local tree.
	resp := extReq(t, ts.URL, http.MethodPost, "/v1/extensions/dev", map[string]string{"path": dir})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("dev install status = %d", resp.StatusCode)
	}
	report := struct {
		Extension struct {
			ID     string `json:"id"`
			Type   string `json:"type"`
			Local  bool   `json:"local"`
			Skills []struct {
				Name string `json:"name"`
			} `json:"skills"`
		} `json:"extension"`
		NeedsTrust bool `json:"needs_trust"`
	}{}
	decodeJSON(t, resp, &report)
	if report.Extension.ID != "alice.dev" || !report.Extension.Local || report.NeedsTrust {
		t.Fatalf("unexpected install report: %+v", report)
	}
	if report.Extension.Type != "declarative" || len(report.Extension.Skills) != 1 {
		t.Errorf("report extension = %+v", report.Extension)
	}

	// List shows it.
	resp = extReq(t, ts.URL, http.MethodGet, "/v1/extensions", nil)
	list := struct {
		Extensions []struct {
			ID      string `json:"id"`
			Enabled bool   `json:"enabled"`
			Trusted bool   `json:"trusted"`
		} `json:"extensions"`
	}{}
	decodeJSON(t, resp, &list)
	if len(list.Extensions) != 1 || list.Extensions[0].ID != "alice.dev" || !list.Extensions[0].Enabled {
		t.Fatalf("list = %+v", list)
	}

	// Disable, verify, re-enable.
	resp = extReq(t, ts.URL, http.MethodPost, "/v1/extensions/alice.dev/enable", map[string]bool{"enabled": false})
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("disable status = %d", resp.StatusCode)
	}
	lock, err := ext.LoadLock()
	if err != nil || lock.Find("alice.dev").Enabled {
		t.Fatalf("disable did not persist: %v %+v", err, lock)
	}
	extReq(t, ts.URL, http.MethodPost, "/v1/extensions/alice.dev/enable", map[string]bool{"enabled": true})

	// A declarative extension has nothing to trust: 400, not a crash.
	resp = extReq(t, ts.URL, http.MethodPost, "/v1/extensions/alice.dev/trust", nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("trusting a declarative extension: status = %d, want 400", resp.StatusCode)
	}

	// Update skips the local install without touching any network.
	resp = extReq(t, ts.URL, http.MethodPost, "/v1/extensions/update", nil)
	upd := struct {
		Results []struct {
			ID    string `json:"id"`
			Local bool   `json:"local"`
			Error string `json:"error"`
		} `json:"results"`
	}{}
	decodeJSON(t, resp, &upd)
	if len(upd.Results) != 1 || !upd.Results[0].Local || upd.Results[0].Error != "" {
		t.Fatalf("update results = %+v", upd)
	}

	// Validate reports on the working tree.
	resp = extReq(t, ts.URL, http.MethodPost, "/v1/extensions/validate", map[string]string{"path": dir})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("validate status = %d", resp.StatusCode)
	}

	// Remove clears it.
	resp = extReq(t, ts.URL, http.MethodDelete, "/v1/extensions/alice.dev", nil)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("remove status = %d", resp.StatusCode)
	}
	resp = extReq(t, ts.URL, http.MethodDelete, "/v1/extensions/alice.dev", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("second remove: status = %d, want 404", resp.StatusCode)
	}
}

// An untrusted mcp extension's list entry must carry the exact command the
// trust dialog shows — the desktop consent UX depends on it.
func TestExtensionListCarriesTrustPrompt(t *testing.T) {
	t.Setenv(config.HomeEnv, t.TempDir())
	ts := newTestServer(t, nil)

	dir := t.TempDir()
	manifest := "id: alice.srv\nname: Srv\nversion: 0.1.0\ntype: mcp\nmcp:\n  command: not-a-real-command\n  args: [--serve]\n"
	if err := os.WriteFile(filepath.Join(dir, "extension.yaml"), []byte(manifest), 0o644); err != nil {
		t.Fatal(err)
	}
	resp := extReq(t, ts.URL, http.MethodPost, "/v1/extensions/dev", map[string]string{"path": dir})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("dev install status = %d", resp.StatusCode)
	}

	resp = extReq(t, ts.URL, http.MethodGet, "/v1/extensions", nil)
	list := struct {
		Extensions []struct {
			Type       string `json:"type"`
			NeedsTrust bool   `json:"needs_trust"`
			Command    string `json:"command"`
		} `json:"extensions"`
	}{}
	decodeJSON(t, resp, &list)
	if len(list.Extensions) != 1 {
		t.Fatalf("list = %+v", list)
	}
	e := list.Extensions[0]
	if e.Type != "mcp" || !e.NeedsTrust || e.Command != "not-a-real-command --serve" {
		t.Errorf("trust prompt data missing: %+v", e)
	}
}

// The registry endpoint degrades to a provider error when unreachable —
// never a hang, never a 500.
func TestExtensionRegistryUnreachable(t *testing.T) {
	t.Setenv(config.HomeEnv, t.TempDir())
	g := config.LoadGlobal()
	g.ExtRegistry = "http://127.0.0.1:1/registry.json"
	if err := g.Save(); err != nil {
		t.Fatal(err)
	}
	ts := newTestServer(t, nil)

	resp := extReq(t, ts.URL, http.MethodGet, "/v1/extensions/registry", nil)
	if resp.StatusCode != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", resp.StatusCode)
	}
}

// Schema v2 fields pass through to the desktop, the type is normalized to
// a tier, and the malicious kill switch still filters entries server-side.
func TestExtensionRegistryPassesV2Fields(t *testing.T) {
	t.Setenv(config.HomeEnv, t.TempDir())

	index := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[
			{"id":"bob.wasm","repo":"bob/kaioken-wasm","name":"W","description":"sandboxed tools","author":"Bob",
			 "type":"wasm","tags":["tools"],"homepage":"https://example.com","permissions":["fs:read:workspace"]},
			{"id":"old.plain","repo":"old/kaioken-plain","name":"P","description":"v1 shape","author":"Old"},
			{"id":"eve.bad","repo":"eve/kaioken-bad","name":"B","description":"nope","author":"Eve","flags":["malicious"]}
		]`)
	}))
	defer index.Close()
	g := config.LoadGlobal()
	g.ExtRegistry = index.URL
	if err := g.Save(); err != nil {
		t.Fatal(err)
	}
	ts := newTestServer(t, nil)

	resp := extReq(t, ts.URL, http.MethodGet, "/v1/extensions/registry", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	var out struct {
		Entries []struct {
			ID          string   `json:"id"`
			Type        string   `json:"type"`
			Tags        []string `json:"tags"`
			Homepage    string   `json:"homepage"`
			Permissions []string `json:"permissions"`
		} `json:"entries"`
	}
	decodeJSON(t, resp, &out)
	if len(out.Entries) != 2 {
		t.Fatalf("got %d entries — the malicious one must be filtered: %+v", len(out.Entries), out.Entries)
	}
	w := out.Entries[0]
	if w.ID != "bob.wasm" || w.Type != "wasm" || len(w.Tags) != 1 || w.Homepage == "" || len(w.Permissions) != 1 {
		t.Errorf("v2 fields not passed through: %+v", w)
	}
	if p := out.Entries[1]; p.Type != "declarative" {
		t.Errorf("a v1 entry must surface the normalized declarative tier, got %q", p.Type)
	}
}
