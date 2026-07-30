package webfetch

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// FirecrawlBase is the API root, a variable so tests can point it at an
// httptest server — the same seam the websearch providers use.
var FirecrawlBase = "https://api.firecrawl.dev"

// PageFetcher is the FetchMany shape research.Options.Fetcher expects; both
// *Fetcher and *FirecrawlFetcher satisfy it.
type PageFetcher interface {
	FetchMany(ctx context.Context, urls []string, workers int) ([]*Page, map[string]error)
}

// FirecrawlFetcher reads pages through Firecrawl's scrape API instead of a
// direct GET. Firecrawl renders JavaScript and negotiates bot walls, so it
// reads pages the plain fetcher cannot — but it is also a paid quota, so any
// per-URL failure falls back to the built-in fetcher rather than losing the
// page outright.
//
// SSRF note: the URL is still validated locally before it is sent. Firecrawl
// fetches from its own network, so the local address guard is moot for the
// remote side — but there is no reason to spend quota asking a third party to
// fetch file:// or an RFC1918 address, and the fallback path (our own dialer)
// must never see them.
type FirecrawlFetcher struct {
	key      string
	base     string
	client   *http.Client
	fallback PageFetcher
}

// NewFirecrawl builds a Firecrawl-backed page fetcher. fallback handles URLs
// Firecrawl cannot serve; nil means fall back to the built-in SSRF-guarded
// fetcher.
func NewFirecrawl(key string, fallback PageFetcher) *FirecrawlFetcher {
	if fallback == nil {
		fallback = New()
	}
	return &FirecrawlFetcher{
		key:      key,
		base:     FirecrawlBase,
		client:   &http.Client{Timeout: 60 * time.Second}, // scraping renders JS; slower than a GET
		fallback: fallback,
	}
}

// scrape asks Firecrawl for one page as markdown.
func (f *FirecrawlFetcher) scrape(ctx context.Context, rawURL string) (*Page, error) {
	body, err := json.Marshal(map[string]any{
		"url":     rawURL,
		"formats": []string{"markdown"},
	})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, f.base+"/v1/scrape", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+f.key)

	resp, err := f.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("firecrawl scrape %s: %w", rawURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		snippet := make([]byte, 256)
		n, _ := resp.Body.Read(snippet)
		return nil, fmt.Errorf("firecrawl scrape %s: %s: %s",
			rawURL, resp.Status, strings.TrimSpace(string(snippet[:n])))
	}

	var out struct {
		Success bool `json:"success"`
		Data    struct {
			Markdown string `json:"markdown"`
			Metadata struct {
				Title     string `json:"title"`
				SourceURL string `json:"sourceURL"`
			} `json:"metadata"`
		} `json:"data"`
	}
	// Bound the decode the same way the built-in fetcher bounds a body: a
	// hostile page can be arbitrarily large even as markdown.
	if err := json.NewDecoder(io.LimitReader(resp.Body, DefaultMaxBytes)).Decode(&out); err != nil {
		return nil, fmt.Errorf("firecrawl scrape %s: decoding reply: %w", rawURL, err)
	}
	if !out.Success || strings.TrimSpace(out.Data.Markdown) == "" {
		return nil, fmt.Errorf("firecrawl scrape %s: empty result", rawURL)
	}

	final := out.Data.Metadata.SourceURL
	if final == "" {
		final = rawURL
	}
	return &Page{
		URL:       rawURL,
		FinalURL:  final,
		Title:     out.Data.Metadata.Title,
		Text:      collapse(out.Data.Markdown),
		FetchedAt: time.Now(),
	}, nil
}

// FetchMany scrapes urls concurrently through Firecrawl, falling back to the
// built-in fetcher per URL on failure. The error map only carries URLs that
// both paths failed on.
func (f *FirecrawlFetcher) FetchMany(ctx context.Context, urls []string, workers int) ([]*Page, map[string]error) {
	if workers < 1 {
		workers = 1
	}
	var (
		mu       sync.Mutex
		pages    []*Page
		errs     = map[string]error{}
		fallback []string
		sem      = make(chan struct{}, workers)
		wg       sync.WaitGroup
	)

	for _, raw := range urls {
		// Pre-flight locally: a blocked scheme or address is refused before
		// any quota is spent, and never reaches the fallback dialer either.
		if err := ValidateURL(raw); err != nil {
			errs[raw] = err
			continue
		}
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
			page, err := f.scrape(ctx, raw)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				fallback = append(fallback, raw)
				return
			}
			pages = append(pages, page)
		}(raw)
	}
	wg.Wait()

	if len(fallback) > 0 && ctx.Err() == nil {
		fbPages, fbErrs := f.fallback.FetchMany(ctx, fallback, workers)
		pages = append(pages, fbPages...)
		for u, err := range fbErrs {
			errs[u] = err
		}
	}
	return pages, errs
}
