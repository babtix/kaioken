package research

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Citations are the spine of a research report. A marker that resolves to a
// page somebody actually read is the whole difference between evidence and
// assertion, so the pipeline refuses to trust the model's formatting and
// rewrites the markers itself.
//
// This exists because the naive version failed in a way that was invisible: a
// model wrote its markers as 【20】 rather than [20], a substring check for
// "[20]" matched nothing, and the report fell back to listing every page that
// had been fetched — including the ones it had read and rejected. A reference
// list that contains sources the text never used is worse than a short one,
// because every entry in it reads as corroboration.

// citationRe matches a marker like [3], [3, 7] or [3;7]. Ids are capped at
// three digits so the pattern stays away from years and figures that appear in
// square brackets in prose: no run reaches source 2019.
var citationRe = regexp.MustCompile(`\[(\d{1,3}(?:\s*[,;]\s*\d{1,3})*)\]`)

// exoticBrackets are the marker forms models reach for instead of plain ASCII.
// Normalising them first means the rest of this file only has one shape to
// reason about.
var exoticBrackets = strings.NewReplacer(
	"【", "[", "】", "]",
	"〔", "[", "〕", "]",
	"［", "[", "］", "]",
	"〖", "[", "〗", "]",
)

// rewriteCitations makes a report's markers honest and its reference list
// dense. It normalises marker syntax, deletes ids that do not resolve to a
// source that was actually read, and renumbers what survives from 1 so the
// reader sees [1][2][3] rather than the discovery-order numbering of [3][15][20].
//
// It returns the rewritten body and the sources it cites, in citation order.
func rewriteCitations(md string, sources []Source) (string, []Source) {
	md = exoticBrackets.Replace(md)

	valid := make(map[int]Source, len(sources))
	for _, s := range sources {
		valid[s.N] = s
	}

	// First pass: which valid ids does the body actually use?
	used := map[int]bool{}
	forEachMarker(md, func(_, _ int, ids []int) {
		for _, id := range ids {
			if _, ok := valid[id]; ok {
				used[id] = true
			}
		}
	})

	if len(used) == 0 {
		// Nothing cited anything. The evidence still has to be listed or the
		// reader has no way to check the report at all, so the full read set
		// stands in — renumbered densely, since no marker depends on the old
		// numbers.
		return md, renumbered(sources, nil)
	}

	// Dense renumbering in ascending original order: the original numbers track
	// the order pages entered the corpus, so ascending order keeps the
	// reference list roughly in the order the research found things.
	old := make([]int, 0, len(used))
	for n := range used {
		old = append(old, n)
	}
	sort.Ints(old)

	remap := make(map[int]int, len(old))
	for i, n := range old {
		remap[n] = i + 1
	}

	var b strings.Builder
	last := 0
	forEachMarker(md, func(start, end int, ids []int) {
		b.WriteString(md[last:start])
		var kept []int
		for _, id := range ids {
			if n, ok := remap[id]; ok {
				kept = append(kept, n)
			}
		}
		// Adjacent markers rather than a comma list: every id then survives
		// independently if this text is ever re-processed.
		sort.Ints(kept)
		for _, n := range kept {
			b.WriteString("[" + strconv.Itoa(n) + "]")
		}
		last = end
	})
	b.WriteString(md[last:])

	return tidyMarkers(b.String()), renumbered(sources, remap)
}

// forEachMarker calls fn for every citation marker in md, with the ids it
// carries. A marker immediately followed by "(" is skipped: that is a Markdown
// link whose text happens to be a number, not a citation.
func forEachMarker(md string, fn func(start, end int, ids []int)) {
	for _, loc := range citationRe.FindAllStringSubmatchIndex(md, -1) {
		start, end := loc[0], loc[1]
		if end < len(md) && md[end] == '(' {
			continue
		}
		inner := md[loc[2]:loc[3]]
		var ids []int
		for _, part := range strings.FieldsFunc(inner, func(r rune) bool {
			return r == ',' || r == ';' || r == ' '
		}) {
			if n, err := strconv.Atoi(strings.TrimSpace(part)); err == nil {
				ids = append(ids, n)
			}
		}
		if len(ids) > 0 {
			fn(start, end, ids)
		}
	}
}

// tidyMarkers cleans up after markers were deleted: a dropped citation can
// leave a space before punctuation or a doubled space mid-sentence, and the
// reader should not be able to tell that anything was removed.
func tidyMarkers(md string) string {
	md = strings.ReplaceAll(md, " .", ".")
	md = strings.ReplaceAll(md, " ,", ",")
	md = strings.ReplaceAll(md, "  ", " ")
	return md
}

// renumbered applies remap to a source list, keeping only the sources it
// mentions. A nil remap means "keep everything, numbered densely".
func renumbered(sources []Source, remap map[int]int) []Source {
	out := make([]Source, 0, len(sources))
	for _, s := range sources {
		if remap == nil {
			s.N = len(out) + 1
			out = append(out, s)
			continue
		}
		if n, ok := remap[s.N]; ok {
			s.N = n
			out = append(out, s)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].N < out[j].N })
	return out
}
