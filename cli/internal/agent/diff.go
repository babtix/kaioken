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
