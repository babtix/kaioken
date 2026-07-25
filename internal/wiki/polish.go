package wiki

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// Two post-processing passes that need no model call.
//
//   - sanitizeMermaid: an invalid diagram renders as an error box in the wiki
//     browser, which looks worse than no diagram at all.
//   - crossLink: chapters that never link to each other re-explain the same
//     concepts; turning sibling-chapter mentions into links cuts duplication
//     and makes the site navigable.

// mermaidTypes are the diagram kinds the renderer understands.
var mermaidTypes = []string{
	"graph", "flowchart", "sequenceDiagram", "classDiagram", "stateDiagram",
	"stateDiagram-v2", "erDiagram", "journey", "gantt", "pie", "gitGraph",
	"mindmap", "timeline", "quadrantChart", "requirementDiagram", "C4Context",
	"sankey-beta", "xychart-beta", "block-beta",
}

var reMermaidBlock = regexp.MustCompile("(?s)```mermaid\\s*\\n(.*?)```")

// sanitizeMermaid drops mermaid blocks that would fail to render, keeping the
// diagram source visible as a plain code block instead of an error.
func sanitizeMermaid(doc string) string {
	return reMermaidBlock.ReplaceAllStringFunc(doc, func(block string) string {
		m := reMermaidBlock.FindStringSubmatch(block)
		if m == nil {
			return block
		}
		body := m[1]
		if validMermaid(body) {
			return block
		}
		// Demote rather than delete: the content still communicates something,
		// and silently dropping the model's work hides a real problem.
		return "```text\n" + strings.TrimRight(body, "\n") +
			"\n```\n\n> Diagram omitted: the generated mermaid was not valid.\n"
	})
}

// validMermaid applies the cheap structural checks that catch essentially all
// generated breakage: a recognised diagram type, real content, and balanced
// brackets. It is not a mermaid parser and does not pretend to be one.
func validMermaid(body string) bool {
	trimmed := strings.TrimSpace(body)
	if trimmed == "" {
		return false
	}
	// A stray fence inside means the model nested code blocks.
	if strings.Contains(trimmed, "```") {
		return false
	}

	var first string
	for _, line := range strings.Split(trimmed, "\n") {
		l := strings.TrimSpace(line)
		if l == "" || strings.HasPrefix(l, "%%") {
			continue
		}
		first = l
		break
	}
	if first == "" {
		return false
	}
	known := false
	for _, t := range mermaidTypes {
		if strings.HasPrefix(first, t) {
			known = true
			break
		}
	}
	if !known {
		return false
	}

	// A diagram with a declaration and nothing else renders empty.
	contentLines := 0
	for _, line := range strings.Split(trimmed, "\n") {
		l := strings.TrimSpace(line)
		if l != "" && !strings.HasPrefix(l, "%%") && l != first {
			contentLines++
		}
	}
	if contentLines == 0 {
		return false
	}

	if !balanced(trimmed, '[', ']') || !balanced(trimmed, '(', ')') {
		return false
	}
	// erDiagram writes cardinality as ||--o{ and }o--||, so braces there are
	// relationship syntax rather than blocks and will not balance.
	if strings.HasPrefix(first, "erDiagram") {
		return true
	}
	return balanced(trimmed, '{', '}')
}

func balanced(s string, open, close rune) bool {
	depth := 0
	for _, r := range s {
		switch r {
		case open:
			depth++
		case close:
			depth--
			if depth < 0 {
				return false
			}
		}
	}
	return depth == 0
}

// crossLink turns mentions of other chapters into relative markdown links.
// It returns how many links it inserted.
func crossLink(repo string, outline *Outline) (int, error) {
	if outline == nil || len(outline.Sections) < 2 {
		return 0, nil
	}
	// Longest titles first, so "Data Models" wins over "Data".
	titles := make([]Section, len(outline.Sections))
	copy(titles, outline.Sections)
	sort.Slice(titles, func(i, j int) bool {
		return len(titles[i].Title) > len(titles[j].Title)
	})

	total := 0
	for _, sec := range outline.Sections {
		dir := filepath.Join(WikiDir(repo), safeName(sec.Title))
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
				continue
			}
			path := filepath.Join(dir, e.Name())
			raw, err := os.ReadFile(path)
			if err != nil {
				continue
			}
			linked, n := linkChapters(string(raw), sec, titles)
			if n == 0 {
				continue
			}
			if err := os.WriteFile(path, []byte(linked), 0o644); err != nil {
				return total, err
			}
			total += n
		}
	}
	return total, nil
}

// linkChapters rewrites the first prose mention of each sibling chapter into a
// relative link. Headings, code blocks, existing links and the document's own
// chapter are all left alone.
func linkChapters(doc string, self Section, all []Section) (string, int) {
	lines := strings.Split(doc, "\n")
	linkedOnce := map[string]bool{}
	inFence := false
	count := 0

	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "```") {
			inFence = !inFence
			continue
		}
		if inFence || trimmed == "" || strings.HasPrefix(trimmed, "#") ||
			strings.HasPrefix(trimmed, "|") || strings.HasPrefix(trimmed, "<!--") {
			continue
		}

		for _, sec := range all {
			if sec.ID == self.ID || linkedOnce[sec.ID] {
				continue
			}
			title := sec.Title
			idx := indexWholePhrase(lines[i], title)
			if idx < 0 {
				continue
			}
			// Never rewrite inside an existing link or inline code.
			if insideMarkup(lines[i], idx) {
				continue
			}
			target := "../" + safeName(sec.Title) + "/" + safeName(sec.Title) + ".md"
			lines[i] = lines[i][:idx] + "[" + title + "](" + target + ")" +
				lines[i][idx+len(title):]
			linkedOnce[sec.ID] = true
			count++
			break // one rewrite per line keeps offsets valid
		}
	}
	return strings.Join(lines, "\n"), count
}

// indexWholePhrase finds a phrase on a word boundary, so "API" does not match
// inside "APIs" or "rapid".
func indexWholePhrase(line, phrase string) int {
	from := 0
	for {
		i := strings.Index(line[from:], phrase)
		if i < 0 {
			return -1
		}
		i += from
		before := byte(' ')
		if i > 0 {
			before = line[i-1]
		}
		after := byte(' ')
		if i+len(phrase) < len(line) {
			after = line[i+len(phrase)]
		}
		if !isWordByte(before) && !isWordByte(after) {
			return i
		}
		from = i + len(phrase)
		if from >= len(line) {
			return -1
		}
	}
}

func isWordByte(b byte) bool {
	return b == '_' || b == '-' ||
		(b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9')
}

// insideMarkup reports whether position i sits inside inline code or an
// existing markdown link.
func insideMarkup(line string, i int) bool {
	if strings.Count(line[:i], "`")%2 == 1 {
		return true
	}
	// A "[" before with no closing "]" between it and i means we are in a label.
	openBracket := strings.LastIndexByte(line[:i], '[')
	if openBracket >= 0 && !strings.ContainsAny(line[openBracket:i], "]") {
		return true
	}
	// Inside a link target: "(" preceded by "]".
	openParen := strings.LastIndexByte(line[:i], '(')
	if openParen > 0 && line[openParen-1] == ']' && !strings.Contains(line[openParen:i], ")") {
		return true
	}
	return false
}
