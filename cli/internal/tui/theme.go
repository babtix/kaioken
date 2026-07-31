package tui

// Theme system.
//
// A theme is a named palette of ANSI-256 colours the TUI draws in. Three
// ship built-in: "default" (dark-terminal, the one shipped from day one),
// "light" (for white-background terminals), and "highcontrast" (fewer
// decorations, larger jumps between roles). Config key: theme; switching at
// runtime via /theme <name>.
//
// Colours are strings that go into lipgloss.Color — the library resolves
// ANSI codes, hex, and CSS names on whatever the terminal supports.

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// Theme is one named palette.
type Theme struct {
	Name         string
	Prompt       string
	Hint         string
	OK           string
	Err          string
	Warn         string
	Dim          string
	User         string
	Assistant    string
	Tool         string
	ToolResult   string
	DiffAdd      string
	DiffDel      string
	Approval     string
	Spinner      string
	KeyOK        string
	KeyMissing   string
	BusyPrompt   string
	YoloPrompt   string
}

// built-in themes.
var themes = map[string]Theme{
	"default": {
		Name: "default", Prompt: "63", Hint: "240", OK: "42", Err: "203",
		Warn: "214", Dim: "244", User: "117", Assistant: "252", Tool: "180",
		ToolResult: "108", DiffAdd: "42", DiffDel: "203", Approval: "214",
		Spinner: "63", KeyOK: "42", KeyMissing: "203", BusyPrompt: "240",
		YoloPrompt: "214",
	},
	"light": {
		Name: "light", Prompt: "25", Hint: "245", OK: "28", Err: "196",
		Warn: "208", Dim: "240", User: "27", Assistant: "235", Tool: "130",
		ToolResult: "22", DiffAdd: "28", DiffDel: "196", Approval: "208",
		Spinner: "25", KeyOK: "28", KeyMissing: "196", BusyPrompt: "245",
		YoloPrompt: "208",
	},
	"highcontrast": {
		Name: "highcontrast", Prompt: "51", Hint: "250", OK: "46", Err: "196",
		Warn: "226", Dim: "250", User: "195", Assistant: "255", Tool: "229",
		ToolResult: "158", DiffAdd: "46", DiffDel: "196", Approval: "226",
		Spinner: "51", KeyOK: "46", KeyMissing: "196", BusyPrompt: "250",
		YoloPrompt: "226",
	},
}

// ThemeNames returns the known theme names in a stable order.
func ThemeNames() []string { return []string{"default", "light", "highcontrast"} }

// LookupTheme returns a named theme, or nil when not found.
func LookupTheme(name string) *Theme {
	t, ok := themes[name]
	if !ok {
		return nil
	}
	return &t
}

// applyTheme updates the package-level style variables. It is called once at
// startup (from the config key) and again on /theme.
func applyTheme(t Theme) {
	promptStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(t.Prompt)).Bold(true)
	hintStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(t.Hint))
	okStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(t.OK))
	errStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(t.Err))
	warnStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(t.Warn))
	dimStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(t.Dim))
	userStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(t.User)).Bold(true)
	assistantStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(t.Assistant))
	toolStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(t.Tool))
	toolResStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(t.ToolResult))
	diffAddStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(t.DiffAdd))
	diffDelStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(t.DiffDel))
	approvalStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(t.Approval)).Bold(true)
	spinnerStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(t.Spinner))
	keyOKStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(t.KeyOK))
	keyMissingStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(t.KeyMissing))
	busyPromptStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(t.BusyPrompt)).Bold(true)
	yoloPromptStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(t.YoloPrompt)).Bold(true)
}

// doTheme switches or lists themes.
func (m *Model) doTheme(arg string) {
	arg = strings.TrimSpace(strings.ToLower(arg))
	if arg == "" {
		cur := m.cfg.Theme
		if cur == "" {
			cur = "default"
		}
		m.appendLine(dimStyle.Render("theme: " + cur + " — /theme " + strings.Join(ThemeNames(), "|")))  
		return
	}
	t := LookupTheme(arg)
	if t == nil {
		m.appendLine(errStyle.Render("unknown theme — available: " + strings.Join(ThemeNames(), ", ")))
		return
	}
	m.cfg.Theme = arg
	m.saveCfg()
	applyTheme(*t)
	m.appendLine(okStyle.Render("theme → " + arg + " (saved)"))
}
