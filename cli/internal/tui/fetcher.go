package tui

import (
	"fmt"
	"strings"

	"kaioken/internal/config"
	"kaioken/internal/research"
	"kaioken/internal/webfetch"
	"kaioken/internal/websearch"
)

// /fetcher — what reads the pages a research run finds.
//
// The same two switches the desktop app shows under Research engines, and the
// same stored setting behind them. Finding a page and reading it are separate
// jobs, and only the second one is set here.

// doFetcher shows or flips the page readers.
func (m *Model) doFetcher(args []string) {
	global := config.LoadGlobal()

	if len(args) == 0 {
		for _, line := range fetcherLines(global) {
			m.appendLine(line)
		}
		return
	}

	which := strings.ToLower(strings.TrimSpace(args[0]))
	if which != "api" && which != "local" {
		m.appendLine(errStyle.Render("unknown reader " + args[0] + " — /fetcher api|local on|off"))
		return
	}
	if len(args) < 2 {
		m.appendLine(errStyle.Render("say on or off — /fetcher " + which + " on|off"))
		return
	}

	on, ok := parseOnOff(args[1])
	if !ok {
		m.appendLine(errStyle.Render("unknown value " + args[1] + " — /fetcher " + which + " on|off"))
		return
	}

	api, local := research.FetcherToggles(global.Research.FetcherMode)
	if which == "api" {
		api = on
	} else {
		local = on
	}
	global.Research.FetcherMode = research.FetcherModeFor(api, local)
	if err := global.Save(); err != nil {
		m.appendLine(errStyle.Render("could not save: " + err.Error()))
		return
	}

	m.appendLine(okStyle.Render(readerLabel(which) + " reader " + onOff(on)))
	// Say what the change actually means, not just that it was written. A
	// switch that is on but unusable is the case worth naming.
	for _, line := range fetcherLines(global) {
		m.appendLine(line)
	}
}

// fetcherLines reports both readers, what each one needs, and the tier a run
// would actually use.
func fetcherLines(global *config.Global) []string {
	api, local := research.FetcherToggles(global.Research.FetcherMode)

	key := websearch.KeyFor("firecrawl", global.Keys)
	apiNeed := "no key — /key firecrawl <key>, or export " +
		websearch.Registry["firecrawl"].KeyEnv
	if key != "" {
		apiNeed = "key configured"
	}

	localNeed := "no Chromium-family browser found"
	if path, err := webfetch.BrowserPath(); err == nil {
		localNeed = path
	}

	lines := []string{
		fmt.Sprintf("api   (firecrawl)  %-3s  %s", onOff(api), apiNeed),
		fmt.Sprintf("local (browser)    %-3s  %s", onOff(local), localNeed),
	}

	detail, ok := research.DescribeFetcher(global)
	if ok {
		lines = append(lines, dimStyle.Render("→ "+detail))
	} else {
		lines = append(lines, errStyle.Render("→ "+detail))
	}
	if !api && !local {
		lines = append(lines, dimStyle.Render(
			"  single-page apps will come back close to empty with both off"))
	}
	return lines
}

func parseOnOff(v string) (bool, bool) {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "on", "yes", "true", "1":
		return true, true
	case "off", "no", "false", "0":
		return false, true
	}
	return false, false
}

func onOff(v bool) string {
	if v {
		return "on"
	}
	return "off"
}

func readerLabel(which string) string {
	if which == "api" {
		return "API (Firecrawl)"
	}
	return "local (browser)"
}
