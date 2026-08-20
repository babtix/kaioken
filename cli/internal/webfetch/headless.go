package webfetch

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
)

// Reading the pages the plain fetcher could not.
//
// The order here is deliberately the cheap way round. Every batch goes to the
// HTTP fetcher first and only the pages that come back looking like an
// unrendered shell are read again in a browser. A round of ordinary article
// pages therefore never starts one: no proxy, no Chrome, no temp profile. The
// browser is a cost that only the pages needing it incur.
//
// Delegating the first pass rather than reimplementing it is load-bearing. The
// per-host serialisation and the pre-flight address check in Fetcher.FetchMany
// come along for free, which is exactly what FirecrawlFetcher.FetchMany lost
// by writing its own loop.

const (
	// maxRenders caps how many pages one batch will re-read. A ×10 round can
	// hand this forty URLs and each render costs seconds; without a cap the
	// escalation would eat the round's whole wall clock.
	maxRenders = 8

	// maxTabs caps concurrent renders. The workers figure the engine passes is
	// calibrated for sockets, but a tab is a renderer process holding tens of
	// megabytes, so it is not the right dial to follow up to sixteen.
	maxTabs = 4

	defaultPageTimeout   = 15 * time.Second
	defaultSettleTimeout = 5 * time.Second
	defaultStageTimeout  = 90 * time.Second
	browserLaunchTimeout = 20 * time.Second

	// tunnelGrace lets a tunnel outlive the render it serves just long enough
	// to finish, and no longer.
	tunnelGrace = 30 * time.Second
)

// desktopUA is what the browser reports. The plain fetcher identifies itself
// honestly as a research bot, but a page that needs rendering is usually one
// that varies its markup by client, and a bot string gets the stripped-down
// version that defeats the point of rendering at all.
const desktopUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
	"(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

// HeadlessFetcher reads pages over HTTP and re-reads the ones that came back
// unrendered in a local headless browser.
type HeadlessFetcher struct {
	http        PageFetcher
	browserPath string

	MaxBytes     int64
	PageTimeout  time.Duration
	StageTimeout time.Duration

	// rendered counts pages this fetcher re-read, so a caller can say how much
	// of a batch needed a browser.
	rendered atomic.Int64
}

// NewHeadless builds a fetcher that escalates to a local browser. fallback
// handles the first pass; nil means the built-in SSRF-guarded fetcher.
//
// It fails when no browser is installed, so a caller that asked for this tier
// explicitly hears about it. A caller that would be happy either way should
// treat the error as "use the plain fetcher".
func NewHeadless(fallback PageFetcher) (*HeadlessFetcher, error) {
	path, err := findBrowser()
	if err != nil {
		return nil, err
	}
	if fallback == nil {
		fallback = New()
	}
	return &HeadlessFetcher{
		http:         fallback,
		browserPath:  path,
		MaxBytes:     DefaultMaxBytes,
		PageTimeout:  defaultPageTimeout,
		StageTimeout: defaultStageTimeout,
	}, nil
}

// BrowserPath reports the browser this tier would launch, or an error naming
// what to install. Exported so a caller can probe without committing to a run.
func BrowserPath() (string, error) { return findBrowser() }

// Rendered reports how many pages this fetcher has re-read in a browser.
func (h *HeadlessFetcher) Rendered() int { return int(h.rendered.Load()) }

// FetchMany reads urls over HTTP, then re-reads whatever came back unrendered.
func (h *HeadlessFetcher) FetchMany(ctx context.Context, urls []string, workers int) ([]*Page, map[string]error) {
	pages, errs := h.http.FetchMany(ctx, urls, workers)
	if ctx.Err() != nil {
		return pages, errs
	}

	// Candidates in input order, so a batch renders the same way twice.
	type candidate struct {
		url   string
		index int // into pages, or -1 when it only ever failed
	}
	var todo []candidate
	byURL := map[string]int{}
	for i, p := range pages {
		byURL[p.URL] = i
	}
	for _, raw := range urls {
		if i, ok := byURL[raw]; ok {
			if looksUnrendered(pages[i]) {
				todo = append(todo, candidate{url: raw, index: i})
			}
			continue
		}
		if err, ok := errs[raw]; ok && statusInvitesRender(err) {
			todo = append(todo, candidate{url: raw, index: -1})
		}
	}
	if len(todo) == 0 {
		return pages, errs
	}
	if len(todo) > maxRenders {
		// The rest keep whatever the HTTP tier read. Rendered() reports how
		// many actually got a browser, so a caller can see the cap bite.
		todo = todo[:maxRenders]
	}

	stageCtx, cancelStage := context.WithTimeout(ctx, h.StageTimeout)
	defer cancelStage()

	sess, err := h.startSession(stageCtx)
	if err != nil {
		// Nothing is lost: every page the HTTP tier read is still here.
		return pages, errs
	}
	defer sess.close()

	var (
		mu     sync.Mutex
		hostMu sync.Map // host → *sync.Mutex
		sem    = make(chan struct{}, min(max(workers, 1), maxTabs))
		wg     sync.WaitGroup
	)
	for _, c := range todo {
		wg.Add(1)
		go func(c candidate) {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
			case <-stageCtx.Done():
				return
			}

			// One render at a time per host. This matters more than it does
			// on the HTTP path: a single render fans out into dozens of
			// subresource requests, and they leave from the user's own
			// address, so the reputational cost of hammering a site is
			// theirs.
			host := hostOf(c.url)
			lockAny, _ := hostMu.LoadOrStore(host, &sync.Mutex{})
			lock := lockAny.(*sync.Mutex)
			lock.Lock()
			defer lock.Unlock()

			rendered, err := sess.render(stageCtx, c.url, h.MaxBytes, h.PageTimeout)
			if err != nil {
				return // the HTTP result, good or bad, stands
			}

			mu.Lock()
			defer mu.Unlock()
			if c.index >= 0 {
				// Escalation exists to recover prose. A render that came back
				// with no more than the first pass already had did not do
				// that, and substituting it would risk trading a real page for
				// an error page that happens to contain words.
				if len(strings.TrimSpace(rendered.Text)) <= len(strings.TrimSpace(pages[c.index].Text)) {
					return
				}
				pages[c.index] = rendered
			} else {
				if strings.TrimSpace(rendered.Text) == "" {
					return
				}
				pages = append(pages, rendered)
				delete(errs, c.url)
			}
			h.rendered.Add(1)
		}(c)
	}
	wg.Wait()
	return pages, errs
}

// session is one browser and the proxy it is pointed at, alive for one batch.
//
// Per batch rather than per process on purpose: research is bursty, and a
// resident browser would idle at hundreds of megabytes between rounds. A fresh
// profile each time also means cookies and storage never carry from one round
// to the next.
type session struct {
	proxy      *guardProxy
	profileDir string
	cancelAll  context.CancelFunc
	cancelCtx  context.CancelFunc
	ctx        context.Context
}

func (h *HeadlessFetcher) startSession(ctx context.Context) (*session, error) {
	sweepStaleProfiles()

	profileDir, err := os.MkdirTemp("", "kaioken-chrome-")
	if err != nil {
		return nil, fmt.Errorf("headless profile: %w", err)
	}
	proxy, err := startGuardProxy(h.PageTimeout + tunnelGrace)
	if err != nil {
		os.RemoveAll(profileDir)
		return nil, err
	}

	allocCtx, cancelAll := chromedp.NewExecAllocator(ctx, h.allocatorOptions(profileDir, proxy.Addr())...)
	browserCtx, cancelCtx := chromedp.NewContext(allocCtx)

	// Bound the launch by racing it rather than by running it on a
	// cancellable child of browserCtx. chromedp ties the browser's first
	// target to the context Run is given, so cancelling that child on the way
	// out of this function would take the browser's initial target with it and
	// every later tab would open on a dead parent.
	launched := make(chan error, 1)
	go func() { launched <- chromedp.Run(browserCtx) }()

	var launchErr error
	select {
	case launchErr = <-launched:
	case <-time.After(browserLaunchTimeout):
		launchErr = fmt.Errorf("timed out after %s", browserLaunchTimeout)
	case <-ctx.Done():
		launchErr = ctx.Err()
	}
	if launchErr != nil {
		cancelCtx()
		cancelAll()
		proxy.Close()
		removeProfile(profileDir)
		return nil, fmt.Errorf("launching %s: %w", h.browserPath, launchErr)
	}

	return &session{
		proxy:      proxy,
		profileDir: profileDir,
		cancelAll:  cancelAll,
		cancelCtx:  cancelCtx,
		ctx:        browserCtx,
	}, nil
}

func (s *session) close() {
	s.cancelCtx()
	s.cancelAll()
	s.proxy.Close()
	removeProfile(s.profileDir)
}

// allocatorOptions builds the command line. The list is written out rather
// than layered over chromedp.DefaultExecAllocatorOptions because two of those
// defaults are wrong for reading hostile pages: it turns site isolation off,
// and it announces automation.
func (h *HeadlessFetcher) allocatorOptions(profileDir, proxyAddr string) []chromedp.ExecAllocatorOption {
	return []chromedp.ExecAllocatorOption{
		chromedp.ExecPath(h.browserPath),
		// Never the user's real profile. Pages here were chosen by a search
		// engine and a language model, and a logged-in profile would hand
		// every one of them the user's session cookies.
		chromedp.UserDataDir(profileDir),

		// Old headless is a separate, more detectable implementation that is
		// being removed; chromedp.Headless still emits the bare flag, so ask
		// for the new one explicitly.
		chromedp.Flag("headless", "new"),

		chromedp.Flag("proxy-server", "http://"+proxyAddr),
		// Chrome bypasses the proxy for localhost by default, which would let
		// a page reach a service on the user's own machine without ever
		// passing the address guard.
		chromedp.Flag("proxy-bypass-list", "<-loopback>"),
		// Without this Chrome may reach some origins over HTTP/3 directly and
		// skip the proxy altogether — the one flag whose absence silently
		// reopens everything the proxy exists to close.
		chromedp.Flag("disable-quic", true),
		// The other way out is UDP. An HTTP/CONNECT proxy only carries TCP,
		// so WebRTC opens its own sockets straight through the host stack:
		// a page could probe local UDP services or push scraped text to an
		// arbitrary endpoint without any of it passing the address guard.
		// Nothing here needs peer connections, so refuse non-proxied UDP and
		// turn the feature off as well.
		chromedp.Flag("force-webrtc-ip-handling-policy", "disable_non_proxied_udp"),
		chromedp.Flag("webrtc-ip-handling-policy", "disable_non_proxied_udp"),

		// chromedp adds --no-sandbox by itself when running as root. The
		// renderer sandbox is the boundary between a hostile page and the
		// user's account, and a failed render is a much better outcome than a
		// compromised one, so refuse it explicitly.
		chromedp.Flag("no-sandbox", false),
		// chromedp's defaults disable site-per-process. Keep site isolation
		// on: this browser runs untrusted script by design.
		chromedp.Flag("disable-features", "Translate,BlinkGenPropertyTrees,WebRTC,WebRtcHideLocalIpsWithMdns"),

		// Drop the automation tells. This defeats the crudest bot checks and
		// nothing more — Cloudflare, DataDome and friends fingerprint canvas,
		// WebGL, audio and timing, and are not fooled. Rendering single-page
		// apps is the goal here; clearing bot walls is not.
		chromedp.Flag("enable-automation", false),
		chromedp.Flag("disable-blink-features", "AutomationControlled"),
		chromedp.UserAgent(desktopUA),

		// Text is what gets extracted, and images are most of the bytes and
		// most of the wait.
		chromedp.Flag("blink-settings", "imagesEnabled=false"),
		// A tall viewport so content below the fold renders without scrolling.
		chromedp.WindowSize(1280, 2000),

		chromedp.NoFirstRun,
		chromedp.NoDefaultBrowserCheck,
		chromedp.DisableGPU,
		chromedp.Flag("disable-extensions", true),
		chromedp.Flag("disable-background-networking", true),
		chromedp.Flag("disable-component-update", true),
		chromedp.Flag("disable-client-side-phishing-detection", true),
		chromedp.Flag("disable-sync", true),
		chromedp.Flag("disable-default-apps", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("metrics-recording-only", true),
		chromedp.Flag("mute-audio", true),
		chromedp.Flag("no-service-autorun", true),
		chromedp.Flag("password-store", "basic"),
		chromedp.Flag("lang", "en-US"),

		chromedp.ModifyCmdFunc(func(cmd *exec.Cmd) { setBrowserProcAttr(cmd) }),
	}
}

// render reads one page in its own tab.
func (s *session) render(ctx context.Context, rawURL string, maxBytes int64, timeout time.Duration) (*Page, error) {
	// Cheap, and it keeps "never hand a bad scheme to a dialer" true at every
	// entry point rather than only the first.
	if err := ValidateURL(rawURL); err != nil {
		return nil, err
	}

	tabCtx, cancelTab := chromedp.NewContext(s.ctx)
	defer cancelTab()
	tabCtx, cancelTimeout := context.WithTimeout(tabCtx, timeout)
	defer cancelTimeout()

	var raw, final string
	err := chromedp.Run(tabCtx,
		navigate(rawURL),
		chromedp.WaitReady("body", chromedp.ByQuery),
		settle(defaultSettleTimeout),
		chromedp.Location(&final),
		chromedp.OuterHTML("html", &raw, chromedp.ByQuery),
	)
	if err != nil {
		return nil, fmt.Errorf("rendering %s: %w", rawURL, err)
	}

	if maxBytes <= 0 {
		maxBytes = DefaultMaxBytes
	}
	body := []byte(raw)
	truncated := int64(len(body)) > maxBytes
	if truncated {
		body = body[:maxBytes]
	}
	title, text := extract(body)
	if final == "" {
		final = rawURL
	}
	return &Page{
		URL:       rawURL,
		FinalURL:  final,
		Title:     title,
		Text:      text,
		Truncated: truncated,
		FetchedAt: time.Now(),
		Via:       "headless",
		// htmlLen stays zero, which is what stops looksUnrendered ever
		// choosing to render a render.
	}, nil
}

// navigate goes to rawURL and fails when the browser could not get there.
//
// chromedp.Navigate discards the errorText the protocol returns, so a refused
// connection or a blocked address looks like a successful navigation onto
// Chrome's own error page. That page has a body and real text in it, so
// without this check a render could replace a perfectly good page with the
// browser's "site cannot be reached" copy.
func navigate(rawURL string) chromedp.ActionFunc {
	return func(ctx context.Context) error {
		_, _, errorText, _, err := page.Navigate(rawURL).Do(ctx)
		if err != nil {
			return err
		}
		if errorText != "" {
			return fmt.Errorf("navigation failed: %s", errorText)
		}
		return nil
	}
}

// settle waits for the page's text to stop growing.
//
// A fixed sleep is wrong in both directions: too long for a page that is
// already done, too short for one still fetching. Two identical non-empty
// samples is a good enough signal that the framework has finished painting.
func settle(limit time.Duration) chromedp.ActionFunc {
	return func(ctx context.Context) error {
		deadline := time.Now().Add(limit)
		last := -1
		for time.Now().Before(deadline) {
			var n int
			if err := chromedp.Evaluate(`document.body ? document.body.innerText.length : 0`, &n).Do(ctx); err != nil {
				return nil // a page that will not answer is still worth reading
			}
			if n > 0 && n == last {
				return nil
			}
			last = n
			select {
			case <-time.After(250 * time.Millisecond):
			case <-ctx.Done():
				return nil
			}
		}
		return nil
	}
}

// removeProfile deletes a temp profile, retrying briefly.
//
// Windows holds a lock on files for a moment after the process that had them
// exits, so a single attempt fails spuriously. If it still will not go, leave
// it: it is under the system temp directory and the next run sweeps it.
func removeProfile(dir string) {
	for i := 0; i < 3; i++ {
		if err := os.RemoveAll(dir); err == nil {
			return
		}
		time.Sleep(200 * time.Millisecond)
	}
}

var sweepOnce sync.Once

// sweepStaleProfiles clears profiles a previous run could not delete, which
// happens when a wedged renderer outlives its browser. Once per process, and
// only for directories old enough that no live run could own them.
func sweepStaleProfiles() {
	sweepOnce.Do(func() {
		entries, err := os.ReadDir(os.TempDir())
		if err != nil {
			return
		}
		cutoff := time.Now().Add(-time.Hour)
		for _, e := range entries {
			if !e.IsDir() || !strings.HasPrefix(e.Name(), "kaioken-chrome-") {
				continue
			}
			info, err := e.Info()
			if err != nil || info.ModTime().After(cutoff) {
				continue
			}
			os.RemoveAll(filepath.Join(os.TempDir(), e.Name()))
		}
	})
}
