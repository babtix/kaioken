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
	// Snippet is the teaser the search engine returned. It is never evidence —
	// it is written to sell a click — but it is the only thing known about a
	// page before paying to fetch it, so it decides which pages get fetched.
	Snippet string
	// Tier is the domain-quality prior: 0 institutional, 1 ordinary, 2 low
	// signal. See hostTier.
	Tier int
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
//
// Which hits make the cut matters more than anything downstream: a round can
// only afford to read a fraction of what the searches returned, and a page
// that is never fetched can never be cited no matter how well it would have
// answered the question. Search rank alone is a weak signal for that choice —
// it answers "what matches these keywords", not "what would settle this
// question" — so three signals are fused instead:
//
//   - the engine's own ranking, which knows about authority and freshness;
//   - how well the title and snippet speak to focus, the question and its
//     subquestions, which is the only preview of the page available before
//     paying to download it;
//   - a domain-quality prior, so a statistics office outranks a forum post
//     that happens to use the same words.
func (c *corpus) addHits(hits []websearch.Result, maxNew int, focus string) []string {
	// Fold repeat sightings into what is already known, and keep only the hits
	// that are actually fetchable candidates.
	var cand []websearch.Result
	for _, h := range hits {
		norm := normalizeURL(h.URL)
		if norm == "" {
			continue
		}
		if idx, seen := c.byURL[norm]; seen {
			// Keep the best rank the page ever achieved.
			if h.Rank > 0 && h.Rank < c.sources[idx].Rank {
				c.sources[idx].Rank = h.Rank
			}
			if c.sources[idx].Snippet == "" {
				c.sources[idx].Snippet = h.Snippet
			}
			continue
		}
		if err := webfetch.ValidateURL(h.URL); err != nil {
			continue // refuse it now; no point queueing a fetch that must fail
		}
		cand = append(cand, h)
	}
	if len(cand) == 0 {
		return nil
	}

	var fresh []string
	for _, idx := range fuseHits(cand, focus) {
		if len(fresh) >= maxNew {
			break
		}
		h := cand[idx]
		norm := normalizeURL(h.URL)
		// The same URL can appear twice inside one merged hit list.
		if _, seen := c.byURL[norm]; seen {
			continue
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
			Snippet: h.Snippet, Tier: hostTier(host),
		})
		c.byURL[norm] = len(c.sources) - 1
		fresh = append(fresh, h.URL)
	}
	return fresh
}

// fuseHits orders candidate hits by fusing search rank, snippet relevance and
// domain quality. It returns indices into cand, best first.
func fuseHits(cand []websearch.Result, focus string) []int {
	byRank := make([]int, len(cand))
	for i := range cand {
		byRank[i] = i
	}
	sort.SliceStable(byRank, func(a, b int) bool {
		ra, rb := cand[byRank[a]].Rank, cand[byRank[b]].Rank
		if ra <= 0 {
			ra = 1 << 20
		}
		if rb <= 0 {
			rb = 1 << 20
		}
		return ra < rb
	})

	byTier := make([]int, len(cand))
	copy(byTier, byRank)
	sort.SliceStable(byTier, func(a, b int) bool {
		return hostTier(hostOf(cand[byTier[a]].URL)) < hostTier(hostOf(cand[byTier[b]].URL))
	})

	lists := [][]int{byRank, byTier}

	if strings.TrimSpace(focus) != "" {
		// Title and snippet together: a title carries the topic, a snippet
		// carries the specifics, and either alone loses half the signal.
		previews := make([]Chunk, len(cand))
		for i, h := range cand {
			previews[i] = Chunk{Text: h.Title + " \n " + h.Snippet}
		}
		// Weighting by rarity across this hit list is what separates the hits:
		// every result for "nuclear cost europe" contains those words, so only
		// the terms that do not appear everywhere carry information here.
		lex := newLexicon(previews)
		scores := make([]float64, len(cand))
		for i := range cand {
			scores[i] = keywordScore(previews[i].Text, focus, lex)
		}
		byText := make([]int, len(cand))
		copy(byText, byRank)
		sort.SliceStable(byText, func(a, b int) bool {
			return scores[byText[a]] > scores[byText[b]]
		})
		lists = append(lists, byText)
	}

	return rrfFuse(lists, 60)
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

// addDocs registers documents the shared store already holds — the deep
// path's fetches and the fast path's corpus on an escalation — giving each
// a citation number and chunking it for evidence selection. Documents the
// corpus knows already are skipped, so seeding a promoted run costs nothing.
func (c *corpus) addDocs(docs []Document) {
	for _, d := range docs {
		norm := canonicalID(d.ID)
		if _, seen := c.byURL[norm]; seen {
			continue
		}
		if d.Origin == OriginWeb && webfetch.ValidateURL(d.ID) != nil {
			continue
		}
		src := Source{
			N: len(c.sources) + 1, URL: d.ID, Title: d.Title,
			Rank: 1 << 20, Tier: hostTier(hostOf(d.ID)), Fetched: true,
		}
		c.sources = append(c.sources, src)
		c.byURL[norm] = len(c.sources) - 1
		c.chunks = append(c.chunks, chunkText(src.N, d.Content)...)
	}
}

// numberForID returns the citation number of the source holding id,
// bridging the store's documents and the corpus's citation numbers.
func (c *corpus) numberForID(id string) (int, bool) {
	idx, ok := c.byURL[canonicalID(id)]
	if !ok {
		return 0, false
	}
	return c.sources[idx].N, true
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

// ------------------------------------------------------------ domain quality

// Tiers are a prior, not a verdict. A government statistics page can be wrong
// and a forum post can contain the only correct answer on the internet; what
// the tier decides is only which pages are worth spending a fetch on when the
// budget allows ten out of forty. The lists are deliberately short: every
// entry is a domain whose relationship to primary evidence is unambiguous, and
// anything unlisted lands in the ordinary middle where the other two ranking
// signals decide.
const (
	tierPrimary  = 0 // statistics offices, standards bodies, journals, official filings
	tierOrdinary = 1 // the rest of the web
	tierLow      = 2 // user-generated feeds and content farms
)

// primarySuffixes are domain endings that indicate an official or academic
// publisher in most of the world.
var primarySuffixes = []string{
	".gov", ".gov.uk", ".mil", ".int", ".edu", ".ac.uk", ".edu.au", ".europa.eu",
}

// primaryHosts are institutions whose domains carry no such suffix.
var primaryHosts = []string{
	"iea.org", "irena.org", "iaea.org", "oecd.org", "worldbank.org", "imf.org",
	"un.org", "who.int", "wto.org", "bis.org", "ecb.europa.eu",
	"nature.com", "science.org", "sciencedirect.com", "arxiv.org", "pubmed.ncbi.nlm.nih.gov",
	"jstor.org", "springer.com", "wiley.com", "bmj.com", "thelancet.com",
	"ourworldindata.org", "statcan.gc.ca", "ons.gov.uk", "census.gov", "eia.gov",
}

// lowHosts are places where the text is user-generated, aggregated, or written
// for ad impressions. Reddit and Stack Exchange are deliberately absent: their
// answers are user-generated but frequently the best available source on
// practical questions.
var lowHosts = []string{
	"facebook.com", "instagram.com", "tiktok.com", "pinterest.com", "x.com",
	"twitter.com", "threads.net", "linkedin.com", "quora.com", "answers.com",
	"medium.com", "blogspot.com", "wordpress.com", "wixsite.com", "substack.com",
	"scribd.com", "coursehero.com", "studocu.com", "slideshare.net", "fandom.com",
	"ezinearticles.com", "buzzfeed.com",
}

// hostTier classifies a hostname. Matching is on the registrable-domain
// suffix, so "www.energy.ec.europa.eu" and "ec.europa.eu" land together and a
// lookalike like "facebook.com.phish.example" does not.
func hostTier(host string) int {
	host = strings.ToLower(strings.TrimPrefix(strings.TrimSpace(host), "www."))
	if host == "" {
		return tierOrdinary
	}
	for _, s := range primarySuffixes {
		if strings.HasSuffix(host, s) {
			return tierPrimary
		}
	}
	for _, h := range primaryHosts {
		if host == h || strings.HasSuffix(host, "."+h) {
			return tierPrimary
		}
	}
	for _, h := range lowHosts {
		if host == h || strings.HasSuffix(host, "."+h) {
			return tierLow
		}
	}
	return tierOrdinary
}
