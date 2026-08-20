package research

import (
	"fmt"
	"strings"

	"kaioken/internal/config"
	"kaioken/internal/webfetch"
	"kaioken/internal/websearch"
)

// Choosing how pages get read.
//
// This used to live, copied verbatim, at all four places that start a run —
// the CLI, the daemon, the MCP server and the TUI. One copy here means the
// rule is stated once and every surface gets the same answer, including the
// TUI, which held a cached config and could otherwise act on a stale setting.

// resolveFetcher picks the page-reading tier and describes the choice.
//
// The returned sentence is always set, including when the answer is a
// fallback, because "which fetcher am I actually getting" is the first thing
// anyone debugging a thin report wants to know.
func resolveFetcher(opts Options, global *config.Global) (Fetcher, string, error) {
	// The test seam wins outright: a stub fetcher means a test is driving the
	// loop without a network, and no config should override that.
	if opts.Fetcher != nil {
		return opts.Fetcher, "pages read by a caller-supplied fetcher", nil
	}

	mode := strings.ToLower(strings.TrimSpace(opts.FetcherMode))
	if mode == "" {
		mode = strings.ToLower(strings.TrimSpace(global.Research.FetcherMode))
	}

	// A Firecrawl key is enough on its own. This used to require Firecrawl to
	// also be in the active search set, so a user who held a key but pinned
	// tavily for search got no scraping from it at all — surprising, given
	// they had configured the thing. Holding the key is now the whole signal.
	//
	// It does mean a key configured only for search starts spending scrape
	// credits. fetcher_mode: http turns it off, and the tier is named in the
	// sentence this returns so the change is visible on the first run.
	firecrawlKey := websearch.KeyFor("firecrawl", global.Keys)

	switch mode {
	case "", "auto":
		base, rendering := headlessOrHTTP()
		if firecrawlKey != "" {
			return webfetch.NewFirecrawl(firecrawlKey, base),
				"pages read through Firecrawl, falling back to " + fallbackPhrase(rendering), nil
		}
		return base, tierPhrase(rendering), nil

	case "http":
		return webfetch.New(), "pages read over HTTP only", nil

	case "headless":
		// Asked for explicitly, so a missing browser is an error rather than
		// a quiet downgrade.
		h, err := webfetch.NewHeadless(nil)
		if err != nil {
			return nil, "", fmt.Errorf("fetcher mode %q: %w", mode, err)
		}
		return h, "pages read over HTTP, rendering the ones that come back empty", nil

	case "firecrawl":
		if firecrawlKey == "" {
			return nil, "", fmt.Errorf(
				"fetcher mode %q needs a Firecrawl API key — add it under keys in %s or set FIRECRAWL_API_KEY (https://firecrawl.dev)",
				mode, config.GlobalPath())
		}
		// The local tier is off in this mode, so the fallback is a plain
		// fetch. Launching a browser here would contradict the switch the
		// user set.
		return webfetch.NewFirecrawl(firecrawlKey, webfetch.New()),
			"pages read through Firecrawl, falling back to HTTP", nil

	default:
		return nil, "", fmt.Errorf("unknown fetcher mode %q (want auto, http, headless or firecrawl)", opts.FetcherMode)
	}
}

// headlessOrHTTP returns the best tier available without ever failing: the
// browser when there is one, the plain fetcher when there is not, and whether
// rendering is actually on. The caller did not insist on a browser, so not
// having one is a fact to report rather than a reason to stop.
//
// Note this also becomes Firecrawl's fallback, replacing the plain fetcher it
// used to fall back to. A page Firecrawl could not read is very often exactly
// the kind a browser can.
func headlessOrHTTP() (Fetcher, bool) {
	h, err := webfetch.NewHeadless(nil)
	if err != nil {
		return webfetch.New(), false
	}
	return h, true
}

// tierPhrase describes the tier as a standalone sentence.
func tierPhrase(rendering bool) string {
	if rendering {
		return "pages read over HTTP, rendering the ones that come back empty"
	}
	return "pages read over HTTP (no local browser found, so nothing is rendered)"
}

// fallbackPhrase describes the same tier as the tail of a longer sentence,
// so the Firecrawl case reads as one sentence rather than two joined by a
// comma.
func fallbackPhrase(rendering bool) string {
	if rendering {
		return "HTTP and a local browser"
	}
	return "HTTP (no local browser found)"
}

// The four modes are really two independent choices: whether a paid API reads
// the pages, and whether a local browser does. Settings surfaces present them
// that way — one switch each — while the config keeps storing a single name,
// so nothing on disk or on the command line has to change.
//
//	api   local   mode
//	 on    on     auto       Firecrawl when keyed, browser for what it misses
//	 on    off    firecrawl  API only, plain HTTP behind it
//	 off   on     headless   no API spend, browser for client-rendered pages
//	 off   off    http       plain fetches, nothing else

// FetcherToggles splits a stored mode into the two switches.
func FetcherToggles(mode string) (api, local bool) {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "firecrawl":
		return true, false
	case "headless":
		return false, true
	case "http":
		return false, false
	default: // "" and "auto"
		return true, true
	}
}

// FetcherModeFor is the inverse: the mode a pair of switches means. Both on
// gives "" rather than "auto", so choosing the default clears the setting
// instead of writing the word.
func FetcherModeFor(api, local bool) string {
	switch {
	case api && local:
		return ""
	case api:
		return "firecrawl"
	case local:
		return "headless"
	default:
		return "http"
	}
}

// FetcherModes lists the accepted values, for a settings surface that wants to
// offer them without hardcoding a second copy of the list.
var FetcherModes = []string{"auto", "firecrawl", "headless", "http"}

// ValidFetcherMode reports whether mode is one this package accepts. Empty is
// valid and means auto.
func ValidFetcherMode(mode string) bool {
	mode = strings.ToLower(strings.TrimSpace(mode))
	if mode == "" {
		return true
	}
	for _, m := range FetcherModes {
		if m == mode {
			return true
		}
	}
	return false
}

// DescribeFetcher reports in one sentence how pages will be read under the
// current configuration, and whether that configuration is usable.
//
// It answers by resolving the real thing rather than describing it separately,
// so a settings screen and an actual run can never disagree.
func DescribeFetcher(global *config.Global) (detail string, ok bool) {
	_, detail, err := resolveFetcher(Options{}, global)
	if err != nil {
		return err.Error(), false
	}
	return detail, true
}
