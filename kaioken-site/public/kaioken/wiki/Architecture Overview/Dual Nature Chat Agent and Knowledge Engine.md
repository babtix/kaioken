# Dual Nature: Chat Agent and Knowledge Engine

## Table of Contents
- [Chat Agent Implementation](#chat-agent-implementation)
- [Knowledge Engine Implementation](#knowledge-engine-implementation)
- [Integration Between Agent and Knowledge Engine](#integration-between-agent-and-knowledge-engine)
- [Data Flow Examples](#data-flow-examples)
- [Referenced Files](#referenced-files)

## Chat Agent Implementation

The chat agent enables interactive coding assistance through a terminal UI, LLM integration, and tool execution under user approval. It comprises three core components: the TUI (`internal/tui/tui.go`), the agent logic (`internal/agent/agent.go`), and LLM provider integration (not in scope for this chapter).

### Terminal UI (TUI)

The TUI built with Bubble Tea manages user interaction, displays chat, and orchestrates agent communication.

#### Core State: `Model` struct

The `Model` struct holds all UI state and dependencies:

```
internal/tui/tui.go:127-181
```

```go
type Model struct {
	repo   string
	cfg    *config.Config
	global *config.Global
	apiKeys map[string]string
	client  *llm.Client

	conversation []llm.Message
	autoApprove  bool
	undoStack    []agent.UndoEntry
	sess         *session.Session

	vp    viewport.Model
	input textarea.Model
	keyInput  textinput.Model
	spin      spinner.Model
	list      list.Model
	events    chan tea.Msg
	approvals chan bool

	lines []string
	committed string
	live     string
	busy     bool
	busyText string
	busyStart time.Time
	mode      mode

	pal             palette
	pendingKey      bool
	pendingApproval bool
	approval        agent.ApprovalRequest
	cancel          context.CancelFunc

	serveCancel context.CancelFunc
	serveURL    string

	configMissing   bool
	suggestedSkills bool
	width, height   int
	ready           bool
}
```

Key fields:
- `repo`, `cfg`, `global`: Repository path and configuration
- `client`: Active LLM client
- `conversation`: Chat history with LLM
- `autoApprove`: Bypass approval for edits (yolo mode)
- `undoStack`: History of file changes for undo
- `sess`: Current chat session
- `vp`, `input`, `keyInput`, `spin`, `list`: UI components
- `events`, `approvals`: Channels for async communication
- `lines`, `committed`, `live`: Rendered chat buffer
- `busy`, `busyText`, `busyStart`: Track long-running operations
- `mode`: Chat or picker state
- `pal`: Command palette
- `pendingKey`, `pendingApproval`: Awaiting user input
- `serveCancel`, `serveURL`: Wiki server state
- `configMissing`, `suggestedSkills`: UI hints
- `width`, `height`, `ready`: Terminal dimensions

#### UI Initialization and Reset

`New` constructor sets up initial state:

```
internal/tui/tui.go:194-257
```

```go
func New(repo string) Model {
	global := config.LoadGlobal()
	cfg, err := config.Load(repo)
	missing := false
	if err != nil {
		cfg = config.Default()
		missing = true
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
	ta.CharLimit = 0
	ta.ShowLineNumbers = false
	ta.SetHeight(1)
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

`resetConversation` initializes chat history with system prompt:

```
internal/tui/tui.go:259-265
```

```go
func (m *Model) resetConversation() {
	m.conversation = []llm.Message{{
		Role:    "system",
		Content: agent.SystemPrompt(m.repo, true),
	}}
	m.sess = session.New(m.cfg.Model, m.cfg.Provider)
}
```

#### Main Update Loop

The `Update` method processes terminal messages:

```
internal/tui/tui.go:284-426
```

Handles:
- Window resizing (`tea.WindowSizeMsg`)
- Key input (`tea.KeyMsg`)
- Spinner ticks (`spinner.TickMsg`)
- Async messages from goroutines (`logMsg`, `busyMsg`, `doneMsg`, etc.)
- Model picker interactions
- Approval prompts
- Key entry
- Composer input

Key handling delegates to `onKey` for most keys.

#### Key Processing

`onKey` handles keyboard input based on UI state:

```
internal/tui/tui.go:428-567
```

Logic branches:
1. **Model picker mode**: Navigate model/session lists
2. **Approval prompt**: `y`/`n` to accept/decline tool execution
3. **Command palette open**: Navigate slash-command menu
4. **Special keys**: `ctrl+d` (quit), `ctrl+c`/`esc` (cancel), `enter` (submit)
5. **Pending key entry**: Hidden API key input
6. **Normal input**: Update composer and refresh UI

#### Chat Initiation

`startChat` begins a LLM conversation:

```
internal/tui/tui.go:875-916
```

```go
func (m Model) startChat(text string) (tea.Model, tea.Cmd) {
	if m.client == nil {
		return m.needKey()
	}
	if m.busy {
		m.appendLine(warnStyle.Render("busy — wait, or /stop (esc/ctrl+c) to cancel"))
		return m, nil
	}
	m.appendLine("")
	for i, l := range strings.Split(text, "\n") {
		prefix := promptStyle.Render("› ")
		if i > 0 {
			prefix = gutterStyle.Render("  ")
		}
		m.appendLine(prefix + userStyle.Render(l))
	}
	m.conversation = append(m.conversation, llm.Message{Role: "user", Content: text})

	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	ui := uiAdapter{events: m.events, approvals: m.approvals, ctx: ctx}
	ag := &agent.Agent{
		Client:      m.client,
		Root:        m.repo,
		UI:          ui,
		AutoApprove: m.autoApprove,
		AllowRun:    true,
		MaxSteps:    25,
	}
	conv := m.conversation
	ch := m.events
	go func() {
		ch <- busyMsg{true, "thinking"}
		hist, err := ag.Run(ctx, conv)
		ch <- agentDoneMsg{hist, err}
		ch <- busyMsg{false, ""}
	}()
	return m, nil
}
```

Steps:
1. Validate LLM client
2. Prevent concurrent operations
3. Echo user message to chat
4. Append user message to history
5. Create context and UI adapter
6. Initialize agent with tools
7. Run agent in goroutine
8. Signal start/end of operation

#### Tool Approval Flow

`showApproval` displays diff for user confirmation:

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

Shows:
- Action and target (e.g., "edit_file path/to/file.go")
- Line count of additions/deletions
- Visual gutter to group diff
- Color-coded diff lines (green for additions, red for deletions)

#### Command Dispatch

`dispatch` handles slash commands:

```
internal/tui/tui.go:920-1043
```

Processes:
- `/wiki`: Starts knowledge generation (`startWiki`)
- `/update`: Triggers incremental wiki update (`startWikiUpdate`)
- `/scan`, `/plan`, `/generate`: Knowledge pipeline steps
- `/skills`: Builds task guides
- `/serve`: Starts wiki browser
- `/hook`: Manages git hooks
- `/model`, `/provider`, `/key`: [Configuration](../Configuration/Configuration.md)
- Session management (`/sessions`, `/resume`)
- UI controls (`/clear`, `/reset`, `/undo`, `/diff`, `/cost`, `/compact`, `/copy`)
- Help and tutorial

Each command sets up context and launches a goroutine for long-running operations.

#### Knowledge Engine Commands

TUI exposes knowledge engine via slash commands:

- `startWiki`: Runs full documentation pipeline with depth multiplier
  ```
  internal/tui/tui.go:1752-1820
  ```
- `startWikiUpdate`: Updates only changed sections since last build
  ```
  internal/tui/tui.go:1871-1951
  ```
- `startWikiRetry`: Retries failed sections from previous run
  ```
  internal/tui/tui.go:1823-1866
  ```
- `startGenerate`: Generates knowledge cards per module
  ```
  internal/tui/tui.go:1953-2008
  ```
- `startStatus`: Checks module freshness against file hashes
  ```
  internal/tui/tui.go:2010-2051
  ```

Each command:
1. Validates prerequisites (LLM client, not busy)
2. Sets up cancellation context
3. Launches goroutine to run operation
4. Reports progress via `events` channel
5. Handles completion/error via `doneMsg`

#### Session Management

TUI persists and restores chat sessions:

- `saveSession`: Writes conversation to disk
  ```
  internal/tui/tui.go:270-278
  ```
- `openSessionPicker`: Lists saved sessions
  ```
  internal/tui/tui.go:1605-1628
  ```
- `resumeSession`: Loads session and replays transcript
  ```
  internal/tui/tui.go:1631-1664
  ```

#### UI Rendering

- `View`: Returns full UI string
  ```
  internal/tui/tui.go:590-601
  ```
- `footer`: Shows approval prompt or key entry
  ```
  internal/tui/tui.go:605-633
  ```
- `statusLine`: Displays keys left, session info right
  ```
  internal/tui/tui.go:638-656
  ```
- `refreshViewport`: Updates chat display
  ```
  internal/tui/tui.go:733-753
  ```
- `flushLive`: Commits streaming LLM response on interruption
  ```
  internal/tui/tui.go:756-771
  ```

#### Helper Functions

- `shortModel`: Truncates model ID for status line
  ```
  internal/tui/tui.go:690-700
  ```
- `humanTokens`: Formats token count
  ```
  internal/tui/tui.go:715-725
  ```
- `elapsed`: Formats duration
  ```
  internal/tui/tui.go:727-731
  ```
- `firstLine`: Extracts first line of text
  ```
  internal/tui/tui.go:1666-1672
  ```
- `humanTime`: Formats timestamp
  ```
  internal/tui/tui.go:1675-1689
  ```
- `shortPath`: Truncates repo path
  ```
  internal/tui/tui.go:2328-2334
  ```
- `clip`: Truncates string to width
  ```
  internal/tui/tui.go:2336-2341
  ```
- `max`, `minInt`: Integer helpers
  ```
  internal/tui/tui.go:2343-2348, 2350-2355
  ```

### Agent Logic

The agent (`internal/agent/agent.go`) executes the tool-calling loop with the LLM.

#### System Prompt

`SystemPrompt` builds initial instructions:

```
internal/agent/agent.go:12-31
```

```go
func SystemPrompt(root string, allowRun bool) string {
	var b strings.Builder
	b.WriteString("You are Kaioken, an AI coding assistant embedded in a terminal, working inside the ")
	b.WriteString("repository at:\n  " + root + "\n\n")
	b.WriteString("You help the user understand and modify this codebase. You have tools:\n")
	b.WriteString("- read_file, list_files, search: inspect the repo. Use them liberally before answering.\n")
	b.WriteString("- read_knowledge: open Kaioken's generated docs for this repo; call it with no\n")
	b.WriteString("  argument to see what exists.\n")
	b.WriteString("- write_file, edit_file: change files. Prefer edit_file for small changes; use a unique old_string.\n")
	if allowRun {
		b.WriteString("- run_command: run shell commands (build, test, git) in the repo root.\n")
	}
	b.WriteString(knowledgeSummary(root))
	b.WriteString("\nGuidelines:\n")
	b.WriteString("- Every file change and command runs only after the user approves it, so propose concrete edits.\n")
	b.WriteString("- Ground answers in the actual files — read before you claim. Never invent file contents.\n")
	b.WriteString("- Keep prose concise. When you finish a task, briefly say what you changed.\n")
	b.WriteString("- Make minimal, targeted edits that match the surrounding code style.\n")
	return b.String()
}
```

Includes:
- Repository location
- Available tools (file ops, knowledge access, commands)
- Knowledge summary hint
- Guidelines: approval required, grounding, conciseness, minimal edits

#### Tool-Calling Loop

`Run` drives agent-LLM interaction:

```
internal/agent/agent.go:45-89
```

```go
func (a *Agent) Run(ctx context.Context, history []llm.Message) ([]llm.Message, error) {
	steps := a.MaxSteps
	if steps <= 0 {
		steps = 25
	}
	tools := a.Tools()

	for i := 0; i < steps; i++ {
		if ctx.Err() != nil {
			return history, ctx.Err()
		}
		msg, err := a.chat(ctx, history, tools)
		if err != nil {
			return history, err
		}
		history = append(history, msg)

		if text := strings.TrimSpace(msg.Content); text != "" {
			a.UI.Assistant(msg.Content)
		}

		if len(msg.ToolCalls) == 0 {
			return history, nil // final answer
		}

		for _, tc := range msg.ToolCalls {
			if ctx.Err() != nil {
				return history, ctx.Err()
			}
			a.UI.Tool(tc.Function.Name, tc.Function.Arguments)
			result := a.execTool(ctx, tc)
			isErr := strings.HasPrefix(result, "error:") ||
				strings.HasPrefix(result, "user declined") ||
				strings.Contains(result, "exited with error")
			a.UI.ToolResult(tc.Function.Name, result, isErr)
			history = append(history, llm.Message{
				Role:       "tool",
				ToolCallID: tc.ID,
				Name:       tc.Function.Name,
				Content:    result,
			})
		}
	}
	return history, fmt.Errorf("stopped after %d steps without a final answer", steps)
}
```

Process:
1. Set step limit (default 25)
2. Get available tools via `a.Tools()`
3. Loop until step limit or ctx done:
   - Call LLM with current history and tools
   - Append LLM response to history
   - Display response text via UI
   - If no tool calls: return history (final answer)
   - For each tool call:
     - Execute tool via `execTool`
     - Determine if result is error
     - Report tool execution and result via UI
     - Append tool result to history
4. Return error if step limit exceeded without final answer

#### Single LLM Turn

`chat` handles one LLM interaction:

```
internal/agent/agent.go:35-40
```

```go
func (a *Agent) chat(ctx context.Context, history []llm.Message, tools []llm.Tool) (llm.Message, error) {
	if a.NoStream {
		return a.Client.ChatWithTools(ctx, history, tools)
	}
	return a.Client.ChatWithToolsStream(ctx, history, tools, a.UI.AssistantDelta)
}
```

Delegates to LLM client, using streaming if enabled.

#### Tool Execution

`execTool` performs requested action:

```
internal/agent/agent.go: (not shown in STRUCTURE but implied)
```

Handles:
- `read_file`: Returns file content
- `edit_file`: Applies string replacement (requires unique old_string)
- `write_file`: Creates/overwrites file
- `list_files`: Lists files matching glob
- `search`: Runs regex search
- `run_command`: Executes shell command
- `read_knowledge`: Returns generated wiki content

Each tool result is returned as string to LLM.

#### Approval Integration

Agent uses UI adapter for approvals:

- `UI.Approve`: Shows approval prompt via TUI
- `UI.RecordUndo`: Logs change for potential undo
- `UI.Tool`/`UI.ToolResult`: Logs tool execution
- `UI.AssistantDelta`/`UI.Assistant`: Streams/displays LLM response

See `uiAdapter` in tui.go for implementation.

## Knowledge Engine Implementation

The knowledge engine (`internal/wiki/wiki.go`) generates structured documentation through a multi-pass pipeline.

### Pipeline Overview

The wiki generation follows three passes:
1. **Global Plan**: LLM creates repository outline (sections with goals/files)
2. **Sub-Planning**: Per-section LLM plans subsections and focus files
3. **Documentation**: Generate long-form documents for sections and subsections

Depth controlled by multiplier (`×N`):
- `×1`: Section documents only
- `×2`: Adds subsection documents
- `×3+`: Exhaustive coverage with diagrams and tables

### Core Data Structures

```
internal/wiki/wiki.go:35-40
```

```go
type Section struct {
	ID    string   `yaml:"id" json:"id"`
	Title string   `yaml:"title" json:"title"`
	Goal  string   `yaml:"goal" json:"goal"`
	Files []string `yaml:"files" json:"files"`
}
```

```
internal/wiki/wiki.go:43-47
```

```go
type Outline struct {
	Version    int       `yaml:"version"`
	Multiplier int       `yaml:"multiplier"`
	Sections   []Section `yaml:"sections"`
}
```

```
internal/wiki/wiki.go:50-54
```

```go
type SubPlan struct {
	Summary     string       `json:"summary"`
	FocusFiles  []string     `json:"focus_files"`
	Subsections []Subsection `json:"subsections"`
}
```

```
internal/wiki/wiki.go:57-61
```

```go
type Subsection struct {
	Title string   `json:"title"`
	Goal  string   `json:"goal"`
	Files []string `json:"files"`
}
```

```
internal/wiki/wiki.go:64-69
```

```go
type Progress struct {
	Info    func

<!-- kaioken:files internal/tui/tui.go,internal/agent/agent.go,internal/wiki/wiki.go -->
