package tui

// Cross-session commands: /switch and /import.
//
// /resume answers "reopen that conversation"; /switch answers the same but
// treats the change as a lifecycle event — the current session is saved
// first, and a session_before_switch hook may veto the move (an extension
// holding unflushed state gets its say). /import brings a transcript from
// outside — another repo, another tool — into this repo's session store.

import (
	"fmt"

	agentevents "kaioken/internal/agent/events"
	"kaioken/internal/llm"
	"kaioken/internal/session"
)

// doSwitch saves the current conversation, runs the veto hook, and opens
// another saved session. No argument opens the picker (after saving).
func (m Model) doSwitch(id string) (Model, bool) {
	ev := &agentevents.Event{Type: agentevents.SessionBeforeSwitch, SessionID: id}
	agentevents.Default.Emit(ev)
	if ev.Block {
		reason := ev.BlockReason
		if reason == "" {
			reason = "a hook vetoed the switch"
		}
		m.appendLine(warnStyle.Render("switch cancelled: " + reason))
		return m, false
	}
	m.saveSession()
	if id == "" {
		return m, true // caller opens the picker
	}
	m.resumeSession(id)
	return m, false
}

// doImport ingests an external transcript file as a new session and opens it.
func (m *Model) doImport(path string) {
	if path == "" {
		m.appendLine(warnStyle.Render("usage: /import <path-to-transcript>"))
		m.appendLine(dimStyle.Render("accepts a saved session, a JSON array of messages, or JSONL"))
		return
	}
	s, err := session.Import(m.repo, path, m.cfg.Model, m.cfg.Provider)
	if err != nil {
		m.appendLine(errStyle.Render("import failed: " + err.Error()))
		return
	}
	m.appendLine(okStyle.Render("imported as session " + s.ID))
	m.saveSession() // keep the conversation being replaced
	m.resumeSession(s.ID)
}

// cycleModel flips to the next model in cfg.ScopedModels (ctrl+p). The
// picker stays the tool for choosing from a catalog; cycling is for the
// two-or-three models a user actually alternates between.
func (m *Model) cycleModel() {
	scoped := m.cfg.ScopedModels
	if len(scoped) == 0 {
		m.appendLine(dimStyle.Render("ctrl+p cycles scoped models — none configured. Add to .kaioken/config.yaml:"))
		m.appendLine(dimStyle.Render("  scoped_models: [anthropic/claude-sonnet-4.5, openai/gpt-5-mini]"))
		return
	}
	if m.busy {
		m.appendLine(dimStyle.Render("busy — the model can change once the current task finishes"))
		return
	}
	// A model off the list cycles to the list's start; on the list, to the
	// next entry, wrapping.
	next := scoped[0]
	for i, id := range scoped {
		if id == m.cfg.Model {
			next = scoped[(i+1)%len(scoped)]
			break
		}
	}
	if next == m.cfg.Model {
		m.appendLine(dimStyle.Render(next + " is the only scoped model — already active"))
		return
	}
	m.setModel(next)
}

// showSessionStats prints a summary of the current session.
func (m *Model) showSessionStats() {
	if m.sess == nil {
		m.appendLine(dimStyle.Render("no active session yet — start typing to begin one"))
		return
	}
	s := m.sess
	m.appendLine(okStyle.Render("session: ") + s.ID)
	if s.Title != "" {
		m.appendLine(dimStyle.Render("  title: ") + s.Title)
	}
	m.appendLine(dimStyle.Render(fmt.Sprintf("  turns: %d  model: %s  provider: %s",
		s.Turns(), s.Model, s.Provider)))
	tokens := llm.EstimateTokens(m.conversation)
	m.appendLine(dimStyle.Render(fmt.Sprintf("  tokens: ~%d  epochs: %d", tokens, len(s.Epochs))))
	if m.client != nil {
		cost, known := m.client.CostUSD()
		if known && cost > 0 {
			m.appendLine(dimStyle.Render(fmt.Sprintf("  cost: $%.4f (provider-reported)", cost)))
		}
	}
	if s.ParentID != "" {
		m.appendLine(dimStyle.Render(fmt.Sprintf("  lineage: forked from %s at message %d", s.ParentID, s.ForkedAt)))
	}
	if s.Thinking != "" && s.Thinking != "off" {
		m.appendLine(dimStyle.Render("  thinking: " + s.Thinking))
	}
}
