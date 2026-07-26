package config

import (
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// Global is the per-user configuration stored at ~/.kaioken/config.yaml.
// It survives restarts and applies across repositories: API keys per provider
// plus default provider/model. Repo config (.kaioken/config.yaml) overrides
// the defaults; keys live ONLY here so they are never committed with a repo.
type Global struct {
	DefaultProvider string            `yaml:"default_provider,omitempty"`
	DefaultModel    string            `yaml:"default_model,omitempty"`
	Keys            map[string]string `yaml:"keys,omitempty"` // provider → API key
}

// HomeEnv overrides the directory holding the global config. Tests MUST set
// it: this file holds the user's real API keys, and anything exercising the
// key-entry path would otherwise overwrite them in the developer's home
// directory. It is also a legitimate escape hatch for sandboxed environments.
const HomeEnv = "KAIOKEN_HOME"

// GlobalPath returns ~/.kaioken/config.yaml, or $KAIOKEN_HOME/config.yaml.
func GlobalPath() string {
	return filepath.Join(GlobalDir(), "config.yaml")
}

// GlobalDir returns the per-user Kaioken directory: ~/.kaioken, or
// $KAIOKEN_HOME when set. It is the home of cross-repo state that must never
// be committed — global config (keys), and the user memory file (USER.md).
func GlobalDir() string {
	if dir := os.Getenv(HomeEnv); dir != "" {
		return dir
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "."
	}
	return filepath.Join(home, ".kaioken")
}

// LoadGlobal reads the global config, returning an empty one when missing.
func LoadGlobal() *Global {
	g := &Global{Keys: map[string]string{}}
	raw, err := os.ReadFile(GlobalPath())
	if err != nil {
		return g
	}
	_ = yaml.Unmarshal(raw, g)
	if g.Keys == nil {
		g.Keys = map[string]string{}
	}
	return g
}

// Save writes the global config with restrictive permissions (it holds keys).
func (g *Global) Save() error {
	path := GlobalPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	raw, err := yaml.Marshal(g)
	if err != nil {
		return err
	}
	header := []byte("# kaioken user configuration — holds API keys and defaults.\n" +
		"# Keys are stored per provider; do not commit this file anywhere.\n")
	return os.WriteFile(path, append(header, raw...), 0o600)
}
