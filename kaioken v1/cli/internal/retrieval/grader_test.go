package retrieval

import (
	"context"
	"strings"
	"testing"

	"kaioken/internal/textrank"
)

func gateAlways(verdict string) *fakeUtility {
	return &fakeUtility{reply: func(_, _ string) string { return verdict }}
}

func rankedIDs(n int) []textrank.Ranked {
	out := make([]textrank.Ranked, n)
	for i := range out {
		out[i] = textrank.Ranked{ID: i, Score: 1}
	}
	return out
}

func textForIndex(texts []string) func(int) string {
	return func(id int) string { return texts[id] }
}

func TestGradeWithoutAModelKeepsEverythingUngraded(t *testing.T) {
	texts := []string{"a", "b"}
	res := Grade(context.Background(), nil, textForIndex(texts), "q", rankedIDs(2))
	if res.Graded {
		t.Error("Graded true with no utility model configured")
	}
	if len(res.Keep) != 2 || !res.Keep[0] || !res.Keep[1] {
		t.Errorf("expected everything kept, got %+v", res)
	}
}

func TestGradeDropsIrrelevantChunks(t *testing.T) {
	texts := []string{"backoff policy text"}
	res := Grade(context.Background(), gateAlways("irrelevant"), textForIndex(texts), "q", rankedIDs(1))
	if !res.Graded {
		t.Error("Graded false although every verdict arrived")
	}
	if res.Keep[0] {
		t.Error("an irrelevant verdict should not be kept")
	}
}

func TestGradeKeepsRelevantChunks(t *testing.T) {
	texts := []string{"backoff policy text"}
	res := Grade(context.Background(), gateAlways("relevant"), textForIndex(texts), "q", rankedIDs(1))
	if !res.Graded || !res.Keep[0] {
		t.Errorf("expected a graded, kept result, got %+v", res)
	}
}

func TestGradeFailureKeepsChunkButReportsUngraded(t *testing.T) {
	texts := []string{"x"}
	u := &fakeUtility{failNext: 99}
	res := Grade(context.Background(), u, textForIndex(texts), "q", rankedIDs(1))
	if res.Graded {
		t.Error("Graded true although every grader call failed")
	}
	if !res.Keep[0] {
		t.Error("a failed grader should fail open on the chunk")
	}
}

func TestGradeUnparseableVerdictFailsOpen(t *testing.T) {
	texts := []string{"x"}
	res := Grade(context.Background(), gateAlways("well, it depends"), textForIndex(texts), "q", rankedIDs(1))
	if res.Graded {
		t.Error("an unparseable reply was accepted as a verdict")
	}
	if !res.Keep[0] {
		t.Error("an unparseable reply should keep the chunk")
	}
}

func TestGradeAcceptsVerdictsWithTrailingText(t *testing.T) {
	texts := []string{"x"}
	res := Grade(context.Background(), gateAlways("relevant.\n"), textForIndex(texts), "q", rankedIDs(1))
	if !res.Graded || !res.Keep[0] {
		t.Errorf("trailing punctuation should not break parsing, got %+v", res)
	}
}

func TestGradeEmptyInputIsGraded(t *testing.T) {
	res := Grade(context.Background(), gateAlways("relevant"), textForIndex(nil), "q", nil)
	if !res.Graded || len(res.Keep) != 0 {
		t.Errorf("empty input should be trivially graded, got %+v", res)
	}
}

func TestFilterRankedPreservesOrder(t *testing.T) {
	ranked := []textrank.Ranked{{ID: 1, Score: 3}, {ID: 2, Score: 2}, {ID: 3, Score: 1}}
	kept := FilterRanked(ranked, []bool{true, false, true})
	if len(kept) != 2 || kept[0].ID != 1 || kept[1].ID != 3 {
		t.Errorf("FilterRanked = %v", kept)
	}
}

func TestFilterRankedMismatchedLengthReturnsInput(t *testing.T) {
	ranked := []textrank.Ranked{{ID: 1}}
	kept := FilterRanked(ranked, []bool{true, false})
	if len(kept) != 1 {
		t.Errorf("mismatched keep length should return input unchanged, got %v", kept)
	}
}

func TestAllTrue(t *testing.T) {
	got := AllTrue(3)
	if len(got) != 3 {
		t.Fatalf("AllTrue(3) len = %d", len(got))
	}
	for i, v := range got {
		if !v {
			t.Errorf("AllTrue()[%d] = false", i)
		}
	}
}

func TestClip(t *testing.T) {
	if got := clip("hello", 100); got != "hello" {
		t.Errorf("clip should pass through short input, got %q", got)
	}
	if got := clip(strings.Repeat("x", 10), 3); got != "xxx" {
		t.Errorf("clip(10,3) = %q, want 3 chars", got)
	}
}
