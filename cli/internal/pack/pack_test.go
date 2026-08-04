package pack

import (
	"archive/tar"
	"compress/gzip"
	"os"
	"path/filepath"
	"testing"
)

// seedKnowledge lays down a representative .kaioken tree including the
// private directories that must never travel.
func seedKnowledge(t *testing.T, repo string) {
	t.Helper()
	files := map[string]string{
		".kaioken/config.yaml":            "version: 1\nmodel: m\n",
		".kaioken/wiki/Getting Started.md": "# Getting Started\n",
		".kaioken/knowledge/core.md":      "core card\n",
		".kaioken/skills/build.md":        "build skill\n",
		".kaioken/sessions/private.json":  `{"secret":"chat"}`,
		".kaioken/impact/20260101.md":     "old prediction\n",
	}
	for rel, body := range files {
		p := filepath.Join(repo, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestCreateExtractRoundTrip(t *testing.T) {
	src := t.TempDir()
	seedKnowledge(t, src)

	bundle := filepath.Join(t.TempDir(), "knowledge.tar.gz")
	out, err := Create(src, bundle)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if out != bundle {
		t.Errorf("Create returned %q, want %q", out, bundle)
	}

	dst := t.TempDir()
	if err := Extract(bundle, dst); err != nil {
		t.Fatalf("Extract: %v", err)
	}

	for _, want := range []string{
		".kaioken/config.yaml",
		".kaioken/wiki/Getting Started.md",
		".kaioken/knowledge/core.md",
		".kaioken/skills/build.md",
		".kaioken/manifest.json",
	} {
		if _, err := os.Stat(filepath.Join(dst, filepath.FromSlash(want))); err != nil {
			t.Errorf("%s missing after extract: %v", want, err)
		}
	}
	// Private and history dirs must not travel.
	for _, banned := range []string{".kaioken/sessions", ".kaioken/impact"} {
		if _, err := os.Stat(filepath.Join(dst, filepath.FromSlash(banned))); !os.IsNotExist(err) {
			t.Errorf("%s must not be extracted, stat err = %v", banned, err)
		}
	}
}

func TestCreateDefaultName(t *testing.T) {
	src := t.TempDir()
	seedKnowledge(t, src)

	cwd, _ := os.Getwd()
	defer os.Chdir(cwd)
	workdir := t.TempDir()
	if err := os.Chdir(workdir); err != nil {
		t.Fatal(err)
	}

	out, err := Create(src, "")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	want := filepath.Base(src) + "-knowledge.tar.gz"
	if filepath.Base(out) != want {
		t.Errorf("default name = %q, want %q", out, want)
	}
}

// A hostile archive entry must be refused, not written outside the target.
func TestExtractRejectsTraversal(t *testing.T) {
	bundle := filepath.Join(t.TempDir(), "evil.tar.gz")
	f, err := os.Create(bundle)
	if err != nil {
		t.Fatal(err)
	}
	gz := gzip.NewWriter(f)
	tw := tar.NewWriter(gz)
	body := []byte("pwned")
	if err := tw.WriteHeader(&tar.Header{
		Name: "../evil.txt", Mode: 0o644, Size: int64(len(body)), Typeflag: tar.TypeReg,
	}); err != nil {
		t.Fatal(err)
	}
	tw.Write(body)
	tw.Close()
	gz.Close()
	f.Close()

	dst := t.TempDir()
	if err := Extract(bundle, dst); err == nil {
		t.Fatal("expected traversal to be rejected")
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(dst), "evil.txt")); !os.IsNotExist(err) {
		t.Error("escape file was written outside the target")
	}
}

func TestSafeJoin(t *testing.T) {
	base := filepath.FromSlash("/tmp/dest")
	cases := []struct {
		rel string
		ok  bool
	}{
		{"wiki/a.md", true},
		{"a/../b.md", true}, // stays inside after cleaning
		{"../outside.md", false},
		{"/abs.md", false},
		{"a/../../outside.md", false},
	}
	for _, tc := range cases {
		_, got := safeJoin(base, tc.rel)
		if got != tc.ok {
			t.Errorf("safeJoin(%q) ok = %v, want %v", tc.rel, got, tc.ok)
		}
	}
}

func TestExtractMissingBundle(t *testing.T) {
	if err := Extract(filepath.Join(t.TempDir(), "nope.tar.gz"), t.TempDir()); err == nil {
		t.Error("expected an error for a missing bundle")
	}
}
