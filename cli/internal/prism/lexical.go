package prism

import (
	"strings"

	"kaioken/internal/embed"
	"kaioken/internal/textrank"
)

// Both retrieval legs search children and only children. Parents are never
// searched: a parent is four times the size of a child, so its embedding
// averages four topics into one point and its BM25 length normalisation
// punishes it for carrying context. Parents exist to be fetched once a child
// of theirs has won, not to compete.

// candidates is the searchable view of a corpus — its children, tokenised,
// with the collection statistics BM25 needs. Building it costs one pass over
// the module, so it is built once per corpus state and reused across the many
// retrievals a single decomposed question can issue.
type candidates struct {
	corpus *Corpus
	// rows are positions in corpus.Chunks, one per child. Every ranking in
	// this package is expressed in positions into rows, so the two legs fuse
	// without either needing to know about the other's scoring.
	rows   []int
	tokens [][]string
	lx     *textrank.Lexicon
}

func newCandidates(c *Corpus) *candidates {
	cd := &candidates{corpus: c}
	for i, ch := range c.Chunks {
		if ch.Type != Child || strings.TrimSpace(ch.Text) == "" {
			continue
		}
		cd.rows = append(cd.rows, i)
		cd.tokens = append(cd.tokens, textrank.Analyze(ch.Section+" "+ch.Text))
	}
	cd.lx = textrank.NewLexicon(cd.tokens)
	return cd
}

func (cd *candidates) len() int { return len(cd.rows) }

// chunk resolves a ranking position back to the stored chunk.
func (cd *candidates) chunk(i int) Chunk { return cd.corpus.Chunks[cd.rows[i]] }

// lexical ranks children by BM25 plus a contiguous-phrase bonus. It needs no
// model, no key and no network, which is why it is the leg that always runs.
func (cd *candidates) lexical(query string, k int) []textrank.Ranked {
	terms := textrank.Analyze(query)
	if len(terms) == 0 {
		return nil
	}
	out := make([]textrank.Ranked, 0, cd.len())
	for i := range cd.rows {
		ch := cd.chunk(i)
		s := cd.lx.Score(terms, cd.tokens[i]) + textrank.PhraseBonus(query, ch.Text+" "+ch.Section)
		if s > 0 {
			out = append(out, textrank.Ranked{ID: i, Score: s})
		}
	}
	return textrank.TopN(out, k)
}

// vector ranks children by cosine similarity against an already-normalised
// query vector.
//
// This is a linear scan, which is the right shape here: a module holds what
// one person imported, and an approximate index would add a build step, a
// tuning parameter and a recall cliff to save microseconds on a few thousand
// rows.
func (cd *candidates) vector(query []float32, k int) []textrank.Ranked {
	if len(query) == 0 || !cd.corpus.Semantic() {
		return nil
	}
	out := make([]textrank.Ranked, 0, cd.len())
	for i := range cd.rows {
		ch := cd.chunk(i)
		v, ok := cd.corpus.Vectors[ch.Vec]
		if !ok {
			continue
		}
		// Zero similarity is not evidence of anything, and admitting it would
		// let unrelated chunks into fusion purely by being present.
		if s := embed.Dot(query, v); s > 0 {
			out = append(out, textrank.Ranked{ID: i, Score: s})
		}
	}
	return textrank.TopN(out, k)
}

// recent returns the most recently stored children, in reverse ingest order.
//
// This is the last-resort fallback when both legs come back empty, and its
// results are chosen without reference to the query. Anything built on it must
// report SourceFound false: presenting query-independent, ungraded chunks as a
// source is the single most misleading thing this pipeline could do.
func (cd *candidates) recent(k int) []textrank.Ranked {
	out := make([]textrank.Ranked, 0, k)
	for i := len(cd.rows) - 1; i >= 0 && len(out) < k; i-- {
		out = append(out, textrank.Ranked{ID: i, Score: 0})
	}
	return out
}
