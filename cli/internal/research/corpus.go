package research

import (
	"net/url"
	"sort"
	"strings"

	"kaioken/internal/webfetch"
	"kaioken/internal/websearch"
)

// Source is a page that reached the evidence pool, numbered for citation.
type Source struct {
	N     int
	URL   string
	Title string
	// Rank is the best position this page reached in any search result list;
	// it feeds the fusion ranking.
	Rank int
	// Fetched reports whether the page body was actually retrieved. An
	// unfetched source contributes nothing and is never cited.
	Fetched bool
}

// corpus accumulates search hits and fetched pages across rounds, assigning
// each distinct page a stable citation number the whole report refers to.
type corpus struct {
	sources []Source
	byURL   map[string]int // normalised URL → index into sources
	chunks  []Chunk
	// perHost caps how much of one site can dominate the evidence, so a
	// content farm with forty matching pages cannot crowd out everyone else.
	perHost    map[string]int
	maxPerHost int
}

func newCorpus(maxPerHost int) *corpus {
	if maxPerHost < 1 {
		maxPerHost = 3
	}
	return &corpus{
		byURL:      map[string]int{},
		perHost:    map[string]int{},
		maxPerHost: maxPerHost,
	}
}

// normalizeURL collapses the variants that would otherwise fetch the same page
// twice: scheme case, a trailing slash, the fragment, and the tracking
// parameters that follow links around the web.
func normalizeURL(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return raw
	}
	u.Fragment = ""
	u.Host = strings.ToLower(u.Host)
	u.Scheme = strings.ToLower(u.Scheme)
	u.Host = strings.TrimPrefix(u.Host, "www.")

	if q := u.Query(); len(q) > 0 {
		for key := range q {
			lk := strings.ToLower(key)
			if strings.HasPrefix(lk, "utm_") || lk == "fbclid" || lk == "gclid" || lk == "ref" || lk == "source" {
				q.Del(key)
			}
		}
		u.RawQuery = q.Encode()
	}
	if u.Path != "/" {
		u.Path = strings.TrimSuffix(u.Path, "/")
	}
	return u.String()
}

// addHits records search results, returning the URLs newly worth fetching.
// Duplicates and hosts already at their quota are dropped here rather than
// after a wasted download.
func (c *corpus) addHits(hits []websearch.Result, maxNew int) []string {
	// Best rank first, so the per-host quota is spent on the strongest hits.
	ordered := make([]websearch.Result, len(hits))
	copy(ordered, hits)
	sort.SliceStable(ordered, func(i, j int) bool { return ordered[i].Rank < ordered[j].Rank })

	var fresh []string
	for _, h := range ordered {
		if len(fresh) >= maxNew {
			break
		}
		norm := normalizeURL(h.URL)
		if norm == "" {
			continue
		}
		if idx, seen := c.byURL[norm]; seen {
			// Keep the best rank the page ever achieved.
			if h.Rank > 0 && h.Rank < c.sources[idx].Rank {
				c.sources[idx].Rank = h.Rank
			}
			continue
		}
		if err := webfetch.ValidateURL(h.URL); err != nil {
			continue // refuse it now; no point queueing a fetch that must fail
		}
		host := hostOf(norm)
		if c.perHost[host] >= c.maxPerHost {
			continue
		}
		c.perHost[host]++

		rank := h.Rank
		if rank <= 0 {
			rank = 1 << 20
		}
		c.sources = append(c.sources, Source{
			N: len(c.sources) + 1, URL: h.URL, Title: h.Title, Rank: rank,
		})
		c.byURL[norm] = len(c.sources) - 1
		fresh = append(fresh, h.URL)
	}
	return fresh
}

// addPages files fetched bodies against their sources and chunks them.
func (c *corpus) addPages(pages []*webfetch.Page) {
	for _, p := range pages {
		idx, ok := c.byURL[normalizeURL(p.URL)]
		if !ok {
			continue
		}
		c.sources[idx].Fetched = true
		if p.Title != "" {
			c.sources[idx].Title = p.Title
		}
		c.chunks = append(c.chunks, chunkText(c.sources[idx].N, p.Text)...)
	}
}

// pageRanks maps citation number → best search rank, for fusion.
func (c *corpus) pageRanks() map[int]int {
	m := make(map[int]int, len(c.sources))
	for _, s := range c.sources {
		m[s.N] = s.Rank
	}
	return m
}

// source returns the source carrying citation number n.
func (c *corpus) source(n int) (Source, bool) {
	if n < 1 || n > len(c.sources) {
		return Source{}, false
	}
	return c.sources[n-1], true
}

// cited returns the sources that were actually fetched, in citation order.
func (c *corpus) cited() []Source {
	out := make([]Source, 0, len(c.sources))
	for _, s := range c.sources {
		if s.Fetched {
			out = append(out, s)
		}
	}
	return out
}

func hostOf(raw string) string {
	if u, err := url.Parse(raw); err == nil {
		return strings.ToLower(u.Hostname())
	}
	return raw
}
