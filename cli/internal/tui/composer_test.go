package tui

import (
	"net/http"
	"strings"
	"testing"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"kaioken/internal/llm"
)

func newTestModel(t *testing.T) Model {
	t.Helper()
	updated, _ := New(t.TempDir()).Update(tea.WindowSizeMsg{Width: 100, Height: 30})
	return updated.(Model)
}

func send(t *testing.T, m Model, msg tea.Msg) Model {
	t.Helper()
	updated, _ := m.Update(msg)
	return updated.(Model)
}

func typeText(t *testing.T, m Model, s string) Model {
	t.Helper()
	return send(t, m, tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(s)})
}

// alt+enter inserts a newline instead of submitting, and the composer grows
// to fit — with the viewport shrinking by the same amount so nothing overlaps.
func TestComposerMultilineGrowsAndShrinksViewport(t *testing.T) {
	m := newTestModel(t)
	singleLineVP := m.vp.Height
	if want := 30 - len(m.header) - 1 - 1; singleLineVP != want {
		t.Fatalf("single-line viewport height = %d, want %d (screen minus sticky header, composer, hint)", singleLineVP, want)
	}

	m = typeText(t, m, "first line")
	m = send(t, m, tea.KeyMsg{Type: tea.KeyEnter, Alt: true})
	m = typeText(t, m, "second line")

	if got := m.input.Value(); got != "first line\nsecond line" {
		t.Errorf("composer value = %q, want two lines", got)
	}
	if m.inputHeight() != 2 {
		t.Errorf("inputHeight = %d, want 2", m.inputHeight())
	}
	if m.vp.Height != singleLineVP-1 {
		t.Errorf("viewport height = %d, want %d (one row given to the composer)",
			m.vp.Height, singleLineVP-1)
	}
}

// Plain enter submits rather than inserting a newline.
func TestComposerEnterSubmits(t *testing.T) {
	m := newTestModel(t)
	m = typeText(t, m, "/version")
	m = send(t, m, tea.KeyMsg{Type: tea.KeyEnter})

	if m.input.Value() != "" {
		t.Errorf("composer should be cleared after submit, got %q", m.input.Value())
	}
	joined := strings.Join(m.lines, "\n")
	if !strings.Contains(joined, "Kaioken v") {
		t.Errorf("expected /version output in the transcript, got:\n%s", joined)
	}
	if want := 30 - len(m.header) - 1 - 1; m.vp.Height != want {
		t.Errorf("viewport should return to full height after submit, got %d, want %d", m.vp.Height, want)
	}
}

// The wordmark + status header is sticky: however far the transcript scrolls,
// the frame still opens with it, like the composer pins the bottom.
func TestHeaderStaysVisibleWhileScrolling(t *testing.T) {
	m := newTestModel(t)
	for i := 0; i < 200; i++ {
		m.appendLine("filler line " + strings.Repeat("x", 40))
	}
	view := m.View()
	if !strings.HasPrefix(view, strings.Join(m.header, "\n")) {
		t.Error("the frame must open with the sticky header even after heavy scrolling")
	}
	if !strings.Contains(view, "Model:") {
		t.Error("sticky status panel must stay visible above a scrolled transcript")
	}
}

// A multi-line prompt must be echoed in full, not truncated to its first line.
func TestMultilineUserEchoShowsEveryLine(t *testing.T) {
	m := newTestModel(t)
	// The echo happens synchronously before the agent goroutine starts, so an
	// unreachable endpoint is enough to exercise it.
	m.client = &llm.Client{
		APIKey: "test", BaseURL: "http://127.0.0.1:1", Model: "test/model",
		HTTP: &http.Client{Timeout: time.Millisecond},
	}

	before := len(m.lines)
	updated, _ := m.startChat("alpha\nbeta\ngamma")
	m = updated.(Model)

	joined := strings.Join(m.lines[before:], "\n")
	for _, want := range []string{"alpha", "beta", "gamma"} {
		if !strings.Contains(joined, want) {
			t.Errorf("multi-line echo dropped %q:\n%s", want, joined)
		}
	}
	if strings.Contains(joined, "no API key") {
		t.Error("startChat should not have reported a missing key")
	}
}

// The hidden /key prompt uses a separate masked field, so the key never
// appears in the composer or on screen.
func TestKeyPromptIsMasked(t *testing.T) {
	m := newTestModel(t)
	updated, _ := m.dispatch("/key")
	m = updated.(Model)

	if !m.pendingKey {
		t.Fatal("expected the model to be waiting for a key")
	}
	m = typeText(t, m, "sk-secret-value")

	if m.keyInput.Value() != "sk-secret-value" {
		t.Errorf("masked field value = %q", m.keyInput.Value())
	}
	if strings.Contains(m.input.Value(), "sk-secret") {
		t.Error("the key leaked into the visible composer")
	}
	if view := m.footer(); strings.Contains(view, "sk-secret") {
		t.Errorf("the key is visible on screen:\n%s", view)
	}

	m = send(t, m, tea.KeyMsg{Type: tea.KeyEnter})
	if m.pendingKey {
		t.Error("enter should end the key prompt")
	}
	if m.keyInput.Value() != "" {
		t.Error("the masked field should be cleared after submit")
	}
}

// ctrl+d quits, but only on an empty composer — a half-typed message must not
// be lost to a stray keystroke.
func TestCtrlDQuitsOnlyWhenEmpty(t *testing.T) {
	// With text typed, ctrl+d must not quit.
	m := newTestModel(t)
	m = typeText(t, m, "a half written thought")
	_, cmd := m.Update(tea.KeyMsg{Type: tea.KeyCtrlD})
	if isQuit(cmd) {
		t.Error("ctrl+d must not quit while the composer has text")
	}

	// Empty composer: it quits.
	m = newTestModel(t)
	_, cmd = m.Update(tea.KeyMsg{Type: tea.KeyCtrlD})
	if !isQuit(cmd) {
		t.Error("ctrl+d on an empty composer should quit")
	}
}

// ctrl+c stops work and clears the composer, but never quits.
func TestCtrlCDoesNotQuit(t *testing.T) {
	m := newTestModel(t)
	m = typeText(t, m, "some text")

	updated, cmd := m.Update(tea.KeyMsg{Type: tea.KeyCtrlC})
	m = updated.(Model)
	if isQuit(cmd) {
		t.Error("ctrl+c should not quit")
	}
	if m.input.Value() != "" {
		t.Errorf("ctrl+c should clear the composer, got %q", m.input.Value())
	}

	// On an empty composer it points at the real quit key rather than exiting.
	updated, cmd = m.Update(tea.KeyMsg{Type: tea.KeyCtrlC})
	if isQuit(cmd) {
		t.Error("ctrl+c on an empty composer should still not quit")
	}
	if !strings.Contains(strings.Join(updated.(Model).lines, "\n"), "ctrl+d to quit") {
		t.Error("ctrl+c should tell the user how to quit")
	}
}

// isQuit reports whether a command is tea.Quit.
func isQuit(cmd tea.Cmd) bool {
	if cmd == nil {
		return false
	}
	_, ok := cmd().(tea.QuitMsg)
	return ok
}

// Arrow keys scroll the transcript while the composer is one line, but move
// the cursor once it is multi-line.
func TestArrowsSwitchBetweenScrollAndCursor(t *testing.T) {
	m := newTestModel(t)
	for i := 0; i < 100; i++ {
		m.appendLine("line")
	}
	m.vp.GotoBottom()
	atBottom := m.vp.YOffset

	m = send(t, m, tea.KeyMsg{Type: tea.KeyUp})
	if m.vp.YOffset >= atBottom {
		t.Error("up should scroll the transcript while the composer is single-line")
	}

	m = typeText(t, m, "a")
	m = send(t, m, tea.KeyMsg{Type: tea.KeyEnter, Alt: true})
	m = typeText(t, m, "b")
	scrolled := m.vp.YOffset
	m = send(t, m, tea.KeyMsg{Type: tea.KeyUp})
	if m.vp.YOffset != scrolled {
		t.Error("up should move the cursor, not scroll, once the composer is multi-line")
	}
}
