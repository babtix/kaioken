package prism

import (
	"kaioken/internal/retrieval"
)

// The parent/child chunking algorithm lives in internal/retrieval, shared
// across every chunk→rank→fuse stack. What follows are thin, package-local
// forwarders: they keep this package's existing unexported names, types and
// signatures intact — including the ones chunk_test.go exercises directly —
// while the actual splitting logic runs in retrieval.

// ChunkConfig tunes the two window sizes chunkParentChild uses. See
// retrieval.ChunkConfig for the field documentation.
type ChunkConfig struct {
	ParentTokens  int
	ChildTokens   int
	ChildOverlap  int
	CharsPerToken int
}

// DefaultChunkConfig is the tuning PRISM ships with.
func DefaultChunkConfig() ChunkConfig {
	return fromRetrievalConfig(retrieval.DefaultChunkConfig())
}

func (c ChunkConfig) withDefaults() ChunkConfig {
	return fromRetrievalConfig(toRetrievalConfig(c).WithDefaults())
}

func toRetrievalConfig(c ChunkConfig) retrieval.ChunkConfig {
	return retrieval.ChunkConfig{
		ParentTokens: c.ParentTokens, ChildTokens: c.ChildTokens,
		ChildOverlap: c.ChildOverlap, CharsPerToken: c.CharsPerToken,
	}
}

func fromRetrievalConfig(c retrieval.ChunkConfig) ChunkConfig {
	return ChunkConfig{
		ParentTokens: c.ParentTokens, ChildTokens: c.ChildTokens,
		ChildOverlap: c.ChildOverlap, CharsPerToken: c.CharsPerToken,
	}
}

// searchWindow mirrors retrieval.SearchWindow; chunk_test.go asserts a
// segment's size against it.
const searchWindow = retrieval.SearchWindow

// segment is one span of the source, kept with its offset so a caller can ask
// what heading encloses it.
type segment struct {
	start int
	text  string
}

func splitAtBoundary(runes []rune, targetChars int) []segment {
	rs := retrieval.SplitAtBoundary(runes, targetChars)
	out := make([]segment, len(rs))
	for i, s := range rs {
		out[i] = segment{start: s.Start, text: s.Text}
	}
	return out
}

// pair is one child with the parent it belongs to.
type pair struct {
	parentIdx   int
	parentText  string
	parentStart int
	childText   string
	childStart  int
}

// chunkParentChild splits text into parents, then each parent into
// overlapping children, returning every (parent, child) association in
// document order.
func chunkParentChild(text string, cfg ChunkConfig) []pair {
	rp := retrieval.ChunkParentChild(text, toRetrievalConfig(cfg))
	out := make([]pair, len(rp))
	for i, p := range rp {
		out[i] = pair{
			parentIdx: p.ParentIdx, parentText: p.ParentText, parentStart: p.ParentStart,
			childText: p.ChildText, childStart: p.ChildStart,
		}
	}
	return out
}

// headings indexes a document's markdown headings by rune offset, so a chunk
// can be told which section it came from.
type headings struct {
	inner  retrieval.Headings
	titles []string
}

func indexHeadings(runes []rune) headings {
	h := retrieval.IndexHeadings(runes)
	return headings{inner: h, titles: h.Titles()}
}

// at returns the nearest heading at or before offset, or "".
func (h headings) at(offset int) string { return h.inner.At(offset) }
