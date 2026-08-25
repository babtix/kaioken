package ext

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"kaioken/internal/config"
	"kaioken/internal/version"
)

// fakeHub is a stand-in for the GitHub API plus the registry index. Tests
// mutate its fields to publish new releases or change moderation flags.
type fakeHub struct {
	srv       *httptest.Server
	latestTag string
	zips      map[string][]byte // tag → zipball bytes
	registry  []RegistryEntry
	regHits   int
}

// newFakeHub redirects the whole package — per-user dir, GitHub API and
// registry URL — at test-owned locations.
func newFakeHub(t *testing.T) *fakeHub {
	t.Helper()
	h := &fakeHub{zips: map[string][]byte{}}
	mux := http.NewServeMux()
	mux.HandleFunc("/repos/alice/kaioken-demo/releases/latest", func(w http.ResponseWriter, r *http.Request) {
		h.serveRelease(w, h.latestTag)
	})
	mux.HandleFunc("/repos/alice/kaioken-demo/releases/tags/", func(w http.ResponseWriter, r *http.Request) {
		tag := r.URL.Path[strings.LastIndex(r.URL.Path, "/")+1:]
		h.serveRelease(w, tag)
	})
	mux.HandleFunc("/zip/", func(w http.ResponseWriter, r *http.Request) {
		tag := r.URL.Path[len("/zip/"):]
		data, ok := h.zips[tag]
		if !ok {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write(data)
	})
	mux.HandleFunc("/registry.json", func(w http.ResponseWriter, r *http.Request) {
		h.regHits++
		w.Header().Set("ETag", `"reg-v1"`)
		if r.Header.Get("If-None-Match") == `"reg-v1"` {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		_ = json.NewEncoder(w).Encode(h.registry)
	})
	h.srv = httptest.NewServer(mux)
	t.Cleanup(h.srv.Close)

	t.Setenv(config.HomeEnv, t.TempDir())
	g := config.LoadGlobal()
	g.ExtRegistry = h.srv.URL + "/registry.json"
	if err := g.Save(); err != nil {
		t.Fatal(err)
	}
	oldAPI := ghAPI
	ghAPI = h.srv.URL
	t.Cleanup(func() { ghAPI = oldAPI })
	return h
}

func (h *fakeHub) serveRelease(w http.ResponseWriter, tag string) {
	if _, ok := h.zips[tag]; !ok || tag == "" {
		http.NotFound(w, nil)
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]string{
		"tag_name":    tag,
		"zipball_url": h.srv.URL + "/zip/" + tag,
	})
}

// publish adds a release whose zipball wraps files under a GitHub-style
// top-level directory, and makes it the latest.
func (h *fakeHub) publish(t *testing.T, tag string, files map[string]string) {
	t.Helper()
	h.zips[tag] = zipball(t, "alice-kaioken-demo-abc1234/", files)
	h.latestTag = tag
}

func zipball(t *testing.T, prefix string, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, body := range files {
		f, err := zw.Create(prefix + name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.Write([]byte(body)); err != nil {
			t.Fatal(err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func demoFiles(manifestVersion string) map[string]string {
	return map[string]string{
		"extension.yaml": fmt.Sprintf(
			"id: alice.demo\nname: Demo\nversion: %s\nrepo: alice/kaioken-demo\ntype: declarative\n",
			manifestVersion),
		"skills/hello/SKILL.md": "---\nname: hello\ndescription: Say hello properly.\n---\n\n# Hello\n\nGreet with context.\n",
		"README.md":             "# Demo extension\n",
	}
}

func TestParseSpec(t *testing.T) {
	good := map[string]Spec{
		"alice/kaioken-demo":                        {Owner: "alice", Name: "kaioken-demo"},
		"github.com/alice/kaioken-demo":             {Owner: "alice", Name: "kaioken-demo"},
		"https://github.com/alice/kaioken-demo.git": {Owner: "alice", Name: "kaioken-demo"},
		"alice/kaioken-demo@1.2.0":                  {Owner: "alice", Name: "kaioken-demo", Version: "1.2.0"},
		"alice/kaioken-demo@v1.2.0":                 {Owner: "alice", Name: "kaioken-demo", Version: "1.2.0"},
	}
	for in, want := range good {
		got, err := ParseSpec(in)
		if err != nil {
			t.Errorf("ParseSpec(%q): %v", in, err)
			continue
		}
		if got != want {
			t.Errorf("ParseSpec(%q) = %+v, want %+v", in, got, want)
		}
	}
	for _, in := range []string{"", "alice", "a/b/c", "alice/kaioken-demo@nope", "../etc/passwd", "a b/c", "alice/re?po"} {
		if _, err := ParseSpec(in); err == nil {
			t.Errorf("ParseSpec(%q) should fail", in)
		}
	}
}

func TestInstallUpdateRemoveLifecycle(t *testing.T) {
	h := newFakeHub(t)
	h.publish(t, "v1.0.0", demoFiles("1.0.0"))
	ctx := context.Background()

	res, err := Install(ctx, "alice/kaioken-demo")
	if err != nil {
		t.Fatal(err)
	}
	if res.Entry.ID != "alice.demo" || res.Entry.Version != "1.0.0" || res.Entry.Repo != "alice/kaioken-demo" {
		t.Errorf("unexpected lock entry: %+v", res.Entry)
	}
	if res.Entry.SHA256 == "" {
		t.Error("the lock entry must pin the archive hash")
	}
	if len(res.Warnings) != 0 {
		t.Errorf("matching tag should not warn: %v", res.Warnings)
	}
	if len(res.Skills) != 1 || res.Skills[0].Name != "hello" {
		t.Errorf("install should report the contributed skill, got %+v", res.Skills)
	}
	if _, err := os.Stat(InstallDir("alice.demo", "1.0.0")); err != nil {
		t.Fatalf("installed tree missing: %v", err)
	}

	// The host sees the contribution and serves paths inside it — only those.
	if cs := Contributions(); len(cs) != 1 || cs[0].ExtID != "alice.demo" || cs[0].Description != "Say hello properly." {
		t.Fatalf("contributions = %+v", cs)
	}
	if _, err := Resolve("alice.demo", "skills/hello"); err != nil {
		t.Errorf("resolve of a real skill failed: %v", err)
	}
	if _, err := Resolve("alice.demo", "../../config.yaml"); err == nil {
		t.Error("resolve must refuse paths escaping the extension")
	}

	// Disabled extensions vanish from the catalog without losing files.
	if err := SetEnabled("alice.demo", false); err != nil {
		t.Fatal(err)
	}
	if cs := Contributions(); len(cs) != 0 {
		t.Errorf("disabled extension still contributes: %+v", cs)
	}
	if _, err := Resolve("alice.demo", "skills/hello"); err == nil {
		t.Error("resolve must refuse a disabled extension")
	}
	if err := SetEnabled("alice.demo", true); err != nil {
		t.Fatal(err)
	}

	// A newer release: update reinstalls and prunes the old version tree.
	h.publish(t, "v1.1.0", demoFiles("1.1.0"))
	results, err := Update(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || !results[0].Updated || results[0].From != "1.0.0" || results[0].To != "1.1.0" {
		t.Fatalf("update results = %+v", results)
	}
	if _, err := os.Stat(InstallDir("alice.demo", "1.1.0")); err != nil {
		t.Errorf("updated tree missing: %v", err)
	}
	if _, err := os.Stat(InstallDir("alice.demo", "1.0.0")); !os.IsNotExist(err) {
		t.Error("old version tree should be pruned after a successful update")
	}

	// Running update again is a no-op.
	results, err = Update(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if results[0].Updated {
		t.Error("a current extension must not reinstall")
	}

	// Remove clears both the tree and the ledger.
	if err := Remove("alice.demo"); err != nil {
		t.Fatal(err)
	}
	lock, err := LoadLock()
	if err != nil {
		t.Fatal(err)
	}
	if len(lock.Extensions) != 0 {
		t.Errorf("lock still lists %+v", lock.Extensions)
	}
	if _, err := os.Stat(InstallDir("alice.demo", "1.1.0")); !os.IsNotExist(err) {
		t.Error("removed extension tree still on disk")
	}
}

func TestInstallPinnedVersion(t *testing.T) {
	h := newFakeHub(t)
	h.publish(t, "v1.0.0", demoFiles("1.0.0"))
	h.publish(t, "v1.1.0", demoFiles("1.1.0")) // latest

	res, err := Install(context.Background(), "alice/kaioken-demo@1.0.0")
	if err != nil {
		t.Fatal(err)
	}
	if res.Entry.Version != "1.0.0" {
		t.Errorf("pinned install got %s, want 1.0.0", res.Entry.Version)
	}
}

func TestInstallWarnsOnTagVersionMismatch(t *testing.T) {
	h := newFakeHub(t)
	h.publish(t, "v2.0.0", demoFiles("1.0.0")) // author forgot to bump the manifest

	res, err := Install(context.Background(), "alice/kaioken-demo")
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Warnings) != 1 || !strings.Contains(res.Warnings[0], "does not match release tag") {
		t.Errorf("expected a mismatch warning, got %v", res.Warnings)
	}
}

func TestInstallRejectsZipSlip(t *testing.T) {
	h := newFakeHub(t)
	h.zips["v1.0.0"] = zipball(t, "wrapper/", map[string]string{
		"../../evil.txt": "pwned",
	})
	h.latestTag = "v1.0.0"

	_, err := Install(context.Background(), "alice/kaioken-demo")
	if err == nil || !strings.Contains(err.Error(), "unsafe archive path") {
		t.Fatalf("zip-slip archive must be refused, got %v", err)
	}
}

func TestInstallRejectsExecutableType(t *testing.T) {
	h := newFakeHub(t)
	files := demoFiles("1.0.0")
	files["extension.yaml"] = "id: alice.demo\nname: Demo\nversion: 1.0.0\ntype: native\n"
	h.publish(t, "v1.0.0", files)

	_, err := Install(context.Background(), "alice/kaioken-demo")
	if err == nil || !strings.Contains(err.Error(), "not supported yet") {
		t.Fatalf("native extension must be refused, got %v", err)
	}
}

func TestInstallEnforcesMinKaiokenVersion(t *testing.T) {
	h := newFakeHub(t)
	files := demoFiles("1.0.0")
	files["extension.yaml"] = "id: alice.demo\nname: Demo\nversion: 1.0.0\nminKaiokenVersion: 99.0.0\n"
	h.publish(t, "v1.0.0", files)

	// The source tree builds as the dev placeholder, which loads everything —
	// pretend to be a release build for this test.
	oldVer := version.Version
	version.Version = "1.0.0"
	defer func() { version.Version = oldVer }()

	_, err := Install(context.Background(), "alice/kaioken-demo")
	if err == nil || !strings.Contains(err.Error(), "requires kaioken >= 99.0.0") {
		t.Fatalf("too-old host must be refused, got %v", err)
	}
}

func TestInstallRefusesMaliciousFlag(t *testing.T) {
	h := newFakeHub(t)
	h.publish(t, "v1.0.0", demoFiles("1.0.0"))
	h.registry = []RegistryEntry{{
		ID: "alice.demo", Repo: "alice/kaioken-demo", Flags: []string{"malicious"},
	}}

	_, err := Install(context.Background(), "alice/kaioken-demo")
	if err == nil || !strings.Contains(err.Error(), "flagged as malicious") {
		t.Fatalf("flagged extension must be refused, got %v", err)
	}
}
