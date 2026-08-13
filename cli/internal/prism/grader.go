package prism

import (
	"context"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"

	"kaioken/internal/textrank"
)

// The corrective gate is what separates PRISM from hybrid search. Retrieval
// returns the best matches it has; that is not the same as returning matches
// that answer the question. A query whose answer is simply absent from the
// corpus still produces a full ranked list of the least-bad chunks, and a
// model handed those will use them.
//
// So every fused candidate is scored for relevance, and the ones that fail are
// dropped. When nothing survives, the honest answer is that no source was
// found — which is a useful answer, and one a pipeline without a gate cannot
// give.
//
// Two decisions carry the design:
//
// The gate grades children, before parent expansion. The child is what
// actually matched, it fits the grader's input budget whole where a parent's
// tail would fall outside it, and grading first means only survivors trigger a
// parent fetch.
//
// Failure keeps the chunk but reports that it did. A dead grader that silently
// approved everything would be indistinguishable from a grader that examined
// everything and approved it — the caller would see a full context and no
// indication that nothing checked it. So a failed call fails open on the
// chunk and closed on the claim: Graded goes false and the context is marked
// unverified.

// graderTimeout bounds one verdict. Generous enough for a cold local model,
// short enough that a hung endpoint does not hold up the whole gate.
const graderTimeout = 8 * time.Second

// graderMaxChars bounds grader input. Children target ~600 characters so this
// never truncates in practice; it only limits the damage from an oversized one.
const graderMaxChars = 4000

// graderConcurrency bounds simultaneous verdicts. Every fused candidate gets
// its own call, so without a limit a wide top_k would open twenty connections
// at once and earn a rate limit instead of an answer.
const graderConcurrency = 8

const graderSystem = "You are a strict relevance grader. " +
	"You will receive a QUESTION and a TEXT CHUNK from a document. " +
	"Your sole job is to decide whether the chunk contains information that " +
	"would help answer the question. " +
	"Reply with exactly one word: 'relevant' or 'irrelevant'. " +
	"Do not add any explanation, punctuation, or other text."

// gradeResult is the outcome of grading a batch of candidates.
type gradeResult struct {
	// keep is one flag per input, in input order. A candidate whose call
	// errored is kept.
	keep []bool
	// graded reports that every candidate got a real verdict. False means at
	// least one call failed open, so keep is not a trustworthy relevance
	// signal and the context above it is unverified.
	graded bool
}

// grade scores each ranked child against the query.
//
// It returns flags rather than a filtered list so the caller filters whatever
// it is holding and keeps rank order in its own hands.
func grade(ctx context.Context, u Utility, cand *candidates, query string, ranked []textrank.Ranked) gradeResult {
	if len(ranked) == 0 {
		return gradeResult{graded: true}
	}
	if u == nil {
		// No utility model configured. Everything passes, and the caller is
		// told the gate never ran.
		return gradeResult{keep: allTrue(len(ranked)), graded: false}
	}

	verdicts := make([]*bool, len(ranked))
	var mu sync.Mutex

	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(graderConcurrency)
	for i, r := range ranked {
		i, text := i, cand.chunk(r.ID).Text
		g.Go(func() error {
			v := gradeOne(gctx, u, query, text)
			mu.Lock()
			verdicts[i] = v
			mu.Unlock()
			// A grader error is never fatal to the run; it is recorded as a
			// missing verdict and reported through graded.
			return nil
		})
	}
	_ = g.Wait()

	out := gradeResult{keep: make([]bool, len(ranked)), graded: true}
	for i, v := range verdicts {
		switch {
		case v == nil:
			// No verdict: keep the chunk, but the gate did not run on it.
			out.keep[i] = true
			out.graded = false
		default:
			out.keep[i] = *v
		}
	}
	return out
}

// gradeOne asks for one verdict. It returns nil when the grader produced none,
// which is deliberately distinct from returning false: the caller keeps the
// chunk either way, but collapsing the two would make a dead grader look like
// one that approved everything.
func gradeOne(ctx context.Context, u Utility, query, chunk string) *bool {
	ctx, cancel := context.WithTimeout(ctx, graderTimeout)
	defer cancel()

	user := "QUESTION: " + query + "\n\nTEXT CHUNK:\n" + clip(chunk, graderMaxChars)
	out, err := u.Complete(ctx, graderSystem, user, 5)
	if err != nil {
		return nil
	}

	verdict := strings.ToLower(strings.TrimSpace(out))
	switch {
	case strings.HasPrefix(verdict, "relevant"):
		t := true
		return &t
	case strings.HasPrefix(verdict, "irrelevant"):
		f := false
		return &f
	default:
		// The model was asked for one of two words and said something else.
		// Treating that as a verdict would be reading tea leaves; it is a
		// failed call, and it counts against graded.
		return nil
	}
}

// filterRanked keeps the candidates the gate approved, preserving rank order.
func filterRanked(ranked []textrank.Ranked, keep []bool) []textrank.Ranked {
	if len(keep) != len(ranked) {
		return ranked
	}
	out := make([]textrank.Ranked, 0, len(ranked))
	for i, r := range ranked {
		if keep[i] {
			out = append(out, r)
		}
	}
	return out
}

func allTrue(n int) []bool {
	out := make([]bool, n)
	for i := range out {
		out[i] = true
	}
	return out
}

func clip(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}
