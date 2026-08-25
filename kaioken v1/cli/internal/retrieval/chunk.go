// Package retrieval holds the retrieval-pipeline algorithms shared across
// Kaioken's chunk→rank→fuse stacks: parent/child chunking, RAG-Fusion query
// expansion, the corrective relevance gate, and BM25/vector candidate
// ranking. PRISM (cli/internal/prism) is the first and most complete of
// those stacks and owns this package's canonical behaviour — it was
// extracted from PRISM's implementation with no behaviour change, so PRISM
// keeps calling into it through thin package-local wrappers rather than
// exposing these types directly.
package retrieval

import (
	"strings"
)

// Chunking decouples retrieval granularity from generation context.
//
// A single chunk size cannot serve both. Big chunks embed poorly — one vector
// averaging two thousand words points at nothing in particular — while small
// chunks retrieve precisely but hand the model a fragment that starts
// mid-argument. So the document is split twice: into parents that are worth
// reading, and into children that are worth matching, with each child
// remembering the parent it came from.

// ChunkConfig tunes the two window sizes. Sizes are expressed in tokens and
// converted with CharsPerToken, because the windows are chosen against a
// model's context budget and that budget is denominated in tokens.
type ChunkConfig struct {
	// ParentTokens is the context window handed to the model.
	ParentTokens int
	// ChildTokens is the retrieval window that gets embedded.
	ChildTokens int
	// ChildOverlap keeps a sentence spanning two children findable from both.
	ChildOverlap int
	// CharsPerToken is the rough conversion. Four is the usual approximation
	// for English prose and it only has to be close: these are window sizes,
	// not a budget anything is charged against.
	CharsPerToken int
}

// DefaultChunkConfig is the tuning PRISM ships with: a ~600-token parent
// carries a full argument, a ~150-token child is small enough that its
// embedding means one thing.
func DefaultChunkConfig() ChunkConfig {
	return ChunkConfig{
		ParentTokens:  600,
		ChildTokens:   150,
		ChildOverlap:  20,
		CharsPerToken: 4,
	}
}

// WithDefaults repairs degenerate or zero-valued fields.
func (c ChunkConfig) WithDefaults() ChunkConfig {
	d := DefaultChunkConfig()
	if c.ParentTokens <= 0 {
		c.ParentTokens = d.ParentTokens
	}
	if c.ChildTokens <= 0 {
		c.ChildTokens = d.ChildTokens
	}
	if c.ChildOverlap < 0 {
		c.ChildOverlap = d.ChildOverlap
	}
	if c.CharsPerToken <= 0 {
		c.CharsPerToken = d.CharsPerToken
	}
	// A child larger than its parent has nothing to expand into.
	if c.ChildTokens > c.ParentTokens {
		c.ChildTokens = c.ParentTokens
	}
	// Overlap at or above the window size never advances the cursor.
	if c.ChildOverlap >= c.ChildTokens {
		c.ChildOverlap = c.ChildTokens / 2
	}
	return c
}

// SearchWindow is how far past the target size a split may look for a clean
// boundary. Generous enough to find the end of a long paragraph, tight enough
// that a document without any boundaries still splits near the target.
const SearchWindow = 200

// Segment is one span of the source, kept with its offset so a caller can ask
// what heading encloses it.
type Segment struct {
	Start int // rune offset into the source
	Text  string
}

// SplitAtBoundary cuts runes into spans of roughly targetChars, preferring a
// paragraph break and falling back to a sentence end. Splitting mid-sentence
// is what makes a retrieved passage read as broken, and a passage that reads
// as broken gets distrusted whether or not it is correct.
//
// Offsets are in runes rather than bytes throughout: the window sizes mean
// characters, and byte arithmetic would both cut multi-byte scripts into
// invalid fragments and size their chunks two to four times too small.
func SplitAtBoundary(runes []rune, targetChars int) []Segment {
	if targetChars <= 0 {
		targetChars = 1
	}
	if len(runes) <= targetChars {
		if s := strings.TrimSpace(string(runes)); s != "" {
			return []Segment{{Start: 0, Text: s}}
		}
		return nil
	}

	var out []Segment
	start := 0
	for start < len(runes) {
		end := start + targetChars
		if end < len(runes) {
			// A paragraph break is the best cut available: it is where the
			// author already decided one thought ended.
			half := start + targetChars/2
			if i := lastIndexRunes(runes, "\n\n", half, min(end+SearchWindow, len(runes))); i > start {
				end = i
			} else if i, sep := lastSentenceEnd(runes, half, min(end+SearchWindow/2, len(runes))); i > start {
				end = i + len(sep)
			}
		}
		if end > len(runes) {
			end = len(runes)
		}

		if s := strings.TrimSpace(string(runes[start:end])); s != "" {
			out = append(out, Segment{Start: start, Text: s})
		}
		// The guard matters: without it a degenerate boundary search that
		// returns the current position spins forever on one document.
		start = max(start+1, end)
	}
	return out
}

// sentenceEnds are tried in order. A period followed by a space or newline is
// the only reliable sentence boundary in plain text — "Dr. Smith" is the price
// of not shipping a sentence tokeniser, and it costs a slightly early cut, not
// a wrong one.
var sentenceEnds = []string{". ", ".\n", "? ", "! "}

// lastSentenceEnd returns the highest sentence boundary fully inside [from,to)
// and the separator that matched.
func lastSentenceEnd(runes []rune, from, to int) (int, string) {
	best, bestSep := -1, ""
	for _, sep := range sentenceEnds {
		if i := lastIndexRunes(runes, sep, from, to); i > best {
			best, bestSep = i, sep
		}
	}
	return best, bestSep
}

// lastIndexRunes finds the highest index at which sep occurs entirely within
// runes[from:to], or -1.
func lastIndexRunes(runes []rune, sep string, from, to int) int {
	s := []rune(sep)
	if len(s) == 0 || from < 0 {
		return -1
	}
	if to > len(runes) {
		to = len(runes)
	}
	for i := to - len(s); i >= from; i-- {
		match := true
		for j := range s {
			if runes[i+j] != s[j] {
				match = false
				break
			}
		}
		if match {
			return i
		}
	}
	return -1
}

// Pair is one child with the parent it belongs to.
type Pair struct {
	ParentIdx   int
	ParentText  string
	ParentStart int
	ChildText   string
	// ChildStart is the child's rune offset in the whole document, used to
	// attribute it to a heading.
	ChildStart int
}

// ChunkParentChild splits text into parents, then each parent into
// overlapping children, returning every (parent, child) association in
// document order.
func ChunkParentChild(text string, cfg ChunkConfig) []Pair {
	cfg = cfg.WithDefaults()
	parentChars := cfg.ParentTokens * cfg.CharsPerToken
	childChars := cfg.ChildTokens * cfg.CharsPerToken
	overlapChars := cfg.ChildOverlap * cfg.CharsPerToken

	runes := []rune(text)
	parents := SplitAtBoundary(runes, parentChars)

	var pairs []Pair
	for parentIdx, parent := range parents {
		pr := []rune(parent.Text)

		// A parent already small enough to embed well is its own child. The
		// alternative — an empty parent, or a child duplicating a fragment of
		// it — buys nothing and costs a wasted vector.
		if len(pr) <= childChars {
			pairs = append(pairs, Pair{
				ParentIdx:   parentIdx,
				ParentText:  parent.Text,
				ParentStart: parent.Start,
				ChildText:   parent.Text,
				ChildStart:  parent.Start,
			})
			continue
		}

		for cs := 0; cs < len(pr); {
			ce := cs + childChars
			if ce < len(pr) {
				if i, sep := lastSentenceEnd(pr, cs+childChars/2, min(ce+80, len(pr))); i > cs {
					ce = i + len(sep)
				}
			}
			if ce >= len(pr) {
				ce = len(pr)
			}
			if s := strings.TrimSpace(string(pr[cs:ce])); s != "" {
				pairs = append(pairs, Pair{
					ParentIdx:   parentIdx,
					ParentText:  parent.Text,
					ParentStart: parent.Start,
					ChildText:   s,
					ChildStart:  parent.Start + cs,
				})
			}
			// The tail is covered once a window reaches the end of the parent.
			//
			// Stepping back by the overlap here instead is what the reference
			// implementation does, and on the final window it steps back to
			// before the cursor — so the guard below advances by a single rune
			// and the loop emits one near-duplicate child per remaining
			// character. On a 2 400-rune parent that is eighty extra chunks,
			// each costing an embedding call and each crowding the real
			// passages out of fusion with copies of the same sentence.
			if ce == len(pr) {
				break
			}
			cs = max(cs+1, ce-overlapChars)
		}
	}
	return pairs
}

// Headings indexes a document's markdown headings by rune offset, so a chunk
// can be told which section it came from. Plain text yields none, which is
// handled everywhere as an empty section rather than as an error.
type Headings struct {
	offsets []int
	titles  []string
}

func IndexHeadings(runes []rune) Headings {
	var h Headings
	fenced := false

	for i := 0; i < len(runes); {
		line, next := lineAt(runes, i)
		switch {
		// A '#' inside a code fence is a comment, not a heading.
		case strings.HasPrefix(strings.TrimSpace(line), "```"):
			fenced = !fenced
		case !fenced && strings.HasPrefix(line, "#"):
			if title := strings.TrimSpace(strings.TrimLeft(line, "#")); title != "" {
				h.offsets = append(h.offsets, i)
				h.titles = append(h.titles, title)
			}
		}
		i = next
	}
	return h
}

// lineAt returns the line starting at i and the offset just past its newline.
func lineAt(runes []rune, i int) (string, int) {
	j := i
	for j < len(runes) && runes[j] != '\n' {
		j++
	}
	return string(runes[i:j]), j + 1
}

// At returns the nearest heading at or before offset, or "".
func (h Headings) At(offset int) string {
	best := ""
	for i, off := range h.offsets {
		if off > offset {
			break
		}
		best = h.titles[i]
	}
	return best
}

// Titles exposes the indexed heading titles in document order, for callers
// that need to know how many headings were found without the offset.
func (h Headings) Titles() []string { return h.titles }
