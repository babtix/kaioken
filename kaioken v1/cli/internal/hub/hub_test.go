package hub

import (
	"os"
	"path/filepath"
	"testing"
)

// tempHub creates a Hub loaded from a fresh temp directory, simulating
// $KAIOKEN_HOME isolation for tests.
func tempHub(t *testing.T) (*Hub, string) {
	t.Helper()
	dir := t.TempDir()
	h, err := loadFrom(dir)
	if err != nil {
		t.Fatalf("loadFrom: %v", err)
	}
	return h, dir
}

// initRepo creates a fake repository dir with a .kaioken subdirectory.
func initRepo(t *testing.T, name string) string {
	t.Helper()
	dir := filepath.Join(t.TempDir(), name)
	if err := os.MkdirAll(filepath.Join(dir, ".kaioken"), 0o755); err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestAddDedup(t *testing.T) {
	h, _ := tempHub(t)
	repo := initRepo(t, "myrepo")

	if err := h.Add(repo); err != nil {
		t.Fatalf("first Add: %v", err)
	}
	if err := h.Add(repo); err != nil {
		t.Fatalf("second Add (dedup) should not error: %v", err)
	}
	if len(h.Repos) != 1 {
		t.Errorf("expected 1 entry after dedup, got %d", len(h.Repos))
	}
}

func TestAddRejectsNonKaiokenDir(t *testing.T) {
	h, _ := tempHub(t)
	plain := t.TempDir() // no .kaioken inside
	if err := h.Add(plain); err == nil {
		t.Error("Add should reject a directory without .kaioken")
	}
}

func TestRemoveByName(t *testing.T) {
	h, _ := tempHub(t)
	repo := initRepo(t, "project")
	if err := h.Add(repo); err != nil {
		t.Fatal(err)
	}
	if err := h.Remove("project"); err != nil {
		t.Fatalf("Remove by name: %v", err)
	}
	if len(h.Repos) != 0 {
		t.Errorf("expected 0 entries after remove, got %d", len(h.Repos))
	}
}

func TestRemoveByPath(t *testing.T) {
	h, _ := tempHub(t)
	repo := initRepo(t, "proj2")
	if err := h.Add(repo); err != nil {
		t.Fatal(err)
	}
	if err := h.Remove(repo); err != nil {
		t.Fatalf("Remove by path: %v", err)
	}
	if len(h.Repos) != 0 {
		t.Errorf("expected 0 entries after remove, got %d", len(h.Repos))
	}
}

func TestRemoveNotFound(t *testing.T) {
	h, _ := tempHub(t)
	if err := h.Remove("nonexistent"); err == nil {
		t.Error("Remove of nonexistent entry should error")
	}
}

func TestSaveAndRoundTrip(t *testing.T) {
	h, dir := tempHub(t)
	repo := initRepo(t, "saved")
	if err := h.Add(repo); err != nil {
		t.Fatal(err)
	}
	if err := h.Save(); err != nil {
		t.Fatalf("Save: %v", err)
	}

	// Reload from the same dir.
	h2, err := loadFrom(dir)
	if err != nil {
		t.Fatalf("loadFrom after save: %v", err)
	}
	if len(h2.Repos) != 1 || h2.Repos[0].Name != "saved" {
		t.Errorf("round-trip: got repos %+v", h2.Repos)
	}
}

func TestLoadMissingReturnsEmpty(t *testing.T) {
	dir := t.TempDir()
	// hub.yaml does not exist
	h, err := loadFrom(dir)
	if err != nil {
		t.Fatalf("expected no error for missing hub.yaml, got %v", err)
	}
	if len(h.Repos) != 0 {
		t.Errorf("expected empty hub, got %d repos", len(h.Repos))
	}
}

func TestListNames(t *testing.T) {
	h, _ := tempHub(t)
	for _, name := range []string{"a", "b", "c"} {
		if err := h.Add(initRepo(t, name)); err != nil {
			t.Fatal(err)
		}
	}
	names := h.ListNames()
	if len(names) != 3 {
		t.Fatalf("expected 3 names, got %v", names)
	}
}
