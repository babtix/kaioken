# Skill Refreshing and Invalidation

Explains how the system identifies stale skills when source files change and regenerates them efficiently by tracking file dependencies and incrementally updating only affected skills.

## Table of Contents
- [Skill Representation and Storage](#skill-representation-and-storage)
- [Dependency Tracking and Staleness Detection](#dependency-tracking-and-staleness-detection)
- [Efficient Skill Regeneration](#efficient-skill-regeneration)
- [Referenced Files](#referenced-files)

## Skill Representation and Storage

Skills are stored as `SKILL.md` files in `.kaioken/skills/<name>/` within the repository. Each skill contains metadata and procedural guidance for agent tasks.

### Skill Structure

The `Skill` struct defines the on-disk format:

`internal/skills/skills.go:29-60`
```go
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

The `Sources` field is critical for invalidation: it lists the repo-relative files or directories the skill was generated from. When any of these files change, the skill becomes stale.

The `Origin`, `UseCount`, `LastUsed`, and `Sessions` fields track skill provenance and usage for intelligent management:
- `Origin` distinguishes generated (static analysis), learned (from actual task sessions), and human-created skills
- `UseCount` and `LastUsed` measure skill reinforcement and staleness from disuse
- `Sessions` preserves provenance for learned skills to allow reverting to generated baselines

### Skill Path Helpers

Skills are stored in a standardized location:

`internal/skills/skills.go:63`
```go
func Dir(repo string) string { return filepath.Join(repo, config.Dir, "skills") }
```

`internal/skills/skills.go:76-78`
```go
func Path(repo, name string) string {
	return filepath.Join(Dir(repo), name, "SKILL.md")
}
```

The `Slug` function normalizes skill names into safe directory names:

`internal/skills/skills.go:81-105`
```go
func Slug(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	lastDash := true // trims leading dashes
	for _, r := range s {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			b.WriteRune(r)
			lastDash = false
		case r == '-' || r == '_' || r == ' ' || r == '/' || r == '.':
			if !lastDash {
				b.WriteByte('-')
				lastDash = true
			}
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		out = "skill"
	}
	if len(out) > 60 {
		out = strings.Trim(out[:60], "-")
	}
	return out
}
```

### Skill Serialization

Skills are serialized to disk with YAML frontmatter:

`internal/skills/skills.go:108-115`
```go
func (s *Skill) Render() string {
	meta := *s
	raw, err := yaml.Marshal(&meta)
	if err != nil {
		raw = []byte("name: " + s.Name + "\n")
	}
	return "---\n" + string(raw) + "---\n\n" + strings.TrimLeft(s.Body, "\n")
}
```

`internal/skills/skills.go:118-127`
```go
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

func Load(repo, name string) (*Skill, error) {
	raw, err := os.ReadFile(Path(repo, name))
	if err != nil {
		return nil, err
	}
	return Parse(string(raw))
}
```

`internal/skills/skills.go:130-136`
```go
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

### Skill Indexing

`List` enumerates all skills in a repository and infers origin for skills lacking it:

`internal/skills/skills.go:162-187`
```go
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

`inferOrigin` fills the Origin field for skills written before the field existed:

`internal/skills/skills.go:192-201`
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

`WriteIndex` generates a README.md catalog for agent skill discovery:

`internal/skills/skills.go:205-216`
```go
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

## Dependency Tracking and Staleness Detection

The system tracks which files each skill depends on via the `Sources` field. When files change, it efficiently identifies stale skills by checking for path intersections.

### Staleness Determination

`Stale` filters skills whose sources intersect with changed file paths:

`internal/skills/skills.go:220-231`
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

`intersects` implements the path matching logic, treating sources as file paths or directory prefixes:

`internal/skills/skills.go:235-249`
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

**How it works:**
1. Each source is normalized (trimmed, converted to forward slashes)
2. Each changed path is similarly normalized
3. A skill is stale if any changed path:
   - Exactly matches a source (`c == src`), OR
   - Is contained within a source directory (`strings.HasPrefix(c, src+"/")`)

This means:
- A skill depending on `src/main.go` is stale if `src/main.go` changes
- A skill depending on `src/` is stale if any file under `src/` changes
- A skill depending on `docs/api` is stale if `docs/api/reference.md` changes

### Visualizing Intersection Logic

```mermaid
graph TD
    A[Changed Path] --> B{Normalize path}
    B --> C{Check against each source}
    C --> D{Source normalized?}
    D -->|Yes| E{Equal to source?}
    E -->|Yes| F[Stale: true]
    E -->|No| G{Starts with source + "/"?}
    G -->|Yes| F[Stale: true]
    G -->|No| H[Check next source]
    D -->|No| H
    H --> I{More sources?}
    I -->|Yes| C
    I -->|No| J[Stale: false]
```

## Efficient Skill Regeneration

When files change (e.g., via `kaioken update`), the system regenerates only stale skills using the same generation logic as initial creation, but scoped to affected skills.

### Refresh Workflow

The `Refresh` function orchestrates incremental skill updates:

`internal/skills/generate.go:203-255`
```go
// Refresh regenerates only the skills whose sources the given paths changed.
// It is what `kaioken update` calls, so skills track the code like the wiki does.
func Refresh(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
	res *scan.Result, changed []string, pg Progress) ([]*Skill, error) {

	all, err := List(repo)
	if err != nil || len(all) == 0 {
		return nil, err
	}
	stale := Stale(all, changed)
	if len(stale) == 0 {
		return nil, nil
	}
	pg.info(fmt.Sprintf("%d skill(s) affected by the change", len(stale)))

	idx := codemap.Build(res)
	limit, _ := cfg.EffectiveConcurrency(client.Model)
	var mu sync.Mutex
	var updated []*Skill

	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(limit)
	for _, s := range stale {
		s := s
		g.Go(func() error {
			pg.started("refresh: " + s.Name)
			p := proposal{
				Name: s.Name, Description: s.Description,
				Task: s.Description, Files: s.Sources,
			}
			fresh, err := write(gctx, repo, cfg, client, res, idx, p)
			if err != nil {
				pg.failed(s.Name, err)
				return nil // one failed skill must not abort the set
			}
			if err := fresh.Save(repo); err != nil {
				pg.failed(s.Name, err)
				return nil
			}
			pg.wrote(filepath.ToSlash(filepath.Join(config.Dir, "skills", fresh.Name, "SKILL.md")),
				strings.Count(fresh.Body, "\n")+1)
			mu.Lock()
			updated = append(updated, fresh)
			mu.Unlock()
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return updated, err
	}
	if all, err := List(repo); err == nil {
		_ = WriteIndex(repo, all)
	}
	return updated, nil
}
```

**Key steps:**
1. List all existing skills
2. Identify stale skills using `Stale(all, changed)`
3. For each stale skill (processed in parallel with concurrency limits):
   - Create a `proposal` from the skill's existing metadata (name, description, task, sources)
   - Regenerate the skill body via `write()` (same function used in initial generation)
   - Save the updated skill to disk
4. Update the skills index (`README.md`)

### Skill Regeneration Core

The `write` function generates skill content from a proposal, used by both initial `Run` and `Refresh`:

`internal/skills/generate.go:313-363`
```go
func write(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
	res *scan.Result, idx *codemap.Index, p proposal) (*Skill, error) {

	files := resolve(res, p.Files)
	paths := make([]string, 0, len(files))
	for _, f := range files {
		paths = append(paths, f.Path)
	}

	var user strings.Builder
	fmt.Fprintf(&user, "Skill: %s\n\nTask it teaches:\n%s\n\nWhen it applies:\n%s\n",
		p.Name, p.Task, p.Description)
	if brief, err := os.ReadFile(filepath.Join(repo, config.Dir, "architecture.md")); err == nil {
		user.WriteString("\nArchitecture brief for this repository (use its vocabulary):\n")
		user.Write(brief)
		user.WriteString("\n")
	}
	if len(cfg.Notes) > 0 {
		user.WriteString("\nMaintainer steering notes (authoritative):\n")
		for _, n := range cfg.Notes {
			user.WriteString("- " + n + "\n")
		}
	}
	user.WriteString("\n")
	user.WriteString(idx.Bundle(paths, codemap.BundleOptions{
		Goal: p.Task + " " + p.Description, MaxTokens: cfg.MaxModuleTokens,
	}))

	body, err := client.Chat(ctx, writeSystem, user.String())
	if err != nil {
		return nil, err
	}
	body = unfence(strings.TrimSpace(body))
	if body == "" {
		return nil, fmt.Errorf("model returned an empty skill body")
	}

	desc := strings.TrimSpace(p.Description)
	if desc == "" {
		desc = p.Task
	}
	return &Skill{
		Name:        p.Name,
		Description: desc,
		Sources:     paths,
		GeneratedAt: time.Now().UTC(),
		Model:       client.Model,
		Origin:      OriginGenerated,
		Body:        body,
	}, nil
}
```

**Critical dependencies:**
- `resolve`: Maps skill source files to actual scanned files
- `codemap.Bundle`: Provides LLM context from the relevant source files
- `client.Chat`: Generates skill body using the write system prompt

### File Resolution

`resolve` converts skill source patterns (files/directories) to concrete scanned files:

`internal/skills/generate.go:366-384`
```go
// resolve maps scope entries (files or directory prefixes) onto scanned files.
func resolve(res *scan.Result, scope []string) []scan.File {
	seen := map[string]bool{}
	var out []scan.File
	for _, s := range scope {
		s = strings.Trim(filepath.ToSlash(strings.TrimSpace(s)), "/")
		if s == "" {
			continue
		}
		for _, f := range res.Files {
			if f.Path == s || strings.HasPrefix(f.Path, s+"/") {
				if !seen[f.Path] {
					seen[f.Path] = true
					out = append(out, f)
				}
			}
		}
	}
	return out
}
```

This ensures skills regenerate with the same file set as originally used, even if intermediate file changes occurred.

### Parallel Processing

Both `Run` and `Refresh` use `errgroup` for controlled concurrency:

`internal/skills/generate.go:128-199` (in `Run`)
```go
limit, _ := cfg.EffectiveConcurrency(client.Model)
var mu sync.Mutex
var written []*Skill

g, gctx := errgroup.WithContext(ctx)
g.SetLimit(limit)
// ... goroutine per skill
```

`internal/skills/generate.go:203-255` (in `Refresh`)
```go
limit, _ := cfg.EffectiveConcurrency(client.Model)
var mu sync.Mutex
var updated []*Skill

g, gctx := errgroup.WithContext(ctx)
g.SetLimit(limit)
// ... goroutine per stale skill
```

This limits simultaneous LLM calls based on model-specific concurrency settings from `config.EffectiveConcurrency`.

### Regeneration Example Flow

```mermaid
sequenceDiagram
    participant User
    participant CLI as kaioken update
    participant Skills as skills package
    participant LLM
    participant CodeMap as codemap

    User->>CLI: run update (changed: [src/api/handlers.go])
    CLI->>Skills: Refresh(repo, changed)
    Skills->>Skills: List all skills
    Skills->>Skills: Stale(all, changed)
    Skills->>Skills: intersects(skill.Sources, changed)
    alt skill "add-api-endpoint" has sources ["src/api/"]
        Skills->>Skills: mark as stale
    end
    Skills->>Skills: for each stale skill
        Skills->>Skills: write(proposal)
        Skills->>CodeMap: resolve(sources) -> Bundle
        Skills->>LLM: Chat(writeSystem, userString)
        LLM-->>Skills: skill body
        Skills->>Skills: Save skill
    end
    Skills->>Skills: WriteIndex
    Skills-->>CLI: return [updated skills]
    CLI-->>User: show "1 skill(s) affected"
```

## Referenced Files

- internal/skills/skills.go
- internal/skills/generate.go

This completes the explanation of skill refreshing and invalidation, covering dependency tracking via the `Sources` field, staleness detection through path intersection, and efficient parallel regeneration of only affected skills. The system ensures skills stay synchronized with source files remain accurate reflections of the current codebase state.

<!-- kaioken:files internal/skills/skills.go,internal/skills/generate.go -->
