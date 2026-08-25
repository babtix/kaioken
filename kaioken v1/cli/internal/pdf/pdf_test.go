package pdf

import (
	"bytes"
	"fmt"
	"regexp"
	"strings"
	"testing"
	"time"
)

// pageObjectRe counts the page objects actually written to the file. The
// \b keeps "/Type /Pages" — the tree node — out of the count.
var pageObjectRe = regexp.MustCompile(`/Type /Page\b`)

// writtenPages reports how many page objects the output really carries, as
// opposed to how many the renderer thinks it laid out.
func writtenPages(b []byte) int {
	return len(pageObjectRe.FindAll(b, -1))
}

func sampleDoc(sections, sources int) *Document {
	body := strings.Repeat(
		"Utility-scale solar in Europe reached a levelized cost near EUR 87 per MWh [1], "+
			"while the comparable nuclear figure sat materially higher [2][3]. The spread "+
			"widens once **grid integration** is priced in, though the methodologies differ. ", 12)

	doc := &Document{
		Title:   "Is solar cheaper than nuclear in Europe?",
		Summary: "On a levelized basis solar is cheaper per MWh [1], but the comparison turns on system costs.",
		Meta: []Field{
			{Label: "Depth", Value: "x10 deep"},
			{Label: "Model", Value: "test-model"},
		},
		Signature: Signature{
			Tool: "kaioken", Version: "v0.4.2", Model: "test-model",
			Provider: "tavily+firecrawl", GeneratedAt: time.Now(),
			Stats: []Field{{Label: "pages scanned", Value: "317"}},
		},
	}
	for i := 0; i < sections; i++ {
		doc.Sections = append(doc.Sections, Section{
			Title: fmt.Sprintf("Section %d: cost structure and its drivers", i+1),
			Markdown: fmt.Sprintf("## Overview\n\n%s\n\n- A bulleted finding [%d]\n"+
				"- Another one, longer, so it wraps across the measure and exercises the list indent\n\n"+
				"### Detail\n\n%s\n", body, i+1, body),
		})
	}
	for i := 1; i <= sources; i++ {
		doc.Sources = append(doc.Sources, Source{
			N: i, Title: fmt.Sprintf("Source number %d on European energy costs", i),
			URL: fmt.Sprintf("https://example%d.org/reports/levelized-cost-of-electricity", i),
		})
	}
	return doc
}

func TestRenderProducesAValidMultiPagePDF(t *testing.T) {
	var buf bytes.Buffer
	pages, err := Render(sampleDoc(12, 40), &buf)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(buf.Bytes(), []byte("%PDF-")) {
		t.Errorf("output does not start with a PDF header: %q", buf.Bytes()[:min(16, buf.Len())])
	}
	if !bytes.Contains(buf.Bytes(), []byte("%%EOF")) {
		t.Error("output has no PDF trailer")
	}
	if pages < 12 {
		t.Errorf("rendered %d pages; a dossier of 12 sections must not come out shorter than 12", pages)
	}
	if got := writtenPages(buf.Bytes()); got != pages {
		t.Errorf("the file carries %d page objects but Render reported %d — pages were laid out and then dropped from the output", got, pages)
	}
}

// The contents page is filled by rewinding to a page reserved up front. The
// underlying writer only emits pages up to the current one, so if the rewind
// is not walked back to the last page, everything after the contents page —
// the entire body of a dossier — silently leaves the file. This is that bug,
// pinned: the written file must carry every page Render reports, and the
// body's text must be inside it.
func TestOutputCarriesEveryPageAfterTheContentsRewind(t *testing.T) {
	var buf bytes.Buffer
	pages, err := Render(sampleDoc(12, 40), &buf)
	if err != nil {
		t.Fatal(err)
	}
	if got := writtenPages(buf.Bytes()); got != pages {
		t.Fatalf("written pages = %d, reported = %d — the contents rewind dropped the body", got, pages)
	}
	// A three-page file was the signature of the bug: cover, contents and
	// nothing else. A real dossier is tens of pages.
	if pages < 12 {
		t.Errorf("only %d pages written; the body never reached the file", pages)
	}
}

// The reference register for a deep run carries hundreds of entries and has to
// paginate rather than overrun the last page.
func TestRenderPaginatesALargeSourceRegister(t *testing.T) {
	var buf bytes.Buffer
	few, err := Render(sampleDoc(2, 5), &buf)
	if err != nil {
		t.Fatal(err)
	}
	buf.Reset()
	many, err := Render(sampleDoc(2, 300), &buf)
	if err != nil {
		t.Fatal(err)
	}
	if many <= few+5 {
		t.Errorf("300 sources added only %d pages over 5 sources; the register is not paginating", many-few)
	}
}

// The fingerprint is the document's integrity claim: it has to change when the
// content does, and not otherwise.
func TestFingerprintTracksContent(t *testing.T) {
	a := sampleDoc(2, 3)
	b := sampleDoc(2, 3)
	if a.Fingerprint() != b.Fingerprint() {
		t.Error("identical documents produced different fingerprints")
	}
	b.Sections[0].Markdown += " One more sentence."
	if a.Fingerprint() == b.Fingerprint() {
		t.Error("a changed body did not change the fingerprint")
	}
	c := sampleDoc(2, 3)
	c.Sources[0].URL = "https://elsewhere.example"
	if a.Fingerprint() == c.Fingerprint() {
		t.Error("a changed source did not change the fingerprint")
	}
}

// Standard PDF fonts are single-byte, so anything outside Windows-1252 has to
// be transliterated rather than dropped: deleting the "~" from an approximate
// figure turns an estimate into a measurement.
func TestWinAnsiTransliteratesRatherThanDropping(t *testing.T) {
	// Results are Windows-1252 bytes, not UTF-8, so they are written as byte
	// slices with the codepoints named — that is what a standard PDF font
	// consumes, and it keeps the expectation legible.
	const (
		euro  = 0x80 // the euro sign
		times = 0xd7 // the multiplication sign
		plusm = 0xb1 // plus-minus
		rsquo = 0x92 // a right single quote
		emdsh = 0x97 // an em dash
	)
	cases := []struct {
		name string
		in   string
		want []byte
	}{
		// Transliterated: absent from cp1252, but dropping them would change
		// what the text says.
		{"approximation", "≈40 EUR", []byte("~40 EUR")},
		{"greek", "σ = 0.4", []byte("sigma = 0.4")},
		{"arrow", "cost → price", []byte("cost -> price")},
		{"minus sign", "−5 degrees", []byte("-5 degrees")},
		// Preserved: cp1252 has these, and flattening them would coarsen the
		// typography for no reason.
		{"euro", "€/MWh", append([]byte{euro}, "/MWh"...)},
		{"multiplication", "3 × 4", []byte{'3', ' ', times, ' ', '4'}},
		{"plus-minus", "±2", []byte{plusm, '2'}},
		{"punctuation", "it’s — so", []byte{'i', 't', rsquo, 's', ' ', emdsh, ' ', 's', 'o'}},
	}
	for _, c := range cases {
		if got := winAnsi(c.in); got != string(c.want) {
			t.Errorf("%s: winAnsi(%q) = % x, want % x", c.name, c.in, got, c.want)
		}
	}

	// Genuinely unrepresentable text leaves a visible marker, never nothing: a
	// reader has to be able to tell that something was there and go look it up.
	if got := winAnsi("漢字"); !strings.Contains(got, "?") {
		t.Errorf("winAnsi(%q) = %q; unrepresentable runes must leave a marker", "漢字", got)
	}
}

func TestRenderRejectsNilDocument(t *testing.T) {
	if _, err := Render(nil, &bytes.Buffer{}); err == nil {
		t.Fatal("expected an error for a nil document")
	}
}
