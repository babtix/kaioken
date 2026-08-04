// Package pdf renders a research dossier as a paginated, self-contained PDF.
//
// It exists because the deep (×10) research mode produces a document rather
// than an answer: thirty-odd pages of cited argument, a findings register and
// a source register, which a Markdown file in a repository does not present
// well and cannot be handed to somebody who does not have the repository.
//
// The renderer takes a finished Document — the research package decides what
// the report says, this package decides only how it sits on a page — and lays
// it out with a cover, a table of contents, running headers, page numbers and
// a signature block carrying a fingerprint of the content.
package pdf

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
)

// Brand colours, matching the KAIOKEN wordmark: a ramp from red to orange.
var (
	brandFrom = rgb{0xff, 0x00, 0x00}
	brandTo   = rgb{0xff, 0x88, 0x00}
	inkBody   = rgb{0x1a, 0x1a, 0x1a}
	inkMuted  = rgb{0x6b, 0x6b, 0x6b}
	inkRule   = rgb{0xd8, 0xd8, 0xd8}
)

type rgb struct{ r, g, b int }

// mix interpolates between two brand colours, so the wordmark and the section
// rules carry the same gradient the terminal logo does.
func mix(a, b rgb, t float64) rgb {
	if t < 0 {
		t = 0
	}
	if t > 1 {
		t = 1
	}
	f := func(x, y int) int { return x + int(float64(y-x)*t) }
	return rgb{f(a.r, b.r), f(a.g, b.g), f(a.b, b.b)}
}

// Page geometry in millimetres.
const (
	pageW      = 210.0
	pageH      = 297.0
	marginX    = 22.0
	marginTop  = 24.0
	marginBot  = 20.0
	contentW   = pageW - 2*marginX
	lineHeight = 5.2
)

// Document is a finished dossier ready to be laid out.
type Document struct {
	// Title is the research question the dossier answers.
	Title string
	// Summary is the short answer, set on the cover so the document leads
	// with its conclusion rather than with its table of contents.
	Summary string
	// Meta is the cover's descriptive block: multiplier, model, providers.
	Meta []Field
	// Sections are the body, in order. Their Markdown is rendered, not shown.
	Sections []Section
	// Sources is the reference register, numbered as the body cites them.
	Sources []Source
	// Appendices follow the sources: methodology, findings register, scan log.
	Appendices []Section
	// Signature identifies the run that produced the document.
	Signature Signature
}

// Section is one chapter of the dossier.
type Section struct {
	Title    string
	Markdown string
}

// Source is one page in the reference register.
type Source struct {
	N     int
	Title string
	URL   string
	// Note is an optional qualifier shown after the URL — the domain tier, or
	// that the page was scanned but never cited.
	Note string
}

// Field is a labelled value in a metadata block.
type Field struct{ Label, Value string }

// Signature is the provenance block. It is not a cryptographic signature: the
// fingerprint proves the rendered content matches what was researched, so an
// edited copy can be told from the original, but it does not prove who made it.
type Signature struct {
	Tool        string
	Version     string
	Model       string
	Provider    string
	GeneratedAt time.Time
	Stats       []Field
	// Fingerprint is filled by Render from the document's own content.
	Fingerprint string
}

// Fingerprint is the digest shown in the signature block and the footer. It
// covers everything the reader can see, so changing a figure in the body
// changes the fingerprint.
func (d *Document) Fingerprint() string {
	h := sha256.New()
	fmt.Fprintln(h, d.Title)
	fmt.Fprintln(h, d.Summary)
	for _, s := range d.Sections {
		fmt.Fprintln(h, s.Title)
		fmt.Fprintln(h, s.Markdown)
	}
	for _, s := range d.Sources {
		fmt.Fprintf(h, "%d\t%s\t%s\n", s.N, s.Title, s.URL)
	}
	for _, s := range d.Appendices {
		fmt.Fprintln(h, s.Title)
		fmt.Fprintln(h, s.Markdown)
	}
	return hex.EncodeToString(h.Sum(nil))
}

// renderer carries the layout state one Render call needs.
type renderer struct {
	pdf   *fpdf.Fpdf
	doc   *Document
	fp    string // short fingerprint for the footer
	cover bool   // suppress header and footer while the cover is drawn
	toc   []tocEntry
}

type tocEntry struct {
	title string
	page  int
	link  int
}

// Render lays the document out and writes it to w, returning the page count.
func Render(doc *Document, w io.Writer) (int, error) {
	if doc == nil {
		return 0, fmt.Errorf("no document to render")
	}
	full := doc.Fingerprint()
	doc.Signature.Fingerprint = full

	r := &renderer{
		pdf: fpdf.New("P", "mm", "A4", ""),
		doc: doc,
		fp:  full[:8] + "..." + full[len(full)-8:],
	}
	p := r.pdf
	p.SetMargins(marginX, marginTop, marginX)
	p.SetAutoPageBreak(true, marginBot)
	p.AliasNbPages("{nb}")
	p.SetTitle(winAnsi(doc.Title), false)
	p.SetAuthor(winAnsi(doc.Signature.Tool+" "+doc.Signature.Version), false)
	p.SetCreator(winAnsi(doc.Signature.Tool), false)
	p.SetSubject(winAnsi("Research dossier"), false)

	p.SetHeaderFunc(r.header)
	p.SetFooterFunc(r.footer)

	r.cover = true
	r.drawCover()
	r.cover = false

	// The contents page is laid out after the body, once the page numbers are
	// known, but it has to appear before it — so its page is reserved here and
	// filled in at the end.
	p.AddPage()
	tocPage := p.PageNo()

	for _, s := range doc.Sections {
		r.drawSection(s, true)
	}
	if len(doc.Sources) > 0 {
		r.drawSources()
	}
	for _, s := range doc.Appendices {
		r.drawSection(s, true)
	}
	r.drawSignature()

	r.fillContents(tocPage)

	if err := p.Error(); err != nil {
		return 0, fmt.Errorf("laying out the dossier: %w", err)
	}
	if err := p.Output(w); err != nil {
		return 0, fmt.Errorf("writing the dossier: %w", err)
	}
	return p.PageCount(), nil
}

// ------------------------------------------------------------ page furniture

func (r *renderer) header() {
	if r.cover || r.pdf.PageNo() <= 1 {
		return
	}
	p := r.pdf
	p.SetY(12)
	p.SetFont("Helvetica", "", 8)
	setText(p, inkMuted)
	p.CellFormat(contentW*0.7, 4, winAnsi(truncate(r.doc.Title, 78)), "", 0, "L", false, 0, "")
	p.CellFormat(contentW*0.3, 4, winAnsi(r.doc.Signature.Tool+" research dossier"), "", 1, "R", false, 0, "")
	// A two-tone rule, the wordmark's gradient reduced to a hairline.
	y := p.GetY() + 1
	half := contentW / 2
	setDraw(p, brandFrom)
	p.SetLineWidth(0.4)
	p.Line(marginX, y, marginX+half, y)
	setDraw(p, brandTo)
	p.Line(marginX+half, y, marginX+contentW, y)
	p.SetY(marginTop)
	setText(p, inkBody)
}

func (r *renderer) footer() {
	if r.cover {
		return
	}
	p := r.pdf
	p.SetY(-14)
	setDraw(p, inkRule)
	p.SetLineWidth(0.2)
	p.Line(marginX, p.GetY(), marginX+contentW, p.GetY())
	p.SetY(-11)
	p.SetFont("Helvetica", "", 7.5)
	setText(p, inkMuted)
	p.CellFormat(contentW*0.5, 4, winAnsi(r.fp), "", 0, "L", false, 0, "")
	p.CellFormat(contentW*0.5, 4,
		winAnsi(fmt.Sprintf("page %d of {nb}", p.PageNo())), "", 0, "R", false, 0, "")
	setText(p, inkBody)
}

// ------------------------------------------------------------------- cover

func (r *renderer) drawCover() {
	p := r.pdf
	p.AddPage()

	// The wordmark, letter by letter along the brand gradient — the same ramp
	// the terminal logo uses, so the document is recognisably from the tool
	// the user ran.
	p.SetY(40)
	p.SetFont("Helvetica", "B", 34)
	word := strings.ToUpper(r.doc.Signature.Tool)
	if word == "" {
		word = "KAIOKEN"
	}
	var total float64
	for _, ch := range word {
		total += p.GetStringWidth(string(ch)) + 1.6
	}
	x := marginX
	for i, ch := range word {
		c := mix(brandFrom, brandTo, float64(i)/float64(max(1, len([]rune(word))-1)))
		setText(p, c)
		p.SetXY(x, 40)
		wch := p.GetStringWidth(string(ch))
		p.CellFormat(wch, 14, winAnsi(string(ch)), "", 0, "L", false, 0, "")
		x += wch + 1.6
	}
	_ = total

	p.SetXY(marginX, 56)
	p.SetFont("Helvetica", "", 9)
	setText(p, inkMuted)
	p.CellFormat(contentW, 5, winAnsi("DEEP RESEARCH DOSSIER"), "", 1, "L", false, 0, "")

	p.SetY(72)
	setDraw(p, brandFrom)
	p.SetLineWidth(0.8)
	p.Line(marginX, p.GetY(), marginX+contentW*0.25, p.GetY())

	// The question, as the document's title.
	p.SetY(84)
	p.SetFont("Helvetica", "B", 22)
	setText(p, inkBody)
	p.MultiCell(contentW, 9.5, winAnsi(r.doc.Title), "", "L", false)

	if s := strings.TrimSpace(r.doc.Summary); s != "" {
		p.Ln(6)
		p.SetFont("Helvetica", "", 11)
		setText(p, inkBody)
		p.MultiCell(contentW, 5.6, winAnsi(stripMarkers(s)), "", "L", false)
	}

	// Metadata sits at the foot of the cover, out of the way of the answer.
	y := pageH - 88
	p.SetY(y)
	setDraw(p, inkRule)
	p.SetLineWidth(0.2)
	p.Line(marginX, y, marginX+contentW, y)
	p.SetY(y + 5)
	r.drawFields(r.doc.Meta, contentW/2)

	r.drawSignatureBlock(pageH - 46)
}

// drawSignatureBlock renders the provenance panel used on the cover and again
// at the end of the document.
func (r *renderer) drawSignatureBlock(y float64) {
	p := r.pdf
	sig := r.doc.Signature
	p.SetY(y)

	setDraw(p, brandFrom)
	p.SetLineWidth(0.5)
	p.Line(marginX, y, marginX+contentW, y)

	p.SetY(y + 4)
	p.SetFont("Helvetica", "B", 9.5)
	setText(p, inkBody)
	p.CellFormat(contentW, 5, winAnsi("Researched and signed by "+strings.ToUpper(sig.Tool)), "", 1, "L", false, 0, "")

	p.SetFont("Helvetica", "", 8.5)
	setText(p, inkMuted)
	line := strings.Join(nonEmpty(sig.Version, sig.Model, sig.Provider), "  ·  ")
	if line != "" {
		p.CellFormat(contentW, 4.6, winAnsi(line), "", 1, "L", false, 0, "")
	}
	if !sig.GeneratedAt.IsZero() {
		p.CellFormat(contentW, 4.6,
			winAnsi(sig.GeneratedAt.UTC().Format("2 January 2006, 15:04 MST")), "", 1, "L", false, 0, "")
	}
	if len(sig.Stats) > 0 {
		var parts []string
		for _, f := range sig.Stats {
			parts = append(parts, f.Value+" "+f.Label)
		}
		p.CellFormat(contentW, 4.6, winAnsi(strings.Join(parts, "  ·  ")), "", 1, "L", false, 0, "")
	}

	p.Ln(1)
	p.SetFont("Courier", "", 7.5)
	p.CellFormat(contentW, 4.4, winAnsi("sha-256  "+sig.Fingerprint), "", 1, "L", false, 0, "")
	p.SetFont("Helvetica", "", 7.5)
	p.MultiCell(contentW, 3.8, winAnsi(
		"The fingerprint covers this document's text, sources and appendices. "+
			"Recomputing it over an unmodified copy reproduces the value above."), "", "L", false)
	setText(p, inkBody)
}

// drawSignature closes the document with the same panel, so a printed copy
// carries its provenance on the last page as well as the first.
func (r *renderer) drawSignature() {
	p := r.pdf
	p.AddPage()
	r.heading("Provenance", 1)
	p.SetFont("Helvetica", "", 10)
	setText(p, inkBody)
	p.MultiCell(contentW, lineHeight, winAnsi(
		"This dossier was assembled by an automated research pipeline: it planned "+
			"subquestions, searched the open web, read the pages it retrieved, reasoned "+
			"over them, audited its own coverage and searched again for what was missing. "+
			"Every claim in the body carries a citation to a page that was actually "+
			"fetched and read; nothing is drawn from the model's own memory.\n\n"+
			"Automated research is not a substitute for a domain expert. Sources are "+
			"weighted by a heuristic, not verified; where the evidence was thin or "+
			"contradictory the report says so, and those passages are the ones to check "+
			"first."), "", "L", false)
	p.Ln(4)
	r.drawSignatureBlock(p.GetY())
}

// ----------------------------------------------------------------- sections

func (r *renderer) drawSection(s Section, newPage bool) {
	p := r.pdf
	if newPage {
		p.AddPage()
	}
	r.heading(s.Title, 1)
	r.toc = append(r.toc, tocEntry{title: s.Title, page: p.PageNo(), link: r.link()})
	renderMarkdown(r, s.Markdown)
}

// link registers an internal destination at the current position so the table
// of contents can jump to it.
func (r *renderer) link() int {
	id := r.pdf.AddLink()
	r.pdf.SetLink(id, -1, -1)
	return id
}

func (r *renderer) heading(title string, level int) {
	p := r.pdf
	switch level {
	case 1:
		p.Ln(2)
		p.SetFont("Helvetica", "B", 16)
		setText(p, inkBody)
		p.MultiCell(contentW, 7.5, winAnsi(title), "", "L", false)
		y := p.GetY() + 0.5
		setDraw(p, brandFrom)
		p.SetLineWidth(0.6)
		p.Line(marginX, y, marginX+18, y)
		p.SetY(y + 4)
	case 2:
		p.Ln(3)
		p.SetFont("Helvetica", "B", 12)
		setText(p, inkBody)
		p.MultiCell(contentW, 6, winAnsi(title), "", "L", false)
		p.Ln(1)
	default:
		p.Ln(2)
		p.SetFont("Helvetica", "BI", 10.5)
		setText(p, inkBody)
		p.MultiCell(contentW, 5.4, winAnsi(title), "", "L", false)
	}
	p.SetFont("Helvetica", "", 10)
}

// ------------------------------------------------------------------ sources

func (r *renderer) drawSources() {
	p := r.pdf
	p.AddPage()
	r.heading("Sources", 1)
	r.toc = append(r.toc, tocEntry{title: "Sources", page: p.PageNo(), link: r.link()})

	p.SetFont("Helvetica", "", 8.5)
	setText(p, inkMuted)
	p.MultiCell(contentW, 4.4, winAnsi(
		"Every page cited in the body, numbered as the citations refer to it."), "", "L", false)
	p.Ln(2)

	for _, s := range r.doc.Sources {
		if p.GetY() > pageH-marginBot-16 {
			p.AddPage()
		}
		const numW = 11.0
		y := p.GetY()

		p.SetFont("Helvetica", "B", 9)
		setText(p, mix(brandFrom, brandTo, 0.5))
		p.SetXY(marginX, y)
		p.CellFormat(numW, 4.8, winAnsi(fmt.Sprintf("[%d]", s.N)), "", 0, "L", false, 0, "")

		title := strings.TrimSpace(s.Title)
		if title == "" {
			title = s.URL
		}
		p.SetFont("Helvetica", "", 9)
		setText(p, inkBody)
		p.SetXY(marginX+numW, y)
		p.MultiCell(contentW-numW, 4.6, winAnsi(truncate(title, 150)), "", "L", false)

		p.SetFont("Helvetica", "", 7.5)
		setText(p, inkMuted)
		p.SetX(marginX + numW)
		p.MultiCell(contentW-numW, 4, winAnsi(truncate(s.URL, 170)), "", "L", false)
		if s.Note != "" {
			p.SetX(marginX + numW)
			p.MultiCell(contentW-numW, 3.8, winAnsi(s.Note), "", "L", false)
		}
		p.Ln(1.6)
	}
	setText(p, inkBody)
}

// ----------------------------------------------------------------- contents

// fillContents writes the table of contents onto the page reserved for it
// before the body was laid out.
func (r *renderer) fillContents(page int) {
	p := r.pdf
	// The writer emits pages up to the current one — never past it. This
	// rewind therefore has to hand the pen back to the last page afterwards,
	// or everything after the contents page silently leaves the file.
	last := p.PageCount()
	p.SetPage(page)
	p.SetY(marginTop)

	r.heading("Contents", 1)
	p.SetFont("Helvetica", "", 10)

	for _, e := range r.toc {
		if p.GetY() > pageH-marginBot-8 {
			break // a contents list that does not fit is truncated, not spilled
		}
		title := winAnsi(truncate(e.title, 84))
		num := fmt.Sprintf("%d", e.page)
		setText(p, inkBody)
		p.CellFormat(contentW-14, 6.4, title, "", 0, "L", false, e.link, "")
		setText(p, inkMuted)
		p.CellFormat(14, 6.4, num, "", 1, "R", false, e.link, "")
	}
	setText(p, inkBody)
	p.SetPage(last)
}

// -------------------------------------------------------------------- utils

func (r *renderer) drawFields(fields []Field, colW float64) {
	p := r.pdf
	for i := 0; i < len(fields); i += 2 {
		y := p.GetY()
		r.drawField(fields[i], marginX, y, colW)
		if i+1 < len(fields) {
			r.drawField(fields[i+1], marginX+colW, y, colW)
		}
		p.SetY(y + 9)
	}
}

func (r *renderer) drawField(f Field, x, y, w float64) {
	p := r.pdf
	p.SetXY(x, y)
	p.SetFont("Helvetica", "", 7.5)
	setText(p, inkMuted)
	p.CellFormat(w, 3.6, winAnsi(strings.ToUpper(f.Label)), "", 0, "L", false, 0, "")
	p.SetXY(x, y+3.8)
	p.SetFont("Helvetica", "B", 10)
	setText(p, inkBody)
	p.CellFormat(w, 4.8, winAnsi(truncate(f.Value, 44)), "", 0, "L", false, 0, "")
}

func setText(p *fpdf.Fpdf, c rgb) { p.SetTextColor(c.r, c.g, c.b) }
func setDraw(p *fpdf.Fpdf, c rgb) { p.SetDrawColor(c.r, c.g, c.b) }

func nonEmpty(vals ...string) []string {
	var out []string
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			out = append(out, v)
		}
	}
	return out
}
