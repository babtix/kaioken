// Package research answers a question from the open web.
//
// The pipeline is a loop, not a pass: it decomposes the question, searches,
// fetches and reads pages, reasons over what it found, then asks itself what
// is still missing and searches again for exactly that. The loop is what
// separates research from a single search — a first round almost always
// answers the easy half of a question and leaves the load-bearing half thin.
//
// Two properties matter more than the pipeline shape:
//
//   - Every fetched page is untrusted input. It is fenced before it reaches a
//     prompt (see fenceUntrusted) and the prompts covering it say plainly that
//     the content is data, never instructions.
//   - Every claim is traceable. Pages are numbered when they enter the corpus
//     and that number is the only way the model may cite them, so a citation
//     in the report always resolves to a page that was actually read.
package research

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"

	"kaioken/internal/llm"
	"kaioken/internal/webfetch"
	"kaioken/internal/websearch"
)

// Options control how wide and how deep a run goes.
type Options struct {
	// Multiplier is the kaioken ×N dial: it scales subquestions, queries per
	// round, and pages fetched. 1 is a quick look, 3 the default, 10 unwise.
	Multiplier int
	// MaxRounds caps the search→read→reason→gap loop. Zero derives it from
	// the multiplier.
	MaxRounds int
	// Concurrency bounds parallel searches, fetches and reasoning calls.
	Concurrency int
	// Fetcher overrides how pages are retrieved. Production leaves this nil
	// to get the SSRF-guarded webfetch.Fetcher; tests substitute a stub so the
	// loop can be exercised without reaching the network.
	Fetcher Fetcher
}

// Fetcher retrieves pages in bulk. *webfetch.Fetcher satisfies it.
type Fetcher interface {
	FetchMany(ctx context.Context, urls []string, workers int) ([]*webfetch.Page, map[string]error)
}

// Progress reports what a run is doing. Every field may be nil.
type Progress struct {
	Stage  func(string)
	Round  func(n, of int)
	Detail func(string)
}

func (p Progress) stage(s string) {
	if p.Stage != nil {
		p.Stage(s)
	}
}
func (p Progress) detail(s string) {
	if p.Detail != nil {
		p.Detail(s)
	}
}
func (p Progress) round(n, of int) {
	if p.Round != nil {
		p.Round(n, of)
	}
}

// Report is the outcome of a run.
type Report struct {
	Question   string
	Markdown   string
	Sources    []Source
	Rounds     int
	Searched   int // queries issued
	Fetched    int // pages read
	Elapsed    time.Duration
	Incomplete bool // the loop hit MaxRounds with gaps still open
}

// evidenceBudget caps how much fetched text one reasoning call may carry.
// Generous enough for a dozen passages, small enough that a modest context
// window survives a round.
const evidenceBudget = 24000

// Run executes the research loop and returns the finished report.
func Run(ctx context.Context, client *llm.Client, search websearch.Provider,
	question string, opts Options, pg Progress) (*Report, error) {

	started := time.Now()
	question = strings.TrimSpace(question)
	if question == "" {
		return nil, fmt.Errorf("no question given")
	}

	mult := clampInt(opts.Multiplier, 1, 10)
	rounds := opts.MaxRounds
	if rounds <= 0 {
		// More depth buys more rounds, but with a hard ceiling: each round
		// costs a full search-fetch-reason cycle.
		rounds = clampInt(1+mult/2, 1, 5)
	}
	workers := clampInt(opts.Concurrency, 1, 16)

	var (
		maxSubs      = clampInt(2*mult, 2, 12)
		queriesPer   = clampInt(mult, 1, 4)
		maxQueries   = clampInt(3*mult, 3, 24)
		resultsPer   = clampInt(2+mult, 3, 12)
		newPagesMax  = clampInt(4*mult, 4, 40)
		chunksPerSub = clampInt(3+mult, 4, 14)
	)

	pg.stage("planning")
	subs, err := decompose(ctx, client, question, maxSubs)
	if err != nil {
		return nil, err
	}
	pg.detail(fmt.Sprintf("%d subquestions", len(subs)))

	queries, err := searchQueries(ctx, client, question, subs, queriesPer, maxQueries)
	if err != nil {
		return nil, err
	}

	fetcher := opts.Fetcher
	if fetcher == nil {
		fetcher = webfetch.New()
	}
	pool := newCorpus(clampInt(mult, 2, 5))

	var (
		findings   []finding
		searched   int
		roundsRun  int
		incomplete bool
	)

	for round := 1; round <= rounds; round++ {
		pg.round(round, rounds)
		roundsRun = round

		pg.stage(fmt.Sprintf("searching (%d queries)", len(queries)))
		hits, err := searchAll(ctx, search, queries, resultsPer, workers)
		if err != nil {
			// A total search failure in round 1 is fatal; later it just means
			// this round adds nothing, and what is already gathered stands.
			if round == 1 {
				return nil, err
			}
			pg.detail("search failed: " + err.Error())
			break
		}
		searched += len(queries)

		fresh := pool.addHits(hits, newPagesMax)
		pg.stage(fmt.Sprintf("reading %d pages", len(fresh)))
		pages, ferrs := fetcher.FetchMany(ctx, fresh, workers)
		pool.addPages(pages)
		if len(ferrs) > 0 {
			pg.detail(fmt.Sprintf("%d of %d pages unreadable", len(ferrs), len(fresh)))
		}

		if len(pool.cited()) == 0 {
			if round == rounds {
				return nil, fmt.Errorf("no readable sources found for %q", question)
			}
			pg.detail("nothing readable yet; widening the search")
			continue
		}

		pg.stage("reading evidence")
		findings, err = answerAll(ctx, client, subs, pool, chunksPerSub, workers)
		if err != nil {
			return nil, err
		}

		if round == rounds {
			// No point asking what is missing when nothing more will be done
			// about it; the limitations section covers it instead.
			incomplete = anyLowConfidence(findings)
			break
		}

		pg.stage("checking for gaps")
		gaps, err := detectGaps(ctx, client, question, findings, maxQueries)
		if err != nil {
			pg.detail("gap check failed: " + err.Error())
			break
		}
		if gaps.Complete || len(gaps.Queries) == 0 {
			pg.detail("evidence is sufficient")
			break
		}
		pg.detail(fmt.Sprintf("%d gap(s); searching again", len(gaps.Missing)))
		queries = gaps.Queries
		incomplete = true
	}

	if len(findings) == 0 {
		return nil, fmt.Errorf("no findings produced for %q", question)
	}

	pg.stage("writing the report")
	sources := pool.cited()
	md, err := synthesize(ctx, client, question, findings, sources)
	if err != nil {
		return nil, err
	}

	// Only sources the report actually cites belong in the reference list; a
	// page that was read and found irrelevant is not a reference.
	used := citedSources(md, sources)

	return &Report{
		Question:   question,
		Markdown:   md,
		Sources:    used,
		Rounds:     roundsRun,
		Searched:   searched,
		Fetched:    len(sources),
		Elapsed:    time.Since(started),
		Incomplete: incomplete,
	}, nil
}

// searchAll runs every query in parallel and flattens the hits. Individual
// query failures are tolerated; only a total washout is an error.
func searchAll(ctx context.Context, provider websearch.Provider, queries []string,
	perQuery, workers int) ([]websearch.Result, error) {

	results := make([][]websearch.Result, len(queries))

	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(workers)
	var failures int
	var mu sync.Mutex

	for i, q := range queries {
		i, q := i, q
		g.Go(func() error {
			hits, err := provider.Search(gctx, q, perQuery)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				failures++
				return nil // tolerated; counted below
			}
			results[i] = hits
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return nil, err
	}
	if failures == len(queries) && len(queries) > 0 {
		return nil, fmt.Errorf("every search query failed (%d of %d)", failures, len(queries))
	}

	var all []websearch.Result
	for _, hits := range results {
		all = append(all, hits...)
	}
	return all, nil
}

// answerAll reasons over the evidence for every subquestion in parallel.
func answerAll(ctx context.Context, client *llm.Client, subs []string,
	pool *corpus, chunksPerSub, workers int) ([]finding, error) {

	ranks := pool.pageRanks()
	out := make([]finding, len(subs))

	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(workers)
	for i, sub := range subs {
		i, sub := i, sub
		g.Go(func() error {
			top := rankChunks(pool.chunks, sub, ranks, chunksPerSub)
			if len(top) == 0 {
				out[i] = finding{
					Question:   sub,
					Answer:     "No retrieved source addressed this.",
					Confidence: "low",
					Gaps:       "no matching evidence was found",
				}
				return nil
			}
			parts := make([]string, 0, len(top))
			for _, ch := range top {
				src, ok := pool.source(ch.SourceN)
				if !ok {
					continue
				}
				parts = append(parts, fenceUntrusted(src.N, src.URL, src.Title, ch.Text))
			}
			f, err := answerSubquestion(gctx, client, sub, budgetChunks(parts, evidenceBudget))
			if err != nil {
				return err
			}
			out[i] = dropInventedCitations(f, pool)
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return nil, err
	}
	return out, nil
}

// dropInventedCitations removes citation ids that do not correspond to a page
// actually read. Models occasionally cite a plausible-looking number; a
// reference that resolves to nothing is worse than no reference, because it
// reads as verified.
func dropInventedCitations(f finding, pool *corpus) finding {
	kept := f.Citations[:0]
	for _, n := range f.Citations {
		if src, ok := pool.source(n); ok && src.Fetched {
			kept = append(kept, n)
		}
	}
	f.Citations = kept
	return f
}

// citedSources returns the sources whose citation markers appear in the
// report body, in numeric order.
func citedSources(markdown string, sources []Source) []Source {
	var used []Source
	for _, s := range sources {
		if strings.Contains(markdown, fmt.Sprintf("[%d]", s.N)) {
			used = append(used, s)
		}
	}
	sort.Slice(used, func(i, j int) bool { return used[i].N < used[j].N })
	if len(used) == 0 {
		// A report with no inline markers still needs its evidence listed,
		// or the reader has no way to check anything.
		return sources
	}
	return used
}

// Markdown renders the report as the file written to disk: the body plus a
// reference list, so the document is self-contained once it leaves the tool.
func (r *Report) Render() string {
	var b strings.Builder
	fmt.Fprintf(&b, "# %s\n\n", r.Question)
	b.WriteString(r.Markdown)
	b.WriteString("\n\n## Sources\n\n")
	for _, s := range r.Sources {
		title := s.Title
		if strings.TrimSpace(title) == "" {
			title = s.URL
		}
		fmt.Fprintf(&b, "%d. [%s](%s)\n", s.N, title, s.URL)
	}
	fmt.Fprintf(&b, "\n---\n\nResearched with kaioken: %d quer%s, %d page%s read, %s.\n",
		r.Searched, plural(r.Searched, "y", "ies"),
		r.Fetched, plural(r.Fetched, "", "s"),
		r.Elapsed.Round(time.Second))
	if r.Incomplete {
		b.WriteString("Some subquestions remained thinly evidenced when the round limit was reached.\n")
	}
	return b.String()
}

func anyLowConfidence(findings []finding) bool {
	for _, f := range findings {
		if strings.EqualFold(f.Confidence, "low") {
			return true
		}
	}
	return false
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
