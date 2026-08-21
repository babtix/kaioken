package agent

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"kaioken/internal/config"
	"kaioken/internal/ext"
	"kaioken/internal/skills"
	"kaioken/internal/wiki"
)

// Kaioken generates two kinds of documentation into .kaioken/: dense knowledge
// cards per module, and long-form wiki chapters. The agent can technically
// reach both through read_file, but it has no reason to look unless it knows
// they exist — so the system prompt advertises the catalog and read_knowledge
// serves documents by name.

// knowledgeMaxBytes caps a single read_knowledge result.
const knowledgeMaxBytes = 60_000

// catalogMaxEntries bounds how much of the catalog goes into the system
// prompt, which every request pays for.
const catalogMaxEntries = 60

// knowledgeEntry is one generated document.
type knowledgeEntry struct {
	Path  string // repo-relative, slash-separated
	Label string // human description for the catalog
}

// knowledgeCatalog lists the generated documentation in a repo, cards first
// (they are the compact ones), then wiki chapters. It returns nil when nothing
// has been generated yet.
func knowledgeCatalog(root string) []knowledgeEntry {
	var entries []knowledgeEntry

	// Skills come first: they are procedural ("how to do X here") and are the
	// most directly actionable thing available when starting a task. They are
	// ordered by reinforcement (UseCount) then name, so the prompt budget —
	// catalogMaxEntries — favors skills the agent has actually used over
	// alphabetical noise, which matters once learned skills accumulate.
	all, err := skills.List(root)
	if err == nil {
		sort.Slice(all, func(i, j int) bool {
			if all[i].UseCount != all[j].UseCount {
				return all[i].UseCount > all[j].UseCount
			}
			return all[i].Name < all[j].Name
		})
		for _, s := range all {
			label := "skill: " + s.Name
			if desc := s.Description; desc != "" {
				label = "skill — " + desc
			}
			entries = append(entries, knowledgeEntry{
				Path:  path(config.Dir, "skills", s.Name),
				Label: label,
			})
		}
	}

	// Extension skills follow: contributed by installed extensions, so they
	// apply across repositories. They are listed after the repo's own skills
	// because project-specific knowledge beats generic knowledge, and the
	// label carries the extension id so provenance is visible in the prompt.
	for _, cs := range ext.Contributions() {
		label := "extension skill: " + cs.Name + " [" + cs.ExtID + "]"
		if cs.Description != "" {
			label = "extension skill — " + cs.Description + " [" + cs.ExtID + "]"
		}
		entries = append(entries, knowledgeEntry{
			Path:  path("ext", cs.ExtID, "skills", cs.Name),
			Label: label,
		})
	}

	cardsRoot := filepath.Join(root, config.Dir, "knowledge")
	if mods, err := os.ReadDir(cardsRoot); err == nil {
		for _, mod := range mods {
			if !mod.IsDir() {
				continue
			}
			cards, err := os.ReadDir(filepath.Join(cardsRoot, mod.Name()))
			if err != nil {
				continue
			}
			var names []string
			for _, c := range cards {
				if strings.HasSuffix(c.Name(), ".md") {
					names = append(names, strings.TrimSuffix(c.Name(), ".md"))
				}
			}
			if len(names) == 0 {
				continue
			}
			sort.Strings(names)
			entries = append(entries, knowledgeEntry{
				Path:  path(config.Dir, "knowledge", mod.Name()),
				Label: "cards for module " + mod.Name() + " (" + strings.Join(names, ", ") + ")",
			})
		}
	}

	wikiRoot := filepath.Join(root, config.Dir, "wiki")
	if secs, err := os.ReadDir(wikiRoot); err == nil {
		for _, sec := range secs {
			if !sec.IsDir() {
				continue
			}
			docs, err := os.ReadDir(filepath.Join(wikiRoot, sec.Name()))
			if err != nil {
				continue
			}
			var chapters []string
			for _, d := range docs {
				if strings.HasSuffix(d.Name(), ".md") {
					chapters = append(chapters, strings.TrimSuffix(d.Name(), ".md"))
				}
			}
			if len(chapters) == 0 {
				continue
			}
			sort.Strings(chapters)
			entries = append(entries, knowledgeEntry{
				Path:  path(config.Dir, "wiki", sec.Name()),
				Label: "wiki chapter " + sec.Name() + " (" + strings.Join(chapters, ", ") + ")",
			})
		}
	}
	return entries
}

// instructionFiles are the root-level agent instruction files, in the order
// they win. AGENTS.md is the one `kaioken init` writes; the others are here so
// a repo already set up for another runtime is not ignored.
var instructionFiles = []string{"AGENTS.md", "CLAUDE.md", ".cursorrules"}

// instructionMaxBytes caps what goes into the system prompt. Every request pays
// for it, and an AGENTS.md long enough to hit this cap has stopped being an
// instruction file anyway.
const instructionMaxBytes = 16_000

// projectInstructions returns the repo's instruction file and its name, or
// ("", "") when there is none.
func projectInstructions(root string) (doc, name string) {
	for _, f := range instructionFiles {
		raw, err := os.ReadFile(filepath.Join(root, f))
		if err != nil {
			continue
		}
		text := strings.TrimSpace(strings.ReplaceAll(string(raw), "\r\n", "\n"))
		if text == "" {
			continue
		}
		if len(text) > instructionMaxBytes {
			text = text[:instructionMaxBytes] + "\n… [truncated — open " + f + " to read the rest]"
		}
		return text, f
	}
	return "", ""
}

// path joins slash-separated repo-relative segments.
func path(parts ...string) string { return strings.Join(parts, "/") }

// skillDescription pulls the description line out of a SKILL.md frontmatter
// without a YAML dependency — it is the field a runtime matches on, so it is
// what makes the catalog useful.
func skillDescription(text string) string {
	if !strings.HasPrefix(text, "---") {
		return ""
	}
	for _, line := range strings.Split(text, "\n")[1:] {
		if strings.HasPrefix(line, "---") {
			return ""
		}
		if rest, ok := strings.CutPrefix(line, "description:"); ok {
			return strings.Trim(strings.TrimSpace(rest), `"'`)
		}
	}
	return ""
}

// knowledgeSummary renders the catalog for the system prompt, or "" when the
// repo has no generated documentation.
func knowledgeSummary(root string) string {
	entries := knowledgeCatalog(root)
	if len(entries) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("\nGenerated documentation is available for this repository. Prefer it over\n")
	b.WriteString("re-reading source when you need orientation — it is faster and already\n")
	b.WriteString("summarised. When a listed SKILL matches the task you were asked to do,\n")
	b.WriteString("open it FIRST: it states how that task is performed in this codebase.\n")
	if note := wiki.StalenessNote(root); note != "" {
		fmt.Fprintf(&b, "Note: the wiki was %s — verify against source before relying on it.\n", note)
	}
	b.WriteString("Use read_knowledge to open any of these:\n")
	shown := entries
	if len(shown) > catalogMaxEntries {
		shown = shown[:catalogMaxEntries]
	}
	for _, e := range shown {
		fmt.Fprintf(&b, "- %s — %s\n", e.Path, e.Label)
	}
	if len(entries) > len(shown) {
		fmt.Fprintf(&b, "- … and %d more (read_knowledge with no argument lists everything)\n",
			len(entries)-len(shown))
	}
	b.WriteString("Source files remain the ground truth: if the docs and the code disagree,\n")
	b.WriteString("the code wins — say so rather than repeating a stale doc.\n")
	return b.String()
}

// readKnowledge serves a generated document, a whole directory's worth of
// them, or the catalog when doc is empty. It refuses paths outside .kaioken/
// so it stays a documentation tool rather than a second read_file.
func (a *Agent) readKnowledge(doc string) string {
	doc = strings.TrimSpace(doc)
	if doc == "" {
		entries := knowledgeCatalog(a.Root)
		if len(entries) == 0 {
			return "no generated documentation yet — the user can create it with /wiki or /generate"
		}
		var b strings.Builder
		if note := wiki.StalenessNote(a.Root); note != "" {
			fmt.Fprintf(&b, "Note: the wiki was %s — verify against source before relying on it.\n\n", note)
		}
		b.WriteString("Available documentation:\n")
		for _, e := range entries {
			fmt.Fprintf(&b, "- %s — %s\n", e.Path, e.Label)
		}
		return b.String()
	}

	rel := strings.Trim(filepath.ToSlash(doc), "/")
	if rel == "ext" || strings.HasPrefix(rel, "ext/") {
		return readExtensionDoc(rel)
	}
	if !strings.HasPrefix(rel, config.Dir+"/") && rel != config.Dir {
		// Accept a bare name like "wiki/Architecture" too.
		rel = config.Dir + "/" + rel
	}
	abs, err := a.resolve(rel)
	if err != nil {
		return "error: " + err.Error()
	}

	info, err := os.Stat(abs)
	if err != nil {
		return "error: no such document " + rel + " (read_knowledge with no argument lists what exists)"
	}
	if !info.IsDir() {
		return readCapped(abs)
	}
	return readDocDir(rel, abs)
}

// readExtensionDoc serves a document contributed by an installed extension.
// The catalog lists them as ext/<id>/skills/<name>; resolution is delegated
// to ext.Resolve, which only serves enabled extensions and refuses paths
// escaping the extension's install directory.
func readExtensionDoc(rel string) string {
	parts := strings.SplitN(strings.TrimPrefix(rel, "ext/"), "/", 2)
	if parts[0] == "" || parts[0] == "ext" {
		return "error: name an extension document as ext/<id>/skills/<name>"
	}
	sub := ""
	if len(parts) == 2 {
		sub = parts[1]
	}
	abs, err := ext.Resolve(parts[0], sub)
	if err != nil {
		return "error: " + err.Error()
	}
	info, err := os.Stat(abs)
	if err != nil {
		return "error: no such document " + rel + " (read_knowledge with no argument lists what exists)"
	}
	if !info.IsDir() {
		return readCapped(abs)
	}
	return readDocDir(rel, abs)
}

// readDocDir concatenates a directory's markdown, which is how cards, wiki
// chapters and skill directories are meant to be read.
func readDocDir(rel, abs string) string {
	files, err := os.ReadDir(abs)
	if err != nil {
		return "error: " + err.Error()
	}
	var b strings.Builder
	for _, f := range files {
		if f.IsDir() || !strings.HasSuffix(f.Name(), ".md") {
			continue
		}
		if b.Len() > knowledgeMaxBytes {
			b.WriteString("\n… [remaining documents omitted for length; open them individually]\n")
			break
		}
		fmt.Fprintf(&b, "===== %s/%s =====\n", rel, f.Name())
		b.WriteString(readCapped(filepath.Join(abs, f.Name())))
		b.WriteString("\n\n")
	}
	if b.Len() == 0 {
		return "error: " + rel + " contains no markdown documents"
	}
	return b.String()
}

func readCapped(abs string) string {
	raw, err := os.ReadFile(abs)
	if err != nil {
		return "error: " + err.Error()
	}
	if len(raw) > knowledgeMaxBytes {
		return string(raw[:knowledgeMaxBytes]) + "\n… [truncated]"
	}
	return string(raw)
}
