package tui

// Session tree navigation.
//
// The session store keeps every branch a conversation ever grew — a fork, a
// compaction, an abandoned approach. /tree lists the tips and switches
// between them; /fork rewinds the active branch so the next message grows a
// sibling instead of extending the mistake. Nothing is deleted by either:
// the branch left behind stays reachable from /tree.

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"kaioken/internal/agent"
	"kaioken/internal/llm"
)

// branchSummaryMsg carries the result of summarizing an abandoned branch.
type branchSummaryMsg struct {
	summary string
	err     error
}

// doFork rewinds the active branch by n user turns (default 1). The rewound
// turns stay in the tree; the next message starts a sibling branch.
func (m *Model) doFork(arg string) {
	if m.busy {
		m.appendLine(warnStyle.Render("busy — wait for the current run before forking"))
		return
	}
	if m.sess == nil {
		m.appendLine(dimStyle.Render("no session to fork"))
		return
	}
	turns := 1
	if arg = strings.TrimSpace(arg); arg != "" {
		n, err := strconv.Atoi(arg)
		if err != nil || n <= 0 {
			m.appendLine(errStyle.Render("usage: /fork [turns] — a positive number of user turns to rewind"))
			return
		}
		turns = n
	}
	// Sync the tree with the live transcript before moving its head.
	m.sess.Record(m.conversation)
	if err := m.sess.ForkBack(turns); err != nil {
		m.appendLine(errStyle.Render("could not fork: " + err.Error()))
		return
	}
	m.conversation = m.sess.Messages
	m.appendLine("")
	m.appendLine(okStyle.Render(fmt.Sprintf("rewound %d turn(s) — the next message starts a new branch", turns)))
	m.appendLine(dimStyle.Render("the abandoned turns stay reachable via /tree"))
	m.replayTranscript(m.conversation)
	m.saveSession()
}

// doTree lists the session's branch tips, or switches to one. An optional
// trailing "summarize" asks the model to brief the new branch on the work
// being left behind.
func (m *Model) doTree(arg string) {
	if m.sess == nil {
		m.appendLine(dimStyle.Render("no session yet"))
		return
	}
	m.sess.Record(m.conversation)
	leaves := m.sess.Leaves()
	fields := strings.Fields(arg)

	if len(fields) == 0 {
		if len(leaves) <= 1 {
			m.appendLine(dimStyle.Render("this session has a single branch — /fork creates another"))
			return
		}
		m.appendLine(dimStyle.Render("branches (newest first):"))
		for i, l := range leaves {
			marker := "  "
			if l.Active {
				marker = "* "
			}
			m.appendLine(fmt.Sprintf("%s%d. %s — %d turn(s), %s",
				marker, i+1, clip(l.Preview, 48), l.Turns, humanTime(l.At)))
		}
		m.appendLine(dimStyle.Render("/tree <n> switches · /tree <n> summarize also briefs the model on the branch you leave"))
		return
	}

	if m.busy {
		m.appendLine(warnStyle.Render("busy — wait for the current run before switching branches"))
		return
	}
	n, err := strconv.Atoi(fields[0])
	if err != nil || n < 1 || n > len(leaves) {
		m.appendLine(errStyle.Render(fmt.Sprintf("pick a branch 1–%d (see /tree)", len(leaves))))
		return
	}
	target := leaves[n-1]
	if target.Active {
		m.appendLine(dimStyle.Render("already on that branch"))
		return
	}
	wantSummary := len(fields) > 1 && strings.EqualFold(fields[1], "summarize")

	oldLeaf := m.sess.Leaf
	if err := m.sess.SwitchLeaf(target.ID); err != nil {
		m.appendLine(errStyle.Render("could not switch: " + err.Error()))
		return
	}
	m.conversation = m.sess.Messages
	m.appendLine("")
	m.appendLine(okStyle.Render("switched to branch " + strconv.Itoa(n)))
	m.replayTranscript(m.conversation)
	m.saveSession()

	if wantSummary {
		if m.client == nil {
			m.appendLine(dimStyle.Render("no API key — switched without a branch summary"))
			return
		}
		abandoned := m.sess.BranchMessages(oldLeaf)
		if len(abandoned) == 0 {
			return
		}
		client, ch := m.client, m.events
		go func() {
			ch <- busyMsg{true, "summarizing the abandoned branch"}
			summary, err := agent.Summarize(context.Background(), client, abandoned)
			ch <- branchSummaryMsg{summary: summary, err: err}
			ch <- busyMsg{false, ""}
		}()
	}
}

// applyBranchSummary injects the abandoned branch's summary into the active
// conversation as a context update, so the model knows what was tried.
func (m *Model) applyBranchSummary(msg branchSummaryMsg) {
	if msg.err != nil {
		m.appendLine(errStyle.Render("branch summary failed: " + msg.err.Error()))
		return
	}
	m.conversation = append(m.conversation,
		agent.ContextUpdate("summary of a branch the user explored and left:\n"+msg.summary))
	m.appendLine(dimStyle.Render("branch summary added to the conversation"))
	m.saveSession()
}

// replayTranscript re-renders a conversation so the user sees where the
// active branch stands. Mirrors the /resume replay.
func (m *Model) replayTranscript(msgs []llm.Message) {
	for _, msg := range msgs {
		switch msg.Role {
		case "user":
			m.appendLine(userStyle.Render("› " + firstLine(msg.Content)))
		case "assistant":
			if text := strings.TrimSpace(msg.Content); text != "" {
				m.appendLine(renderMarkdown(text, m.vp.Width))
			}
		}
	}
}
