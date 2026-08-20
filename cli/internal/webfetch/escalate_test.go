package webfetch

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// ── Escalation predicates ─────────────────────────────────────────────────

// shellDoc is the markup a single-page app serves: kilobytes of preload links
// and inline JSON wrapped around an empty root, with no prose at all until a
// script runs. It is the exact shape looksUnrendered exists to recognise.
func shellDoc() string {
	var sb strings.Builder
	sb.WriteString("<html><head><title>App</title>")
	for i := 0; i < 120; i++ {
		fmt.Fprintf(&sb, `<link rel="preload" as="script" href="/static/chunk-%04d.js">`, i)
	}
	sb.WriteString(`</head><body><div id="root"></div>`)
	sb.WriteString(`<script>window.__DATA__={"a":1};</script></body></html>`)
	return sb.String()
}

func TestLooksUnrenderedFlagsSPAShells(t *testing.T) {
	page := &Page{Text: "", htmlLen: len(shellDoc())}
	if page.htmlLen < shellMinHTML {
		t.Fatalf("fixture is only %d bytes, below the %d floor", page.htmlLen, shellMinHTML)
	}
	if !looksUnrendered(page) {
		t.Error("looksUnrendered = false, want true for a shell with no prose")
	}
}

func TestLooksUnrenderedIgnoresGenuinelyShortPages(t *testing.T) {
	// Small in both dimensions: a browser would add nothing here.
	page := &Page{Text: "Not found.", htmlLen: 400}
	if looksUnrendered(page) {
		t.Error("looksUnrendered = true, want false for a page that is simply short")
	}
}

func TestLooksUnrenderedIgnoresTruncatedBodies(t *testing.T) {
	page := &Page{Text: "", htmlLen: 2 << 20, Truncated: true}
	if looksUnrendered(page) {
		t.Error("looksUnrendered = true, want false when the body hit the byte cap")
	}
}

func TestLooksUnrenderedIgnoresPagesNotFromTheHTTPTier(t *testing.T) {
	// htmlLen is only ever set by Fetch, so a zero marks a page that was
	// already rendered or came from Firecrawl.
	page := &Page{Text: "", Via: "headless"}
	if looksUnrendered(page) {
		t.Error("looksUnrendered = true, want false for a page that was already rendered")
	}
	if looksUnrendered(nil) {
		t.Error("looksUnrendered(nil) = true, want false")
	}
}

func TestLooksUnrenderedIgnoresPagesThatReadFine(t *testing.T) {
	page := &Page{Text: strings.Repeat("real prose. ", 200), htmlLen: 40000}
	if looksUnrendered(page) {
		t.Error("looksUnrendered = true, want false for a page with plenty of text")
	}
}

func TestStatusInvitesRenderOnlyForBotWalls(t *testing.T) {
	invites := []int{http.StatusForbidden, http.StatusServiceUnavailable}
	for _, code := range invites {
		err := &ErrHTTPStatus{URL: "https://example.com", StatusCode: code}
		if !statusInvitesRender(err) {
			t.Errorf("statusInvitesRender(%d) = false, want true", code)
		}
	}
	// 429 is rate limiting, not a wall a browser clears — retrying in a
	// browser from the same address only makes it worse.
	declines := []int{
		http.StatusNotFound,
		http.StatusTooManyRequests,
		http.StatusInternalServerError,
		http.StatusMovedPermanently,
	}
	for _, code := range declines {
		err := &ErrHTTPStatus{URL: "https://example.com", StatusCode: code}
		if statusInvitesRender(err) {
			t.Errorf("statusInvitesRender(%d) = true, want false", code)
		}
	}
	if statusInvitesRender(errors.New("dial tcp: connection refused")) {
		t.Error("statusInvitesRender = true, want false for a non-status error")
	}
	if statusInvitesRender(nil) {
		t.Error("statusInvitesRender(nil) = true, want false")
	}
}

func TestFetchReportsANonOKStatusAsATypedError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	allowLoopbackForTest(t)
	f := New()
	_, err := f.Fetch(context.Background(), srv.URL)

	var se *ErrHTTPStatus
	if !errors.As(err, &se) {
		t.Fatalf("err = %v, want an *ErrHTTPStatus", err)
	}
	if se.StatusCode != http.StatusForbidden {
		t.Errorf("StatusCode = %d, want 403", se.StatusCode)
	}
	// The message text predates the type and callers may still read it.
	if !strings.Contains(err.Error(), "fetching "+srv.URL) {
		t.Errorf("Error() = %q, want it to keep the original wording", err.Error())
	}
}

func TestFetchRecordsTheHTMLLengthSignal(t *testing.T) {
	doc := shellDoc()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(doc))
	}))
	defer srv.Close()

	allowLoopbackForTest(t)
	f := New()
	page, err := f.Fetch(context.Background(), srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	if page.htmlLen != len(doc) {
		t.Errorf("htmlLen = %d, want %d", page.htmlLen, len(doc))
	}
	if page.Via != "http" {
		t.Errorf("Via = %q, want %q", page.Via, "http")
	}
	// The whole point: this page reaches the predicate looking unrendered.
	if !looksUnrendered(page) {
		t.Errorf("a served shell did not look unrendered (text %d bytes)", len(page.Text))
	}
}
