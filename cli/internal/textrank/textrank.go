// Package textrank holds the lexical half of retrieval: the tokeniser that
// both indexing and querying come through, BM25 over those tokens, and the
// rank fusion that combines a lexical ranking with any other one.
//
// It is shared rather than duplicated on purpose. Two retrievers live in this
// repository — internal/search over generated knowledge, internal/prism over
// imported documents — and a second copy of the tokeniser would drift from the
// first, which shows up as a query matching in one surface and not the other
// for reasons nobody can reconstruct.
package textrank

import (
	"math"
	"sort"
	"strings"
	"unicode"
)

// BM25, the standard parameters. K1 controls how fast term frequency
// saturates, B how hard length normalisation bites.
const (
	bm25K1 = 1.2
	bm25B  = 0.75
)

// Analyze turns text into match tokens. Beyond lowercasing and splitting on
// non-alphanumerics it also emits the parts of compound identifiers, so a
// query for "wiki search" hits a passage that only ever writes
// `handleWikiSearch` — the single most common way a code-repo search misses.
// Case survives until after the identifier split, which is what makes the
// camelCase boundary visible; indexing and querying both come through here so
// the two sides always agree on what a token is.
func Analyze(text string) []string {
	var out []string
	var word strings.Builder

	emit := func() {
		if word.Len() == 0 {
			return
		}
		w := word.String()
		word.Reset()
		lower := strings.ToLower(w)
		if len(lower) >= 2 && !isStopword(lower) {
			out = append(out, lower)
		}
		for _, part := range splitIdentifier(w) {
			if part != lower && len(part) >= 2 && !isStopword(part) {
				out = append(out, part)
			}
		}
	}

	for _, r := range text {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			word.WriteRune(r)
		} else {
			emit()
		}
	}
	emit()
	return out
}

// splitIdentifier breaks camelCase, PascalCase and digit boundaries. Callers
// have already flattened separators, so snake_case and kebab-case arrive as
// separate words and need no handling here. A word with no internal boundary
// returns nil rather than a one-element slice, so callers can skip it.
func splitIdentifier(w string) []string {
	var parts []string
	var cur strings.Builder
	runes := []rune(w)
	for i, r := range runes {
		if i > 0 {
			prev := runes[i-1]
			// camelCase / digit boundaries, plus the acronym case: in
			// "HTTPServer" the break belongs before the S, not after it, so a
			// lowercase letter following two uppercase ones splits backwards.
			boundary := (unicode.IsUpper(r) && !unicode.IsUpper(prev)) ||
				(unicode.IsDigit(r) != unicode.IsDigit(prev))
			acronymEnd := unicode.IsLower(r) && unicode.IsUpper(prev) &&
				i >= 2 && unicode.IsUpper(runes[i-2])
			switch {
			case acronymEnd && cur.Len() > 1:
				// Everything but the last rune is the acronym; the last rune
				// starts the following word.
				s := cur.String()
				parts = append(parts, strings.ToLower(s[:len(s)-1]))
				cur.Reset()
				cur.WriteRune(prev)
			case boundary && cur.Len() > 0:
				parts = append(parts, strings.ToLower(cur.String()))
				cur.Reset()
			}
		}
		cur.WriteRune(r)
	}
	if cur.Len() > 0 {
		parts = append(parts, strings.ToLower(cur.String()))
	}
	if len(parts) < 2 {
		return nil
	}
	return parts
}

// stopwords are dropped from both sides. Deliberately short: an aggressive
// list hurts technical queries, where words like "get" and "set" carry meaning.
var stopwords = map[string]struct{}{}

func init() {
	for _, w := range strings.Fields(`a an and are as at be but by for from
		how if in into is it its of on or that the their then there these this
		to was were what when where which who will with you your`) {
		stopwords[w] = struct{}{}
	}
}

func isStopword(w string) bool {
	_, ok := stopwords[w]
	return ok
}

// Lexicon holds the collection statistics BM25 needs.
type Lexicon struct {
	// df is document frequency per term, counted over documents.
	df map[string]int
	// avgLen is the mean document length in tokens.
	avgLen float64
	// n is the document count.
	n int
}

// NewLexicon builds the collection statistics from every document's tokens.
// Documents are identified by position, so the caller keeps whatever record
// type it likes and passes only the analysed form.
func NewLexicon(docs [][]string) *Lexicon {
	lx := &Lexicon{df: map[string]int{}, n: len(docs)}
	total := 0
	for _, tokens := range docs {
		seen := map[string]struct{}{}
		for _, t := range tokens {
			total++
			if _, dup := seen[t]; dup {
				continue
			}
			seen[t] = struct{}{}
			lx.df[t]++
		}
	}
	if lx.n > 0 {
		lx.avgLen = float64(total) / float64(lx.n)
	}
	if lx.avgLen == 0 {
		lx.avgLen = 1
	}
	return lx
}

// Score computes BM25 for one document against the query terms. Both sides
// must have come through Analyze.
func (lx *Lexicon) Score(queryTerms, docTokens []string) float64 {
	if len(docTokens) == 0 {
		return 0
	}
	tf := map[string]int{}
	for _, t := range docTokens {
		tf[t]++
	}
	length := float64(len(docTokens))

	var sum float64
	for _, q := range queryTerms {
		f := float64(tf[q])
		if f == 0 {
			continue
		}
		df := float64(lx.df[q])
		if df == 0 {
			continue
		}
		idf := math.Log(1 + (float64(lx.n)-df+0.5)/(df+0.5))
		sum += idf * (f * (bm25K1 + 1)) /
			(f + bm25K1*(1-bm25B+bm25B*length/lx.avgLen))
	}
	return sum
}

// PhraseWeight is what a contiguous match adds. Sized to outrank a typical
// bag-of-words score difference without swamping it entirely.
const PhraseWeight = 2.5

// PhraseBonus rewards a document that contains the query as a contiguous
// string. BM25 is a bag of words and cannot tell "rate limit" from "limit
// rate"; for short technical queries that distinction is usually the whole
// point.
func PhraseBonus(query, haystack string) float64 {
	q := strings.ToLower(strings.TrimSpace(query))
	if len(q) < 4 {
		return 0
	}
	if !strings.Contains(strings.ToLower(haystack), q) {
		return 0
	}
	return PhraseWeight
}

// Ranked is one scored candidate. ID indexes back into whatever collection the
// caller ranked.
type Ranked struct {
	ID    int
	Score float64
}

// TopN sorts descending and truncates. Ties break on ID so a ranking is stable
// across runs, which matters for both tests and caching.
func TopN(in []Ranked, n int) []Ranked {
	sort.Slice(in, func(i, j int) bool {
		if in[i].Score != in[j].Score {
			return in[i].Score > in[j].Score
		}
		return in[i].ID < in[j].ID
	})
	if n > 0 && len(in) > n {
		in = in[:n]
	}
	return in
}

// RRFK damps the contribution of low ranks in reciprocal-rank fusion. 60 is
// the value from the original paper and behaves well without tuning — which
// matters here because the input rankings produce scores on incomparable
// scales and normalising them would need calibration data nobody has.
const RRFK = 60.0

// RRF fuses any number of ranked lists: score = Σ 1/(k + rank) over every list
// a candidate appears in. Taking N lists rather than two is what lets a
// multi-query retriever feed 2N rankings — one lexical and one semantic per
// query phrasing — through the same code path, so a document that surfaces
// under several phrasings accumulates score from each.
//
// A single non-empty list passes through with its own scores intact rather
// than being rewritten as reciprocal ranks: there is nothing to fuse it with,
// and callers display that score.
func RRF(lists [][]Ranked, limit int) []Ranked {
	var present [][]Ranked
	for _, l := range lists {
		if len(l) > 0 {
			present = append(present, l)
		}
	}
	switch len(present) {
	case 0:
		return nil
	case 1:
		return TopN(append([]Ranked(nil), present[0]...), limit)
	}

	combined := map[int]float64{}
	for _, l := range present {
		for rank, r := range l {
			combined[r.ID] += 1 / (RRFK + float64(rank+1))
		}
	}
	out := make([]Ranked, 0, len(combined))
	for id, score := range combined {
		out = append(out, Ranked{ID: id, Score: score})
	}
	return TopN(out, limit)
}
