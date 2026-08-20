package webfetch

import (
	"errors"
	"net/http"
	"strings"
)

// Deciding when a page is worth reading twice.
//
// Rendering a page in a browser costs a renderer process and seconds of wall
// clock, so the headless tier only pays that for pages the cheap fetcher
// visibly failed to read. Both predicates here are deliberately conservative:
// a false negative leaves a page as thin as it is today, while a false
// positive spends the round's budget on a page that was already fine.

const (
	// shellMinHTML is the markup floor below which escalation is pointless.
	// A page has to be big enough to plausibly contain a script bundle before
	// "lots of markup, no prose" means anything.
	shellMinHTML = 4096

	// shellMaxText is the prose ceiling under which a page of that size looks
	// unrendered. It sits deliberately above the two 200-byte floors inside
	// extract (see extract.go, where a nearly-empty content container falls
	// back to the whole document): a page that already tripped that fallback
	// and still came back this thin is the one worth re-reading.
	shellMaxText = 600
)

// looksUnrendered reports whether p has the shape of a client-rendered shell:
// plenty of markup, almost no prose.
//
// The test is two-sided on purpose. A genuinely short page — a one-paragraph
// note, a 404 stub, a redirect landing page — is small in both dimensions and
// must not be escalated; there is nothing a browser would add. A single-page
// app is the opposite: kilobytes of preload links, inline JSON and script tags
// wrapped around an empty root div. Only the second shape passes.
func looksUnrendered(p *Page) bool {
	switch {
	case p == nil, p.htmlLen == 0:
		// htmlLen is only set by the HTTP tier, so a zero means this page was
		// already rendered (or came from Firecrawl). Never re-render a render.
		return false
	case p.Truncated:
		// The tail was discarded at MaxBytes, so the markup-to-text ratio
		// describes the cap rather than the page. A body that large almost
		// certainly carried real prose anyway.
		return false
	case p.htmlLen < shellMinHTML:
		return false
	}
	return len(strings.TrimSpace(p.Text)) < shellMaxText
}

// statusInvitesRender reports whether err is the kind of refusal a real
// browser sometimes clears.
//
// Only 403 and 503 qualify: those are how an interstitial challenge presents
// itself. 429 is deliberately excluded — that is rate limiting, and repeating
// the request from the same address in a browser makes it worse for us and
// ruder to the host. 404 and 5xx other than 503 are simply not there.
//
// This path is low yield by design; a browser from the same address usually
// meets the same wall. It earns its place because the cost is bounded by the
// per-batch render cap and a failure loses nothing: the original error stands.
func statusInvitesRender(err error) bool {
	var se *ErrHTTPStatus
	if !errors.As(err, &se) {
		return false
	}
	switch se.StatusCode {
	case http.StatusForbidden, http.StatusServiceUnavailable:
		return true
	}
	return false
}
