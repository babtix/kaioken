# TUI Structure and Main Loop

The Terminal User Interface (TUI) in kaioken is built using the Bubble Tea library and serves as the primary interface for user interaction. It handles input, displays output, and orchestrates interactions with the agent, LLM, session, skills, wiki, and other subsystems. This chapter explains the core components of the TUI, focusing on the `Model` struct, initialization, event loop (`Update`), and view rendering (`View`).

## Table of Contents
- [Model Structure](#model-structure)
- [Initialization](#initialization)
- [Event Loop (Update)](#event-loop-update)
- [View Rendering](#view-rendering)
- [Supporting Components](#supporting-components)
- [Data Flow](#data-flow)
- [Referenced Files](#referenced-files)

## Model Structure

The `Model` struct (defined in `internal/tui/tui.go:127-181`) holds the complete state of the TUI application. It manages repository context, configuration, UI components, conversation history, and asynchronous communication channels.

### Key Fields

| Field | Type | Purpose |
|-------|------|---------|
| `repo` | string | Absolute path to the current repository |
| `cfg` | \*config.Config | Repository-specific configuration |
| `global` | \*config.Global | Global configuration (API keys, defaults) |
| `apiKeys` | map[string]string | Session-scoped API keys per provider |
| `client` | \*llm.Client | Active LLM client instance |
| `conversation` | []llm.Message | Chat history (system + user/assistant turns) |
| `autoApprove` | bool | Whether to skip approval prompts for tool use |
| `undoStack` | []agent.UndoEntry | History of file operations for undo |
| `sess` | \*session.Session | Current chat session persistence |
| `vp` | viewport.Model | Viewport for rendering scrollback |
| `input` | textarea.Model | Multi-line input area (composer) |
| `keyInput` | textinput.Model | Hidden field for API key entry |
| `spin` | spinner.Model | Spinner for busy states |
| `list` | list.Model | Picker for models/sessions |
| `events` | chan tea.Msg | Channel for asynchronous messages |
| `approvals` | chan bool | Channel for approval responses |
| `lines` | []string | Scrollback buffer (rendered lines) |
| `committed` string | Cached wrapped render of `lines` |
| `live` string | Currently streaming assistant response |
| `busy` bool | Whether a long-running operation is active |
| `busyText` string | Description of current busy operation |
| `busyStart` time.Time | Start time of busy operation (for elapsed counter) |
| `mode` mode | Current UI mode (`modeChat` or `modePicker`) |
| `pal` palette | Slash-command completion menu state |
| `pendingKey` bool | Whether waiting for API key input |
| `pendingApproval` bool | Whether waiting for tool approval |
| `approval` agent.ApprovalRequest | Current approval request details |
| `cancel` context.CancelFunc | Cancellation function for active operations |
| `serveCancel` context.CancelFunc | Cancellation for wiki server |
| `serveURL` string | URL of running wiki server |
| `configMissing` bool | Whether repo config was missing at startup |
| `suggestedSkills` bool | Whether skill suggestion has been shown |
| `width, height` int | Current terminal dimensions |
| `ready` bool | Whether initial layout has been computed |

### UI Modes

The TUI operates in two primary modes:
- `modeChat`: Normal chat interface where user input goes to the LLM
- `modePicker`: Interactive selection interface (for models or sessions)

Mode switching occurs during model/picker sessions and is reset on ESC or Enter.

## Initialization

TUI initialization occurs in two steps: `Run` starts the Bubble Tea program, and `New` constructs the initial model state.

### Run Function

```go
// Run starts the TUI for a repository.
func Run(repo string) error {
	if abs, err := filepath.Abs(repo); err == nil {
		repo = abs
	}
	p := tea.NewProgram(New(repo), tea.WithAltScreen())
	_, err := p.Run()
	return err
}
```
`internal/tui/tui.go:184-191`

The `Run` function:
1. Converts the repository path to absolute
2. Creates a new Bubble Tea program with the initial model
3. Runs the program with alternative screen enabled
4. Returns any error from program execution

### New Function

```go
// New constructs the initial model.
func New(repo string) Model {
	global := config.LoadGlobal()
	cfg, err := config.Load(repo)
	missing := false
	if err != nil {
		cfg = config.Default()
		missing = true
		// No repo config: fall back to the user's saved defaults.
		if global.DefaultProvider != "" {
			cfg.Provider = global.DefaultProvider
		}
		if global.DefaultModel != "" {
			cfg.Model = global.DefaultModel
		}
	}

	ta := textarea.New()
	ta.Placeholder = defaultPlaceholder
	ta.Prompt = "› "
	ta.CharLimit = 0 // no cap: users paste stack traces and whole files
	ta.ShowLineNumbers = false
	ta.SetHeight(1)
	// Enter sends the message (onKey intercepts it), so newlines go on
	// alt+enter / ctrl+j — shift+enter is indistinguishable from enter in
	// most terminals, so it cannot be relied on.
	ta.KeyMap.InsertNewline = key.NewBinding(
		key.WithKeys("alt+enter", "ctrl+j"),
		key.WithHelp("alt+enter", "newline"),
	)
	ta.FocusedStyle.Prompt = promptStyle
	ta.FocusedStyle.CursorLine = lipgloss.NewStyle()
	ta.Focus()

	ki := textinput.New()
	ki.Prompt = ""
	ki.EchoMode = textinput.EchoPassword
	ki.CharLimit = 400

	sp := spinner.New()
	sp.Spinner = spinner.Dot
	sp.Style = spinnerStyle

	l := list.New(nil, list.NewDefaultDelegate(), 0, 0)
	l.Title = "Select a model — type to filter, enter to choose, esc to cancel"
	l.SetShowStatusBar(true)
	l.SetFilteringEnabled(true)

	m := Model{
		repo:      repo,
		cfg:       cfg,
		global:    global,
		vp:        viewport.New(0, 0),
		input:     ta,
		keyInput:  ki,
		spin:      sp,
		list:      l,
		events:    make(chan tea.Msg, 256),
		approvals: make(chan bool, 1),
	}
	m.resetConversation()
	m.rebuildClient()
	m.configMissing = missing
	return m
}
```
`internal/tui/tui.go:194-257`

The `New` function:
1. Loads global and repository configuration (with fallbacks)
2. Initializes UI components:
   - `textarea` for multi-line input with custom key bindings
   - `textinput` for hidden API key entry
   - `spinner` for busy indicators
   - `list` for model/session pickers
3. Creates the initial `Model` state
4. Resets conversation history and rebuilds the LLM client
5. Tracks if repository configuration was missing

### Conversation Reset

```go
func (m *Model) resetConversation() {
	m.conversation = []llm.Message{{
		Role:    "system",
		Content: agent.SystemPrompt(m.repo, true),
	}}
	m.sess = session.New(m.cfg.Model, m.cfg.Provider)
}
```
`internal/tui/tui.go:259-265`

Initializes conversation with a system prompt and creates a new session.

### Client Initialization

```go
func (m *Model) rebuildClient() string {
	// Key resolution: session override for THIS provider → saved global key →
	// provider env var.
	key := m.apiKeys[m.cfg.Provider]
	if key == "" && m.global != nil {
		key = m.global.Keys[m.cfg.Provider]
	}
	if key == "" {
		if p, ok := llm.Providers[m.cfg.Provider]; ok {
			key = os.Getenv(p.KeyEnv)
		}
	}
	c, err := llm.NewForProvider(m.cfg.Provider, m.cfg.BaseURL, m.cfg.Model, key)
	if err != nil {
		m.client = nil
		return err.Error()
	}
	c.MaxTokens = m.cfg.MaxTokens
	m.client = c
	return ""
}
```
`internal/tui/tui.go:2117-2140`

Builds the LLM client using:
1. Session-scoped API key (from `/key`)
2. Global saved key
3. Environment variable
4. Applies max tokens from config

## Event Loop (Update)

The `Update` method (internal/tui/tui.go:284-426) is the core event loop that processes Bubble Tea messages. It handles window resizes, keyboard input, asynchronous messages from goroutines, and UI state transitions.

### Message Handling Overview

The update function uses a type switch to handle different message types:

| Message Type | Handler | Purpose |
|--------------|---------|---------|
| `tea.WindowSizeMsg` | Updates dimensions, layout, and welcome banner | Responds to terminal resize |
| `tea.KeyMsg` | Delegates to `onKey` for keyboard processing | Handles user input |
| `spinner.TickMsg` | Updates spinner animation during busy states | Maintains busy indicator |
| `logMsg` | Flushes live stream and appends log line | Displays tool/status output |
| `streamDeltaMsg` | Appends token to live stream and refreshes view | Handles LLM streaming response |
| `assistantMsg` | Replaces live stream with final rendered text | Completes LLM response |
| `busyMsg` | Sets busy state and starts/stops spinner | Manages long-running operations |
| `doneMsg` | Reports success/failure of operations | Completes background tasks |
| `approvalReqMsg` | Displays approval prompt for tool use | Handles user confirmation |
| `agentDoneMsg` | Updates conversation and saves session | Completes agent processing |
| `modelsFetchedMsg` | Populates model picker with available models | Handles model listing |
| `serveStartedMsg`/`serveStoppedMsg` | Manages wiki browser URL display | Controls wiki server lifecycle |
| `undoRecordMsg` | Adds entry to undo stack | Tracks file operations |
| `compactedMsg` | Replaces conversation history with summary | Manages context window |

### Window Resize Handling

```go
case tea.WindowSizeMsg:
	first := !m.ready
	m.width, m.height = msg.Width, msg.Height
	m.vp.Width = msg.Width
	m.input.SetWidth(max(msg.Width-3, 10))
	m.keyInput.Width = max(msg.Width-3, 10)
	m.list.SetSize(msg.Width, msg.Height)
	m.ready = true
	m.committed = "" // width changed — the cached wrap is wrong now
	if first {
		// Built here, not in New(), because only now do we know the
		// real terminal width — needed to lay the banner out correctly.
		m.lines = welcomeBanner(m.cfg, m.repo, m.client != nil, m.width)
		if m.configMissing {
			m.lines = append(m.lines, warnStyle.Render("no .kaioken/config.yaml here — using defaults; /init to save"))
		}
	}
	m.syncLayout()
	return m, nil
```
`internal/tui/tui.go:290-318`

Handles terminal resize by:
1. Updating dimensions and UI component sizes
2. Invalidating committed layout cache
3. Building welcome banner on first resize
4. Synchronizing layout via `syncLayout`

### Key Processing

Keyboard input is handled by `onKey` (internal/tui/tui.go:428-567), which delegates based on UI state:

#### Mode Picker State
Handles model/session selection:
- ESC/Ctrl+C: Returns to chat mode
- Enter: Confirms selection (model or session)
- Other keys: Updates list filter

#### Approval Prompt State
Handles tool approval:
- Y/Enter: Approves operation
- N/Esc: Declines operation
- Ctrl+C: Cancels current operation

#### Command Palette State
Handles slash-command completion:
- Up/Ctrl+P: Move selection up
- Down/Ctrl+N: Move selection down
- Tab: Complete selected command
- Enter: Execute command
- Esc: Dismiss palette

#### Global Keybindings
- Ctrl+D: Quits (if input empty)
- Ctrl+C/Esc: Stops current operation or clears input
- Enter: Submits chat message or command
- PgUp/PgDown: Scroll viewport
- Up/Down: Scroll viewport (single-line input) or move cursor (multi-line)

### Asynchronous Message Handling

Background operations communicate via the `events` channel:

#### Streaming LLM Response
```go
case streamDeltaMsg:
	m.live += msg.text
	m.refreshViewport()
	return m, listen(m.events)
```
Appends incoming tokens to `live` stream and refreshes viewport.

#### Completed LLM Response
```go
case assistantMsg:
	m.live = ""
	m.appendLine(renderMarkdown(msg.text, m.vp.Width))
	return m, listen(m.events)
```
Replaces live stream with final markdown-rendered text and appends to scrollback.

#### Tool Approval Request
```go
case approvalReqMsg:
	m.showApproval(msg.req)
	return m, listen(m.events)
```
Displays approval prompt using `showApproval`.

#### Operation Completion
```go
case doneMsg:
	if msg.err != nil {
		m.appendLine(errStyle.Render("✗ " + msg.label + ": " + msg.err.Error()))
	} else if msg.label != "" {
		m.appendLine(okStyle.Render("✓ " + msg.label + " complete"))
		// A finished knowledge run is exactly when skills become buildable.
		switch msg.label {
		case "wiki", "generate":
			m.suggestSkills()
		}
	}
	return m, listen(m.events)
```
Reports success/failure and triggers skill suggestions after wiki/generate.

#### Agent Completion
```go
case agentDoneMsg:
	m.flushLive("")
	if msg.history != nil {
		m.conversation = msg.history
	}
	if msg.err != nil && msg.err != context.Canceled {
		m.appendLine(errStyle.Render("agent error: " + msg.err.Error()))
	}
	m.saveSession()
	return m, listen(m.events)
```
Updates conversation history, handles errors, and saves session.

### Busy State Management

```go
case busyMsg:
	m.busy = msg.on
	m.busyText = msg.text
	cmds = append(cmds, listen(m.events))
	if m.busy {
		m.busyStart = time.Now()
		cmds = append(cmds, m.spin.Tick)
	} else {
		m.cancel = nil
	}
	return m, tea.Batch(cmds...)
```
Sets busy state, starts spinner timer, and tracks operation start time.

## View Rendering

The `View` method (internal/tui/tui.go:590-601) generates the terminal output by combining the viewport, palette, and footer.

### View Method

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
`internal/tui/tui.go:590-601`

Returns:
- "starting kaioken…" during initialization
- Picker view when in `modePicker`
- Otherwise: viewport content + palette view + footer

### Viewport Content

The viewport displays:
- Committed scrollback (wrapped lines)
- Currently streaming assistant response (`live`)

Managed by `refreshViewport`:
```go
func (m *Model) refreshViewport() {
	if !m.ready {
		return
	}
	wrap := lipgloss.NewStyle().Width(m.vp.Width)
	switch {
	case len(m.lines) == 0:
		m.committed = "" // /clear and /reset drop the scrollback entirely
	case m.committed == "":
		m.committed = wrap.Render(strings.Join(m.lines, "\n"))
	}
	body := m.committed
	if m.live != "" {
		if body != "" {
			body += "\n"
		}
		body += wrap.Render(assistantStyle.Render(m.live))
	}
	m.vp.SetContent(body)
	m.vp.GotoBottom()
}
```
`internal/tui/tui.go:733-753`

### Footer Composition

The footer combines input line and status line:
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
`internal/tui/tui.go:605-633`

Handles three states:
1. Approval prompt (with yes/no keys)
2. API key entry (hidden input)
3. Normal input (with mode-indicating prompt) + status line

### Status Line

The status line shows contextual information:
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
`internal/tui/tui.go:638-656`

Displays:
- Left: Busy spinner + text + elapsed time OR default key hints
- Right: Session status (serving indicator, model, token count)

### Session Status

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
`internal/tui/tui.go:661-680`

Shows:
- Wiki serving status
- Current model (truncated via `shortModel`)
- Token usage (formatted via `humanTokens`)
- YOLO indicator when auto-approve is active

## Supporting Components

### Message Types

Asynchronous communication uses typed messages:
- `logMsg`: Tool calls, status updates
- `busyMsg`: Start/end of long operations
- `doneMsg`: Operation completion (with error)
- `approvalReqMsg`: Tool approval request
- `agentDoneMsg`: Agent processing completion
- `modelsFetchedMsg`: Available LLM models
- `undoRecordMsg`: File operation for undo
- `streamDeltaMsg`: LLM response token chunk
- `assistantMsg`: Complete LLM response
- `serveStartedMsg`/`serveStoppedMsg`: Wiki server lifecycle
- `compactedMsg`: Conversation summary result

### Styles

Visual styling uses Lipgloss:
- Prompt styles: `promptStyle`, `yoloPromptStyle`, `busyPromptStyle`
- Message styles: `userStyle`, `assistantStyle`, `toolStyle`, `toolResStyle`
- Status styles: `okStyle`, `errStyle`, `warnStyle`, `dimStyle`, `hintStyle`
- Special styles: `approvalStyle`, `spinnerStyle`, `keycapStyle`, `gutterStyle`, `elapsedStyle`

### Helper Functions

Key UI helpers:
- `shortModel`: Truncates model ID for status line
- `humanTokens`: Formats token counts (e.g., "1.2k")
- `elapsed`: Formats durations (e.g., "2m05s")
- `clip`: Truncates strings to fit width
- `welcomeBanner`: Generates startup logo and info
- `renderMarkdown`: Converts assistant text to markdown
- `syncLayout`: Adjusts viewport around changing input height
- `flushLive`: Commits streaming response to scrollback

## Data Flow

The following sequence diagram illustrates the flow of a user chat message through the TUI system:

```text
sequenceDiagram
    participant User
    participant TUI as Model
    participant Agent
    participant LLM as LLM Client
    participant Session

    User->>TUI: KeyPress (Enter)
    TUI->>TUI: onKey → onEnter
    TUI->>TUI: startChat
    TUI->>TUI: appendLine (user message)
    TUI->>TUI: conversation append (user)
    TUI->>Agent: New Agent with UI adapter
    Agent->>LLM: ChatWithTools
    alt Tool Needed
        LLM->>Agent: Tool Call Request
        Agent->>TUI: Tool notification via UI
        TUI->>TUI: showApproval (approvalReqMsg)
        TUI->>User: Display approval prompt
        User->>TUI: KeyPress (Y/N)
        TUI->>TUI: onKey → approvals channel
        TUI->>Agent: Approval result
        Agent->>Tool: Execute (if approved)
        Tool->>Agent: Result
        Agent->>LLM: Continue with tool result
    end
    LLM->>TUI: streamDeltaMsg (tokens)
    TUI->>TUI: Update → append to live stream
    TUI->>TUI: refreshViewport
    LLM->>TUI: assistantMsg (complete response done
    TUI->>TUI: Update → replace live with final text
    TUI->>TUI: appendLine (assistant message)
    TUI->>TUI: conversation append (assistant)
    TUI->>Session: saveSession
```

> Diagram omitted: the generated mermaid was not valid.


### Key Flows Explained

1. **Input Handling**: Key presses flow through `Update` → `onKey` → `onEnter` → `startChat`
2. **Agent Invocation**: TUI creates agent with UI adapter that routes messages via channels
3. **Tool Approval**: Agent requests approval via `UIAdapter.Approve` → sends `approvalReqMsg` → TUI displays prompt → waits for user response
4. **Streaming Response**: LLM tokens arrive as `streamDeltaMsg` → appended to `live` → viewport refreshed
5. **Response Completion**: Final response arrives as `assistantMsg` → replaces `live` with rendered text → added to scrollback
6. **Session Persistence**: After agent completes, conversation is saved via `saveSession`

## Referenced Files

- internal/tui/tui.go

This document covers all exported declarations in the `internal/tui/tui.go` file as specified in the STRUCTURE block, including the `Model` struct, initialization functions, event loop (`Update` and `onKey`), view rendering (`View` and helpers), message types, styles, and supporting functions. The explanation focuses on how these components work together to create the interactive TUI experience.

<!-- kaioken:files internal/tui/tui.go -->
