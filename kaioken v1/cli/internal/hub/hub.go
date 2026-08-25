// Package hub manages a cross-repo registry stored at ~/.kaioken/hub.yaml.
// It lets a single Kaioken installation track multiple repositories and gives
// a one-stop freshness view across all of them.
package hub

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gopkg.in/yaml.v3"

	"kaioken/internal/config"
)

// Hub is the top-level structure persisted to hub.yaml.
type Hub struct {
	Repos []RepoEntry `yaml:"repos"`
	// dir is the directory holding hub.yaml; set by Load so Save does not need
	// a separate call. Not persisted.
	dir string
}

// RepoEntry is one registered repository.
type RepoEntry struct {
	Path  string    `yaml:"path"`
	Name  string    `yaml:"name"`
	Added time.Time `yaml:"added"`
}

// hubPath returns the full path to hub.yaml under dir (the global config dir
// or an override for tests).
func hubPath(dir string) string {
	return filepath.Join(dir, "hub.yaml")
}

// Load reads hub.yaml from the global Kaioken directory. Returns an empty Hub
// when the file does not exist.
func Load() (*Hub, error) {
	return loadFrom(config.GlobalDir())
}

// loadFrom reads hub.yaml from dir. Exported for test overrides.
func loadFrom(dir string) (*Hub, error) {
	h := &Hub{dir: dir}
	raw, err := os.ReadFile(hubPath(dir))
	if errors.Is(err, os.ErrNotExist) {
		return h, nil
	}
	if err != nil {
		return nil, fmt.Errorf("hub: read %s: %w", hubPath(dir), err)
	}
	if err := yaml.Unmarshal(raw, h); err != nil {
		return nil, fmt.Errorf("hub: parse %s: %w", hubPath(dir), err)
	}
	h.dir = dir
	return h, nil
}

// Save persists the hub to its directory.
func (h *Hub) Save() error {
	dir := h.dir
	if dir == "" {
		dir = config.GlobalDir()
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("hub: mkdir %s: %w", dir, err)
	}
	raw, err := yaml.Marshal(h)
	if err != nil {
		return fmt.Errorf("hub: marshal: %w", err)
	}
	return os.WriteFile(hubPath(dir), raw, 0o600)
}

// Add registers path in the hub. The path is converted to an absolute path
// and validated: it must exist and contain a .kaioken directory. Duplicate
// entries (same absolute path) are silently ignored.
func (h *Hub) Add(path string) error {
	abs, err := filepath.Abs(path)
	if err != nil {
		return fmt.Errorf("hub add: %w", err)
	}
	// Validate .kaioken exists so we only track initialized repositories.
	if _, err := os.Stat(filepath.Join(abs, ".kaioken")); err != nil {
		return fmt.Errorf("hub add: %s does not have a .kaioken directory (run `kaioken init` first)", abs)
	}
	// Dedup by absolute path.
	for _, r := range h.Repos {
		if r.Path == abs {
			return nil
		}
	}
	name := filepath.Base(abs)
	h.Repos = append(h.Repos, RepoEntry{Path: abs, Name: name, Added: time.Now().UTC()})
	return nil
}

// Remove deletes the first entry whose name or absolute path matches nameOrPath.
func (h *Hub) Remove(nameOrPath string) error {
	abs, _ := filepath.Abs(nameOrPath)
	for i, r := range h.Repos {
		if r.Name == nameOrPath || r.Path == abs || r.Path == nameOrPath {
			h.Repos = append(h.Repos[:i], h.Repos[i+1:]...)
			return nil
		}
	}
	return fmt.Errorf("hub remove: %q not found", nameOrPath)
}

// Find returns the entry for nameOrPath (same matching logic as Remove), or an
// error when it is not registered.
func (h *Hub) Find(nameOrPath string) (RepoEntry, bool) {
	abs, _ := filepath.Abs(nameOrPath)
	for _, r := range h.Repos {
		if r.Name == nameOrPath || r.Path == abs || r.Path == nameOrPath {
			return r, true
		}
	}
	return RepoEntry{}, false
}

// ListNames returns the names of all registered repos, in registration order.
func (h *Hub) ListNames() []string {
	names := make([]string, len(h.Repos))
	for i, r := range h.Repos {
		names[i] = r.Name
	}
	return names
}

// ValidatePath checks that nameOrPath refers to an existing directory with a
// .kaioken folder. It does not require the entry to be registered.
func ValidatePath(path string) error {
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	info, err := os.Stat(abs)
	if err != nil {
		return fmt.Errorf("%s: %w", abs, err)
	}
	if !info.IsDir() {
		return fmt.Errorf("%s is not a directory", abs)
	}
	if _, err := os.Stat(filepath.Join(abs, ".kaioken")); err != nil {
		return fmt.Errorf("%s has no .kaioken directory", abs)
	}
	return nil
}

// FormatTable renders a text table of repos with their names and paths.
func (h *Hub) FormatTable() string {
	if len(h.Repos) == 0 {
		return "no repos registered\n"
	}
	var sb strings.Builder
	for _, r := range h.Repos {
		sb.WriteString(fmt.Sprintf("  %-20s %s\n", r.Name, r.Path))
	}
	return sb.String()
}
