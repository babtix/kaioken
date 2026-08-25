package tui

import (
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

// typing "/" alone must offer the whole palette.
func TestSlashOpensFullPalette(t *testing.T) {
	m := newTestModel(t)
	m = typeText(t, m, "/")

	if !m.pal.active {
		t.Fatal("typing / should open the palette")
	}
	if len(m.pal.items) != len(commands) {
		t.Errorf("palette shows %d of %d commands", len(m.pal.items), len(commands))
	}
	// The view is a window onto the list, so only the first rows are drawn,
	// with a position indicator when there are more.
	view := m.paletteView()
	if got := strings.Count(view, "\n"); got != maxPaletteRows+1 {
		t.Errorf("view has %d lines, want %d rows plus a hint", got, maxPaletteRows+1)
	}
	if !strings.Contains(view, "/"+m.pal.items[0].name) {
		t.Errorf("first entry not drawn:\n%s", view)
	}
	if !strings.Contains(view, "tab complete") {
		t.Error("palette should show its key hints")
	}
	if !strings.Contains(view, "/"+itoaTUI(len(m.pal.items))) {
		t.Errorf("a scrolling palette should show its position:\n%s", view)
	}
}

// A letter or two narrows the list.
func TestPaletteFilters(t *testing.T) {
	m := newTestModel(t)
	m = typeText(t, m, "/wi")

	if !m.pal.active {
		t.Fatal("palette should stay open while filtering")
	}
	for _, c := range m.pal.items {
		if c.matches("wi") == 0 {
			t.Errorf("%q does not match the filter", c.name)
		}
	}
	if len(m.pal.items) >= len(commands) {
		t.Errorf("filter did not narrow the list (%d entries)", len(m.pal.items))
	}
	if m.pal.items[0].name != "wiki" {
		t.Errorf("best match should lead, got %q", m.pal.items[0].name)
	}
}

// Prefix matches must outrank substring matches.
func TestPaletteRanksPrefixFirst(t *testing.T) {
	got := filterCommands("co")
	if len(got) < 2 {
		t.Fatalf("expected several matches for 'co', got %d", len(got))
	}
	if !strings.HasPrefix(got[0].name, "co") {
		t.Errorf("a prefix match should lead, got %q", got[0].name)
	}
}

// A short filter must not drag in mid-name coincidences: "/w" means wiki, not
// "new". Longer input may still match mid-name, so "/date" finds "update".
func TestShortFilterIsPrefixOnly(t *testing.T) {
	for _, c := range filterCommands("w") {
		if !strings.HasPrefix(c.name, "w") {
			t.Errorf("%q matched the one-letter filter %q by substring", c.name, "w")
		}
	}
	got := filterCommands("date")
	found := false
	for _, c := range got {
		if c.name == "update" {
			found = true
		}
	}
	if !found {
		t.Errorf("a longer mid-name filter should still match: %v", names(got))
	}
}

// An alias must be completable even though it is not a name.
func TestAliasFiltering(t *testing.T) {
	got := filterCommands("gen")
	if len(got) == 0 || got[0].name != "cards" {
		t.Errorf("'gen' should reach the cards command, got %v", names(got))
	}
}

func names(cs []command) []string {
	var out []string
	for _, c := range cs {
		out = append(out, c.name)
	}
	return out
}

// A filter matching nothing closes the menu rather than showing an empty box.
func TestPaletteClosesWhenNothingMatches(t *testing.T) {
	m := newTestModel(t)
	m = typeText(t, m, "/zzzzz")
	if m.pal.active {
		t.Errorf("palette should close with no matches, got %d items", len(m.pal.items))
	}
	if m.paletteHeight() != 0 {
		t.Error("a closed palette must take no rows")
	}
}

// Once arguments are being typed the menu gets out of the way.
func TestPaletteClosesAfterSpace(t *testing.T) {
	m := newTestModel(t)
	m = typeText(t, m, "/wiki")
	if !m.pal.active {
		t.Fatal("palette should be open on the command name")
	}
	m = typeText(t, m, " x3")
	if m.pal.active {
		t.Error("palette should close once arguments are being typed")
	}
}

// Plain prose must never open the menu.
func TestPaletteStaysClosedForChat(t *testing.T) {
	m := newTestModel(t)
	m = typeText(t, m, "how does the wiki work")
	if m.pal.active {
		t.Error("chat text should not open the palette")
	}
}

func TestPaletteNavigationWraps(t *testing.T) {
	m := newTestModel(t)
	m = typeText(t, m, "/")

	if m.pal.selected != 0 {
		t.Fatalf("selection should start at 0, got %d", m.pal.selected)
	}
	m = send(t, m, tea.KeyMsg{Type: tea.KeyDown})
	if m.pal.selected != 1 {
		t.Errorf("down = %d, want 1", m.pal.selected)
	}
	// Up from the top wraps to the end.
	m = send(t, m, tea.KeyMsg{Type: tea.KeyUp})
	m = send(t, m, tea.KeyMsg{Type: tea.KeyUp})
	if m.pal.selected != len(m.pal.items)-1 {
		t.Errorf("up from the top should wrap, got %d", m.pal.selected)
	}
}

// Long lists scroll: the selected row must stay inside the visible window.
func TestPaletteScrollsSelectionIntoView(t *testing.T) {
	m := newTestModel(t)
	m = typeText(t, m, "/")
	if len(m.pal.items) <= maxPaletteRows {
		t.Skip("palette fits on screen; nothing to scroll")
	}
	for i := 0; i < maxPaletteRows+2; i++ {
		m = send(t, m, tea.KeyMsg{Type: tea.KeyDown})
	}
	if m.pal.selected < m.pal.offset || m.pal.selected >= m.pal.offset+maxPaletteRows {
		t.Errorf("selection %d outside the window [%d,%d)",
			m.pal.selected, m.pal.offset, m.pal.offset+maxPaletteRows)
	}
	if !strings.Contains(m.paletteView(), "/"+m.pal.items[m.pal.selected].name) {
		t.Error("the selected command should be visible after scrolling")
	}
}

// Tab completes without running, leaving room for arguments.
func TestTabCompletes(t *testing.T) {
	m := newTestModel(t)
	m = typeText(t, m, "/wik")
	m = send(t, m, tea.KeyMsg{Type: tea.KeyTab})

	if got := m.input.Value(); got != "/wiki " {
		t.Errorf("composer = %q, want %q (trailing space for args)", got, "/wiki ")
	}
	if m.pal.active {
		t.Error("palette should close after completing")
	}
	// Nothing ran: the transcript should not have gained command output.
	if strings.Contains(strings.Join(m.lines, "\n"), "scanned") {
		t.Error("tab must not execute the command")
	}
}

// A command taking no arguments completes without a trailing space.
func TestTabCompletesArglessCommand(t *testing.T) {
	m := newTestModel(t)
	m = typeText(t, m, "/vers")
	m = send(t, m, tea.KeyMsg{Type: tea.KeyTab})
	if got := m.input.Value(); got != "/version" {
		t.Errorf("composer = %q, want %q", got, "/version")
	}
}

// After tab the menu stays closed until the composer changes again.
func TestPaletteStaysClosedAfterTabUntilTyping(t *testing.T) {
	m := newTestModel(t)
	m = typeText(t, m, "/vers")
	m = send(t, m, tea.KeyMsg{Type: tea.KeyTab})
	if m.pal.active {
		t.Fatal("palette should be closed right after tab")
	}
	// Typing more reopens it.
	m = typeText(t, m, "i")
	if !m.pal.active && len(filterCommands("versioni")) > 0 {
		t.Error("typing after tab should reconsider the palette")
	}
}

// Enter runs the highlighted command directly.
func TestEnterRunsSelected(t *testing.T) {
	m := newTestModel(t)
	m = typeText(t, m, "/vers")
	m = send(t, m, tea.KeyMsg{Type: tea.KeyEnter})

	if m.input.Value() != "" {
		t.Errorf("composer should be cleared, got %q", m.input.Value())
	}
	if m.pal.active {
		t.Error("palette should close after running")
	}
	if !strings.Contains(strings.Join(m.lines, "\n"), "Kaioken v") {
		t.Error("enter should have run /version")
	}
}

// Enter runs the HIGHLIGHTED command, not merely what was typed.
func TestEnterRunsHighlightedNotTyped(t *testing.T) {
	m := newTestModel(t)
	m = typeText(t, m, "/")
	// Walk to /version wherever it sits in the list.
	target := -1
	for i, c := range m.pal.items {
		if c.name == "version" {
			target = i
			break
		}
	}
	if target == -1 {
		t.Fatal("/version missing from the palette")
	}
	for i := 0; i < target; i++ {
		m = send(t, m, tea.KeyMsg{Type: tea.KeyDown})
	}
	m = send(t, m, tea.KeyMsg{Type: tea.KeyEnter})
	if !strings.Contains(strings.Join(m.lines, "\n"), "Kaioken v") {
		t.Error("enter should run the highlighted entry")
	}
}

func TestEscClosesPalette(t *testing.T) {
	m := newTestModel(t)
	m = typeText(t, m, "/wi")
	m = send(t, m, tea.KeyMsg{Type: tea.KeyEsc})

	if m.pal.active {
		t.Error("esc should close the palette")
	}
	if m.input.Value() != "/wi" {
		t.Errorf("esc should keep the typed text, got %q", m.input.Value())
	}
	// It stays closed while the text is unchanged...
	m = send(t, m, tea.KeyMsg{Type: tea.KeyUp})
	if m.pal.active {
		t.Error("palette should stay dismissed until the text changes")
	}
	// ...and reopens once it does.
	m = typeText(t, m, "k")
	if !m.pal.active {
		t.Error("typing after esc should reopen the palette")
	}
}

// The palette takes rows from the viewport so it never overlaps the transcript.
func TestPaletteShrinksViewport(t *testing.T) {
	m := newTestModel(t)
	full := m.vp.Height

	m = typeText(t, m, "/")
	if m.paletteHeight() == 0 {
		t.Fatal("open palette should occupy rows")
	}
	if m.vp.Height != full-m.paletteHeight() {
		t.Errorf("viewport = %d, want %d (palette takes %d rows)",
			m.vp.Height, full-m.paletteHeight(), m.paletteHeight())
	}

	m = send(t, m, tea.KeyMsg{Type: tea.KeyEsc})
	if m.vp.Height != full {
		t.Errorf("viewport should be restored to %d, got %d", full, m.vp.Height)
	}
}

// The hidden /key prompt must never be interrupted by the palette.
func TestPaletteSuppressedDuringKeyPrompt(t *testing.T) {
	m := newTestModel(t)
	updated, _ := m.dispatch("/key")
	m = updated.(Model)
	m = typeText(t, m, "/sk-looks-like-a-command")
	if m.pal.active {
		t.Error("palette must stay closed while entering an API key")
	}
}

// Every registered command must actually be handled by dispatch — otherwise
// the palette would offer commands that answer "unknown command".
func TestEveryRegisteredCommandIsDispatched(t *testing.T) {
	skip := map[string]bool{
		"quit": true, // returns tea.Quit
		"key":  true, // enters the hidden-input mode
	}
	for _, c := range commands {
		if skip[c.name] {
			continue
		}
		names := append([]string{c.name}, c.aliases...)
		for _, n := range names {
			m := newTestModel(t)
			updated, _ := m.dispatch("/" + n)
			got := updated.(Model)
			joined := strings.Join(got.lines, "\n")
			if strings.Contains(joined, "unknown command") {
				t.Errorf("/%s is offered by the palette but not handled by dispatch", n)
			}
		}
	}
}

// And every command name is unique, so completion is unambiguous.
func TestCommandNamesUnique(t *testing.T) {
	seen := map[string]string{}
	for _, c := range commands {
		for _, n := range append([]string{c.name}, c.aliases...) {
			if prev, dup := seen[n]; dup {
				t.Errorf("%q is claimed by both %q and %q", n, prev, c.name)
			}
			seen[n] = c.name
		}
	}
}

func TestEveryCommandHasSummary(t *testing.T) {
	for _, c := range commands {
		if strings.TrimSpace(c.summary) == "" {
			t.Errorf("command %q has no summary", c.name)
		}
	}
}
