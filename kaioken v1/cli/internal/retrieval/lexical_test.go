package retrieval

import "testing"

func TestCandidatesLexicalRanksByRelevance(t *testing.T) {
	c := NewCandidates([]Row{
		{Text: "exponential backoff and jitter for retries", Section: "Retry Policy"},
		{Text: "segments seal and compact on disk", Section: "Storage Layout"},
	})

	ranked := c.Lexical("backoff jitter", 5)
	if len(ranked) == 0 {
		t.Fatal("no lexical matches")
	}
	if ranked[0].ID != 0 {
		t.Errorf("top match ID = %d, want 0 (the backoff row)", ranked[0].ID)
	}
}

func TestCandidatesLexicalEmptyQuery(t *testing.T) {
	c := NewCandidates([]Row{{Text: "alpha", Section: ""}})
	if got := c.Lexical("", 5); got != nil {
		t.Errorf("empty query should return nothing, got %v", got)
	}
}

func TestCandidatesVectorSkipsRowsWithNoVector(t *testing.T) {
	c := NewCandidates([]Row{
		{Text: "alpha", Vector: []float32{1, 0}},
		{Text: "beta", Vector: nil},
	})
	ranked := c.Vector([]float32{1, 0}, 5)
	if len(ranked) != 1 || ranked[0].ID != 0 {
		t.Errorf("expected only the vectored row ranked, got %v", ranked)
	}
}

func TestCandidatesVectorEmptyQuery(t *testing.T) {
	c := NewCandidates([]Row{{Text: "alpha", Vector: []float32{1, 0}}})
	if got := c.Vector(nil, 5); got != nil {
		t.Errorf("empty query vector should return nothing, got %v", got)
	}
}

func TestCandidatesRecentReturnsReverseOrder(t *testing.T) {
	c := NewCandidates([]Row{{Text: "a"}, {Text: "b"}, {Text: "c"}})
	ranked := c.Recent(2)
	if len(ranked) != 2 || ranked[0].ID != 2 || ranked[1].ID != 1 {
		t.Errorf("Recent(2) = %v, want [2, 1]", ranked)
	}
}

func TestCandidatesLen(t *testing.T) {
	c := NewCandidates([]Row{{Text: "a"}, {Text: "b"}})
	if c.Len() != 2 {
		t.Errorf("Len() = %d, want 2", c.Len())
	}
}
