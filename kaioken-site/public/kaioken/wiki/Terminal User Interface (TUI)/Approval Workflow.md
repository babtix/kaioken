# Approval Workflow

Detail how the TUI presents and manages user approval requests for tool executions (e.g., file edits) before they are sent to the LLM.

## Table of Contents
- [Overview of the Approval Process](#overview-of-the-approval-process)
- [Presentation of the Approval Prompt](#presentation-of-the-approval-prompt)
- [Handling User Responses](#handling-user-responses)
- [Integration with the Agent](#integration-with-the-agent)
- [Edge Cases and Cancellation](#edge-cases-and-cancellation)
- [Referenced Files](#referenced-files)

## Overview of the Approval Process

When the agent attempts to execute a state-changing tool (such as `edit_file` or `write_file`), it must first obtain user approval. The TUI manages this interaction by:

1. Displaying a modal approval prompt showing the proposed changes as a diff
2. Capturing the user's yes/no response
3. Communicating the decision back to the agent via a channel
4. Allowing cancellation of the approval request via Ctrl+C or Esc

The approval flow is asynchronous: the agent blocks waiting for the TUI's response while the TUI continues to process other events (like streaming LLM responses) until the user responds.

## Presentation of the Approval Prompt

When the agent requests approval, the TUI receives an `approvalReqMsg` containing an `agent.ApprovalRequest`. The `showApproval` method formats this request into a visual prompt:

```
internal/tui/tui.go:801-837
```

```go
func (m *Model) showApproval(req agent.ApprovalRequest) {
	m.approval = req
	m.pendingApproval = true

	body := strings.Split(strings.TrimRight(req.Preview, "\n"), "\n")
	adds, dels := 0, 0
	for _, l := range body {
		switch {
		case strings.HasPrefix(l, "+"):
			adds++
		case strings.HasPrefix(l, "-"):
			dels++
		}
	}

	m.appendLine("")
	header := approvalStyle.Render("● "+req.Action) + "  " + userStyle.Render(req.Target)
	if adds+dels > 0 {
		header += "  " + diffAddStyle.Render(fmt.Sprintf("+%d", adds)) +
			" " + diffDelStyle.Render(fmt.Sprintf("-%d", dels))
	}
	m.appendLine(header)

	// A gutter down the left edge groups the diff into one visual block, so a
	// long proposal cannot be mistaken for ordinary scrollback.
	bar := gutterStyle.Render("│ ")
	for _, l := range body {
		switch {
		case strings.HasPrefix(l, "+"):
			m.appendLine(bar + diffAddStyle.Render(l))
		case strings.HasPrefix(l, "-"):
			m.appendLine(bar + diffDelStyle.Render(l))
		default:
			m.appendLine(bar + dimStyle.Render(l))
		}
	}
}
```

The prompt includes:
- A header showing the action (e.g., "edit_file") and target (e.g., "src/main.go")
- Counts of added and removed lines (if any)
- The diff preview with visual styling:
  - Green background for additions (`diffAddStyle`)
  - Red background for deletions (`diffDelStyle`)
  - A blue gutter bar (`gutterStyle`) connecting all diff lines into a single visual block
  - Unchanged lines shown in dim text

This presentation ensures the proposed changes are clearly visible and distinct from regular chat output.

## Handling User Responses

While `pendingApproval` is true, the TUI's `onKey` method exclusively handles approval-related keys:

```
internal/tui/tui.go:474-490
```

```go
// Approval prompt.
if m.pendingApproval {
	switch key {
	case "y", "Y", "enter":
		m.approvals <- true
		m.pendingApproval = false
		m.appendLine(okStyle.Render("  approved"))
	case "n", "N", "esc":
		m.approvals <- false
		m.pendingApproval = false
		m.appendLine(warnStyle.Render("  declined"))
	case "ctrl+c":
		m.stopCurrent()
	}
	return m, nil
}
```

User interactions:
- **Y/y or Enter**: Sends `true` on the `approvals` channel, records approval in the chat log
- **N/n or Esc**: Sends `false` on the `approvals` channel, records declination in the chat log
- **Ctrl+C**: Triggers `stopCurrent` to cancel the ongoing operation (see [Edge Cases](#edge-cases-and-cancellation))

The TUI appends an inline confirmation message (" approved" or " declined") using `okStyle` or `warnStyle` to maintain visual consistency with other system messages.

## Integration with the Agent

The agent interacts with the TUI's approval system through the `uiAdapter.Approve` method:

```
internal/tui/tui.go:2239-2247
```

```go
func (u uiAdapter) Approve(req agent.ApprovalRequest) bool {
	u.events <- approvalReqMsg{req}
	select {
	case ok := <-u.approvals:
		return ok
	case <-u.ctx.Done():
		return false
	}
}
```

This method:
1. Sends the approval request to the TUI via the `events` channel
2. Waits for a response on the `approvals` channel (or context cancellation)
3. Returns the boolean decision to the agent

The TUI's `Update` method processes `approvalReqMsg` by calling `showApproval`:

```
internal/tui/tui.go:374-376
```

```go
case approvalReqMsg:
	m.showApproval(msg.req)
	return m, listen(m.events)
```

This creates a synchronous handshake: the agent blocks in `Approve` until the TUI sends a response on `approvals`, while the TUI remains responsive to other events (like window resizes or spinner ticks) through its event loop.

## Edge Cases and Cancellation

The TUI provides several ways to exit the approval prompt without making a decision:

### Cancellation via Ctrl+C
When the user presses Ctrl+C during an approval prompt, `stopCurrent` is invoked:

```
internal/tui/tui.go:571-588
```

```go
func (m *Model) stopCurrent() {
	wasPending := m.pendingApproval
	m.pendingApproval = false
	if m.cancel != nil {
		m.cancel()
	}
	// Keep whatever the model had already streamed — the user watched it
	// arrive, so discarding it on stop would be surprising.
	m.flushLive("… stopped mid-reply")
	switch {
	case wasPending:
		m.appendLine(warnStyle.Render("■ stopped (pending approval cancelled)"))
	case m.busy:
		m.appendLine(warnStyle.Render("■ stopping…"))
	default:
		m.appendLine(dimStyle.Render("nothing running"))
	}
}
```

This:
1. Sets `pendingApproval = false` to exit the approval state
2. Cancels the underlying agent operation via `m.cancel`
3. Flushes any streamed assistant text to the scrollback
4. Appropriately logs the cancellation based on context

### Context Cancellation
If the agent's context is cancelled (e.g., due to a timeout or another operation), the `uiAdapter.Approve` method returns `false` via the `select` case on `u.ctx.Done()`.

### Concurrent Operations
The TUI prevents nested approval prompts by design: `pendingApproval` acts as a mutex. While an approval prompt is active, new `approvalReqMsg` messages are still queued in the `events` channel but will not be processed until the current prompt resolves (since `onKey` ignores non-approval keys when `pendingApproval` is true).

## Referenced Files
- internal/tui/tui.go

<!-- kaioken:files internal/tui/tui.go -->
