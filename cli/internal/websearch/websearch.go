// Package websearch queries a web search API on behalf of the research
// pipeline. No single search vendor is assumed: each is reached through the
// Provider interface, and the one to use is picked from whichever API key the
// user has configured, mirroring how internal/llm selects an LLM provider.
//
// Providers return ranked hits only — a URL, a title, and whatever snippet the
// vendor supplies. Fetching and reading the pages is deliberately somebody
// else's job (internal/webfetch), because a snippet is a teaser written to sell
// a click, not evidence.
package websearch

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Result is one search hit.
type Result struct {
	URL     string
	Title   string
	Snippet string
	// Rank is the 1-based position the provider gave this hit. Fusing several
	// result lists needs the original ordering, which is lost once they merge.
	Rank int
	// Provider names the search backend that returned the hit, so a report can
	// say where its evidence trail started.
	Provider string
}

// Provider performs a web search.
type Provider interface {
	// Name is the provider's registry key ("tavily", "brave", …).
	Name() string
	// Search returns at most limit hits for query, best first.
	Search(ctx context.Context, query string, limit int) ([]Result, error)
}

// Info describes how to reach a search vendor.
type Info struct {
	// KeyEnv is the environment variable consulted when the global config
	// holds no key for this provider.
	KeyEnv string
	// BaseURL is the API root. Tests override it to point at an httptest server.
	BaseURL string
	// Signup is shown when no provider is configured at all, so the error can
	// tell the user where to actually get a key.
	Signup string
}

// Registry lists the supported search vendors.
var Registry = map[string]Info{
	"tavily":    {KeyEnv: "TAVILY_API_KEY", BaseURL: "https://api.tavily.com", Signup: "https://tavily.com"},
	"firecrawl": {KeyEnv: "FIRECRAWL_API_KEY", BaseURL: "https://api.firecrawl.dev", Signup: "https://firecrawl.dev"},
	"brave":     {KeyEnv: "BRAVE_API_KEY", BaseURL: "https://api.search.brave.com", Signup: "https://brave.com/search/api"},
	"exa":       {KeyEnv: "EXA_API_KEY", BaseURL: "https://api.exa.ai", Signup: "https://exa.ai"},
}

// preference is the order providers are tried and fanned out. Tavily leads
// because its API is built for LLM consumption; Firecrawl follows because its
// index and scraper complement Tavily rather than duplicating it.
var preference = []string{"tavily", "firecrawl", "brave", "exa"}

// httpClient is shared by every provider. Search APIs are quick; a request
// that hangs past this is worth abandoning so the round can move on.
var httpClient = &http.Client{Timeout: 30 * time.Second}

// Resolve picks the search provider(s) to use.
//
//   - "" / "auto" / "both" / "all": every provider holding a key, fanned out
//     together — with Tavily and Firecrawl keys set, both engines answer every
//     query and their results are merged.
//   - a single name ("tavily", "firecrawl", …): that provider only.
//   - a comma- or plus-separated list ("tavily,firecrawl"): that subset.
//
// keys is the global config's provider→key map, consulted before each
// provider's environment variable.
func Resolve(prefer string, keys map[string]string) (Provider, error) {
	prefer = strings.ToLower(strings.TrimSpace(prefer))

	switch prefer {
	case "", "auto", "both", "all":
		var active []Provider
		for _, name := range preference {
			if key := KeyFor(name, keys); key != "" {
				p, err := build(name, key, Registry[name])
				if err != nil {
					return nil, err
				}
				active = append(active, p)
			}
		}
		return combined(active)
	}

	// Explicit name or subset.
	var active []Provider
	for _, name := range splitNames(prefer) {
		info, ok := Registry[name]
		if !ok {
			return nil, fmt.Errorf("unknown search provider %q (known: %s)", name, strings.Join(preference, ", "))
		}
		key := KeyFor(name, keys)
		if key == "" {
			return nil, fmt.Errorf("no API key for search provider %q — set it in %s or export %s (%s)",
				name, "~/.kaioken/config.yaml", info.KeyEnv, info.Signup)
		}
		p, err := build(name, key, info)
		if err != nil {
			return nil, err
		}
		active = append(active, p)
	}
	return combined(active)
}

// combined wraps the active providers: one is returned bare, several become a
// fan-out, none is the actionable "go get a key" error.
func combined(active []Provider) (Provider, error) {
	switch len(active) {
	case 0:
		var hints []string
		for _, name := range preference {
			hints = append(hints, fmt.Sprintf("%s (%s, %s)", name, Registry[name].KeyEnv, Registry[name].Signup))
		}
		return nil, fmt.Errorf("web research needs a search API key; configure one of:\n  %s",
			strings.Join(hints, "\n  "))
	case 1:
		return active[0], nil
	default:
		return &multi{providers: active}, nil
	}
}

// splitNames parses "tavily,firecrawl" / "tavily+firecrawl" into names,
// dropping empties and duplicates while preserving order.
func splitNames(s string) []string {
	seen := map[string]bool{}
	var out []string
	for _, part := range strings.FieldsFunc(s, func(r rune) bool {
		return r == ',' || r == '+' || r == ' '
	}) {
		name := strings.TrimSpace(part)
		if name != "" && !seen[name] {
			seen[name] = true
			out = append(out, name)
		}
	}
	return out
}

// KeyFor returns the API key for a registered provider: the global config's
// entry first, the provider's environment variable second, "" when neither is
// set. Exported so callers wiring the Firecrawl scraper can reuse the exact
// key the search side resolved.
func KeyFor(name string, keys map[string]string) string {
	if k := strings.TrimSpace(keys[name]); k != "" {
		return k
	}
	info, ok := Registry[name]
	if !ok {
		return ""
	}
	return strings.TrimSpace(os.Getenv(info.KeyEnv))
}

func build(name, key string, info Info) (Provider, error) {
	base := info.BaseURL
	switch name {
	case "tavily":
		return &tavily{key: key, base: base}, nil
	case "firecrawl":
		return &firecrawl{key: key, base: base}, nil
	case "brave":
		return &brave{key: key, base: base}, nil
	case "exa":
		return &exa{key: key, base: base}, nil
	}
	return nil, fmt.Errorf("unknown search provider %q", name)
}

// clampLimit keeps a request inside what the vendors will actually serve.
func clampLimit(limit int) int {
	if limit < 1 {
		return 1
	}
	if limit > 20 {
		return 20
	}
	return limit
}

// ---------------------------------------------------------------- providers

type tavily struct {
	key, base string
}

func (t *tavily) Name() string { return "tavily" }

func (t *tavily) Search(ctx context.Context, query string, limit int) ([]Result, error) {
	body, err := json.Marshal(map[string]any{
		"query":       query,
		"max_results": clampLimit(limit),
	})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, t.base+"/search", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+t.key)

	var out struct {
		Results []struct {
			Title   string `json:"title"`
			URL     string `json:"url"`
			Content string `json:"content"`
		} `json:"results"`
	}
	if err := do(req, "tavily", &out); err != nil {
		return nil, err
	}
	hits := make([]Result, 0, len(out.Results))
	for i, r := range out.Results {
		hits = append(hits, Result{
			URL: r.URL, Title: r.Title, Snippet: r.Content,
			Rank: i + 1, Provider: "tavily",
		})
	}
	return hits, nil
}

// firecrawl reaches Firecrawl's search API. Only the search endpoint lives
// here — the scrape endpoint is a fetcher concern (internal/webfetch), because
// this package's contract is ranked hits, not page bodies.
type firecrawl struct {
	key, base string
}

func (f *firecrawl) Name() string { return "firecrawl" }

func (f *firecrawl) Search(ctx context.Context, query string, limit int) ([]Result, error) {
	body, err := json.Marshal(map[string]any{
		"query": query,
		"limit": clampLimit(limit),
	})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, f.base+"/v1/search", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+f.key)

	var out struct {
		Data []struct {
			Title       string `json:"title"`
			URL         string `json:"url"`
			Description string `json:"description"`
		} `json:"data"`
	}
	if err := do(req, "firecrawl", &out); err != nil {
		return nil, err
	}
	hits := make([]Result, 0, len(out.Data))
	for i, r := range out.Data {
		hits = append(hits, Result{
			URL: r.URL, Title: r.Title, Snippet: r.Description,
			Rank: i + 1, Provider: "firecrawl",
		})
	}
	return hits, nil
}

type brave struct {
	key, base string
}

func (b *brave) Name() string { return "brave" }

func (b *brave) Search(ctx context.Context, query string, limit int) ([]Result, error) {
	u := b.base + "/res/v1/web/search?q=" + url.QueryEscape(query) +
		"&count=" + strconv.Itoa(clampLimit(limit))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Subscription-Token", b.key)

	var out struct {
		Web struct {
			Results []struct {
				Title       string `json:"title"`
				URL         string `json:"url"`
				Description string `json:"description"`
			} `json:"results"`
		} `json:"web"`
	}
	if err := do(req, "brave", &out); err != nil {
		return nil, err
	}
	hits := make([]Result, 0, len(out.Web.Results))
	for i, r := range out.Web.Results {
		hits = append(hits, Result{
			URL: r.URL,
			// Brave marks query terms with <strong> inside titles and
			// descriptions; the markup is noise once this reaches a prompt.
			Title:   stripTags(r.Title),
			Snippet: stripTags(r.Description),
			Rank:    i + 1, Provider: "brave",
		})
	}
	return hits, nil
}

type exa struct {
	key, base string
}

func (e *exa) Name() string { return "exa" }

func (e *exa) Search(ctx context.Context, query string, limit int) ([]Result, error) {
	body, err := json.Marshal(map[string]any{
		"query":      query,
		"numResults": clampLimit(limit),
	})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, e.base+"/search", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", e.key)

	var out struct {
		Results []struct {
			Title   string `json:"title"`
			URL     string `json:"url"`
			Text    string `json:"text"`
			Snippet string `json:"snippet"`
		} `json:"results"`
	}
	if err := do(req, "exa", &out); err != nil {
		return nil, err
	}
	hits := make([]Result, 0, len(out.Results))
	for i, r := range out.Results {
		snippet := r.Snippet
		if snippet == "" {
			snippet = r.Text
		}
		hits = append(hits, Result{
			URL: r.URL, Title: r.Title, Snippet: snippet,
			Rank: i + 1, Provider: "exa",
		})
	}
	return hits, nil
}

// ------------------------------------------------------------------ helpers

// do issues req and decodes a JSON reply into out. A failing search must say
// which provider refused and why: an expired key and an exhausted quota look
// identical once the error is flattened to "search failed".
func do(req *http.Request, provider string, out any) error {
	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("%s search: %w", provider, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// Bound the echoed body: an HTML error page would otherwise land
		// whole in the user's terminal.
		snippet := make([]byte, 512)
		n, _ := resp.Body.Read(snippet)
		msg := strings.TrimSpace(string(snippet[:n]))
		switch resp.StatusCode {
		case http.StatusUnauthorized, http.StatusForbidden:
			return fmt.Errorf("%s search: %s — check the API key", provider, resp.Status)
		case http.StatusTooManyRequests:
			return fmt.Errorf("%s search: rate limited (%s)", provider, resp.Status)
		}
		return fmt.Errorf("%s search: %s: %s", provider, resp.Status, msg)
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("%s search: decoding reply: %w", provider, err)
	}
	return nil
}

// stripTags removes HTML tags from a short vendor-supplied string. It is not a
// sanitiser — the text is headed for a prompt and a report, never a browser —
// just a way to keep <strong> markers out of the evidence.
func stripTags(s string) string {
	var b strings.Builder
	depth := 0
	for _, r := range s {
		switch {
		case r == '<':
			depth++
		case r == '>':
			if depth > 0 {
				depth--
			}
		case depth == 0:
			b.WriteRune(r)
		}
	}
	return strings.TrimSpace(b.String())
}
