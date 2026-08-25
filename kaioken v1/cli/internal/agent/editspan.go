package agent

// Span location for edit_file.
//
// The exact matcher answers "are these bytes present". When the answer is no,
// the interesting question is why — and the reasons fall into a few shapes that
// each have a cheap, specific remedy:
//
//   - the model retyped the indentation           → line-trimmed matching
//   - it pasted a block dedented from its context → indentation-flexible
//   - it reproduced a long block with one line
//     slightly wrong in the middle                → block anchors + similarity
//
// Ported from opencode's replacer chain (packages/opencode/src/tool/edit.ts),
// which runs nine of these in order. These three carry most of the value; the
// rest either duplicate what normalizeForFuzzyMatch already does or trade more
// safety than they return.
//
// Every finder here locates a span in the *original* content, so a match can be
// applied by byte offset with every untouched byte preserved. That is what
// separates them from the NFKC/smart-quote path in editmatch.go, which matches
// in a rewritten copy of the file and has to overlay the result back line by
// line. Original-space matching needs no overlay and cannot disturb a line it
// did not target.

import (
	"strings"
)

// span is a half-open byte range in the original content.
type span struct{ index, length int }

// spanFinder is one location strategy. Returning more than one span means the
// old text was ambiguous under that strategy, which is an error rather than a
// reason to guess.
type spanFinder struct {
	name string
	find func(content, old string) []span
}

// spanFinders run in order, exact first. Each is strictly more permissive than
// the one before it, so the first to match is the most conservative reading of
// what the model meant.
var spanFinders = []spanFinder{
	{"exact", findExact},
	{"line-trimmed", findLineTrimmed},
	{"indentation-flexible", findIndentFlexible},
	{"block-anchor", findBlockAnchor},
}

// locateSpan finds old in content, returning the span and the name of the
// strategy that found it. ok is false when no strategy matched; ambiguous
// names the first strategy that found more than one candidate, which the
// caller reports rather than resolving.
func locateSpan(content, old string) (s span, strategy string, ambiguous int, ok bool) {
	for _, f := range spanFinders {
		found := f.find(content, old)
		switch {
		case len(found) == 0:
			continue
		case len(found) > 1:
			return span{}, f.name, len(found), false
		}
		// A permissive strategy that matched something far larger than what was
		// asked for has almost certainly anchored onto the wrong region.
		if f.name != "exact" && isDisproportionate(content[found[0].index:found[0].index+found[0].length], old) {
			continue
		}
		return found[0], f.name, 0, true
	}
	return span{}, "", 0, false
}

// isDisproportionate reports whether a matched span is so much larger than the
// text that was searched for that it is more likely a mis-anchor than a match.
// opencode's thresholds (edit.ts isDisproportionateMatch), and the reason its
// looser strategies are safe to run at all.
func isDisproportionate(matched, old string) bool {
	oldLines := strings.Count(old, "\n") + 1
	matchedLines := strings.Count(matched, "\n") + 1
	if matchedLines >= max(oldLines+3, oldLines*2) {
		return true
	}
	if oldLines == 1 {
		return false
	}
	m, o := len(strings.TrimSpace(matched)), len(strings.TrimSpace(old))
	return m > max(o+500, o*4)
}

func findExact(content, old string) []span {
	var out []span
	for i := 0; ; {
		j := strings.Index(content[i:], old)
		if j < 0 {
			return out
		}
		out = append(out, span{index: i + j, length: len(old)})
		i += j + 1
		if i >= len(content) {
			return out
		}
	}
}

// blockOf describes the old text as lines, with whether it ended on a newline —
// which decides if a match should swallow the trailing newline of its last line.
type blockOf struct {
	lines    []string
	trailing bool
}

func splitBlock(old string) blockOf {
	lines := strings.Split(old, "\n")
	if n := len(lines); n > 1 && lines[n-1] == "" {
		return blockOf{lines: lines[:n-1], trailing: true}
	}
	return blockOf{lines: lines}
}

// spanOfLines maps a run of content lines to a byte range, including the last
// line's newline only when the old text had one.
func spanOfLines(spans []lineSpan, content string, start, n int, trailing bool) span {
	from := spans[start].start
	to := spans[start+n-1].end
	if !trailing && to > from && strings.HasSuffix(content[from:to], "\n") {
		to--
	}
	return span{index: from, length: to - from}
}

// findLineTrimmed matches line-for-line ignoring leading and trailing
// whitespace on each line. This is the single highest-yield strategy: a model
// reproducing code it read almost always gets the text right and the
// indentation approximately right.
func findLineTrimmed(content, old string) []span {
	blk := splitBlock(old)
	if len(blk.lines) == 0 {
		return nil
	}
	spans := lineSpans(content)
	lines := make([]string, len(spans))
	for i, s := range spans {
		lines[i] = strings.TrimSpace(content[s.start:s.end])
	}
	want := make([]string, len(blk.lines))
	for i, l := range blk.lines {
		want[i] = strings.TrimSpace(l)
	}

	var out []span
	for i := 0; i+len(want) <= len(lines); i++ {
		match := true
		for j := range want {
			if lines[i+j] != want[j] {
				match = false
				break
			}
		}
		if match {
			out = append(out, spanOfLines(spans, content, i, len(want), blk.trailing))
		}
	}
	return out
}

// dedent removes the smallest indent shared by every non-blank line.
func dedent(lines []string) []string {
	min := -1
	for _, l := range lines {
		if strings.TrimSpace(l) == "" {
			continue
		}
		n := len(l) - len(strings.TrimLeft(l, " \t"))
		if min < 0 || n < min {
			min = n
		}
	}
	if min <= 0 {
		return lines
	}
	out := make([]string, len(lines))
	for i, l := range lines {
		if len(l) >= min {
			out[i] = l[min:]
		} else {
			out[i] = strings.TrimLeft(l, " \t")
		}
	}
	return out
}

// findIndentFlexible matches a block that is correct relative to itself but
// sits at a different indentation level than the file — a snippet pasted out of
// its nesting, or re-indented on the way through the model.
//
// It differs from line-trimmed in preserving *relative* indentation, so it will
// not match a block whose internal shape is wrong.
func findIndentFlexible(content, old string) []span {
	blk := splitBlock(old)
	if len(blk.lines) < 2 {
		return nil // a single line carries no relative indentation to preserve
	}
	spans := lineSpans(content)
	if len(spans) < len(blk.lines) {
		return nil
	}
	want := strings.Join(dedent(blk.lines), "\n")

	var out []span
	for i := 0; i+len(blk.lines) <= len(spans); i++ {
		block := make([]string, len(blk.lines))
		for j := range block {
			s := spans[i+j]
			block[j] = strings.TrimRight(content[s.start:s.end], "\n")
		}
		if strings.Join(dedent(block), "\n") == want {
			out = append(out, spanOfLines(spans, content, i, len(blk.lines), blk.trailing))
		}
	}
	return out
}

// similarityThreshold is how close a candidate block's interior must be to the
// old text before an anchored match is accepted. opencode's value.
const similarityThreshold = 0.65

// findBlockAnchor matches a multi-line block by its first and last lines,
// tolerating drift in between. This is the strategy for "the model reproduced a
// forty-line function and got one line in the middle subtly wrong": the
// boundaries are what it is most likely to have right, and the interior is
// scored rather than required.
//
// Candidates must be within 25% of the requested block size, and their interior
// must reach similarityThreshold by mean per-line Levenshtein similarity.
func findBlockAnchor(content, old string) []span {
	blk := splitBlock(old)
	if len(blk.lines) < 3 {
		return nil // nothing to anchor around
	}
	spans := lineSpans(content)
	lines := make([]string, len(spans))
	for i, s := range spans {
		lines[i] = strings.TrimSpace(content[s.start:s.end])
	}
	first := strings.TrimSpace(blk.lines[0])
	last := strings.TrimSpace(blk.lines[len(blk.lines)-1])
	size := len(blk.lines)
	maxDelta := max(1, size/4)

	type candidate struct{ start, end int }
	var candidates []candidate
	for i := range lines {
		if lines[i] != first {
			continue
		}
		for j := i + 2; j < len(lines); j++ {
			if lines[j] != last {
				continue
			}
			if abs(j-i+1-size) <= maxDelta {
				candidates = append(candidates, candidate{i, j})
			}
			break // only the nearest closing anchor counts
		}
	}
	if len(candidates) == 0 {
		return nil
	}

	best, bestScore := -1, -1.0
	for k, c := range candidates {
		score := interiorSimilarity(lines[c.start:c.end+1], blk.lines)
		if score > bestScore {
			best, bestScore = k, score
		}
	}
	if bestScore < similarityThreshold {
		return nil
	}
	// Two candidates scoring identically means the anchors are genuinely
	// ambiguous; report that rather than picking the first.
	for k, c := range candidates {
		if k == best {
			continue
		}
		if interiorSimilarity(lines[c.start:c.end+1], blk.lines) == bestScore {
			return []span{{}, {}} // len > 1 signals ambiguity to locateSpan
		}
	}
	c := candidates[best]
	return []span{spanOfLines(spans, content, c.start, c.end-c.start+1, blk.trailing)}
}

// interiorSimilarity scores the lines between the anchors, 0..1. Blocks with no
// interior score 1: their anchors are all there is to agree on.
func interiorSimilarity(got, want []string) float64 {
	n := min(len(got), len(want)) - 2
	if n <= 0 {
		return 1
	}
	total := 0.0
	for i := 1; i <= n; i++ {
		a, b := strings.TrimSpace(got[i]), strings.TrimSpace(want[i])
		maxLen := max(len(a), len(b))
		if maxLen == 0 {
			total += 1
			continue
		}
		total += 1 - float64(levenshtein(a, b))/float64(maxLen)
	}
	return total / float64(n)
}

// levenshtein is the standard two-row edit distance.
func levenshtein(a, b string) int {
	if a == b {
		return 0
	}
	if len(a) == 0 {
		return len([]rune(b))
	}
	if len(b) == 0 {
		return len([]rune(a))
	}
	ra, rb := []rune(a), []rune(b)
	prev := make([]int, len(rb)+1)
	cur := make([]int, len(rb)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(ra); i++ {
		cur[0] = i
		for j := 1; j <= len(rb); j++ {
			cost := 1
			if ra[i-1] == rb[j-1] {
				cost = 0
			}
			cur[j] = min(min(cur[j-1]+1, prev[j]+1), prev[j-1]+cost)
		}
		prev, cur = cur, prev
	}
	return prev[len(rb)]
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}
