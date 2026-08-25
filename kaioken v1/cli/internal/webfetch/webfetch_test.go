package webfetch

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// allowLoopbackForTest lets a test reach an httptest server, which always
// listens on loopback. Scoped to the one test that calls it so the guard is
// still armed everywhere else in this file.
func allowLoopbackForTest(t *testing.T) {
	t.Helper()
	allowLoopback = true
	t.Cleanup(func() { allowLoopback = false })
}

func TestBlockedIPCoversPrivateAndMetadataRanges(t *testing.T) {
	blocked := []string{
		"127.0.0.1",        // loopback
		"::1",              // IPv6 loopback
		"::ffff:127.0.0.1", // IPv4-mapped loopback
		"10.0.0.5",         // RFC1918
		"172.16.3.9",       // RFC1918
		"192.168.1.1",      // RFC1918
		"169.254.169.254",  // cloud instance metadata
		"fe80::1",          // IPv6 link-local
		"fd00::1",          // IPv6 unique-local
		"0.0.0.0",          // unspecified
		"255.255.255.255",  // broadcast
		"224.0.0.1",        // multicast
		"100.64.0.1",       // carrier-grade NAT
		"198.18.0.1",       // benchmarking
	}
	for _, s := range blocked {
		ip := net.ParseIP(s)
		if ip == nil {
			t.Fatalf("test bug: %q is not an IP", s)
		}
		if reason := blockedIP(ip); reason == "" {
			t.Errorf("blockedIP(%s) allowed it; want blocked", s)
		}
	}

	allowed := []string{"8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"}
	for _, s := range allowed {
		if reason := blockedIP(net.ParseIP(s)); reason != "" {
			t.Errorf("blockedIP(%s) = %q; want allowed", s, reason)
		}
	}
}

func TestValidateURLRejectsSchemesAndLiteralPrivateIPs(t *testing.T) {
	bad := []string{
		"file:///etc/passwd",
		"gopher://example.com",
		"ftp://example.com/x",
		"http://127.0.0.1:8080/admin",
		"http://169.254.169.254/latest/meta-data/",
		"http://[::1]/",
		"https://10.1.2.3/internal",
	}
	for _, u := range bad {
		if err := ValidateURL(u); err == nil {
			t.Errorf("ValidateURL(%q) = nil; want an error", u)
		}
	}
	for _, u := range []string{"https://example.com/a", "http://example.org/b?c=d"} {
		if err := ValidateURL(u); err != nil {
			t.Errorf("ValidateURL(%q) = %v; want nil", u, err)
		}
	}
}

// The dial-time guard is what actually stops DNS rebinding, so it must fire
// even when the URL passed the cheap pre-flight check (a hostname, not a
// literal IP, that resolves to loopback).
func TestFetchBlocksHostnameResolvingToLoopback(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("<html><body>should never be read</body></html>"))
	}))
	defer srv.Close()

	// srv.URL is http://127.0.0.1:PORT — swap in localhost so ValidateURL
	// sees a hostname and only the dialer can catch it.
	_, port, err := net.SplitHostPort(strings.TrimPrefix(srv.URL, "http://"))
	if err != nil {
		t.Fatal(err)
	}
	target := "http://localhost:" + port + "/"

	if err := ValidateURL(target); err != nil {
		t.Fatalf("pre-flight rejected %q, so this test would not prove anything: %v", target, err)
	}

	_, err = New().Fetch(context.Background(), target)
	if err == nil {
		t.Fatal("Fetch succeeded against loopback; the dial-time guard did not fire")
	}
	var blocked *ErrBlockedAddress
	if !errors.As(err, &blocked) && !strings.Contains(err.Error(), "blocked address") {
		t.Errorf("err = %v, want a blocked-address error", err)
	}
}

func TestFetchRejectsNonHTMLContentTypes(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/pdf")
		w.Write([]byte("%PDF-1.4"))
	}))
	defer srv.Close()

	allowLoopbackForTest(t)
	f := New()
	_, err := f.Fetch(context.Background(), srv.URL)
	if err == nil || !strings.Contains(err.Error(), "PDF") {
		t.Errorf("err = %v, want a PDF-specific message", err)
	}
}

func TestFetchTruncatesOversizedBodies(t *testing.T) {
	big := "<html><body><p>" + strings.Repeat("x", 5000) + "</p></body></html>"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(big))
	}))
	defer srv.Close()

	allowLoopbackForTest(t)
	f := New()
	f.MaxBytes = 1000
	page, err := f.Fetch(context.Background(), srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	if !page.Truncated {
		t.Error("Truncated = false, want true for a body past MaxBytes")
	}
	if len(page.Text) > 1000 {
		t.Errorf("text length %d exceeds the byte cap", len(page.Text))
	}
}

func TestFetchExtractsTitleAndText(t *testing.T) {
	const doc = `<html><head><title>Solar Costs</title></head>
	<body>
	  <nav class="site-nav">Home About Contact</nav>
	  <div class="cookie-banner">We use cookies. Accept?</div>
	  <main>
	    <h1>Solar in Europe</h1>
	    <p>Utility-scale solar fell below EUR 40 per MWh in 2024.</p>
	    <p>Capacity factors remain around 15 percent.</p>
	  </main>
	  <footer>Copyright 2026</footer>
	  <script>var tracker = 1;</script>
	</body></html>`

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(doc))
	}))
	defer srv.Close()

	allowLoopbackForTest(t)
	f := New()
	page, err := f.Fetch(context.Background(), srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	if page.Title != "Solar Costs" {
		t.Errorf("Title = %q", page.Title)
	}
	for _, want := range []string{"Utility-scale solar fell below", "Capacity factors"} {
		if !strings.Contains(page.Text, want) {
			t.Errorf("text is missing %q; got:\n%s", want, page.Text)
		}
	}
	for _, unwanted := range []string{"cookies", "tracker", "Home About Contact", "Copyright"} {
		if strings.Contains(page.Text, unwanted) {
			t.Errorf("boilerplate %q survived extraction; got:\n%s", unwanted, page.Text)
		}
	}
}

func TestExtractFallsBackWhenMainIsEmpty(t *testing.T) {
	// Single-page apps ship an empty <main>; the real prose sits elsewhere.
	const doc = `<html><head><title>T</title></head><body>
	  <main></main>
	  <div class="content"><p>` + `The actual article body lives here and is quite long indeed. ` +
		`It easily clears the two hundred character floor that triggers the fallback path in extract, ` +
		`which exists precisely so an empty content container cannot swallow the page.</p></div>
	</body></html>`

	title, text := extract([]byte(doc))
	if title != "T" {
		t.Errorf("title = %q", title)
	}
	if !strings.Contains(text, "The actual article body") {
		t.Errorf("fallback did not recover the body; got:\n%s", text)
	}
}

func TestExtractRendersListsAndHeadings(t *testing.T) {
	const doc = `<html><body><article>
		<h2>Findings</h2><ul><li>First point</li><li>Second point</li></ul>
		<p>Closing paragraph that pads this article past the length floor so the
		article container is preferred over the whole document body.</p>
	</article></body></html>`

	_, text := extract([]byte(doc))
	if !strings.Contains(text, "- First point") || !strings.Contains(text, "- Second point") {
		t.Errorf("list markers missing; got:\n%s", text)
	}
	if strings.Contains(text, "First pointSecond point") {
		t.Errorf("list items ran together; got:\n%s", text)
	}
}

func TestCollapseNormalisesWhitespace(t *testing.T) {
	got := collapse("  a   b  \n\n\n\n  c  \n \n d ")
	want := "a b\n\nc\n\nd"
	if got != want {
		t.Errorf("collapse = %q, want %q", got, want)
	}
}

// A dead link must not sink the batch: research runs always hit some.
func TestFetchManyReportsPerURLFailures(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/gone" {
			http.Error(w, "gone", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte("<html><body><p>Good page content here.</p></body></html>"))
	}))
	defer srv.Close()

	allowLoopbackForTest(t)
	f := New()

	pages, errs := f.FetchMany(context.Background(),
		[]string{srv.URL + "/ok", srv.URL + "/gone", "file:///etc/passwd"}, 4)

	if len(pages) != 1 {
		t.Errorf("got %d pages, want 1", len(pages))
	}
	if len(errs) != 2 {
		t.Errorf("got %d errors, want 2: %v", len(errs), errs)
	}
	if _, ok := errs["file:///etc/passwd"]; !ok {
		t.Error("the file:// URL should have been refused")
	}
}

// ── Firecrawl scraper ────────────────────────────────────────────────────────

func TestFirecrawlScrapeHappyPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer fc-test" {
			t.Errorf("Authorization = %q", got)
		}
		w.Write([]byte(`{"success":true,"data":{
			"markdown":"# Hello World\n\nSome content here.",
			"metadata":{"title":"Hello World","sourceURL":"https://example.com/page"}}}`))
	}))
	defer srv.Close()

	ff := NewFirecrawl("fc-test", nil)
	ff.base = srv.URL

	pages, errs := ff.FetchMany(context.Background(), []string{"https://example.com/page"}, 2)
	if len(errs) != 0 {
		t.Fatalf("unexpected errors: %v", errs)
	}
	if len(pages) != 1 {
		t.Fatalf("got %d pages, want 1", len(pages))
	}
	p := pages[0]
	if p.Title != "Hello World" {
		t.Errorf("Title = %q", p.Title)
	}
	if !strings.Contains(p.Text, "Some content here") {
		t.Errorf("Text = %q, want markdown content", p.Text)
	}
	if p.FinalURL != "https://example.com/page" {
		t.Errorf("FinalURL = %q", p.FinalURL)
	}
}

func TestFirecrawlFallsBackOnFailure(t *testing.T) {
	// Firecrawl returns 500 for every URL; the fallback (built-in) serves
	// success pages. The scraper must hand the URLs off and succeed.
	fcSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "server error", http.StatusInternalServerError)
	}))
	defer fcSrv.Close()

	// Fallback that always returns a fixed page for any URL.
	allowLoopbackForTest(t)
	okSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte("<html><body><p>Fallback page content.</p></body></html>"))
	}))
	defer okSrv.Close()

	builtIn := New()
	ff := NewFirecrawl("fc-key", builtIn)
	ff.base = fcSrv.URL

	// Use the okSrv URL as the page to fetch — the Firecrawl scrape fails,
	// then the built-in fetcher fetches directly from okSrv.
	pages, errs := ff.FetchMany(context.Background(), []string{okSrv.URL + "/article"}, 2)
	if len(errs) != 0 {
		t.Fatalf("expected fallback to succeed, got errors: %v", errs)
	}
	if len(pages) != 1 {
		t.Fatalf("got %d pages, want 1", len(pages))
	}
	if !strings.Contains(pages[0].Text, "Fallback page content") {
		t.Errorf("Text = %q, want fallback content", pages[0].Text)
	}
}
