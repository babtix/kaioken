package tui

import (
	"context"
	"strings"

	tea "github.com/charmbracelet/bubbletea"

	"kaioken/internal/impact"
	"kaioken/internal/scan"
)

// startImpact runs the refactoring impact predictor on a plain-language
// intent and opens the resulting report as an interactive tree.
// Usage: /impact <description of the change>
func (m Model) startImpact(intent string) (tea.Model, tea.Cmd) {
	if m.client == nil {
		return m.needKey()
	}
	if m.guardBusy() {
		return m.busyNote()
	}
	if strings.TrimSpace(intent) == "" {
		m.appendLine(errStyle.Render("describe the change: /impact rename parseArgs to parseCLIArgs"))
		m.appendLine(dimStyle.Render("naming real symbols sharpens the prediction — /explain impact for more"))
		return m, nil
	}

	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	repo, cfg, client, ch := m.repo, m.cfg, m.client, m.events
	go func() {
		ch <- busyMsg{true, "impact — mapping the blast radius"}
		res, err := scan.Repo(repo, cfg)
		if err != nil {
			ch <- doneMsg{"impact", err}
			ch <- busyMsg{false, ""}
			return
		}
		pg := impact.Progress{
			Info: func(t string) { ch <- logMsg{dimStyle.Render("  " + t)} },
		}
		rep, err := impact.Run(ctx, repo, cfg, client, res, intent, pg)
		if err != nil {
			ch <- doneMsg{"impact", err}
			ch <- busyMsg{false, ""}
			return
		}
		if rep.SavedPath != "" {
			ch <- logMsg{dimStyle.Render("  report saved: " + rep.SavedPath)}
		}
		ch <- impactMsg{rep}
		ch <- busyMsg{false, ""}
	}()
	return m, nil
}
