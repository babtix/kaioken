package tui

import (
	"strings"
	"testing"

	"kaioken/internal/config"
)

func TestWelcomeBannerSideBySide(t *testing.T) {
	cfg := config.Default()
	cfg.Model = "anthropic/claude-sonnet-4.5"
	cfg.Provider = "openrouter"

	lines := welcomeBanner(cfg, `D:\xii\medcore`, true, 120)
	joined := strings.Join(lines, "\n")
	t.Log("\n" + joined)

	for _, want := range []string{"kaioken@medcore", "Version:", "Model:", "Provider:", "openrouter"} {
		if !strings.Contains(joined, want) {
			t.Errorf("banner missing %q", want)
		}
	}
	// Art and info should share rows (side-by-side), so the KAIOKEN glyph
	// row and the header line must land on the SAME line of output.
	found := false
	for _, l := range lines {
		if strings.Contains(l, "█") && strings.Contains(l, "kaioken@medcore") {
			found = true
		}
	}
	if !found {
		t.Error("expected art and header on the same row (side-by-side layout) at width 120")
	}
}

func TestWelcomeBannerNarrowStacks(t *testing.T) {
	cfg := config.Default()
	lines := welcomeBanner(cfg, `D:\xii\medcore`, false, 60)
	joined := strings.Join(lines, "\n")
	t.Log("\n" + joined)
	if !strings.Contains(joined, "kaioken@medcore") {
		t.Error("narrow banner missing header")
	}
	// Should NOT be side-by-side at 60 cols — art and header on different lines.
	for _, l := range lines {
		if strings.Contains(l, "█") && strings.Contains(l, "kaioken@medcore") {
			t.Error("expected stacked layout at width 60, got side-by-side")
		}
	}
}

// The sticky header keeps the full banner on roomy terminals but collapses to
// a compact strip on short ones, so the chat area is never crushed.
func TestStickyHeaderCompactsOnShortTerminal(t *testing.T) {
	cfg := config.Default()

	full := stickyHeader(cfg, `D:\xii\medcore`, true, 120, 40)
	if len(full) < 8 {
		t.Errorf("tall terminal should keep the full banner, got %d rows", len(full))
	}

	compact := stickyHeader(cfg, `D:\xii\medcore`, true, 120, 12)
	if len(compact) >= len(full) {
		t.Errorf("short terminal should collapse the header (%d rows), got %d", len(full), len(compact))
	}
	joined := strings.Join(compact, "\n")
	t.Log("\n" + joined)
	for _, want := range []string{"KAIOKEN", "Model:", "Provider:", "API Key:"} {
		if !strings.Contains(joined, want) {
			t.Errorf("compact header missing %q", want)
		}
	}
}
