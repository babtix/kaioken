// Package research answers a question from the open web — and, when the
// question deserves it, from the user's own repository — as a hybrid
// system: a triage router picks between a fast single-loop path and a deep
// multi-agent path over one shared control plane, and a run that turns out
// to need more is promoted between them rather than restarted. See
// cli/docs/deep-research-spec.md and cli/docs/hybrid-research-system.md.
//
// Two properties matter more than the pipeline shape:
//
//   - Every fetched page is untrusted input. It is sanitised at the fetch
//     boundary and fenced before it reaches a prompt (see fenceUntrusted);
//     the prompts covering it say plainly that the content is data, never
//     instructions.
//   - Every claim is traceable. Pages are numbered when they enter the
//     corpus and that number is the only way the model may cite them, so a
//     citation in the report always resolves to a page that was actually
//     read; a separate grounding pass checks the draft against the raw
//     text before it ships.
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
	// 1 is a quick look, 3 the default, 10 unwise. It also selects the
	// budget preset the run works inside.
	Multiplier int
	// MaxRounds caps the search→read→reason→gap loop. Zero derives it from
	// the multiplier.
	MaxRounds int
	// Concurrency bounds parallel searches, fetches and reasoning calls.
	Concurrency int
	// MaxDuration stops the loop once a run has taken this long, reporting
	// what it has rather than running until the context is cancelled. Zero
	// applies the preset's wall clock instead. Rounds are only ever
	// abandoned between stages, so a report is always written from whatever
	// was gathered.
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
	// Mode pins the execution path: "auto" (default) lets the triage router
	// decide, "fast" runs the single loop only, "deep" runs the multi-agent
	// path. Empty means whatever the global config says, then auto.
	Mode string
	// Resume reopens an existing run by id instead of starting a new one.
	Resume string
	// Verify turns on opt-in cross-path verification of load-bearing claims.
	Verify bool
	// Repo is the repository root the code retriever searches; empty runs
	// research the web only.
	Repo string
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
	// Path is the execution path that produced the report: "fast" or "deep".
	Path string
	// RunID names the run directory under ~/.kaioken/runs, so the trace can
	// be opened when something goes wrong.
	RunID string
	// Escalated records a fast→deep promotion happening mid-run.
	Escalated bool
	// EscalatedFrom names the path the run was promoted out of ("fast"),
	// empty when no promotion happened.
	EscalatedFrom string
	// Grounding is the citation pass's verdict, when the pass ran.
	Grounding *Grounding
	// Cost is the line-itemised meter for the whole run, both paths and any
	// promotion included.
	Cost Cost
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

// Run executes the hybrid research pipeline and returns the finished
// report: route the question, run the chosen path, promote to the deep
// path when the evidence says to, write, ground the claims, assemble. The
// signature is the one the CLI, the TUI and the daemon all share.
func Run(ctx context.Context, client *llm.Client, search websearch.Provider,
	question string, opts Options, pg Progress) (*Report, error) {

	question = strings.TrimSpace(question)
	if question == "" {
		return nil, fmt.Errorf("no question given")
	}
	e, err := newEngine(ctx, client, search, question, opts, pg)
	if err != nil {
		return nil, err
	}
	return e.execute(ctx)
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
	if r.Path != "" {
		if r.Escalated {
			fmt.Fprintf(&b, "Execution path: %s (promoted from the fast path mid-run).\n", r.Path)
		} else {
			fmt.Fprintf(&b, "Execution path: %s.\n", r.Path)
		}
	}
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
