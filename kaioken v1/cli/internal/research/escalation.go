package research

import "fmt"

// Escalation is a promotion, not a restart. When the fast path turns out
// to have been handed a deep question, the run hands the supervisor
// everything it already gathered — the content-hash store means nothing is
// re-fetched, the meter means the price stays one running total — and the
// user experiences a run that takes longer and gets more thorough, never
// one that starts over.
//
// The decision is asymmetric on purpose: only auto-routed runs escalate,
// and only once. A user who pinned --mode fast gets exactly that; a run
// that already escalated does not ping-pong.

const (
	// minIndependentSources is the coverage floor: fewer fetched sources
	// than this behind a run's claims is thin by definition.
	minIndependentSources = 2
	// escalationGapQuestions is how many independent subquestions the gap
	// audit must surface before the run admits it was mis-triaged narrow.
	escalationGapQuestions = 2
	// escalationCoverageWithLows relaxes the floor when findings already
	// came back low-confidence: three sources that all shrug are still
	// thin.
	escalationCoverageWithLows = 3
)

// shouldEscalate judges the fast path's outcome at the end of its loop,
// before anything is written. It returns the reason and whether the run
// should promote.
func (e *engine) shouldEscalate(out pathOutcome) (string, bool) {
	if e.mode != "auto" || e.dossier || e.route != RouteFast {
		return "", false
	}
	e.mu.Lock()
	already := e.escalated
	e.mu.Unlock()
	if already || e.costReached() || e.deadline() {
		return "", false
	}

	cited := len(e.pool.cited())
	if cited < minIndependentSources {
		return fmt.Sprintf("thin coverage: only %d independent source(s) fetched", cited), true
	}

	// A gap audit that keeps surfacing fresh independent strands is the
	// signature of a question that decomposes — i.e. a deep question the
	// router read as narrow.
	if out.lastGaps != nil && len(out.lastGaps.Questions) >= escalationGapQuestions && !out.lastGaps.Complete {
		return fmt.Sprintf("%d independent subtopics surfaced late in the loop", len(out.lastGaps.Questions)), true
	}

	// Findings the loop itself rates low-confidence, resting on a corpus
	// barely above the floor: the fast path tried and could not settle it.
	lows := 0
	for _, f := range out.answered {
		if confidenceRank(f.Confidence) <= 1 {
			lows++
		}
	}
	if lows > 0 && cited < escalationCoverageWithLows {
		return fmt.Sprintf("%d finding(s) stayed low-confidence on %d source(s)", lows, cited), true
	}
	return "", false
}
