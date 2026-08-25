package tui

import (
	"strings"
	"testing"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"kaioken/internal/impact"
)

func impactReport() *impact.Report {
	return &impact.Report{
		Intent:      "rename ParseArgs to ParseCLIArgs",
		Model:       "test-model",
		GeneratedAt: time.Date(2026, 7, 31, 12, 0, 0, 0, time.UTC),
		Risk:        "medium",
		Summary:     "moderate reach",
		Items: []impact.Item{
			{Kind: impact.KindSymbol, Name: "ParseArgs", Path: "pkg/args.go", Reason: "target", Risk: "low"},
			{Kind: impact.KindFile, Name: "caller.go", Path: "pkg/caller.go", Reason: "caller", Risk: "low"},
			{Kind: impact.KindModule, Name: "core", Reason: "owns files", Risk: "medium"},
			{Kind: impact.KindDoc, Name: "Args.md", Path: ".kaioken/wiki/Args.md", Reason: "cites it", Risk: "medium"},
			{Kind: impact.KindSkill, Name: "parse-cli-flags", Reason: "stale", Risk: "medium"},
			{Kind: impact.KindTest, Name: "args_test.go", Path: "pkg/args_test.go", Reason: "exercises", Risk: "low"},
		},
		Unverified: []impact.Item{
			{Kind: impact.KindFile, Name: "ghost.go", Path: "pkg/ghost.go", Reason: "hallucinated", Risk: "low"},
		},
		Checklist: []string{"grep for old name"},
		SavedPath: ".kaioken/impact/report.md",
	}
}

func impactKey(t *testing.T, m Model, k string) Model {
	t.Helper()
	updated, _ := m.onImpactKey(k)
	return updated.(Model)
}

func TestImpactTreeOpensAndCloses(t *testing.T) {
	m := newTestModel(t)
	rep := impactReport()
	m.openImpactTree(rep)
	if m.mode != modeImpact {
		t.Fatal("opening the tree must switch to modeImpact")
	}
	if m.impactTree == nil || m.impactTree.report != rep {
		t.Fatal("the report must be stored in the tree")
	}

	// Close with q
	m = impactKey(t, m, "q")
	if m.mode != modeChat {
		t.Fatal("q must close the tree and return to modeChat")
	}
	if m.impactTree != nil {
		t.Fatal("tree must be nil after closing")
	}
	last := m.lines[len(m.lines)-1]
	if !strings.Contains(last, "report") && !strings.Contains(last, "ParseArgs") {
		t.Errorf("close must dump the tree view into the transcript, got: %q", last)
	}
}

func TestImpactTreeNavigation(t *testing.T) {
	m := newTestModel(t)
	m.openImpactTree(impactReport())
	tree := m.impactTree

	// Cursor starts at 0
	if tree.cursor != 0 {
		t.Fatalf("cursor starts at %d, want 0", tree.cursor)
	}
	// Move down
	m = impactKey(t, m, "down")
	if tree.cursor != 1 {
		t.Errorf("down should move to 1, got %d", tree.cursor)
	}
	// Move up
	m = impactKey(t, m, "up")
	if tree.cursor != 0 {
		t.Errorf("up should move back to 0, got %d", tree.cursor)
	}
	// Cannot go above 0
	m = impactKey(t, m, "up")
	if tree.cursor != 0 {
		t.Errorf("up at 0 should stay at 0, got %d", tree.cursor)
	}
}

func TestImpactTreeCollapse(t *testing.T) {
	m := newTestModel(t)
	m.openImpactTree(impactReport())
	tree := m.impactTree

	// First node is a group node (Symbols)
	if !tree.nodes[0].group {
		t.Fatal("first node must be a group")
	}
	before := len(tree.nodes)

	// Toggle collapse
	m = impactKey(t, m, "enter")
	after := len(tree.nodes)
	if after >= before {
		t.Errorf("collapsing a group should reduce visible rows: %d >= %d", after, before)
	}
	// Toggle again to expand
	m = impactKey(t, m, "enter")
	if len(tree.nodes) != before {
		t.Errorf("expanding again should restore row count: %d vs %d", len(tree.nodes), before)
	}
}

func TestImpactTreeFilter(t *testing.T) {
	m := newTestModel(t)
	m.openImpactTree(impactReport())
	tree := m.impactTree

	// Default is all
	if tree.filter != filterAll {
		t.Fatal("default filter must be all")
	}
	// Press 'd' for docs only
	m = impactKey(t, m, "d")
	if tree.filter != filterDocs {
		t.Errorf("d should set filter to docs, got %s", tree.filter)
	}
	// Only the doc group and its item should be visible
	for _, n := range tree.nodes {
		if n.group && n.label != "Wiki documents" {
			t.Errorf("filtering docs should hide %q group", n.label)
		}
	}
	// Press 'a' to return to all
	m = impactKey(t, m, "a")
	if tree.filter != filterAll {
		t.Errorf("a should reset filter to all, got %s", tree.filter)
	}
}

func TestImpactTreeViewRender(t *testing.T) {
	m := newTestModel(t)
	m.openImpactTree(impactReport())
	view := m.impactView()
	if view == "" {
		t.Fatal("impactView must produce output")
	}
	// The header should contain the intent and the risk
	if !strings.Contains(view, "rename ParseArgs") {
		t.Error("view must show the intent")
	}
	// Footer hint
	if !strings.Contains(view, "move") {
		t.Error("view must show the navigation hint line")
	}
}

// Verify that /impact dispatches without panic (empty intent path).
func TestImpactDispatchEmpty(t *testing.T) {
	m := newTestModel(t)
	updated, _ := m.dispatch("/impact")
	got := updated.(Model)
	joined := strings.Join(got.lines, "\n")
	if !strings.Contains(joined, "describe the change") {
		t.Errorf("empty /impact should print usage hint, got:\n%s", joined)
	}
}

func TestImpactTreeUpdateKey(t *testing.T) {
	m := newTestModel(t)
	m.openImpactTree(impactReport())
	m = impactKey(t, m, "u")
	if m.mode != modeChat {
		t.Fatal("u should close the tree")
	}
}

// Ensure the impactMsg handler actually sets the mode.
func TestImpactMsgHandler(t *testing.T) {
	m := newTestModel(t)
	rep := impactReport()
	// Simulate receiving the message through Update.
	updated, _ := m.Update(impactMsg{rep})
	got := updated.(Model)
	if got.mode != modeImpact {
		t.Error("impactMsg must switch to modeImpact")
	}
}

// Ensure the View method doesn't crash in impact mode.
func TestImpactModeView(t *testing.T) {
	m := newTestModel(t)
	m.openImpactTree(impactReport())
	// View() must not panic.
	v := m.View()
	if len(v) == 0 {
		t.Error("View must produce output in impact mode")
	}
}

// Exercise esc inside the impact tree.
func TestImpactEscCloses(t *testing.T) {
	m := newTestModel(t)
	m.openImpactTree(impactReport())
	m = impactKey(t, m, "esc")
	if m.mode != modeChat {
		t.Error("esc must close the impact tree")
	}
}

// Exercise the key-level dispatch: sending a tea.KeyMsg while in impact mode.
func TestImpactModeOnKey(t *testing.T) {
	m := newTestModel(t)
	m.openImpactTree(impactReport())
	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("j")})
	got := updated.(Model)
	if got.impactTree.cursor != 1 {
		t.Errorf("j (down) should move cursor to 1, got %d", got.impactTree.cursor)
	}
}
