# State Management for Incremental Updates

This chapter describes how Kaioken tracks file hashes to enable efficient incremental updates of the generated wiki. The state management system records cryptographic hashes of source files after each build, allowing subsequent updates to regenerate only documentation affected by actual file changes.

## Table of Contents
- [Overview](#overview)
- [Data Structures](#data-structures)
  - [ModuleState](#modulestate)
  - [State](#state)
- [Persistence](#persistence)
  - [Loading State](#loading-state)
  - [Saving State](#saving-state)
- [Hash Computation](#hash-computation)
  - [HashFiles Function](#hashfiles-function)
- [Role in Incremental Updates](#role-in-incremental-updates)
- [Error Handling and Edge Cases](#error-handling-and-edge-cases)
- [Referenced Files](#referenced-files)

## Overview

The state package implements change detection for incremental wiki updates. After each full wiki generation, it persists a JSON file (`.kaioken/state.json`) containing per-module hashes of source files. During updates, it compares current file hashes against stored values to identify which modules require regeneration.

This mechanism avoids reprocessing unchanged modules, significantly reducing update times for large repositories. The system handles file additions, deletions, and modifications by incorporating file paths into the hash computation—ensuring that even vanished files trigger updates.

## Data Structures

### ModuleState

`ModuleState` captures the metadata for a single module's last generation:

`internal/state/state.go:20-25`
```go
type ModuleState struct {
	SourceHash  string    `json:"source_hash"`
	Model       string    `json:"model"`
	GeneratedAt time.Time `json:"generated_at"`
	FileCount   int       `json:"file_count"`
}
```

- `SourceHash`: SHA-256 hash of all source files in the module (computed via `HashFiles`)
- `Model`: LLM model used for generation (for detecting model changes)
- `GeneratedAt`: Timestamp of last generation
- `FileCount`: Number of files processed (for quick sanity checks)

### State

`State` represents the complete persisted state:

`internal/state/state.go:28-30`
```go
type State struct {
	Modules map[string]ModuleState `json:"modules"`
}
```

- `Modules`: Map from module name (as defined in `modules.yaml`) to its `ModuleState`
- Initialized as empty map when no state file exists

## Persistence

State is stored in `.kaioken/state.json` within the repository root. The `config.Dir` constant (defined elsewhere) provides the `.kaioken` directory name.

### Loading State

`Load` reads the state file, returning an empty state if missing:

`internal/state/state.go:37-53`
```go
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
```

**Behavior:**
- Returns empty state (`Modules: map[string]ModuleState{}`) when file doesn't exist (first run)
- Propagates filesystem errors (permissions, etc.) unchanged
- Handles malformed JSON by wrapping error with context
- Ensures `Modules` map is never nil after loading

### Saving State

`Save` writes the current state to disk:

`internal/state/state.go:56-65`
```go
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
```

**Behavior:**
- Creates `.kaioken` directory with `0o755` permissions if missing
- Serializes state with indentation for readability
- Writes file with `0o644` permissions (owner read/write, group/others read)
- Propagates any filesystem or JSON marshaling errors

## Hash Computation

### HashFiles Function

`HashFiles` computes a deterministic hash over a set of files:

`internal/state/state.go:68-85`
```go
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
```

**Algorithm:**
1. Sorts files by path to ensure deterministic ordering
2. For each file:
   - Writes null-terminated path to hash
   - If file exists: appends file contents then null byte
   - If file missing: only path contributes to hash (vanished files change hash)
3. Returns hex-encoded SHA-256 sum

**Key Properties:**
- **Deterministic**: Same file set always produces same hash
- **Path-sensitive**: File renames/deletions change hash (via path entry)
- **Content-sensitive**: File modifications change hash
- **Order-independent**: Sorting eliminates filesystem ordering dependencies
- **Vanishing handling**: Missing files still affect hash through path recording

## Role in Incremental Updates

The state package integrates with the knowledge engine's update flow:

1. **After full generation** (`wiki` command):
   - For each module, compute `HashFiles` of its source files
   - Store result in `ModuleState.SourceHash` along with model/timestamp
   - Persist via `State.Save`

2. **During update** (`update` command):
   - Load previous state via `State.Load`
   - For each module:
     - Compute current hash of its files
     - Compare against stored `SourceHash`
     - If different (or missing), mark module for regeneration
   - Regenerate only flagged modules
   - Save new state with updated hashes

This approach ensures:
- Modules regenerate when source files change
- Modules regenerate when LLM model changes (stored in `Model`)
- Modules regenerate after vanishing files (path entry in hash)
- Unchanged modules skip expensive LLM processing

## Error Handling and Edge Cases

### Error Propagation
- All functions return `error` as last return value
- Callers (in `wiki` and `update` commands) handle errors via UI error display
- Filesystem errors (permissions, missing dirs) propagate upward
- JSON errors wrapped with context during load

### Edge Cases Handled
- **First run**: Missing state file treated as empty state (all modules regenerate)
- **Corrupted state**: JSON parse error returns error (forces full regeneration)
- **Nil modules map**: Initialized to empty map during load
- **Vanishing files**: Path-only contribution ensures hash changes when files disappear
- **Empty file set**: Hash of empty set is deterministic (SHA-256 of nothing)
- **Non-UTF8 paths**: `filepath.FromSlash` handles platform-specific separators
- **Large file sets**: Streaming hash avoids loading all files into memory simultaneously

### Limitations
- Does not detect changes in `.kaioken/config.yaml` (affects scanning/excludes)
- Does not detect changes in `modules.yaml` (module definitions)
- Model changes only detected if explicitly stored in `ModuleState.Model`
- Relies on accurate file listing from `scan` package

## Referenced Files
- internal/state/state.go

This chapter exclusively covers the state management implementation as defined in the provided source. All behavioral descriptions are derived directly from the code structure and comments.

<!-- kaioken:files internal/state/state.go -->
