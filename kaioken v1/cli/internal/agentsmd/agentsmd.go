// Package agentsmd writes the repository's AGENTS.md: the compact instruction
// file an AI coding agent reads before it touches anything.
//
// The wiki explains what the codebase contains and a skill explains how to
// perform one recurring task. AGENTS.md is neither: it is the short list of
// things an agent would otherwise get WRONG — the exact test command, the
// generated files it must not hand-edit, the registry that has to be updated in
// lockstep. Every line has to earn its place by answering "would an agent miss
// this without help?".
//
// Two properties make Kaioken's version better than a cold LLM pass over the
// repo. First, generation is grounded in the knowledge engine: the architecture
// brief, the wiki outline and the skills catalog are handed to the model, so it
// describes the system in the vocabulary the rest of the documentation already
// established. Second, the pointer section that tells an agent where that
// documentation lives is rendered from disk, not written by the model — it is
// delimited by markers and rewritten on every run, so it can never drift or
// name a chapter that does not exist.
package agentsmd

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"kaioken/internal/config"
)

// FileName is the instruction file this package owns, at the repository root.
const FileName = "AGENTS.md"

// Markers delimit the section rendered from disk on every run. Everything
// between them is Kaioken's to rewrite; everything outside is the model's (and
// the maintainer's) to keep.
const (
	markerStart = "<!-- kaioken:knowledge:start — generated, do not edit by hand -->"
	markerEnd   = "<!-- kaioken:knowledge:end -->"
)

// Path is the AGENTS.md path for a repository.
func Path(repo string) string { return filepath.Join(repo, FileName) }

// Exists reports whether the repository already has an AGENTS.md.
func Exists(repo string) bool {
	info, err := os.Stat(Path(repo))
	return err == nil && !info.IsDir()
}

// Load reads the current AGENTS.md, returning "" when there is none.
func Load(repo string) string {
	raw, err := os.ReadFile(Path(repo))
	if err != nil {
		return ""
	}
	return normalise(string(raw))
}

// normalise strips a UTF-8 BOM and CRLF line endings. Both are routine in files
// edited by Windows tooling, and both would otherwise defeat the prefix checks
// that find the markers and the frontmatter.
func normalise(text string) string {
	return strings.ReplaceAll(strings.TrimPrefix(text, "\ufeff"), "\r\n", "\n")
}

// Body returns doc with the generated knowledge section removed — the part a
// human or a model authored. It is what gets fed back to the model when
// improving an existing file in place.
func Body(doc string) string {
	start := strings.Index(doc, markerStart)
	if start == -1 {
		return strings.TrimSpace(doc)
	}
	end := strings.Index(doc[start:], markerEnd)
	if end == -1 {
		return strings.TrimSpace(doc[:start])
	}
	rest := doc[start+end+len(markerEnd):]
	return strings.TrimSpace(strings.TrimSpace(doc[:start]) + "\n\n" + strings.TrimSpace(rest))
}

// Merge splices the generated knowledge section into a document, replacing an
// existing one in place so a maintainer's edits around it survive. A document
// without the markers gets the section appended.
func Merge(doc, section string) string {
	doc = normalise(doc)
	section = strings.TrimSpace(section)

	start := strings.Index(doc, markerStart)
	if start >= 0 {
		if rel := strings.Index(doc[start:], markerEnd); rel >= 0 {
			end := start + rel + len(markerEnd)
			merged := strings.TrimRight(doc[:start], " \t\n") + "\n\n" + section +
				"\n" + strings.TrimLeft(doc[end:], " \t\n")
			return strings.TrimSpace(merged) + "\n"
		}
		doc = strings.TrimSpace(doc[:start]) // truncated marker block: drop it
	}
	if section == "" {
		return strings.TrimSpace(doc) + "\n"
	}
	return strings.TrimSpace(doc) + "\n\n" + section + "\n"
}

// KnowledgeSection renders the pointer block: what Kaioken has generated for
// this repository and when an agent should open it. It reads the filesystem,
// so it is always true — and it returns "" when nothing has been generated yet,
// which keeps a fresh `init` from advertising documents that do not exist.
func KnowledgeSection(repo string) string {
	brief := hasFile(filepath.Join(repo, config.Dir, "architecture.md"))
	chapters := chapterIndex(repo)
	skillList := skillIndex(repo)
	cards := cardModules(repo)
	if !brief && len(chapters) == 0 && len(skillList) == 0 && len(cards) == 0 {
		return ""
	}

	var b strings.Builder
	b.WriteString(markerStart + "\n\n")
	b.WriteString("## Project knowledge (generated)\n\n")
	b.WriteString("Kaioken maintains documentation for this repository under `" + config.Dir + "/`.\n")
	b.WriteString("Read the relevant entry before exploring source files — it is faster, and it\n")
	b.WriteString("carries decisions the code does not state. Source files remain ground truth:\n")
	b.WriteString("if a document and the code disagree, the code wins.\n")

	if brief {
		fmt.Fprintf(&b, "\n- `%s/architecture.md` — the canonical architecture brief and glossary. "+
			"Use its vocabulary.\n", config.Dir)
	}
	if len(skillList) > 0 {
		b.WriteString("\n### Task guides (`" + config.Dir + "/skills/`)\n\n")
		b.WriteString("Open the matching skill FIRST when starting one of these tasks:\n\n")
		for _, s := range skillList {
			if s.desc != "" {
				fmt.Fprintf(&b, "- `%s` — %s\n", s.name, s.desc)
			} else {
				fmt.Fprintf(&b, "- `%s`\n", s.name)
			}
		}
	}
	if len(chapters) > 0 {
		b.WriteString("\n### Wiki (`" + config.Dir + "/wiki/`)\n\n")
		for _, c := range chapters {
			if len(c.docs) > 0 {
				fmt.Fprintf(&b, "- **%s** — %s\n", c.name, strings.Join(c.docs, ", "))
			} else {
				fmt.Fprintf(&b, "- **%s**\n", c.name)
			}
		}
	}
	if len(cards) > 0 {
		b.WriteString("\n### Knowledge cards (`" + config.Dir + "/knowledge/`)\n\n")
		fmt.Fprintf(&b, "Dense per-module cards for: %s\n", strings.Join(cards, ", "))
	}
	b.WriteString("\nRefresh after significant changes with `kaioken update`.\n\n")
	b.WriteString(markerEnd)
	return b.String()
}

// ---- filesystem readers for the generated section ----

type skillEntry struct{ name, desc string }

type chapterEntry struct {
	name string
	docs []string
}

func hasFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

// skillIndex lists generated skills with the description a runtime matches on.
func skillIndex(repo string) []skillEntry {
	root := filepath.Join(repo, config.Dir, "skills")
	dirs, err := os.ReadDir(root)
	if err != nil {
		return nil
	}
	var out []skillEntry
	for _, d := range dirs {
		if !d.IsDir() {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(root, d.Name(), "SKILL.md"))
		if err != nil {
			continue
		}
		out = append(out, skillEntry{name: d.Name(), desc: frontmatterField(string(raw), "description")})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].name < out[j].name })
	return out
}

// chapterIndex lists wiki sections and the documents inside them.
func chapterIndex(repo string) []chapterEntry {
	root := filepath.Join(repo, config.Dir, "wiki")
	secs, err := os.ReadDir(root)
	if err != nil {
		return nil
	}
	var out []chapterEntry
	for _, sec := range secs {
		if !sec.IsDir() {
			continue
		}
		docs, err := os.ReadDir(filepath.Join(root, sec.Name()))
		if err != nil {
			continue
		}
		var names []string
		for _, d := range docs {
			if !d.IsDir() && strings.HasSuffix(d.Name(), ".md") {
				name := strings.TrimSuffix(d.Name(), ".md")
				if name == sec.Name() {
					continue // the section's own overview page
				}
				names = append(names, name)
			}
		}
		sort.Strings(names)
		out = append(out, chapterEntry{name: sec.Name(), docs: names})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].name < out[j].name })
	return out
}

// cardModules lists module ids that have knowledge cards.
func cardModules(repo string) []string {
	mods, err := os.ReadDir(filepath.Join(repo, config.Dir, "knowledge"))
	if err != nil {
		return nil
	}
	var out []string
	for _, m := range mods {
		if m.IsDir() {
			out = append(out, m.Name())
		}
	}
	sort.Strings(out)
	return out
}

// frontmatterField pulls one scalar out of YAML frontmatter without paying for
// a full parse — the file may have been hand-edited into something yaml.v3
// rejects, and a missing description must not drop the skill from the index.
func frontmatterField(text, key string) string {
	text = normalise(text)
	if !strings.HasPrefix(text, "---\n") {
		return ""
	}
	for _, line := range strings.Split(text[4:], "\n") {
		if strings.HasPrefix(line, "---") {
			return ""
		}
		if rest, ok := strings.CutPrefix(line, key+":"); ok {
			return strings.Trim(strings.TrimSpace(rest), `"'`)
		}
	}
	return ""
}
