package reportpdf

import (
	"bytes"
	"fmt"
	"regexp"
	"strings"
	"testing"

	"kaioken/internal/research"
)

// writtenPages counts the page objects the PDF actually carries, so a
// renderer that lays out pages and then drops them at output time cannot
// pass on the reported count alone.
var writtenPagesRe = regexp.MustCompile(`/Type /Page\b`)

func writtenPages(b []byte) int {
	return len(writtenPagesRe.FindAll(b, -1))
}

// A dossier's every chapter must reach the PDF: a 30-chapter document of
// real prose cannot fit on three pages, so a short page count means the
// renderer dropped content on the way.
func TestDeepReportRendersEveryChapter(t *testing.T) {
	var sections []research.DeepSection
	sections = append(sections, research.DeepSection{
		Title:    "Short answer",
		Markdown: strings.Repeat("The intervention halved the primary endpoint. ", 20),
	})
	for i := 1; i <= 30; i++ {
		sections = append(sections, research.DeepSection{
			Title:    fmt.Sprintf("Chapter %d of the evidence", i),
			Markdown: strings.Repeat(fmt.Sprintf("Finding %d stands on the cited trials. ", i), 220),
		})
	}
	sections = append(sections, research.DeepSection{
		Title:    "Appendix A — How this was researched",
		Markdown: strings.Repeat("The pipeline searched and read. ", 60),
	})

	rep := &research.Report{
		Question: "does the treatment work?",
		Deep:     &research.Deep{Summary: "It works.", Sections: sections},
		Fetched:  100,
		Searched: 40,
		Rounds:   4,
	}
	for i := 1; i <= 25; i++ {
		rep.Sources = append(rep.Sources, research.Source{N: i, URL: fmt.Sprintf("https://example.org/%d", i), Title: fmt.Sprintf("Source %d", i)})
	}
	rep.Markdown = "unused when Deep is present"

	var buf bytes.Buffer
	pages, err := Write(rep, Meta{Tool: "kaioken", Version: "test", Multiplier: 10}, &buf)
	if err != nil {
		t.Fatal(err)
	}
	// 30 chapters at ~1100 words each plus cover, contents, sources and
	// provenance: anything under twenty pages is a document that lost its
	// body.
	if pages < 20 {
		t.Errorf("dossier rendered %d pages; 30 full chapters cannot fit — content was dropped", pages)
	}
	if got := writtenPages(buf.Bytes()); got != pages {
		t.Errorf("the file carries %d page objects but %d were reported — the body never reached the output", got, pages)
	}
}

// The document mapping must hand every non-short-answer, non-appendix
// section to the body, and the appendices to the appendix block.
func TestDocumentMapsAllSections(t *testing.T) {
	rep := &research.Report{
		Question: "q",
		Deep: &research.Deep{
			Summary: "s",
			Sections: []research.DeepSection{
				{Title: "Short answer", Markdown: "x"},
				{Title: "One", Markdown: "x"},
				{Title: "Two", Markdown: "x"},
				{Title: "Appendix A — Method", Markdown: "x"},
			},
		},
	}
	doc := document(rep, Meta{})
	if len(doc.Sections) != 2 {
		t.Errorf("body sections = %d, want 2 (short answer skipped, appendix moved)", len(doc.Sections))
	}
	if len(doc.Appendices) != 1 {
		t.Errorf("appendices = %d, want 1", len(doc.Appendices))
	}
}

// A saved dossier re-rendered weeks later must come out whole: Load's shape
// is what Export feeds the renderer, so build it exactly as the store does.
func TestSavedDeepReportKeepsItsPages(t *testing.T) {
	saved := &research.SavedReport{
		Slug:     "saved",
		Question: "does the treatment work?",
		Deep: &research.Deep{
			Summary: "It works.",
			Sections: []research.DeepSection{
				{Title: "Short answer", Markdown: strings.Repeat("It works. ", 30)},
				{Title: "The trial base", Markdown: strings.Repeat("The trials agree on the endpoint. ", 250)},
				{Title: "Adverse events", Markdown: strings.Repeat("Profiles differ by class. ", 250)},
			},
		},
		Fetched: 10, Searched: 5, Rounds: 2,
	}
	var buf bytes.Buffer
	pages, err := WriteSaved(saved, Meta{Tool: "kaioken", Version: "test", Multiplier: 10}, &buf)
	if err != nil {
		t.Fatal(err)
	}
	// Cover + contents + two chapters + sources/provenance: five pages is
	// the honest minimum; three means a chapter never reached the page.
	if pages < 5 {
		t.Errorf("saved dossier rendered %d pages, want at least 5 — chapters were dropped", pages)
	}
	if got := writtenPages(buf.Bytes()); got != pages {
		t.Errorf("the file carries %d page objects but %d were reported", got, pages)
	}
}

// The duration a saved run took belongs on its export's signature: a PDF
// printed weeks after the research must not claim zero seconds.
func TestSavedElapsedReachesTheSignature(t *testing.T) {
	saved := &research.SavedReport{
		Slug: "elapsed", Question: "q",
		Markdown:  "## Short answer\n\nIt works.",
		ElapsedMS: 512000,
	}
	rep := fromSaved(saved)
	if rep.Elapsed.Milliseconds() != 512000 {
		t.Errorf("elapsed = %v, want the persisted 8m32s", rep.Elapsed)
	}
}
