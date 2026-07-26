package tui

import (
	"path/filepath"
	"strings"

	"github.com/charmbracelet/lipgloss"

	"kaioken/internal/config"
	"kaioken/internal/version"
)

// The KAIOKEN wordmark, per KAIOKEN-settings.json: "block" font, "custom"
// palette (a diagonal gradient from bottom-right red #ff0000 to top-left
// orange #ff8800), a full-width rule, and no tagline.

// letters holds the 6-row "block" (ANSI Shadow) glyphs used by the wordmark.
var letters = map[rune][6]string{
	'K': {"██╗  ██╗", "██║ ██╔╝", "█████╔╝ ", "██╔═██╗ ", "██║  ██╗", "╚═╝  ╚═╝"},
	'A': {" █████╗ ", "██╔══██╗", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝"},
	'I': {"██╗", "██║", "██║", "██║", "██║", "╚═╝"},
	'O': {" ██████╗ ", "██╔═══██╗", "██║   ██║", "██║   ██║", "╚██████╔╝", " ╚═════╝ "},
	'E': {"███████╗", "██╔════╝", "█████╗  ", "██╔══╝  ", "███████╗", "╚══════╝"},
	'N': {"███╗   ██╗", "████╗  ██║", "██╔██╗ ██║", "██║╚██╗██║", "██║ ╚████║", "╚═╝  ╚═══╝"},
}

// diagRamp is the diagonal gradient ramp indexed from top-left (red
// #ff0000) to bottom-right (orange #ff8800). One-directional, not symmetric.
var diagRamp = []string{"214", "208", "202", "196", "196", "196"}

// diagColor returns the gradient color for a given letter index (0–6) and row
// (0–5). The gradient runs diagonally from top-left (red) to bottom-right
// (orange): t = (col + (maxRow - row)) / (maxCol + maxRow).
func diagColor(col, row int) lipgloss.Color {
	const maxCol = 6 // 7 letters - 1
	const maxRow = 5 // 6 rows - 1
	t := (col + (maxRow - row)) * (len(diagRamp) - 1) / (maxCol + maxRow)
	return lipgloss.Color(diagRamp[t])
}

const (
	logoWord  = "KAIOKEN"
	logoWidth = 54
)

// bannerRows renders a word into 6 rows of block glyphs.
func bannerRows(word string) []string {
	rows := make([]string, 6)
	for _, ch := range strings.ToUpper(word) {
		g, ok := letters[ch]
		if !ok {
			continue
		}
		for i := 0; i < 6; i++ {
			rows[i] += g[i]
		}
	}
	return rows
}

// LogoPlain returns the wordmark as uncolored text (for files / non-TUI use).
func LogoPlain() string {
	var b strings.Builder
	for _, r := range bannerRows(logoWord) {
		b.WriteString(r + "\n")
	}
	b.WriteString(strings.Repeat("═", logoWidth) + "\n")
	return b.String()
}

// logoLines returns the custom-gradient wordmark as styled lines. On terminals
// too narrow for the block art it falls back to a compact one-liner.
func logoLines(width int) []string {
	if width > 0 && width < logoWidth+2 {
		return []string{
			lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("208")).Render(logoWord),
		}
	}
	chars := []rune(strings.ToUpper(logoWord))
	rows := make([]string, 6)
	for ci, ch := range chars {
		g, ok := letters[ch]
		if !ok {
			continue
		}
		for i := 0; i < 6; i++ {
			rows[i] += lipgloss.NewStyle().Foreground(diagColor(ci, i)).Render(g[i])
		}
	}
	out := make([]string, 0, len(rows)+1)
	for _, r := range rows {
		out = append(out, r)
	}
	out = append(out,
		lipgloss.NewStyle().Foreground(lipgloss.Color("208")).Render(strings.Repeat("═", logoWidth)),
	)
	return out
}

// welcomeBanner renders the KAIOKEN wordmark on the left and a neofetch/
// screenfetch-style info panel on the right: "kaioken@<repo>" header, a
// rule, then aligned key: value fields. Falls back to a stacked layout
// (art above, info below) when the terminal is too narrow for both columns.
func welcomeBanner(cfg *config.Config, repo string, hasKey bool, termWidth int) []string {
	left := logoLines(termWidth)
	right := append(statusPanel(cfg, repo, hasKey),
		"",
		dimStyle.Render("type to chat · press / for commands · /tutorial to learn them"),
	)

	gap := "   "
	if termWidth > 0 && termWidth < blockWidth(left)+len(gap)+blockWidth(right)+2 {
		// Too narrow for side-by-side: stack instead.
		out := append([]string{}, left...)
		out = append(out, "")
		return append(out, right...)
	}
	block := lipgloss.JoinHorizontal(lipgloss.Top, strings.Join(left, "\n"), gap, strings.Join(right, "\n"))
	return strings.Split(block, "\n")
}

// stickyHeader is the fixed top block of the TUI: the wordmark plus the live
// status panel (model/provider/key), always visible while the transcript
// scrolls beneath it — the top counterpart of the pinned composer. When the
// banner would swallow too much of a short terminal it collapses to a compact
// two-liner so the conversation keeps the room.
func stickyHeader(cfg *config.Config, repo string, hasKey bool, termWidth, termHeight int) []string {
	full := welcomeBanner(cfg, repo, hasKey, termWidth)
	// The header may claim at most ~40% of the screen; below that the chat
	// area would be unusably small, so trade the art for a compact strip.
	if termHeight <= 0 || len(full)*5 <= termHeight*2 {
		return full
	}
	return compactHeader(cfg, hasKey, termWidth)
}

// compactHeader is the short-terminal fallback: one row of branding and one
// row of live status, instead of the eight-row wordmark + panel block.
func compactHeader(cfg *config.Config, hasKey bool, termWidth int) []string {
	title := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("208")).Render(logoWord)
	keyVal := keyMissingStyle.Render("not set")
	if hasKey {
		keyVal = keyOKStyle.Render("saved ✓")
	}
	summary := dimStyle.Render("Model: ") + cfg.Model +
		dimStyle.Render("  Provider: ") + cfg.Provider +
		dimStyle.Render("  API Key: ") + keyVal
	return []string{clip(title, termWidth), clip(summary, termWidth)}
}

// statusPanel is the right-hand info block on its own: header, rule, then
// Version/Repo/Model/Provider/API Key fields. Split out from welcomeBanner so
// it can be reprinted on its own — after a /model, /provider or /key change —
// without redrawing the wordmark, which would otherwise be the only place
// this information is visible.
func statusPanel(cfg *config.Config, repo string, hasKey bool) []string {
	header := "kaioken@" + repoLabel(repo)
	keyVal := keyMissingStyle.Render("not set — /key to add one")
	if hasKey {
		keyVal = keyOKStyle.Render("saved ✓")
	}
	out := []string{
		lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("208")).Render(header),
		dimStyle.Render(strings.Repeat("─", len([]rune(header)))),
	}
	return append(out, kv([][2]string{
		{"Version", version.Version},
		{"Repo", shortPath(repo)},
		{"Model", cfg.Model},
		{"Provider", cfg.Provider},
		{"API Key", keyVal},
	})...)
}

func blockWidth(lines []string) int {
	w := 0
	for _, l := range lines {
		if lw := lipgloss.Width(l); lw > w {
			w = lw
		}
	}
	return w
}

func repoLabel(repo string) string {
	name := filepath.Base(filepath.Clean(repo))
	if name == "." || name == "" || name == string(filepath.Separator) {
		return "repo"
	}
	return name
}

// kv renders "label: value" pairs with colons colon-aligned, neofetch-style.
func kv(pairs [][2]string) []string {
	maxLabel := 0
	for _, p := range pairs {
		if n := len(p[0]) + 1; n > maxLabel {
			maxLabel = n
		}
	}
	out := make([]string, len(pairs))
	for i, p := range pairs {
		label := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("208")).Render(p[0] + ":")
		pad := strings.Repeat(" ", maxLabel-len(p[0])-1)
		out[i] = label + pad + " " + p[1]
	}
	return out
}
