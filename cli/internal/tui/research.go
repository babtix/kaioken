package tui

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"kaioken/internal/config"
	"kaioken/internal/reportpdf"
	"kaioken/internal/research"
	"kaioken/internal/version"
	"kaioken/internal/webfetch"
	"kaioken/internal/websearch"
)

// startResearch runs the web research loop — the desktop app's "deep search" —
// without leaving the TUI. It mirrors `kaioken research`: the report lands in
// .kaioken/research/ as markdown plus the structured JSON twin, so the run
// also shows up in the daemon's and desktop's saved history.
// Usage: /research [xN] <question>
func (m Model) startResearch(rest string) (tea.Model, tea.Cmd) {
	if m.client == nil {
		return m.needKey()
	}
	if m.guardBusy() {
		return m.busyNote()
	}
	mult, question := splitResearchArgs(rest)
	if question == "" {
		m.appendLine(errStyle.Render("ask a question: /research what changed in Go 1.24 garbage collection?"))
		m.appendLine(dimStyle.Render("an optional leading xN sets the depth — /explain research for more"))
		return m, nil
	}

	global := m.global
	if global == nil {
		global = config.LoadGlobal()
	}
	provider, err := websearch.Resolve(global.Research.SearchProvider, global.Keys)
	if err != nil {
		// The resolve error is multi-line: it names every supported search
		// provider with its env var and signup URL. Keep that shape.
		for _, line := range strings.Split(err.Error(), "\n") {
			m.appendLine(errStyle.Render(line))
		}
		return m, nil
	}

	opts := research.Options{
		Multiplier:  mult,
		MaxRounds:   global.Research.MaxRounds,
		MaxDuration: global.Research.ResearchTimeout(),
	}
	// Same rule as the CLI and daemon: Firecrawl in the active search set
	// means its scrape API reads the pages too, with the built-in fetcher
	// as fallback.
	if strings.Contains(provider.Name(), "firecrawl") {
		if fk := websearch.KeyFor("firecrawl", global.Keys); fk != "" {
			opts.Fetcher = webfetch.NewFirecrawl(fk, nil)
		}
	}
	limit, _ := m.cfg.EffectiveConcurrency(m.client.Model)
	opts.Concurrency = limit

	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	repo, client, ch := m.repo, m.client, m.events
	go func() {
		ch <- busyMsg{true, fmt.Sprintf("research ×%d — searching the web", mult)}
		ch <- logMsg{dimStyle.Render(fmt.Sprintf("×%d research via %s (concurrency %d)",
			mult, provider.Name(), limit))}
		started := time.Now()
		callsBefore, promptBefore, outBefore := client.Usage()
		rep, err := research.Run(ctx, client, provider, question, opts, research.Progress{
			Stage:  func(s string) { ch <- logMsg{toolStyle.Render("  → " + s)} },
			Detail: func(s string) { ch <- logMsg{dimStyle.Render("    " + s)} },
			Round:  func(n, of int) { ch <- logMsg{dimStyle.Render(fmt.Sprintf("  round %d/%d", n, of))} },
		})
		if err != nil {
			ch <- doneMsg{"research", err}
			ch <- busyMsg{false, ""}
			return
		}

		// Persist the same two artifacts the CLI writes: the rendered
		// markdown, and the JSON twin the saved-history endpoints read.
		dir := filepath.Join(repo, config.Dir, "research")
		out := filepath.Join(dir, research.Slug(question)+".md")
		if err := os.MkdirAll(dir, 0o755); err == nil {
			err = os.WriteFile(out, []byte(rep.Render()), 0o644)
		}
		if err != nil {
			ch <- doneMsg{"research", err}
			ch <- busyMsg{false, ""}
			return
		}
		rel := filepath.ToSlash(filepath.Join(config.Dir, "research", research.Slug(question)+".md"))
		if _, err := research.Save(dir, rep, rel); err != nil {
			ch <- logMsg{warnStyle.Render("  could not save research history: " + err.Error())}
		}

		// A deep run's artifact is the dossier; the markdown above is its twin.
		if rep.Deep != nil {
			pdfPath := strings.TrimSuffix(out, ".md") + ".pdf"
			pages, perr := reportpdf.WriteFile(rep, reportpdf.Meta{
				Tool: "kaioken", Version: version.Version, Model: client.Model,
				Provider: provider.Name(), Multiplier: mult,
			}, pdfPath)
			if perr != nil {
				ch <- logMsg{warnStyle.Render("  could not write the PDF: " + perr.Error())}
			} else {
				ch <- logMsg{okStyle.Render(fmt.Sprintf("  dossier → %s (%d pages)", pdfPath, pages))}
			}
		}

		ch <- logMsg{okStyle.Render(fmt.Sprintf("research done in %s → %s",
			time.Since(started).Round(time.Second), out))}
		ch <- logMsg{dimStyle.Render(fmt.Sprintf("  %d round(s), %d queries, %d sources read, %d cited",
			rep.Rounds, rep.Searched, rep.Fetched, len(rep.Sources)))}
		if rep.Incomplete {
			ch <- logMsg{warnStyle.Render("  some subquestions stayed thinly evidenced when the run ended")}
		}
		for _, w := range rep.Warnings {
			ch <- logMsg{warnStyle.Render("  " + w)}
		}
		callsAfter, promptAfter, outAfter := client.Usage()
		ch <- logMsg{dimStyle.Render(fmt.Sprintf("  actual: %d calls · %d prompt + %d output tokens",
			callsAfter-callsBefore, promptAfter-promptBefore, outAfter-outBefore))}
		ch <- doneMsg{"research", nil}
		ch <- busyMsg{false, ""}
	}()
	return m, nil
}

// splitResearchArgs peels an optional leading ×N multiplier off the rest of
// the line. Same rule as the CLI: only "x" plus digits counts, so a question
// like "xbox exclusives 2026" keeps its first word.
func splitResearchArgs(rest string) (mult int, question string) {
	mult = 3 // matches the CLI and wiki defaults
	fields := strings.Fields(rest)
	if len(fields) > 0 {
		if n, ok := parseResearchMultiplier(fields[0]); ok {
			mult, fields = n, fields[1:]
		}
	}
	return mult, strings.TrimSpace(strings.Join(fields, " "))
}

// parseResearchMultiplier recognises "x3", "X10" and nothing else.
func parseResearchMultiplier(s string) (int, bool) {
	s = strings.ToLower(strings.TrimSpace(s))
	if len(s) < 2 || s[0] != 'x' {
		return 0, false
	}
	n := 0
	for _, r := range s[1:] {
		if r < '0' || r > '9' {
			return 0, false
		}
		n = n*10 + int(r-'0')
	}
	if n < 1 {
		return 0, false
	}
	return n, true
}
