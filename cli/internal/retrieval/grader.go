package retrieval

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

// GradeResult is the outcome of grading a batch of candidates.
type GradeResult struct {
	// Keep is one flag per input, in input order. A candidate whose call
	// errored is kept.
	Keep []bool
	// Graded reports that every candidate got a real verdict. False means at
	// least one call failed open, so Keep is not a trustworthy relevance
	// signal and the context above it is unverified.
	Graded bool
}

// Grade scores each ranked item against the query, resolving each item's
// chunk text through textFor(id) — the caller's own candidate store, kept out
// of this package so it stays independent of any one corpus representation.
//
// It returns flags rather than a filtered list so the caller filters whatever
// it is holding and keeps rank order in its own hands.
func Grade(ctx context.Context, u Utility, textFor func(id int) string, query string, ranked []textrank.Ranked) GradeResult {
	if len(ranked) == 0 {
		return GradeResult{Graded: true}
	}
	if u == nil {
		// No utility model configured. Everything passes, and the caller is
		// told the gate never ran.
		return GradeResult{Keep: AllTrue(len(ranked)), Graded: false}
	}

	verdicts := make([]*bool, len(ranked))
	var mu sync.Mutex

	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(graderConcurrency)
	for i, r := range ranked {
		i, text := i, textFor(r.ID)
		g.Go(func() error {
			v := gradeOne(gctx, u, query, text)
			mu.Lock()
			verdicts[i] = v
			mu.Unlock()
			// A grader error is never fatal to the run; it is recorded as a
			// missing verdict and reported through Graded.
			return nil
		})
	}
	_ = g.Wait()

	out := GradeResult{Keep: make([]bool, len(ranked)), Graded: true}
	for i, v := range verdicts {
		switch {
		case v == nil:
			// No verdict: keep the chunk, but the gate did not run on it.
			out.Keep[i] = true
			out.Graded = false
		default:
			out.Keep[i] = *v
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
		// failed call, and it counts against Graded.
		return nil
	}
}

// FilterRanked keeps the candidates the gate approved, preserving rank order.
func FilterRanked(ranked []textrank.Ranked, keep []bool) []textrank.Ranked {
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

func AllTrue(n int) []bool {
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
