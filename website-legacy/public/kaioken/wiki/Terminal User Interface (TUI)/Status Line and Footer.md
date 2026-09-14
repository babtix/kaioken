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

These styles ensure consistent visual language across the TUI while maintaining readability in various terminal color schemes.

## Referenced Files

- internal/tui/tui.go (entire file)

<!-- kaioken:files internal/tui/tui.go -->
