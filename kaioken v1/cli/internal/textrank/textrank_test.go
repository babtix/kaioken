package textrank

import (
	"reflect"
	"testing"
)

func TestAnalyzeSplitsIdentifiers(t *testing.T) {
	got := Analyze("handleWikiSearch snake_case_name HTTPServer v2Client")
	want := []string{"wiki", "search", "snake", "case", "name", "http", "server", "client"}
	for _, w := range want {
		if !contains(got, w) {
			t.Errorf("Analyze() missing %q; got %v", w, got)
		}
	}
}

func TestAnalyzeDropsStopwordsAndSingleChars(t *testing.T) {
	got := Analyze("what is the a b retry")
	if contains(got, "the") || contains(got, "is") || contains(got, "what") {
		t.Errorf("stopwords survived: %v", got)
	}
	if contains(got, "a") || contains(got, "b") {
		t.Errorf("single characters survived: %v", got)
	}
	if !contains(got, "retry") {
		t.Errorf("dropped a meaningful term: %v", got)
	}
}

func TestScoreRewardsRarity(t *testing.T) {
	docs := [][]string{
		{"retry", "budget", "backoff"},
		{"retry", "policy"},
		{"retry", "ceiling"},
		{"segment", "compaction"},
	}
	lx := NewLexicon(docs)

	// "budget" appears in one document, "retry" in three. A document matching
	// the rare term must outscore one matching only the common term.
	rare := lx.Score([]string{"budget"}, docs[0])
	common := lx.Score([]string{"retry"}, docs[1])
	if rare <= common {
		t.Errorf("rare term scored %.4f, common term %.4f — idf is not biting", rare, common)
	}
}

func TestScoreIsZeroWithoutOverlap(t *testing.T) {
	docs := [][]string{{"retry", "budget"}, {"segment", "compaction"}}
	lx := NewLexicon(docs)
	if s := lx.Score([]string{"unrelated"}, docs[0]); s != 0 {
		t.Errorf("score = %.4f for a term absent from the collection, want 0", s)
	}
}

func TestPhraseBonusNeedsContiguity(t *testing.T) {
	if PhraseBonus("rate limit", "we apply a rate limit per key") == 0 {
		t.Error("contiguous phrase earned no bonus")
	}
	if PhraseBonus("rate limit", "we limit the rate per key") != 0 {
		t.Error("reordered words earned the contiguous-phrase bonus")
	}
	// Too short to be evidence of anything.
	if PhraseBonus("id", "the id field") != 0 {
		t.Error("a 2-character query earned a phrase bonus")
	}
}

func TestTopNSortsAndTruncates(t *testing.T) {
	got := TopN([]Ranked{{ID: 1, Score: 0.5}, {ID: 2, Score: 0.9}, {ID: 3, Score: 0.1}}, 2)
	want := []Ranked{{ID: 2, Score: 0.9}, {ID: 1, Score: 0.5}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("TopN() = %v, want %v", got, want)
	}
}

func TestTopNBreaksTiesOnID(t *testing.T) {
	got := TopN([]Ranked{{ID: 7, Score: 1}, {ID: 2, Score: 1}}, 2)
	if got[0].ID != 2 {
		t.Errorf("tie broke to ID %d, want 2 — ranking is not stable", got[0].ID)
	}
}

func TestRRFSingleListKeepsItsOwnScores(t *testing.T) {
	lex := []Ranked{{ID: 1, Score: 8.25}, {ID: 2, Score: 3.5}}
	got := RRF([][]Ranked{lex, nil}, 10)
	if len(got) != 2 || got[0].Score != 8.25 {
		t.Errorf("RRF() rewrote a lone ranking's scores: %v", got)
	}
}

func TestRRFRewardsAgreement(t *testing.T) {
	// Doc 5 is second in both lists; docs 1 and 9 lead one list each. Agreement
	// across rankings is the signal RRF exists to capture.
	a := []Ranked{{ID: 1, Score: 9}, {ID: 5, Score: 8}}
	b := []Ranked{{ID: 9, Score: 9}, {ID: 5, Score: 8}}
	got := RRF([][]Ranked{a, b}, 10)
	if len(got) == 0 || got[0].ID != 5 {
		t.Errorf("RRF() top = %v, want the document both lists ranked", got)
	}
}

func TestRRFAccumulatesAcrossManyLists(t *testing.T) {
	// The multi-query case: the same document surfacing under several
	// phrasings must beat one that surfaced first under a single phrasing.
	top := []Ranked{{ID: 1, Score: 9}}
	repeated := []Ranked{{ID: 4, Score: 1}}
	got := RRF([][]Ranked{top, repeated, repeated, repeated, repeated}, 10)
	if got[0].ID != 4 {
		t.Errorf("RRF() top = %d, want 4 — agreement across lists did not accumulate", got[0].ID)
	}
}

func TestRRFEmpty(t *testing.T) {
	if got := RRF([][]Ranked{nil, {}}, 5); got != nil {
		t.Errorf("RRF() of nothing = %v, want nil", got)
	}
}

func contains(hay []string, needle string) bool {
	for _, h := range hay {
		if h == needle {
			return true
		}
	}
	return false
}
