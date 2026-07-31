package pdf

import (
	"regexp"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/text"
)

// The dossier's sections arrive as Markdown, because that is what the model
// writes and what the Markdown twin of the report keeps on disk. Rendering it
// here means parsing rather than pattern-matching: goldmark is already a
// dependency, and a real parser is the difference between bold text and a page
// full of stray asterisks the first time a model writes a**b.

var mdParser = goldmark.New().Parser()

// citationRe finds the [3] and [3][7] markers the body cites with, so they can
// be set apart from the prose they support.
var citationRe = regexp.MustCompile(`\[\d{1,3}\]`)

// renderMarkdown lays a Markdown fragment out at the current position.
func renderMarkdown(r *renderer, src string) {
	source := []byte(src)
	doc := mdParser.Parse(text.NewReader(source))
	for n := doc.FirstChild(); n != nil; n = n.NextSibling() {
		renderBlock(r, n, source, 0)
	}
}

// renderBlock draws one block-level node. indent is the current left offset in
// millimetres, which lists and quotes add to.
func renderBlock(r *renderer, n ast.Node, source []byte, indent float64) {
	p := r.pdf
	switch node := n.(type) {

	case *ast.Heading:
		// The section title is drawn by the caller, so a level-2 heading in the
		// body is a subheading of it, not a peer.
		level := node.Level
		if level < 2 {
			level = 2
		}
		r.pageBreakIfTight(20)
		r.heading(string(node.Text(source)), level-0)

	case *ast.Paragraph:
		r.pageBreakIfTight(12)
		p.SetFont("Helvetica", "", 10)
		setText(p, inkBody)
		p.SetLeftMargin(marginX + indent)
		p.SetX(marginX + indent)
		renderInline(r, node, source, "")
		p.Ln(lineHeight)
		p.Ln(2.2)
		p.SetLeftMargin(marginX)

	case *ast.List:
		num := node.Start
		for item := node.FirstChild(); item != nil; item = item.NextSibling() {
			marker := "-  "
			if node.IsOrdered() {
				marker = itoa(num) + ".  "
				num++
			}
			renderListItem(r, item, source, indent, marker)
		}
		p.Ln(1.6)

	case *ast.Blockquote:
		r.pageBreakIfTight(14)
		y0 := p.GetY()
		for c := node.FirstChild(); c != nil; c = c.NextSibling() {
			renderBlock(r, c, source, indent+6)
		}
		// The rule is drawn after the text so its height is known.
		setDraw(p, mix(brandFrom, brandTo, 0.5))
		p.SetLineWidth(0.6)
		p.Line(marginX+indent+1.5, y0, marginX+indent+1.5, p.GetY()-2)

	case *ast.FencedCodeBlock, *ast.CodeBlock:
		r.pageBreakIfTight(16)
		p.SetFont("Courier", "", 8.5)
		setText(p, inkBody)
		p.SetLeftMargin(marginX + indent + 3)
		p.SetX(marginX + indent + 3)
		p.MultiCell(contentW-indent-3, 4.4, winAnsi(linesOf(n, source)), "", "L", false)
		p.SetLeftMargin(marginX)
		p.SetFont("Helvetica", "", 10)
		p.Ln(2)

	case *ast.ThematicBreak:
		p.Ln(2)
		setDraw(p, inkRule)
		p.SetLineWidth(0.2)
		p.Line(marginX+indent, p.GetY(), marginX+contentW, p.GetY())
		p.Ln(3)

	default:
		// Tables and anything else goldmark hands back without a renderer here
		// still have text worth showing; dropping the node would lose content.
		for c := n.FirstChild(); c != nil; c = c.NextSibling() {
			renderBlock(r, c, source, indent)
		}
	}
}

func renderListItem(r *renderer, item ast.Node, source []byte, indent float64, marker string) {
	p := r.pdf
	r.pageBreakIfTight(10)
	const bulletW = 7.0

	y := p.GetY()
	p.SetFont("Helvetica", "", 10)
	setText(p, inkMuted)
	p.SetXY(marginX+indent, y)
	p.CellFormat(bulletW, lineHeight, winAnsi(marker), "", 0, "L", false, 0, "")
	setText(p, inkBody)

	p.SetXY(marginX+indent+bulletW, y)
	p.SetLeftMargin(marginX + indent + bulletW)
	first := true
	for c := item.FirstChild(); c != nil; c = c.NextSibling() {
		if para, ok := c.(*ast.Paragraph); ok && first {
			// The first paragraph continues on the bullet's own line.
			renderInline(r, para, source, "")
			p.Ln(lineHeight)
			first = false
			continue
		}
		renderBlock(r, c, source, indent+bulletW)
	}
	p.SetLeftMargin(marginX)
	p.Ln(0.8)
}

// renderInline walks the inline children of a block, switching font style as
// it goes. fpdf's Write wraps at the right margin and carries the position
// across calls, which is what lets a bold run sit mid-sentence without the
// paragraph having to be measured up front.
func renderInline(r *renderer, n ast.Node, source []byte, style string) {
	p := r.pdf
	for c := n.FirstChild(); c != nil; c = c.NextSibling() {
		switch node := c.(type) {

		case *ast.Text:
			writeStyled(r, string(node.Segment.Value(source)), style)
			if node.SoftLineBreak() {
				p.Write(lineHeight, " ")
			}
			if node.HardLineBreak() {
				p.Ln(lineHeight)
			}

		case *ast.String:
			writeStyled(r, string(node.Value), style)

		case *ast.Emphasis:
			add := "I"
			if node.Level >= 2 {
				add = "B"
			}
			renderInline(r, node, source, mergeStyle(style, add))

		case *ast.CodeSpan:
			p.SetFont("Courier", style, 9)
			p.Write(lineHeight, winAnsi(string(node.Text(source))))
			p.SetFont("Helvetica", style, 10)

		case *ast.Link:
			// The URL is not printed: the reference register carries it, and an
			// inline URL wrecks the measure of a justified column.
			renderInline(r, node, source, mergeStyle(style, "U"))

		case *ast.AutoLink:
			writeStyled(r, string(node.URL(source)), mergeStyle(style, "U"))

		case *ast.RawHTML, *ast.HTMLBlock:
			// Markup a model emitted by accident is not content.

		default:
			renderInline(r, c, source, style)
		}
	}
}

// writeStyled emits a text run, setting citation markers apart from the prose.
// A marker is the reader's handle on the evidence, so it is drawn in the brand
// accent and one point down — visible when scanning, quiet when reading.
func writeStyled(r *renderer, s, style string) {
	p := r.pdf
	if s == "" {
		return
	}
	p.SetFont("Helvetica", style, 10)
	setText(p, inkBody)

	last := 0
	for _, loc := range citationRe.FindAllStringIndex(s, -1) {
		if loc[0] > last {
			p.Write(lineHeight, winAnsi(s[last:loc[0]]))
		}
		p.SetFont("Helvetica", "B", 8)
		setText(p, mix(brandFrom, brandTo, 0.5))
		p.Write(lineHeight, winAnsi(s[loc[0]:loc[1]]))
		p.SetFont("Helvetica", style, 10)
		setText(p, inkBody)
		last = loc[1]
	}
	if last < len(s) {
		p.Write(lineHeight, winAnsi(s[last:]))
	}
}

// pageBreakIfTight starts a new page when less than need millimetres remain,
// so a heading never lands alone at the foot of a page.
func (r *renderer) pageBreakIfTight(need float64) {
	if r.pdf.GetY() > pageH-marginBot-need {
		r.pdf.AddPage()
	}
}

// mergeStyle combines fpdf style letters without repeating one.
func mergeStyle(style, add string) string {
	if strings.Contains(style, add) {
		return style
	}
	return style + add
}

// linesOf returns the raw text of a code block.
func linesOf(n ast.Node, source []byte) string {
	var b strings.Builder
	lines := n.Lines()
	for i := 0; i < lines.Len(); i++ {
		seg := lines.At(i)
		b.Write(seg.Value(source))
	}
	return strings.TrimRight(b.String(), "\n")
}

// stripMarkers removes citation markers from a fragment shown outside the body,
// where there is no reference register on the same page to resolve them.
func stripMarkers(s string) string {
	s = citationRe.ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, " .", ".")
	s = strings.ReplaceAll(s, "  ", " ")
	return strings.TrimSpace(s)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var digits []byte
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	if neg {
		return "-" + string(digits)
	}
	return string(digits)
}
