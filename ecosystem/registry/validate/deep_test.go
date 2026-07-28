package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// fakeGitHub serves the two endpoints DeepCheck touches: the latest-release
// API and the raw manifest at a tag.
type fakeGitHub struct {
	srv *httptest.Server
	// repo → tag; absent repo → 404 (no release)
	releases map[string]string
	// "repo@tag" → extension.yaml body
	manifests map[string]string
}

func newFakeGitHub(t *testing.T) *fakeGitHub {
	t.Helper()
	f := &fakeGitHub{releases: map[string]string{}, manifests: map[string]string{}}
	mux := http.NewServeMux()
	mux.HandleFunc("/repos/", func(w http.ResponseWriter, r *http.Request) {
		repo := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/repos/"), "/releases/latest")
		tag, ok := f.releases[repo]
		if !ok {
			http.NotFound(w, r)
			return
		}
		fmt.Fprintf(w, `{"tag_name":%q}`, tag)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// raw path: /{owner}/{repo}/{tag}/extension.yaml
		parts := strings.SplitN(strings.TrimPrefix(r.URL.Path, "/"), "/", 4)
		if len(parts) != 4 || parts[3] != "extension.yaml" {
			http.NotFound(w, r)
			return
		}
		body, ok := f.manifests[parts[0]+"/"+parts[1]+"@"+parts[2]]
		if !ok {
			http.NotFound(w, r)
			return
		}
		fmt.Fprint(w, body)
	})
	f.srv = httptest.NewServer(mux)
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fakeGitHub) cfg() DeepConfig {
	return DeepConfig{APIBase: f.srv.URL, RawBase: f.srv.URL, Client: f.srv.Client()}
}

func TestDeepCheckMatchingEntry(t *testing.T) {
	f := newFakeGitHub(t)
	f.releases["alice/kaioken-demo"] = "v1.0.0"
	f.manifests["alice/kaioken-demo@v1.0.0"] = "id: alice.demo\nname: Demo\nversion: 1.0.0\ntype: declarative\n"

	if p := DeepCheck([]Entry{good()}, f.cfg()); len(p) != 0 {
		t.Errorf("matching entry reported: %v", p)
	}
}

func TestDeepCheckMismatches(t *testing.T) {
	f := newFakeGitHub(t)
	f.releases["alice/kaioken-demo"] = "v1.0.0"
	// The release declares an mcp server while the index claims declarative,
	// under a different id — both must surface.
	f.manifests["alice/kaioken-demo@v1.0.0"] = "id: alice.other\nversion: 1.0.0\ntype: mcp\nmcp:\n  command: node\n"

	p := DeepCheck([]Entry{good()}, f.cfg())
	joined := strings.Join(p, "\n")
	if !strings.Contains(joined, "manifest id") || !strings.Contains(joined, `manifest type "mcp"`) {
		t.Errorf("mismatches not reported: %v", p)
	}
}

func TestDeepCheckWasmPermissionsMustMatch(t *testing.T) {
	f := newFakeGitHub(t)
	f.releases["bob/kaioken-wasm"] = "v2.0.0"
	f.manifests["bob/kaioken-wasm@v2.0.0"] = "id: bob.wasm\nversion: 2.0.0\ntype: wasm\nwasm:\n  entry: dist/plugin.wasm\npermissions:\n  - fs:read:workspace\n"

	e := Entry{ID: "bob.wasm", Repo: "bob/kaioken-wasm", Name: "W", Description: "d", Type: "wasm"}
	p := DeepCheck([]Entry{e}, f.cfg()) // listing omits the permission
	if len(p) == 0 || !strings.Contains(p[0], "permissions") {
		t.Errorf("understated permissions not reported: %v", p)
	}

	e.Permissions = []string{"fs:read:workspace"}
	if p := DeepCheck([]Entry{e}, f.cfg()); len(p) != 0 {
		t.Errorf("matching permissions reported: %v", p)
	}
}

func TestDeepCheckNoRelease(t *testing.T) {
	f := newFakeGitHub(t)
	p := DeepCheck([]Entry{good()}, f.cfg())
	if len(p) != 1 || !strings.Contains(p[0], "no published release") {
		t.Errorf("missing release not reported: %v", p)
	}
}

func TestDeepCheckFailureIsolation(t *testing.T) {
	f := newFakeGitHub(t)
	// First repo broken (no release), second fine — the second must still
	// come back clean and the first must be the only problem.
	f.releases["bob/kaioken-ok"] = "v1.0.0"
	f.manifests["bob/kaioken-ok@v1.0.0"] = "id: bob.ok\nversion: 1.0.0\n"

	entries := []Entry{
		good(),
		{ID: "bob.ok", Repo: "bob/kaioken-ok", Name: "OK", Description: "d"},
	}
	p := DeepCheck(entries, f.cfg())
	if len(p) != 1 || !strings.Contains(p[0], "alice.demo") {
		t.Errorf("expected exactly the broken entry's problem: %v", p)
	}
}

func TestDeepCheckSkipsMaliciousEntries(t *testing.T) {
	f := newFakeGitHub(t)
	e := good()
	e.Flags = []string{"malicious"} // repo may be gone; the flag must survive anyway
	if p := DeepCheck([]Entry{e}, f.cfg()); len(p) != 0 {
		t.Errorf("malicious entry deep-checked: %v", p)
	}
}

func TestExtractManifestFields(t *testing.T) {
	src := `# comment
id: "alice.demo"
name: Demo Extension
version: 1.2.0 # trailing comment
type: wasm
wasm:
  entry: dist/plugin.wasm
permissions:
  - fs:read:workspace
`
	m := extractManifestFields(src)
	if m.ID != "alice.demo" || m.Type != "wasm" {
		t.Errorf("scalars wrong: %+v", m)
	}
	if len(m.Permissions) != 1 || m.Permissions[0] != "fs:read:workspace" {
		t.Errorf("block list wrong: %+v", m.Permissions)
	}

	inline := extractManifestFields("id: a.b\npermissions: [fs:read:workspace]\ntype: wasm\n")
	if len(inline.Permissions) != 1 || inline.Permissions[0] != "fs:read:workspace" {
		t.Errorf("inline list wrong: %+v", inline.Permissions)
	}
}
