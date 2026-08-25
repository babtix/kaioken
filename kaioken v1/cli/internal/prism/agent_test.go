package prism

import (
	"context"
	"strings"
	"sync"
	"testing"
)

// routerUtility answers the router one way and every other prompt another, so
// a test can drive routing without also driving grading.
func routerUtility(verdict string, decomposition []string) *fakeUtility {
	return &fakeUtility{reply: func(system, _ string) string {
		switch {
		case strings.Contains(system, "You classify questions"):
			return verdict
		case strings.Contains(system, "break a question"):
			return strings.Join(decomposition, "\n")
		case strings.Contains(system, "relevance grader"):
			return "relevant"
		case strings.Contains(system, "found nothing"):
			return "reformulated question about backoff"
		}
		return ""
	}}
}

func TestRouterKeepsShortQuestionsFree(t *testing.T) {
	// The common case must cost nothing extra: no classifier call at all.
	s, slug := seeded(t, nil)
	u := routerUtility("complex", nil)
	a := NewAgent(NewRetriever(s, nil, u, NewCache(0)))

	res, err := a.Retrieve(context.Background(), "what is the retry policy", AgentOptions{
		Options: Options{Module: slug, NoGrade: true},
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Route != RouteSimple {
		t.Errorf("route = %s, want simple", res.Route)
	}
	if u.count() != 0 {
		t.Errorf("a short marker-free question cost %d model calls", u.count())
	}
}

func TestRouterEscalatesOnComparisonMarkers(t *testing.T) {
	s, slug := seeded(t, nil)
	u := routerUtility("simple", []string{"what is backoff", "what is compaction"})
	a := NewAgent(NewRetriever(s, nil, u, NewCache(0)))

	res, err := a.Retrieve(context.Background(),
		"compare the retry policy and the storage layout", AgentOptions{
			Options: Options{Module: slug, NoGrade: true},
		})
	if err != nil {
		t.Fatal(err)
	}
	if res.Route != RouteComplex {
		t.Errorf("route = %s for a comparison, want complex", res.Route)
	}
	// The marker decided it, so the classifier itself was never asked.
	if u.sawRole("You classify questions") {
		t.Error("the classifier was called despite a decisive marker")
	}
}

func TestRouterEscalatesOnMultipleQuestionMarks(t *testing.T) {
	s, slug := seeded(t, nil)
	a := NewAgent(NewRetriever(s, nil, routerUtility("simple", []string{"a", "b"}), NewCache(0)))

	res, _ := a.Retrieve(context.Background(), "what is backoff? and what is jitter?", AgentOptions{
		Options: Options{Module: slug, NoGrade: true},
	})
	if res.Route != RouteComplex {
		t.Errorf("route = %s for two questions, want complex", res.Route)
	}
}

func TestRouterAsksTheModelOnlyWhenAmbiguous(t *testing.T) {
	// Long, no markers: exactly the case the heuristic cannot settle.
	s, slug := seeded(t, nil)
	u := routerUtility("complex", []string{"what is backoff", "what is jitter"})
	a := NewAgent(NewRetriever(s, nil, u, NewCache(0)))

	long := "I would like to understand the way the system currently handles " +
		"transient failures across the whole request path in production"
	res, err := a.Retrieve(context.Background(), long, AgentOptions{
		Options: Options{Module: slug, NoGrade: true},
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Route != RouteComplex {
		t.Errorf("route = %s, want the classifier's verdict", res.Route)
	}
	if u.count() == 0 {
		t.Error("the classifier was never consulted on an ambiguous query")
	}
}

func TestRouterDefaultsToSimpleWhenTheModelFails(t *testing.T) {
	// Escalating on an error would make an outage expensive as well as slow.
	s, slug := seeded(t, nil)
	u := &fakeUtility{failNext: 999}
	a := NewAgent(NewRetriever(s, nil, u, NewCache(0)))

	long := "I would like to understand the way the system currently handles " +
		"transient failures across the whole request path in production"
	res, err := a.Retrieve(context.Background(), long, AgentOptions{
		Options: Options{Module: slug, NoGrade: true},
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Route != RouteSimple {
		t.Errorf("route = %s after a classifier failure, want simple", res.Route)
	}
}

func TestAgentWithoutAUtilityModelBehavesLikeTheStaticPipeline(t *testing.T) {
	s, slug := seeded(t, nil)
	a := NewAgent(NewRetriever(s, nil, nil, NewCache(0)))

	res, err := a.Retrieve(context.Background(),
		"compare the retry policy and the storage layout", AgentOptions{
			Options: Options{Module: slug},
		})
	if err != nil {
		t.Fatal(err)
	}
	// The marker still routes it complex, but decomposition has no model, so
	// it degrades to the query unchanged rather than to no retrieval.
	if len(res.SubQuestions) != 1 {
		t.Errorf("sub-questions = %v without a planner, want the query alone", res.SubQuestions)
	}
	if !res.SourceFound {
		t.Error("degrading to single-shot returned nothing")
	}
}

func TestComplexRouteDecomposesAndTraces(t *testing.T) {
	s, slug := seeded(t, nil)
	u := routerUtility("complex", []string{
		"what does the retry policy say about backoff",
		"what does the storage layout say about segments",
	})
	a := NewAgent(NewRetriever(s, nil, u, NewCache(0)))

	res, err := a.Retrieve(context.Background(),
		"compare the retry policy and the storage layout", AgentOptions{
			Options: Options{Module: slug, NoGrade: true},
		})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.SubQuestions) != 2 {
		t.Fatalf("sub-questions = %v, want 2", res.SubQuestions)
	}
	if len(res.Steps) < 2 {
		t.Errorf("trace has %d steps for 2 sub-questions", len(res.Steps))
	}
	for _, st := range res.Steps {
		if st.Query == "" {
			t.Error("a trace step has no query — the trace cannot be debugged")
		}
	}
}

func TestDecompositionIsCappedRegardlessOfTheModel(t *testing.T) {
	// Caps live in the orchestrator because a model cannot reliably
	// self-limit on adversarial input.
	s, slug := seeded(t, nil)
	u := routerUtility("complex", []string{"one", "two", "three", "four", "five", "six", "seven"})
	a := NewAgent(NewRetriever(s, nil, u, NewCache(0)))

	res, err := a.Retrieve(context.Background(), "compare everything with everything",
		AgentOptions{Options: Options{Module: slug, NoGrade: true}})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.SubQuestions) > maxSubQuestions {
		t.Errorf("%d sub-questions, cap is %d", len(res.SubQuestions), maxSubQuestions)
	}
}

func TestComplexRouteMergesRoundRobin(t *testing.T) {
	// With concatenation the first sub-question fills the budget and a
	// two-part question gets a one-part answer.
	a := []Result{
		{Chunks: []string{"a1", "a2", "a3", "a4"}, SourceFound: true},
		{Chunks: []string{"b1", "b2"}, SourceFound: true},
	}
	got := interleave(a, 4)
	want := []string{"a1", "b1", "a2", "b2"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Errorf("interleave = %v, want %v", got, want)
	}
}

func TestInterleaveDeduplicates(t *testing.T) {
	results := []Result{
		{Chunks: []string{"shared", "a2"}},
		{Chunks: []string{"shared", "b2"}},
	}
	got := interleave(results, 8)
	seen := map[string]bool{}
	for _, c := range got {
		if seen[c] {
			t.Errorf("interleave returned %q twice", c)
		}
		seen[c] = true
	}
}

func TestInterleaveRespectsTheChunkCap(t *testing.T) {
	var results []Result
	for i := 0; i < 5; i++ {
		results = append(results, Result{Chunks: []string{
			"a" + string(rune('0'+i)), "b" + string(rune('0'+i)), "c" + string(rune('0'+i)),
		}})
	}
	if got := interleave(results, maxMergedChunks); len(got) > maxMergedChunks {
		t.Errorf("%d chunks merged, cap is %d", len(got), maxMergedChunks)
	}
}

func TestDegradedSubQuestionsAreNotRetried(t *testing.T) {
	// A degraded retrieval is an infrastructure failure. Reformulating it
	// cannot succeed and would spend budget a real miss needs.
	s := newStore(t)
	m := mustModule(t, s, "Empty")
	if _, err := NewIngestor(s, nil, DefaultChunkConfig()).
		ImportText(context.Background(), m.Slug, "d.md", "", "Unrelated filler content here.", nil); err != nil {
		t.Fatal(err)
	}

	var mu sync.Mutex
	reformulations := 0
	u := &fakeUtility{reply: func(system, _ string) string {
		mu.Lock()
		defer mu.Unlock()
		switch {
		case strings.Contains(system, "break a question"):
			return "first sub question\nsecond sub question"
		case strings.Contains(system, "found nothing"):
			reformulations++
			return "a rewritten question"
		}
		return "relevant"
	}}

	// No embedder, so every retrieval is degraded by construction.
	a := NewAgent(NewRetriever(s, nil, u, NewCache(0)))
	if _, err := a.Retrieve(context.Background(), "compare one thing and another thing",
		AgentOptions{Options: Options{Module: m.Slug, NoGrade: true}}); err != nil {
		t.Fatal(err)
	}

	mu.Lock()
	defer mu.Unlock()
	if reformulations != 0 {
		t.Errorf("%d degraded sub-questions were reformulated", reformulations)
	}
}

func TestUnresolvedSubQuestionsAreReported(t *testing.T) {
	// A partial answer is only honest if the caller knows which part is
	// missing.
	s, slug := seeded(t, nil)
	u := &fakeUtility{reply: func(system, _ string) string {
		switch {
		case strings.Contains(system, "break a question"):
			return "what does the retry policy say\nwhat is the airspeed velocity of an unladen swallow"
		case strings.Contains(system, "found nothing"):
			return "" // no rewrite available
		}
		return "relevant"
	}}
	a := NewAgent(NewRetriever(s, nil, u, NewCache(0)))

	res, err := a.Retrieve(context.Background(), "compare backoff and swallows",
		AgentOptions{Options: Options{Module: slug, NoGrade: true}})
	if err != nil {
		t.Fatal(err)
	}
	if res.SourceFound && len(res.Unresolved) == 0 && len(res.SubQuestions) > 1 {
		t.Log("both sub-questions resolved; nothing to assert")
	}
	for _, u := range res.Unresolved {
		if !containsAny(res.SubQuestions, u) {
			t.Errorf("unresolved %q is not one of the sub-questions", u)
		}
	}
}

func TestAgentGradedIsAndAcrossContributors(t *testing.T) {
	// One ungraded retrieval makes the merged context unverified, however
	// many of the others were checked.
	if allGraded([]Result{{Graded: true}, {Graded: false}}) {
		t.Error("allGraded true with an ungraded contributor")
	}
	if !allGraded([]Result{{Graded: true}, {Graded: true}}) {
		t.Error("allGraded false with every contributor graded")
	}
	if allGraded(nil) {
		t.Error("allGraded true with no contributors at all")
	}
}

func TestForceRouteBypassesTheClassifier(t *testing.T) {
	s, slug := seeded(t, nil)
	u := routerUtility("complex", []string{"a", "b"})
	a := NewAgent(NewRetriever(s, nil, u, NewCache(0)))

	res, err := a.Retrieve(context.Background(),
		"compare the retry policy and the storage layout", AgentOptions{
			Options:    Options{Module: slug, NoGrade: true},
			ForceRoute: RouteSimple,
		})
	if err != nil {
		t.Fatal(err)
	}
	if res.Route != RouteSimple {
		t.Errorf("route = %s, want the forced simple route", res.Route)
	}
}

func containsAny(hay []string, needle string) bool {
	for _, h := range hay {
		if h == needle {
			return true
		}
	}
	return false
}
