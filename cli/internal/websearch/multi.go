package websearch

import (
	"context"
	"fmt"
	"strings"
	"sync"
)

// multi fans a search out to several providers at once and merges their
// results. Two engines disagree about the web in useful ways: the overlap
// confirms consensus sources and the differences widen the evidence pool, so
// with more than one key configured the default is to ask them all.
type multi struct {
	providers []Provider
}

// Name joins the child names ("tavily+firecrawl") so run summaries and CLI
// output name the whole fan-out, and so callers can test membership.
func (m *multi) Name() string {
	names := make([]string, len(m.providers))
	for i, p := range m.providers {
		names[i] = p.Name()
	}
	return strings.Join(names, "+")
}

// Search queries every child in parallel. Individual failures are tolerated —
// one vendor's outage or exhausted quota must not blank the round — but a
// total washout errors with each provider's reason, because "search failed"
// alone leaves nothing to act on.
func (m *multi) Search(ctx context.Context, query string, limit int) ([]Result, error) {
	lists := make([][]Result, len(m.providers))
	errs := make([]error, len(m.providers))

	var wg sync.WaitGroup
	for i, p := range m.providers {
		wg.Add(1)
		go func(i int, p Provider) {
			defer wg.Done()
			lists[i], errs[i] = p.Search(ctx, query, limit)
		}(i, p)
	}
	wg.Wait()

	failed := 0
	var reasons []string
	for i, err := range errs {
		if err != nil {
			failed++
			reasons = append(reasons, m.providers[i].Name()+": "+err.Error())
		}
	}
	if failed == len(m.providers) {
		return nil, fmt.Errorf("every search provider failed:\n  %s", strings.Join(reasons, "\n  "))
	}

	return mergeResults(lists, limit), nil
}

// mergeResults interleaves the lists rank by rank and dedupes by URL.
//
// Interleaving matters because callers cap how many hits they keep: appending
// list after list would let the first provider crowd the second out entirely,
// which defeats the point of asking both. On a duplicate URL the better
// (lower) rank wins and the longer snippet is kept — one vendor's teaser is
// often another's paragraph.
func mergeResults(lists [][]Result, limit int) []Result {
	if limit < 1 {
		limit = 1
	}
	byURL := map[string]int{} // canonical URL → index into out
	var out []Result

	for pos := 0; ; pos++ {
		advanced := false
		for _, list := range lists {
			if pos >= len(list) {
				continue
			}
			advanced = true
			hit := list[pos]
			key := canonicalURL(hit.URL)
			if i, seen := byURL[key]; seen {
				kept := &out[i]
				if hit.Rank < kept.Rank {
					kept.Rank = hit.Rank
				}
				if len(hit.Snippet) > len(kept.Snippet) {
					kept.Snippet = hit.Snippet
				}
				continue
			}
			byURL[key] = len(out)
			out = append(out, hit)
		}
		if !advanced || len(out) >= limit {
			break
		}
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

// canonicalURL normalises just enough to catch the same page listed twice —
// scheme case, a trailing slash — without collapsing genuinely distinct URLs.
func canonicalURL(u string) string {
	u = strings.TrimSuffix(strings.TrimSpace(u), "/")
	if i := strings.Index(u, "://"); i > 0 {
		return strings.ToLower(u[:i]) + u[i:]
	}
	return u
}
