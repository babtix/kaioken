// Package skills generates project-specific agent skills: focused,
// task-oriented capsules of "how to do X in THIS repository".
//
// The wiki explains what a codebase contains. A skill explains how to perform a
// recurring task inside it — which files to touch, in what order, following
// which local conventions. That is the shape of knowledge an AI agent actually
// needs at the moment it starts working, and it is exactly what a general model
// cannot know about your project.
//
// Skills are written in the Agent Skills format — a SKILL.md whose YAML
// frontmatter carries a name and a description used to decide relevance — so
// they are consumable by agent runtimes as well as by humans.
package skills

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"gopkg.in/yaml.v3"

	"kaioken/internal/config"
)

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

// Dir is the skills root inside a repository.
func Dir(repo string) string { return filepath.Join(repo, config.Dir, "skills") }

// Origin values record how a skill came to exist.
const (
	// OriginGenerated is written from static analysis of the repo by skills.Run.
	OriginGenerated = "generated"
	// OriginLearned is distilled from a session that actually performed the task.
	OriginLearned = "learned"
	// OriginHuman is a skill dropped in by hand, with no frontmatter provenance.
	OriginHuman = "human"
)

// Path is where one skill's SKILL.md lives.
func Path(repo, name string) string {
	return filepath.Join(Dir(repo), name, "SKILL.md")
}

// Slug normalises a proposed name into a safe kebab-case directory name.
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

// Render produces the full SKILL.md text: frontmatter then body.
func (s *Skill) Render() string {
	meta := *s
	raw, err := yaml.Marshal(&meta)
	if err != nil {
		raw = []byte("name: " + s.Name + "\n")
	}
	return "---\n" + string(raw) + "---\n\n" + strings.TrimLeft(s.Body, "\n")
}

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

// Load reads one skill by name.
func Load(repo, name string) (*Skill, error) {
	raw, err := os.ReadFile(Path(repo, name))
	if err != nil {
		return nil, err
	}
	return Parse(string(raw))
}

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
