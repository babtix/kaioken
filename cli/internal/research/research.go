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
	// round, pages fetched, and how much evidence each reasoning call sees.
	// 1 is a quick look, 3 the default, 10 unwise.
	Multiplier int
	// MaxRounds caps the search→read→reason→gap loop. Zero derives it from
	// the multiplier.
	MaxRounds int
	// Concurrency bounds parallel searches, fetches and reasoning calls.
	Concurrency int
	// MaxDuration stops the loop once a run has taken this long, reporting
	// what it has rather than running until the context is cancelled. Zero
	// means no limit beyond ctx. Rounds are only ever abandoned between
	// stages, so a report is always written from whatever was gathered.
	MaxDuration time.Duration
	// Fetcher overrides how pages are retrieved. Production leaves this nil
	// to get the SSRF-guarded webfetch.Fetcher; tests substitute a stub so the
	// loop can be exercised without reaching the network.
	Fetcher Fetcher
	// Now overrides the clock the prompts are told about. Tests set it so a
	// prompt assertion does not depend on the day it runs.
	Now time.Time
	// Deep forces the long-form dossier below ×10. At ×10 it is on regardless.
	Deep bool
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
	Incomplete bool // the run ended with subquestions still thinly evidenced
	// Warnings record what went wrong without sinking the run: searches that
	// failed, a time budget that ran out. They belong in the report because a
	// reader judging the answer needs to know it was assembled under a
	// constraint.
	Warnings []string
	// Deep is set when the run produced a long-form dossier. It carries the
	// structured material a PDF needs and a four-section Markdown report does
	// not have room for: the section outline, the full findings register, every
	// query issued and every page reached.
	Deep *Deep
}

// Deep is the long-form dossier a ×10 run produces.
type Deep struct {
	// Summary is the short answer, set on the cover so the document leads with
	// its conclusion.
	Summary  string
	Sections []DeepSection
	Findings []FindingNote
	Queries  []string
	// Scanned is every page the run reached, whether or not it could be read
	// and whether or not it was cited. It is the audit trail for the claim
	// that a deep run covered the ground.
	Scanned []ScannedPage
}

// DeepSection is one chapter of the dossier.
type DeepSection struct {
	Title    string
	Markdown string
}

// FindingNote is one subquestion's answer, for the findings register.
type FindingNote struct {
	Question   string
	Answer     string
	Confidence string
	Gaps       string
	Citations  []int
}

// ScannedPage is one page the run reached.
type ScannedPage struct {
	N     int
	URL   string
	Title string
	Tier  int
	// Read reports that the body was retrieved; a page can be reached, refused
	// and still belong in the log, because "we tried and it would not load" is
	// part of an honest account of the coverage.
	Read  bool
	Cited bool
}

// Words counts the dossier body, which is what decides whether the document
// reaches its page floor.
func (d *Deep) Words() int {
	var n int
	for _, s := range d.Sections {
		n += len(strings.Fields(s.Markdown))
	}
	return n
}

// evidenceBudget is how much fetched text one reasoning call may carry, in
// characters, at ×1. It scales with the multiplier: depth means seeing more of
// what was read, not only reading more pages.
//
// The previous fixed pairing of a 24000-character ceiling with a cap of a
// dozen passages meant the ceiling was never reached — a round selected about
// four thousand characters of evidence and left five sixths of its own budget
// unspent on the most expensive call in the pipeline.
const evidenceBudgetPerX = 8000

// maxEvidenceBudget keeps a ×10 run inside a modest context window.
const maxEvidenceBudget = 48000

// DeepMultiplier is the ×N at which research stops producing an answer and
// starts producing a dossier.
const DeepMultiplier = 10

// plan is the set of limits one run works inside, derived from the ×N dial.
// Gathering them in one place makes the difference between the everyday modes
// and the deep one legible: below ×10 the numbers grow smoothly, at ×10 they
// step up to a different kind of run.
type plan struct {
	rounds      int
	maxSubs     int
	queriesPer  int
	maxQueries  int
	resultsPer  int
	newPagesMax int
	perHost     int
	evidence    int
	// deep turns on the long-form dossier: a sectioned document with its own
	// outline, registers and appendices, rather than a four-section report.
	deep bool
}

// planFor derives the limits for a multiplier. force turns the deep profile on
// below ×10, which is what the -deep flag does.
//
// The ×10 profile is deliberately not an extrapolation of the others. It is a
// different product: eight rounds of up to sixty new pages each, so a hard
// question is worked until roughly three hundred pages have been read rather
// than until a fixed budget runs out. It costs accordingly — this is the mode
// you reach for when the answer matters more than the bill.
func planFor(mult int, force bool) plan {
	p := plan{
		// More depth buys more rounds, but with a ceiling: each round costs a
		// full search-fetch-reason cycle.
		rounds:      clampInt(1+mult/2, 1, 5),
		maxSubs:     clampInt(2*mult, 2, 12),
		queriesPer:  clampInt(mult, 1, 4),
		maxQueries:  clampInt(3*mult, 3, 24),
		resultsPer:  clampInt(2+mult, 3, 12),
		newPagesMax: clampInt(4*mult, 4, 40),
		perHost:     clampInt(mult, 2, 5),
		evidence:    clampInt(evidenceBudgetPerX*mult, evidenceBudgetPerX, maxEvidenceBudget),
	}
	if mult >= DeepMultiplier || force {
		p.rounds = 8
		p.maxSubs = 20
		p.queriesPer = 4
		p.maxQueries = 32
		p.resultsPer = 20 // 32 queries x 20 results feeds 60 fetches after dedupe
		p.newPagesMax = 60
		p.perHost = 6
		p.evidence = maxEvidenceBudget
		p.deep = true
	}
	return p
}

// ScanCeiling reports the most pages a run at this multiplier will read. It is
// the honest answer to "how much of the web does ×10 actually cover", and the
// CLI prints it before a deep run starts so the cost is not a surprise.
func ScanCeiling(mult int, deep bool) int {
	p := planFor(clampInt(mult, 1, 10), deep)
	return p.rounds * p.newPagesMax
}

// Run executes the research loop and returns the finished report.
func Run(ctx context.Context, client *llm.Client, search websearch.Provider,
	question string, opts Options, pg Progress) (*Report, error) {

	started := time.Now()
	question = strings.TrimSpace(question)
	if question == "" {
		return nil, fmt.Errorf("no question given")
	}

	mult := clampInt(opts.Multiplier, 1, 10)
	p := planFor(mult, opts.Deep)
	rounds := p.rounds
	if opts.MaxRounds > 0 {
		rounds = opts.MaxRounds
	}
	workers := clampInt(opts.Concurrency, 1, 16)
	asOf := asOfLine(opts.Now)

	var (
		maxSubs     = p.maxSubs
		queriesPer  = p.queriesPer
		maxQueries  = p.maxQueries
		resultsPer  = p.resultsPer
		newPagesMax = p.newPagesMax
		budget      = p.evidence
	)

	deadline := func() bool {
		return opts.MaxDuration > 0 && time.Since(started) >= opts.MaxDuration
	}

	pg.stage("planning")
	subs, err := decompose(ctx, client, question, maxSubs, asOf)
	if err != nil {
		return nil, err
	}
	pg.detail(fmt.Sprintf("%d subquestions", len(subs)))

	queries, err := searchQueries(ctx, client, question, subs, queriesPer, maxQueries, asOf)
	if err != nil {
		return nil, err
	}

	fetcher := opts.Fetcher
	if fetcher == nil {
		fetcher = webfetch.New()
	}
	pool := newCorpus(p.perHost)

	var (
		// allQueries is the search log. A deep dossier publishes it, because a
		// reader judging coverage needs to see what was actually asked.
		allQueries []string
		// answered is keyed by subquestion so a later round can add to what an
		// earlier one established instead of redoing all of it. Re-answering
		// every subquestion every round costs the same again each time and
		// lets a settled finding regress on a noisier corpus.
		answered  = map[string]finding{}
		searched  int
		roundsRun int
		warnings  []string
	)

	for round := 1; round <= rounds; round++ {
		// The first round always runs. A budget too short for it would
		// otherwise produce no findings at all, and "no findings" is an error,
		// not a report — a time limit should shorten a run, never fail it.
		if round > 1 && deadline() {
			warnings = append(warnings, fmt.Sprintf(
				"stopped after %s to stay inside the time budget", time.Since(started).Round(time.Second)))
			pg.detail("time budget reached; reporting on what was gathered")
			break
		}
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
			warnings = append(warnings, "a follow-up search round failed: "+err.Error())
			break
		}
		searched += len(queries)
		allQueries = append(allQueries, queries...)

		// The subquestions are what the pages will be read for, so they decide
		// which hits are worth the fetch.
		fresh := pool.addHits(hits, newPagesMax, question+"\n"+strings.Join(subs, "\n"))
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

		// Which subquestions still need work: the ones never asked, and the
		// ones whose answer was not solid. A high-confidence finding is left
		// alone — the corpus grew, but it grew to close other gaps.
		todo := pending(subs, answered)
		pg.stage(fmt.Sprintf("reading evidence for %d subquestion(s)", len(todo)))
		found, err := answerAll(ctx, client, todo, pool, budget, workers, asOf)
		if err != nil {
			return nil, err
		}
		for _, f := range found {
			answered[f.Question] = better(answered[f.Question], f)
		}

		if round == rounds {
			// No point asking what is missing when nothing more will be done
			// about it; the limitations section covers it instead.
			break
		}

		pg.stage("checking for gaps")
		gaps, err := detectGaps(ctx, client, question, ordered(subs, answered), maxQueries, asOf)
		if err != nil {
			pg.detail("gap check failed: " + err.Error())
			warnings = append(warnings, "the gap audit failed, so the run stopped early: "+err.Error())
			break
		}
		if gaps.Complete || len(gaps.Queries) == 0 {
			pg.detail("evidence is sufficient")
			break
		}

		// The gaps become subquestions of their own. This is the difference
		// between a loop that searches again and one that actually answers
		// what it went back for.
		added := 0
		for _, q := range gaps.Questions {
			if _, seen := answered[q]; seen || containsFold(subs, q) {
				continue
			}
			if len(subs) >= maxSubs+maxQueries {
				break
			}
			subs = append(subs, q)
			added++
		}
		pg.detail(fmt.Sprintf("%d gap(s), %d new subquestion(s); searching again", len(gaps.Missing), added))
		queries = gaps.Queries
	}

	findings := ordered(subs, answered)
	if len(findings) == 0 {
		return nil, fmt.Errorf("no findings produced for %q", question)
	}

	sources := pool.cited()

	var (
		md   string
		deep *Deep
	)
	if p.deep {
		deep, md, err = buildDossier(ctx, client, question, findings, pool, budget, workers, asOf, pg)
	} else {
		pg.stage("writing the report")
		md, err = synthesize(ctx, client, question, findings, sources, asOf)
	}
	if err != nil {
		return nil, err
	}

	// Only sources the report actually cites belong in the reference list; a
	// page that was read and found irrelevant is not a reference.
	md, used := rewriteCitations(md, sources)

	if deep != nil {
		deep.Queries = allQueries
		deep.Findings = findingNotes(findings)
		deep.Scanned = scannedPages(pool, used)
		// The run-state appendices are appended after renumbering: they carry
		// URLs and counts, never citation markers, so nothing in them depends
		// on the ids the rewrite just changed.
		md += SearchLog(deep.Queries) + ScanLog(deep.Scanned)
		// Sections are re-cut from the assembled body rather than kept as
		// written, because the citation rewrite edited that body.
		deep.Sections = splitSections(md)
		deep.Summary = stripToProse(firstSection(md))
	}

	return &Report{
		Question: question,
		Markdown: md,
		Sources:  used,
		Rounds:   roundsRun,
		Searched: searched,
		Fetched:  len(sources),
		Elapsed:  time.Since(started),
		// Recomputed from the findings that ended up in the report, not
		// latched the first time a gap appeared: a run whose second round
		// closed its gaps is complete, and saying otherwise trains the reader
		// to ignore the warning.
		Incomplete: anyLowConfidence(findings),
		Warnings:   warnings,
		Deep:       deep,
	}, nil
}

// pending returns the subquestions a round still has to work on: the unasked
// ones, and the ones whose answer did not come back solid.
func pending(subs []string, answered map[string]finding) []string {
	var todo []string
	for _, s := range subs {
		f, ok := answered[s]
		if !ok || !strings.EqualFold(f.Confidence, "high") {
			todo = append(todo, s)
		}
	}
	return todo
}

// ordered lists the findings in subquestion order, skipping any that were
// never answered.
func ordered(subs []string, answered map[string]finding) []finding {
	out := make([]finding, 0, len(subs))
	for _, s := range subs {
		if f, ok := answered[s]; ok {
			out = append(out, f)
		}
	}
	return out
}

// better keeps the stronger of two answers to the same subquestion. A later
// round sees a larger corpus, so it wins ties; but a round that came back less
// confident than its predecessor found nothing new and must not overwrite what
// did work.
func better(old, new finding) finding {
	if old.Question == "" {
		return new
	}
	if confidenceRank(new.Confidence) >= confidenceRank(old.Confidence) {
		return new
	}
	return old
}

func confidenceRank(c string) int {
	switch strings.ToLower(strings.TrimSpace(c)) {
	case "high":
		return 3
	case "medium":
		return 2
	case "low":
		return 1
	}
	return 0
}

func containsFold(list []string, s string) bool {
	for _, v := range list {
		if strings.EqualFold(v, s) {
			return true
		}
	}
	return false
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
//
// budget is the character ceiling for one call's evidence. How many passages
// that buys is derived from it rather than fixed, so the ×N dial widens what
// the model sees instead of leaving most of the allowance unspent.
func answerAll(ctx context.Context, client *llm.Client, subs []string,
	pool *corpus, budget, workers int, asOf string) ([]finding, error) {

	ranks := pool.pageRanks()
	// One lexicon for the whole round: term rarity is a property of the corpus
	// as it now stands, and rebuilding it per subquestion would compute the
	// same thing several times over.
	lex := newLexicon(pool.chunks)

	// The fence adds roughly this much per passage on top of the text itself.
	const fenceOverhead = 150
	topK := clampInt(budget/(childChars+fenceOverhead), 4, 64)
	perSource := clampInt(topK/3, 2, 12)

	out := make([]finding, len(subs))

	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(workers)
	for i, sub := range subs {
		i, sub := i, sub
		g.Go(func() error {
			top := rankChunks(pool.chunks, sub, ranks, lex, topK, perSource)
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
			f, err := answerSubquestion(gctx, client, sub, budgetChunks(parts, budget), asOf)
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

// Render renders the report as the file written to disk: the body plus a
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
	fmt.Fprintf(&b, "\n---\n\nResearched with kaioken: %d quer%s, %d page%s read, %d cited, %s.\n",
		r.Searched, plural(r.Searched, "y", "ies"),
		r.Fetched, plural(r.Fetched, "", "s"),
		len(r.Sources), r.Elapsed.Round(time.Second))
	if r.Incomplete {
		b.WriteString("Some subquestions remained thinly evidenced when the run ended.\n")
	}
	for _, w := range r.Warnings {
		b.WriteString("Note: " + w + "\n")
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
