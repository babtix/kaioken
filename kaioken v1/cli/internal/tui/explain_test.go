package tui

import (
	"strings"
	"testing"
)

func TestExplainOverview(t *testing.T) {
	out := render(explainLines(""))

	for _, want := range []string{
		"command reference",
		"/explain <command>",
		"/explain all",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("explain overview missing %q", want)
		}
	}
	// Every chapter heading must appear.
	for _, ch := range chapters {
		if !strings.Contains(out, ch.title) {
			t.Errorf("explain overview missing chapter %q", ch.title)
		}
	}
}

func TestExplainOverviewListsEveryCommand(t *testing.T) {
	out := render(explainLines(""))
	for _, c := range commands {
		if !strings.Contains(out, "/"+c.name) {
			t.Errorf("explain overview omits /%s", c.name)
		}
	}
}

func TestExplainSingleCommand(t *testing.T) {
	out := render(explainLines("wiki"))

	for _, want := range []string{
		"/wiki [xN]", // header with syntax
		"What:",      // summary label
		"Detail",     // detail section
		"When & why", // guide section
		"Examples",   // examples section
		"/wiki x1",   // a worked example
		"multiplier", // detail content
	} {
		if !strings.Contains(out, want) {
			t.Errorf("explain wiki missing %q:\n%s", want, out)
		}
	}
	// A single command page must not drag in other commands.
	if strings.Contains(out, "/cards") {
		t.Error("single-command page leaked other commands")
	}
}

func TestExplainShowsAliases(t *testing.T) {
	out := render(explainLines("new"))
	if !strings.Contains(out, "Aliases:") {
		t.Error("explain /new should show aliases")
	}
	if !strings.Contains(out, "/reset") {
		t.Error("explain /new should list the /reset alias")
	}
}

func TestExplainAcceptsSlashPrefix(t *testing.T) {
	with := render(explainLines("/wiki"))
	without := render(explainLines("wiki"))
	if with != without {
		t.Error("/explain /wiki should match /explain wiki")
	}
}

func TestExplainResolvesAliases(t *testing.T) {
	out := render(explainLines("gen"))
	if !strings.Contains(out, "/cards") {
		t.Errorf("alias 'gen' should resolve to /cards:\n%s", out)
	}
}

func TestExplainAll(t *testing.T) {
	out := render(explainLines("all"))
	for _, c := range commands {
		if !strings.Contains(out, "/"+c.name) {
			t.Errorf("/explain all omits %q", c.name)
		}
	}
}

func TestExplainUnknownSuggests(t *testing.T) {
	out := render(explainLines("zzzznope"))
	if !strings.Contains(out, "no command called") {
		t.Errorf("unknown topic should say so:\n%s", out)
	}
	if !strings.Contains(out, "/explain for the full command reference") {
		t.Error("unknown topic should point back to the overview")
	}
}

// Every command must have guide text so /explain actually goes deeper than
// /tutorial.
func TestEveryCommandHasGuide(t *testing.T) {
	for _, c := range commands {
		if strings.TrimSpace(c.guide) == "" {
			t.Errorf("command /%s has no guide text for /explain", c.name)
		}
	}
}

// The explain command must be wired into dispatch and offered by the palette.
func TestExplainIsDispatchedAndListed(t *testing.T) {
	m := newTestModel(t)
	updated, _ := m.dispatch("/explain")
	got := updated.(Model)
	joined := strings.Join(got.lines, "\n")
	if strings.Contains(joined, "unknown command") {
		t.Fatal("/explain is not handled by dispatch")
	}
	if !strings.Contains(joined, "command reference") {
		t.Errorf("dispatch did not render the explain overview:\n%s", joined)
	}

	if _, ok := lookupCommand("explain"); !ok {
		t.Error("/explain missing from the command registry")
	}
}

// Arguments must reach explain, not be swallowed by dispatch.
func TestExplainArgumentIsPassedThrough(t *testing.T) {
	m := newTestModel(t)
	updated, _ := m.dispatch("/explain wiki")
	joined := strings.Join(updated.(Model).lines, "\n")
	if !strings.Contains(joined, "When & why") {
		t.Errorf("command argument was not honoured:\n%s", joined)
	}
}

// The explain overview must show aliases inline so the user can discover them.
func TestExplainOverviewShowsAliases(t *testing.T) {
	out := render(explainLines(""))
	// /new has alias /reset — the overview should mention it.
	if !strings.Contains(out, "/reset") {
		t.Error("explain overview should show aliases inline")
	}
}
