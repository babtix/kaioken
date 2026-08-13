package prism

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestScoreCaseRanksFirstMatch(t *testing.T) {
	gc := GoldenCase{Question: "q", MustContain: []string{"exponential backoff"}}
	res := Result{
		Chunks:      []string{"something else", "we apply exponential backoff here", "more"},
		SourceFound: true,
	}
	got := scoreCase(gc, res)

	if got.Rank != 2 {
		t.Errorf("rank = %d, want 2", got.Rank)
	}
	if !got.Correct {
		t.Error("a case whose phrase was retrieved was scored incorrect")
	}
	if got.Recall != 1 {
		t.Errorf("recall = %v, want 1", got.Recall)
	}
}

func TestScoreCaseMissHasNoRank(t *testing.T) {
	got := scoreCase(
		GoldenCase{MustContain: []string{"nowhere to be found"}},
		Result{Chunks: []string{"unrelated text"}, SourceFound: true},
	)
	if got.Rank != 0 || got.Correct {
		t.Errorf("a miss scored rank %d correct %t", got.Rank, got.Correct)
	}
	if got.Recall != 0 {
		t.Errorf("recall = %v for a miss", got.Recall)
	}
}

func TestScoreCaseRecallIsSeparateFromRank(t *testing.T) {
	// A retrieval can surface the right document at rank 1 and still miss half
	// of what the answer needs, which is exactly what recall is for.
	got := scoreCase(
		GoldenCase{MustContain: []string{"alpha", "bravo"}},
		Result{Chunks: []string{"alpha appears here"}, SourceFound: true},
	)
	if got.Rank != 1 {
		t.Errorf("rank = %d, want 1", got.Rank)
	}
	if got.Recall != 0.5 {
		t.Errorf("recall = %v, want 0.5", got.Recall)
	}
}

func TestScoreCaseMatchesCaseInsensitively(t *testing.T) {
	// Golden phrases are copied out of a document by hand; requiring exact
	// case would make a set fail for reasons that have nothing to do with
	// retrieval.
	got := scoreCase(
		GoldenCase{MustContain: []string{"Exponential Backoff"}},
		Result{Chunks: []string{"we apply exponential backoff"}, SourceFound: true},
	)
	if !got.Correct {
		t.Error("a case-different phrase was scored a miss")
	}
}

func TestUnanswerableCaseIsCorrectOnlyWhenRefused(t *testing.T) {
	// This is the engine's central claim, so it gets its own inversion: the
	// right answer to a question the corpus cannot answer is "no source".
	refused := scoreCase(GoldenCase{Unanswerable: true}, Result{SourceFound: false})
	if !refused.Correct {
		t.Error("correctly refusing an unanswerable case scored incorrect")
	}

	answered := scoreCase(GoldenCase{Unanswerable: true},
		Result{Chunks: []string{"a confident irrelevance"}, SourceFound: true})
	if answered.Correct {
		t.Error("fabricating an answer to an unanswerable case scored correct")
	}
}

func TestEvaluateSeparatesHitRateFromAbstention(t *testing.T) {
	// A change that improves hit rate while destroying abstention accuracy is
	// a regression hit rate alone cannot see, so the two must not be mixed.
	s, slug := seeded(t, nil)
	e := testEngine(t, s)

	set := &GoldenSet{Cases: []GoldenCase{
		{Question: "exponential backoff jitter", Module: slug, MustContain: []string{"backoff"}},
		{Question: "segments seal and compact", Module: slug, MustContain: []string{"segments"}},
		{Question: "the airspeed velocity of an unladen swallow", Module: slug, Unanswerable: true},
	}}

	rep, err := e.Evaluate(context.Background(), set, EvalConfig{Name: "baseline"})
	if err != nil {
		t.Fatal(err)
	}
	if rep.Answerable != 2 {
		t.Errorf("answerable = %d, want 2", rep.Answerable)
	}
	if rep.Unanswerable != 1 {
		t.Errorf("unanswerable = %d, want 1", rep.Unanswerable)
	}
	if rep.HitRate == 0 {
		t.Error("hit rate is zero for phrases that appear verbatim in the corpus")
	}
	if rep.MRR <= 0 || rep.MRR > 1 {
		t.Errorf("mrr = %v, want a value in (0,1]", rep.MRR)
	}
	// Ungraded is counted, not silently ignored: with no utility model every
	// retrieval here is unverified, and a report that hid that would be
	// measuring an unchecked pipeline while looking clean.
	if rep.Ungraded != len(rep.Cases) {
		t.Errorf("ungraded = %d of %d cases with no gate wired in", rep.Ungraded, len(rep.Cases))
	}
}

func TestEvaluateCountsFabricationsSeparately(t *testing.T) {
	s, slug := seeded(t, nil)
	e := testEngine(t, s)

	// Lexical retrieval will match something for almost any query, so an
	// ungated pipeline is expected to fail this case — which is the point.
	set := &GoldenSet{Cases: []GoldenCase{
		{Question: "retry backoff jitter segments", Module: slug, Unanswerable: true},
	}}
	rep, err := e.Evaluate(context.Background(), set, EvalConfig{Name: "ungated"})
	if err != nil {
		t.Fatal(err)
	}
	if rep.FalsePositives+int(rep.Abstention) == 0 {
		t.Error("neither abstention nor a false positive was recorded")
	}
	if rep.FalsePositives > 0 && !strings.Contains(rep.Format(), "FABRICATED") {
		t.Errorf("a fabricated answer is not called out in the report: %s", rep.Format())
	}
}

func TestEvaluateRequiresAModule(t *testing.T) {
	s, _ := seeded(t, nil)
	e := testEngine(t, s)
	_, err := e.Evaluate(context.Background(),
		&GoldenSet{Cases: []GoldenCase{{Question: "q"}}}, EvalConfig{Name: "x"})
	if err == nil {
		t.Error("a case with no module was accepted")
	}
}

func TestLoadGoldenSetAcceptsBothShapes(t *testing.T) {
	dir := t.TempDir()

	wrapped := filepath.Join(dir, "wrapped.json")
	if err := os.WriteFile(wrapped,
		[]byte(`{"cases":[{"question":"q","must_contain":["a"]}]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	bare := filepath.Join(dir, "bare.json")
	if err := os.WriteFile(bare,
		[]byte(`[{"question":"q","must_contain":["a"]}]`), 0o644); err != nil {
		t.Fatal(err)
	}

	for _, p := range []string{wrapped, bare} {
		set, err := LoadGoldenSet(p)
		if err != nil {
			t.Fatalf("%s: %v", filepath.Base(p), err)
		}
		if len(set.Cases) != 1 || set.Cases[0].Question != "q" {
			t.Errorf("%s parsed as %+v", filepath.Base(p), set.Cases)
		}
	}
}

func TestCompareReportsFlagsTheRetrievalAbstentionTradeoff(t *testing.T) {
	// Retrieving more while refusing less is not obviously better, and reading
	// two columns is how that gets missed.
	out := CompareReports([]*EvalReport{
		{Config: "greedy", HitRate: 0.9, Abstention: 0.2},
		{Config: "careful", HitRate: 0.7, Abstention: 0.9},
	})
	if !strings.Contains(out, "greedy") || !strings.Contains(out, "careful") {
		t.Fatalf("both configurations should appear:\n%s", out)
	}
	if !strings.Contains(out, "abstains less") {
		t.Errorf("the trade-off was not called out:\n%s", out)
	}
	// Best hit rate leads.
	if strings.Index(out, "greedy") > strings.Index(out, "careful") {
		t.Errorf("reports are not ordered by hit rate:\n%s", out)
	}
}

// testEngine wires an engine directly over a store, bypassing config, so the
// harness is exercised without a models file or a network.
func testEngine(t *testing.T, s *Store) *Engine {
	t.Helper()
	r := NewRetriever(s, nil, nil, NewCache(0))
	return &Engine{
		Store:     s,
		Retriever: r,
		Agent:     NewAgent(r),
		Options:   Options{TopK: DefaultTopK, Variants: 1}.withDefaults(),
		Chunk:     DefaultChunkConfig(),
	}
}
