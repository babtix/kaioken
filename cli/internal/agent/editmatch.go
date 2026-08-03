package agent

// Edit matching for edit_file.
//
// The single most common failure of an exact-match editor is not a wrong
// edit — it is a right edit that misses, because the model reproduced the
// file with straight quotes where the file has smart ones, or dropped the
// trailing spaces an editor left behind, or normalized an en-dash. Ported
// from pi's edit-diff strategy: try the exact match first, and only when it
// misses, retry in a conservatively normalized space (NFKC, per-line
// trailing-whitespace trim, smart quotes/dashes/spaces to ASCII). When the
// fuzzy path is taken, only the lines an edit actually touches are rewritten
// from the normalized text; every untouched line keeps its original bytes.

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// Edit is one old→new replacement in an edit_file batch. All edits in a batch
// are matched against the same original content, then applied together.
type Edit struct {
	Old string
	New string
}

// stripBOM splits a leading UTF-8 BOM off the content. The model never sees
// the BOM in read_file output, so it will never include it in old text.
func stripBOM(content string) (bom, text string) {
	if strings.HasPrefix(content, "\uFEFF") {
		return "\uFEFF", content[len("\uFEFF"):]
	}
	return "", content
}

// detectLineEnding reports the file's dominant line ending based on which
// style appears first.
func detectLineEnding(content string) string {
	crlf := strings.Index(content, "\r\n")
	lf := strings.Index(content, "\n")
	if lf == -1 || crlf == -1 {
		return "\n"
	}
	if crlf < lf {
		return "\r\n"
	}
	return "\n"
}

// normalizeToLF converts CRLF and bare CR line endings to LF.
func normalizeToLF(text string) string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	return strings.ReplaceAll(text, "\r", "\n")
}

// restoreLineEndings converts LF back to the detected original ending.
func restoreLineEndings(text, ending string) string {
	if ending == "\r\n" {
		return strings.ReplaceAll(text, "\n", "\r\n")
	}
	return text
}

// fuzzyReplacer maps the Unicode characters models most often "correct" to
// their ASCII equivalents: smart quotes, the dash family, and special spaces.
var fuzzyReplacer = strings.NewReplacer(
	// Smart single quotes → '
	"\u2018", "'", "\u2019", "'", "\u201A", "'", "\u201B", "'",
	// Smart double quotes → "
	"\u201C", `"`, "\u201D", `"`, "\u201E", `"`, "\u201F", `"`,
	// Hyphen/dash family → - (U+2010..U+2015, U+2212 minus)
	"\u2010", "-", "\u2011", "-", "\u2012", "-", "\u2013", "-",
	"\u2014", "-", "\u2015", "-", "\u2212", "-",
	// Special spaces → regular space (NBSP, en/em/etc., narrow NBSP,
	// medium math space, ideographic space)
	"\u00A0", " ", "\u2002", " ", "\u2003", " ", "\u2004", " ",
	"\u2005", " ", "\u2006", " ", "\u2007", " ", "\u2008", " ",
	"\u2009", " ", "\u200A", " ", "\u202F", " ", "\u205F", " ",
	"\u3000", " ",
)

// normalizeForFuzzyMatch produces the normalized space used for the fallback
// match: NFKC, trailing whitespace stripped per line, then the character
// substitutions above. It never adds or removes lines, which is what lets the
// fuzzy result be overlaid back onto the original line by line.
func normalizeForFuzzyMatch(text string) string {
	text = norm.NFKC.String(text)
	lines := strings.Split(text, "\n")
	for i, l := range lines {
		lines[i] = strings.TrimRightFunc(l, unicode.IsSpace)
	}
	return fuzzyReplacer.Replace(strings.Join(lines, "\n"))
}

// fuzzyMatch is the outcome of locating one edit's old text.
type fuzzyMatch struct {
	found     bool
	index     int  // byte offset in the space the match was found in
	length    int  // byte length of the matched text in that space
	usedFuzzy bool // true when the match only exists in normalized space
}

// fuzzyFindText locates old inside content: exact first, normalized second.
// When usedFuzzy is true the offsets refer to normalizeForFuzzyMatch(content),
// not to content itself.
func fuzzyFindText(content, old string) fuzzyMatch {
	if i := strings.Index(content, old); i != -1 {
		return fuzzyMatch{found: true, index: i, length: len(old)}
	}
	fc := normalizeForFuzzyMatch(content)
	fo := normalizeForFuzzyMatch(old)
	if i := strings.Index(fc, fo); i != -1 {
		return fuzzyMatch{found: true, index: i, length: len(fo), usedFuzzy: true}
	}
	return fuzzyMatch{}
}

// countOccurrences counts matches in normalized space, which is where
// uniqueness must hold for the replacement to be unambiguous.
func countOccurrences(content, old string) int {
	return strings.Count(normalizeForFuzzyMatch(content), normalizeForFuzzyMatch(old))
}

// matchedEdit is an edit bound to its resolved position in the replacement
// base (original content, or normalized content when any edit went fuzzy).
type matchedEdit struct {
	editIndex int
	index     int
	length    int
	newText   string
}

// applyReplacements applies position-bound replacements to content. offset
// shifts the stored match indices when content is a slice of a larger string.
// Replacements must be sorted ascending; applying in reverse keeps offsets
// stable.
func applyReplacements(content string, reps []matchedEdit, offset int) string {
	result := content
	for i := len(reps) - 1; i >= 0; i-- {
		r := reps[i]
		start := r.index - offset
		result = result[:start] + r.newText + result[start+r.length:]
	}
	return result
}

// lineSpan is a half-open byte range [start, end) of one line (including its
// newline) inside a string.
type lineSpan struct {
	start, end int
}

// splitLinesWithEndings splits content into lines, each keeping its trailing
// newline (the final line may lack one).
func splitLinesWithEndings(content string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(content); i++ {
		if content[i] == '\n' {
			lines = append(lines, content[start:i+1])
			start = i + 1
		}
	}
	if start < len(content) {
		lines = append(lines, content[start:])
	}
	return lines
}

func lineSpans(content string) []lineSpan {
	offset := 0
	raw := splitLinesWithEndings(content)
	spans := make([]lineSpan, len(raw))
	for i, l := range raw {
		spans[i] = lineSpan{start: offset, end: offset + len(l)}
		offset += len(l)
	}
	return spans
}

// replacementLineRange widens a replacement to the whole lines it touches,
// returning [startLine, endLine) indices into spans.
func replacementLineRange(spans []lineSpan, r matchedEdit) (int, int, error) {
	repStart, repEnd := r.index, r.index+r.length
	startLine := -1
	for i, s := range spans {
		if repStart >= s.start && repStart < s.end {
			startLine = i
			break
		}
	}
	if startLine == -1 {
		return 0, 0, fmt.Errorf("replacement range is outside the base content")
	}
	endLine := startLine
	for endLine < len(spans) && spans[endLine].end < repEnd {
		endLine++
	}
	if endLine >= len(spans) {
		return 0, 0, fmt.Errorf("replacement range is outside the base content")
	}
	return startLine, endLine + 1, nil
}

// applyPreservingUnchangedLines applies replacements that were matched
// against baseContent (the normalized view) while copying every untouched
// line byte-for-byte from originalContent. Both views must have the same line
// count — normalization never adds or removes lines.
func applyPreservingUnchangedLines(originalContent, baseContent string, reps []matchedEdit) (string, error) {
	originalLines := splitLinesWithEndings(originalContent)
	baseLines := lineSpans(baseContent)
	if len(originalLines) != len(baseLines) {
		return "", fmt.Errorf("cannot preserve unchanged lines: the normalized content has a different line count")
	}

	type group struct {
		startLine, endLine int
		reps               []matchedEdit
	}
	sorted := make([]matchedEdit, len(reps))
	copy(sorted, reps)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].index < sorted[j].index })

	var groups []group
	for _, r := range sorted {
		startLine, endLine, err := replacementLineRange(baseLines, r)
		if err != nil {
			return "", err
		}
		if n := len(groups); n > 0 && startLine < groups[n-1].endLine {
			if endLine > groups[n-1].endLine {
				groups[n-1].endLine = endLine
			}
			groups[n-1].reps = append(groups[n-1].reps, r)
			continue
		}
		groups = append(groups, group{startLine: startLine, endLine: endLine, reps: []matchedEdit{r}})
	}

	var b strings.Builder
	lineIdx := 0
	for _, g := range groups {
		for _, l := range originalLines[lineIdx:g.startLine] {
			b.WriteString(l)
		}
		groupStart := baseLines[g.startLine].start
		groupEnd := baseLines[g.endLine-1].end
		b.WriteString(applyReplacements(baseContent[groupStart:groupEnd], g.reps, groupStart))
		lineIdx = g.endLine
	}
	for _, l := range originalLines[lineIdx:] {
		b.WriteString(l)
	}
	return b.String(), nil
}

// lineNumberPrefix matches the "  42: " that read_file puts in front of every
// line it returns.
var lineNumberPrefix = regexp.MustCompile(`^[ \t]*\d+: `)

// stripLineNumbers removes read_file's display prefix from every line of a
// block, and reports whether the block was numbered at all.
//
// The guard is that *every* non-empty line must carry a prefix. That is what
// separates "the model pasted read_file's output back" from "the code
// genuinely starts with a number and a colon" — a switch over HTTP statuses,
// a YAML map, a changelog. A block where only some lines match is left alone.
func stripLineNumbers(block string) (string, bool) {
	lines := strings.Split(block, "\n")
	numbered := 0
	out := make([]string, len(lines))
	for i, l := range lines {
		if strings.TrimSpace(l) == "" {
			out[i] = l
			continue
		}
		loc := lineNumberPrefix.FindString(l)
		if loc == "" {
			return block, false
		}
		out[i] = l[len(loc):]
		numbered++
	}
	if numbered == 0 {
		return block, false
	}
	return strings.Join(out, "\n"), true
}

// applyEdits matches every edit against content (already BOM-stripped and
// LF-normalized) and returns the new content. All edits are located against
// the same base; if any edit needs the fuzzy fallback, the whole batch is
// applied in normalized space and overlaid line-wise onto the original so
// unchanged lines keep their exact bytes. Errors are phrased for the model:
// they say what to fix, not just what failed.
//
// A third fallback sits under the other two: old text that still carries
// read_file's line numbers is stripped and retried. Numbering the read output
// helps the model point at code, but only if quoting that output back is not
// then a silent edit failure.
func applyEdits(content string, edits []Edit, path string) (newContent string, usedFuzzy, usedNumbered bool, usedStrategy string, err error) {
	if len(edits) == 0 {
		return "", false, false, "", fmt.Errorf("no edits given for %s", path)
	}
	normalized := make([]Edit, len(edits))
	for i, e := range edits {
		normalized[i] = Edit{Old: normalizeToLF(e.Old), New: normalizeToLF(e.New)}
		if normalized[i].Old == "" {
			return "", false, false, "", editErr(path, i, len(edits), "old text must not be empty")
		}
	}

	// Line-number stripping is tried before fuzzy matching and only for edits
	// that miss as given: an edit that already matches is never rewritten.
	for i, e := range normalized {
		if fuzzyFindText(content, e.Old).found {
			continue
		}
		stripped, was := stripLineNumbers(e.Old)
		if !was || !fuzzyFindText(content, stripped).found {
			continue
		}
		normalized[i].Old = stripped
		// New text pasted from the same read carries the numbers too.
		if strippedNew, wasNew := stripLineNumbers(e.New); wasNew {
			normalized[i].New = strippedNew
		}
		usedNumbered = true
	}

	// Placement happens in one of two spaces, and which one decides how the
	// result is assembled.
	//
	// The original: a match is a byte range in the file itself, so applying it
	// is a splice and every byte outside the range is untouched by
	// construction. Exact matching and the line/indent/anchor strategies all
	// land here.
	//
	// The normalized copy: NFKC and smart-quote folding rewrite the text, so a
	// match there is an offset into a file that does not exist on disk. Those
	// results have to be overlaid back line by line. It is the more invasive
	// path, so it is only taken when no edit in the batch could be placed in
	// the original — mixing the two would mean two different coordinate spaces
	// in one `matched` list.
	matched, base, err := placeEdits(content, normalized, edits, path, &usedFuzzy, &usedStrategy)
	if err != nil {
		return "", false, false, "", err
	}

	sort.Slice(matched, func(i, j int) bool { return matched[i].index < matched[j].index })
	for i := 1; i < len(matched); i++ {
		prev, cur := matched[i-1], matched[i]
		if prev.index+prev.length > cur.index {
			return "", false, false, "", fmt.Errorf(
				"edits %d and %d overlap in %s; merge them into one edit or target disjoint regions",
				prev.editIndex+1, cur.editIndex+1, path)
		}
	}

	if usedFuzzy {
		newContent, err = applyPreservingUnchangedLines(content, base, matched)
		if err != nil {
			return "", false, false, "", err
		}
	} else {
		newContent = applyReplacements(base, matched, 0)
	}
	if newContent == content {
		return "", false, false, "", fmt.Errorf("no changes made to %s: the replacement produced identical content", path)
	}
	return newContent, usedFuzzy, usedNumbered, usedStrategy, nil
}

// placeEdits resolves every edit to a position, preferring the original
// content and falling back to the normalized copy for the whole batch. It
// returns the placements and the space they refer to, and sets usedFuzzy /
// usedStrategy so the approval preview can say how the match was reached.
func placeEdits(content string, normalized, edits []Edit, path string, usedFuzzy *bool, usedStrategy *string) ([]matchedEdit, string, error) {
	matched := make([]matchedEdit, 0, len(normalized))
	strategy := ""
	for i, e := range normalized {
		s, name, ambiguous, ok := locateSpan(content, e.Old)
		if ambiguous > 1 {
			return nil, "", editErr(path, i, len(edits), fmt.Sprintf(
				"found %d occurrences of the old text; it must be unique — include more surrounding context", ambiguous))
		}
		if !ok {
			matched, strategy = nil, ""
			break
		}
		if name != "exact" {
			strategy = name
		}
		matched = append(matched, matchedEdit{editIndex: i, index: s.index, length: s.length, newText: e.New})
	}
	if len(matched) == len(normalized) {
		*usedStrategy = strategy
		return matched, content, nil
	}

	// Nothing placed cleanly in the original — match the batch in normalized
	// space instead.
	for _, e := range normalized {
		if fuzzyFindText(content, e.Old).usedFuzzy {
			*usedFuzzy = true
			break
		}
	}
	base := content
	if *usedFuzzy {
		base = normalizeForFuzzyMatch(content)
	}
	matched = make([]matchedEdit, 0, len(normalized))
	for i, e := range normalized {
		m := fuzzyFindText(base, e.Old)
		if !m.found {
			return nil, "", editErr(path, i, len(edits),
				"the old text was not found; it must match exactly, including whitespace and newlines")
		}
		if n := countOccurrences(base, e.Old); n > 1 {
			return nil, "", editErr(path, i, len(edits), fmt.Sprintf(
				"found %d occurrences of the old text; it must be unique — include more surrounding context", n))
		}
		matched = append(matched, matchedEdit{editIndex: i, index: m.index, length: m.length, newText: e.New})
	}
	return matched, base, nil
}

// editErr phrases a per-edit failure, naming the edit index only when the
// batch has more than one.
func editErr(path string, idx, total int, msg string) error {
	if total == 1 {
		return fmt.Errorf("%s in %s", msg, path)
	}
	return fmt.Errorf("edit %d of %d: %s in %s", idx+1, total, msg, path)
}
