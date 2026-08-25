package reportpdf

import (
	"bytes"
	"fmt"
	"strings"
	"testing"
	"time"

	"kaioken/internal/research"
)

// chapter builds a chapter of roughly n words, in the shape a written one has:
// subheadings, cited prose, a list.
func chapter(title string, words int) research.DeepSection {
	sentence := "The levelized cost of utility-scale solar in Europe fell to about " +
		"EUR 87 per MWh across the period, with most observations between EUR 43 and " +
		"EUR 168 [1], while the comparable nuclear figure sat materially higher [2]. "
	var b strings.Builder
	b.WriteString("### What the evidence shows\n\n")
	for len(strings.Fields(b.String())) < words*2/3 {
		b.WriteString(sentence)
	}
	b.WriteString("\n\n### Qualifications\n\n- A bulleted qualification [3]\n" +
		"- A second one, long enough to wrap across the measure and exercise the list indent [4]\n\n")
	for len(strings.Fields(b.String())) < words {
		b.WriteString(sentence)
	}
	return research.DeepSection{Title: title, Markdown: b.String()}
}

func report(chapters, chapterWords, cited, scanned int) *research.Report {
	rep := &research.Report{
		Question: "Is solar cheaper than nuclear in Europe?",
		Rounds:   8, Searched: 214, Fetched: scanned * 2 / 3,
		Elapsed: 11 * time.Minute,
		Deep: &research.Deep{
			Summary: "On a levelized basis solar is the cheaper of the two per MWh [1], " +
				"though the gap narrows once system costs are priced in [2].",
		},
	}
	for i := 0; i < chapters; i++ {
		rep.Deep.Sections = append(rep.Deep.Sections,
			chapter(fmt.Sprintf("Chapter %d: what drives the cost gap", i+1), chapterWords))
	}
	// The four appendices a real run always produces.
	rep.Deep.Sections = append(rep.Deep.Sections,
		research.DeepSection{Title: "Appendix A — How this was researched", Markdown: strings.Repeat("Method prose. ", 120)},
		research.DeepSection{Title: "Appendix B — Findings register", Markdown: strings.Repeat("### A subquestion\n\nIts answer.\n\n- Confidence: medium\n\n", 12)},
	)
	var log strings.Builder
	for i := 1; i <= 40; i++ {
		fmt.Fprintf(&log, "%d. european nuclear levelized cost %d\n", i, 2020+i%6)
	}
	rep.Deep.Sections = append(rep.Deep.Sections,
		research.DeepSection{Title: "Appendix C — Search log", Markdown: log.String()})

	var scan strings.Builder
	for i := 1; i <= scanned; i++ {
		fmt.Fprintf(&scan, "%d. Source %d on European energy costs — https://example%d.org/reports/lcoe _(read, not cited)_\n", i, i, i)
		rep.Deep.Scanned = append(rep.Deep.Scanned, research.ScannedPage{
			N: i, URL: fmt.Sprintf("https://example%d.org/reports/lcoe", i), Read: true,
		})
	}
	rep.Deep.Sections = append(rep.Deep.Sections,
		research.DeepSection{Title: "Appendix D — Pages reached", Markdown: scan.String()})

	for i := 1; i <= cited; i++ {
		rep.Sources = append(rep.Sources, research.Source{
			N: i, Title: fmt.Sprintf("Levelized cost of electricity, edition %d", i),
			URL: fmt.Sprintf("https://example%d.org/reports/lcoe", i),
		})
	}
	return rep
}

func meta() Meta {
	return Meta{Tool: "kaioken", Version: "v0.4.2", Model: "test-model",
		Provider: "tavily+firecrawl", Multiplier: 10}
}

// The deep mode's promise: a dossier, not a page. A ×10 run reads hundreds of
// pages, and the document has to be substantial enough to be worth the cost.
func TestDeepReportRendersASubstantialDossier(t *testing.T) {
	var buf bytes.Buffer
	pages, err := Write(report(11, 850, 104, 317), meta(), &buf)
	if err != nil {
		t.Fatal(err)
	}
	if pages < 12 {
		t.Errorf("a full deep run rendered %d pages; the floor is 12", pages)
	}
	t.Logf("full deep run: %d pages", pages)
	if !bytes.HasPrefix(buf.Bytes(), []byte("%PDF-")) {
		t.Error("output is not a PDF")
	}
}

// The floor has to survive a run that found much less than it hoped: eight
// short chapters and a handful of sources is the thin case, and it still has to
// clear twelve pages.
func TestThinDeepReportStillClearsTheFloor(t *testing.T) {
	var buf bytes.Buffer
	pages, err := Write(report(8, 700, 18, 40), meta(), &buf)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("thin deep run: %d pages", pages)
	if pages < 12 {
		t.Errorf("a thin deep run rendered %d pages; the floor is 12", pages)
	}
}

// An ordinary run has no dossier, but Export still has to produce a PDF for it:
// that is the button the desktop offers on every report, deep or not.
func TestShallowReportRenders(t *testing.T) {
	rep := &research.Report{
		Question: "Is solar cheaper than nuclear in Europe?",
		Markdown: "## Short answer\n\nOn a levelized basis, yes [1].\n\n" +
			"## What the evidence shows\n\nSolar reached about EUR 87/MWh [1], " +
			"against a higher range for nuclear [2].\n\n" +
			"## Limitations\n\nSystem costs are not priced in.",
		Sources: []research.Source{
			{N: 1, URL: "https://energy.ec.europa.eu/lcoe", Title: "Levelized cost of electricity"},
			{N: 2, URL: "https://world-nuclear.org/economics", Title: "Economics of nuclear power"},
		},
		Rounds: 2, Searched: 9, Fetched: 12,
	}
	var buf bytes.Buffer
	pages, err := Write(rep, meta(), &buf)
	if err != nil {
		t.Fatalf("an ordinary report must still export: %v", err)
	}
	if pages < 1 {
		t.Errorf("rendered %d pages", pages)
	}
	if !bytes.HasPrefix(buf.Bytes(), []byte("%PDF-")) {
		t.Error("output is not a PDF")
	}

	// The cover leads with the answer, and the short answer is not repeated as
	// a chapter behind it.
	doc := document(rep, meta())
	if !strings.Contains(doc.Summary, "levelized basis") {
		t.Errorf("the cover did not pick up the short answer: %q", doc.Summary)
	}
	for _, s := range doc.Sections {
		if strings.EqualFold(s.Title, "Short answer") {
			t.Error("the short answer was rendered as a chapter as well as on the cover")
		}
	}
	if len(doc.Sections) != 2 {
		t.Errorf("got %d chapters, want the two beyond the short answer: %v", len(doc.Sections), doc.Sections)
	}
	if len(doc.Sources) != 2 {
		t.Errorf("got %d sources in the register, want 2", len(doc.Sources))
	}
}

func TestEmptyReportIsRefused(t *testing.T) {
	if _, err := Write(&research.Report{Question: "Anything?"}, meta(), &bytes.Buffer{}); err == nil {
		t.Fatal("expected a refusal for a report with no content at all")
	}
	if _, err := Write(nil, meta(), &bytes.Buffer{}); err == nil {
		t.Fatal("expected an error for a nil report")
	}
	if _, err := WriteSaved(nil, meta(), &bytes.Buffer{}); err == nil {
		t.Fatal("expected an error for a nil saved report")
	}
}

// The signature has to name the model that did the research, not whichever one
// is configured when somebody presses Export weeks later.
func TestSavedProvenanceWinsOverCallerMeta(t *testing.T) {
	saved := &research.SavedReport{
		Slug: "q", Question: "Is solar cheaper?",
		Markdown: "## Short answer\n\nYes [1].",
		Sources:  []research.SavedSource{{N: 1, URL: "https://a.example", Title: "A"}},
		Provenance: research.Provenance{
			Model: "the-model-that-ran-it", SearchProvider: "tavily", Multiplier: 10,
		},
	}
	got := mergeProvenance(Meta{Tool: "kaioken", Model: "whatever-is-configured-now"}, saved.Provenance)
	if got.Model != "the-model-that-ran-it" {
		t.Errorf("Model = %q, want the recorded one", got.Model)
	}
	if got.Provider != "tavily" || got.Multiplier != 10 {
		t.Errorf("provenance not carried through: %+v", got)
	}

	var buf bytes.Buffer
	if _, err := WriteSaved(saved, Meta{Tool: "kaioken"}, &buf); err != nil {
		t.Fatalf("a saved ordinary report must export: %v", err)
	}
}

// Warnings and an incomplete flag are part of the record, not a footnote to
// drop on the way to a nicer-looking document.
func TestCaveatsReachTheDocument(t *testing.T) {
	rep := report(8, 300, 10, 20)
	rep.Incomplete = true
	rep.Warnings = []string{"stopped after 20m0s to stay inside the time budget"}

	doc := document(rep, meta())
	var found bool
	for _, a := range doc.Appendices {
		if strings.HasPrefix(a.Title, "Appendix E") {
			found = true
			if !strings.Contains(a.Markdown, "time budget") {
				t.Errorf("the run's warning did not reach the caveats appendix: %q", a.Markdown)
			}
			if !strings.Contains(a.Markdown, "provisional") {
				t.Errorf("the incomplete flag did not reach the caveats appendix: %q", a.Markdown)
			}
		}
	}
	if !found {
		t.Error("a run with warnings produced no caveats appendix")
	}
}

// The cover already carries the short answer; repeating it as chapter one wastes
// the reader's first page.
func TestShortAnswerIsNotRepeatedAsAChapter(t *testing.T) {
	rep := report(3, 200, 4, 8)
	rep.Deep.Sections = append([]research.DeepSection{
		{Title: "Short answer", Markdown: "Solar is cheaper [1]."},
	}, rep.Deep.Sections...)

	doc := document(rep, meta())
	for _, s := range doc.Sections {
		if strings.EqualFold(s.Title, "Short answer") {
			t.Error("the short answer was rendered as a chapter as well as on the cover")
		}
	}
	if !strings.Contains(doc.Summary, "cheaper") {
		t.Errorf("the cover lost its summary: %q", doc.Summary)
	}
}
