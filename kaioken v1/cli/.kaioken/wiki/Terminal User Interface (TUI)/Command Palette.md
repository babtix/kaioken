# Command Palette

Describes the slash-command interface activated by typing `/` in the TUI, including its dynamic filtering, keyboard navigation, visual styling, and command execution flow.

## Table of Contents
- [Palette Structure](#palette-structure)
- [Palette Methods](#palette-methods)
- [TUI Integration](#tui-integration)
- [Key Handling](#key-handling)
- [Rendering and Styling](#rendering-and-styling)
- [Command Execution Flow](#command-execution-flow)
- [Referenced Files](#referenced-files)

## Palette Structure

The command palette state is managed by the `palette` struct in `cli/internal/tui/palette.go`. It tracks whether the menu is active, the filtered list of available commands, the currently selected item, and viewport offset for scrolling.

`cli/internal/tui/palette.go:32-40`
```go
type palette struct {
	active   bool
	items    []command
	selected int
	offset   int // first visible row, for scrolling past maxPaletteRows
	// dismissed holds the composer value at which the menu was closed with esc
	// or tab, so it stays closed until the input actually changes again.
	dismissed string
}
```

- `active`: Boolean indicating if the palette is currently visible.
- `items`: Slice of `command` structs (defined elsewhere) matching the current input filter. Each command has `name`, `args`, and `summary` fields.
- `selected`: Index of the currently highlighted command in `items`.
- `offset`: Vertical scroll offset for when `items` exceeds `maxPaletteRows`.
- `dismissed`: Stores the input value when the palette was closed to prevent immediate reactivation on unchanged input.

The palette only appears while typing a command name (input starts with `/` and contains no whitespace). Once a space is entered, the palette dismisses and the user types arguments are free-form argument entry begins.

`cli/internal/tui/palette.go:15`
```go
const maxPaletteRows = 8
```

Maximum number of command entries visible at once before scrolling is required.

## Palette Methods

The palette provides methods for state management, navigation, and selection.

### Internal State Management

`cli/internal/tui/palette.go:43-70`
```go
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
```

Called on every composer change to update the palette:
- Deactivates if in non-chat modes, pending approval/key entry, or input doesn't start with `/`.
- Clears if input contains whitespace (indicating argument entry).
- Prevents reactivation if input matches the dismissed value.
- Filters available commands using `filterCommands` (not shown in source) on the text after `/`.
- Resets selection if out of bounds and adjusts viewport offset.

`cli/internal/tui/palette.go:103-107`
```go
func (m *Model) dismissPalette() {
	m.pal.active = false
	m.pal.items = nil
	m.pal.dismissed = m.input.Value()
}
```

Deactivates the palette and stores current input to prevent immediate reactivation.

### Navigation

`cli/internal/tui/palette.go:86-92`
```go
func (p *palette) move(delta int) {
	if len(p.items) == 0 {
		return
	}
	p.selected = (p.selected + delta + len(p.items)) % len(p.items)
	p.clampWindow()
}
```

Changes selection by `delta` (negative for up, positive for down) with wrapping at boundaries, then clamps the viewport.

`cli/internal/tui/palette.go:73-83`
```go
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
```
Ensures the selected row is within the visible window by adjusting `offset`.

### Selection Query

`cli/internal/tui/palette.go:95-100`
```go
func (p *palette) current() (command, bool) {
	if !p.active || p.selected >= len(p.items) {
		return command{}, false
	}
	return p.items[p.selected], true
}
```
Returns the currently highlighted command and a boolean indicating validity.

### Command Completion

`cli/internal/tui/palette.go:111-124`
```go
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
```
Inserts the selected command into the composer:
- Adds leading `/` and command name.
- Appends a space if the command expects arguments (non-empty `args`).
- Clears composer selection and moves cursor to end.
- Dismisses palette and synchronizes layout.

### View Metrics

`cli/internal/tui/palette.go:127-136`
```go
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
```
Returns the vertical space required by the palette (visible rows + 1 line for navigation hints).

## TUI Integration

The TUI Model (`cli/internal/tui/tui.go`) embeds the palette and manages its lifecycle through input handling and rendering.

`cli/internal/tui/tui.go:127-185`
```go
type Model struct {
	// ... other fields ...
	pal             palette // slash-command completion menu
	// ... other fields ...
}
```

The palette is updated and rendered during the TUI's update and view cycles.

`cli/internal/tui/tui.go:288-428`
```go
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	// ... other cases ...
	case tea.KeyMsg:
		return m.onKey(msg)
	// ... other cases ...
	default:
		var c tea.Cmd
		m.input, c = m.input.Update(msg)
		// Typing changes both the completion candidates and, when a line wraps
		// or is added, the composer height.
		m.refreshPalette()
		m.syncLayout()
		return m, c
	}
```
- Key presses are handled by `onKey`.
- For all other input (text input), the composer is updated, then `refreshPalette` is called to update command suggestions, followed by `syncLayout` to adjust viewport sizing.

`cli/internal/tui/tui.go:592-608`
```go
func (m Model) View() string {
	if !m.ready {
		return "starting kaioken…"
	}
	if m.mode == modePicker {
		return m.list.View()
	}
	// No persistent top bar — the logo + status panel (repo/model/provider/
	// key) lives once at the top of the scrollback via welcomeBanner, and
	// busy/yolo state shows in the footer hint instead.
	return m.vp.View() + "\n" + m.paletteView() + m.footer()
}
```
The viewport (chat history) is rendered first, followed by the palette view (if active), then the footer (input prompt and status line).

## Key Handling

When the palette is active, specific keys control navigation and execution instead of affecting the composer.

`cli/internal/tui/tui.go:430-569`
```go
func (m Model) onKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	key := msg.String()

	// ... other mode handling ...

	// Command palette: while it is open these keys drive the menu instead of
	// the composer. ctrl+c is deliberately not intercepted, so stopping a task
	// and quitting keep working with the menu up.
	if m.pal.active {
		switch key {
		case "up", "ctrl+p":
			m.pal.move(-1)
			return m, nil
		case "down", "ctrl+n":
			m.pal.move(1)
			return m, nil
		case "tab":
			m.completeSelected()
			return m, nil
		case "enter":
			if c, ok := m.pal.current(); ok {
				m.input.Reset()
				m.dismissPalette()
				m.syncLayout()
				return m.dispatch("/" + c.name)
			}
		case "esc":
			m.dismissPalette()
			m.syncLayout()
			return m, nil
		}
	}
	// ... other key handling ...
}
```
- **Up/Ctrl+P**: Move selection up by one.
- **Down/Ctrl+N**: Move selection down by one.
- **Tab**: Complete the selected command via `completeSelected`.
- **Enter**: Dispatch the selected command (after resetting input and dismissing palette).
- **Esc**: Dismiss the palette without completing.

Outside the palette, Enter triggers command dispatch if the input starts with `/`:
`cli/internal/tui/tui.go:848-878`
```go
func (m Model) onEnter() (tea.Model, tea.Cmd) {
	// ... pendingKey handling ...
	val := m.input.Value()
	m.input.Reset()
	m.refreshPalette()
	m.syncLayout()
	trimmed := strings.TrimSpace(val)
	if trimmed == "" {
		return m, nil
	}
	if strings.HasPrefix(trimmed, "/") {
		return m.dispatch(val)
	}
	return m.startChat(val)
}
```
After clearing the input and refreshing the palette, if the trimmed input starts with `/`, it is dispatched as a command.

## Rendering and Styling

The palette's visual appearance is defined by lipgloss styles and custom rendering logic.

### Styles

`cli/internal/tui/palette.go:18-28`
```go
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
```
- Command names: Color 117 (light yellow-green).
- Command arguments: Color 244 (dim gray).
- Selected row background: Color 236 (dark gray).
- Selected command name: Color 214 (orange) bold on selected background.
- Selected arguments: Color 246 (light gray) on selected background.
- Selected description: Color 252 (pale gray) on selected background.
- Selection indicator bar: Color 208 (red-orange) on selected background.

### Rendering

`cli/internal/tui/palette.go:139-192`
```go
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
```
- Calculates visible item slice based on `offset` and `maxPaletteRows`.
- Determines column width for aligning command+args text.
- For each visible item:
  - **Unselected**: Renders command name (paletteNameStyle), arguments (paletteArgsStyle) if present, padding, and command summary (hintStyle).
  - **Selected**: Renders a vertical bar (paletteBarStyle), command name (paletteSelStyle), arguments (paletteSelArgs) if present, padding (paletteRowStyle), and summary (paletteSelDesc). The entire row is forced to viewport width via `paletteRowStyle.Width(m.width)`.
- Appends navigation hint showing current/total items if scrolling is needed, followed by key bindings.
- Uses `clip` to truncate lines to viewport width.

`cli/internal/tui/tui.go:194-204`
```go
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
```
Converts integers to strings for the pagination hint (e.g., "3/12").

## Command Execution Flow

The flow from keystroke to command execution involves multiple TUI methods:

1. **Activation**: User types `/` → `onKey` updates composer → `refreshPalette` activates menu with filtered commands.
2. **Navigation**: Arrow keys → `pal.move` adjusts selection and viewport.
3. **Completion**: Tab → `completeSelected` inserts command into composer and dismisses palette.
4. **Execution**: Enter (with palette active) → retrieves current command → dispatches `"/" + command.name`.
   - Enter (without palette) → if input starts with `/` → dispatches entire input.
5. **Dismissal**: Esc → `dismissPalette` hides menu and prevents reactivation on unchanged input.

`cli/internal/tui/tui.go:848-878` (onEnter) and `cli/internal/tui/tui.go:430-569` (onKey) handle the final dispatch:
```go
return m.dispatch(val)
```
The `dispatch` method (not detailed here, but referenced in the TUI architecture) parses the command and arguments, then invokes the corresponding functionality (e.g., `/wiki`, `/scan`).

## Referenced Files
- cli/internal/tui/palette.go
- cli/internal/tui/tui.go

<!-- kaioken:files internal/tui/palette.go,internal/tui/tui.go -->
