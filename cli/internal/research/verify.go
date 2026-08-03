package research

import (
	"context"
	"fmt"
	"strings"
	"unicode"
)

// Cross-path verification: self-critique — a model reviewing its own
// output — is an unreliable quality signal, but a second, independently-run
// path checking the same claim is a grounded, external one. For the claims
// a report leans on, this runs a small fresh fast-path pass and diffs the
// answers. Agreement raises confidence at the cost of one cheap check;
// disagreement is surfaced as a genuine contradiction, never silently
// resolved. It is opt-in and it is capped — running every claim twice
// defeats the cost discipline the fast path exists to provide.

const (
	// verifyMaxClaims bounds how many claims one run cross-checks.
	verifyMaxClaims = 2
	// verifySearches and verifyFetches bound each mini-run's retrieval.
	verifySearches = 2
	verifyFetches  = 3
)

// verifyResult is one cross-check's outcome.
type verifyResult struct {
	Question string
	Original string
	Second   string
	Agree    bool
	Note     string
}

// verifyClaims runs the opt-in cross-checks and returns what it found.
func (e *engine) verifyClaims(ctx context.Context, out pathOutcome) []verifyResult {
	stakes := pickStakes(out, verifyMaxClaims)
	if len(stakes) == 0 {
		return nil
	}
	e.pg.stage(fmt.Sprintf("cross-checking %d load-bearing claim(s)", len(stakes)))

	var results []verifyResult
	for _, stake := range stakes {
		if e.costReached() || e.deadline() {
			e.addWarning("cross-checking stopped early to stay inside the budget")
			break
		}
		second, err := e.miniResearch(ctx, stake.Question)
		if err != nil {
			e.pg.detail("cross-check failed: " + err.Error())
			continue
		}
		agree, note := e.compareClaims(ctx, stake.Question, stake.Answer, second)
		results = append(results, verifyResult{
			Question: stake.Question, Original: stake.Answer,
			Second: second, Agree: agree, Note: note,
		})
		if !agree {
			e.addWarning(fmt.Sprintf("cross-check disagreed on: %s", stake.Question))
		}
		e.state.Event("verify", fmt.Sprintf("%s agree=%v", stake.Question, agree))
	}
	return results
}

// pickStakes selects the findings worth cross-checking: answers that carry
// figures — the claims a report leans on — best confidence first.
func pickStakes(out pathOutcome, max int) []finding {
	var stakes []finding
	for _, q := range out.subs {
		f, ok := out.answered[q]
		if !ok || !containsFigure(f.Answer) {
			continue
		}
		if confidenceRank(f.Confidence) >= 2 {
			stakes = append(stakes, f)
		}
	}
	// Low-confidence answers go last: a cross-check may settle them.
	for _, q := range out.subs {
		f, ok := out.answered[q]
		if !ok || !containsFigure(f.Answer) || confidenceRank(f.Confidence) >= 2 {
			continue
		}
		stakes = append(stakes, f)
	}
	if len(stakes) > max {
		stakes = stakes[:max]
	}
	return stakes
}

// containsFigure reports whether text carries at least one number — the
// rough rubric for "a claim the report leans on".
func containsFigure(s string) bool {
	for _, r := range s {
		if unicode.IsDigit(r) {
			return true
		}
	}
	return false
}

// miniResearch re-researches one subquestion from scratch with a tiny
// budget: two searches, up to three reads, one reasoning call. It uses a
// private corpus so the main evidence pool is untouched, but the shared
// store — so a page the run already read costs nothing.
func (e *engine) miniResearch(ctx context.Context, question string) (string, error) {
	client := e.clients.For(RoleWorker)
	queries, err := searchQueries(ctx, e.clients.For(RolePlan), question, []string{question}, verifySearches, verifySearches, e.asOf)
	if err != nil {
		return "", err
	}
	hits, err := searchAll(ctx, e.provider, queries, 5, e.workers)
	if err != nil {
		return "", err
	}
	e.meter.AddSearches(len(queries))
	e.noteQuery(queries...)

	pool := newCorpus(2)
	fresh := pool.addHits(hits, verifyFetches, question)
	pages, _ := e.fetcher.FetchMany(ctx, fresh, e.workers)
	pool.addPages(pages)
	e.meter.AddFetches(len(pages))
	for _, p := range pages {
		e.store.Put(p.URL, p.Title, p.Text, OriginWeb)
	}
	if len(pool.cited()) == 0 {
		return "", fmt.Errorf("nothing readable found")
	}

	found, err := answerAll(ctx, client, []string{question}, pool, e.shape.evidence/2, e.workers, e.asOf)
	if err != nil {
		return "", err
	}
	if len(found) == 0 || strings.TrimSpace(found[0].Answer) == "" {
		return "", fmt.Errorf("no answer produced")
	}
	return found[0].Answer, nil
}

// compareClaims asks a cheap model whether two independently-researched
// answers agree. The prompt insists that different-but-compatible answers
// agree, and that only actual contradiction counts as disagreement.
func (e *engine) compareClaims(ctx context.Context, question, first, second string) (bool, string) {
	system := `You compare two independently-researched answers to the same
question. Decide whether they AGREE.

Agreement means the facts are compatible: the same figures within
rounding, the same direction, the same conclusion. Different wording,
different precision, or one answer adding detail the other omits is still
agreement. Disagreement means actual contradiction: different figures that
cannot both be right, opposite conclusions.

Reply with ONLY a JSON object:
{"agree": true | false, "note": "one sentence"}`

	user := fmt.Sprintf("Question: %s\n\nAnswer A:\n%s\n\nAnswer B:\n%s", question, first, second)

	var out struct {
		Agree bool   `json:"agree"`
		Note  string `json:"note"`
	}
	if err := e.clients.For(RoleRouter).ChatJSON(ctx, system, user, &out); err != nil {
		return false, "comparison failed: " + err.Error()
	}
	note := strings.TrimSpace(out.Note)
	if note == "" {
		note = "no note given"
	}
	return out.Agree, note
}

// verifySection renders the cross-check results into the report.
func verifySection(checks []verifyResult) string {
	var b strings.Builder
	b.WriteString("\n\n## Cross-checks\n\nThese load-bearing claims were re-researched independently and the answers compared:\n\n")
	for _, c := range checks {
		if c.Agree {
			fmt.Fprintf(&b, "- **Confirmed** — %s (%s)\n", c.Question, c.Note)
		} else {
			fmt.Fprintf(&b, "- **Contradiction** — %s: the independent check answered differently (%s). Second answer: %s\n",
				c.Question, c.Note, c.Second)
		}
	}
	return b.String()
}
