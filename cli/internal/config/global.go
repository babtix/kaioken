package config

import (
	"os"
	"path/filepath"
	"time"

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
	// ExtRegistry overrides the community extension registry index URL.
	// Empty means the default public index.
	ExtRegistry string `yaml:"ext_registry,omitempty"`
	// SelfUpdate controls automatic self-update checks and behavior.
	SelfUpdate SelfUpdate `yaml:"selfupdate,omitempty"`
	// Research configures the `kaioken research` web pipeline.
	Research Research `yaml:"research,omitempty"`
	// Search sets the cross-repo default for knowledge retrieval. A repo's own
	// config wins; this is where a user points every workspace at one local
	// embedding server once instead of per repo.
	Search Search `yaml:"search,omitempty"`
	// Local lists user-defined local model endpoints (Ollama, LM Studio,
	// llama.cpp, vLLM). They join the built-in provider registry at runtime so
	// the rest of the system cannot tell a local endpoint from a hosted one.
	Local []LocalEndpoint `yaml:"local,omitempty"`
}

// LocalEndpoint is one OpenAI-compatible server running on the user's own
// machine or network. No API key is required or expected.
type LocalEndpoint struct {
	// Name is the provider name it registers under, e.g. "lmstudio".
	Name string `yaml:"name"`
	// BaseURL is the OpenAI-compatible root, e.g. "http://localhost:1234/v1".
	BaseURL string `yaml:"base_url"`
	// Label is an optional human name for the UI.
	Label string `yaml:"label,omitempty"`
}

// Research configures web research. The search providers' API keys live in
// the same Keys map as the LLM provider keys, under the provider's name
// ("tavily", "firecrawl", "brave", "exa").
type Research struct {
	// SearchProvider picks the search backend(s). Empty, "auto", "both" or
	// "all" fan out to every provider holding a key; a single name pins one;
	// a comma-separated list ("tavily,firecrawl") names a subset. When the
	// selection includes firecrawl, its scrape API also reads the pages.
	SearchProvider string `yaml:"search_provider,omitempty"`
	// MaxRounds overrides the search→read→reason→gap loop budget. Zero lets
	// the ×N multiplier decide.
	MaxRounds int `yaml:"max_rounds,omitempty"`
	// MaxMinutes stops a run once it has taken this long and reports on what
	// it gathered, rather than letting a deep multiplier run unbounded. Zero
	// means no limit. Rounds are only ever abandoned between stages, so the
	// report is still written and still cited.
	MaxMinutes int `yaml:"max_minutes,omitempty"`
}

// ResearchTimeout is the run duration MaxMinutes describes, or zero when the
// user has set no limit.
func (r Research) ResearchTimeout() time.Duration {
	if r.MaxMinutes <= 0 {
		return 0
	}
	return time.Duration(r.MaxMinutes) * time.Minute
}

// SelfUpdate configures background checks for a newer kaioken release.
// Checks only ever notify: installing is always the explicit `kaioken
// upgrade` command, never something a background check does on its own.
type SelfUpdate struct {
	// Enabled turns background update checking on/off.
	Enabled bool `yaml:"enabled"`
	// Channel selects which release channel to track: stable, beta, nightly.
	// Empty and unrecognised values fall back to stable.
	Channel string `yaml:"channel"`
	// IntervalHours is how often to check for updates (0 = only manual).
	IntervalHours int `yaml:"interval_hours"`
	// NotifyOnly is retained so existing configs keep parsing. Background
	// checks notify unconditionally, so setting it false does not opt into
	// an automatic install.
	NotifyOnly bool `yaml:"notify_only"`
	// ShowProgress prints download progress during `kaioken upgrade`.
	ShowProgress bool `yaml:"show_progress"`
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
