package research

import (
	"testing"

	"kaioken/internal/webfetch"
	"kaioken/internal/websearch"
)

func TestNormalizeURLCollapsesEquivalentForms(t *testing.T) {
	same := []string{
		"https://Example.com/page",
		"https://example.com/page/",
		"https://www.example.com/page#section",
		"https://example.com/page?utm_source=newsletter&utm_campaign=x",
	}
	want := normalizeURL(same[0])
	for _, u := range same[1:] {
		if got := normalizeURL(u); got != want {
			t.Errorf("normalizeURL(%q) = %q, want %q", u, got, want)
		}
	}
	// A meaningful query parameter must survive; only tracking is stripped.
	if normalizeURL("https://example.com/p?id=7") == normalizeURL("https://example.com/p") {
		t.Error("a significant query parameter was stripped")
	}
}

func TestCorpusDedupesAndNumbersSources(t *testing.T) {
	c := newCorpus(5)
	hits := []websearch.Result{
		{URL: "https://a.example/one", Title: "One", Rank: 1},
		{URL: "https://a.example/one/", Title: "One again", Rank: 2}, // same page
		{URL: "https://b.example/two", Title: "Two", Rank: 3},
	}
	fresh := c.addHits(hits, 10)
	if len(fresh) != 2 {
		t.Fatalf("got %d fresh URLs, want 2 after dedupe: %v", len(fresh), fresh)
	}
	if len(c.sources) != 2 {
		t.Fatalf("got %d sources, want 2", len(c.sources))
	}
	if c.sources[0].N != 1 || c.sources[1].N != 2 {
		t.Errorf("citation numbers = %d,%d; want 1,2", c.sources[0].N, c.sources[1].N)
	}
}

func TestCorpusKeepsBestRankOnRepeatSighting(t *testing.T) {
	c := newCorpus(5)
	c.addHits([]websearch.Result{{URL: "https://a.example/x", Rank: 8}}, 10)
	c.addHits([]websearch.Result{{URL: "https://a.example/x", Rank: 2}}, 10)
	if got := c.sources[0].Rank; got != 2 {
		t.Errorf("Rank = %d, want the better rank 2 retained", got)
	}
}

// One prolific domain must not be able to fill the entire evidence pool.
func TestCorpusEnforcesPerHostQuota(t *testing.T) {
	c := newCorpus(2)
	var hits []websearch.Result
	for i := 0; i < 6; i++ {
		hits = append(hits, websearch.Result{
			URL:  "https://spam.example/page" + string(rune('a'+i)),
			Rank: i + 1,
		})
	}
	hits = append(hits, websearch.Result{URL: "https://other.example/p", Rank: 99})

	fresh := c.addHits(hits, 20)
	if len(fresh) != 3 {
		t.Fatalf("got %d URLs, want 2 from the quota-limited host plus 1 other: %v", len(fresh), fresh)
	}
	var spam int
	for _, s := range c.sources {
		if hostOf(s.URL) == "spam.example" {
			spam++
		}
	}
	if spam != 2 {
		t.Errorf("%d pages from one host, want the quota of 2", spam)
	}
}

func TestCorpusRefusesUnsafeURLs(t *testing.T) {
	c := newCorpus(5)
	fresh := c.addHits([]websearch.Result{
		{URL: "http://169.254.169.254/latest/meta-data/", Rank: 1},
		{URL: "file:///etc/passwd", Rank: 2},
		{URL: "https://ok.example/p", Rank: 3},
	}, 10)
	if len(fresh) != 1 || fresh[0] != "https://ok.example/p" {
		t.Errorf("fresh = %v; only the public https URL should be queued", fresh)
	}
}

func TestCorpusOnlyCitesFetchedPages(t *testing.T) {
	c := newCorpus(5)
	c.addHits([]websearch.Result{
		{URL: "https://a.example/one", Rank: 1},
		{URL: "https://b.example/two", Rank: 2},
	}, 10)

	c.addPages([]*webfetch.Page{{
		URL:   "https://a.example/one",
		Title: "Fetched title",
		Text:  "Some real content about solar power in Europe during 2024.",
	}})

	cited := c.cited()
	if len(cited) != 1 {
		t.Fatalf("got %d cited sources, want only the fetched one", len(cited))
	}
	if cited[0].Title != "Fetched title" {
		t.Errorf("Title = %q, want the fetched page title to win", cited[0].Title)
	}
	if len(c.chunks) == 0 {
		t.Error("fetched page produced no chunks")
	}
}

func TestDropInventedCitations(t *testing.T) {
	c := newCorpus(5)
	c.addHits([]websearch.Result{
		{URL: "https://a.example/one", Rank: 1},
		{URL: "https://b.example/two", Rank: 2},
	}, 10)
	c.addPages([]*webfetch.Page{{URL: "https://a.example/one", Text: "content"}})

	// 1 was fetched, 2 was not, 99 never existed.
	got := dropInventedCitations(finding{Citations: []int{1, 2, 99}}, c)
	if len(got.Citations) != 1 || got.Citations[0] != 1 {
		t.Errorf("Citations = %v, want only [1]", got.Citations)
	}
}

func TestCitedSourcesFiltersToMarkersUsed(t *testing.T) {
	sources := []Source{
		{N: 1, URL: "https://a.example"},
		{N: 2, URL: "https://b.example"},
		{N: 3, URL: "https://c.example"},
	}
	got := citedSources("Solar is cheap [1] and nuclear is steady [3].", sources)
	if len(got) != 2 || got[0].N != 1 || got[1].N != 3 {
		t.Errorf("cited = %+v, want sources 1 and 3", got)
	}

	// A report with no markers still needs its evidence listed.
	if all := citedSources("no markers here", sources); len(all) != 3 {
		t.Errorf("got %d sources, want all 3 as a fallback", len(all))
	}
}

func TestReportRenderIncludesSourcesAndStats(t *testing.T) {
	r := &Report{
		Question: "Is solar cheaper?",
		Markdown: "## Short answer\nYes [1].",
		Sources:  []Source{{N: 1, URL: "https://a.example", Title: "A"}},
		Searched: 6, Fetched: 4,
	}
	out := r.Render()
	for _, want := range []string{"# Is solar cheaper?", "Yes [1].", "## Sources", "1. [A](https://a.example)", "6 queries", "4 pages read"} {
		if !containsStr(out, want) {
			t.Errorf("rendered report missing %q:\n%s", want, out)
		}
	}
}

func containsStr(hay, needle string) bool {
	return len(hay) >= len(needle) && (func() bool {
		for i := 0; i+len(needle) <= len(hay); i++ {
			if hay[i:i+len(needle)] == needle {
				return true
			}
		}
		return false
	})()
}
