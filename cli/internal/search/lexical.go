package search

import (
	"math"
	"sort"
	"strings"
	"unicode"
)

// BM25, the standard parameters. k1 controls how fast term frequency
// saturates, b how hard length normalisation bites.
const (
	bm25K1 = 1.2
	bm25B  = 0.75
)

// analyze turns text into match tokens. Beyond lowercasing and splitting on
// non-alphanumerics it also emits the parts of compound identifiers, so a
// query for "wiki search" hits a chunk that only ever writes
// `handleWikiSearch` — the single most common way a code-repo search misses.
// Case survives until after the identifier split, which is what makes the
// camelCase boundary visible; indexing and querying both come through here so
// the two sides always agree on what a token is.
func analyze(text string) []string {
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

// lexicon holds the collection statistics BM25 needs.
type lexicon struct {
	// df is document frequency per term, counted over chunks.
	df map[string]int
	// avgLen is the mean chunk length in tokens.
	avgLen float64
	// n is the chunk count.
	n int
}

func buildLexicon(chunks []Chunk) *lexicon {
	lx := &lexicon{df: map[string]int{}, n: len(chunks)}
	total := 0
	for i := range chunks {
		seen := map[string]struct{}{}
		for _, t := range chunks[i].tokens {
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

// score computes BM25 for one chunk against the query terms.
func (lx *lexicon) score(queryTerms []string, c *Chunk) float64 {
	if len(c.tokens) == 0 {
		return 0
	}
	tf := map[string]int{}
	for _, t := range c.tokens {
		tf[t]++
	}
	length := float64(len(c.tokens))

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

// phraseBonus rewards a chunk that contains the query as a contiguous string.
// BM25 is a bag of words and cannot tell "rate limit" from "limit rate"; for
// short technical queries that distinction is usually the whole point.
func phraseBonus(query string, c *Chunk) float64 {
	q := strings.ToLower(strings.TrimSpace(query))
	if len(q) < 4 {
		return 0
	}
	hay := strings.ToLower(c.Text + " " + c.Heading)
	if !strings.Contains(hay, q) {
		return 0
	}
	return 2.5
}

// ranked is one scored candidate during fusion.
type ranked struct {
	chunk int
	score float64
}

func topN(in []ranked, n int) []ranked {
	sort.Slice(in, func(i, j int) bool {
		if in[i].score != in[j].score {
			return in[i].score > in[j].score
		}
		return in[i].chunk < in[j].chunk
	})
	if len(in) > n {
		in = in[:n]
	}
	return in
}
