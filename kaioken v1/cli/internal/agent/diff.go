package agent

import (
	"fmt"
	"strings"
)

const maxDiffLines = 40

// diffPreview renders a compact line diff between old and new content for the
// approval prompt. New files (empty old) show a content preview.
func diffPreview(oldContent, newContent string) string {
	if oldContent == "" {
		return "(new file)\n" + capLines(prefixLines(newContent, "+"), maxDiffLines)
	}
	oldLines := strings.Split(oldContent, "\n")
	newLines := strings.Split(newContent, "\n")

	// Trim common prefix/suffix so the hunk shows just what changed.
	start := 0
	for start < len(oldLines) && start < len(newLines) && oldLines[start] == newLines[start] {
		start++
	}
	endO, endN := len(oldLines), len(newLines)
	for endO > start && endN > start && oldLines[endO-1] == newLines[endN-1] {
		endO--
		endN--
	}

	var b strings.Builder
	if start > 0 {
		fmt.Fprintf(&b, "  … %d unchanged line(s)\n", start)
	}
	for _, l := range oldLines[start:endO] {
		b.WriteString("- " + l + "\n")
	}
	for _, l := range newLines[start:endN] {
		b.WriteString("+ " + l + "\n")
	}
	tail := len(oldLines) - endO
	if tail > 0 {
		fmt.Fprintf(&b, "  … %d unchanged line(s)\n", tail)
	}
	return capLines(b.String(), maxDiffLines)
}

// hunkPreview renders an edit_file change as a removed/added hunk.
func hunkPreview(oldStr, newStr string) string {
	var b strings.Builder
	b.WriteString(capLines(prefixLines(oldStr, "-"), maxDiffLines/2))
	b.WriteString(capLines(prefixLines(newStr, "+"), maxDiffLines/2))
	return b.String()
}

func prefixLines(s, prefix string) string {
	lines := strings.Split(s, "\n")
	var b strings.Builder
	for _, l := range lines {
		b.WriteString(prefix + " " + l + "\n")
	}
	return b.String()
}

func capLines(s string, n int) string {
	lines := strings.Split(strings.TrimRight(s, "\n"), "\n")
	if len(lines) <= n {
		return strings.Join(lines, "\n") + "\n"
	}
	shown := strings.Join(lines[:n], "\n")
	return shown + fmt.Sprintf("\n  … %d more line(s)\n", len(lines)-n)
}

// --- Structured diffs for the desktop approval dialog (T021) ---

// DiffLine is one line in a hunk.
type DiffLine struct {
	Op   string `json:"op"`   // " ", "-", "+"
	Text string `json:"text"`
}

// Hunk is one contiguous change region in unified-diff terms.
type Hunk struct {
	OldStart int        `json:"old_start"`
	OldLines int        `json:"old_lines"`
	NewStart int        `json:"new_start"`
	NewLines int        `json:"new_lines"`
	Lines    []DiffLine `json:"lines"`
}

const (
	diffContext     = 3   // lines of context around each change
	diffMaxChanged  = 400 // beyond this, emit a synthetic marker hunk
)

// diffOp is one operation in the edit script.
type diffOp struct {
	kind byte // ' ', '-', '+'
	text string
}

// DiffHunks computes unified-diff hunks with three lines of context between
// old and new content. Empty old means a new file; empty new means deletion.
// The existing preview functions above are unchanged — the TUI still uses them.
func DiffHunks(old, new string) []Hunk {
	oldLines := splitLines(old)
	newLines := splitLines(new)

	// Compute the LCS table.
	lcs := lcsTable(oldLines, newLines)

	// Walk the table to produce edit-script ops.
	var ops []diffOp
	i, j := len(oldLines), len(newLines)
	for i > 0 || j > 0 {
		switch {
		case i > 0 && j > 0 && oldLines[i-1] == newLines[j-1]:
			ops = append(ops, diffOp{' ', oldLines[i-1]})
			i--
			j--
		case j > 0 && (i == 0 || lcs[i][j-1] >= lcs[i-1][j]):
			ops = append(ops, diffOp{'+', newLines[j-1]})
			j--
		default:
			ops = append(ops, diffOp{'-', oldLines[i-1]})
			i--
		}
	}
	// Reverse.
	for l, r := 0, len(ops)-1; l < r; l, r = l+1, r-1 {
		ops[l], ops[r] = ops[r], ops[l]
	}

	// Count changed lines.
	changed := 0
	for _, o := range ops {
		if o.kind != ' ' {
			changed++
		}
	}
	if changed == 0 {
		return nil
	}

	// Cap: too many changes → one synthetic hunk.
	if changed > diffMaxChanged {
		return []Hunk{{
			OldStart: 1, OldLines: len(oldLines),
			NewStart: 1, NewLines: len(newLines),
			Lines: []DiffLine{{Op: " ", Text: fmt.Sprintf("file too large to diff (%d lines changed)", changed)}},
		}}
	}

	// Group ops into hunks with context.
	return buildHunks(ops, diffContext)
}

func splitLines(s string) []string {
	if s == "" {
		return nil
	}
	return strings.Split(s, "\n")
}

// lcsTable builds the classic DP longest-common-subsequence length table.
func lcsTable(a, b []string) [][]int {
	m, n := len(a), len(b)
	t := make([][]int, m+1)
	for i := range t {
		t[i] = make([]int, n+1)
	}
	for i := 1; i <= m; i++ {
		for j := 1; j <= n; j++ {
			if a[i-1] == b[j-1] {
				t[i][j] = t[i-1][j-1] + 1
			} else if t[i-1][j] >= t[i][j-1] {
				t[i][j] = t[i-1][j]
			} else {
				t[i][j] = t[i][j-1]
			}
		}
	}
	return t
}

// buildHunks groups the edit script into hunks, each with `ctx` lines of
// unchanged context before and after the change.
func buildHunks(ops []diffOp, ctx int) []Hunk {
	// Find change indices.
	var changeIdx []int
	for i, o := range ops {
		if o.kind != ' ' {
			changeIdx = append(changeIdx, i)
		}
	}
	if len(changeIdx) == 0 {
		return nil
	}

	// Merge nearby changes into groups.
	type group struct{ start, end int }
	var groups []group
	g := group{changeIdx[0], changeIdx[0]}
	for _, ci := range changeIdx[1:] {
		if ci-g.end <= 2*ctx+1 {
			g.end = ci
		} else {
			groups = append(groups, g)
			g = group{ci, ci}
		}
	}
	groups = append(groups, g)

	var hunks []Hunk
	for _, gr := range groups {
		start := gr.start - ctx
		if start < 0 {
			start = 0
		}
		end := gr.end + ctx + 1
		if end > len(ops) {
			end = len(ops)
		}

		var lines []DiffLine
		oldStart, newStart := 1, 1
		// Compute 1-based starting positions by counting ops before start.
		os, ns := 0, 0
		for k := 0; k < start; k++ {
			switch ops[k].kind {
			case ' ':
				os++
				ns++
			case '-':
				os++
			case '+':
				ns++
			}
		}
		oldStart = os + 1
		newStart = ns + 1

		oldCount, newCount := 0, 0
		for k := start; k < end; k++ {
			lines = append(lines, DiffLine{Op: string(ops[k].kind), Text: ops[k].text})
			switch ops[k].kind {
			case ' ':
				oldCount++
				newCount++
			case '-':
				oldCount++
			case '+':
				newCount++
			}
		}
		hunks = append(hunks, Hunk{
			OldStart: oldStart, OldLines: oldCount,
			NewStart: newStart, NewLines: newCount,
			Lines: lines,
		})
	}
	return hunks
}
