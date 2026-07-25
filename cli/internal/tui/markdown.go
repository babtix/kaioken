package tui

import (
	"strings"
	"sync"

	"github.com/charmbracelet/glamour"
)

// Assistant replies are markdown: headings, lists, tables and fenced code.
// Glamour turns that into styled terminal output. Rendering is deliberately
// deferred to the END of a turn — re-rendering markdown on every streamed
// token would reflow the whole block continuously — so the live region shows
// raw text and this replaces it once the reply is complete.

var (
	rendererMu    sync.Mutex
	renderer      *glamour.TermRenderer
	rendererWidth int
)

// markdownRenderer returns a renderer for the given width, rebuilding it only
// when the terminal is resized. A nil renderer means "fall back to raw text".
func markdownRenderer(width int) *glamour.TermRenderer {
	rendererMu.Lock()
	defer rendererMu.Unlock()
	if renderer != nil && rendererWidth == width {
		return renderer
	}
	r, err := glamour.NewTermRenderer(
		glamour.WithAutoStyle(), // honors the terminal's light/dark background
		glamour.WithWordWrap(width),
		glamour.WithEmoji(),
	)
	if err != nil {
		return nil
	}
	renderer, rendererWidth = r, width
	return r
}

// renderMarkdown styles an assistant reply for the terminal. It returns the
// input unchanged when rendering is not possible or not worth it, so a plain
// one-line answer never gains surprising padding.
func renderMarkdown(text string, width int) string {
	if width < 20 || !looksLikeMarkdown(text) {
		return assistantStyle.Render(text)
	}
	r := markdownRenderer(width)
	if r == nil {
		return assistantStyle.Render(text)
	}
	out, err := r.Render(text)
	if err != nil {
		return assistantStyle.Render(text)
	}
	// Glamour frames blocks with blank lines; the TUI adds its own spacing.
	return strings.Trim(out, "\n")
}

// looksLikeMarkdown reports whether text carries structure worth rendering.
// Short conversational replies are left alone — running them through glamour
// only wraps them in margins and costs a parse.
func looksLikeMarkdown(text string) bool {
	if strings.Contains(text, "```") {
		return true
	}
	structural := 0
	for _, line := range strings.Split(text, "\n") {
		t := strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(t, "#"),
			strings.HasPrefix(t, "- "), strings.HasPrefix(t, "* "),
			strings.HasPrefix(t, "> "), strings.HasPrefix(t, "|"),
			strings.HasPrefix(t, "1. "):
			structural++
		}
		if strings.Contains(t, "**") || strings.Contains(t, "`") {
			structural++
		}
	}
	return structural >= 2
}
