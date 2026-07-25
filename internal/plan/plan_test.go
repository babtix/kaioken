package plan

import (
	"os"
	"testing"
)

// TestSaveCreatesDir reproduces the "cannot find the path specified" failure:
// saving a plan into a repo that has no .kaioken/ directory yet must create it.
func TestSaveCreatesDir(t *testing.T) {
	repo := t.TempDir() // fresh repo, no .kaioken/
	p := &Plan{Version: 1, Modules: []Module{{ID: "core", Title: "Core", Scope: []string{"main.go"}}}}
	if err := p.Save(repo); err != nil {
		t.Fatalf("Save into repo without .kaioken/: %v", err)
	}
	if _, err := os.Stat(FilePath(repo)); err != nil {
		t.Fatalf("modules.yaml not written: %v", err)
	}
	got, err := Load(repo)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(got.Modules) != 1 || got.Modules[0].ID != "core" {
		t.Fatalf("round-trip mismatch: %+v", got.Modules)
	}
}
