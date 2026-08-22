package prism

import (
	"strings"

	"kaioken/internal/retrieval"
	"kaioken/internal/textrank"
)

// Both retrieval legs search children and only children. Parents are never
// searched: a parent is four times the size of a child, so its embedding
// averages four topics into one point and its BM25 length normalisation
// punishes it for carrying context. Parents exist to be fetched once a child
// of theirs has won, not to compete.
//
// The ranking algorithms themselves (BM25, cosine, the recency fallback) live
// in internal/retrieval as retrieval.Candidates; what stays here is the
// corpus-specific bookkeeping — mapping a ranking position back to this
// module's stored Chunk, which the relevance gate and parent expansion need
// and retrieval has no reason to know about.

// candidates is the searchable view of a corpus — its children, tokenised,
// with the collection statistics BM25 needs. Building it costs one pass over
// the module, so it is built once per corpus state and reused across the many
// retrievals a single decomposed question can issue.
type candidates struct {
	corpus *Corpus
	// rows are positions in corpus.Chunks, one per child, indexed the same
	// way as the wrapped retrieval.Candidates — position i here is row i
	// there.
	rows []int
	rc   *retrieval.Candidates
}

func newCandidates(c *Corpus) *candidates {
	cd := &candidates{corpus: c}
	var rows []retrieval.Row
	for i, ch := range c.Chunks {
		if ch.Type != Child || strings.TrimSpace(ch.Text) == "" {
			continue
		}
		cd.rows = append(cd.rows, i)
		rows = append(rows, retrieval.Row{
			Text: ch.Text, Section: ch.Section, Vector: c.Vectors[ch.Vec],
		})
	}
	cd.rc = retrieval.NewCandidates(rows)
	return cd
}

func (cd *candidates) len() int { return cd.rc.Len() }

// chunk resolves a ranking position back to the stored chunk.
func (cd *candidates) chunk(i int) Chunk { return cd.corpus.Chunks[cd.rows[i]] }

// lexical ranks children by BM25 plus a contiguous-phrase bonus.
func (cd *candidates) lexical(query string, k int) []textrank.Ranked {
	return cd.rc.Lexical(query, k)
}

// vector ranks children by cosine similarity against an already-normalised
// query vector.
func (cd *candidates) vector(query []float32, k int) []textrank.Ranked {
	if !cd.corpus.Semantic() {
		return nil
	}
	return cd.rc.Vector(query, k)
}

// recent returns the most recently stored children, in reverse ingest order.
func (cd *candidates) recent(k int) []textrank.Ranked {
	return cd.rc.Recent(k)
}
