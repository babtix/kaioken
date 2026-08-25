// Package state tracks per-module source hashes so `ainow update` can
// regenerate only modules whose scoped files actually changed.
package state

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"kaioken/internal/config"
	"kaioken/internal/scan"
)

// ModuleState records what a module's cards were generated from.
type ModuleState struct {
	SourceHash  string    `json:"source_hash"`
	Model       string    `json:"model"`
	GeneratedAt time.Time `json:"generated_at"`
	FileCount   int       `json:"file_count"`
	// Commit is the HEAD the cards were generated at, when the repo is git.
	// It is the diff baseline for incremental card revision: a changed module
	// with a resolvable commit gets its cards revised against the diff
	// instead of rebuilt from the full source bundle. Empty on non-git repos
	// and on states written before the field existed — both fall back to a
	// full rebuild.
	Commit string `json:"commit,omitempty"`
}

// State is the persisted .ainow/state.json.
type State struct {
	Modules map[string]ModuleState `json:"modules"`
}

func path(repo string) string {
	return filepath.Join(repo, config.Dir, "state.json")
}

// Load reads state, returning an empty state when missing.
func Load(repo string) (*State, error) {
	raw, err := os.ReadFile(path(repo))
	if err != nil {
		if os.IsNotExist(err) {
			return &State{Modules: map[string]ModuleState{}}, nil
		}
		return nil, err
	}
	var s State
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil, fmt.Errorf("parsing state.json: %w", err)
	}
	if s.Modules == nil {
		s.Modules = map[string]ModuleState{}
	}
	return &s, nil
}

// Save writes state.json.
func (s *State) Save(repo string) error {
	if err := os.MkdirAll(filepath.Join(repo, config.Dir), 0o755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path(repo), raw, 0o644)
}

// HashFiles produces a deterministic content hash over a module's files.
func HashFiles(root string, files []scan.File) (string, error) {
	sorted := make([]scan.File, len(files))
	copy(sorted, files)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Path < sorted[j].Path })

	h := sha256.New()
	for _, f := range sorted {
		fmt.Fprintf(h, "%s\x00", f.Path)
		raw, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(f.Path)))
		if err != nil {
			// A vanished file still changes the hash via its path entry.
			continue
		}
		h.Write(raw)
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
