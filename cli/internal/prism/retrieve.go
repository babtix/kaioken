package prism

import (
	"context"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"

	"kaioken/internal/embed"
	"kaioken/internal/retrieval"
	"kaioken/internal/textrank"
)

// Retriever runs the retrieval pipeline against one repository's store.
//
//	cache → expand query → (lexical ∥ semantic) per variant → RRF over all 2N
//	     → corrective gate on children → parent expansion → cache
//
// The gate sits between fusion and expansion deliberately; see grader.go.
type Retriever struct {
	store    *Store
	emb      embed.Embedder
	utility  Utility
	cache    *Cache
	variants *variantCache

	// mu guards the candidate memo below.
	mu sync.Mutex
	// memo holds the tokenised view of each module. The stored fingerprint is
	// what makes it safe: a corpus that changed underneath produces a
	// different fingerprint and the memo is rebuilt.
	memo map[string]memoEntry
	// build collapses concurrent first-queries on the same (module,
	// fingerprint) onto a single LoadCorpus+newCandidates call. Keyed by
	// fingerprint too, so a corpus change starts a fresh build rather than
	// joining one already in flight for the stale version.
	build singleflight.Group
}

type memoEntry struct {
	fingerprint string
	cand        *candidates
}

// NewRetriever wires a retriever.
//
// Both models are optional and their absence is a supported state, not a
// half-configured one. Without an embedder retrieval is lexical and reports
// itself degraded; without a utility model the corrective gate does not run
// and every result reports Graded false.
func NewRetriever(store *Store, emb embed.Embedder, utility Utility, cache *Cache) *Retriever {
	return &Retriever{
		store:    store,
		emb:      emb,
		utility:  utility,
		cache:    cache,
		variants: newVariantCache(),
		memo:     map[string]memoEntry{},
	}
}

// DefaultTopK is how many fused children carry through to grading. Small: each
// one costs a grader call, and the parents they expand to are four times their
// size.
const DefaultTopK = 5

// Options narrows one retrieval.
type Options struct {
	// Module scopes retrieval to one knowledge domain. Required — an unscoped
	// search across every imported corpus answers no question well.
	Module string
	// TopK bounds the fused candidates carried into grading.
	TopK int
	// Variants is the RAG-Fusion breadth, 1 (the default) to MaxVariants.
	// Above 1 the query is expanded into alternative phrasings and every
	// ranking is fused together. Cost scales linearly, so raise it only where
	// evaluation shows it earns its keep.
	Variants int
	// NoGrade disables the corrective gate for this call. The result reports
	// Graded false, as it must — a caller that turns the gate off does not get
	// to claim its context was checked.
	NoGrade bool
}

func (o Options) withDefaults() Options {
	if o.TopK <= 0 {
		o.TopK = DefaultTopK
	}
	if o.Variants <= 0 {
		o.Variants = 1
	}
	if o.Variants > MaxVariants {
		o.Variants = MaxVariants
	}
	return o
}

// Retrieve returns graded parent context for a query.
//
// An empty result is not an error. "The corpus has no answer" is a finding,
// reported through Result.SourceFound; an error here means the module could
// not be read at all.
func (r *Retriever) Retrieve(ctx context.Context, query string, opt Options) (Result, error) {
	opt = opt.withDefaults()

	cand, fingerprint, err := r.candidatesFor(opt.Module)
	if err != nil {
		return Result{}, err
	}

	graded := r.utility != nil && !opt.NoGrade
	key := cacheKey(query, opt.Module, fingerprint, cand.corpus.EmbedModel, opt.TopK, opt.Variants, graded)
	if hit, ok := r.cache.Get(key); ok {
		return hit, nil
	}

	res := r.run(ctx, cand, query, opt)
	r.cache.Set(key, res)
	return res, nil
}

// run is the pipeline proper, with the cache already consulted.
func (r *Retriever) run(ctx context.Context, cand *candidates, query string, opt Options) Result {
	if cand.len() == 0 {
		// An empty module is not a degraded pipeline. Nothing is wrong; there
		// is simply nothing there, and saying so is the honest answer.
		return Result{}
	}

	phrasings := expandQuery(ctx, r.utility, r.variants, query, opt.Variants)
	lists, degraded := r.rankAll(ctx, cand, phrasings, opt.TopK*2)

	fused := textrank.RRF(lists, opt.TopK)
	if len(fused) == 0 {
		// Both legs came back empty for every phrasing. The recency fallback
		// supplies something to look at, but it was chosen without reference
		// to the query and never graded, so it is reported as no source at
		// all — presenting it as one would be the most misleading thing this
		// pipeline could do.
		return Result{
			Chunks:   expandToParents(cand, cand.recent(opt.TopK)),
			Degraded: true,
		}
	}

	// The gate runs on children, before expansion. See retrieval.Grade.
	gate := retrieval.GradeResult{Keep: retrieval.AllTrue(len(fused)), Graded: false}
	if !opt.NoGrade {
		gate = retrieval.Grade(ctx, r.utility, func(id int) string { return cand.chunk(id).Text }, query, fused)
	}
	kept := retrieval.FilterRanked(fused, gate.Keep)

	if len(kept) == 0 {
		// Every candidate was judged irrelevant. This is the gate working:
		// the corpus was searched, the matches were examined, and none of them
		// answer the question. Returning nothing with SourceFound false is a
		// better answer than returning the least-bad chunk.
		return Result{Graded: gate.Graded, Degraded: degraded}
	}

	chunks := expandToParents(cand, kept)
	return Result{
		Chunks:      chunks,
		SourceFound: len(chunks) > 0,
		Graded:      gate.Graded,
		Degraded:    degraded,
	}
}

// rankAll produces one lexical and one semantic ranking per phrasing — 2N
// lists for the fusion below.
//
// Query embeddings for every phrasing go in a single batched call: the
// phrasings are known up front, so there is no reason to serialise N round
// trips. The lexical legs run concurrently with that call, since they are pure
// CPU over data already in memory.
func (r *Retriever) rankAll(ctx context.Context, cand *candidates, phrasings []string, k int) ([][]textrank.Ranked, bool) {
	lists := make([][]textrank.Ranked, 0, 2*len(phrasings))

	var lexical [][]textrank.Ranked
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		lexical = make([][]textrank.Ranked, len(phrasings))
		for i, p := range phrasings {
			lexical[i] = cand.lexical(p, k)
		}
	}()

	semantic, degraded := r.semantic(ctx, cand, phrasings, k)
	wg.Wait()

	lists = append(lists, lexical...)
	lists = append(lists, semantic...)
	return lists, degraded
}

// semanticTimeout bounds the query-embedding call. A query embedding is one
// short request; if it has not answered in this long, the lexical answer is
// better than making the user wait for a second one.
const semanticTimeout = 30 * time.Second

// semantic embeds every phrasing in one call and ranks each by cosine
// similarity, reporting whether the leg could run at all.
//
// A failure skips the leg rather than substituting a zero vector. A zero
// vector is not a neutral query: it returns arbitrary nearest neighbours,
// which then enter fusion as though they were real matches and dilute the
// lexical results that were perfectly fine on their own.
//
// A partial response is refused for the same reason it is at ingest: silently
// dropping one phrasing's leg is much harder to notice than an outright
// failure.
func (r *Retriever) semantic(ctx context.Context, cand *candidates, phrasings []string, k int) ([][]textrank.Ranked, bool) {
	if r.emb == nil || !cand.corpus.Semantic() {
		return nil, true
	}
	ctx, cancel := context.WithTimeout(ctx, semanticTimeout)
	defer cancel()

	vecs, err := r.emb.Embed(ctx, phrasings)
	if err != nil || len(vecs) != len(phrasings) {
		return nil, true
	}

	out := make([][]textrank.Ranked, len(vecs))
	for i, v := range vecs {
		out[i] = cand.vector(v, k)
	}
	return out, false
}

// candidatesFor returns the tokenised view of a module, rebuilding it only
// when the corpus has changed underneath.
func (r *Retriever) candidatesFor(module string) (*candidates, string, error) {
	fingerprint := r.store.Fingerprint(module)

	r.mu.Lock()
	if e, ok := r.memo[module]; ok && e.fingerprint == fingerprint {
		r.mu.Unlock()
		return e.cand, fingerprint, nil
	}
	r.mu.Unlock()

	// N concurrent first-queries on this module collapse onto one build via
	// singleflight, keyed by fingerprint so they don't join a build already
	// in flight for a since-superseded corpus. The load itself still runs
	// outside r.mu: tokenising a large module takes long enough that holding
	// the mutex would serialise every other module's queries behind it.
	v, err, _ := r.build.Do(module+"@"+fingerprint, func() (any, error) {
		r.mu.Lock()
		if e, ok := r.memo[module]; ok && e.fingerprint == fingerprint {
			r.mu.Unlock()
			return e.cand, nil
		}
		r.mu.Unlock()

		corpus, err := r.store.LoadCorpus(module)
		if err != nil {
			return nil, err
		}
		cand := newCandidates(corpus)

		r.mu.Lock()
		r.memo[module] = memoEntry{fingerprint: fingerprint, cand: cand}
		r.mu.Unlock()
		return cand, nil
	})
	if err != nil {
		return nil, "", err
	}
	return v.(*candidates), fingerprint, nil
}
