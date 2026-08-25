package ext

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"kaioken/internal/config"
)

// Root is the per-user directory holding every installed extension plus the
// lockfile and the registry cache. Extensions are per-user rather than
// per-repo, like an editor's: install once, available in every repository.
func Root() string { return filepath.Join(config.GlobalDir(), "extensions") }

// InstallDir is where one extension version lives. Keeping the version in
// the path is what makes updates rollback-friendly: the old tree survives
// until the new one is installed and recorded.
func InstallDir(id, version string) string { return filepath.Join(Root(), id, version) }

func lockPath() string { return filepath.Join(Root(), "lock.json") }

// Installed is one lockfile entry: what is installed, where it came from,
// and the hash of the exact archive that produced it. The tag alone is not
// enough — GitHub tags are mutable — so CommitSHA and SHA256 pin what was
// actually downloaded and keep installs auditable.
type Installed struct {
	ID          string    `json:"id"`
	Version     string    `json:"version"`
	Repo        string    `json:"repo"` // owner/name
	Tag         string    `json:"tag"`
	CommitSHA   string    `json:"commit_sha,omitempty"`
	SHA256      string    `json:"sha256"`
	InstalledAt time.Time `json:"installed_at"`
	// Enabled keeps an extension on disk but out of the agent's catalog —
	// cheaper than uninstall/reinstall when debugging which one misbehaves.
	Enabled bool `json:"enabled"`
	// TrustedVersion is the exact version the user explicitly trusted to run
	// as a subprocess (mcp extensions only). It must equal Version to count,
	// so every update automatically revokes trust until the user re-grants
	// it against the new code. Empty for declarative extensions.
	TrustedVersion string `json:"trusted_version,omitempty"`
}

// Lock is the installed-extension ledger.
type Lock struct {
	Extensions []Installed `json:"extensions"`
}

// LoadLock reads the lockfile; a missing file is an empty lock, not an
// error, matching how the global config behaves.
func LoadLock() (*Lock, error) {
	l := &Lock{}
	raw, err := os.ReadFile(lockPath())
	if err != nil {
		if os.IsNotExist(err) {
			return l, nil
		}
		return nil, err
	}
	if err := json.Unmarshal(raw, l); err != nil {
		return nil, fmt.Errorf("parsing %s: %w", lockPath(), err)
	}
	return l, nil
}

// Save writes the lockfile.
func (l *Lock) Save() error {
	if err := os.MkdirAll(Root(), 0o755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(l, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(lockPath(), raw, 0o644)
}

// Find returns the entry for an id, or nil when it is not installed.
func (l *Lock) Find(id string) *Installed {
	for i := range l.Extensions {
		if l.Extensions[i].ID == id {
			return &l.Extensions[i]
		}
	}
	return nil
}

// Upsert replaces the entry with e's id, or appends it, keeping the ledger
// sorted so listings and diffs of the lockfile stay stable.
func (l *Lock) Upsert(e Installed) {
	for i := range l.Extensions {
		if l.Extensions[i].ID == e.ID {
			l.Extensions[i] = e
			return
		}
	}
	l.Extensions = append(l.Extensions, e)
	sort.Slice(l.Extensions, func(i, j int) bool { return l.Extensions[i].ID < l.Extensions[j].ID })
}

// Remove drops an entry, reporting whether it existed.
func (l *Lock) Remove(id string) bool {
	for i := range l.Extensions {
		if l.Extensions[i].ID == id {
			l.Extensions = append(l.Extensions[:i], l.Extensions[i+1:]...)
			return true
		}
	}
	return false
}
