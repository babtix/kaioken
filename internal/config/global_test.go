package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestMain keeps this package away from the real ~/.kaioken/config.yaml, which
// holds the user's live API keys. See internal/tui/main_test.go.
func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "kaioken-test-home")
	if err != nil {
		panic("cannot create a temp config home: " + err.Error())
	}
	if err := os.Setenv(HomeEnv, dir); err != nil {
		panic("cannot sandbox the config home: " + err.Error())
	}
	code := m.Run()
	os.RemoveAll(dir)
	os.Exit(code)
}

// The override is what stops tests from clobbering a real API key, so it is
// itself worth a test.
func TestGlobalPathHonorsHomeEnv(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(HomeEnv, dir)

	got := GlobalPath()
	if want := filepath.Join(dir, "config.yaml"); got != want {
		t.Fatalf("GlobalPath() = %q, want %q", got, want)
	}

	// With the override in place, saving must land in the sandbox and nowhere
	// near the user's home directory.
	g := &Global{DefaultProvider: "openrouter", Keys: map[string]string{"openrouter": "sk-test"}}
	if err := g.Save(); err != nil {
		t.Fatalf("Save: %v", err)
	}
	raw, err := os.ReadFile(got)
	if err != nil {
		t.Fatalf("the config did not land in the sandbox: %v", err)
	}
	if !strings.Contains(string(raw), "sk-test") {
		t.Error("saved config is missing the key it was given")
	}

	// A prefix check against the home directory would be wrong on Windows,
	// where temp dirs live under it. What matters is that the override never
	// resolves to the real config file.
	if home, err := os.UserHomeDir(); err == nil {
		if real := filepath.Join(home, ".kaioken", "config.yaml"); got == real {
			t.Errorf("GlobalPath() resolved to the real user config: %q", got)
		}
	}
}

// A round trip through Save/LoadGlobal must preserve keys and defaults.
func TestGlobalRoundTrip(t *testing.T) {
	t.Setenv(HomeEnv, t.TempDir())

	want := &Global{
		DefaultProvider: "openrouter",
		DefaultModel:    "anthropic/claude-sonnet-4",
		Keys:            map[string]string{"openrouter": "sk-one", "groq": "sk-two"},
	}
	if err := want.Save(); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got := LoadGlobal()
	if got.DefaultProvider != want.DefaultProvider || got.DefaultModel != want.DefaultModel {
		t.Errorf("defaults did not round trip: %+v", got)
	}
	for prov, key := range want.Keys {
		if got.Keys[prov] != key {
			t.Errorf("key for %q = %q, want %q", prov, got.Keys[prov], key)
		}
	}
}

// A missing file is normal on a first run and must not be an error.
func TestLoadGlobalWhenMissing(t *testing.T) {
	t.Setenv(HomeEnv, t.TempDir())

	g := LoadGlobal()
	if g == nil {
		t.Fatal("LoadGlobal returned nil")
	}
	if g.Keys == nil {
		t.Error("Keys must be a usable map even when no config exists")
	}
}
