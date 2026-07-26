package daemon

import (
	"os"
	"path/filepath"
	"testing"

	"kaioken/internal/config"
)

func TestWorkspaceIDDeterministic(t *testing.T) {
	// The same path always yields the same id.
	id1 := workspaceID("D:/project/ai_now_know")
	id2 := workspaceID("D:/project/ai_now_know")
	if id1 != id2 {
		t.Fatalf("same path gave different ids: %s vs %s", id1, id2)
	}
	// Different paths give different ids.
	id3 := workspaceID("D:/project/other")
	if id1 == id3 {
		t.Fatalf("different paths gave the same id: %s", id1)
	}
	// Format: ws_ + 6 hex chars.
	if len(id1) != 9 || id1[:3] != "ws_" {
		t.Fatalf("unexpected id format: %s", id1)
	}
}

func TestManagerOpenAndRecents(t *testing.T) {
	home := t.TempDir()
	t.Setenv(config.HomeEnv, home)

	// Create a fake repo directory with a config.
	repo := filepath.Join(t.TempDir(), "myrepo")
	if err := os.MkdirAll(filepath.Join(repo, config.Dir), 0o755); err != nil {
		t.Fatal(err)
	}
	cfg := config.Default()
	if err := cfg.Save(repo); err != nil {
		t.Fatal(err)
	}

	m := NewManager()

	// Open the workspace.
	ws, err := m.Open(repo)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if !ws.HasConfig() {
		t.Fatal("expected has_config true")
	}
	if ws.Config() == nil {
		t.Fatal("expected non-nil config")
	}

	// Same path returns the same workspace.
	ws2, err := m.Open(repo)
	if err != nil {
		t.Fatal(err)
	}
	if ws2.ID != ws.ID {
		t.Fatalf("re-open gave different id: %s vs %s", ws2.ID, ws.ID)
	}

	// Recents should contain the path.
	recents := m.Recents()
	if len(recents) == 0 {
		t.Fatal("expected at least one recent")
	}
	found := false
	for _, r := range recents {
		if r.Path == filepath.ToSlash(repo) {
			found = true
			if r.Missing {
				t.Fatal("recent should not be missing")
			}
		}
	}
	if !found {
		t.Fatalf("repo not in recents: %v", recents)
	}

	// Recents survive a "restart" (new Manager reads from disk).
	m2 := NewManager()
	recents2 := m2.Recents()
	if len(recents2) == 0 {
		t.Fatal("recents did not survive restart")
	}
	if recents2[0].Path != filepath.ToSlash(repo) {
		t.Fatalf("expected first recent to be %s, got %s", filepath.ToSlash(repo), recents2[0].Path)
	}
}

func TestManagerCloseForget(t *testing.T) {
	home := t.TempDir()
	t.Setenv(config.HomeEnv, home)

	repo := filepath.Join(t.TempDir(), "repo2")
	if err := os.MkdirAll(repo, 0o755); err != nil {
		t.Fatal(err)
	}

	m := NewManager()
	ws, err := m.Open(repo)
	if err != nil {
		t.Fatal(err)
	}

	// Close without forget: recents still has it.
	m.Close(ws.ID, false)
	if _, ok := m.Get(ws.ID); ok {
		t.Fatal("workspace still open after Close")
	}
	recents := m.Recents()
	found := false
	for _, r := range recents {
		if r.Path == filepath.ToSlash(repo) {
			found = true
		}
	}
	if !found {
		t.Fatal("expected path in recents after close without forget")
	}

	// Re-open and close with forget.
	ws, _ = m.Open(repo)
	m.Close(ws.ID, true)
	recents = m.Recents()
	for _, r := range recents {
		if r.Path == filepath.ToSlash(repo) {
			t.Fatal("expected path removed from recents after forget")
		}
	}
}

func TestManagerOpenInvalid(t *testing.T) {
	home := t.TempDir()
	t.Setenv(config.HomeEnv, home)

	m := NewManager()

	// Non-existent path.
	if _, err := m.Open(filepath.Join(t.TempDir(), "nope")); err == nil {
		t.Fatal("expected error for non-existent path")
	}

	// A file, not a directory.
	f := filepath.Join(t.TempDir(), "afile.txt")
	_ = os.WriteFile(f, []byte("x"), 0o644)
	if _, err := m.Open(f); err == nil {
		t.Fatal("expected error for a file path")
	}
}

func TestWorkspaceNoConfig(t *testing.T) {
	home := t.TempDir()
	t.Setenv(config.HomeEnv, home)

	// A directory with no .kaioken/config.yaml.
	repo := filepath.Join(t.TempDir(), "bare")
	if err := os.MkdirAll(repo, 0o755); err != nil {
		t.Fatal(err)
	}

	m := NewManager()
	ws, err := m.Open(repo)
	if err != nil {
		t.Fatalf("Open should succeed without config: %v", err)
	}
	if ws.HasConfig() {
		t.Fatal("expected has_config false for bare directory")
	}
}
