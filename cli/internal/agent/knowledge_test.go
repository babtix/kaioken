package agent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/config"
)

// seedDocs writes a fake generated-documentation tree into a repo.
func seedDocs(t *testing.T, root string) {
	t.Helper()
	write := func(rel, body string) {
		t.Helper()
		p := filepath.Join(root, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write(config.Dir+"/knowledge/api/overview.md", "# API overview\n\nHandles requests.")
	write(config.Dir+"/knowledge/api/architecture.md", "# API architecture\n")
	write(config.Dir+"/wiki/Architecture/Architecture.md", "# Architecture\n\nThe big picture.")
	write(config.Dir+"/wiki/Architecture/Data Flow.md", "# Data Flow\n")
}

// Skills are procedural and the most directly actionable thing available, so
// they must lead the catalog and reach the model with their descriptions.
func TestKnowledgeCatalogSurfacesSkills(t *testing.T) {
	root := t.TempDir()
	seedDocs(t, root)
	skill := "---\nname: add-a-tui-command\n" +
		"description: How to add a slash command. Use when adding TUI commands.\n" +
		"sources:\n  - internal/tui/tui.go\n---\n\n# Add a TUI command\n\n1. Edit dispatch.\n"
	p := filepath.Join(root, config.Dir, "skills", "add-a-tui-command", "SKILL.md")
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(skill), 0o644); err != nil {
		t.Fatal(err)
	}

	entries := knowledgeCatalog(root)
	if len(entries) == 0 {
		t.Fatal("catalog is empty")
	}
	if !strings.Contains(entries[0].Path, "skills/") {
		t.Errorf("skills should lead the catalog, got %s", entries[0].Path)
	}
	if !strings.Contains(entries[0].Label, "Use when adding TUI commands") {
		t.Errorf("skill description not surfaced: %q", entries[0].Label)
	}

	prompt := SystemPrompt(PromptInput{Root: root, Mode: ModeBuild, AllowRun: true})
	if !strings.Contains(prompt, "add-a-tui-command") {
		t.Error("system prompt should advertise the skill")
	}
	if !strings.Contains(prompt, "open it FIRST") {
		t.Error("system prompt should tell the model to prefer a matching skill")
	}

	// And the agent must be able to actually open it.
	a := &Agent{Root: root, UI: fakeUI{}}
	if got := a.readKnowledge("skills/add-a-tui-command"); !strings.Contains(got, "Edit dispatch") {
		t.Errorf("read_knowledge could not open the skill: %q", got)
	}
}

func TestSkillDescriptionParsing(t *testing.T) {
	cases := map[string]string{
		"---\nname: x\ndescription: Does a thing.\n---\n\nbody": "Does a thing.",
		"---\ndescription: \"Quoted value.\"\n---\n":            "Quoted value.",
		"---\nname: x\n---\n":                                   "",
		"# No frontmatter\n":                                    "",
	}
	for in, want := range cases {
		if got := skillDescription(in); got != want {
			t.Errorf("skillDescription(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestKnowledgeCatalogEmpty(t *testing.T) {
	if entries := knowledgeCatalog(t.TempDir()); len(entries) != 0 {
		t.Errorf("expected an empty catalog, got %+v", entries)
	}
	if s := knowledgeSummary(t.TempDir()); s != "" {
		t.Errorf("empty repo should contribute nothing to the prompt, got %q", s)
	}
}

func TestKnowledgeCatalogListsCardsAndWiki(t *testing.T) {
	root := t.TempDir()
	seedDocs(t, root)

	entries := knowledgeCatalog(root)
	if len(entries) != 2 {
		t.Fatalf("expected 2 catalog entries, got %d: %+v", len(entries), entries)
	}
	joined := entries[0].Path + " " + entries[0].Label + " | " + entries[1].Path + " " + entries[1].Label
	for _, want := range []string{"knowledge/api", "overview", "wiki/Architecture", "Data Flow"} {
		if !strings.Contains(joined, want) {
			t.Errorf("catalog missing %q:\n%s", want, joined)
		}
	}
	// Cards come first — they are the compact ones.
	if !strings.Contains(entries[0].Path, "knowledge/") {
		t.Errorf("expected cards first, got %s", entries[0].Path)
	}
}

func TestSystemPromptAdvertisesKnowledge(t *testing.T) {
	root := t.TempDir()
	if p := SystemPrompt(PromptInput{Root: root, Mode: ModeBuild, AllowRun: true}); strings.Contains(p, "Generated documentation is available") {
		t.Error("a repo with no docs must not advertise any")
	}
	seedDocs(t, root)
	p := SystemPrompt(PromptInput{Root: root, Mode: ModeBuild, AllowRun: true})
	if !strings.Contains(p, "Generated documentation is available") {
		t.Error("system prompt should advertise the generated docs")
	}
	if !strings.Contains(p, "the code wins") {
		t.Error("system prompt should say source is the ground truth over stale docs")
	}
}

func TestReadKnowledgeListsWhenEmptyArg(t *testing.T) {
	a := &Agent{Root: t.TempDir(), UI: fakeUI{}}
	if got := a.readKnowledge(""); !strings.Contains(got, "no generated documentation") {
		t.Errorf("expected a helpful empty message, got %q", got)
	}

	seedDocs(t, a.Root)
	got := a.readKnowledge("")
	for _, want := range []string{"knowledge/api", "wiki/Architecture"} {
		if !strings.Contains(got, want) {
			t.Errorf("catalog listing missing %q:\n%s", want, got)
		}
	}
}

func TestReadKnowledgeReadsFileAndDirectory(t *testing.T) {
	a := &Agent{Root: t.TempDir(), UI: fakeUI{}}
	seedDocs(t, a.Root)

	// A single document.
	got := a.readKnowledge(config.Dir + "/wiki/Architecture/Architecture.md")
	if !strings.Contains(got, "The big picture") {
		t.Errorf("single doc read failed: %q", got)
	}

	// A whole chapter directory concatenates its markdown.
	got = a.readKnowledge(config.Dir + "/wiki/Architecture")
	if !strings.Contains(got, "The big picture") || !strings.Contains(got, "Data Flow") {
		t.Errorf("directory read should include every chapter:\n%s", got)
	}
}

// A path without the .kaioken prefix is accepted as a convenience.
func TestReadKnowledgeAcceptsBareName(t *testing.T) {
	a := &Agent{Root: t.TempDir(), UI: fakeUI{}}
	seedDocs(t, a.Root)
	if got := a.readKnowledge("wiki/Architecture"); !strings.Contains(got, "The big picture") {
		t.Errorf("bare name should resolve under .kaioken: %q", got)
	}
}

// read_knowledge must stay a documentation tool: it may not be used to escape
// into arbitrary repo files, and certainly not outside the repo.
func TestReadKnowledgeStaysInDocs(t *testing.T) {
	a := &Agent{Root: t.TempDir(), UI: fakeUI{}}
	seedDocs(t, a.Root)
	if err := os.WriteFile(filepath.Join(a.Root, "secret.txt"), []byte("TOPSECRET"), 0o644); err != nil {
		t.Fatal(err)
	}

	if got := a.readKnowledge("secret.txt"); strings.Contains(got, "TOPSECRET") {
		t.Errorf("read_knowledge reached a non-doc file: %q", got)
	}
	if got := a.readKnowledge("../../../etc/passwd"); !strings.HasPrefix(got, "error:") {
		t.Errorf("path escape should be refused, got %q", got)
	}
}

func TestReadKnowledgeMissingDoc(t *testing.T) {
	a := &Agent{Root: t.TempDir(), UI: fakeUI{}}
	seedDocs(t, a.Root)
	got := a.readKnowledge("wiki/Nonexistent")
	if !strings.HasPrefix(got, "error:") || !strings.Contains(got, "lists what exists") {
		t.Errorf("missing doc should error and point at the catalog, got %q", got)
	}
}

// The tool must be offered to the model, or none of the above matters.
func TestReadKnowledgeToolIsRegistered(t *testing.T) {
	a := &Agent{Root: t.TempDir(), UI: fakeUI{}}
	var found bool
	for _, tool := range a.Tools() {
		if tool.Function.Name == "read_knowledge" {
			found = true
		}
	}
	if !found {
		t.Error("read_knowledge is not in the tool schema")
	}
}

// AGENTS.md is the cross-runtime convention for "what an agent must know before
// editing here", so it has to reach the system prompt — otherwise `kaioken init`
// writes a file its own agent ignores.
func TestSystemPromptCarriesProjectInstructions(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "AGENTS.md"),
		[]byte("# AGENTS.md\n\nNever edit generated/api.ts by hand.\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	prompt := SystemPrompt(PromptInput{Root: root, Mode: ModeBuild})
	if !strings.Contains(prompt, "Never edit generated/api.ts by hand.") {
		t.Errorf("AGENTS.md did not reach the system prompt:\n%s", prompt)
	}
	if !strings.Contains(prompt, "AGENTS.md") {
		t.Error("the prompt does not name the file its instructions came from")
	}
}

// A repo set up for another runtime should not be ignored, but AGENTS.md wins
// when both exist.
func TestProjectInstructionsPrecedence(t *testing.T) {
	root := t.TempDir()
	mustWrite := func(name, body string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(root, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	mustWrite("CLAUDE.md", "claude instructions")
	if doc, name := projectInstructions(root); name != "CLAUDE.md" || doc != "claude instructions" {
		t.Errorf("CLAUDE.md was not picked up: got (%q, %q)", doc, name)
	}
	mustWrite("AGENTS.md", "agents instructions")
	if _, name := projectInstructions(root); name != "AGENTS.md" {
		t.Errorf("AGENTS.md should win over CLAUDE.md, got %q", name)
	}
}

func TestSystemPromptWithoutProjectInstructions(t *testing.T) {
	prompt := SystemPrompt(PromptInput{Root: t.TempDir(), Mode: ModeBuild})
	if strings.Contains(prompt, "Instructions from this repository's") {
		t.Errorf("an empty repo produced an instructions section:\n%s", prompt)
	}
}
