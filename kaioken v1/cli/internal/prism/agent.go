package prism

import (
	"context"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Single-shot retrieval answers "what does the retry policy say" perfectly
// well. It cannot answer "which of the retry policy or the rate limiter is
// responsible for the backoff, and why" — that needs two lookups and a
// comparison, and one embedding of the whole sentence matches neither
// component's section cleanly.
//
// This adds that capability without paying for it on every query.
//
// Adaptive routing. The simple majority of questions go down the cheap static
// path untouched, and the loop is reserved for the minority that genuinely
// need it. An agentic pipeline costs several times the tokens of plain
// retrieval, so applying one uniformly makes every easy question slow and
// expensive to no benefit. The classifier is free for most queries and only
// asks a model about genuinely ambiguous ones.
//
// Decomposition rather than open-ended iteration. A complex query is split
// once into independent sub-questions retrieved concurrently. That is more
// predictable than letting a model iterate freely, far easier to evaluate —
// each sub-question has its own retrieval result — and it parallelises, which
// an open-ended loop cannot.
//
// Caps live here, not in a prompt. A model cannot reliably self-limit on
// adversarial input, so the iteration and retrieval ceilings are enforced by
// the orchestrator that spends the budget.
//
// The honesty flags drive the loop. A miss on a healthy pipeline means the
// corpus lacked this phrasing, which is worth one reformulated retry. A
// degraded retrieval means the infrastructure is impaired, which no
// reformulation can fix — retrying it would spend the whole budget during an
// outage.

// Budgets. Two retrieval rounds capture most of the achievable gain; deeper
// loops add latency and cost without measurable benefit.
const (
	maxIterations   = 2
	maxSubQuestions = 3
	// maxRetrievals is the absolute ceiling on retrieval calls for one
	// answer, independent of how iterations and sub-questions combine. It is
	// the backstop that makes worst-case cost and latency predictable.
	maxRetrievals = 6
	// maxMergedChunks bounds what reaches the caller, so a decomposed query
	// cannot blow the generation context budget.
	maxMergedChunks = 8
)

const (
	routerTimeout  = 8 * time.Second
	plannerTimeout = 15 * time.Second
)

// Route names the path a question took.
type Route string

const (
	// RouteSimple is the single-shot static path.
	RouteSimple Route = "simple"
	// RouteComplex is the decomposed path.
	RouteComplex Route = "complex"
)

// Step is one retrieval the loop performed.
//
// The trace is not decoration. Without per-step visibility an agentic pipeline
// cannot be debugged, because a thin final answer gives no indication of which
// sub-question retrieved badly.
type Step struct {
	Iteration   int    `json:"iteration"`
	Query       string `json:"query"`
	ChunkCount  int    `json:"chunk_count"`
	SourceFound bool   `json:"source_found"`
	Degraded    bool   `json:"degraded"`
	Note        string `json:"note,omitempty"`
}

// AgentResult is the outcome of a multi-step retrieval.
type AgentResult struct {
	// Result carries the merged chunks and the three honesty flags, with the
	// same meanings as a single retrieval: SourceFound is true when at least
	// one sub-question found a graded source, Graded is true only when every
	// contributing retrieval had a working gate, Degraded when any of them ran
	// impaired.
	Result

	Route Route `json:"route"`
	// SubQuestions is the decomposition actually used; the query alone on the
	// simple route.
	SubQuestions []string `json:"sub_questions"`
	// Unresolved lists sub-questions that found no source even after a retry.
	// A partial answer is only honest if the caller knows which part is
	// missing — pass these to the model so it can say what it could not find
	// rather than papering over the gap.
	Unresolved []string `json:"unresolved,omitempty"`
	Steps      []Step   `json:"steps,omitempty"`
}

// Agent adds multi-step retrieval on top of a Retriever.
type Agent struct{ r *Retriever }

// NewAgent wraps a retriever. Without a utility model the agent behaves
// exactly like the static pipeline: the router answers simple, decomposition
// returns the query unchanged.
func NewAgent(r *Retriever) *Agent { return &Agent{r: r} }

// AgentOptions narrows one agentic retrieval.
type AgentOptions struct {
	Options
	// ForceRoute bypasses the classifier. The evaluation harness needs it to
	// measure the two routes independently, and it doubles as a kill switch if
	// the loop misbehaves.
	ForceRoute Route
}

// Retrieve answers a query, decomposing it only if it needs decomposing.
func (a *Agent) Retrieve(ctx context.Context, query string, opt AgentOptions) (AgentResult, error) {
	opt.Options = opt.Options.withDefaults()

	route := opt.ForceRoute
	if route == "" {
		route = a.classify(ctx, query)
	}
	if route == RouteSimple {
		return a.simple(ctx, query, opt)
	}
	return a.complex(ctx, query, opt)
}

// simple is the static pipeline, unchanged.
func (a *Agent) simple(ctx context.Context, query string, opt AgentOptions) (AgentResult, error) {
	res, err := a.r.Retrieve(ctx, query, opt.Options)
	if err != nil {
		return AgentResult{}, err
	}
	out := AgentResult{
		Result:       res,
		Route:        RouteSimple,
		SubQuestions: []string{query},
		Steps: []Step{{
			Iteration:   1,
			Query:       query,
			ChunkCount:  len(res.Chunks),
			SourceFound: res.SourceFound,
			Degraded:    res.Degraded,
			Note:        "static path",
		}},
	}
	if !res.SourceFound {
		out.Unresolved = []string{query}
	}
	return out, nil
}

// complex decomposes, retrieves concurrently, and retries genuine misses once.
func (a *Agent) complex(ctx context.Context, query string, opt AgentOptions) (AgentResult, error) {
	subs := a.decompose(ctx, query)
	if len(subs) > maxRetrievals {
		subs = subs[:maxRetrievals]
	}

	results, err := a.retrieveAll(ctx, subs, opt.Options)
	if err != nil {
		return AgentResult{}, err
	}
	used := len(subs)

	steps := make([]Step, 0, len(subs)+maxRetrievals)
	for i, sub := range subs {
		steps = append(steps, step(1, sub, results[i], "decomposed"))
	}

	// Iteration two retries only genuine misses. A degraded retrieval is an
	// infrastructure failure, not a phrasing problem: retrying it cannot
	// succeed and would spend budget a real miss needs.
	if maxIterations >= 2 {
		var retry []int
		for i, res := range results {
			if !res.SourceFound && !res.Degraded {
				retry = append(retry, i)
			}
		}
		if budget := maxRetrievals - used; len(retry) > budget {
			retry = retry[:max(0, budget)]
		}
		steps = append(steps, a.retryMisses(ctx, subs, results, retry, opt.Options)...)
	}

	merged := interleave(results, maxMergedChunks)
	var unresolved []string
	for i, res := range results {
		if !res.SourceFound {
			unresolved = append(unresolved, subs[i])
		}
	}

	return AgentResult{
		Result: Result{
			Chunks:      merged,
			SourceFound: anySourceFound(results),
			Graded:      allGraded(results),
			Degraded:    anyDegraded(results),
		},
		Route:        RouteComplex,
		SubQuestions: subs,
		Unresolved:   unresolved,
		Steps:        steps,
	}, nil
}

// retryMisses reformulates and re-retrieves the given sub-questions, writing
// improvements back into results.
func (a *Agent) retryMisses(ctx context.Context, subs []string, results []Result, retry []int, opt Options) []Step {
	if len(retry) == 0 {
		return nil
	}

	rewrites := make([]string, len(retry))
	var wg sync.WaitGroup
	for n, i := range retry {
		wg.Add(1)
		go func(n, i int) {
			defer wg.Done()
			rewrites[n] = a.reformulate(ctx, subs[i])
		}(n, i)
	}
	wg.Wait()

	var steps []Step
	var mu sync.Mutex
	wg = sync.WaitGroup{}
	for n, i := range retry {
		if rewrites[n] == "" {
			continue
		}
		wg.Add(1)
		go func(n, i int) {
			defer wg.Done()
			res, err := a.r.Retrieve(ctx, rewrites[n], opt)
			if err != nil {
				return
			}
			mu.Lock()
			defer mu.Unlock()
			steps = append(steps, step(2, rewrites[n], res, "reformulated from: "+subs[i]))
			// Keep the retry only if it improved on the miss.
			if res.SourceFound {
				results[i] = res
			}
		}(n, i)
	}
	wg.Wait()
	return steps
}

func (a *Agent) retrieveAll(ctx context.Context, queries []string, opt Options) ([]Result, error) {
	results := make([]Result, len(queries))
	errs := make([]error, len(queries))

	var wg sync.WaitGroup
	for i, q := range queries {
		wg.Add(1)
		go func(i int, q string) {
			defer wg.Done()
			results[i], errs[i] = a.r.Retrieve(ctx, q, opt)
		}(i, q)
	}
	wg.Wait()

	for _, err := range errs {
		if err != nil {
			return nil, err
		}
	}
	return results, nil
}

// --- routing ---

// complexMarkers are surface signs of a multi-part question. They are
// deliberately high-precision: a false "complex" costs a decomposition call
// plus extra retrievals, so the heuristic only escalates on strong evidence
// and lets the model adjudicate anything it is unsure about.
var complexMarkers = regexp.MustCompile(`(?i)\b(compare|comparison|versus|vs\.?|` +
	`difference between|differences between|both|either|which of|rather than|` +
	`instead of|as well as|and (?:also|then)|step by step)\b`)

// trivialWordCount is short enough that a query below it, with no markers, is
// not a multi-step question. Skipping the classifier here is what keeps the
// common case free.
const trivialWordCount = 12

// classify returns the route for a query, cheapest tier first: markers, then
// length, then one small model call.
//
// Failure defaults to simple. The static path is fast, cheap and already good;
// escalating on an error would make an outage expensive as well as slow.
func (a *Agent) classify(ctx context.Context, query string) Route {
	q := strings.TrimSpace(query)

	if complexMarkers.MatchString(q) || strings.Count(q, "?") > 1 {
		return RouteComplex
	}
	if len(strings.Fields(q)) <= trivialWordCount {
		return RouteSimple
	}
	if a.r.utility == nil {
		return RouteSimple
	}

	cctx, cancel := context.WithTimeout(ctx, routerTimeout)
	defer cancel()

	out, err := a.r.utility.Complete(cctx,
		"You classify questions for a retrieval system. Answer 'complex' if "+
			"answering requires looking up two or more distinct topics and "+
			"combining them, or comparing two things. Answer 'simple' if a "+
			"single lookup suffices. Reply with exactly one word: 'simple' or "+
			"'complex'.", q, 5)
	if err != nil {
		return RouteSimple
	}
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(out)), "complex") {
		return RouteComplex
	}
	return RouteSimple
}

// decompose splits a query into independent sub-questions.
//
// Any failure returns the query unchanged: a failed decomposition must degrade
// to single-shot retrieval, not to no retrieval.
func (a *Agent) decompose(ctx context.Context, query string) []string {
	if a.r.utility == nil {
		return []string{query}
	}
	dctx, cancel := context.WithTimeout(ctx, plannerTimeout)
	defer cancel()

	out, err := a.r.utility.Complete(dctx,
		"You break a question into the minimum set of independent "+
			"sub-questions needed to answer it. Each sub-question must be "+
			"self-contained and answerable by looking up one topic - do not use "+
			"pronouns referring to other sub-questions. Produce at most "+
			strconv.Itoa(maxSubQuestions)+". If the question already needs only one "+
			"lookup, return it unchanged. Return one sub-question per line, and "+
			"nothing else.", query, 250)
	if err != nil {
		return []string{query}
	}

	subs := parseLines(out, maxSubQuestions)
	if len(subs) == 0 {
		return []string{query}
	}
	return subs
}

// reformulate rewrites a sub-question that found nothing, returning "" when it
// could not or when the rewrite is the same question.
func (a *Agent) reformulate(ctx context.Context, query string) string {
	if a.r.utility == nil {
		return ""
	}
	rctx, cancel := context.WithTimeout(ctx, plannerTimeout)
	defer cancel()

	out, err := a.r.utility.Complete(rctx,
		"A document search found nothing for this question. Rewrite it using "+
			"the terminology the source documents would use - expand "+
			"abbreviations, prefer formal terms over colloquial ones, and drop "+
			"conversational framing. Return only the rewritten question.", query, 100)
	if err != nil {
		return ""
	}
	rewritten := strings.TrimSpace(strings.Trim(strings.TrimSpace(out), `"`))
	if rewritten == "" || strings.EqualFold(rewritten, strings.TrimSpace(query)) {
		return ""
	}
	return rewritten
}

// --- merging ---

// interleave merges per-sub-question chunks round-robin, deduplicated.
//
// Round-robin rather than concatenation because with concatenation the first
// sub-question's chunks fill the budget and later ones contribute nothing — so
// a two-part question gets a one-part answer. Every sub-question gets
// representation before any gets a second chunk.
func interleave(results []Result, limit int) []string {
	depth, maxDepth := 0, 0
	for _, r := range results {
		if len(r.Chunks) > maxDepth {
			maxDepth = len(r.Chunks)
		}
	}

	merged := make([]string, 0, limit)
	seen := map[string]bool{}
	for depth < maxDepth && len(merged) < limit {
		for _, r := range results {
			if depth >= len(r.Chunks) {
				continue
			}
			text := r.Chunks[depth]
			key := firstN(text, 120)
			if text == "" || seen[key] {
				continue
			}
			seen[key] = true
			merged = append(merged, text)
			if len(merged) >= limit {
				break
			}
		}
		depth++
	}
	return merged
}

// --- helpers ---

func step(iteration int, query string, res Result, note string) Step {
	return Step{
		Iteration:   iteration,
		Query:       query,
		ChunkCount:  len(res.Chunks),
		SourceFound: res.SourceFound,
		Degraded:    res.Degraded,
		Note:        note,
	}
}

func anySourceFound(results []Result) bool {
	for _, r := range results {
		if r.SourceFound {
			return true
		}
	}
	return false
}

// allGraded is an AND across contributors: one ungraded retrieval makes the
// merged context unverified, however many of the others were checked.
func allGraded(results []Result) bool {
	for _, r := range results {
		if !r.Graded {
			return false
		}
	}
	return len(results) > 0
}

func anyDegraded(results []Result) bool {
	for _, r := range results {
		if r.Degraded {
			return true
		}
	}
	return false
}

// parseLines pulls up to n distinct non-empty lines out of a model reply,
// stripping the list markers models add despite being told not to.
func parseLines(out string, n int) []string {
	var lines []string
	seen := map[string]bool{}
	for _, raw := range strings.Split(out, "\n") {
		c := strings.TrimSpace(strings.TrimLeft(strings.TrimSpace(raw), "-*0123456789.) "))
		if c == "" || seen[strings.ToLower(c)] {
			continue
		}
		seen[strings.ToLower(c)] = true
		lines = append(lines, c)
		if len(lines) >= n {
			break
		}
	}
	return lines
}

func firstN(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}
