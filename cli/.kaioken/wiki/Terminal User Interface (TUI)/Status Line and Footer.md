We are given a document about the Status Line and Footer of the TUI, and a git diff that shows the entire file `cli/internal/tui/tui.go` was added (since it was a new file in the diff). However, note that the current document we are updating is about the Status Line and Footer, and the git diff shows the entire TUI file.

But note: the current document we are updating is titled "Status Line and Footer", and it is part of the wiki. The git diff shows that the file `cli/internal/tui/tui.go` was added (with a lot of code). However, the current document we are updating is not the entire TUI, but only a section about the status line and footer.

Looking at the current document (the one we are updating) we see that it describes the status line and footer. The git diff shows the entire TUI file, which includes the status line and footer code.

We must update the current document (which is about the status line and footer) to reflect any changes in the TUI file that affect the status line and footer.

However, note that the git diff is the entire file being added. This means that the current document (which was written based on an earlier version) might be outdated because the TUI file is new.

But wait, the entire TUI file, but only a section about the status line and footer.

But note: the current document we are updating is from the wiki, and it is about the status line and footer. The git diff shows the entire TUI file (which is new). Therefore, we must update the current document to match the status line and footer as implemented in the new TUI file.

However, the current document we are updating is not the entire TUI file, but only a section. We are to update that section to reflect the current state of the status line and footer in the TUI.

Let's compare the current document (which we are updating) with the status line and footer code in the new TUI file.

Current document (as given) has:

## Overview
... [description] ...

## Components of the Footer
... [code snippet of footer()] ...

### Pending Approval State
... [description] ...

### Pending Key Input State
... [description] ...

### Normal State
... [description] ...

## The Status Line
... [code snippet of statusLine()] ...

### Left Section: Hints and Busy Indicator
... [description] ...

### Right Section: Session Status
... [code snippet of sessionStatus()] ...

## Helper Functions
... [shortModel, humanTokens, elapsed] ...

## Styles
... [table of styles] ...

## Referenced Files
- internal/tui/tui.go (entire file)

Now, let's look at the new TUI file (from the git diff) for the status line and footer:

We see the following functions:

1. `footer()` (lines 612-640 in the provided structure, but note the line numbers in the actual file might be different because the diff is the entire file)

In the provided source of the TUI file, we have:

```go
func (m Model) footer() string {
	if m.pendingApproval {
		// The target is repeated here because a long diff pushes the header
		// off the top of the viewport, and this is the moment it matters most.
		q := approvalStyle.Render("apply "+m.approval.Action) + " " +
			userStyle.Render(clip(m.approval.Target, 44)) + "  " +
			keycapStyle.Render(" y ") + hintStyle.Render(" yes  ") +
			keycapStyle.Render(" n ") + hintStyle.Render(" no")
		return clip(q, m.width) + "\n" +
			clip(hintStyle.Render("esc/ctrl+c to stop this run"), m.width)
	}
	if m.pendingKey {
		return clip(promptStyle.Render("› ")+m.keyInput.View(), m.width) + "\n" +
			clip(hintStyle.Render("paste the key and press enter — input is hidden"), m.width)
	}
	// The prompt glyph carries the current mode, so the state is visible right
	// where the eye already is instead of only at the far end of the bar.
	switch {
	case m.busy:
		m.input.FocusedStyle.Prompt = busyPromptStyle
	case m.autoApprove:
		m.input.FocusedStyle.Prompt = yoloPromptStyle
	default:
		m.input.FocusedStyle.Prompt = promptStyle
	}
	// The textarea renders its own prompt on each row, so it is not clipped:
	// clipping would cut multi-line content.
	return m.input.View() + "\n" + m.statusLine()
}
```

This matches exactly the code snippet in the current document.

2. `statusLine()` (lines 645-663):

```go
func (m Model) statusLine() string {
	var left string
	switch {
	case m.busy:
		left = m.spin.View() + " " + hintStyle.Render(m.busyText) +
			hintStyle.Render(" · ") + elapsedStyle.Render(elapsed(time.Since(m.busyStart))) +
			hintStyle.Render(" · esc to stop")
	default:
		left = hintStyle.Render("/ commands · alt+enter newline · ctrl+d quit")
	}

	right := m.sessionStatus()
	gap := m.width - lipgloss.Width(left) - lipgloss.Width(right)
	if right == "" || gap < 2 {
		// Too narrow to carry both: the keys matter more than the readout.
		return clip(left, m.width)
	}
	return left + strings.Repeat(" ", gap) + right
}
```

This also matches the current document.

3. `sessionStatus()` (lines 668-687):

```go
func (m Model) sessionStatus() string {
	var parts []string
	if m.serveURL != "" {
		parts = append(parts, "serving")
	}
	if m.cfg != nil && m.cfg.Model != "" {
		parts = append(parts, shortModel(m.cfg.Model))
	}
	if m.client != nil {
		if _, pt, ct := m.client.Usage(); pt+ct > 0 {
			parts = append(parts, humanTokens(pt+ct)+" tok")
		}
	}
	out := hintStyle.Render(strings.Join(parts, " · "))
	if m.autoApprove {
		// yolo means edits land without asking — it should never be subtle.
		out = warnStyle.Render("yolo") + hintStyle.Render(" · ") + out
	}
	return out
}
```

This matches the current document.

4. Helper functions: `shortModel`, `humanTokens`, `elapsed` are present and match.

5. Styles: The current document lists a set of styles. In the TUI file, we see the same styles defined (with the same ANSI colors) at the top of the file.

However, note that the current document's style table includes:

| Style Variable      | Purpose                                                                 | ANSI Color |
|---------------------|-------------------------------------------------------------------------|------------|
| `elapsedStyle`      | Colors elapsed time during busy operations                              | 246 (gray) |
| `hintStyle`         | Default color for hints and secondary text                              | 240 (dim gray) |
| `approvalStyle`     | Highlights approval prompts and action verbs                            | 214 (orange) bold |
| `userStyle`         | Styles user-generated content (paths, model names)                      | 117 (green) bold |
| `keycapStyle`       | Renders keyboard shortcut indicators                                    | 232 on 214 (black on orange) bold |
| `dimStyle`          | De-emphasizes secondary information                                     | 244 (dim gray) |
| `busyPromptStyle`   | Changes composer prompt during busy states                              | 240 (dim gray) bold |
| `yoloPromptStyle`   | Changes composer prompt in auto-approve mode                            | 214 (orange) bold |
| `promptStyle`       | Default composer prompt color                                           | 63 (purple) bold |
| `okStyle`           | Indicates successful operations                                         | 42 (green) |
| `errStyle`          | Indicates errors                                                        | 203 (red) |
| `warnStyle`         | Indicates warnings                                                      | 214 (orange) |
| `toolStyle`         | Styles tool invocation lines                                            | 180 (blue) |
| `toolResStyle`      | Styles tool result lines                                                | 108 (light green) |
| `diffAddStyle`      | Styles added lines in diffs                                             | 42 (green) |
| `diffDelStyle`      | Styles deleted lines in diffs                                           | 203 (red) |
| `spinnerStyle`      | Colors the activity spinner                                             | 63 (purple) |
| `keyOKStyle`        | Indicates valid keys in pickers                                         | 42 (green) |
| `keyMissingStyle`   | Indicates missing keys in pickers                                       | 203 (red) |
| `gutterStyle`       | Visual grouping bar for diff previews                                   | 214 (orange) |

In the TUI file, we see:

```go
var (
	promptStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("63")).Bold(true)
	hintStyle       = lipgloss.NewStyle().Foreground(lipgloss.Color("240"))
	okStyle         = lipgloss.NewStyle().Foreground(lipgloss.Color("42"))
	errStyle        = lipgloss.NewStyle().Foreground(lipgloss.Color("203"))
	warnStyle       = lipgloss.NewStyle().Foreground(lipgloss.Color("214"))
	dimStyle        = lipgloss.NewStyle().Foreground(lipgloss.Color("244"))
	userStyle       = lipgloss.NewStyle().Foreground(lipgloss.Color("117")).Bold(true)
	assistantStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("252"))
	toolStyle       = lipgloss.NewStyle().Foreground(lipgloss.Color("180"))
	toolResStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("108"))
	diffAddStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("42"))
	diffDelStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("203"))
	approvalStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("214")).Bold(true)
	spinnerStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("63"))
	keyOKStyle      = lipgloss.NewStyle().Foreground(lipgloss.Color("42"))
	keyMissingStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("203"))

	// The composer prompt doubles as a state light: purple idle, orange while
	// edits auto-apply, dim while a task is running and input is queued.
	yoloPromptStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("214")).Bold(true)
	busyPromptStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("240")).Bold(true)

	// A proposed edit gets a colored gutter down its whole diff so it reads as
	// one block rather than loose lines in the scrollback.
	gutterStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("214"))
	keycapStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("232")).Background(lipgloss.Color("214")).Bold(true)
	elapsedStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("246"))
)
```

This matches the style table in the current document, except that the current document does not list `assistantStyle` and `toolResStyle` in the table? Actually, the current document's table does include:

- `toolStyle` (180 blue)
- `toolResStyle` (108 light green)
- `diffAddStyle` (42 green)
- `diffDelStyle` (203 red)
- `spinnerStyle` (63 purple)
- `keyOKStyle` (42 green)
- `keyMissingStyle` (203 red)
- `gutterStyle` (214 orange)

And it does not list `assistantStyle` (252) in the table. However, the current document's table does not claim to be exhaustive? It says "Visual presentation relies on predefined lipgloss styles:" and then lists the ones it does. The current document does not mention `assistantStyle` in the table, but it is defined in the code.

But note: the current document we are updating is only about the status line and footer. The `assistantStyle` is used in the transcript (for assistant messages) and not in the status line or footer. Therefore, it is not necessary to include it in the status line and footer documentation.

Similarly, the current document's table does not include `assistantStyle` and that is acceptable because it is not used in the status line or footer.

However, we must check if any of the styles used in the status line and footer have changed.

Looking at the status line and footer code, we see the following styles used:

- In `footer()`:
  - `approvalStyle`
  - `userStyle`
  - `keycapStyle`
  - `hintStyle`
  - `promptStyle` (via `m.input.FocusedStyle.Prompt` which is set to one of: `busyPromptStyle`, `yoloPromptStyle`, `promptStyle`)
  - In the pendingKey branch: `promptStyle` and `hintStyle`

- In `statusLine()`:
  - `hintStyle` (for left and right parts)
  - `elapsedStyle` (for elapsed time)
  - `m.spin.View()` (which uses `spinnerStyle`)

- In `sessionStatus()`:
  - `hintStyle` (for the joined parts)
  - `warnStyle` (for the "yolo" prefix)

All of these styles are present in the current document's table and match the definitions.

Therefore, the current document's description of the status line and footer is still accurate.

But note: the current document references the file as `internal/tui/tui.go` (entire file). However, the git diff shows that the file is now at `cli/internal/tui/tui.go`. The current document's referenced files list should be updated to reflect the new location.

In the current document, under "Referenced Files", we have:
- internal/tui/tui.go (entire file)

But the actual file is now in `cli/internal/tui/tui.go`. We must update the path.

Also note: the global wiki context says that we are in the chapter "Terminal User Interface (TUI) / Status Line and Footer". The file has moved from `internal/tui/tui.go` to `cli/internal/tui/tui.go`.

Therefore, we must update the referenced file to `cli/internal/tui/tui.go`.

Additionally, we should check if there are any other changes in the TUI file that affect the status line and footer. We have already compared the functions and they are the same.

However, note that the current document also includes a code snippet for the `footer()` method and the `statusLine()` method. We have verified that they are the same.

But wait: the current document's code snippet for `footer()` has:

```go
func (m Model) footer() string {
	if m.pendingApproval {
		// The target is repeated here because a long diff pushes the header
		// off the top of the viewport, and this is the moment it matters most.
		q := approvalStyle.Render("apply "+m.approval.Action) + " " +
			userStyle.Render(clip(m.approval.Target, 44)) + "  " +
			keycapStyle.Render(" y ") + hintStyle.Render(" yes  ") +
			keycapStyle.Render(" n ") + hintStyle.Render(" no")
		return clip(q, m.width) + "\n" +
			clip(hintStyle.Render("esc/ctrl+c to stop this run"), m.width)
	}
	if m.pendingKey {
		return clip(promptStyle.Render("› ")+m.keyInput.View(), m.width) + "\n" +
			clip(hintStyle.Render("paste the key and press enter — input is hidden"), m.width)
	}
	// The prompt glyph carries the current mode, so the state is visible right
	// where the eye already is instead of only at the far end of the bar.
	switch {
	case m.busy:
		m.input.FocusedStyle.Prompt = busyPromptStyle
	case m.autoApprove:
		m.input.FocusedStyle.Prompt = yoloPromptStyle
	default:
		m.input.FocusedStyle.Prompt = promptStyle
	}
	// The textarea renders its own prompt on each row, so it is not clipped:
	// clipping would cut multi-line content.
	return m.input.View() + "\n" + m.statusLine()
}
```

And the TUI file has the same.

Similarly for `statusLine()` and `sessionStatus()`.

Therefore, the only change we need to make in the current document is to update the referenced file path.

But note: the current document also has a section "Helper Functions" that lists `shortModel`, `humanTokens`, and `elapsed`. These are still present and unchanged.

However, we must also check if the constants and helper functions are still present and unchanged.

In the TUI file, we have:

```go
// modelLabelWidth caps the model name so a verbose id cannot crowd out the
// key hints on the other end of the bar.
const modelLabelWidth = 22

// shortModel drops the vendor prefix — the part after the slash is what
// distinguishes one model from another at a glance — and trims the middle of
// anything still too long, keeping the tail where :free and version suffixes
// live.
func shortModel(id string) string {
	if i := strings.LastIndex(id, "/"); i >= 0 && i+1 < len(id) {
		id = id[i+1:]
	}
	r := []rune(id)
	if len(r) <= modelLabelWidth {
		return id
	}
	head := modelLabelWidth - 8 // leaves room for "…" plus a 7-rune tail
	return string(r[:head]) + "…" + string(r[len(r)-7:])
}

// humanTokens keeps the counter to four characters so the bar does not jitter.
func humanTokens(n int) string {
	switch {
	case n >= 1_000_000:
		return fmt.Sprintf("%.1fM", float64(n)/1e6)
	case n >= 1000:
		return fmt.Sprintf("%.1fk", float64(n)/1000)
	default:
		return fmt.Sprintf("%d", n)
	}
}

// elapsed formats a running duration compactly: 9s, 1m04s, 1h02m.
func elapsed(d time.Duration) string {
	s := int(d.Seconds())
	switch {
	case s < 60:
		return fmt.Sprintf("%ds", s)
	case s < 3600:
		return fmt.Sprintf("%dm%02ds", s/60, s%60)
	default:
		return fmt.Sprintf("%dh%02dm", s/3600, (s%3600)/60)
	}
}
```

This matches the current document.

Therefore, the only change is the file path in the referenced files.

Let's update the current document accordingly.

We change:
- internal/tui/tui.go
to
- cli/internal/tui/tui.go

But note: the current document says "Referenced Files" and then a list. We have only one file.

We must output the entire updated markdown document.

Let's write the updated document:

# Status Line and Footer

## Table of Contents
- [Overview](#overview)
- [Components of the Footer](#components-of-the-footer)
  - [Pending Approval State](#pending-approval-state)
  - [Pending Key Input State](#pending-key-input-state)
  - [Normal State](#normal-state)
- [The Status Line](#the-status-line)
  - [Left Section: Hints and Busy Indicator](#left-section-hints-and-busy-indicator)
  - [Right Section: Session Status](#right-section-session-status)
- [Helper Functions](#helper-functions)
  - [Formatting Model Names](#formatting-model-names)
  - [Formatting Token Counts](#formatting-token-counts)
  - [Formatting Elapsed Time](#formatting-elapsed-time)
- [Styles](#styles)
- [Referenced Files](#referenced-files)

## Overview

The status line appears at the very bottom of the TUI, just below the composer input area. It provides real-time contextual information about the current session, including:
- Active LLM model and provider
- Token usage (prompt + completion tokens)
- Elapsed time for ongoing operations
- Session state (serving wiki, auto-approve mode)
- Interactive hints for keyboard shortcuts

The footer dynamically adapts to three distinct states: pending tool approval, pending API key input, and normal operation. In all states, it maintains a fixed height of one or two lines to prevent layout shifts during interaction.

## Components of the Footer

The `footer()` method (internal/tui/tui.go:605-633) constructs the footer string based on the current model state:

```go
func (m Model) footer() string {
	if m.pendingApproval {
		// The target is repeated here because a long diff pushes the header
		// off the top of the viewport, and this is the moment it matters most.
		q := approvalStyle.Render("apply "+m.approval.Action) + " " +
			userStyle.Render(clip(m.approval.Target, 44)) + "  " +
			keycapStyle.Render(" y ") + hintStyle.Render(" yes  ") +
			keycapStyle.Render(" n ") + hintStyle.Render(" no")
		return clip(q, m.width) + "\n" +
			clip(hintStyle.Render("esc/ctrl+c to stop this run"), m.width)
	}
	if m.pendingKey {
		return clip(promptStyle.Render("› ")+m.keyInput.View(), m.width) + "\n" +
			clip(hintStyle.Render("paste the key and press enter — input is hidden"), m.width)
	}
	// The prompt glyph carries the current mode, so the state is visible right
	// where the eye already is instead of only at the far end of the bar.
	switch {
	case m.busy:
		m.input.FocusedStyle.Prompt = busyPromptStyle
	case m.autoApprove:
		m.input.FocusedStyle.Prompt = yoloPromptStyle
	default:
		m.input.FocusedStyle.Prompt = promptStyle
	}
	// The textarea renders its own prompt on each row, so it is not clipped:
	// clipping would cut multi-line content.
	return m.input.View() + "\n" + m.statusLine()
}
```

### Pending Approval State

When the agent requests user approval for a tool action (e.g., file edit), the footer displays:
- Action description and target file path (truncated to 44 characters)
- Approval controls: `y` (yes) and `n` (no) with hints
- A secondary line offering to cancel the operation with `esc` or `ctrl+c`

This state takes priority over all others, ensuring approval prompts remain visible even during long-running operations.

### Pending Key Input State

When the user invokes `/key` to set an API key, the footer shows:
- A hidden prompt (`› `) with masked input
- A hint explaining that input is hidden and requires Enter to submit

This state temporarily replaces the normal composer interface to securely capture sensitive credentials.

### Normal State

In normal operation, the footer consists of two parts:
1. The multi-line composer input area (handled by `m.input.View()`)
2. The single-line status line (returned by `m.statusLine()`)

The composer grows vertically as the user types (up to `maxInputRows = 8` lines) before scrolling internally, while the status line remains fixed at one row.

## The Status Line

The `statusLine()` method (internal/tui/tui.go:638-656) constructs the informational bar that appears beneath the composer:

```go
func (m Model) statusLine() string {
	var left string
	switch {
	case m.busy:
		left = m.spin.View() + " " + hintStyle.Render(m.busyText) +
			hintStyle.Render(" · ") + elapsedStyle.Render(elapsed(time.Since(m.busyStart))) +
			hintStyle.Render(" · esc to stop")
	default:
		left = hintStyle.Render("/ commands · alt+enter newline · ctrl+d quit")
	}

	right := m.sessionStatus()
	gap := m.width - lipgloss.Width(left) - lipgloss.Width(right)
	if right == "" || gap < 2 {
		// Too narrow to carry both: the keys matter more than the readout.
		return clip(left, m.width)
	}
	return left + strings.Repeat(" ", gap) + right
}
```

### Left Section: Hints and Busy Indicator

The left section displays contextual hints and activity indicators:

**During busy operations** (e.g., waiting for LLM response, scanning files):
- A spinner (`m.spin.View()`)
- Operation description (`m.busyText`)
- Elapsed time since operation began (formatted by `elapsed()`)
- Hint to cancel with `esc`

**During idle state**:
- Hints for accessing the command palette (`/ commands`)
- Hint for inserting newlines (`alt+enter`)
- Hint to quit the application (`ctrl+d quit`)

### Right Section: Session Status

The `sessionStatus()` method (internal/tui/tui.go:661-680) assembles the right-aligned session information:

```go
func (m Model) sessionStatus() string {
	var parts []string
	if m.serveURL != "" {
		parts = append(parts, "serving")
	}
	if m.cfg != nil && m.cfg.Model != "" {
		parts = append(parts, shortModel(m.cfg.Model))
	}
	if m.client != nil {
		if _, pt, ct := m.client.Usage(); pt+ct > 0 {
			parts = append(parts, humanTokens(pt+ct)+" tok")
		}
	}
	out := hintStyle.Render(strings.Join(parts, " · "))
	if m.autoApprove {
		// yolo means edits land without asking — it should never be subtle.
		out = warnStyle.Render("yolo") + hintStyle.Render(" · ") + out
	}
	return out
}
```

This section dynamically includes:
- `serving` indicator when the wiki browser is active
- The current model name (processed by `shortModel()`)
- Total token usage (prompt + completion) formatted by `humanTokens()`
- A `yolo` prefix in warning style when auto-approve mode is enabled

All elements are separated by ` · ` and rendered in the hint style (dim foreground color).

## Helper Functions

### Formatting Model Names

The `shortModel()` function (internal/tui/tui.go:690-700) processes model identifiers for display:

```go
func shortModel(id string) string {
	if i := strings.LastIndex(id, "/"); i >= 0 && i+1 < len(id) {
		id = id[i+1:]
	}
	r := []rune(id)
	if len(r) <= modelLabelWidth {
		return id
	}
	head := modelLabelWidth - 8 // leaves room for "…" plus a 7-rune tail
	return string(r[:head]) + "…" + string(r[len(r)-7:])
}
```

It:
1. Strips vendor prefixes (everything before the last `/`)
2. Truncates names exceeding `modelLabelWidth` (22 characters) by preserving the first 14 characters, adding an ellipsis, and keeping the last 7 characters (where version suffixes like `:free` typically appear)

### Formatting Token Counts

The `humanTokens()` function (internal/tui/tui.go:703-712) formats token counts for compact display:

```go
func humanTokens(n int) string {
	switch {
	case n >= 1_000_000:
		return fmt.Sprintf("%.1fM", float64(n)/1e6)
	case n >= 1000:
		return fmt.Sprintf("%.1fk", float64(n)/1000)
	default:
		return fmt.Sprintf("%d", n)
	}
}
```

It scales large numbers:
- ≥1,000,000: shows as `X.XM` (e.g., `1.2M`)
- ≥1,000: shows as `X.Xk` (e.g., `1.5k`)
- Otherwise: raw integer

### Formatting Elapsed Time

The `elapsed()` function (internal/tui/tui.go:715-725) formats durations for the busy indicator:

```go
func elapsed(d time.Duration) string {
	s := int(d.Seconds())
	switch {
	case s < 60:
		return fmt.Sprintf("%ds", s)
	case s < 3600:
		return fmt.Sprintf("%dm%02ds", s/60, s%60)
	default:
		return fmt.Sprintf("%dh%02dm", s/3600, (s%3600)/60)
	}
}
```

It produces compact representations:
- Under 1 minute: `9s`
- Under 1 hour: `XmYYs` (zero-padded seconds)
- 1 hour or more: `XhYYm` (zero-padded minutes)

## Styles

Visual presentation relies on predefined lipgloss styles:

| Style Variable      | Purpose                                                                 | ANSI Color |
|---------------------|-------------------------------------------------------------------------|------------|
| `elapsedStyle`      | Colors elapsed time during busy operations                              | 246 (gray) |
| `hintStyle`         | Default color for hints and secondary text                              | 240 (dim gray) |
| `approvalStyle`     | Highlights approval prompts and action verbs                            | 214 (orange) bold |
| `userStyle`         | Styles user-generated content (paths, model names)                      | 117 (green) bold |
| `keycapStyle`       | Renders keyboard shortcut indicators                                    | 232 on 214 (black on orange) bold |
| `dimStyle`          | De-emphasizes secondary information                                     | 244 (dim gray) |
| `busyPromptStyle`   | Changes composer prompt during busy states                              | 240 (dim gray) bold |
| `yoloPromptStyle`   | Changes composer prompt in auto-approve mode                            | 214 (orange) bold |
| `promptStyle       | Default composer prompt color                                           | 63 (purple) bold |
| `okStyle`           | Indicates successful operations                                         | 42 (green) |
| `errStyle`          | Indicates errors                                                        | 203 (red) |
| `warnStyle`         | Indicates warnings                                                      | 214 (orange) |
| `toolStyle`         | Styles tool invocation lines                                            | 180 (blue) |
| `toolResStyle`      | Styles tool result lines                                                | 108 (light green) |
| `diffAddStyle`      | Styles added lines in diffs                                             | 42 (green) |
| `diffDelStyle`      | Styles deleted lines in diffs                                           | 203 (red) |
| `spinnerStyle`      | Colors the activity spinner                                             | 63 (purple) |
| `keyOKStyle`        | Indicates valid keys in pickers                                         | 42 (green) |
| `keyMissingStyle`   | Indicates missing keys in pickers                                       | 203 (red) |
| `gutterStyle`       | Visual grouping bar for diff previews                                   | 214 (orange) |

These styles ensure consistent visual language across the TUI while maintaining readability in various terminal color schemes.

## Referenced Files

- cli/internal/tui/tui.go (entire file)



Note: We changed the referenced file from `internal/tui/tui.go` to `cli/internal/tui/tui.go`.

However, note that the current document had a code snippet for the `footer()` method that referenced line numbers (605-633). We should update those line numbers to match the new file? But note: the line numbers in the current document are from the old file. Since we are updating the document to reflect the new file, we should either remove the line numbers or update them.

But the instructions say: "PRESERVE everything still accurate". The line numbers in the old document are not accurate anymore because the file has moved and the line numbers have changed. However, the current document we are updating is the one we are given, and it has line numbers. We are to update only what the diff invalidates.

The diff invalidates the file path, but the line numbers in the code snippets are still accurate for the new file? Actually, the code snippets are the same, but the line numbers in the new file are different.

We have two options:
1. Remove the line numbers from the code snippet references (since they are likely to change and we are not to invent line numbers).
2. Update the line numbers to match the new file.

But note: we are not given the exact line numbers in the new file. We only have the structure with line anchors from the current contents of the changed files. However, the structure we were given for the TUI file does not have the exact line numbers for the functions we are interested in.

Looking at the provided structure for the TUI file, we see:

  L612-640  func (m Model) footer() string
  L645-663  func (m Model) statusLine() string
  L668-687  func (m Model) sessionStatus() string

But note: the structure we were given is from the current contents of the changed files (which is the new file). So we can use those line numbers.

Therefore, we should update the line numbers in the current document to match the new file.

In the current document, we have:

- For `footer()`: (internal/tui/tui.go:605-633) -> change to (cli/internal/tui/tui.go:612-640)
- For `statusLine()`: (internal/tui/tui.go:638-656) -> change to (cli/internal/tui/tui.go:645-663)
- For `sessionStatus()`: (internal/tui/tui.go:661-680) -> change to (cli/internal/tui/tui.go:668-687)
- For `shortModel()`: (internal/tui/tui.go:690-700) -> change to (cli/internal/tui/tui.go:697-707)
- For `humanTokens()`: (internal/tui/tui.go:703-712) -> change to (cli/internal/tui/tui.go:710-719)
- For `elapsed()`: (internal/tui/tui.go:715-725) -> change to (cli/internal/tui/tui.go:722-732)

But note: the structure we were given for the TUI file has:

  L697-707  func shortModel(id string) string
  L710-719  func humanTokens(n int) string
  L722-732  func elapsed(d time.Duration) string

So we update accordingly.

However, note that the current document's code snippets are exactly the same as in the new file, so we don't need to change the code snippets, only the line number references in the text.

Let's update the current document accordingly.

We'll change:

In the "Components of the Footer" section:
- The `footer()` method reference: change the file path and line numbers to `cli/internal/tui/tui.go:612-640`

In the "The Status Line" section:
- The `statusLine()` method reference: change to `cli/internal/tui/tui.go:645-663`
- The `sessionStatus()` method reference: change to `cli/internal/tui/tui.go:668-687`

In the "Helper Functions" section:
- For `shortModel()`: change to `cli/internal/tui/tui.go:697-707`
- For `humanTokens()`: change to `cli/internal/tui/tui.go:710-719`
- For `elapsed()`: change to `cli/internal/tui/tui.go:722-732`

And in the "Referenced Files" section, change the file to `cli/internal/tui/tui.go`.

Now, note that the current document also has a comment

<!-- kaioken:files internal/tui/tui.go -->
