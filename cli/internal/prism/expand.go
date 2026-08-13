package prism

import (
	"fmt"

	"kaioken/internal/textrank"
)

// Parent expansion is the payoff of chunking twice. Retrieval matched a small,
// precise passage; generation gets the whole section that passage sits in, so
// the model reads an argument rather than a fragment that starts mid-sentence.

// expandToParents resolves each ranked child to its parent's text.
//
// Rank order is preserved exactly, because the caller trims from the tail to
// fit a context budget — anything that jumps the queue evicts a better-scoring
// passage. Parents shared by several children appear once, at the position of
// their highest-ranked child. A child whose parent is missing contributes its
// own text rather than nothing: a fragment beats a hole.
func expandToParents(cd *candidates, ranked []textrank.Ranked) []string {
	if len(ranked) == 0 {
		return nil
	}

	// Index parents by (document, index) once. The alternative — a lookup per
	// child — is the N+1 problem, and on a module of any size it dominates the
	// cost of the retrieval that produced the ranking.
	parents := make(map[string]string, len(cd.corpus.Chunks))
	for _, ch := range cd.corpus.Chunks {
		if ch.Type == Parent {
			parents[parentKey(ch.DocID, ch.Index)] = ch.Text
		}
	}

	out := make([]string, 0, len(ranked))
	seen := make(map[string]struct{}, len(ranked))

	for _, r := range ranked {
		ch := cd.chunk(r.ID)

		text := ""
		key := ""
		if ch.ParentIndex != NoParent {
			if p, ok := parents[parentKey(ch.DocID, ch.ParentIndex)]; ok && p != "" {
				text, key = p, "p:"+parentKey(ch.DocID, ch.ParentIndex)
			}
		}
		if text == "" {
			// Namespaced so a child's text can never collide with a parent
			// reference and silently suppress it.
			text, key = ch.Text, fmt.Sprintf("c:%s:%d", ch.DocID, ch.Index)
		}
		if text == "" {
			continue
		}
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, text)
	}
	return out
}

func parentKey(docID string, index int) string {
	return fmt.Sprintf("%s:%d", docID, index)
}

// defaultContextTokens is the budget BuildContext trims to. Roughly a third of
// a modest context window, leaving room for the question, the instructions and
// an answer.
const defaultContextTokens = 6000

// BuildContext joins retrieved chunks into one block, dropping whole chunks
// from the tail once the budget is spent. Whole chunks rather than a
// mid-passage cut: a truncated final paragraph reads as though the source
// itself trails off, and a model asked to be faithful to its context will
// faithfully reproduce the truncation.
func BuildContext(chunks []string, maxTokens int) string {
	const empty = "No additional context available."
	if len(chunks) == 0 {
		return empty
	}
	if maxTokens <= 0 {
		maxTokens = defaultContextTokens
	}

	var out []string
	total := 0
	for _, c := range chunks {
		// The same four-characters-per-token approximation used for chunk
		// sizing. It only has to be close: this is a guard rail, not a bill.
		tokens := len([]rune(c)) / 4
		if total+tokens > maxTokens {
			break
		}
		out = append(out, c)
		total += tokens
	}
	if len(out) == 0 {
		return empty
	}
	return joinWithRule(out)
}

func joinWithRule(chunks []string) string {
	out := chunks[0]
	for _, c := range chunks[1:] {
		out += "\n---\n" + c
	}
	return out
}
