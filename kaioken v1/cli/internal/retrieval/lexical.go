package retrieval

import (
	"kaioken/internal/embed"
	"kaioken/internal/textrank"
)

// Both retrieval legs search children and only children. Parents are never
// searched: a parent is four times the size of a child, so its embedding
// averages four topics into one point and its BM25 length normalisation
// punishes it for carrying context. Parents exist to be fetched once a child
// of theirs has won, not to compete.

// Row is one searchable unit — a corpus's child chunk in retrieval-neutral
// form: enough to rank it lexically and, when embedded, semantically. The
// corpus's own storage shape (how a chunk is persisted, how its vector is
// looked up) stays with the caller; Row is only what ranking needs.
type Row struct {
	Text    string
	Section string
	// Vector is the row's embedding, or nil when it has none — a corpus
	// without an embedder, or a chunk whose vector went missing.
	Vector []float32
}

// Candidates is the searchable view of a set of rows: tokenised for BM25,
// with each row's vector (if any) available for cosine ranking. Building it
// costs one pass over the rows, so a caller builds it once per corpus state
// and reuses it across every retrieval that state answers.
type Candidates struct {
	rows   []Row
	tokens [][]string
	lx     *textrank.Lexicon
}

func NewCandidates(rows []Row) *Candidates {
	c := &Candidates{rows: rows}
	for _, r := range rows {
		c.tokens = append(c.tokens, textrank.Analyze(r.Section+" "+r.Text))
	}
	c.lx = textrank.NewLexicon(c.tokens)
	return c
}

func (c *Candidates) Len() int { return len(c.rows) }

// Lexical ranks rows by BM25 plus a contiguous-phrase bonus. It needs no
// model, no key and no network, which is why it is the leg that always runs.
func (c *Candidates) Lexical(query string, k int) []textrank.Ranked {
	terms := textrank.Analyze(query)
	if len(terms) == 0 {
		return nil
	}
	out := make([]textrank.Ranked, 0, c.Len())
	for i, r := range c.rows {
		s := c.lx.Score(terms, c.tokens[i]) + textrank.PhraseBonus(query, r.Text+" "+r.Section)
		if s > 0 {
			out = append(out, textrank.Ranked{ID: i, Score: s})
		}
	}
	return textrank.TopN(out, k)
}

// Vector ranks rows by cosine similarity against an already-normalised query
// vector. Rows with no vector of their own are skipped.
//
// This is a linear scan, which is the right shape here: a module holds what
// one person imported, and an approximate index would add a build step, a
// tuning parameter and a recall cliff to save microseconds on a few thousand
// rows.
func (c *Candidates) Vector(query []float32, k int) []textrank.Ranked {
	if len(query) == 0 {
		return nil
	}
	out := make([]textrank.Ranked, 0, c.Len())
	for i, r := range c.rows {
		if r.Vector == nil {
			continue
		}
		// Zero similarity is not evidence of anything, and admitting it would
		// let unrelated chunks into fusion purely by being present.
		if s := embed.Dot(query, r.Vector); s > 0 {
			out = append(out, textrank.Ranked{ID: i, Score: s})
		}
	}
	return textrank.TopN(out, k)
}

// Recent returns the most recently added rows, in reverse order.
//
// This is the last-resort fallback when both legs come back empty, and its
// results are chosen without reference to the query. Anything built on it must
// report the source as not found: presenting query-independent, ungraded rows
// as a source is the single most misleading thing this pipeline could do.
func (c *Candidates) Recent(k int) []textrank.Ranked {
	out := make([]textrank.Ranked, 0, k)
	for i := len(c.rows) - 1; i >= 0 && len(out) < k; i-- {
		out = append(out, textrank.Ranked{ID: i, Score: 0})
	}
	return out
}
