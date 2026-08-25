package research

import (
	"fmt"
	"time"
)

// Budget is the set of hard stops one run works inside. Every limit is
// deterministic — enforced in Go between stages — because the model-judged
// stops (the supervisor deciding coverage is sufficient) can always be
// talked into one more round by a page that promises to settle everything.
//
// Cost is dominated by reasoning tokens, so the ceilings are per-run rather
// than per-request: a run that reaches any of them reports what it has
// instead of failing. A time or money limit should shorten a run, never sink
// it.
type Budget struct {
	// WallClock stops the run once it has taken this long.
	WallClock time.Duration
	// MaxSearches caps the search calls across every path and round.
	MaxSearches int
	// MaxFetches caps page fetches; a fetch served from the content-hash
	// cache does not count against it.
	MaxFetches int
	// MaxWorkers bounds parallel deep-path workers.
	MaxWorkers int
	// MaxSupervisorIters caps the supervisor's dispatch rounds.
	MaxSupervisorIters int
	// MaxToolCallsPerWorker bounds one worker's search/fetch decisions.
	MaxToolCallsPerWorker int
	// MaxCostUSD caps model spend. Zero means the preset left it unset.
	MaxCostUSD float64
}

// The presets. quick and standard exist so everyday questions never pay
// multi-agent prices; deep is the spec's conservative default (mirroring
// LangChain's Open Deep Research, tuned low on purpose); dossier is the
// long-form ×10 mode, which keeps its historical scale because it is the
// mode you reach for when the answer matters more than the bill.
var (
	budgetQuick = Budget{
		WallClock:             5 * time.Minute,
		MaxSearches:           12,
		MaxFetches:            24,
		MaxWorkers:            3,
		MaxSupervisorIters:    1,
		MaxToolCallsPerWorker: 4,
		MaxCostUSD:            0.15,
	}
	budgetStandard = Budget{
		WallClock:             10 * time.Minute,
		MaxSearches:           24,
		MaxFetches:            48,
		MaxWorkers:            4,
		MaxSupervisorIters:    2,
		MaxToolCallsPerWorker: 5,
		MaxCostUSD:            0.50,
	}
	budgetDeep = Budget{
		WallClock:             15 * time.Minute,
		MaxSearches:           40,
		MaxFetches:            60,
		MaxWorkers:            5,
		MaxSupervisorIters:    3,
		MaxToolCallsPerWorker: 5,
		MaxCostUSD:            1.00,
	}
	budgetDossier = Budget{
		WallClock:             45 * time.Minute,
		MaxSearches:           256,
		MaxFetches:            480,
		MaxWorkers:            6,
		MaxSupervisorIters:    3,
		MaxToolCallsPerWorker: 6,
		MaxCostUSD:            3.00,
	}
)

// budgetFor maps the ×N dial onto a preset: 1–2 quick, 3–5 standard, 6–9
// deep, and ≥10 (or a forced dossier) the long-form profile. This is the
// fold of the old multiplier into the new budgets — the numbers grow
// smoothly with N and step up at ×10, exactly as they did before.
func budgetFor(mult int, dossier bool) Budget {
	if dossier || mult >= DeepMultiplier {
		return budgetDossier
	}
	switch {
	case mult <= 2:
		return budgetQuick
	case mult <= 5:
		return budgetStandard
	default:
		return budgetDeep
	}
}

// PresetName names the budget a multiplier selects, for display.
func PresetName(mult int, dossier bool) string {
	if dossier || mult >= DeepMultiplier {
		return "dossier"
	}
	switch {
	case mult <= 2:
		return "quick"
	case mult <= 5:
		return "standard"
	default:
		return "deep"
	}
}

// remainingQueries trims a round's query list to what the search budget can
// still pay for. An exhausted budget ends the round with what exists rather
// than with an error.
func (b Budget) remainingQueries(queries []string, searchedSoFar int) []string {
	left := b.MaxSearches - searchedSoFar
	if left <= 0 {
		return nil
	}
	if len(queries) > left {
		return queries[:left]
	}
	return queries
}

// remainingFetches is the fetch-budget equivalent for a round's page list.
func (b Budget) remainingFetches(urls []string, fetchedSoFar int) []string {
	left := b.MaxFetches - fetchedSoFar
	if left <= 0 {
		return nil
	}
	if len(urls) > left {
		return urls[:left]
	}
	return urls
}

// String renders the preset for a progress line.
func (b Budget) String() string {
	return fmt.Sprintf("≤%d searches, ≤%d fetches, ≤%s, ≤$%.2f",
		b.MaxSearches, b.MaxFetches, b.WallClock.Round(time.Minute), b.MaxCostUSD)
}
