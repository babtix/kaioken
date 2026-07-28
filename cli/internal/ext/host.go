package ext

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"kaioken/internal/skills"
)

// The host side of the extension system: what installed extensions
// contribute to the running agent. In this phase the only contribution is
// skills — SKILL.md directories in the exact format the repo's own skills
// use — surfaced through the agent's knowledge catalog and served by
// read_knowledge under the "ext/<id>/…" prefix.

// ContributedSkill is one skill an installed extension provides.
type ContributedSkill struct {
	ExtID       string
	Name        string
	Description string
	Dir         string // absolute path to the skill's directory
}

// Contributions lists every skill contributed by enabled installed
// extensions. A broken extension is skipped, never fatal — one bad install
// must not take the agent's knowledge catalog down.
func Contributions() []ContributedSkill {
	lock, err := LoadLock()
	if err != nil {
		return nil
	}
	var out []ContributedSkill
	for _, e := range lock.Extensions {
		if !e.Enabled {
			continue
		}
		dir := InstallDir(e.ID, e.Version)
		if _, err := LoadManifest(dir); err != nil {
			continue
		}
		out = append(out, skillsIn(dir, e.ID)...)
	}
	return out
}

// skillsIn walks an extension's skills/ directory. Contribution is by
// convention: every skills/<name>/SKILL.md is one skill, its directory the
// name, its frontmatter description the catalog label.
func skillsIn(dir, extID string) []ContributedSkill {
	entries, err := os.ReadDir(filepath.Join(dir, "skills"))
	if err != nil {
		return nil
	}
	var out []ContributedSkill
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		skillDir := filepath.Join(dir, "skills", e.Name())
		raw, err := os.ReadFile(filepath.Join(skillDir, "SKILL.md"))
		if err != nil {
			continue
		}
		s, err := skills.Parse(string(raw))
		if err != nil {
			continue
		}
		out = append(out, ContributedSkill{
			ExtID:       extID,
			Name:        e.Name(),
			Description: s.Description,
			Dir:         skillDir,
		})
	}
	return out
}

// Resolve maps a path inside an installed, enabled extension (for example
// "skills/git-flow") to its absolute location, refusing anything that would
// escape the extension's directory. It is what read_knowledge uses to serve
// "ext/<id>/…" documents.
func Resolve(id, rel string) (string, error) {
	lock, err := LoadLock()
	if err != nil {
		return "", err
	}
	e := lock.Find(id)
	if e == nil {
		return "", fmt.Errorf("extension %s is not installed", id)
	}
	if !e.Enabled {
		return "", fmt.Errorf("extension %s is disabled", id)
	}
	base := InstallDir(e.ID, e.Version)
	rel = strings.Trim(filepath.ToSlash(rel), "/")
	if rel == "" {
		return base, nil
	}
	if err := safeRel(rel); err != nil {
		return "", err
	}
	abs := filepath.Join(base, filepath.FromSlash(rel))
	if !within(base, abs) {
		return "", fmt.Errorf("path %q escapes the extension directory", rel)
	}
	return abs, nil
}
