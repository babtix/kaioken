package tui

import (
	"path/filepath"
	"strings"

	"github.com/charmbracelet/lipgloss"

	"kaioken/internal/config"
	"kaioken/internal/version"
)

// The KAIOKEN wordmark, per Kaioken-settings-logo.json: "block" font, "fire"
// palette (a vertical red→yellow gradient, like the Kaioken aura), a full-width
// rule, and the uppercase spaced tagline.

// letters holds the 6-row "block" (ANSI Shadow) glyphs used by the wordmark.
var letters = map[rune][6]string{
	'K': {"██╗  ██╗", "██║ ██╔╝", "█████╔╝ ", "██╔═██╗ ", "██║  ██╗", "╚═╝  ╚═╝"},
	'A': {" █████╗ ", "██╔══██╗", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝"},
	'I': {"██╗", "██║", "██║", "██║", "██║", "╚═╝"},
	'O': {" ██████╗ ", "██╔═══██╗", "██║   ██║", "██║   ██║", "╚██████╔╝", " ╚═════╝ "},
	'E': {"███████╗", "██╔════╝", "█████╗  ", "██╔══╝  ", "███████╗", "╚══════╝"},
	'N': {"███╗   ██╗", "████╗  ██║", "██╔██╗ ██║", "██║╚██╗██║", "██║ ╚████║", "╚═╝  ╚═══╝"},
}

// fireColors is the vertical fire gradient (flame tip → ember base).
var fireColors = []string{"226", "220", "214", "208", "202", "196"}

const (
	logoWord    = "KAIOKEN"
	logoTagline = "AGENTIC BUILDERS COLLECTIVE"
	logoWidth   = 54
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

// spaced adds letter-spacing to mimic the tagline's tracked mono style.
func spaced(s string) string {
	return strings.Join(strings.Split(s, ""), " ")
}

// LogoPlain returns the wordmark as uncolored text (for files / non-TUI use).
func LogoPlain() string {
	var b strings.Builder
	for _, r := range bannerRows(logoWord) {
		b.WriteString(r + "\n")
	}
	b.WriteString(strings.Repeat("═", logoWidth) + "\n")
	b.WriteString(spaced(logoTagline) + "\n")
	return b.String()
}

// logoLines returns the fire-gradient wordmark as styled lines. On terminals
// too narrow for the block art it falls back to a compact one-liner.
func logoLines(width int) []string {
	if width > 0 && width < logoWidth+2 {
		return []string{
			lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("196")).Render(logoWord) +
				"  " + dimStyle.Render(strings.ToLower(logoTagline)),
		}
	}
	rows := bannerRows(logoWord)
	out := make([]string, 0, len(rows)+2)
	for i, r := range rows {
		out = append(out, lipgloss.NewStyle().Foreground(lipgloss.Color(fireColors[i%len(fireColors)])).Render(r))
	}
	out = append(out,
		lipgloss.NewStyle().Foreground(lipgloss.Color("196")).Render(strings.Repeat("═", logoWidth)),
		lipgloss.NewStyle().Foreground(lipgloss.Color("208")).Render(spaced(logoTagline)),
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
