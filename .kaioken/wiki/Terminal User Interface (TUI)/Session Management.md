# Session Management

This chapter covers how the TUI handles chat session persistence, including saving, loading, listing, and resuming sessions from disk. Sessions store conversation history to allow users to pause and resume interactions with the LLM.

## Table of Contents
- [Session Lifecycle](#session-lifecycle)
- [Session Persistence](#session-persistence)
- [User Commands](#user-commands)
- [Session Display](#session-display)
- [Edge Cases and Error Handling](#edge-cases-and-error-handling)
- [Referenced Files](#referenced-files)

## Session Lifecycle

The TUI manages a session through the `Model.sess` field of type `*session.Session`. A session is initialized when the TUI starts or when a user begins a new conversation.

### Session Initialization

When the TUI starts via `New(repo string)`, it creates a new session using the current model and provider:

```go
func New(repo string) Model {
    // ... config loading ...
    m := Model{
        // ... other fields ...
    }
    m.resetConversation()
    m.rebuildClient()
    m.configMissing = missing
    return m
}
```

`resetConversation()` initializes both the conversation history and the session:

```go
func (m *Model) resetConversation() {
    m.conversation = []llm.Message{{
        Role:    "system",
        Content: agent.SystemPrompt(m.repo, true),
    }}
    m.sess = session.New(m.cfg.Model, m.cfg.Provider)
}
```

The session is tied to the model and provider at creation time. If the model or provider changes during the session (via `/model` or `/provider`), the existing session is not automatically updated—it retains the original model/provider metadata.

### Session Saving

Sessions are persisted to disk after each completed agent turn. The `saveSession()` method is called when the agent finishes processing a message:

```go
func (m *Model) saveSession() {
    if m.sess == nil {
        return
    }
    m.sess.Record(m.conversation)
    if err := m.sess.Save(m.repo); err != nil {
        m.appendLine(dimStyle.Render("could not save session: " + err.Error()))
    }
}
```

This occurs in the `Update` method when handling `agentDoneMsg`:

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

Sessions are also saved explicitly when starting a new conversation via `/reset` or `/new`:

```go
case "reset", "new":
    m.saveSession() // keep what was there before starting fresh
    m.resetConversation()
    m.undoStack = nil
    m.appendLine(dimStyle.Render("new session started — /resume to reopen the previous one"))
```

### Session Loading

Saved sessions are loaded via the `/resume` command. If no session ID is provided, the TUI opens a session picker. If an ID is given, it attempts to load that session directly:

```go
case "resume":
    if rest == "" {
        return m.openSessionPicker()
    }
    m.resumeSession(rest)
```

The `resumeSession` method loads the session from disk and replays the conversation:

```go
func (m *Model) resumeSession(id string) {
    s, err := session.Load(m.repo, id)
    if err != nil {
        m.appendLine(errStyle.Render("could not load session " + id + ": " + err.Error()))
        return
    }
    if len(s.Messages) == 0 {
        m.appendLine(warnStyle.Render("session " + id + " has no messages"))
        return
    }
    m.sess = s
    m.conversation = s.Messages
    m.undoStack = nil // undo entries belong to the session that made them

    m.appendLine("")
    m.appendLine(okStyle.Render("resumed: " + s.Title))
    m.appendLine(dimStyle.Render(fmt.Sprintf("  %s · %d turns · saved %s",
        s.ID, s.Turns(), humanTime(s.Updated))))
    // Replay the transcript so the user can see where they left off.
    for _, msg := range s.Messages {
        switch msg.Role {
        case "user":
            m.appendLine(userStyle.Render("› " + firstLine(msg.Content)))
        case "assistant":
            if text := strings.TrimSpace(msg.Content); text != "" {
                m.appendLine(renderMarkdown(text, m.vp.Width))
            }
        }
    }
    if s.Model != "" && s.Model != m.cfg.Model {
        m.appendLine(dimStyle.Render("note: this session used " + s.Model +
            "; the active model is " + m.cfg.Model))
    }
}
```

## Session Persistence

Sessions are stored as JSON files in the `.kaioken/sessions/` directory within the repository. The underlying `session` package handles the actual file I/O, but the TUI interacts with it through the `session.Session` type.

Each session file contains:
- `ID`: Unique identifier (timestamp-based)
- `Title`: First line of the first user message (or placeholder)
- `Description`: First 50 characters of the first user message
- `Messages`: Full conversation history (system, user, assistant, and tool messages)
- `Model`: The LLM model used when the session was created
- `Provider`: The LLM provider used when the session was created
- `Updated`: Timestamp of last save
- `Turns`: Count of user-assistant exchanges

The TUI does not directly manage the session file format—it relies on the `session` package's `Save()` and `Load()` methods.

## User Commands

The TUI provides several commands for session management:

| Command | Description |
|---------|-------------|
| `/sessions` | Lists all saved sessions for the current repository |
| `/resume [id]` | Resumes a session by ID; if no ID provided, opens the session picker |
| `/reset` or `/new` | Saves the current session and starts a new one |
| `/undo` | Reverts the last file edit made by the agent (session-specific) |

### Session Listing

The `/sessions` command displays all saved sessions without leaving the chat view:

```go
func (m *Model) listSessions() {
    metas, err := session.List(m.repo)
    if err != nil {
        m.appendLine(errStyle.Render("could not read sessions: " + err.Error()))
        return
    }
    if len(metas) == 0 {
        m.appendLine(dimStyle.Render("no saved sessions yet — they are written after each reply"))
        return
    }
    for _, s := range metas {
        marker := "  "
        if m.sess != nil && s.ID == m.sess.ID {
            marker = okStyle.Render("● ")
        }
        m.appendLine(fmt.Sprintf("%s%s  %s", marker, dimStyle.Render(s.ID), s.Title))
        m.appendLine(dimStyle.Render(fmt.Sprintf("     %d turns · %s · %s",
            s.Turns, s.Model, humanTime(s.Updated))))
    }
    m.appendLine(dimStyle.Render("/resume to pick one, /resume <id> to jump straight to it"))
}
```

### Session Picker

When no session ID is provided to `/resume`, the TUI opens an interactive picker using the Bubble Tea list component:

```go
func (m Model) openSessionPicker() (tea.Model, tea.Cmd) {
    metas, err := session.List(m.repo)
    if err != nil {
        m.appendLine(errStyle.Render("could not read sessions: " + err.Error()))
        return m, nil
    }
    if len(metas) == 0 {
        m.appendLine(dimStyle.Render("no saved sessions yet"))
        return m, nil
    }
    items := make([]list.Item, 0, len(metas))
    for _, s := range metas {
        items = append(items, sessionItem{
            id:    s.ID,
            title: s.Title,
            desc:  fmt.Sprintf("%d turns · %s · %s", s.Turns, humanTime(s.Updated), s.Model),
        })
    }
    m.list.Title = "Resume a session — type to filter, enter to open, esc to cancel"
    m.list.SetItems(items)
    m.list.SetSize(m.width, m.height)
    m.mode = modePicker
    return m, nil
}
```

The `sessionItem` type adapts session metadata for the picker list:

```go
// sessionItem adapts a saved session to the shared picker list.
type sessionItem struct {
    id, title, desc string
}

func (i sessionItem) Title() string       { return i.title }
func (i sessionItem) Description() string { return i.desc }
func (i sessionItem) FilterValue() string { return i.title + " " + i.desc }
```

## Session Display

The TUI shows session information in two places:

### Status Line

The right side of the status line displays the current serving status, model, and token usage:

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
        out = warnStyle.Render("yolo") + hintStyle.Render(" · ") + out
    }
    return out
}
```

Note: The session ID is not shown in the status line—only the current model and token count. The active session is indicated in the session list with a `●` marker.

### Session Picker Display

In the session picker, each session shows:
- ID (dimmed)
- Title (first line of first user message)
- Description (turn count, last updated time, and model used)

The `humanTime` function formats timestamps as relative ages:

```go
func humanTime(t time.Time) string {
    d := time.Since(t)
    switch {
    case d < time.Minute:
        return "just now"
    case d < time.Hour:
        return fmt.Sprintf("%dm ago", int(d.Minutes()))
    case d < 24*time.Hour:
        return fmt.Sprintf("%dh ago", int(d.Hours()))
    case d < 7*24*time.Hour:
        return fmt.Sprintf("%dd ago", int(d.Hours()/24))
    default:
        return t.Format("2006-01-02")
    }
}
```

The `firstLine` helper truncates long messages for session titles:

```go
func firstLine(s string) string {
    s = strings.TrimSpace(s)
    if i := strings.IndexByte(s, '\n'); i != -1 {
        return s[:i] + " …"
    }
    return s
}
```

## Edge Cases and Error Handling

### Empty Sessions

If a session file exists but contains no messages, loading it produces a warning:

```go
if len(s.Messages) == 0 {
    m.appendLine(warnStyle.Render("session " + id + " has no messages"))
    return
}
```

### Save Failures

If saving a session fails (e.g., due to disk permissions), the TUI displays an error but continues:

```go
if err := m.sess.Save(m.repo); err != nil {
    m.appendLine(dimStyle.Render("could not save session: " + err.Error()))
}
```

### Model/Provider Mismatch

When resuming a session, if the session's model/provider differs from the current configuration, the TUI shows a note:

```go
if s.Model != "" && s.Model != m.cfg.Model {
    m.appendLine(dimStyle.Render("note: this session used " + s.Model +
        "; the active model is " + m.cfg.Model))
}
```

### Concurrent Session Access

The TUI does not support concurrent session modifications. Each TUI instance manages its own session state independently.

## Referenced Files
- internal/tui/tui.go
- internal/session/session.go (referenced but not detailed—see [Knowledge Engine](../Knowledge Engine/Knowledge Engine.md) chapter for session persistence details)

<!-- kaioken:files internal/tui/tui.go -->
