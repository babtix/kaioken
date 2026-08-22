# Skill Structure and Format

## Table of Contents
- [Skill Structure](#skill-structure)
- [Storage Format](#storage-format)
- [Skill Lifecycle](#skill-lifecycle)
- [Staleness and Updates](#staleness-and-updates)
- [Skill Index](#skill-index)
- [Referenced Files](#referenced-files)

## Skill Structure

The `Skill` struct defines the structure of a task guide that the agent can load to perform specific tasks. It contains metadata in YAML frontmatter and a Markdown body.

```go
// Skill is one generated capability document.
type Skill struct {
    // Name is a kebab-case identifier, also the directory name.
    Name string `yaml:"name"`
    // Description says what the skill covers and when to load it. Agent
    // runtimes match against this, so it carries the triggering weight.
    Description string `yaml:"description"`
    // Sources are the repo-relative files this skill was written from. They
    // drive incremental refresh: when one changes, the skill is stale.
    Sources     []string  `yaml:"sources,omitempty"`
    GeneratedAt time.Time `yaml:"generated_at,omitempty"`
    Model       string    `yaml:"model,omitempty"`

    // Origin records how this skill came to exist. A generated skill is
    // written from static analysis; a learned one is distilled from a session
    // that actually did the task; a human one was dropped in by hand. The
    // distinction is what lets a reviewer tell a hard-won lesson from a guess.
    Origin string `yaml:"origin,omitempty"`
    // UseCount is how many sessions opened this skill and followed it to a
    // clean outcome. It is the reinforcement signal: a loaded skill that
    // worked is more likely to be the right answer next time.
    UseCount int `yaml:"use_count,omitempty"`
    // LastUsed is the most recent session that consulted this skill, so a
    // skill nobody has reached for in a long time can be flagged for pruning.
    LastUsed time.Time `yaml:"last_used,omitempty"`
    // Sessions records the ids of sessions that contributed to or reinforced
    // this skill, so a learned skill carries its provenance and can be
    // reverted to the generated baseline when a lesson turns out wrong.
    Sessions []string `yaml:"sessions,omitempty"`

    // Body is the markdown after the frontmatter.
    Body string `yaml:"-"`
}
```
`internal/skills/skills.go:29-60`

- **Name**: Kebab-case identifier used as the directory name for the skill (e.g., `add-a-tui-command`).
- **Description**: Human-readable explanation of what the skill covers and when it should be triggered.
- **Sources**: List of repository-relative file paths the skill was derived from; used for staleness detection.
- **GeneratedAt**: Timestamp when the skill was created.
- **Model**: LLM model used to generate the skill.
- **Origin**: How the skill originated (`generated`, `learned`, or `human`). Hand-written skills without frontmatter are treated as `human`.
- **UseCount**: Number of times the skill was successfully used in a session.
- **LastUsed**: Timestamp of the most recent session that used the skill.
- **Sessions**: List of session IDs that contributed to or reinforced the skill.
- **Body**: Markdown content stored separately from frontmatter (excluded from YAML marshaling via `yaml:"-"`).

## Storage Format

Skills are stored as `SKILL.md` files in a repository's `.kaioken/skills/` directory. Each skill resides in its own subdirectory named after its `Name` field.

The file format consists of YAML frontmatter delimited by `---` lines, followed by the Markdown body:

```
---
name: add-a-tui-command
description: How to add a slash command. Use when adding or changing TUI commands.
sources:
- internal/tui/tui.go
- internal/tui/logo.go
generated_at: 2024-01-01T12:00:00Z
model: test/model
origin: generated
use_count: 0
---

# Add a TUI command

## Steps
1. Edit dispatch.
```

The `Render` method serializes a `Skill` instance to this format:

```go
// Render produces the full SKILL.md text: frontmatter then body.
func (s *Skill) Render() string {
    meta := *s
    raw, err := yaml.Marshal(&meta)
    if err != nil {
        raw = []byte("name: " + s.Name + "\n")
    }
    return "---\n" + string(raw) + "---\n\n" + strings.TrimLeft(s.Body, "\n")
}
```
`internal/skills/skills.go:108-115`

If YAML marshaling fails, it falls back to a minimal frontmatter containing only the name. The body is trimmed of leading newlines to ensure proper formatting.

The `Parse` function deserializes a `SKILL.md` file into a `Skill` struct:

```go
// Parse splits a SKILL.md into frontmatter and body. A file without
// frontmatter is not an error: it is treated as a hand-written skill whose
// name comes from its directory, so a user can drop one in by hand.
func Parse(text string) (*Skill, error) {
    text = strings.ReplaceAll(text, "\r\n", "\n")
    if !strings.HasPrefix(text, "---\n") {
        return &Skill{Body: text}, nil
    }
    rest := text[4:]
    end := strings.Index(rest, "\n---")
    if end == -1 {
        return &Skill{Body: text}, nil
    }
    var s Skill
    if err := yaml.Unmarshal([]byte(rest[:end+1]), &s); err != nil {
        return nil, fmt.Errorf("parsing skill frontmatter: %w", err)
    }
    body := rest[end+4:]
    s.Body = strings.TrimLeft(body, "\n")
    return &s, nil
}
```
`internal/skills/skills.go:118-127`

Files without frontmatter are treated as hand-written skills: the entire content becomes the `Body`, and the `Name` is left empty (to be populated from the directory name during loading). When loaded via `List`, such skills have their `Origin` automatically set to `OriginHuman` by `inferOrigin()`.

## Skill Lifecycle

### Creation and Saving

To persist a skill, the `Save` method creates the skill's directory and writes the rendered `SKILL.md`:

```go
// Save writes the skill to disk.
func (s *Skill) Save(repo string) error {
    if s.Name == "" {
        return fmt.Errorf("skill has no name")
    }
    dir := filepath.Join(Dir(repo), s.Name)
    if err := os.MkdirAll(dir, 0o755); err != nil {
        return err
    }
    return os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte(s.Render()), 0o644)
}
```
`internal/skills/skills.go:118-127`

Steps:
1. Validate that the skill has a non-empty name.
2. Create the directory `.kaioken/skills/<Name>` with permissions `0o755`.
3. Write the rendered content to `.kaioken/skills/<Name>/SKILL.md` with permissions `0o644`.

### Loading

The `Load` function reads and parses a skill by name:

```go
// Load reads one skill by name.
func Load(repo, name string) (*Skill, error) {
    raw, err := os.ReadFile(Path(repo, name))
    if err != nil {
        return nil, err
    }
    return Parse(string(raw))
}
```
`internal/skills/skills.go:130-136`

It uses `Path(repo, name)` to locate the file at `.kaioken/skills/<name>/SKILL.md`, then delegates to `Parse`.

### Listing

The `List` function enumerates all skills in a repository:

```go
// List returns every skill in a repository, by name. A missing directory means
// none have been generated yet, which is not an error.
func List(repo string) ([]*Skill, error) {
    entries, err := os.ReadDir(Dir(repo))
    if err != nil {
        if os.IsNotExist(err) {
            return nil, nil
        }
        return nil, err
    }
    var out []*Skill
    for _, e := range entries {
        if !e.IsDir() {
            continue
        }
        s, err := Load(repo, e.Name())
        if err != nil {
            continue // a malformed skill must not hide the rest
        }
        if s.Name == "" {
            s.Name = e.Name() // hand-written skill: fall back to the directory
        }
        s.inferOrigin()
        out = append(out, s)
    }
    sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
    return out, nil
}
```
`internal/skills/skills.go:141-158`

Steps:
1. Read the `.kaioken/skills/` directory (returning `nil, nil` if it doesn't exist).
2. For each subdirectory:
   - Skip non-directories.
   - Attempt to load the skill from `SKILL.md`.
   - Skip malformed skills (to avoid hiding valid ones).
   - For hand-written skills (empty `Name`), use the directory name as the skill's name.
   - Call `inferOrigin()` to set the `Origin` field for skills missing it (pre-existing skills).
3. Sort skills alphabetically by name and return the list.

The `inferOrigin` method sets the `Origin` field for skills written before the field existed:

```go
// inferOrigin fills Origin for skills written before the field existed, so the
// catalog can still tell a generated baseline from a hand-written one. A skill
// with generated_at was produced by skills.Run; one with only a body is human.
func (s *Skill) inferOrigin() {
    if s.Origin != "" {
        return
    }
    if !s.GeneratedAt.IsZero() {
        s.Origin = OriginGenerated
        return
    }
    s.Origin = OriginHuman
}
```
`internal/skills/skills.go:192-201`

## Staleness and Updates

The `Stale` function identifies skills requiring regeneration based on file changes:

```go
// Stale reports the skills whose sources intersect the changed paths, so an
// update refreshes only what the change actually invalidates.
func Stale(all []*Skill, changed []string) []*Skill {
    if len(changed) == 0 {
        return nil
    }
    var out []*Skill
    for _, s := range all {
        if intersects(s.Sources, changed) {
            out = append(out, s)
        }
    }
    return out
}
```
`internal/skills/skills.go:205-216`

The `intersects` helper determines if any changed path affects a skill's sources:

```go
// intersects reports whether any changed path falls under a source entry,
// treating a source as a file or a directory prefix.
func intersects(sources, changed []string) bool {
    for _, src := range sources {
        src = strings.Trim(filepath.ToSlash(strings.TrimSpace(src)), "/")
        if src == "" {
            continue
        }
        for _, c := range changed {
            c = filepath.ToSlash(c)
            if c == src || strings.HasPrefix(c, src+"/") {
                return true
            }
        }
    }
    return false
}
```
`internal/skills/skills.go:220-234`

Behavior:
- Returns `nil` if no files changed.
- For each skill, checks if any changed path:
  - Exactly matches a source entry (file), or
  - Has a source entry as a prefix followed by `/` (indicating the change is within a directory source).
- Normalizes paths by converting to forward slashes and trimming spaces and surrounding slashes.
- Ignores empty source entries.

Example: A skill with source `internal/tui` is invalidated by changes to `internal/tui/tui.go` (prefix match) but not by `internal/llmx/other.go` (prefix `internal/llmx` doesn't match `internal/tui`).

## Skill Index

The `WriteIndex` function generates a `README.md` in the skills directory that serves as a discoverable catalog for agents:

```go
// WriteIndex renders the skills README: the catalog an agent reads to decide
// which skill to open.
func WriteIndex(repo string, all []*Skill) error {
    if len(all) == 0 {
        return nil
    }
    var b strings.Builder
    b.WriteString("# Project Skills\n\n")
    b.WriteString("Task-oriented guides for working in this repository, generated by Kaioken.\n")
    b.WriteString("Each skill says how to perform one recurring task here — which files to\n")
    b.WriteString("touch, in what order, and which local conventions apply.\n\n")
    b.WriteString("Open the skill matching your task before you start.\n\n")
    for _, s := range all {
        fmt.Fprintf(&b, "## [%s](%s/SKILL.md)\n%s\n\n", s.Name, s.Name, s.Description)
    }
    if err := os.MkdirAll(Dir(repo), 0o755); err != nil {
        return err
    }
    return os.WriteFile(filepath.Join(Dir(repo), "README.md"), []byte(b.String()), 0o644)
}
```
`internal/skills/skills.go:238-255`

Output example:
```
# Project Skills

Task-oriented guides for working in this repository, generated by Kaioken.
Each skill says how to perform one recurring task here — which files to
touch, in what order, and which local conventions apply.

Open the skill matching your task before you start.

## [add-a-command](add-a-command/SKILL.md)
Adding CLI commands.

## [run-tests](run-tests/SKILL.md)
Running the suite.
```

If no skills exist, no file is written. The directory is created with `0o755` permissions if needed.

## Referenced Files
- internal/skills/skills.go

<!-- kaioken:files internal/skills/skills.go,internal/skills/skills_test.go -->
