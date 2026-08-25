package prism

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeUtility stands in for the cheap instruct model. reply is consulted per
// call so a test can decide verdicts from the prompt it was given.
type fakeUtility struct {
	mu       sync.Mutex
	calls    int
	prompts  []string
	systems  []string
	failNext int
	reply    func(system, user string) string
}

func (f *fakeUtility) ID() string { return "fake-utility" }

func (f *fakeUtility) Complete(_ context.Context, system, user string, _ int) (string, error) {
	f.mu.Lock()
	f.calls++
	f.prompts = append(f.prompts, user)
	f.systems = append(f.systems, system)
	failing := f.failNext > 0
	if failing {
		f.failNext--
	}
	f.mu.Unlock()

	if failing {
		return "", errors.New("utility model unavailable")
	}
	if f.reply == nil {
		return "relevant", nil
	}
	return f.reply(system, user), nil
}

func (f *fakeUtility) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

func (f *fakeUtility) seen() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.prompts...)
}

// sawRole reports whether any call used a system prompt containing marker,
// which is how a test tells the router, planner and grader calls apart.
func (f *fakeUtility) sawRole(marker string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, s := range f.systems {
		if strings.Contains(s, marker) {
			return true
		}
	}
	return false
}

// gateAlways builds a utility that returns the same verdict for everything.
func gateAlways(verdict string) *fakeUtility {
	return &fakeUtility{reply: func(_, _ string) string { return verdict }}
}

func TestGateDropsIrrelevantChunks(t *testing.T) {
	// The whole point: a query whose answer is absent still produces a full
	// ranked list of least-bad chunks, and a model handed those will use them.
	s, slug := seeded(t, nil)
	r := NewRetriever(s, nil, gateAlways("irrelevant"), NewCache(0))

	res, err := r.Retrieve(context.Background(), "exponential backoff jitter", Options{Module: slug})
	if err != nil {
		t.Fatal(err)
	}
	if res.SourceFound {
		t.Error("SourceFound true after the gate rejected every candidate")
	}
	if len(res.Chunks) != 0 {
		t.Errorf("gate rejected everything but %d chunks came back", len(res.Chunks))
	}
	if !res.Graded {
		t.Error("Graded false although every verdict arrived — the gate did run")
	}
}

func TestGateKeepsRelevantChunks(t *testing.T) {
	s, slug := seeded(t, nil)
	r := NewRetriever(s, nil, gateAlways("relevant"), NewCache(0))

	res, err := r.Retrieve(context.Background(), "exponential backoff jitter", Options{Module: slug})
	if err != nil {
		t.Fatal(err)
	}
	if !res.SourceFound || len(res.Chunks) == 0 {
		t.Fatalf("gate approved everything but result is %+v", res)
	}
	if !res.Graded {
		t.Error("Graded false after a clean run")
	}
}

func TestGateGradesChildrenNotParents(t *testing.T) {
	// Grading the expanded parent puts its tail outside the grader's input
	// budget, and makes every candidate trigger a parent fetch whether or not
	// it survives.
	s, slug := seeded(t, nil)
	u := gateAlways("relevant")
	r := NewRetriever(s, nil, u, NewCache(0))

	if _, err := r.Retrieve(context.Background(), "backoff jitter", Options{Module: slug}); err != nil {
		t.Fatal(err)
	}

	c, _ := s.LoadCorpus(slug)
	childTexts := map[string]bool{}
	parentTexts := map[string]bool{}
	for _, ch := range c.Chunks {
		switch ch.Type {
		case Child:
			childTexts[ch.Text] = true
		case Parent:
			parentTexts[ch.Text] = true
		}
	}

	prompts := u.seen()
	if len(prompts) == 0 {
		t.Fatal("the gate made no calls")
	}
	for _, p := range prompts {
		body := p[strings.Index(p, "TEXT CHUNK:\n")+len("TEXT CHUNK:\n"):]
		if parentTexts[body] && !childTexts[body] {
			t.Errorf("the gate was handed a parent chunk:\n%.100s", body)
		}
		if !childTexts[body] {
			t.Errorf("the gate was handed text that is not a stored child:\n%.100s", body)
		}
	}
}

func TestGateOnlySurvivorsTriggerParentExpansion(t *testing.T) {
	// One survivor means one parent, not one parent per candidate.
	s, slug := seeded(t, nil)
	first := true
	var mu sync.Mutex
	u := &fakeUtility{reply: func(_, _ string) string {
		mu.Lock()
		defer mu.Unlock()
		if first {
			first = false
			return "relevant"
		}
		return "irrelevant"
	}}

	r := NewRetriever(s, nil, u, NewCache(0))
	res, err := r.Retrieve(context.Background(), "backoff jitter retry", Options{Module: slug, TopK: 5})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Chunks) != 1 {
		t.Errorf("one survivor expanded to %d chunks", len(res.Chunks))
	}
}

func TestGateFailureKeepsChunksButReportsUngraded(t *testing.T) {
	// A dead grader that silently approved everything is indistinguishable
	// from one that examined everything and approved it. Fail open on the
	// chunk, closed on the claim.
	s, slug := seeded(t, nil)
	u := &fakeUtility{failNext: 999}
	r := NewRetriever(s, nil, u, NewCache(0))

	res, err := r.Retrieve(context.Background(), "exponential backoff jitter", Options{Module: slug})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Chunks) == 0 {
		t.Error("a failed grader dropped the chunks instead of failing open")
	}
	if !res.SourceFound {
		t.Error("SourceFound false although chunks were kept")
	}
	if res.Graded {
		t.Error("Graded true although every grader call failed")
	}
}

func TestGatePartialFailureReportsUngraded(t *testing.T) {
	// One missing verdict is enough: keep is no longer a trustworthy signal.
	s, slug := seeded(t, nil)
	u := &fakeUtility{failNext: 1}
	r := NewRetriever(s, nil, u, NewCache(0))

	res, err := r.Retrieve(context.Background(), "exponential backoff jitter",
		Options{Module: slug, TopK: 5})
	if err != nil {
		t.Fatal(err)
	}
	if res.Graded {
		t.Error("Graded true although one verdict never arrived")
	}
	if len(res.Chunks) == 0 {
		t.Error("a partial grader failure dropped everything")
	}
}

func TestGateTreatsUnparseableVerdictsAsFailures(t *testing.T) {
	// Asked for one of two words, the model said something else. Reading a
	// verdict out of that is tea leaves; it is a failed call.
	s, slug := seeded(t, nil)
	r := NewRetriever(s, nil, gateAlways("Well, it depends on what you mean"), NewCache(0))

	res, err := r.Retrieve(context.Background(), "exponential backoff jitter", Options{Module: slug})
	if err != nil {
		t.Fatal(err)
	}
	if res.Graded {
		t.Error("an unparseable reply was accepted as a verdict")
	}
	if len(res.Chunks) == 0 {
		t.Error("an unparseable reply dropped the chunks instead of failing open")
	}
}

func TestGateAcceptsVerdictsWithTrailingText(t *testing.T) {
	// Models add punctuation and newlines despite instructions.
	s, slug := seeded(t, nil)
	r := NewRetriever(s, nil, gateAlways("relevant.\n"), NewCache(0))

	res, _ := r.Retrieve(context.Background(), "exponential backoff jitter", Options{Module: slug})
	if !res.Graded {
		t.Error("a verdict with trailing punctuation was treated as a failure")
	}
	if !res.SourceFound {
		t.Error("a 'relevant' verdict did not keep its chunk")
	}
}

func TestNoGradeSkipsTheGateAndSaysSo(t *testing.T) {
	// A caller that turns the gate off does not get to claim its context was
	// checked.
	s, slug := seeded(t, nil)
	u := gateAlways("irrelevant")
	r := NewRetriever(s, nil, u, NewCache(0))

	res, err := r.Retrieve(context.Background(), "exponential backoff jitter",
		Options{Module: slug, NoGrade: true})
	if err != nil {
		t.Fatal(err)
	}
	if u.count() != 0 {
		t.Errorf("the gate made %d calls with NoGrade set", u.count())
	}
	if res.Graded {
		t.Error("Graded true with the gate disabled")
	}
	if !res.SourceFound {
		t.Error("NoGrade dropped the chunks")
	}
}

func TestGateRunsOncePerCandidate(t *testing.T) {
	s, slug := seeded(t, nil)
	u := gateAlways("relevant")
	r := NewRetriever(s, nil, u, NewCache(0))

	res, err := r.Retrieve(context.Background(), "backoff jitter retry segments",
		Options{Module: slug, TopK: 4, NoGrade: false})
	if err != nil {
		t.Fatal(err)
	}
	if u.count() == 0 {
		t.Fatal("the gate never ran")
	}
	if u.count() > 4 {
		t.Errorf("the gate made %d calls for a top_k of 4", u.count())
	}
	_ = res
}

// --- query variants ---

func TestExpandQueryReturnsOriginalWithoutAModel(t *testing.T) {
	got := expandQuery(context.Background(), nil, newVariantCache(), "how do we avoid rate limits", 4)
	if len(got) != 1 || got[0] != "how do we avoid rate limits" {
		t.Errorf("expandQuery without a model = %v", got)
	}
}

func TestExpandQueryReturnsOriginalAtOneVariant(t *testing.T) {
	u := gateAlways("unused")
	got := expandQuery(context.Background(), u, newVariantCache(), "q", 1)
	if len(got) != 1 {
		t.Errorf("expandQuery(n=1) = %v", got)
	}
	if u.count() != 0 {
		t.Error("expansion called the model when no expansion was asked for")
	}
}

func TestExpandQueryKeepsTheOriginalFirst(t *testing.T) {
	u := &fakeUtility{reply: func(_, _ string) string {
		return "- backoff policy\n- retry ceiling\n2) throttling behaviour"
	}}
	got := expandQuery(context.Background(), u, newVariantCache(), "rate limits", 4)

	if got[0] != "rate limits" {
		t.Errorf("original phrasing is not first: %v", got)
	}
	if len(got) != 4 {
		t.Errorf("got %d phrasings, want 4: %v", len(got), got)
	}
	for _, v := range got[1:] {
		if strings.HasPrefix(v, "-") || strings.HasPrefix(v, "2)") {
			t.Errorf("list marker survived stripping: %q", v)
		}
	}
}

func TestExpandQueryRespectsTheCeiling(t *testing.T) {
	// Past four the variants paraphrase each other and fusion re-ranks the
	// same documents at four times the price.
	u := &fakeUtility{reply: func(_, _ string) string {
		return "one\ntwo\nthree\nfour\nfive\nsix\nseven"
	}}
	got := expandQuery(context.Background(), u, newVariantCache(), "q", 99)
	if len(got) > MaxVariants {
		t.Errorf("got %d phrasings, ceiling is %d", len(got), MaxVariants)
	}
}

func TestExpandQueryDropsDuplicates(t *testing.T) {
	u := &fakeUtility{reply: func(_, _ string) string {
		return "rate limits\nRATE LIMITS\nbackoff policy"
	}}
	got := expandQuery(context.Background(), u, newVariantCache(), "rate limits", 4)

	seen := map[string]bool{}
	for _, v := range got {
		k := strings.ToLower(v)
		if seen[k] {
			t.Errorf("duplicate phrasing %q in %v", v, got)
		}
		seen[k] = true
	}
}

func TestExpandQueryFailureDegradesToTheOriginal(t *testing.T) {
	u := &fakeUtility{failNext: 99}
	got := expandQuery(context.Background(), u, newVariantCache(), "rate limits", 4)
	if len(got) != 1 || got[0] != "rate limits" {
		t.Errorf("a failed expansion returned %v, want the original alone", got)
	}
}

func TestExpandQueryIsCached(t *testing.T) {
	// Determinism is what makes the cache worth having: without it the same
	// question yields different variants and every cache below misses.
	u := &fakeUtility{reply: func(_, _ string) string { return "alpha\nbravo\ncharlie" }}
	vc := newVariantCache()

	first := expandQuery(context.Background(), u, vc, "q", 4)
	second := expandQuery(context.Background(), u, vc, "q", 4)

	if u.count() != 1 {
		t.Errorf("expansion called %d times for the same query, want 1", u.count())
	}
	if strings.Join(first, "|") != strings.Join(second, "|") {
		t.Errorf("cached expansion differs:\n%v\n%v", first, second)
	}
}

func TestVariantsFeedEveryPhrasingIntoOneEmbeddingCall(t *testing.T) {
	// The phrasings are known up front, so N variants cost one request rather
	// than N.
	emb := &fakeEmbedder{}
	s, slug := seeded(t, emb)

	u := &fakeUtility{reply: func(system, _ string) string {
		if strings.Contains(system, "relevance grader") {
			return "relevant"
		}
		return "backoff policy\nretry ceiling\nthrottling"
	}}

	r := NewRetriever(s, emb, u, NewCache(0))
	before := emb.calls
	if _, err := r.Retrieve(context.Background(), "rate limits",
		Options{Module: slug, Variants: 4}); err != nil {
		t.Fatal(err)
	}
	if got := emb.calls - before; got != 1 {
		t.Errorf("four phrasings cost %d embedding calls, want 1", got)
	}
}

func TestVariantsChangeTheCacheEntry(t *testing.T) {
	// A fused multi-query result must not be served to a single-query call.
	s, slug := seeded(t, nil)
	u := &fakeUtility{reply: func(system, _ string) string {
		if strings.Contains(system, "relevance grader") {
			return "relevant"
		}
		return "alternative phrasing here"
	}}
	r := NewRetriever(s, nil, u, NewCache(time.Minute))

	if _, err := r.Retrieve(context.Background(), "backoff", Options{Module: slug, Variants: 1}); err != nil {
		t.Fatal(err)
	}
	before := u.count()
	if _, err := r.Retrieve(context.Background(), "backoff", Options{Module: slug, Variants: 3}); err != nil {
		t.Fatal(err)
	}
	if u.count() == before {
		t.Error("the 3-variant call was answered from the 1-variant cache entry")
	}
}
