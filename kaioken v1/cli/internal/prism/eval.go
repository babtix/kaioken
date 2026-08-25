package prism

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
)

// Architectural choices here should be decided by measurement rather than by
// which one sounds better, so this harness scores a golden set against any
// retrieval configuration and prints them side by side.
//
// Two layers, deliberately separated by cost:
//
// Retrieval metrics — hit rate, MRR, source recall — need no model call and
// are deterministic. Cheap enough to run on every commit.
//
// Abstention accuracy is the one number that measures this engine's central
// claim: do questions the corpus cannot answer actually come back with
// SourceFound false? A change that improves hit rate while destroying
// abstention accuracy is a regression that hit rate alone cannot see, and no
// standard RAG metric covers it.
//
// Golden cases match on distinctive phrases copied from the source document
// rather than on chunk ids, so a golden set survives re-ingestion,
// re-chunking, and an embedding-model swap. Pinning to ids would mean every
// change to chunking silently invalidates the whole set.

// GoldenCase is one question with what a correct retrieval must contain.
type GoldenCase struct {
	// Question is asked verbatim.
	Question string `json:"question"`
	// Module scopes it; empty uses the run's default module.
	Module string `json:"module,omitempty"`
	// MustContain are distinctive phrases from the source. A retrieval hits
	// when any returned chunk contains one, compared case-insensitively.
	MustContain []string `json:"must_contain,omitempty"`
	// Unanswerable marks a question the corpus genuinely cannot answer. The
	// correct result is SourceFound false — anything else is a fabrication the
	// pipeline should have refused.
	Unanswerable bool `json:"unanswerable,omitempty"`
}

// GoldenSet is a file of cases.
type GoldenSet struct {
	Cases []GoldenCase `json:"cases"`
}

// LoadGoldenSet reads a golden set from disk. It accepts either the wrapped
// object or a bare array, because both are things people write.
func LoadGoldenSet(path string) (*GoldenSet, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var set GoldenSet
	if err := json.Unmarshal(raw, &set); err == nil && len(set.Cases) > 0 {
		return &set, nil
	}
	var cases []GoldenCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		return nil, fmt.Errorf("parsing %s: %w", path, err)
	}
	return &GoldenSet{Cases: cases}, nil
}

// CaseResult is one scored case.
type CaseResult struct {
	Case GoldenCase `json:"case"`
	// Rank is the 1-based position of the first chunk containing a required
	// phrase, or 0 for a miss.
	Rank int `json:"rank"`
	// Recall is the fraction of required phrases present anywhere in the
	// returned chunks. Distinct from Rank: a retrieval can surface the right
	// document at rank 1 and still miss half of what the answer needs.
	Recall float64 `json:"recall"`
	// Correct is the case's own verdict. For an answerable case it means a
	// required phrase was found; for an unanswerable one it means the engine
	// correctly reported no source.
	Correct     bool `json:"correct"`
	SourceFound bool `json:"source_found"`
	Graded      bool `json:"graded"`
	Degraded    bool `json:"degraded"`
	Chunks      int  `json:"chunks"`
}

// EvalReport is a whole run.
type EvalReport struct {
	Config string       `json:"config"`
	Cases  []CaseResult `json:"cases"`

	// HitRate is the fraction of answerable cases whose retrieval contained a
	// required phrase.
	HitRate float64 `json:"hit_rate"`
	// MRR is the mean reciprocal rank over answerable cases, which rewards
	// putting the right chunk first rather than merely somewhere.
	MRR float64 `json:"mrr"`
	// SourceRecall is the mean fraction of required phrases retrieved.
	SourceRecall float64 `json:"source_recall"`
	// Abstention is the fraction of unanswerable cases correctly refused. The
	// number this architecture exists to move.
	Abstention float64 `json:"abstention"`
	// FalsePositives counts unanswerable cases answered anyway — the failure
	// mode that matters most, so it is reported as a count and not folded into
	// a rate.
	FalsePositives int `json:"false_positives"`
	// Ungraded and DegradedRuns count retrievals whose flags say the result is
	// not trustworthy. A run with many of either is measuring the outage, not
	// the configuration.
	Ungraded     int `json:"ungraded"`
	DegradedRuns int `json:"degraded_runs"`

	Answerable   int `json:"answerable"`
	Unanswerable int `json:"unanswerable"`
}

// EvalConfig names one retrieval configuration to score.
type EvalConfig struct {
	// Name labels the column in a comparison.
	Name string
	// Options is the retrieval configuration.
	Options Options
	// Agent routes through decomposition instead of the static path.
	Agent bool
	// ForceRoute pins the agent's route, so the two can be measured
	// independently rather than through whatever the classifier happened to
	// pick that day.
	ForceRoute Route
}

// Evaluate scores a golden set against one configuration.
func (e *Engine) Evaluate(ctx context.Context, set *GoldenSet, cfg EvalConfig) (*EvalReport, error) {
	rep := &EvalReport{Config: cfg.Name}

	var rrSum, recallSum float64
	var hits, abstained int

	for _, gc := range set.Cases {
		opt := cfg.Options
		if opt.TopK == 0 {
			opt = e.Options
		}
		if gc.Module != "" {
			opt.Module = gc.Module
		}
		if opt.Module == "" {
			return nil, fmt.Errorf("case %q has no module and none was configured", gc.Question)
		}

		var res AgentResult
		var err error
		if cfg.Agent {
			res, err = e.Agent.Retrieve(ctx, gc.Question, AgentOptions{Options: opt, ForceRoute: cfg.ForceRoute})
		} else {
			var one Result
			one, err = e.Retriever.Retrieve(ctx, gc.Question, opt)
			res = AgentResult{Result: one}
		}
		if err != nil {
			return nil, fmt.Errorf("case %q: %w", gc.Question, err)
		}

		cr := scoreCase(gc, res.Result)
		rep.Cases = append(rep.Cases, cr)

		if !cr.Graded {
			rep.Ungraded++
		}
		if cr.Degraded {
			rep.DegradedRuns++
		}

		if gc.Unanswerable {
			rep.Unanswerable++
			if cr.Correct {
				abstained++
			} else {
				rep.FalsePositives++
			}
			continue
		}

		rep.Answerable++
		recallSum += cr.Recall
		if cr.Rank > 0 {
			hits++
			rrSum += 1 / float64(cr.Rank)
		}
	}

	if rep.Answerable > 0 {
		rep.HitRate = float64(hits) / float64(rep.Answerable)
		rep.MRR = rrSum / float64(rep.Answerable)
		rep.SourceRecall = recallSum / float64(rep.Answerable)
	}
	if rep.Unanswerable > 0 {
		rep.Abstention = float64(abstained) / float64(rep.Unanswerable)
	}
	return rep, nil
}

// scoreCase applies one case's expectations to one result.
func scoreCase(gc GoldenCase, res Result) CaseResult {
	cr := CaseResult{
		Case:        gc,
		SourceFound: res.SourceFound,
		Graded:      res.Graded,
		Degraded:    res.Degraded,
		Chunks:      len(res.Chunks),
	}

	if gc.Unanswerable {
		// The corpus cannot answer this. Correct behaviour is to say so.
		cr.Correct = !res.SourceFound
		return cr
	}

	lowered := make([]string, len(res.Chunks))
	for i, c := range res.Chunks {
		lowered[i] = strings.ToLower(c)
	}

	found := 0
	for _, want := range gc.MustContain {
		w := strings.ToLower(strings.TrimSpace(want))
		if w == "" {
			continue
		}
		for i, c := range lowered {
			if strings.Contains(c, w) {
				found++
				if cr.Rank == 0 || i+1 < cr.Rank {
					cr.Rank = i + 1
				}
				break
			}
		}
	}
	if n := countNonEmpty(gc.MustContain); n > 0 {
		cr.Recall = float64(found) / float64(n)
	}
	cr.Correct = cr.Rank > 0
	return cr
}

func countNonEmpty(ss []string) int {
	n := 0
	for _, s := range ss {
		if strings.TrimSpace(s) != "" {
			n++
		}
	}
	return n
}

// Format renders a report as a fixed-width block.
func (r *EvalReport) Format() string {
	var b strings.Builder
	fmt.Fprintf(&b, "%-16s hit@k %.2f   mrr %.2f   recall %.2f   abstention %.2f",
		r.Config, r.HitRate, r.MRR, r.SourceRecall, r.Abstention)
	if r.FalsePositives > 0 {
		// Called out rather than left in the abstention rate: an answer
		// fabricated for a question the corpus cannot answer is the failure
		// this engine exists to prevent, and one is worth noticing.
		fmt.Fprintf(&b, "   FABRICATED %d", r.FalsePositives)
	}
	if r.Ungraded > 0 {
		fmt.Fprintf(&b, "   ungraded %d/%d", r.Ungraded, len(r.Cases))
	}
	if r.DegradedRuns > 0 {
		fmt.Fprintf(&b, "   degraded %d/%d", r.DegradedRuns, len(r.Cases))
	}
	return b.String()
}

// CompareReports renders several configurations one per line, best hit rate
// first, so a change is judged against the alternative rather than in isolation.
func CompareReports(reports []*EvalReport) string {
	sorted := append([]*EvalReport(nil), reports...)
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].HitRate > sorted[j].HitRate })

	var b strings.Builder
	for _, r := range sorted {
		b.WriteString(r.Format())
		b.WriteByte('\n')
	}

	// A configuration that retrieves better while refusing less is not
	// obviously better, and reading two columns is how that gets missed.
	if len(sorted) > 1 {
		best, worst := sorted[0], sorted[len(sorted)-1]
		if best.HitRate > worst.HitRate && best.Abstention < worst.Abstention {
			fmt.Fprintf(&b, "\nnote: %s retrieves better than %s but abstains less "+
				"(%.2f vs %.2f) — it is finding more, and also refusing less often "+
				"when it should refuse.\n", best.Config, worst.Config, best.Abstention, worst.Abstention)
		}
	}
	return b.String()
}
