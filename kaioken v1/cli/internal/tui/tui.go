// Package tui is an interactive terminal UI for kaioken: a chat client for an
// OpenAI-compatible model (picked from the provider's live catalog) that can
// read, search, edit, and run commands in the repository — with every
// repo-changing action gated behind a diff/confirmation prompt. Slash commands
// keep the knowledge-card pipeline (/scan /plan /generate) and settings.
package tui

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/atotto/clipboard"
	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/list"
	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"kaioken/internal/agent"
	agentevents "kaioken/internal/agent/events"
	"kaioken/internal/agentsmd"
	"kaioken/internal/config"
	"kaioken/internal/ext"
	"kaioken/internal/generate"
	"kaioken/internal/gitdraft"
	"kaioken/internal/gitx"
	"kaioken/internal/handoff"
	"kaioken/internal/impact"
	"kaioken/internal/llm"
	"kaioken/internal/memory"
	"kaioken/internal/onboard"
	"kaioken/internal/plan"
	"kaioken/internal/research"
	"kaioken/internal/scan"
	"kaioken/internal/serve"
	"kaioken/internal/session"
	"kaioken/internal/setup"
	"kaioken/internal/skills"
	"kaioken/internal/state"
	"kaioken/internal/verify"
	"kaioken/internal/version"
	"kaioken/internal/wiki"
)

const defaultPlaceholder = "chat with the model, or /help for commands"

type mode int

const (
	modeChat mode = iota
	modePicker
	modeImpact
)

// ---- async messages ----

type logMsg struct{ line string }
type busyMsg struct {
	on   bool
	text string
}
type doneMsg struct {
	label string
	err   error
}
type approvalReqMsg struct{ req agent.ApprovalRequest }
type agentDoneMsg struct {
	history []llm.Message
	err     error
}
type modelsFetchedMsg struct {
	models []llm.ModelInfo
	err    error
}

// draftMsg carries a /draft result back from the LLM goroutine.
type draftMsg struct {
	text string
	err  error
}

// handoffMsg carries a /handoff brief back from the LLM goroutine; the file
// is written in the Update loop so the user sees the path synchronously.
type handoffMsg struct {
	brief string
	err   error
}

// extRegistryFetchedMsg carries the community extension index for the
// browse picker.
type extRegistryFetchedMsg struct {
	entries []ext.RegistryEntry
	err     error
}
type undoRecordMsg struct{ entry agent.UndoEntry }

// streamDeltaMsg is one chunk of assistant prose arriving from the model.
type streamDeltaMsg struct{ text string }

// toolProgressMsg is a chunk of live tool output (a long build scrolling by).
// It repaints the busy status line rather than the transcript — the full
// result still arrives as one logMsg when the tool finishes.
type toolProgressMsg struct {
	name  string
	chunk string
}

// assistantMsg carries a completed assistant turn: the live streamed region is
// replaced by this final, fully-rendered text.
type assistantMsg struct{ text string }

type serveStartedMsg struct{ url string }
type serveStoppedMsg struct{}

// impactMsg carries a finished impact prediction; receiving it opens the
// interactive tree view.
type impactMsg struct{ report *impact.Report }

// compactedMsg carries a rebuilt conversation back from a compaction. The
// history is assembled off the UI goroutine and swapped in whole, so the
// automatic and the /compact paths converge on one piece of state handling.
type compactedMsg struct {
	history []llm.Message
	note    string
	// auto marks a compaction the user did not ask for, which is worth saying
	// out loud — the model is about to answer with less history than the
	// transcript above it implies.
	auto bool
}

func listen(ch chan tea.Msg) tea.Cmd {
	return func() tea.Msg { return <-ch }
}

// ---- styles ----

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

// Model is the Bubble Tea state.
type Model struct {
	repo   string
	cfg    *config.Config
	global *config.Global
	// apiKeys holds keys entered via /key this session, per provider. It must
	// be scoped by provider — a single shared value here previously meant
	// entering a key for one provider silently overrode every other
	// provider's saved key after a /provider switch.
	apiKeys map[string]string
	client  *llm.Client
	// budget shares the client's lifetime: it watches the client's cumulative
	// spend, so both reset together on a /model or /provider switch.
	budget *agent.BudgetGuard
	// prismModule is the imported-document module /prism queries against.
	// Selecting one is a session choice, not a config setting: a user moves
	// between corpora far more often than they change how retrieval works.
	prismModule string
	// prismPendingRm is the module a repeated /prism rm would delete, which is
	// the only confirmation a line-oriented interface can offer.
	prismPendingRm string
	// ctxTracker holds the provider's own measurement of the conversation's
	// size, which is what compaction decides on. It outlives the per-turn
	// Agent, and resets alongside the client — a different model tokenizes
	// differently, so a measurement taken under the old one means nothing.
	ctxTracker *agent.ContextTracker
	// dirNotes remembers which nested AGENTS.md files have been delivered, so a
	// package's rules are stated once per session rather than on every read.
	dirNotes *agent.DirNotes

	conversation []llm.Message
	autoApprove  bool
	// agentMode is the agent's permission preset (/mode). The zero value
	// behaves as build, so a fresh Model keeps the historical behavior.
	agentMode agent.Mode
	undoStack []agent.UndoEntry
	sess      *session.Session

	vp    viewport.Model
	input textarea.Model
	// keyInput is a separate single-line field used only for the hidden /key
	// prompt — textarea has no masked echo mode.
	keyInput  textinput.Model
	spin      spinner.Model
	list      list.Model
	events    chan tea.Msg
	approvals chan bool

	lines []string
	// header is the sticky top block — wordmark plus live status panel —
	// rendered above the viewport so it stays visible while the transcript
	// scrolls, mirroring the pinned composer at the bottom.
	header []string
	// committed caches the wrapped render of lines so a streaming turn does
	// not re-wrap the whole scrollback on every token. "" means stale.
	committed string
	// live is assistant prose still streaming in — shown below the committed
	// lines, then replaced by the final text when the turn completes.
	live     string
	busy     bool
	busyText string
	// busyStart drives the elapsed counter in the status line — a wiki run can
	// take minutes, and a spinner alone gives no sense of how long.
	busyStart time.Time
	mode      mode

	pal palette // slash-command completion menu
	// impactTree is the interactive /impact report view, live while the
	// model is in modeImpact.
	impactTree      *impactTree
	pendingKey      bool
	pendingApproval bool
	approval        agent.ApprovalRequest
	cancel          context.CancelFunc
	// runningAgent is the agent behind the current chat turn, kept so input
	// typed while it works can be queued as steering instead of bounced.
	runningAgent *agent.Agent

	// The wiki browser runs alongside the chat rather than blocking it.
	serveCancel context.CancelFunc
	serveURL    string

	configMissing   bool
	suggestedSkills bool // the /skills nudge is shown at most once per session
	width, height   int
	ready           bool
}

// Run starts the TUI for a repository.
func Run(repo string) error {
	if abs, err := filepath.Abs(repo); err == nil {
		repo = abs
	}
	// Extension MCP servers are child processes; quitting the TUI must never
	// leave them orphaned.
	defer ext.ShutdownAll()
	// Trusted wasm extensions that declared hooks start observing the agent
	// now, before the first turn can run.
	ext.ActivateHooks(repo, func(msg string) { fmt.Fprintln(os.Stderr, msg) })
	p := tea.NewProgram(New(repo), tea.WithAltScreen())
	_, err := p.Run()
	return err
}

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
	// Apply the configured theme before any rendering.
	if t := LookupTheme(cfg.Theme); t != nil {
		applyTheme(*t)
	}
	// Compaction budgets are the user's to tune; apply them once so every
	// auto-compaction this session uses the same thresholds.
	agent.SetCompactionSettings(cfg.Compaction.IsEnabled(),
		cfg.Compaction.ReserveTokens, cfg.Compaction.KeepRecentTokens)
	// Live tool output (run_command chunks) streams in over the agent's
	// event bus. The send never blocks: a dropped progress frame costs
	// nothing, a blocked bus handler would stall the whole agent.
	ch := m.events
	agentevents.Default.Subscribe(agentevents.ToolExecutionUpdate, func(e *agentevents.Event) {
		select {
		case ch <- toolProgressMsg{name: e.ToolName, chunk: e.Partial}:
		default:
		}
	})
	return m
}

func (m *Model) resetConversation() {
	m.conversation = []llm.Message{{
		Role: "system",
		Content: agent.SystemPrompt(agent.PromptInput{
			Root:     m.repo,
			Mode:     m.agentMode,
			Model:    m.cfg.Model,
			AllowRun: true,
			Notes:    m.cfg.Notes,
		}),
	}}
	m.sess = session.New(m.cfg.Model, m.cfg.Provider)
	m.sess.Mode = string(m.agentMode)
	// Directory rules are delivered once per conversation, so a new
	// conversation starts owing all of them again.
	m.dirNotes = agent.NewDirNotes()
}

// saveSession persists the conversation after a completed turn. Failures are
// reported once rather than silently swallowed — a session that is not being
// saved is something the user should know about.
func (m *Model) saveSession() {
	if m.sess == nil {
		return
	}
	// The reasoning level travels with the session, so a resume restores it.
	if m.client != nil {
		m.sess.Thinking = m.client.Thinking
	}
	m.sess.Record(m.conversation)
	if err := m.sess.Save(m.repo); err != nil {
		m.appendLine(dimStyle.Render("could not save session: " + err.Error()))
	}
}

// closeSession runs the experience loop at a session boundary (new/quit). It is
// non-blocking: learning, digesting, and reinforcement happen in a goroutine
// so closing or starting fresh never waits on an LLM call. The gate is the
// configured tier — /learn (startLearn with force) is the always-on escape.
func (m *Model) closeSession(force bool) {
	if m.cfg.Memory.Disable || m.sess == nil || len(m.conversation) == 0 {
		return
	}
	repo, cfg, client := m.repo, m.cfg, m.client
	sess := m.sess
	sess.Record(m.conversation)
	go func() {
		_ = memory.LearnSession(context.Background(), repo, cfg, client, sess, force)
	}()
}

func (m Model) Init() tea.Cmd {
	return tea.Batch(textinput.Blink, listen(m.events))
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd
	switch msg := msg.(type) {

	case tea.WindowSizeMsg:
		first := !m.ready
		m.width, m.height = msg.Width, msg.Height
		m.vp.Width = msg.Width
		m.input.SetWidth(max(msg.Width-3, 10))
		m.keyInput.Width = max(msg.Width-3, 10)
		m.list.SetSize(msg.Width, msg.Height)
		m.ready = true
		m.committed = "" // width changed — the cached wrap is wrong now
		// The header is rebuilt on every resize: both its layout (side-by-side
		// vs stacked vs compact) and its height feed the viewport sizing.
		m.printStatusPanel()
		if first && m.configMissing {
			m.lines = append(m.lines, warnStyle.Render("no .kaioken/config.yaml here — using defaults; /init to save"))
		}
		m.syncLayout()
		return m, nil

	case tea.KeyMsg:
		return m.onKey(msg)

	case spinner.TickMsg:
		if m.busy {
			var c tea.Cmd
			m.spin, c = m.spin.Update(msg)
			cmds = append(cmds, c)
		}
		return m, tea.Batch(cmds...)

	case logMsg:
		// A tool call or status line during a streaming turn: commit whatever
		// prose has arrived so the log stays in chronological order.
		m.flushLive("")
		m.appendLine(msg.line)
		return m, listen(m.events)

	case prismDoneMsg:
		if msg.err != nil {
			m.appendLine(errStyle.Render(msg.err.Error()))
			return m, nil
		}
		for _, l := range msg.lines {
			m.appendLine(l)
		}
		return m, nil

	case streamDeltaMsg:
		m.live += msg.text
		m.refreshViewport()
		return m, listen(m.events)

	case toolProgressMsg:
		// The newest non-empty output line becomes the status text, so a
		// two-minute build reads as motion instead of a frozen spinner.
		if m.busy {
			if line := lastOutputLine(msg.chunk); line != "" {
				m.busyText = msg.name + ": " + clip(line, 64)
			}
		}
		return m, listen(m.events)

	case assistantMsg:
		// The live region showed raw tokens as they arrived; replace it with
		// the markdown-rendered version now that the reply is complete.
		m.live = ""
		m.appendLine(renderMarkdown(msg.text, m.vp.Width))
		return m, listen(m.events)

	case busyMsg:
		m.busy = msg.on
		m.busyText = msg.text
		cmds = append(cmds, listen(m.events))
		if m.busy {
			m.busyStart = time.Now()
			cmds = append(cmds, m.spin.Tick)
		} else {
			m.cancel = nil
			m.runningAgent = nil
		}
		return m, tea.Batch(cmds...)

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

	case approvalReqMsg:
		m.showApproval(msg.req)
		return m, listen(m.events)

	case branchSummaryMsg:
		m.applyBranchSummary(msg)
		return m, listen(m.events)

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

	case draftMsg:
		m.busy = false
		if msg.err != nil {
			m.appendLine(errStyle.Render("draft: " + msg.err.Error()))
			return m, nil
		}
		m.appendLine(msg.text)
		m.appendLine(dimStyle.Render("draft only — nothing was committed · /copy to take it"))
		return m, nil

	case handoffMsg:
		m.busy = false
		if msg.err != nil {
			m.appendLine(errStyle.Render("handoff: " + msg.err.Error()))
			return m, nil
		}
		out, err := m.writeHandoff(msg.brief)
		if err != nil {
			m.appendLine(errStyle.Render("handoff: " + err.Error()))
			return m, nil
		}
		m.appendLine(okStyle.Render("handoff briefing → " + out))
		return m, nil

	case modelsFetchedMsg:
		m.busy = false
		if msg.err != nil {
			m.appendLine(errStyle.Render("could not fetch models: " + msg.err.Error()))
			return m, nil
		}
		items := make([]list.Item, 0, len(msg.models))
		for _, md := range msg.models {
			items = append(items, modelItem{id: md.ID, name: md.Name})
		}
		// The picker is shared with /resume, so re-title it each time. Naming
		// the provider here matters: this list is fetched from whichever
		// provider's client is currently active, and that is easy to lose
		// track of after a /provider switch.
		m.list.Title = "Select a model (" + m.cfg.Provider + ") — type to filter, enter to choose, esc to cancel"
		m.list.SetItems(items)
		m.list.SetSize(m.width, m.height)
		m.mode = modePicker
		return m, nil

	case extRegistryFetchedMsg:
		m.busy = false
		if msg.err != nil {
			m.appendLine(errStyle.Render("could not fetch the extension registry: " + msg.err.Error()))
			m.appendLine(dimStyle.Render("direct install still works: /ext install owner/repo"))
			return m, nil
		}
		items := make([]list.Item, 0, len(msg.entries))
		for _, e := range msg.entries {
			// The kill switch reaches the browse UI too: a flagged extension
			// must not be offered, not merely refused later.
			if extFlaggedMalicious(e) {
				continue
			}
			items = append(items, extItem{id: e.ID, repo: e.Repo, tier: e.TierLabel(), desc: e.Description})
		}
		if len(items) == 0 {
			m.appendLine(dimStyle.Render("the community registry has no extensions yet — /ext install owner/repo works directly"))
			return m, nil
		}
		m.list.Title = "Browse community extensions — type to filter, enter to install, esc to cancel"
		m.list.SetItems(items)
		m.list.SetSize(m.width, m.height)
		m.mode = modePicker
		return m, nil

	case serveStartedMsg:
		m.serveURL = msg.url
		m.appendLine(okStyle.Render("wiki browser: " + msg.url))
		m.appendLine(dimStyle.Render("open it in a browser · /serve stop to end it"))
		return m, listen(m.events)

	case impactMsg:
		m.openImpactTree(msg.report)
		return m, listen(m.events)

	case serveStoppedMsg:
		m.serveCancel = nil
		m.serveURL = ""
		return m, listen(m.events)

	case undoRecordMsg:
		m.undoStack = append(m.undoStack, msg.entry)
		return m, listen(m.events)

	case compactedMsg:
		m.conversation = msg.history
		if m.sess != nil {
			m.sess.AddEpoch("compaction", string(m.agentMode), msg.note)
		}
		if msg.auto {
			m.appendLine(dimStyle.Render("context was filling up — " + msg.note))
		} else {
			m.appendLine(okStyle.Render(msg.note))
		}
		return m, listen(m.events)

	default:
		var c tea.Cmd
		m.input, c = m.input.Update(msg)
		return m, c
	}
}

func (m Model) onKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	key := msg.String()

	// Model picker mode.
	if m.mode == modePicker {
		switch key {
		case "esc", "ctrl+c":
			m.mode = modeChat
			return m, nil
		case "enter":
			// The picker is reused for models, sessions and extensions; the
			// item type says which.
			switch it := m.list.SelectedItem().(type) {
			case modelItem:
				m.mode = modeChat
				m.setModel(it.id)
			case sessionItem:
				m.mode = modeChat
				m.resumeSession(it.id)
			case extItem:
				m.mode = modeChat
				return m.startExtInstall(it.repo)
			}
			return m, nil
		default:
			var c tea.Cmd
			m.list, c = m.list.Update(msg)
			return m, c
		}
	}

	// Impact tree view: all keys drive the tree until it is closed.
	if m.mode == modeImpact {
		return m.onImpactKey(key)
	}

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

	// ctrl+d quits, following the shell convention — and only on an empty line,
	// so a half-typed message is never lost to a stray keystroke.
	if key == "ctrl+d" {
		if strings.TrimSpace(m.input.Value()) != "" {
			m.appendLine(dimStyle.Render("clear the input first (ctrl+c), then ctrl+d to quit"))
			return m, nil
		}
		return m, tea.Quit
	}

	// ctrl+c / esc stop a running task. When nothing is running, ctrl+c clears
	// the composer; quitting is ctrl+d.
	if key == "ctrl+c" {
		switch {
		case m.busy:
			m.stopCurrent()
		case strings.TrimSpace(m.input.Value()) != "":
			m.input.Reset()
			m.refreshPalette()
			m.syncLayout()
		default:
			m.appendLine(dimStyle.Render("nothing to stop — ctrl+d to quit"))
		}
		return m, nil
	}
	if key == "esc" && m.busy {
		m.stopCurrent()
		return m, nil
	}

	// Hidden API-key entry uses its own masked single-line field.
	if m.pendingKey {
		if key == "enter" {
			return m.onEnter()
		}
		var c tea.Cmd
		m.keyInput, c = m.keyInput.Update(msg)
		return m, c
	}

	switch key {
	case "enter":
		return m.onEnter()
	case "ctrl+p":
		// Cycle through the configured scoped models. The palette owns ctrl+p
		// while it is open (handled above), so this only fires in plain chat.
		m.cycleModel()
		return m, nil
	case "pgup", "pgdown":
		var c tea.Cmd
		m.vp, c = m.vp.Update(msg)
		return m, c
	case "up", "down":
		// While the composer is a single line there is no cursor to move, so
		// the arrows scroll the transcript. Once it is multi-line they belong
		// to the editor.
		if m.input.LineCount() <= 1 {
			var c tea.Cmd
			m.vp, c = m.vp.Update(msg)
			return m, c
		}
		fallthrough
	default:
		var c tea.Cmd
		m.input, c = m.input.Update(msg)
		// Typing changes both the completion candidates and, when a line wraps
		// or is added, the composer height.
		m.refreshPalette()
		m.syncLayout()
		return m, c
	}
}

// doQueue reports or clears the steering messages queued behind a running
// chat turn.
func (m *Model) doQueue(arg string) {
	if m.runningAgent == nil {
		m.appendLine(dimStyle.Render("no chat turn is running — nothing is queued"))
		return
	}
	n := m.runningAgent.QueuedCount()
	if strings.EqualFold(strings.TrimSpace(arg), "clear") {
		m.runningAgent.ClearQueues()
		m.appendLine(okStyle.Render(fmt.Sprintf("dropped %d queued message(s)", n)))
		return
	}
	switch n {
	case 0:
		m.appendLine(dimStyle.Render("queue is empty — type while the agent works to steer it"))
	default:
		m.appendLine(dimStyle.Render(fmt.Sprintf("%d message(s) queued — /queue clear to drop them", n)))
	}
}

// doBTW records an aside: something the agent should know, with nothing asked
// of it. No turn starts — the message joins the conversation and the model
// reads it when it next replies. While a chat turn is in flight the aside goes
// through the steering queue instead, because Run owns the conversation for
// the duration and appending to m.conversation there would be overwritten by
// the history the run returns.
func (m *Model) doBTW(text string) {
	aside := agent.Aside(text)
	if aside == "" {
		m.appendLine(dimStyle.Render("usage: /btw <something the agent should know> — noted, no reply"))
		return
	}
	if m.runningAgent != nil {
		m.runningAgent.Steer(aside)
		m.echoAside(text, "noted — reaches the agent after its current step")
		return
	}
	m.conversation = append(m.conversation, llm.Message{Role: "user", Content: aside})
	m.echoAside(text, "noted — the agent will see it on its next reply")
	m.saveSession()
}

// echoAside renders an aside in the transcript. Deliberately not the "›"
// prompt of a real message: nothing was asked, so it should not read like a
// turn that is waiting for an answer.
func (m *Model) echoAside(text, note string) {
	m.appendLine("")
	for i, l := range strings.Split(strings.TrimSpace(text), "\n") {
		prefix := dimStyle.Render("btw ")
		if i > 0 {
			prefix = gutterStyle.Render("    ")
		}
		m.appendLine(prefix + userStyle.Render(l))
	}
	m.appendLine(gutterStyle.Render("    ") + dimStyle.Render(note))
}

// stopCurrent cancels whatever is running (chat turn, plan/generate/wiki/
// compact) without quitting the app. Safe to call when nothing is running.
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

func (m Model) View() string {
	if !m.ready {
		return "starting kaioken…"
	}
	if m.mode == modePicker {
		return m.list.View()
	}
	if m.mode == modeImpact {
		return m.impactView()
	}
	// The wordmark + status panel is a sticky top block (rebuilt on resize
	// and on /model, /provider, /key changes), so repo/model/provider/key stay
	// in view while the transcript scrolls — the top counterpart of the
	// pinned composer. Busy/yolo state shows in the footer hint.
	view := m.vp.View()
	if len(m.header) > 0 {
		view = strings.Join(m.header, "\n") + "\n" + view
	}
	return view + "\n" + m.paletteView() + m.footer()
}

// ---- rendering ----

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

// statusLine is the single row under the composer: which keys are live on the
// left, which session you are in on the right. It is always exactly one row so
// the layout never shifts under the user.
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

// sessionStatus is the right-hand readout: mode, model and spend. The banner
// at the top of the scrollback says the same things once, but it scrolls away
// — this stays.
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
		if usd, known := m.client.CostUSD(); known && usd > 0 {
			parts = append(parts, fmt.Sprintf("$%.2f", usd))
		}
	}
	out := hintStyle.Render(strings.Join(parts, " · "))
	if fill := m.contextFill(); fill != "" {
		out = fill + hintStyle.Render(" · ") + out
	}
	if m.autoApprove {
		// yolo means edits land without asking — it should never be subtle.
		out = warnStyle.Render("yolo") + hintStyle.Render(" · ") + out
	}
	return out
}

// contextFill renders how full the context is, as a percentage of the space a
// conversation may occupy before it is automatically reduced — not of the raw
// window, which would read low right up to the moment compaction fires.
//
// It stays hidden below halfway. An empty session sitting at 3% is noise, and
// the only decision this number informs — whether to /compact or start fresh
// before a long task — does not arise until the context is genuinely filling.
// Once it appears, the color tracks urgency: dim, then warning as automatic
// reduction approaches.
func (m Model) contextFill() string {
	if m.cfg == nil || len(m.conversation) == 0 {
		return ""
	}
	usable := agent.Usable(m.cfg.Model, m.cfg.MaxTokens)
	if usable <= 0 {
		return ""
	}
	pct := llm.EstimateTokens(m.conversation) * 100 / usable
	if pct < 50 {
		return ""
	}
	if pct > 100 {
		pct = 100
	}
	label := fmt.Sprintf("ctx %d%%", pct)
	if pct >= 80 {
		return warnStyle.Render(label)
	}
	return hintStyle.Render(label)
}

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

func (m *Model) appendLine(s string) {
	m.lines = append(m.lines, s)
	m.committed = "" // scrollback changed — re-wrap on the next refresh
	m.refreshViewport()
}

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

// maxInputRows caps how tall the composer grows before it scrolls internally.
const maxInputRows = 8

// inputHeight is how many rows the composer currently needs.
func (m Model) inputHeight() int {
	if m.pendingKey {
		return 1
	}
	n := m.input.LineCount()
	if n < 1 {
		n = 1
	}
	if n > maxInputRows {
		n = maxInputRows
	}
	return n
}

// syncLayout re-sizes the viewport between the sticky header and the
// composer, which grows and shrinks as the user types a multi-line message.
func (m *Model) syncLayout() {
	if !m.ready {
		return
	}
	h := m.inputHeight()
	m.input.SetHeight(h)
	// header rows + composer rows + one hint line, plus the palette when open
	m.vp.Height = max(m.height-len(m.header)-h-1-m.paletteHeight(), 1)
	m.refreshViewport()
}

// flushLive commits a partially streamed reply to the scrollback — used when a
// turn is cancelled or fails before the model sends its final message, so the
// text the user already watched arrive does not vanish.
func (m *Model) flushLive(note string) {
	if m.live == "" {
		return
	}
	text := m.live
	m.live = ""
	m.appendLine(assistantStyle.Render(text))
	if note != "" {
		m.appendLine(dimStyle.Render(note))
	}
}

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

// ---- input handling ----

func (m Model) onEnter() (tea.Model, tea.Cmd) {
	if m.pendingKey {
		val := m.keyInput.Value()
		m.pendingKey = false
		m.keyInput.SetValue("")
		m.input.Focus()
		m.syncLayout()
		if k := strings.TrimSpace(val); k != "" {
			m.setSessionKey(k)
			m.persistKey(k)
			if e := m.rebuildClient(); e != "" {
				m.appendLine(errStyle.Render("key saved but " + e))
			}
			m.printStatusPanel()
		}
		return m, nil
	}

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

// ---- chat ----

func (m Model) startChat(text string) (tea.Model, tea.Cmd) {
	if m.client == nil {
		return m.needKey()
	}
	if m.busy {
		// A chat turn is running: queue the message as steering — it reaches
		// the model after the current step, no cancel required. Other busy
		// work (wiki, scan, …) has no conversation to steer.
		if m.runningAgent != nil {
			m.runningAgent.Steer(text)
			m.appendLine("")
			for i, l := range strings.Split(text, "\n") {
				prefix := busyPromptStyle.Render("» ")
				if i > 0 {
					prefix = gutterStyle.Render("  ")
				}
				m.appendLine(prefix + userStyle.Render(l))
			}
			m.appendLine(dimStyle.Render("  queued — reaches the agent after its current step"))
			return m, nil
		}
		m.appendLine(warnStyle.Render("busy — wait, or /stop (esc/ctrl+c) to cancel"))
		return m, nil
	}
	m.appendLine("")
	// Echo every line of a multi-line prompt, not just the first. Only the
	// first row gets the arrow; the rest are indented under it so a pasted
	// stack trace reads as one message.
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
		Client:         m.client,
		Root:           m.repo,
		UI:             ui,
		AutoApprove:    m.autoApprove,
		AllowRun:       true,
		MaxSteps:       25,
		Mode:           m.agentMode,
		MemoryDisabled: m.cfg.Memory.Disable,
		Budget:         m.budget,
		Context:        m.ctxTracker,
		Notes:          m.dirNotes,
		Config:         m.cfg,
	}
	conv := m.conversation
	ch := m.events
	m.runningAgent = ag
	client, model, ceiling := m.client, m.cfg.Model, m.cfg.MaxTokens
	tracker := m.ctxTracker
	go func() {
		// Shrink the context before the turn rather than after a provider
		// rejects it. Overflow is not recoverable in place: by the time the
		// request fails, the user's message is already inside a history too
		// large to send, so the only way forward is to make it smaller — do
		// that first, while the failure is still hypothetical.
		//
		// Two steps, cheapest first. Pruning erases the bodies of stale tool
		// results for free and keeps the whole conversation; summarizing costs
		// a model call and replaces it. Most turns never need the second.
		if need, used := agent.ShouldCompact(tracker, conv, model, ceiling); need && agent.CompactionEnabled() {
			if pruned, freed, note := agent.Prune(conv, model, ceiling); freed > 0 {
				conv = pruned
				ch <- compactedMsg{history: pruned, note: note, auto: true}
				used -= freed
			}
			if still, _ := agent.ShouldCompact(tracker, conv, model, ceiling); still {
				ch <- busyMsg{true, "compacting context"}
				compacted, note, err := agent.Compact(ctx, routedClient(client, m.cfg, "compact"), conv, model, ceiling)
				if err == nil {
					conv = compacted
					ch <- compactedMsg{history: compacted, note: note, auto: true}
				} else if ctx.Err() == nil {
					// A failed compaction is not fatal — the turn may still
					// fit. Say so and continue rather than losing the message.
					ch <- logMsg{dimStyle.Render(fmt.Sprintf(
						"context is large (~%d tokens) and auto-compaction failed: %v", used, err))}
				}
			}
		}
		ch <- busyMsg{true, "thinking"}
		hist, err := ag.Run(ctx, conv)
		ch <- agentDoneMsg{hist, err}
		ch <- busyMsg{false, ""}
	}()
	return m, nil
}

// ---- command dispatch ----

func (m Model) dispatch(raw string) (tea.Model, tea.Cmd) {
	raw = strings.TrimSpace(raw)
	body := strings.TrimPrefix(raw, "/")
	fields := strings.Fields(body)
	if len(fields) == 0 {
		return m, nil
	}
	name := strings.ToLower(fields[0])
	args := fields[1:]
	rest := strings.TrimSpace(body[len(fields[0]):])

	if name == "key" && rest != "" {
		m.appendLine(userStyle.Render("› /key ********"))
	} else {
		m.appendLine(userStyle.Render("› " + raw))
	}

	// /t:<name> is the template family, not a fixed command — the name after
	// the colon selects the file.
	if strings.HasPrefix(name, "t:") {
		return m.runTemplate(strings.TrimPrefix(name, "t:"), rest)
	}

	switch name {
	case "tutorial", "guide", "manual":
		for _, l := range tutorialLines(rest) {
			m.appendLine(l)
		}
	case "explain":
		for _, l := range explainLines(rest) {
			m.appendLine(l)
		}
	case "help", "h", "?":
		m.appendLine(helpText)
		m.appendLine(dimStyle.Render("\n/tutorial explains each of these with examples · /explain goes deeper."))
	case "quit", "exit", "q":
		m.closeSession(false) // learn+digest the session before leaving
		return m, tea.Quit
	case "clear", "cls":
		m.lines = nil
		m.refreshViewport()
	case "reset", "new":
		m.closeSession(false) // learn+digest the previous session, then start fresh
		m.saveSession()       // keep what was there before starting fresh
		m.resetConversation()
		m.undoStack = nil
		m.appendLine(dimStyle.Render("new session started — /resume to reopen the previous one"))
	case "sessions":
		m.listSessions()
	case "session":
		m.showSessionStats()
	case "resume":
		if rest == "" {
			return m.openSessionPicker()
		}
		m.resumeSession(rest)
	case "switch":
		var openPicker bool
		m, openPicker = m.doSwitch(rest)
		if openPicker {
			return m.openSessionPicker()
		}
	case "import":
		m.doImport(rest)
	case "stop":
		m.stopCurrent()
	case "queue":
		m.doQueue(rest)
	case "btw":
		m.doBTW(rest)
	case "tree":
		m.doTree(rest)
	case "fork":
		m.doFork(rest)
	case "undo":
		m.doUndo()
	case "diff":
		return m.startDiff()
	case "cost", "usage":
		m.showCost()
	case "compact":
		return m.startCompact()
	case "learn":
		return m.startLearn(true)
	case "copy":
		m.doCopy()
	case "version", "v":
		m.appendLine(fmt.Sprintf("Kaioken v%s   (%s, %s/%s)", version.Version, runtime.Version(), runtime.GOOS, runtime.GOARCH))
	case "yolo":
		m.autoApprove = !m.autoApprove
		if m.autoApprove {
			m.appendLine(warnStyle.Render("auto-approve ON — edits and commands will NOT ask first"))
		} else {
			m.appendLine(okStyle.Render("auto-approve OFF — changes require confirmation"))
		}
	case "mode":
		m.doMode(rest)
	case "config":
		for _, l := range m.configLines() {
			m.appendLine(l)
		}
	case "prism":
		return m.doPrism(args, rest)
	case "model":
		if rest == "" {
			return m.openModelPicker()
		}
		if strings.EqualFold(rest, "list") {
			return m.startModels("")
		}
		m.setModel(rest)
	case "fetcher":
		m.doFetcher(args)
	case "thinking":
		m.doThinking(rest)
	case "theme":
		m.doTheme(rest)
	case "provider":
		m.setProvider(rest)
	case "key":
		return m.setKey(rest)
	case "repo":
		m.setRepo(rest)
	case "notes":
		m.notes(args, rest)
	case "init":
		return m.startInit(args)
	case "scan":
		return m.startScan()
	case "plan":
		return m.startPlan()
	case "wiki":
		if len(args) > 0 {
			switch strings.ToLower(args[0]) {
			case "update":
				return m.startWikiUpdate(args[1:])
			case "retry":
				return m.startWikiRetry()
			}
		}
		return m.startWiki(args)
	case "generate", "gen":
		return m.startGenerate(args)
	case "update":
		return m.startWikiUpdate(args)
	case "cards":
		return m.startGenerate(args)
	case "skills", "skill":
		return m.startSkills(args)
	case "impact", "imp":
		return m.startImpact(rest)
	case "research":
		return m.startResearch(rest)
	case "ext", "extension", "extensions":
		return m.doExt(args)
	case "x":
		m.doExtCommand(rest)
	case "templates", "template":
		m.listTemplates()
	case "serve":
		return m.startServe(args)
	case "publish":
		return m.startPublish()
	case "onboard":
		return m.startOnboard(args)
	case "draft":
		return m.startDraft(rest)
	case "handoff":
		return m.startHandoff()
	case "verify":
		return m.startVerify()
	case "hook":
		m.doHook(args)
	case "status":
		return m.startStatus()
	case "models":
		return m.startModels(rest)
	default:
		m.appendLine(errStyle.Render("unknown command: " + name + "   (/help)"))
	}
	return m, nil
}

// ---- settings commands ----

func (m Model) openModelPicker() (tea.Model, tea.Cmd) {
	if m.client == nil {
		return m.needKey()
	}
	m.busy = true
	m.busyText = "fetching models"
	client := m.client
	return m, tea.Batch(
		func() tea.Msg {
			models, err := client.ListModels(context.Background(), "")
			return modelsFetchedMsg{models, err}
		},
		m.spin.Tick,
	)
}

func (m *Model) setModel(id string) {
	m.cfg.Model = id
	m.saveCfg()
	m.persistDefaults()
	m.rebuildClient()
	m.appendLine(okStyle.Render("model → " + id + "  (saved)"))
	m.printStatusPanel()
}

func (m *Model) setProvider(name string) {
	if name == "" || strings.EqualFold(name, "list") {
		m.listProviders()
		return
	}
	name = strings.ToLower(name)
	prov, ok := llm.Providers[name]
	if !ok {
		m.appendLine(errStyle.Render("unknown provider: " + name))
		m.listProviders()
		return
	}
	m.cfg.Provider = name
	m.cfg.BaseURL = ""
	m.saveCfg()
	m.persistDefaults()
	if e := m.rebuildClient(); e != "" {
		m.appendLine(warnStyle.Render("provider → " + name + " — " + e))
		m.appendLine(dimStyle.Render("set " + prov.KeyEnv + ", or save a key with /key"))
	} else {
		m.appendLine(okStyle.Render("provider → " + name + "  (saved)"))
	}
	m.printStatusPanel()
}

// printStatusPanel refreshes the sticky header so a /model, /provider or
// /key change shows up at once in the always-visible status panel at the top
// of the screen — no reprint into the scrollback needed anymore, since the
// header is rendered from live state rather than drawn once as history.
func (m *Model) printStatusPanel() {
	m.header = stickyHeader(m.cfg, m.repo, m.client != nil, m.width, m.height)
	// Build is the default and shows nothing; any other mode gets one short
	// indicator row so a read-only session cannot be mistaken for a normal one.
	if m.agentMode != "" && m.agentMode != agent.ModeBuild {
		m.header = append(m.header, warnStyle.Render("mode "+string(m.agentMode)))
	}
}

// listProviders prints all available providers with their details.
func (m *Model) listProviders() {
	var names []string
	for k := range llm.Providers {
		names = append(names, k)
	}
	sort.Strings(names)

	m.appendLine("")
	m.appendLine(promptStyle.Render("Available providers") + dimStyle.Render("  (current: "+m.cfg.Provider+")"))
	m.appendLine(dimStyle.Render(strings.Repeat("─", 52)))

	// Align columns.
	nameW, urlW := 0, 0
	for _, n := range names {
		if len(n) > nameW {
			nameW = len(n)
		}
		if len(llm.Providers[n].BaseURL) > urlW {
			urlW = len(llm.Providers[n].BaseURL)
		}
	}

	for _, n := range names {
		p := llm.Providers[n]
		marker := "  "
		if n == m.cfg.Provider {
			marker = okStyle.Render("● ")
		}
		name := pad(n, nameW+2)
		url := pad(p.BaseURL, urlW+2)
		key := p.KeyEnv

		// Show whether a key is available.
		keyStatus := dimStyle.Render(key)
		hasKey := false
		if m.global != nil && m.global.Keys[n] != "" {
			hasKey = true
		} else if os.Getenv(key) != "" {
			hasKey = true
		}
		if hasKey {
			keyStatus = okStyle.Render(key + " ✓")
		}

		m.appendLine(marker + name + dimStyle.Render(url) + "  " + keyStatus)
	}
	m.appendLine(dimStyle.Render("\n/provider <name> to switch · /key to save a key"))
}

func (m Model) setKey(val string) (tea.Model, tea.Cmd) {
	// Trim: a pasted key with trailing whitespace produces a header the
	// provider rejects with a confusing 401 (the hidden-prompt path already
	// trims; the inline `/key <value>` path must behave the same).
	if val = strings.TrimSpace(val); val != "" {
		m.setSessionKey(val)
		m.persistKey(val)
		if e := m.rebuildClient(); e != "" {
			m.appendLine(errStyle.Render("key saved but " + e))
		}
		m.printStatusPanel()
		return m, nil
	}
	m.pendingKey = true
	m.keyInput.SetValue("")
	m.keyInput.Focus()
	m.appendLine(dimStyle.Render("enter API key — input is hidden"))
	m.syncLayout()
	return m, nil
}

func (m *Model) setRepo(path string) {
	if path == "" {
		m.appendLine("current repo: " + m.repo)
		return
	}
	if abs, err := filepath.Abs(path); err == nil {
		path = abs
	}
	m.repo = path
	if cfg, err := config.Load(path); err == nil {
		m.cfg = cfg
	} else {
		m.cfg = config.Default()
		m.appendLine(warnStyle.Render("no .kaioken/config.yaml in repo — defaults loaded (/init to save)"))
	}
	m.resetConversation()
	m.rebuildClient()
	m.appendLine(okStyle.Render("repo → " + shortPath(path)))
}

func (m *Model) notes(args []string, rest string) {
	sub := ""
	if len(args) > 0 {
		sub = strings.ToLower(args[0])
	}
	switch sub {
	case "add":
		text := strings.TrimSpace(strings.TrimPrefix(rest, args[0]))
		if text == "" {
			m.appendLine(warnStyle.Render("usage: /notes add <text>"))
			return
		}
		m.cfg.Notes = append(m.cfg.Notes, text)
		m.saveCfg()
		m.appendLine(okStyle.Render(fmt.Sprintf("added steering note #%d", len(m.cfg.Notes))))
	case "clear":
		m.cfg.Notes = nil
		m.saveCfg()
		m.appendLine(okStyle.Render("steering notes cleared"))
	default:
		if len(m.cfg.Notes) == 0 {
			m.appendLine(dimStyle.Render("no steering notes — add with /notes add <text>"))
			return
		}
		for i, n := range m.cfg.Notes {
			m.appendLine(fmt.Sprintf("  %d. %s", i+1, n))
		}
	}
}

// startInit runs the full first-run setup for the current repo: save the
// config, scan, and write AGENTS.md. Usage: /init [force]
func (m Model) startInit(args []string) (tea.Model, tea.Cmd) {
	if m.guardBusy() {
		return m.busyNote()
	}
	force := false
	for _, a := range args {
		if strings.EqualFold(a, "force") || a == "--force" || a == "-f" {
			force = true
		}
	}

	// The config is written synchronously so the rest of the session — and the
	// background goroutine below — see the same on-disk state.
	if _, err := os.Stat(config.Path(m.repo)); err != nil {
		if err := m.cfg.Save(m.repo); err != nil {
			m.appendLine(errStyle.Render(err.Error()))
			return m, nil
		}
		m.appendLine(okStyle.Render("✓ created " + config.Path(m.repo)))
	} else {
		m.appendLine(dimStyle.Render("· " + config.Path(m.repo) + " already exists — kept as is"))
	}

	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	repo, cfg, client, ch := m.repo, m.cfg, m.client, m.events
	go func() {
		ch <- busyMsg{true, "setting up"}
		pg := agentsmd.Progress{
			Info:    func(t string) { ch <- logMsg{dimStyle.Render("  " + t)} },
			Started: func(w string) { ch <- logMsg{toolStyle.Render("  → " + w)} },
			Wrote: func(p string, lines int) {
				ch <- logMsg{okStyle.Render(fmt.Sprintf("  ✓ %s (%d lines)", p, lines))}
			},
			Failed: func(w string, err error) {
				ch <- logMsg{errStyle.Render("  ✗ " + w + ": " + err.Error())}
			},
		}
		res, err := setup.Run(ctx, repo, cfg, client, setup.Options{Force: force}, pg)
		if err == nil {
			if res.AgentsSkipped != "" {
				ch <- logMsg{dimStyle.Render("  · " + res.AgentsSkipped)}
			}
			ch <- logMsg{dimStyle.Render("next:")}
			for _, s := range setup.NextSteps(repo) {
				ch <- logMsg{dimStyle.Render("  " + s)}
			}
		}
		ch <- doneMsg{"init", err}
		ch <- busyMsg{false, ""}
	}()
	return m, nil
}

// ---- utility commands ----

// doUndo reverts the most recent write_file/edit_file the agent applied.
// Repeated /undo calls walk further back through the session's edit history.
func (m *Model) doUndo() {
	if len(m.undoStack) == 0 {
		m.appendLine(dimStyle.Render("nothing to undo"))
		return
	}
	e := m.undoStack[len(m.undoStack)-1]
	m.undoStack = m.undoStack[:len(m.undoStack)-1]
	if err := agent.Restore(m.repo, e); err != nil {
		m.appendLine(errStyle.Render("undo failed: " + err.Error()))
		return
	}
	if e.HadPrevious {
		m.appendLine(okStyle.Render("↺ reverted " + e.Path))
	} else {
		m.appendLine(okStyle.Render("↺ removed " + e.Path + " (was newly created)"))
	}
}

// startDiff shows `git diff` for the repo's working tree — read-only, no
// approval needed.
func (m Model) startDiff() (tea.Model, tea.Cmd) {
	if m.guardBusy() {
		return m.busyNote()
	}
	repo, ch := m.repo, m.events
	go func() {
		ch <- busyMsg{true, "git diff"}
		cmd := exec.Command("git", "-C", repo, "diff", "--color=never")
		out, err := cmd.CombinedOutput()
		text := string(out)
		switch {
		case err != nil && strings.TrimSpace(text) == "":
			ch <- logMsg{warnStyle.Render("not a git repository, or git is unavailable")}
		case strings.TrimSpace(text) == "":
			ch <- logMsg{dimStyle.Render("no uncommitted changes")}
		default:
			for _, l := range strings.Split(strings.TrimRight(text, "\n"), "\n") {
				switch {
				case strings.HasPrefix(l, "+") && !strings.HasPrefix(l, "+++"):
					ch <- logMsg{diffAddStyle.Render(l)}
				case strings.HasPrefix(l, "-") && !strings.HasPrefix(l, "---"):
					ch <- logMsg{diffDelStyle.Render(l)}
				default:
					ch <- logMsg{dimStyle.Render(l)}
				}
			}
		}
		ch <- doneMsg{"", nil}
		ch <- busyMsg{false, ""}
	}()
	return m, nil
}

// doThinking sets or shows the reasoning level requested from the model.
func (m *Model) doThinking(arg string) {
	if m.client == nil {
		m.appendLine(dimStyle.Render("no active client — set a key first"))
		return
	}
	arg = strings.ToLower(strings.TrimSpace(arg))
	if arg == "" {
		cur := m.client.Thinking
		if cur == "" {
			cur = "off"
		}
		m.appendLine(dimStyle.Render("thinking: " + cur + " — /thinking off|low|medium|high"))
		return
	}
	if !llm.ValidThinkingLevel(arg) {
		m.appendLine(errStyle.Render("unknown level — /thinking off|low|medium|high"))
		return
	}
	m.client.Thinking = arg
	if arg == "off" {
		m.appendLine(okStyle.Render("thinking off — requests carry no reasoning parameters"))
		return
	}
	m.appendLine(okStyle.Render("thinking " + arg + " — applied where the endpoint supports it " +
		"(OpenRouter, OpenAI, Anthropic); reasoning models spend more tokens per reply"))
}

// showCost prints cumulative call/token counts — and, when the provider
// reports it, real spend — for the active client.
func (m *Model) showCost() {
	if m.client == nil {
		m.appendLine(dimStyle.Render("no active client"))
		return
	}
	calls, pt, ct := m.client.Usage()
	m.appendLine(fmt.Sprintf("  calls: %d   prompt tokens: %d   completion tokens: %d   total: %d",
		calls, pt, ct, pt+ct))
	if read, write := m.client.CacheUsage(); read+write > 0 {
		m.appendLine(dimStyle.Render(fmt.Sprintf("  cache: %d tokens read · %d written", read, write)))
	}
	if usd, exact, known := m.client.SpendUSD(); known {
		label := "spend"
		if !exact {
			label = "spend (estimated from catalog prices)"
		}
		line := fmt.Sprintf("  %s: $%.4f", label, usd)
		if m.cfg != nil && (m.cfg.Budget.WarnAt > 0 || m.cfg.Budget.HardStop > 0) {
			line += dimStyle.Render(fmt.Sprintf("   (budget: warn $%.2f · stop $%.2f)",
				m.cfg.Budget.WarnAt, m.cfg.Budget.HardStop))
		}
		m.appendLine(line)
	} else if m.cfg != nil && (m.cfg.Budget.WarnAt > 0 || m.cfg.Budget.HardStop > 0) {
		m.appendLine(dimStyle.Render("  budget set, but this provider reports no cost — guardrails inactive"))
	}
	m.appendLine(dimStyle.Render("resets when you switch /model or /provider"))
}

// startCompact summarizes the conversation via the LLM and replaces the
// history with system prompt + summary + the most recent turns, freeing up
// context. The summarizing itself lives in internal/agent so this path and the
// automatic one before a turn cannot drift apart.

// routedClient returns the session client retargeted at the model the config
// maps to role, or the client itself when the role is unrouted. Fresh usage
// counters per routed model keep each role's spend legible in /cost.
func routedClient(client *llm.Client, cfg *config.Config, role string) *llm.Client {
	if cfg == nil {
		return client
	}
	if m := cfg.ResolveModel(role); m != "" && m != client.Model {
		return client.WithModel(m)
	}
	return client
}

func (m Model) startCompact() (tea.Model, tea.Cmd) {
	if m.client == nil {
		return m.needKey()
	}
	if m.guardBusy() {
		return m.busyNote()
	}
	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	client, conv, ch := m.client, m.conversation, m.events
	model, ceiling := m.cfg.Model, m.cfg.MaxTokens
	go func() {
		ch <- busyMsg{true, "compacting"}
		history, note, err := agent.Compact(ctx, routedClient(client, m.cfg, "compact"), conv, model, ceiling)
		if err != nil {
			ch <- doneMsg{"compact", err}
			ch <- busyMsg{false, ""}
			return
		}
		ch <- compactedMsg{history: history, note: note}
		ch <- busyMsg{false, ""}
	}()
	return m, nil
}

// startLearn runs the experience loop on the current session: reinforce the
// skills it consulted, write a digest for recall, and (when the gate fires or
// force is true) distill a skill. An explicit /learn passes force=true so the
// user can always learn on demand regardless of the configured multiplier.
// Session-end learning calls it with force=false so the tier config decides.
func (m Model) startLearn(force bool) (tea.Model, tea.Cmd) {
	if m.client == nil {
		return m.needKey()
	}
	if m.sess == nil || len(m.conversation) == 0 {
		m.appendLine(dimStyle.Render("nothing to learn from an empty session"))
		return m, nil
	}
	if m.guardBusy() {
		return m.busyNote()
	}
	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	repo, cfg, client, ch := m.repo, m.cfg, m.client, m.events
	sess := m.sess
	sess.Record(m.conversation)
	go func() {
		ch <- busyMsg{true, "learning"}
		res := memory.LearnSession(ctx, repo, cfg, client, sess, force)
		if res.Err != nil {
			ch <- logMsg{warnStyle.Render("learn: " + res.Err.Error())}
		}
		if len(res.Reinforced) > 0 {
			ch <- logMsg{dimStyle.Render(fmt.Sprintf(
				"reinforced %d skill(s): %s", len(res.Reinforced), strings.Join(res.Reinforced, ", ")))}
		}
		if res.Digest != nil {
			ch <- logMsg{dimStyle.Render("wrote session digest for /recall")}
		}
		if res.Distill != nil && res.Distill.Skill != "" {
			verb := "learned"
			if res.Distill.Patched {
				verb = "patched"
			}
			ch <- logMsg{okStyle.Render(fmt.Sprintf(
				"%s skill %s (signals: %s)", verb, res.Distill.Skill,
				strings.Join(signalStrings(res.Distill.Signals), ", ")))}
		} else if res.Distill != nil && force && len(res.Distill.Signals) == 0 {
			ch <- logMsg{dimStyle.Render("no lessons strong enough to distill a skill")}
		}
		ch <- busyMsg{false, ""}
	}()
	return m, nil
}

func signalStrings(s []memory.Signal) []string {
	out := make([]string, len(s))
	for i, v := range s {
		out[i] = string(v)
	}
	return out
}

// modeSummary is the one-line description shown by /mode and the header.
func modeSummary(md agent.Mode) string {
	switch md {
	case agent.ModePlan:
		return "read-only — propose changes as text, no edits or commands"
	case agent.ModeGeneral:
		return "full toolset, but every repo-changing action asks first"
	case agent.ModeExplore:
		return "read-only — search and explain the codebase"
	case agent.ModeReview:
		return "read-only — code review, security audits and diff analysis"
	case agent.ModePrism:
		return "grounded retrieval — automatically answer using imported PRISM documents"
	default:
		return "full access — write, edit and run tools (default)"
	}
}

// doMode reports or switches the agent's permission mode. A mid-conversation
// switch injects a context update so the model knows its toolset changed.
func (m *Model) doMode(arg string) {
	cur := m.agentMode
	if cur == "" {
		cur = agent.ModeBuild
	}
	if arg == "" {
		m.appendLine("current mode: " + string(cur))
		for _, md := range agent.AllModes() {
			marker := "  "
			if md == cur {
				marker = okStyle.Render("● ")
			}
			m.appendLine(marker + string(md) + dimStyle.Render("  — "+modeSummary(md)))
		}
		m.appendLine(dimStyle.Render("/mode <name> to switch"))
		return
	}
	md, err := agent.ParseMode(arg)
	if err != nil {
		m.appendLine(errStyle.Render(err.Error()))
		return
	}
	if md == cur {
		m.appendLine(dimStyle.Render("already in " + string(md) + " mode"))
		return
	}
	m.agentMode = md
	guidance := md.PromptGuidance()
	if guidance == "" {
		guidance = "full access"
	}
	// A mode switch is announced through its own constructor rather than as
	// free text: later turns parse these back to notice that the session was
	// read-only earlier, and prose would make that a substring search.
	m.conversation = append(m.conversation, agent.ModeSwitch(md, guidance))
	if m.sess != nil {
		m.sess.AddEpoch("mode_switch", string(md), "")
		m.sess.Mode = string(md)
	}
	m.printStatusPanel()
	m.syncLayout()
	m.appendLine(okStyle.Render("mode: "+string(md)) + dimStyle.Render(" — "+modeSummary(md)))
}

// doCopy copies the last assistant message to the system clipboard.
func (m *Model) doCopy() {
	var last string
	for i := len(m.conversation) - 1; i >= 0; i-- {
		if m.conversation[i].Role == "assistant" && strings.TrimSpace(m.conversation[i].Content) != "" {
			last = m.conversation[i].Content
			break
		}
	}
	if last == "" {
		m.appendLine(dimStyle.Render("nothing to copy yet"))
		return
	}
	if err := clipboard.WriteAll(last); err != nil {
		m.appendLine(errStyle.Render("copy failed: " + err.Error()))
		return
	}
	m.appendLine(okStyle.Render(fmt.Sprintf("copied last response to clipboard (%d chars)", len(last))))
}

// ---- skills ----

// startSkills builds the project's agent skills: task-oriented guides for the
// recurring work in this repo. Usage: /skills [force] [name…]  ·  /skills list
func (m Model) startSkills(args []string) (tea.Model, tea.Cmd) {
	if len(args) > 0 && strings.EqualFold(args[0], "list") {
		m.listSkills()
		return m, nil
	}
	if m.client == nil {
		return m.needKey()
	}
	if m.guardBusy() {
		return m.busyNote()
	}
	opts := skills.Options{}
	for _, a := range args {
		if strings.EqualFold(a, "force") || a == "--force" || a == "-f" {
			opts.Force = true
		} else {
			opts.Only = append(opts.Only, a)
		}
	}

	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	repo, cfg, client, ch := m.repo, m.cfg, m.client, m.events
	go func() {
		ch <- busyMsg{true, "building skills"}
		res, err := scan.Repo(repo, cfg)
		if err != nil {
			ch <- doneMsg{"skills", err}
			ch <- busyMsg{false, ""}
			return
		}
		pg := skills.Progress{
			Info:    func(t string) { ch <- logMsg{dimStyle.Render("  " + t)} },
			Started: func(w string) { ch <- logMsg{toolStyle.Render("  → " + w)} },
			Wrote: func(p string, lines int) {
				ch <- logMsg{okStyle.Render(fmt.Sprintf("  ✓ %s (%d lines)", p, lines))}
			},
			Failed: func(w string, err error) {
				ch <- logMsg{errStyle.Render("  ✗ " + w + ": " + err.Error())}
			},
		}
		written, err := skills.Run(ctx, repo, cfg, client, res, opts, pg)
		if err == nil {
			ch <- logMsg{okStyle.Render(fmt.Sprintf("%d skill(s) written → %s/skills/",
				len(written), config.Dir))}
			ch <- logMsg{dimStyle.Render("the chat agent can now open them with read_knowledge")}
		}
		ch <- doneMsg{"skills", err}
		ch <- busyMsg{false, ""}
	}()
	return m, nil
}

// listSkills prints the generated skill catalog.
func (m *Model) listSkills() {
	all, err := skills.List(m.repo)
	if err != nil {
		m.appendLine(errStyle.Render("could not read skills: " + err.Error()))
		return
	}
	if len(all) == 0 {
		m.appendLine(dimStyle.Render("no skills yet — run /skills to build them"))
		return
	}
	for _, s := range all {
		m.appendLine(okStyle.Render("  "+s.Name) + dimStyle.Render(
			fmt.Sprintf("  (%d sources)", len(s.Sources))))
		m.appendLine(dimStyle.Render("     " + clip(s.Description, max(m.width-8, 20))))
	}
}

// suggestSkills nudges the user toward the skill builder once a knowledge run
// has produced something for it to build on.
func (m *Model) suggestSkills() {
	if m.suggestedSkills {
		return
	}
	if all, err := skills.List(m.repo); err == nil && len(all) > 0 {
		return // already built; nothing to suggest
	}
	m.suggestedSkills = true
	m.appendLine("")
	m.appendLine(warnStyle.Render("next: /skills") + dimStyle.Render(
		" — turn this into task guides an agent loads while working"))
}

// ---- git hook ----

// doHook installs, removes, or reports the post-commit auto-update hook.
// Usage: /hook [install|remove|status]
func (m *Model) doHook(args []string) {
	action := "status"
	if len(args) > 0 {
		action = strings.ToLower(args[0])
	}
	if !gitx.IsRepo(m.repo) {
		m.appendLine(errStyle.Render("not a git repository — the hook needs git"))
		return
	}

	switch action {
	case "install", "add", "on":
		exe, err := os.Executable()
		if err != nil {
			m.appendLine(errStyle.Render("could not locate the kaioken binary: " + err.Error()))
			return
		}
		path, err := gitx.InstallPostCommit(m.repo, exe)
		if err != nil {
			m.appendLine(errStyle.Render("hook install failed: " + err.Error()))
			return
		}
		m.appendLine(okStyle.Render("post-commit hook installed → " + path))
		m.appendLine(dimStyle.Render("every commit now refreshes the wiki in the background · /hook remove to undo"))

	case "remove", "uninstall", "off":
		removed, err := gitx.RemovePostCommit(m.repo)
		if err != nil {
			m.appendLine(errStyle.Render("hook removal failed: " + err.Error()))
			return
		}
		if !removed {
			m.appendLine(dimStyle.Render("no kaioken hook was installed"))
			return
		}
		m.appendLine(okStyle.Render("post-commit hook removed"))

	default:
		if gitx.PostCommitInstalled(m.repo) {
			m.appendLine(okStyle.Render("post-commit auto-update: installed"))
		} else {
			m.appendLine(dimStyle.Render("post-commit auto-update: not installed  (/hook install)"))
		}
	}
}

// ---- wiki browser ----

// startVerify runs the repo's build/test gate in the background. The fix
// loop itself belongs to the chat agent; here the value is the verdict.
func (m Model) startVerify() (tea.Model, tea.Cmd) {
	repo, ch := m.repo, m.events
	cmds, err := verify.Detect(repo)
	if err != nil {
		m.appendLine(errStyle.Render("verify: " + err.Error()))
		return m, nil
	}
	m.appendLine(dimStyle.Render("running the verify gate: " + strings.Join(cmds, " → ")))
	go func() {
		results, gateErr := verify.Gate(context.Background(), repo, cmds)
		for _, r := range results {
			mark := okStyle.Render("  ✓ " + r.Command)
			if !r.OK {
				mark = errStyle.Render("  ✗ " + r.Command)
			}
			ch <- logMsg{mark}
		}
		if gateErr != nil {
			ch <- logMsg{errStyle.Render("verify gate failed — ask the agent to fix it")}
			return
		}
		ch <- logMsg{okStyle.Render("verify gate passed")}
	}()
	return m, nil
}

// startHandoff briefs the current session so someone else can continue it.
// The brief comes from the model; the file write happens when it lands.
func (m Model) startHandoff() (tea.Model, tea.Cmd) {
	if m.client == nil {
		return m.needKey()
	}
	if m.sess == nil || m.sess.Empty() {
		m.appendLine(errStyle.Render("no current session to hand off"))
		return m, nil
	}
	m.busy = true
	m.busyText = "writing the handoff briefing"
	client, sess := m.client, m.sess
	return m, tea.Batch(
		func() tea.Msg {
			brief, err := handoff.Brief(context.Background(), client, sess)
			return handoffMsg{brief, err}
		},
		m.spin.Tick,
	)
}

// writeHandoff saves the brief plus the collapsed transcript under
// .kaioken/handoffs/ and returns the path.
func (m *Model) writeHandoff(brief string) (string, error) {
	sess := m.sess
	var doc strings.Builder
	fmt.Fprintf(&doc, "# Handoff — %s\n\n", sess.Title)
	fmt.Fprintf(&doc, "_Session `%s`, briefed %s. Hand this to whoever continues the work._\n\n",
		sess.ID, time.Now().Format("2006-01-02 15:04"))
	doc.WriteString(brief)
	doc.WriteString("\n\n## Transcript\n\n")
	doc.WriteString(handoff.Transcript(sess))

	dir := filepath.Join(m.repo, config.Dir, "handoffs")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	out := filepath.Join(dir, fmt.Sprintf("%s-%s.md", sess.ID, time.Now().Format("20060102-1504")))
	if err := os.WriteFile(out, []byte(doc.String()), 0o644); err != nil {
		return "", err
	}
	return out, nil
}

// startDraft asks the model for a commit message + PR description grounded
// in the current diff. It is strictly advisory: nothing is staged or
// committed from here.
func (m Model) startDraft(base string) (tea.Model, tea.Cmd) {
	if m.client == nil {
		return m.needKey()
	}
	m.busy = true
	m.busyText = "drafting the commit message"
	client, cfg, repo := m.client, m.cfg, m.repo
	return m, tea.Batch(
		func() tea.Msg {
			text, err := gitdraft.Draft(context.Background(), repo, cfg, client, base)
			return draftMsg{text, err}
		},
		m.spin.Tick,
	)
}

// startOnboard assembles ONBOARDING.md from the generated knowledge. All
// local I/O, so it runs in the background and reports one line when done.
func (m Model) startOnboard(args []string) (tea.Model, tea.Cmd) {
	force := len(args) > 0 && strings.EqualFold(args[0], "force")
	repo, ch := m.repo, m.events
	m.appendLine(dimStyle.Render("assembling ONBOARDING.md…"))
	go func() {
		cfg, err := config.Load(repo)
		if err != nil {
			ch <- logMsg{errStyle.Render("onboard: " + err.Error())}
			return
		}
		doc, err := onboard.Generate(repo, cfg)
		if err != nil {
			ch <- logMsg{errStyle.Render("onboard: " + err.Error())}
			return
		}
		out := filepath.Join(repo, "ONBOARDING.md")
		if _, serr := os.Stat(out); serr == nil && !force {
			ch <- logMsg{errStyle.Render("ONBOARDING.md exists — /onboard force to overwrite")}
			return
		}
		if err := os.WriteFile(out, []byte(doc), 0o644); err != nil {
			ch <- logMsg{errStyle.Render("onboard: " + err.Error())}
			return
		}
		ch <- logMsg{okStyle.Render("wrote " + out)}
	}()
	return m, nil
}

// startPublish renders the wiki to a static site in the background; the
// render is all local I/O, so no spinner machinery is needed — one line when
// it lands.
func (m Model) startPublish() (tea.Model, tea.Cmd) {
	repo, ch := m.repo, m.events
	m.appendLine(dimStyle.Render("publishing the wiki as a static site…"))
	go func() {
		out := filepath.Join(repo, config.Dir, "site")
		n, err := serve.Export(repo, out)
		if err != nil {
			ch <- logMsg{errStyle.Render("publish: " + err.Error())}
			return
		}
		ch <- logMsg{okStyle.Render(fmt.Sprintf("published %d page(s) → %s", n, out))}
	}()
	return m, nil
}

// startServe runs the local wiki site alongside the chat. It deliberately
// does NOT set busy: the server is long-lived and the user keeps working.
// Usage: /serve [port]   ·   /serve stop
func (m Model) startServe(args []string) (tea.Model, tea.Cmd) {
	if len(args) > 0 && strings.EqualFold(args[0], "stop") {
		if m.serveCancel == nil {
			m.appendLine(dimStyle.Render("the wiki server is not running"))
			return m, nil
		}
		m.serveCancel()
		m.serveCancel = nil
		m.serveURL = ""
		m.appendLine(okStyle.Render("wiki server stopped"))
		return m, nil
	}
	if m.serveCancel != nil {
		m.appendLine(dimStyle.Render("already serving at " + m.serveURL + " — /serve stop to end it"))
		return m, nil
	}
	port := 7777
	if len(args) > 0 {
		if _, err := fmt.Sscanf(args[0], "%d", &port); err != nil {
			m.appendLine(errStyle.Render("not a port number: " + args[0]))
			return m, nil
		}
	}

	ctx, cancel := context.WithCancel(context.Background())
	m.serveCancel = cancel
	repo, ch := m.repo, m.events
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	go func() {
		err := serve.Run(ctx, repo, addr, func(url string) {
			ch <- serveStartedMsg{url}
		})
		if err != nil && ctx.Err() == nil {
			ch <- logMsg{errStyle.Render("wiki server: " + err.Error())}
			ch <- serveStoppedMsg{}
		}
	}()
	return m, nil
}

// ---- sessions ----

// sessionItem adapts a saved session to the shared picker list.
type sessionItem struct {
	id, title, desc string
}

func (i sessionItem) Title() string       { return i.title }
func (i sessionItem) Description() string { return i.desc }
func (i sessionItem) FilterValue() string { return i.title + " " + i.desc }

// listSessions prints saved conversations without leaving chat.
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
		info := fmt.Sprintf("     %d turns · %s · %s", s.Turns, s.Model, humanTime(s.Updated))
		if s.ParentID != "" {
			info += " · ⑂ from " + s.ParentID
		}
		m.appendLine(dimStyle.Render(info))
	}
	m.appendLine(dimStyle.Render("/resume to pick one, /resume <id> to jump straight to it"))
}

// openSessionPicker shows saved conversations in the shared list picker.
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
		desc := fmt.Sprintf("%d turns · %s · %s", s.Turns, humanTime(s.Updated), s.Model)
		if s.ParentID != "" {
			desc += " · ⑂ " + s.ParentID
		}
		items = append(items, sessionItem{
			id:    s.ID,
			title: s.Title,
			desc:  desc,
		})
	}
	m.list.Title = "Resume a session — type to filter, enter to open, esc to cancel"
	m.list.SetItems(items)
	m.list.SetSize(m.width, m.height)
	m.mode = modePicker
	return m, nil
}

// resumeSession replaces the live conversation with a saved one.
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
	// Restore the reasoning level the session was saved with.
	if s.Thinking != "" && m.client != nil {
		m.client.Thinking = s.Thinking
	}
	// Restore the mode the session was saved in; an unrecognized value falls
	// back to build rather than failing the resume.
	if s.Mode != "" {
		if md, err := agent.ParseMode(s.Mode); err == nil {
			m.agentMode = md
		} else {
			m.agentMode = agent.ModeBuild
			m.appendLine(dimStyle.Render("session mode " + s.Mode + " not recognized — using build"))
		}
		m.printStatusPanel()
		m.syncLayout()
	}

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

func firstLine(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.IndexByte(s, '\n'); i != -1 {
		return s[:i] + " …"
	}
	return s
}

// humanTime renders a timestamp as a short relative age.
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

// ---- pipeline commands (knowledge cards) ----

func (m Model) startScan() (tea.Model, tea.Cmd) {
	if m.guardBusy() {
		return m.busyNote()
	}
	repo, cfg, ch := m.repo, m.cfg, m.events
	go func() {
		ch <- busyMsg{true, "scanning"}
		res, err := scan.Repo(repo, cfg)
		if err == nil {
			ch <- logMsg{res.Stats()}
		}
		ch <- doneMsg{"scan", err}
		ch <- busyMsg{false, ""}
	}()
	return m, nil
}

func (m Model) startPlan() (tea.Model, tea.Cmd) {
	if m.client == nil {
		return m.needKey()
	}
	if m.guardBusy() {
		return m.busyNote()
	}
	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	repo, cfg, client, ch := m.repo, m.cfg, m.client, m.events
	go func() {
		ch <- busyMsg{true, "planning modules"}
		res, err := scan.Repo(repo, cfg)
		if err != nil {
			ch <- doneMsg{"plan", err}
			ch <- busyMsg{false, ""}
			return
		}
		ch <- logMsg{dimStyle.Render("scanned: " + res.Stats())}
		p, err := plan.Generate(ctx, client, cfg, res)
		if err != nil {
			ch <- doneMsg{"plan", err}
			ch <- busyMsg{false, ""}
			return
		}
		if err := p.Save(repo); err != nil {
			ch <- doneMsg{"plan", err}
			ch <- busyMsg{false, ""}
			return
		}
		for _, fm := range p.Flatten() {
			ch <- logMsg{fmt.Sprintf("  %s — %s", fm.ID, fm.Title)}
		}
		ch <- logMsg{dimStyle.Render("wrote " + plan.FilePath(repo) + " — edit it, then /generate")}
		ch <- doneMsg{"plan", nil}
		ch <- busyMsg{false, ""}
	}()
	return m, nil
}

// startWiki runs the deep multi-pass documentation pipeline.
// Usage: /wiki [x1|x2|x3|…] [force]
func (m Model) startWiki(args []string) (tea.Model, tea.Cmd) {
	if m.client == nil {
		return m.needKey()
	}
	if m.guardBusy() {
		return m.busyNote()
	}
	multiplier := 3 // x3 is the default; user passes x1/x2/x4… to override
	force := false
	for _, a := range args {
		la := strings.ToLower(a)
		if strings.HasPrefix(la, "x") {
			if n, err := fmt.Sscanf(la, "x%d", &multiplier); n == 1 && err == nil {
				continue
			}
		}
		if la == "force" || la == "--force" || la == "-f" {
			force = true
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	repo, cfg, client, ch := m.repo, m.cfg, m.client, m.events
	ui := uiAdapter{events: ch, approvals: m.approvals, ctx: ctx}
	go func() {
		ch <- busyMsg{true, fmt.Sprintf("wiki ×%d — powering up", multiplier)}
		res, err := scan.Repo(repo, cfg)
		if err != nil {
			ch <- doneMsg{"wiki", err}
			ch <- busyMsg{false, ""}
			return
		}
		ch <- logMsg{dimStyle.Render("scanned: " + res.Stats())}

		// Show what the run will cost, and confirm before a big one.
		est := wiki.EstimateRun(repo, cfg, res, multiplier)
		ch <- logMsg{dimStyle.Render(est.String())}
		if est.Heavy() && !ui.Approve(agent.ApprovalRequest{
			Action:  "start",
			Target:  fmt.Sprintf("wiki ×%d", multiplier),
			Preview: est.String(),
		}) {
			ch <- logMsg{warnStyle.Render("cancelled — try a lower multiplier, e.g. /wiki x1")}
			ch <- busyMsg{false, ""}
			return
		}

		callsBefore, promptBefore, outBefore := client.Usage()
		pg := wiki.Progress{
			Info:    func(t string) { ch <- logMsg{dimStyle.Render("  " + t)} },
			Started: func(w string) { ch <- logMsg{toolStyle.Render("  → " + w)} },
			Wrote: func(p string, lines int) {
				ch <- logMsg{okStyle.Render(fmt.Sprintf("  ✓ %s (%d lines)", p, lines))}
			},
			Failed: func(w string, err error) {
				ch <- logMsg{errStyle.Render("  ✗ " + w + ": " + err.Error())}
			},
		}
		err = wiki.Run(ctx, repo, cfg, client, res, multiplier, force, pg)
		// Report what this run actually cost, not the client's lifetime total.
		callsAfter, promptAfter, outAfter := client.Usage()
		ch <- logMsg{dimStyle.Render(fmt.Sprintf("actual: %d calls · %d prompt + %d output tokens",
			callsAfter-callsBefore, promptAfter-promptBefore, outAfter-outBefore))}
		ch <- logMsg{dimStyle.Render("index: " + config.Dir + "/wiki/README.md")}
		ch <- doneMsg{"wiki", err}
		ch <- busyMsg{false, ""}
	}()
	return m, nil
}

// startWikiRetry regenerates only the sections that failed in the last run.
func (m Model) startWikiRetry() (tea.Model, tea.Cmd) {
	if m.client == nil {
		return m.needKey()
	}
	if m.guardBusy() {
		return m.busyNote()
	}
	failed := wiki.LoadStamp(m.repo).Failed
	if len(failed) == 0 {
		m.appendLine(okStyle.Render("no failed sections to retry"))
		return m, nil
	}
	m.appendLine(dimStyle.Render("failed sections: " + strings.Join(failed, ", ")))

	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	repo, cfg, client, ch := m.repo, m.cfg, m.client, m.events
	go func() {
		ch <- busyMsg{true, "retrying failed sections"}
		res, err := scan.Repo(repo, cfg)
		if err != nil {
			ch <- doneMsg{"wiki retry", err}
			ch <- busyMsg{false, ""}
			return
		}
		pg := wiki.Progress{
			Info:    func(t string) { ch <- logMsg{dimStyle.Render("  " + t)} },
			Started: func(w string) { ch <- logMsg{toolStyle.Render("  → " + w)} },
			Wrote: func(p string, lines int) {
				ch <- logMsg{okStyle.Render(fmt.Sprintf("  ✓ %s (%d lines)", p, lines))}
			},
			Failed: func(w string, err error) {
				ch <- logMsg{errStyle.Render("  ✗ " + w + ": " + err.Error())}
			},
		}
		n, err := wiki.Retry(ctx, repo, cfg, client, res, pg)
		if err == nil {
			ch <- logMsg{dimStyle.Render(fmt.Sprintf("retried %d section(s)", n))}
		}
		ch <- doneMsg{"wiki retry", err}
		ch <- busyMsg{false, ""}
	}()
	return m, nil
}

// startWikiUpdate revises only the wiki documents that the repo's git diff
// invalidates, measured against the commit the wiki was generated from.
// Usage: /update [<base-rev>]   e.g. /update HEAD~5
func (m Model) startWikiUpdate(args []string) (tea.Model, tea.Cmd) {
	if m.client == nil {
		return m.needKey()
	}
	if m.guardBusy() {
		return m.busyNote()
	}
	base := ""
	if len(args) > 0 {
		base = args[0]
	}
	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	repo, cfg, client, ch := m.repo, m.cfg, m.client, m.events
	go func() {
		ch <- busyMsg{true, "update — diffing against the documented baseline"}
		res, err := scan.Repo(repo, cfg)
		if err != nil {
			ch <- doneMsg{"update", err}
			ch <- busyMsg{false, ""}
			return
		}
		pg := wiki.Progress{
			Info:    func(t string) { ch <- logMsg{dimStyle.Render("  " + t)} },
			Started: func(w string) { ch <- logMsg{toolStyle.Render("  → " + w)} },
			Wrote: func(p string, lines int) {
				ch <- logMsg{okStyle.Render(fmt.Sprintf("  ✓ %s (%d lines)", p, lines))}
			},
			Failed: func(w string, err error) {
				ch <- logMsg{errStyle.Render("  ✗ " + w + ": " + err.Error())}
			},
		}
		rep, err := wiki.Update(ctx, repo, cfg, client, res, base, pg)
		switch {
		case err != nil:
		case len(rep.Changes) == 0:
			ch <- logMsg{okStyle.Render("wiki is already current — nothing changed since " +
				gitx.Short(rep.Base))}
		case len(rep.Updated) == 0:
			ch <- logMsg{warnStyle.Render(fmt.Sprintf(
				"%d files changed but no section claims them — /wiki force to re-plan", len(rep.Changes)))}
		default:
			ch <- logMsg{okStyle.Render(fmt.Sprintf("updated %d document(s) from %d changed files",
				len(rep.Updated), len(rep.Changes)))}
			ch <- logMsg{dimStyle.Render("changelog: " + config.Dir + "/wiki/CHANGELOG.md")}
		}
		if err == nil && len(rep.Unassigned) > 0 {
			ch <- logMsg{dimStyle.Render(fmt.Sprintf("  %d changed file(s) outside every section's scope:",
				len(rep.Unassigned)))}
			for _, u := range rep.Unassigned[:minInt(len(rep.Unassigned), 8)] {
				ch <- logMsg{dimStyle.Render("    " + u)}
			}
		}
		// Skills describe how to work in this code, so the same diff makes them
		// stale — refresh the ones the change actually touches.
		if err == nil && len(rep.Changes) > 0 {
			changed := make([]string, 0, len(rep.Changes))
			for _, c := range rep.Changes {
				changed = append(changed, c.Path)
			}
			sg := skills.Progress{
				Info:    func(t string) { ch <- logMsg{dimStyle.Render("  " + t)} },
				Started: func(w string) { ch <- logMsg{toolStyle.Render("  → " + w)} },
				Wrote: func(p string, lines int) {
					ch <- logMsg{okStyle.Render(fmt.Sprintf("  ✓ %s (%d lines)", p, lines))}
				},
				Failed: func(w string, e error) {
					ch <- logMsg{errStyle.Render("  ✗ " + w + ": " + e.Error())}
				},
			}
			if refreshed, serr := skills.Refresh(ctx, repo, cfg, client, res, changed, sg); serr != nil {
				ch <- logMsg{errStyle.Render("skills refresh: " + serr.Error())}
			} else if len(refreshed) > 0 {
				ch <- logMsg{okStyle.Render(fmt.Sprintf("refreshed %d skill(s)", len(refreshed)))}
			}
		}
		ch <- doneMsg{"update", err}
		ch <- busyMsg{false, ""}
	}()
	return m, nil
}

func (m Model) startGenerate(args []string) (tea.Model, tea.Cmd) {
	if m.client == nil {
		return m.needKey()
	}
	if m.guardBusy() {
		return m.busyNote()
	}
	force := false
	var only []string
	for _, a := range args {
		if strings.EqualFold(a, "force") || a == "--force" || a == "-f" {
			force = true
		} else {
			only = append(only, a)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	repo, cfg, client, ch := m.repo, m.cfg, m.client, m.events
	go func() {
		ch <- busyMsg{true, "generating cards"}
		p, err := plan.Load(repo)
		if err != nil {
			ch <- doneMsg{"generate", err}
			ch <- busyMsg{false, ""}
			return
		}
		res, err := scan.Repo(repo, cfg)
		if err != nil {
			ch <- doneMsg{"generate", err}
			ch <- busyMsg{false, ""}
			return
		}
		opts := generate.Options{
			Force: force,
			Only:  only,
			OnStart: func(id string) {
				ch <- logMsg{dimStyle.Render("  → " + id)}
			},
			OnDone: func(id string, err error, skipped bool) {
				switch {
				case err != nil:
					ch <- logMsg{errStyle.Render("  ✗ " + id + ": " + err.Error())}
				case skipped:
				default:
					ch <- logMsg{okStyle.Render("  ✓ " + id)}
				}
			},
		}
		err = generate.Run(ctx, repo, cfg, client, p, res, opts)
		ch <- logMsg{dimStyle.Render("index: " + config.Dir + "/KNOWLEDGE.md")}
		ch <- doneMsg{"generate", err}
		ch <- busyMsg{false, ""}
	}()
	return m, nil
}

func (m Model) startStatus() (tea.Model, tea.Cmd) {
	if m.guardBusy() {
		return m.busyNote()
	}
	repo, cfg, ch := m.repo, m.cfg, m.events
	go func() {
		ch <- busyMsg{true, "checking status"}
		p, err := plan.Load(repo)
		if err != nil {
			ch <- doneMsg{"status", err}
			ch <- busyMsg{false, ""}
			return
		}
		st, _ := state.Load(repo)
		res, err := scan.Repo(repo, cfg)
		if err != nil {
			ch <- doneMsg{"status", err}
			ch <- busyMsg{false, ""}
			return
		}
		for _, fm := range p.Flatten() {
			files := plan.FilesFor(fm, res)
			ms, ok := st.Modules[fm.ID]
			switch {
			case len(files) == 0:
				ch <- logMsg{dimStyle.Render("  ∅ " + fm.ID + "  (no files in scope)")}
			case !ok:
				ch <- logMsg{warnStyle.Render("  ○ " + fm.ID + "  not generated")}
			default:
				h, _ := state.HashFiles(res.Root, files)
				if h == ms.SourceHash {
					ch <- logMsg{okStyle.Render("  ✓ " + fm.ID + "  up-to-date")}
				} else {
					ch <- logMsg{warnStyle.Render("  Δ " + fm.ID + "  CHANGED")}
				}
			}
		}
		ch <- doneMsg{"", nil}
		ch <- busyMsg{false, ""}
	}()
	return m, nil
}

func (m Model) startModels(filter string) (tea.Model, tea.Cmd) {
	if m.client == nil {
		return m.needKey()
	}
	if m.guardBusy() {
		return m.busyNote()
	}
	client, ch := m.client, m.events
	go func() {
		ch <- busyMsg{true, "listing models"}
		models, err := client.ListModels(context.Background(), filter)
		if err != nil {
			ch <- doneMsg{"models", err}
			ch <- busyMsg{false, ""}
			return
		}
		for i, md := range models {
			if i >= 80 {
				ch <- logMsg{dimStyle.Render(fmt.Sprintf("  … %d more (use a filter)", len(models)-80))}
				break
			}
			ch <- logMsg{"  " + md.ID}
		}
		ch <- logMsg{dimStyle.Render(fmt.Sprintf("%d models — /model <id> to select, or /model to pick", len(models)))}
		ch <- doneMsg{"", nil}
		ch <- busyMsg{false, ""}
	}()
	return m, nil
}

// ---- helpers ----

// setSessionKey records a key entered via /key for the currently active
// provider only — see the apiKeys field comment.
func (m *Model) setSessionKey(key string) {
	if m.apiKeys == nil {
		m.apiKeys = map[string]string{}
	}
	m.apiKeys[m.cfg.Provider] = key
}

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
	// A new client starts a new spend meter, so the guard restarts with it.
	m.budget = agent.NewBudgetGuard(m.cfg.Budget.WarnAt, m.cfg.Budget.HardStop)
	// Likewise the context measurement: token counts are per-tokenizer, so a
	// figure measured under the previous model does not describe this one.
	m.ctxTracker = &agent.ContextTracker{}
	return ""
}

// persistKey stores the key for the active provider in ~/.kaioken/config.yaml.
func (m *Model) persistKey(key string) {
	if m.global == nil {
		m.global = config.LoadGlobal()
	}
	m.global.Keys[m.cfg.Provider] = key
	if err := m.global.Save(); err != nil {
		m.appendLine(errStyle.Render("could not save key: " + err.Error()))
		return
	}
	m.appendLine(okStyle.Render("API key saved for " + m.cfg.Provider + " → " + config.GlobalPath()))
}

// persistDefaults stores provider+model as the user's cross-repo defaults.
func (m *Model) persistDefaults() {
	if m.global == nil {
		m.global = config.LoadGlobal()
	}
	m.global.DefaultProvider = m.cfg.Provider
	m.global.DefaultModel = m.cfg.Model
	if err := m.global.Save(); err != nil {
		m.appendLine(errStyle.Render("could not save defaults: " + err.Error()))
	}
}

func (m *Model) saveCfg() {
	if err := m.cfg.Save(m.repo); err != nil {
		m.appendLine(errStyle.Render("could not save config: " + err.Error()))
	}
}

func (m Model) guardBusy() bool { return m.busy }

func (m Model) busyNote() (tea.Model, tea.Cmd) {
	m.appendLine(warnStyle.Render("busy — wait, or /stop (esc/ctrl+c) to cancel"))
	return m, nil
}

func (m Model) needKey() (tea.Model, tea.Cmd) {
	m.appendLine(errStyle.Render("no API key for provider " + m.cfg.Provider))
	m.appendLine(dimStyle.Render("use /key to set one, or export the provider's key env var"))
	return m, nil
}

func (m Model) configLines() []string {
	lines := []string{
		"repo:        " + m.repo,
		"model:       " + m.cfg.Model,
		"provider:    " + m.cfg.Provider,
		fmt.Sprintf("concurrency: %d", m.cfg.Concurrency),
		fmt.Sprintf("max_tokens:  %d per module", m.cfg.MaxModuleTokens),
		fmt.Sprintf("notes:       %d steering note(s)", len(m.cfg.Notes)),
		fmt.Sprintf("auto-approve: %v", m.autoApprove),
	}
	// Which readers research would use. Global rather than per-repo, so it
	// reads from the global config rather than m.cfg.
	{
		g := config.LoadGlobal()
		api, local := research.FetcherToggles(g.Research.FetcherMode)
		lines = append(lines, fmt.Sprintf("page readers: api=%s local=%s  (/fetcher)",
			onOff(api), onOff(local)))
	}
	// Operation-level model routing, when configured.
	for _, role := range config.Roles {
		if mod := m.cfg.Models[role]; mod != "" {
			lines = append(lines, fmt.Sprintf("model %-8s %s", role+":", mod))
		}
	}
	return lines
}

// ---- model picker item ----

type modelItem struct{ id, name string }

func (i modelItem) Title() string       { return i.id }
func (i modelItem) Description() string { return i.name }
func (i modelItem) FilterValue() string { return i.id + " " + i.name }

// ---- agent UI adapter ----

type uiAdapter struct {
	events    chan tea.Msg
	approvals chan bool
	ctx       context.Context
}

func (u uiAdapter) AssistantDelta(text string) {
	u.events <- streamDeltaMsg{text}
}

func (u uiAdapter) Assistant(text string) {
	u.events <- assistantMsg{text}
}

func (u uiAdapter) Tool(name, args string) {
	u.events <- logMsg{toolCallLine(name, args)}
}

func (u uiAdapter) ToolResult(name, result string, isErr bool) {
	u.events <- logMsg{toolResultLine(result, isErr)}
}

// toolGlyphs give each tool a distinct shape: a long run of calls can then be
// skimmed by silhouette — hollow marks read, solid marks write.
var toolGlyphs = map[string]string{
	"read_file":   "◇",
	"list_files":  "◈",
	"search":      "◎",
	"write_file":  "◆",
	"edit_file":   "◆",
	"run_command": "▶",
	"task":        "◍",
	"todo":        "☰",
}

func toolCallLine(name, args string) string {
	glyph, ok := toolGlyphs[name]
	if !ok {
		glyph = "◇"
	}
	line := toolStyle.Render(glyph + " " + name)
	if a := compactArgs(args); a != "" {
		line += "  " + dimStyle.Render(a)
	}
	return line
}

func toolResultLine(result string, isErr bool) string {
	style := toolResStyle
	if isErr {
		style = errStyle
	}
	return dimStyle.Render("  └ ") + style.Render(preview(result, 3, 240))
}

func (u uiAdapter) Info(text string) {
	u.events <- logMsg{dimStyle.Render(text)}
}

func (u uiAdapter) Approve(req agent.ApprovalRequest) bool {
	u.events <- approvalReqMsg{req}
	select {
	case ok := <-u.approvals:
		return ok
	case <-u.ctx.Done():
		return false
	}
}

func (u uiAdapter) RecordUndo(e agent.UndoEntry) {
	u.events <- undoRecordMsg{e}
}

func compactArgs(args string) string {
	var m map[string]any
	if err := json.Unmarshal([]byte(args), &m); err != nil {
		return clip(strings.ReplaceAll(args, "\n", " "), 80)
	}
	// Ordered by how well each identifies the call at a glance. "description"
	// is the task tool's own label for what it is off doing; "doc" names the
	// knowledge page being opened.
	for _, k := range []string{"path", "command", "query", "description", "doc"} {
		if v, ok := m[k].(string); ok {
			return clip(v, 80)
		}
	}
	return ""
}

func preview(s string, maxLines, maxChars int) string {
	s = strings.TrimSpace(s)
	lines := strings.Split(s, "\n")
	if len(lines) > maxLines {
		lines = lines[:maxLines]
		s = strings.Join(lines, " ⏎ ")
		s += " …"
	} else {
		s = strings.Join(lines, " ⏎ ")
	}
	if len(s) > maxChars {
		s = s[:maxChars] + "…"
	}
	return s
}

var helpText = strings.Join([]string{
	"Chat: type anything to talk to the model. It can use tools:",
	"  read_file · list_files · search · read_knowledge · write_file · edit_file · run_command",
	"  task     delegate a search to a read-only sub-agent with its own context",
	"  todo     keep a visible checklist on multi-step work",
	"  file writes, edits and commands ask for your y/n approval first.",
	"",
	"Run control:",
	"  esc / ctrl+c            stop the current task (chat turn, plan, generate, wiki, compact)",
	"  /stop                   same, as a typed command   ·   ctrl+d quits",
	"",
	"Session:",
	"  /sessions               list saved conversations for this repo",
	"  /resume [id]            reopen a saved conversation (no id = picker)",
	"  /new                    start a fresh session (the current one is saved)",
	"  /undo                   revert the last file write/edit the agent made (repeatable)",
	"  /diff                   show `git diff` for the repo's working tree",
	"  /cost                   token usage and call count for the active model",
	"  /compact                summarize the conversation to free up context",
	"  /learn                  distill this session into a skill + write a digest for /recall",
	"  /copy                   copy the last assistant reply to the clipboard",
	"  /reset                  alias for /new",
	"  /version                print the Kaioken version",
	"",
	"Model & provider:",
	"  /model [id]             pick a model (no id = interactive picker from provider)",
	"  /models [filter]        list provider models to the screen",
	"  /provider [name|list]   switch API provider (no arg = list all available)",
	"  /key [value]            set API key (blank = hidden prompt) — saved to ~/.kaioken",
	"  /yolo                   toggle auto-approve for edits and commands",
	"  /mode [name]            agent permission mode: build · plan · general · explore",
	"  /repo <path>            point at a different repository",
	"",
	"Knowledge engine:",
	"  /wiki [xN] [force]      DEEP wiki: global plan → per-section plans → long docs",
	"                          ×3 default (deepest) · ×2 +subsection docs · ×1 sections only",
	"  /update [<base-rev>]    INCREMENTAL: git-diff the repo against the commit the wiki",
	"                          was built from, and revise only the documents it invalidates",
	"                          (base defaults to the recorded baseline; e.g. /update HEAD~5)",
	"  /wiki retry             regenerate only the sections that failed last run",
	"  /skills [force|name]    build task guides an AI loads while working here",
	"                          (/skills list to see them; /update keeps them current)",
	"  /impact <description>   predict which files, modules, docs, skills and tests",
	"                          a proposed change touches — before editing anything",
	"  /research [xN] <q>      deep web search: plan subquestions, search, read pages,",
	"                          loop on the gaps, write a cited report to .kaioken/research/",
	"  /serve [port]           browse the wiki in a browser  ·  /serve stop",
	"  /publish                render the wiki as a static site under .kaioken/site/",
	"  /onboard [force]        write ONBOARDING.md — the day-one guide from your knowledge",
	"  /draft [base]           draft a commit message + PR description for the current diff",
	"  /handoff                write a continuation briefing for the current session",
	"  /verify                 run the repo's build/test gate and report each verdict",
	"  /hook [install|remove]  refresh the wiki automatically after every commit",
	"  /scan /plan /cards      knowledge-card pipeline   ·   /status",
	"  /notes [add <t>|clear]  steering notes injected into card prompts",
	"",
	"  /init [force]           first-run setup: config + scan + AGENTS.md for this repo",
	"  /config /clear /help /explain /quit",
}, "\n")

func shortPath(p string) string {
	p = filepath.ToSlash(p)
	if len(p) <= 40 {
		return p
	}
	return "…" + p[len(p)-39:]
}

func clip(s string, w int) string {
	if w <= 0 {
		return s
	}
	return lipgloss.NewStyle().Inline(true).MaxWidth(w).Render(s)
}

// lastOutputLine returns the newest non-blank line in a chunk of streamed
// tool output — the one worth putting on the status line.
func lastOutputLine(chunk string) string {
	lines := strings.Split(chunk, "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if line := strings.TrimSpace(lines[i]); line != "" {
			return line
		}
	}
	return ""
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
