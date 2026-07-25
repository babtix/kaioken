package tui

import (
	"strings"
	"testing"
	"time"

	"github.com/charmbracelet/lipgloss"
)

// The status line is a fixed one-row budget: the layout must not shift under
// the user, and it must never wrap onto a second line.
func TestStatusLineIsOneRowAndFits(t *testing.T) {
	for _, width := range []int{20, 40, 80, 200} {
		m := newTestModel(t)
		m.width = width
		m.cfg.Model = "anthropic/claude-sonnet-4"
		m.autoApprove = true

		line := m.statusLine()
		if strings.Contains(line, "\n") {
			t.Errorf("width %d: status line wrapped:\n%s", width, line)
		}
		if got := lipgloss.Width(line); got > width {
			t.Errorf("width %d: status line is %d cells wide", width, got)
		}
	}
}

// On a wide terminal both halves are present; on a narrow one the key hints
// win, because they are the part the user cannot get anywhere else.
func TestStatusLineDropsReadoutWhenNarrow(t *testing.T) {
	m := newTestModel(t)
	m.cfg.Model = "anthropic/claude-sonnet-4"

	m.width = 120
	if !strings.Contains(m.statusLine(), "claude-sonnet-4") {
		t.Error("a wide terminal should show the model")
	}
	if !strings.Contains(m.statusLine(), "ctrl+d") {
		t.Error("a wide terminal should show the key hints")
	}

	m.width = 30
	narrow := m.statusLine()
	if strings.Contains(narrow, "claude-sonnet-4") {
		t.Errorf("a narrow terminal should drop the readout, got %q", narrow)
	}
}

// yolo silently auto-applies edits, so it must always be visible.
func TestStatusLineShowsYolo(t *testing.T) {
	m := newTestModel(t)
	if strings.Contains(m.statusLine(), "yolo") {
		t.Error("yolo should not show while approvals are required")
	}
	m.autoApprove = true
	if !strings.Contains(m.statusLine(), "yolo") {
		t.Error("yolo must be visible while edits auto-apply")
	}
}

// While busy the line reports what is running and for how long.
func TestStatusLineShowsElapsedWhileBusy(t *testing.T) {
	m := newTestModel(t)
	m.busy = true
	m.busyText = "wiki"
	m.busyStart = time.Now().Add(-90 * time.Second)

	line := m.statusLine()
	for _, want := range []string{"wiki", "1m30s", "esc to stop"} {
		if !strings.Contains(line, want) {
			t.Errorf("busy status missing %q:\n%s", want, line)
		}
	}
}

func TestShortModel(t *testing.T) {
	cases := map[string]string{
		"anthropic/claude-sonnet-4":              "claude-sonnet-4",
		"gpt-4o":                                 "gpt-4o",
		"nvidia/nemotron-3-ultra-550b-a55b:free": "nemotron-3-ult…5b:free",
		"vendor/":                                "vendor/", // nothing after the slash
	}
	for in, want := range cases {
		if got := shortModel(in); got != want {
			t.Errorf("shortModel(%q) = %q, want %q", in, got, want)
		}
		if n := len([]rune(shortModel(in))); n > modelLabelWidth {
			t.Errorf("shortModel(%q) is %d runes, over the %d cap", in, n, modelLabelWidth)
		}
	}
}

// The counter is width-capped so the right edge of the bar does not jitter as
// tokens accumulate.
func TestHumanTokens(t *testing.T) {
	cases := map[int]string{0: "0", 842: "842", 1000: "1.0k", 12345: "12.3k", 2_500_000: "2.5M"}
	for in, want := range cases {
		got := humanTokens(in)
		if got != want {
			t.Errorf("humanTokens(%d) = %q, want %q", in, got, want)
		}
		if len(got) > 5 {
			t.Errorf("humanTokens(%d) = %q is too wide", in, got)
		}
	}
}

func TestElapsed(t *testing.T) {
	cases := map[time.Duration]string{
		9 * time.Second:                  "9s",
		59 * time.Second:                 "59s",
		64 * time.Second:                 "1m04s",
		59*time.Minute + 59*time.Second:  "59m59s",
		time.Hour + 2*time.Minute:        "1h02m",
		3*time.Hour + 30*time.Minute + 5: "3h30m",
	}
	for in, want := range cases {
		if got := elapsed(in); got != want {
			t.Errorf("elapsed(%v) = %q, want %q", in, got, want)
		}
	}
}

// Each tool gets its own glyph, and every tool the agent can call is covered
// so none of them fall back to the generic mark.
func TestToolGlyphsCoverEveryTool(t *testing.T) {
	for _, name := range []string{"read_file", "list_files", "search", "write_file", "edit_file", "run_command"} {
		if _, ok := toolGlyphs[name]; !ok {
			t.Errorf("tool %q has no glyph", name)
		}
	}
	line := toolCallLine("read_file", `{"path":"internal/tui/tui.go"}`)
	if !strings.Contains(line, "read_file") || !strings.Contains(line, "internal/tui/tui.go") {
		t.Errorf("tool call line should name the tool and its target: %q", line)
	}
	// An unknown tool still renders rather than losing its name.
	if !strings.Contains(toolCallLine("mystery", "{}"), "mystery") {
		t.Error("an unregistered tool should still render its name")
	}
}
