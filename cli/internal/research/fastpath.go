package research

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// pathOutcome is what either execution path hands to the writer: the
// subquestions asked, their answers, the search log and how far the loop
// got. Both paths produce the same shape, which is what lets escalation
// promote one into the other without a restart.
type pathOutcome struct {
	subs     []string
	answered map[string]finding
	queries  []string
	// pendingQueries is the search list the next round will issue; the gap
	// audit replaces it each round.
	pendingQueries []string
	roundsRun      int
	lastGaps       *gapReport
}

// runFast is the fast path (Perplexity-style): one agent loop interleaving
// search and reasoning, without supervisor/worker decomposition. It is the
// folded form of the engine the ×N dial used to drive — the same
// decompose→search→read→reason→gap loop, capped by the fast budgets,
// metered line by line, and checkpointed so a closed terminal does not
// lose it. It is also the only path whose cost is knowable in advance,
// because nothing in it branches.
func (e *engine) runFast(ctx context.Context) (pathOutcome, error) {
	out := pathOutcome{answered: map[string]finding{}}

	// Resume restores the loop's state — subquestions, settled answers,
	// the search log — so the run continues rather than starts over.
	snap := e.state.Snapshot()
	resuming := len(snap.Fast.Subs) > 0
	if resuming {
		out.subs = snap.Fast.Subs
		for _, f := range snap.Fast.Findings {
			out.answered[f.Question] = f
		}
		out.queries = snap.Fast.Queries
		out.roundsRun = snap.Fast.Round
		e.noteQuery(snap.Fast.Queries...)
		e.pg.detail(fmt.Sprintf("resuming fast path after round %d", snap.Fast.Round))
	}

	asOf := e.asOf
	planClient := e.clients.For(RolePlan)

	if !resuming {
		e.pg.stage("planning")
		subs, err := decompose(ctx, planClient, e.question, e.shape.maxSubs, asOf)
		if err != nil {
			return out, err
		}
		out.subs = subs
		e.pg.detail(fmt.Sprintf("%d subquestions", len(subs)))
		// The trail should show what the loop actually asked, not just the
		// count: each question lands as its own detail line, so surfaces can
		// list them viewable-but-collapsed instead of hiding them entirely.
		for _, q := range subs {
			e.pg.detail(q)
		}

		queries, err := searchQueries(ctx, planClient, e.question, subs, e.shape.queriesPer, e.shape.maxQueries, asOf)
		if err != nil {
			return out, err
		}
		out.pendingQueries = queries
	} else {
		// A resumed run re-derives its next queries from what is still open;
		// when nothing is recorded it simply searches the question itself.
		out.pendingQueries = []string{e.question}
	}

	rounds := e.shape.rounds
	if e.opts.MaxRounds > 0 {
		rounds = e.opts.MaxRounds
	}

	for round := out.roundsRun + 1; round <= rounds; round++ {
		// The first round always runs. A budget too short for it would
		// otherwise produce no findings at all, and "no findings" is an
		// error, not a report — a limit should shorten a run, never fail it.
		if round > 1 && e.deadline() {
			e.addWarning(fmt.Sprintf("stopped after %s to stay inside the time budget",
				time.Since(e.started).Round(time.Second)))
			e.pg.detail("time budget reached; reporting on what was gathered")
			break
		}
		if round > 1 && e.costReached() {
			e.addWarning("stopped early to stay inside the cost budget")
			e.pg.detail("cost budget reached; reporting on what was gathered")
			break
		}
		e.pg.round(round, rounds)
		out.roundsRun = round

		queries := e.budget.remainingQueries(out.pendingQueries, e.meter.searchCount())
		if len(queries) == 0 {
			e.addWarning("search budget exhausted; reporting on what was gathered")
			break
		}
		e.pg.stage(fmt.Sprintf("searching (%d queries)", len(queries)))
		hits, err := searchAll(ctx, e.provider, queries, e.shape.resultsPer, e.workers)
		if err != nil {
			// A total search failure in round 1 is fatal; later it just
			// means this round adds nothing, and what is gathered stands.
			if round == 1 {
				return out, err
			}
			e.pg.detail("search failed: " + err.Error())
			e.addWarning("a follow-up search round failed: " + err.Error())
			break
		}
		e.meter.AddSearches(len(queries))
		out.queries = append(out.queries, queries...)
		e.noteQuery(queries...)
		e.state.Event("search", fmt.Sprintf("round %d: %d queries", round, len(queries)))

		// The subquestions are what the pages will be read for, so they
		// decide which hits are worth the fetch.
		fresh := e.pool.addHits(hits, e.shape.newPagesMax, e.question+"\n"+strings.Join(out.subs, "\n"))
		fresh = e.budget.remainingFetches(fresh, e.meter.fetchCount())
		e.pg.stage(fmt.Sprintf("reading %d pages", len(fresh)))
		pages, ferrs := e.fetcher.FetchMany(ctx, fresh, e.workers)
		e.pool.addPages(pages)
		e.meter.AddFetches(len(pages))
		// Every page also lands in the shared store: the citation pass
		// reads raw documents from there, and an escalation seeds the deep
		// path with exactly this material.
		for _, p := range pages {
			e.store.Put(p.URL, p.Title, p.Text, OriginWeb)
		}
		if len(ferrs) > 0 {
			e.pg.detail(fmt.Sprintf("%d of %d pages unreadable", len(ferrs), len(fresh)))
		}

		if len(e.pool.cited()) == 0 {
			if round == rounds {
				return out, fmt.Errorf("no readable sources found for %q", e.question)
			}
			e.pg.detail("nothing readable yet; widening the search")
			e.checkpointFast(out)
			continue
		}

		// Which subquestions still need work: the ones never asked, and the
		// ones whose answer was not solid. A high-confidence finding is
		// left alone — the corpus grew, but it grew to close other gaps.
		todo := pending(out.subs, out.answered)
		e.pg.stage(fmt.Sprintf("reading evidence for %d subquestion(s)", len(todo)))
		found, err := answerAll(ctx, e.clients.For(RoleWorker), todo, e.pool, e.shape.evidence, e.workers, asOf)
		if err != nil {
			return out, err
		}
		for _, f := range found {
			out.answered[f.Question] = better(out.answered[f.Question], f)
		}

		e.checkpointFast(out)

		if round == rounds {
			// No point asking what is missing when nothing more will be
			// done about it; the limitations section covers it instead.
			break
		}

		e.pg.stage("checking for gaps")
		gaps, err := detectGaps(ctx, e.clients.For(RoleSupervisor), e.question, ordered(out.subs, out.answered), e.shape.maxQueries, asOf)
		if err != nil {
			e.pg.detail("gap check failed: " + err.Error())
			e.addWarning("the gap audit failed, so the run stopped early: " + err.Error())
			break
		}
		out.lastGaps = &gaps
		if gaps.Complete || len(gaps.Queries) == 0 {
			e.pg.detail("evidence is sufficient")
			break
		}

		// The gaps become subquestions of their own. This is the difference
		// between a loop that searches again and one that actually answers
		// what it went back for.
		var added []string
		for _, q := range gaps.Questions {
			if _, seen := out.answered[q]; seen || containsFold(out.subs, q) {
				continue
			}
			if len(out.subs) >= e.shape.maxSubs+e.shape.maxQueries {
				break
			}
			out.subs = append(out.subs, q)
			added = append(added, q)
		}
		e.pg.detail(fmt.Sprintf("%d gap(s), %d new subquestion(s); searching again", len(gaps.Missing), len(added)))
		for _, q := range added {
			e.pg.detail(q)
		}
		out.pendingQueries = gaps.Queries
		e.checkpointFast(out)
	}

	return out, nil
}

// checkpointFast persists the loop state after a round: a crash between
// rounds then loses nothing at all.
func (e *engine) checkpointFast(out pathOutcome) {
	findings := ordered(out.subs, out.answered)
	e.state.Mutate(func(r *RunMeta) {
		r.Fast = FastState{
			Subs:     append([]string(nil), out.subs...),
			Findings: findings,
			Queries:  append([]string(nil), out.queries...),
			Round:    out.roundsRun,
		}
	})
	_ = e.state.Checkpoint()
}
