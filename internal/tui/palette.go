package tui

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// The command palette: typing "/" opens a filtered list above the composer,
// arrows move through it, tab completes, enter runs the highlighted command.
// It only appears while the command NAME is being typed — once there is a
// space the user is writing arguments, and the menu gets out of the way.

// maxPaletteRows caps how many entries are visible at once.
const maxPaletteRows = 8

var (
	paletteNameStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("117"))
	paletteArgsStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("244"))

	// The selected row is a filled bar rather than just bolder text: at a
	// glance the eye finds a block far faster than a weight change.
	paletteSelBG    = lipgloss.Color("236")
	paletteRowStyle = lipgloss.NewStyle().Background(paletteSelBG)
	paletteSelStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("214")).Background(paletteSelBG).Bold(true)
	paletteSelArgs  = lipgloss.NewStyle().Foreground(lipgloss.Color("246")).Background(paletteSelBG)
	paletteSelDesc  = lipgloss.NewStyle().Foreground(lipgloss.Color("252")).Background(paletteSelBG)
	paletteBarStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("208")).Background(paletteSelBG)
)

// palette is the completion menu's state.
type palette struct {
	active   bool
	items    []command
	selected int
	offset   int // first visible row, for scrolling past maxPaletteRows
	// dismissed holds the composer value at which the menu was closed with esc
	// or tab, so it stays closed until the input actually changes again.
	dismissed string
}

// refresh recomputes the palette from the current composer contents.
func (m *Model) refreshPalette() {
	p := &m.pal
	p.active, p.items = false, nil

	if m.pendingKey || m.pendingApproval || m.mode != modeChat {
		return
	}
	val := m.input.Value()
	if !strings.HasPrefix(val, "/") {
		p.dismissed = ""
		return
	}
	// A space means the command name is settled and arguments are being typed.
	if strings.ContainsAny(val, " \t\n") {
		return
	}
	if val == p.dismissed {
		return
	}
	p.dismissed = ""

	p.items = filterCommands(val[1:])
	p.active = len(p.items) > 0
	if p.selected >= len(p.items) {
		p.selected = 0
	}
	p.clampWindow()
}

// clampWindow keeps the selected row inside the visible slice.
func (p *palette) clampWindow() {
	if p.selected < p.offset {
		p.offset = p.selected
	}
	if p.selected >= p.offset+maxPaletteRows {
		p.offset = p.selected - maxPaletteRows + 1
	}
	if p.offset < 0 {
		p.offset = 0
	}
}

// move steps the selection, wrapping at both ends.
func (p *palette) move(delta int) {
	if len(p.items) == 0 {
		return
	}
	p.selected = (p.selected + delta + len(p.items)) % len(p.items)
	p.clampWindow()
}

// current returns the highlighted command.
func (p *palette) current() (command, bool) {
	if !p.active || p.selected >= len(p.items) {
		return command{}, false
	}
	return p.items[p.selected], true
}

// dismiss closes the menu until the composer changes.
func (m *Model) dismissPalette() {
	m.pal.active = false
	m.pal.items = nil
	m.pal.dismissed = m.input.Value()
}

// completeSelected inserts the highlighted command into the composer. Commands
// that take arguments get a trailing space so the user can keep typing.
func (m *Model) completeSelected() {
	c, ok := m.pal.current()
	if !ok {
		return
	}
	text := "/" + c.name
	if c.args != "" {
		text += " "
	}
	m.input.SetValue(text)
	m.input.CursorEnd()
	m.dismissPalette()
	m.syncLayout()
}

// paletteHeight is how many rows the menu occupies, including its hint line.
func (m Model) paletteHeight() int {
	if !m.pal.active {
		return 0
	}
	n := len(m.pal.items)
	if n > maxPaletteRows {
		n = maxPaletteRows
	}
	return n + 1 // rows plus the key hint
}

// paletteView renders the menu above the composer.
func (m Model) paletteView() string {
	if !m.pal.active {
		return ""
	}
	end := m.pal.offset + maxPaletteRows
	if end > len(m.pal.items) {
		end = len(m.pal.items)
	}
	visible := m.pal.items[m.pal.offset:end]

	// Align the summaries into a column.
	width := 0
	for _, c := range visible {
		if n := len(c.name) + len(c.args) + 2; n > width {
			width = n
		}
	}

	var b strings.Builder
	for i, c := range visible {
		selected := m.pal.offset+i == m.pal.selected
		name := "/" + c.name
		plain := name
		if c.args != "" {
			plain += " " + c.args
		}
		pad := strings.Repeat(" ", max(width-len(plain)+2, 1))

		if !selected {
			row := " " + paletteNameStyle.Render(name)
			if c.args != "" {
				row += " " + paletteArgsStyle.Render(c.args)
			}
			row += pad + hintStyle.Render(c.summary)
			b.WriteString(clip(row, m.width) + "\n")
			continue
		}
		// The highlight is painted across the full width, so the bar reads as
		// one solid row instead of stopping at the end of the summary text.
		row := paletteBarStyle.Render("▎") + paletteSelStyle.Render(name)
		if c.args != "" {
			row += paletteSelArgs.Render(" " + c.args)
		}
		row += paletteRowStyle.Render(pad) + paletteSelDesc.Render(c.summary)
		b.WriteString(paletteRowStyle.Width(m.width).Render(clip(row, m.width)) + "\n")
	}

	hint := "↑↓ move · tab complete · enter run · esc close"
	if len(m.pal.items) > maxPaletteRows {
		hint = itoaTUI(m.pal.selected+1) + "/" + itoaTUI(len(m.pal.items)) + "  " + hint
	}
	b.WriteString(clip(dimStyle.Render("  "+hint), m.width) + "\n")
	return b.String()
}

func itoaTUI(n int) string {
	if n == 0 {
		return "0"
	}
	var d []byte
	for n > 0 {
		d = append([]byte{byte('0' + n%10)}, d...)
		n /= 10
	}
	return string(d)
}
