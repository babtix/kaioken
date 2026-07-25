package tui

import (
	"strings"
	"testing"
)

func render(lines []string) string { return strings.Join(lines, "\n") }

func TestTutorialOverview(t *testing.T) {
	out := render(tutorialLines(""))

	for _, want := range []string{
		"KAIOKEN", "First run", "Chapters",
		"/key", "/model", "/wiki", "/skills", // the first-run sequence
		"/tutorial all",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("overview missing %q", want)
		}
	}
	// Every chapter must be reachable from the landing page.
	for _, ch := range chapters {
		if !strings.Contains(out, "/tutorial "+ch.name) {
			t.Errorf("overview does not link chapter %q", ch.name)
		}
	}
}

func TestTutorialChapter(t *testing.T) {
	out := render(tutorialLines("knowledge"))

	if !strings.Contains(out, "The knowledge engine") {
		t.Error("chapter title missing")
	}
	// Its commands, with their examples.
	for _, want := range []string{"/wiki", "/update", "/cards", "/wiki x10 force"} {
		if !strings.Contains(out, want) {
			t.Errorf("knowledge chapter missing %q", want)
		}
	}
}

func TestTutorialSingleCommand(t *testing.T) {
	out := render(tutorialLines("wiki"))

	if !strings.Contains(out, "/wiki [xN]") {
		t.Errorf("command header missing:\n%s", out)
	}
	if !strings.Contains(out, "multiplier") {
		t.Error("detail paragraph missing")
	}
	if !strings.Contains(out, "/wiki retry") {
		t.Error("examples missing")
	}
	// A single command page must not drag in the whole chapter.
	if strings.Contains(out, "/cards") {
		t.Error("single-command page leaked other commands")
	}
}

// A leading slash is natural to type and must work.
func TestTutorialAcceptsSlashPrefix(t *testing.T) {
	with := render(tutorialLines("/wiki"))
	without := render(tutorialLines("wiki"))
	if with != without {
		t.Error("/tutorial /wiki should match /tutorial wiki")
	}
}

// Aliases resolve to their command.
func TestTutorialResolvesAliases(t *testing.T) {
	out := render(tutorialLines("gen"))
	if !strings.Contains(out, "/cards") {
		t.Errorf("alias 'gen' should resolve to /cards:\n%s", out)
	}
	if !strings.Contains(out, "also: /generate") {
		t.Error("aliases should be listed on the command page")
	}
}

func TestTutorialAll(t *testing.T) {
	out := render(tutorialLines("all"))
	for _, c := range commands {
		if !strings.Contains(out, "/"+c.name) {
			t.Errorf("/tutorial all omits %q", c.name)
		}
	}
}

// An unknown topic should help rather than just fail.
func TestTutorialUnknownTopicSuggests(t *testing.T) {
	out := render(tutorialLines("wik"))
	// "wik" is a prefix of wiki, so it resolves rather than erroring.
	if !strings.Contains(out, "/wiki") {
		t.Errorf("expected a suggestion toward /wiki:\n%s", out)
	}

	out = render(tutorialLines("zzzznope"))
	if !strings.Contains(out, "no tutorial section") {
		t.Errorf("unknown topic should say so:\n%s", out)
	}
	if !strings.Contains(out, "/tutorial for the overview") {
		t.Error("unknown topic should point back to the overview")
	}
}

// Every command must be reachable through some chapter, or /tutorial would
// quietly omit part of the tool.
func TestEveryCommandAppearsInAChapter(t *testing.T) {
	covered := map[string]bool{}
	for _, ch := range chapters {
		for _, name := range ch.commands {
			if _, ok := lookupCommand(name); !ok {
				t.Errorf("chapter %q lists unknown command %q", ch.name, name)
			}
			covered[name] = true
		}
	}
	for _, c := range commands {
		if !covered[c.name] {
			t.Errorf("command /%s appears in no tutorial chapter", c.name)
		}
	}
}

// The tutorial is only useful if it actually shows how to invoke things.
func TestEveryCommandHasAnExample(t *testing.T) {
	for _, c := range commands {
		if len(c.examples) == 0 {
			t.Errorf("command /%s has no usage example", c.name)
			continue
		}
		for _, e := range c.examples {
			if !strings.HasPrefix(e.cmd, "/") {
				t.Errorf("/%s example %q should be a literal invocation", c.name, e.cmd)
			}
			if strings.TrimSpace(e.what) == "" {
				t.Errorf("/%s example %q has no explanation", c.name, e.cmd)
			}
		}
	}
}

// Examples must name real commands, not ones that were renamed away.
func TestExamplesReferenceRealCommands(t *testing.T) {
	for _, c := range commands {
		for _, e := range c.examples {
			word := strings.TrimPrefix(strings.Fields(e.cmd)[0], "/")
			if _, ok := lookupCommand(word); !ok {
				t.Errorf("/%s example invokes unknown command %q", c.name, word)
			}
		}
	}
}

func TestChapterNamesUnique(t *testing.T) {
	seen := map[string]bool{}
	for _, ch := range chapters {
		if seen[ch.name] {
			t.Errorf("duplicate chapter name %q", ch.name)
		}
		seen[ch.name] = true
		if strings.TrimSpace(ch.title) == "" {
			t.Errorf("chapter %q has no title", ch.name)
		}
	}
}

// A chapter name must not collide with a command name, or the lookup order
// would silently shadow one of them.
func TestChapterNamesDoNotShadowCommands(t *testing.T) {
	for _, ch := range chapters {
		if c, ok := lookupCommand(ch.name); ok {
			// "skills" is deliberately both; assert it resolves to the chapter,
			// which is the richer page and includes the command anyway.
			out := render(tutorialLines(ch.name))
			if !strings.Contains(out, "/"+c.name) {
				t.Errorf("chapter %q shadows command /%s without covering it", ch.name, c.name)
			}
		}
	}
}

func TestWrapText(t *testing.T) {
	lines := wrapText("the quick brown fox jumps over the lazy dog", 12)
	if len(lines) < 3 {
		t.Fatalf("expected several lines, got %v", lines)
	}
	for _, l := range lines {
		if len(l) > 12 {
			t.Errorf("line exceeds width: %q", l)
		}
	}
	if strings.Join(lines, " ") != "the quick brown fox jumps over the lazy dog" {
		t.Errorf("wrapping lost or reordered words: %v", lines)
	}
	if wrapText("", 10) != nil {
		t.Error("empty input should wrap to nothing")
	}
}

// The command must be wired into dispatch and offered by the palette.
func TestTutorialIsDispatchedAndListed(t *testing.T) {
	m := newTestModel(t)
	updated, _ := m.dispatch("/tutorial")
	got := updated.(Model)
	joined := strings.Join(got.lines, "\n")
	if strings.Contains(joined, "unknown command") {
		t.Fatal("/tutorial is not handled by dispatch")
	}
	if !strings.Contains(joined, "guided tour") {
		t.Errorf("dispatch did not render the tutorial:\n%s", joined)
	}

	if _, ok := lookupCommand("tutorial"); !ok {
		t.Error("/tutorial missing from the command registry")
	}
}

// Arguments must reach the tutorial, not be swallowed by dispatch.
func TestTutorialArgumentIsPassedThrough(t *testing.T) {
	m := newTestModel(t)
	updated, _ := m.dispatch("/tutorial skills")
	joined := strings.Join(updated.(Model).lines, "\n")
	if !strings.Contains(joined, "teaching an agent your project") {
		t.Errorf("chapter argument was not honoured:\n%s", joined)
	}
}
