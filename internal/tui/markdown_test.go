package tui

import (
	"strings"
	"testing"
)

func TestLooksLikeMarkdown(t *testing.T) {
	structured := []string{
		"# Heading\n\nSome prose with **bold** text.",
		"Here you go:\n\n```go\nfunc main() {}\n```",
		"- first item\n- second item\n- third",
		"| col | col |\n| --- | --- |\n| a | b |",
	}
	for _, s := range structured {
		if !looksLikeMarkdown(s) {
			t.Errorf("expected markdown for %q", preview(s, 1, 40))
		}
	}

	plain := []string{
		"Yes, that file exists.",
		"I updated the config and rebuilt.",
		"",
	}
	for _, s := range plain {
		if looksLikeMarkdown(s) {
			t.Errorf("expected plain prose for %q", s)
		}
	}
}

func TestRenderMarkdownStructured(t *testing.T) {
	out := renderMarkdown("# Title\n\n- one\n- two\n\n**done**", 80)
	if out == "" {
		t.Fatal("render produced nothing")
	}
	// Content must survive rendering even though styling codes are added.
	for _, want := range []string{"Title", "one", "two", "done"} {
		if !strings.Contains(out, want) {
			t.Errorf("rendered output lost %q:\n%s", want, out)
		}
	}
	if strings.HasPrefix(out, "\n") || strings.HasSuffix(out, "\n") {
		t.Error("rendered output should be trimmed of surrounding blank lines")
	}
}

// Plain conversational replies must pass through untouched — no glamour
// margins, no reflow.
func TestRenderMarkdownPlainPassesThrough(t *testing.T) {
	const msg = "Yes, that file exists."
	if got := renderMarkdown(msg, 80); !strings.Contains(got, msg) {
		t.Errorf("plain reply mangled: %q", got)
	}
}

// A terminal too narrow to render must not error or drop the text.
func TestRenderMarkdownNarrowFallsBack(t *testing.T) {
	const msg = "# Title\n\n- one\n- two"
	got := renderMarkdown(msg, 5)
	if !strings.Contains(got, "Title") {
		t.Errorf("narrow fallback lost content: %q", got)
	}
}

// The renderer is cached per width; a resize must produce a renderer for the
// new width rather than reusing a stale one.
func TestMarkdownRendererRebuildsOnResize(t *testing.T) {
	if markdownRenderer(80) == nil {
		t.Fatal("expected a renderer at width 80")
	}
	if rendererWidth != 80 {
		t.Fatalf("rendererWidth = %d, want 80", rendererWidth)
	}
	if markdownRenderer(120) == nil {
		t.Fatal("expected a renderer at width 120")
	}
	if rendererWidth != 120 {
		t.Errorf("rendererWidth = %d after resize, want 120", rendererWidth)
	}
}
