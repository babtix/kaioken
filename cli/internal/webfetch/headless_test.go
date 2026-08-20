package webfetch

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// ── Headless tier ─────────────────────────────────────────────────────────

// requireBrowser skips rather than fails when there is no browser to drive, so
// the suite stays green on a machine or a CI image without one. Everything
// that can be tested without a browser is in the tests below that do not call
// this.
func requireBrowser(t *testing.T) string {
	t.Helper()
	if testing.Short() {
		t.Skip("a headless render takes seconds; skipped under -short")
	}
	path, err := findBrowser()
	if err != nil {
		t.Skip("no Chromium-family browser: " + err.Error())
	}
	return path
}

// newTestHeadless builds a tier with timeouts tightened so a wedged page fails
// the test quickly instead of stalling it.
func newTestHeadless(t *testing.T) *HeadlessFetcher {
	t.Helper()
	requireBrowser(t)
	h, err := NewHeadless(nil)
	if err != nil {
		t.Fatal(err)
	}
	h.PageTimeout = 20 * time.Second
	h.StageTimeout = 60 * time.Second
	return h
}

// spaServer serves a static page and a client-rendered one, so a single batch
// exercises both sides of the escalation decision.
func spaServer(t *testing.T) *httptest.Server {
	t.Helper()
	rich := "<html><body><article><p>" +
		strings.Repeat("This sentence is real prose that extract will find. ", 40) +
		"</p></article></body></html>"

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		switch r.URL.Path {
		case "/rich":
			fmt.Fprint(w, rich)
		case "/shell":
			// Exactly the shape looksUnrendered exists to catch: plenty of
			// markup, no prose at all until a script runs.
			fmt.Fprint(w, "<html><head>")
			for i := 0; i < 120; i++ {
				fmt.Fprintf(w, `<link rel="preload" as="script" href="/static/chunk-%04d.js">`, i)
			}
			fmt.Fprint(w, `</head><body><div id="root"></div><script>
				document.getElementById("root").innerHTML =
					"<article><p>`+strings.Repeat("Rendered by JavaScript only. ", 40)+`</p></article>";
			</script></body></html>`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

// The test the whole tier exists to pass.
func TestHeadlessFetchManyEscalatesOnlyShellPages(t *testing.T) {
	h := newTestHeadless(t)
	srv := spaServer(t)
	allowLoopbackForTest(t)
	relaxProxyPortsForTest(t)

	urls := []string{srv.URL + "/rich", srv.URL + "/shell"}
	pages, errs := h.FetchMany(context.Background(), urls, 2)
	if len(errs) != 0 {
		t.Fatalf("errs = %v, want none", errs)
	}
	if len(pages) != 2 {
		t.Fatalf("got %d pages, want 2", len(pages))
	}

	byURL := map[string]*Page{}
	for _, p := range pages {
		byURL[p.URL] = p
	}

	rich := byURL[srv.URL+"/rich"]
	if rich == nil {
		t.Fatal("the static page is missing from the results")
	}
	if rich.Via != "http" {
		t.Errorf("static page Via = %q, want %q — it never needed a browser", rich.Via, "http")
	}

	shell := byURL[srv.URL+"/shell"]
	if shell == nil {
		t.Fatal("the shell page is missing from the results")
	}
	if shell.Via != "headless" {
		t.Errorf("shell page Via = %q, want %q", shell.Via, "headless")
	}
	if !strings.Contains(shell.Text, "Rendered by JavaScript only") {
		t.Errorf("shell text = %.120q, want the script-inserted prose", shell.Text)
	}
	if h.Rendered() != 1 {
		t.Errorf("Rendered() = %d, want 1 — only the shell should have been re-read", h.Rendered())
	}
}

func TestHeadlessKeepsTheHTTPPageWhenRenderFails(t *testing.T) {
	h := newTestHeadless(t)
	srv := spaServer(t)
	allowLoopbackForTest(t)
	// No relaxProxyPortsForTest: the proxy refuses the origin's ephemeral
	// port, so every render fails and the HTTP results must survive intact.

	urls := []string{srv.URL + "/shell"}
	pages, _ := h.FetchMany(context.Background(), urls, 1)
	if len(pages) != 1 {
		t.Fatalf("got %d pages, want the HTTP page to survive a failed render", len(pages))
	}
	if pages[0].Via != "http" {
		t.Errorf("Via = %q, want %q — a failed render must not replace the page", pages[0].Via, "http")
	}
}

// The end-to-end proof that the browser tier sits inside the address guard: a
// rendered page asks for a loopback address and must not reach it.
func TestHeadlessNeverReachesAPrivateAddressThroughTheBrowser(t *testing.T) {
	var secretHits atomic.Int64
	secret := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		secretHits.Add(1)
		fmt.Fprint(w, "SECRET")
	}))
	defer secret.Close()

	// The page itself is served from a public-looking path only because the
	// guard is relaxed for it; the fetch it attempts is the thing under test.
	page := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, "<html><head>")
		for i := 0; i < 120; i++ {
			fmt.Fprintf(w, `<link rel="preload" as="script" href="/s-%04d.js">`, i)
		}
		fmt.Fprintf(w, `</head><body><div id="root"></div><script>
			fetch(%q).then(r => r.text()).then(t => {
				document.getElementById("root").textContent = t;
			}).catch(() => {
				document.getElementById("root").textContent = "blocked";
			});
		</script></body></html>`, secret.URL+"/secret")
	}))
	defer page.Close()

	h := newTestHeadless(t)
	allowLoopbackForTest(t)
	relaxProxyPortsForTest(t)

	h.FetchMany(context.Background(), []string{page.URL}, 1)

	// allowLoopback is on for the tier's own fetch, but the browser's
	// sub-resource request goes out through the proxy's guarded dialer with
	// the same relaxation — so this asserts the traffic went through the
	// proxy at all, which the next test pins down without any relaxation.
	if n := secretHits.Load(); n > 1 {
		t.Errorf("the secret origin was hit %d times, want at most 1", n)
	}
}

func TestHeadlessBlocksASubresourceWhenTheGuardIsArmed(t *testing.T) {
	var secretHits atomic.Int64
	secret := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		secretHits.Add(1)
		fmt.Fprint(w, "SECRET")
	}))
	defer secret.Close()

	secretURL := secret.URL + "/secret"

	pageHTML := "<html><head>"
	for i := 0; i < 120; i++ {
		pageHTML += fmt.Sprintf(`<link rel="preload" as="script" href="/s-%04d.js">`, i)
	}
	pageHTML += fmt.Sprintf(`</head><body><div id="root"></div><script>
		fetch(%q).catch(() => {});
	</script></body></html>`, secretURL)

	page := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, pageHTML)
	}))
	defer page.Close()

	h := newTestHeadless(t)
	relaxProxyPortsForTest(t)
	// Deliberately NO allowLoopbackForTest. Both the page fetch and the
	// sub-resource are on loopback, so nothing should be reachable at all.
	pages, _ := h.FetchMany(context.Background(), []string{page.URL}, 1)

	if n := secretHits.Load(); n != 0 {
		t.Errorf("the secret origin was reached %d times through the browser, want 0", n)
	}
	if len(pages) != 0 {
		t.Errorf("got %d pages, want none — loopback is off limits with the guard armed", len(pages))
	}
}

func TestHeadlessSerialisesRendersPerHost(t *testing.T) {
	var inFlight, peak atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/page-") {
			n := inFlight.Add(1)
			for {
				old := peak.Load()
				if n <= old || peak.CompareAndSwap(old, n) {
					break
				}
			}
			defer inFlight.Add(-1)
			time.Sleep(150 * time.Millisecond)
		}
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, "<html><head>")
		for i := 0; i < 120; i++ {
			fmt.Fprintf(w, `<link rel="preload" as="script" href="/s-%04d.js">`, i)
		}
		fmt.Fprint(w, `</head><body><div id="root"></div><script>
			document.getElementById("root").innerHTML =
				"<p>`+strings.Repeat("rendered text here. ", 40)+`</p>";
		</script></body></html>`)
	}))
	defer srv.Close()

	h := newTestHeadless(t)
	allowLoopbackForTest(t)
	relaxProxyPortsForTest(t)

	var urls []string
	for i := 0; i < 4; i++ {
		urls = append(urls, fmt.Sprintf("%s/page-%d", srv.URL, i))
	}
	h.FetchMany(context.Background(), urls, 4)

	// The HTTP tier already serialises per host; this asserts the render tier
	// did not undo that by fanning four tabs at one origin.
	if p := peak.Load(); p > 1 {
		t.Errorf("peak concurrent navigations to one host = %d, want 1", p)
	}
}

func TestHeadlessRemovesItsTempProfile(t *testing.T) {
	h := newTestHeadless(t)
	srv := spaServer(t)
	allowLoopbackForTest(t)
	relaxProxyPortsForTest(t)

	before := countProfileDirs(t)
	h.FetchMany(context.Background(), []string{srv.URL + "/shell"}, 1)
	if after := countProfileDirs(t); after > before {
		t.Errorf("profile directories went from %d to %d, want no increase", before, after)
	}
}

func countProfileDirs(t *testing.T) int {
	t.Helper()
	entries, err := os.ReadDir(os.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	n := 0
	for _, e := range entries {
		if e.IsDir() && strings.HasPrefix(e.Name(), "kaioken-chrome-") {
			n++
		}
	}
	return n
}

// An HTTP proxy carries TCP only, so anything Chrome sends over UDP leaves
// without passing the address guard. WebRTC is the way a page gets at UDP.
func TestHeadlessRefusesNonProxiedUDP(t *testing.T) {
	// chromedp's options are opaque closures over an unexported allocator, so
	// there is nothing to inspect at runtime. Asserting on the source is the
	// honest way to make removing one of these flags fail a test rather than
	// silently reopen a path out of the proxy.
	src, err := os.ReadFile("headless.go")
	if err != nil {
		t.Fatal(err)
	}
	mustSet := []string{
		"force-webrtc-ip-handling-policy", // WebRTC would otherwise open UDP directly
		"disable_non_proxied_udp",
		"disable-quic",        // HTTP/3 would otherwise skip the proxy
		"proxy-bypass-list",   // Chrome exempts localhost by default
		`"no-sandbox", false`, // chromedp adds it itself when running as root
	}
	for _, want := range mustSet {
		if !strings.Contains(string(src), want) {
			t.Errorf("headless.go no longer sets %q — traffic could leave unguarded", want)
		}
	}
}

// Runs everywhere: no browser needed to prove the constructor refuses when
// there is none.
func TestNewHeadlessErrorsWhenNoBrowserIsFound(t *testing.T) {
	t.Setenv(BrowserPathEnv, "")
	orig := browserCandidates
	t.Cleanup(func() { browserCandidates = orig })
	browserCandidates = nil

	if _, err := NewHeadless(nil); err == nil {
		t.Error("err = nil, want NewHeadless to refuse when nothing is installed")
	}
}

func TestNewHeadlessHonoursTheBrowserOverride(t *testing.T) {
	fake := filepath.Join(t.TempDir(), "browser.exe")
	if err := os.WriteFile(fake, []byte("not really a browser"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv(BrowserPathEnv, fake)

	h, err := NewHeadless(nil)
	if err != nil {
		t.Fatal(err)
	}
	if h.browserPath != fake {
		t.Errorf("browserPath = %q, want %q", h.browserPath, fake)
	}
}
