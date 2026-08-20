// Package webfetch downloads a web page and reduces it to readable text.
//
// Everything here treats the network as hostile. A research run fetches URLs
// chosen by a search engine and, indirectly, by a language model — never by a
// human who vouched for them — so the fetcher refuses to touch anything that
// is not a public HTTP endpoint, caps what a single response can cost, and
// hands back plain text rather than markup.
//
// The address check happens at dial time, not when the URL is parsed, so a
// hostname cannot resolve somewhere public during validation and somewhere
// private a moment later. That guard lives in dialer.go, shared by this
// fetcher and by the proxy the headless tier points a browser at.
package webfetch

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Page is a fetched document reduced to text.
type Page struct {
	// URL is what was requested; FinalURL is where redirects landed.
	URL      string
	FinalURL string
	Title    string
	Text     string
	// Truncated reports that the response hit MaxBytes and the tail was
	// discarded, so a caller can say so rather than silently quoting a
	// half-read page.
	Truncated bool
	FetchedAt time.Time
	// Via names the tier that produced this page: "http", "headless" or
	// "firecrawl". It is reported, not persisted — SourceStore.Put,
	// corpus.Source and the SavedSource wire shape the desktop reads all
	// stop at the text, and threading provenance into them is a wire change
	// that belongs with whatever surface would display it.
	Via string

	// htmlLen is the size of the markup this page was extracted from, kept
	// only so looksUnrendered can compare it against the text that came out.
	// A page with a lot of markup and almost no prose is the signature of a
	// client-rendered shell. Unexported because it is a detail of how the
	// page was read, not a property of the page.
	htmlLen int
}

// Defaults chosen so one hostile or merely enormous page cannot stall a round.
const (
	DefaultMaxBytes  = 2 << 20 // 2 MiB of HTML is a very long article
	DefaultTimeout   = 20 * time.Second
	maxRedirects     = 5
	defaultUserAgent = "kaioken-research/1.0 (+https://github.com/babtix/kaioken)"
)

// ErrBlockedAddress is returned when a URL resolves somewhere the fetcher
// refuses to go. It is deliberately distinguishable: a blocked address is a
// security decision, not a transient network failure to retry.
type ErrBlockedAddress struct{ Reason string }

func (e *ErrBlockedAddress) Error() string { return "blocked address: " + e.Reason }

// ErrHTTPStatus reports a response that arrived intact but was not a 200. It
// is typed so a caller can tell 403 (often a challenge page a real browser
// clears) from 404 (nothing there to clear), without matching on strings.
type ErrHTTPStatus struct {
	URL        string
	StatusCode int
	Status     string
}

func (e *ErrHTTPStatus) Error() string {
	return fmt.Sprintf("fetching %s: %s", e.URL, e.Status)
}

// Fetcher downloads pages. The zero value is not usable — call New.
type Fetcher struct {
	MaxBytes  int64
	UserAgent string
	client    *http.Client
}

// New returns a Fetcher wired to a client that validates every address it
// dials and follows a bounded number of redirects.
func New() *Fetcher {
	return &Fetcher{
		MaxBytes:  DefaultMaxBytes,
		UserAgent: defaultUserAgent,
		client: &http.Client{
			Transport:     guardedTransport(),
			Timeout:       DefaultTimeout,
			CheckRedirect: checkRedirect,
		},
	}
}

// allowLoopback relaxes the guard for loopback addresses only, so this
// package's own tests can reach an httptest server. Nothing outside a test
// sets it: there is deliberately no exported field, flag, or config key that
// reaches it, because "let this one internal host through" is exactly the
// concession an SSRF attempt needs.
var allowLoopback = false

// blockedIP names why ip is off limits, or returns "" when it is a public
// address. Everything that could reach the host, the local network, or a cloud
// metadata service is refused.
func blockedIP(ip net.IP) string {
	switch {
	case ip.IsLoopback():
		if allowLoopback {
			return ""
		}
		return "loopback " + ip.String()
	case ip.IsPrivate():
		return "private network " + ip.String()
	case ip.IsLinkLocalUnicast(), ip.IsLinkLocalMulticast():
		// Covers 169.254.169.254, the cloud instance metadata endpoint.
		return "link-local " + ip.String()
	case ip.IsInterfaceLocalMulticast(), ip.IsMulticast():
		return "multicast " + ip.String()
	case ip.IsUnspecified():
		return "unspecified " + ip.String()
	}
	if v4 := ip.To4(); v4 != nil {
		switch {
		case v4[0] == 0:
			// 0.0.0.0/8, "this host on this network" (RFC 6890). Only
			// 0.0.0.0 itself is IsUnspecified, but the whole block is
			// reserved and some kernels route 0.0.0.1 to loopback.
			return "this-host network " + ip.String()
		case v4[0] == 255:
			return "broadcast " + ip.String()
		case v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127:
			return "carrier-grade NAT " + ip.String()
		case v4[0] == 192 && v4[1] == 0 && v4[2] == 0:
			return "IETF protocol assignment " + ip.String()
		case v4[0] == 198 && (v4[1] == 18 || v4[1] == 19):
			return "benchmarking range " + ip.String()
		}
	}
	return ""
}

// checkScheme rejects anything that is not plain HTTP(S) — file://, gopher://
// and friends have no business in a web research pipeline.
func checkScheme(u *url.URL) error {
	switch strings.ToLower(u.Scheme) {
	case "http", "https":
		return nil
	default:
		return &ErrBlockedAddress{Reason: "scheme " + u.Scheme + " is not http(s)"}
	}
}

// ValidateURL is a cheap pre-flight check: it rejects bad schemes and literal
// IP addresses that are already known to be off limits, without paying for a
// DNS lookup. Hostnames still get the authoritative check at dial time.
func ValidateURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("unparseable URL %q: %w", raw, err)
	}
	if err := checkScheme(u); err != nil {
		return err
	}
	if u.Host == "" {
		return fmt.Errorf("URL %q has no host", raw)
	}
	if ip := net.ParseIP(u.Hostname()); ip != nil {
		if reason := blockedIP(ip); reason != "" {
			return &ErrBlockedAddress{Reason: reason}
		}
	}
	return nil
}

// Fetch downloads rawURL and returns it as text. Non-HTML responses are
// refused rather than decoded into noise.
func (f *Fetcher) Fetch(ctx context.Context, rawURL string) (*Page, error) {
	if err := ValidateURL(rawURL); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", f.UserAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1")
	req.Header.Set("Accept-Language", "en;q=0.9,*;q=0.5")

	resp, err := f.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching %s: %w", rawURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, &ErrHTTPStatus{URL: rawURL, StatusCode: resp.StatusCode, Status: resp.Status}
	}

	ctype := strings.ToLower(strings.TrimSpace(strings.SplitN(resp.Header.Get("Content-Type"), ";", 2)[0]))
	switch {
	case ctype == "" || strings.HasPrefix(ctype, "text/html"),
		strings.HasPrefix(ctype, "application/xhtml"),
		strings.HasPrefix(ctype, "text/plain"):
		// readable
	default:
		// PDFs are common and worth naming, since "unsupported" alone would
		// look like a bug to anyone watching a research run.
		if ctype == "application/pdf" {
			return nil, fmt.Errorf("fetching %s: PDF extraction is not supported yet", rawURL)
		}
		return nil, fmt.Errorf("fetching %s: unsupported content type %q", rawURL, ctype)
	}

	maxBytes := f.MaxBytes
	if maxBytes <= 0 {
		maxBytes = DefaultMaxBytes
	}
	// Read one byte past the cap so a response that exactly fills it can be
	// distinguished from one that overflowed.
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBytes+1))
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", rawURL, err)
	}
	truncated := int64(len(body)) > maxBytes
	if truncated {
		body = body[:maxBytes]
	}

	page := &Page{
		URL:       rawURL,
		FinalURL:  resp.Request.URL.String(),
		Truncated: truncated,
		FetchedAt: time.Now(),
		Via:       "http",
		htmlLen:   len(body),
	}
	if strings.HasPrefix(ctype, "text/plain") {
		page.Text = collapse(string(body))
		return page, nil
	}
	title, text := extract(body)
	page.Title, page.Text = title, text
	return page, nil
}

// FetchMany downloads urls concurrently, returning the pages that succeeded.
// Failures are reported per URL rather than aborting the batch: in research, a
// dead link is normal and the round should proceed with what it did get.
//
// Concurrency is capped globally by workers and to one request at a time per
// host, so a result set dominated by a single domain cannot hammer it.
func (f *Fetcher) FetchMany(ctx context.Context, urls []string, workers int) ([]*Page, map[string]error) {
	if workers < 1 {
		workers = 1
	}
	var (
		mu     sync.Mutex
		pages  []*Page
		errs   = map[string]error{}
		hostMu sync.Map // host → *sync.Mutex
		sem    = make(chan struct{}, workers)
		wg     sync.WaitGroup
	)

	for _, raw := range urls {
		wg.Add(1)
		go func(raw string) {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
			case <-ctx.Done():
				mu.Lock()
				errs[raw] = ctx.Err()
				mu.Unlock()
				return
			}

			// One in-flight request per host, so ten hits from the same site
			// queue instead of arriving at once.
			host := hostOf(raw)
			lockAny, _ := hostMu.LoadOrStore(host, &sync.Mutex{})
			lock := lockAny.(*sync.Mutex)
			lock.Lock()
			defer lock.Unlock()

			page, err := f.Fetch(ctx, raw)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				errs[raw] = err
				return
			}
			pages = append(pages, page)
		}(raw)
	}
	wg.Wait()
	return pages, errs
}

func hostOf(raw string) string {
	if u, err := url.Parse(raw); err == nil {
		return strings.ToLower(u.Hostname())
	}
	return raw
}
