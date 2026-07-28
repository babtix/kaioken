package ext

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeManifest(t *testing.T, dir, body string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, ManifestName), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestLoadManifest(t *testing.T) {
	dir := t.TempDir()
	writeManifest(t, dir, `
id: alice.git-flow
name: Git Flow Helpers
version: 1.2.0
description: Skills for the git-flow branching model.
author: Alice
repo: alice/kaioken-git-flow
type: declarative
minKaiokenVersion: 0.1.0
`)
	m, err := LoadManifest(dir)
	if err != nil {
		t.Fatal(err)
	}
	if m.ID != "alice.git-flow" || m.Version != "1.2.0" || m.Type != TypeDeclarative {
		t.Errorf("unexpected manifest: %+v", m)
	}
}

func TestLoadManifestMissing(t *testing.T) {
	if _, err := LoadManifest(t.TempDir()); err == nil || !strings.Contains(err.Error(), ManifestName) {
		t.Errorf("missing manifest should name the file, got %v", err)
	}
}

func TestManifestValidate(t *testing.T) {
	ok := Manifest{ID: "alice.demo", Name: "Demo", Version: "1.0.0"}
	if err := ok.Validate(); err != nil {
		t.Errorf("valid manifest rejected: %v", err)
	}
	// An empty type means declarative.
	if ok.Type != "" {
		t.Fatal("test setup: type should start empty")
	}

	cases := map[string]Manifest{
		"bad id (no dot)":    {ID: "alicedemo", Name: "Demo", Version: "1.0.0"},
		"bad id (uppercase)": {ID: "Alice.Demo", Name: "Demo", Version: "1.0.0"},
		"bad id (traversal)": {ID: "../evil.x", Name: "Demo", Version: "1.0.0"},
		"missing name":       {ID: "alice.demo", Version: "1.0.0"},
		"bad version":        {ID: "alice.demo", Name: "Demo", Version: "1.0"},
		"bad min version":    {ID: "alice.demo", Name: "Demo", Version: "1.0.0", MinKaiokenVersion: "soon"},
	}
	for name, m := range cases {
		if err := m.Validate(); err == nil {
			t.Errorf("%s: should have been rejected", name)
		}
	}
}

// The security boundary: unknown/executable tiers without a runtime must
// not install. (mcp and wasm are allowed but have their own validation —
// see mcp_test and wasm_test.)
func TestManifestRejectsExecutableTypes(t *testing.T) {
	for _, typ := range []string{"native", "python"} {
		m := Manifest{ID: "alice.demo", Name: "Demo", Version: "1.0.0", Type: typ}
		err := m.Validate()
		if err == nil || !strings.Contains(err.Error(), "not supported yet") {
			t.Errorf("type %q: want a not-supported error, got %v", typ, err)
		}
	}
}
