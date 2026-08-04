// Package reportpdf turns a finished research report into a signed PDF.
//
// It sits between the research engine and the PDF renderer so neither has to
// know about the other: research decides what the dossier says, pdf decides
// how a page is laid out, and this package is the one place that knows how a
// Report maps onto a Document. Every front end — CLI, TUI, daemon, MCP — goes
// through it, so a deep run produces the same artifact wherever it was started.
package reportpdf

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"kaioken/internal/pdf"
	"kaioken/internal/research"
)

// Meta is what the report itself cannot know: which tool, model and search
// providers produced it.
type Meta struct {
	Tool       string
	Version    string
	Model      string
	Provider   string
	Multiplier int
}

// Write renders rep as a PDF and returns the page count.
//
// Both shapes render. A deep run becomes the full dossier — chapters, source
// register, appendices. An ordinary run becomes the same document in miniature:
// the four sections it has, its sources, its caveats, the same cover and the
// same signature. The layout does not need a dossier to be worth having; what
// it needs is that an exported file be self-contained and traceable, which is
// as true of a two-page answer as of a thirty-page one.
func Write(rep *research.Report, meta Meta, w io.Writer) (int, error) {
	if rep == nil {
		return 0, fmt.Errorf("no report to render")
	}
	if rep.Deep == nil && strings.TrimSpace(rep.Markdown) == "" {
		return 0, fmt.Errorf("this report is empty; there is nothing to export")
	}
	return pdf.Render(document(rep, meta), w)
}

// WriteSaved renders a report loaded from the store. Provenance recorded at
// research time wins over anything the caller supplies: the signature has to
// name the model that did the work, not whichever one is configured when
// somebody presses Export weeks later.
func WriteSaved(saved *research.SavedReport, meta Meta, w io.Writer) (int, error) {
	if saved == nil {
		return 0, fmt.Errorf("no saved report to render")
	}
	return Write(fromSaved(saved), mergeProvenance(meta, saved.Provenance), w)
}

// WriteSavedFile renders a saved report to path.
func WriteSavedFile(saved *research.SavedReport, meta Meta, path string) (int, error) {
	if saved == nil {
		return 0, fmt.Errorf("no saved report to render")
	}
	return WriteFile(fromSaved(saved), mergeProvenance(meta, saved.Provenance), path)
}

// fromSaved reconstructs the in-memory report the renderer works from.
func fromSaved(s *research.SavedReport) *research.Report {
	rep := &research.Report{
		Question:   s.Question,
		Markdown:   s.Markdown,
		Rounds:     s.Rounds,
		Searched:   s.Searched,
		Fetched:    s.Fetched,
		Incomplete: s.Incomplete,
		Warnings:   s.Warnings,
		Deep:       s.Deep,
		// The signature's elapsed line should reflect the run, not the
		// export; the store persists the duration for exactly this.
		Elapsed: time.Duration(s.ElapsedMS) * time.Millisecond,
	}
	for _, src := range s.Sources {
		rep.Sources = append(rep.Sources, research.Source{N: src.N, URL: src.URL, Title: src.Title})
	}
	return rep
}

func mergeProvenance(m Meta, p research.Provenance) Meta {
	if p.Model != "" {
		m.Model = p.Model
	}
	if p.SearchProvider != "" {
		m.Provider = p.SearchProvider
	}
	if p.Multiplier > 0 {
		m.Multiplier = p.Multiplier
	}
	return m
}

// WriteFile renders rep to path, creating the directory if needed.
func WriteFile(rep *research.Report, meta Meta, path string) (int, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return 0, err
	}
	f, err := os.Create(path)
	if err != nil {
		return 0, err
	}
	pages, err := Write(rep, meta, f)
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		// A half-written PDF opens to an error dialog and looks like a bug in
		// the tool rather than a failed run.
		os.Remove(path)
		return 0, err
	}
	return pages, nil
}

func document(rep *research.Report, meta Meta) *pdf.Document {
	tool := meta.Tool
	if tool == "" {
		tool = "kaioken"
	}

	// A deep run carries its own sections and summary; an ordinary one is cut
	// from the Markdown it already has, which has the same "## " shape.
	sections := research.SplitSections(rep.Markdown)
	summary := shortAnswerOf(sections)
	reached := rep.Fetched
	depth := fmt.Sprintf("×%d research", meta.Multiplier)
	if rep.Deep != nil {
		sections = rep.Deep.Sections
		summary = rep.Deep.Summary
		reached = len(rep.Deep.Scanned)
		depth = fmt.Sprintf("×%d deep research", meta.Multiplier)
	}

	doc := &pdf.Document{
		Title:   rep.Question,
		Summary: summary,
		Meta: []pdf.Field{
			{Label: "Depth", Value: depth},
			{Label: "Pages read", Value: fmt.Sprintf("%d of %d reached", rep.Fetched, reached)},
			{Label: "Search queries", Value: fmt.Sprintf("%d over %d round%s",
				rep.Searched, rep.Rounds, plural(rep.Rounds))},
			{Label: "Sources cited", Value: fmt.Sprintf("%d", len(rep.Sources))},
			{Label: "Model", Value: orUnknown(meta.Model)},
			{Label: "Search providers", Value: orUnknown(meta.Provider)},
		},
		Signature: pdf.Signature{
			Tool: tool, Version: meta.Version, Model: meta.Model,
			Provider:    meta.Provider,
			GeneratedAt: time.Now(),
			Stats: []pdf.Field{
				{Label: "pages read", Value: fmt.Sprintf("%d", rep.Fetched)},
				{Label: "cited", Value: fmt.Sprintf("%d", len(rep.Sources))},
				{Label: "elapsed", Value: rep.Elapsed.Round(time.Second).String()},
			},
		},
	}

	for _, s := range sections {
		// The short answer is on the cover; repeating it as chapter one wastes
		// the reader's first page.
		if isShortAnswer(s.Title) {
			continue
		}
		if strings.HasPrefix(s.Title, "Appendix ") {
			doc.Appendices = append(doc.Appendices, pdf.Section{Title: s.Title, Markdown: s.Markdown})
			continue
		}
		doc.Sections = append(doc.Sections, pdf.Section{Title: s.Title, Markdown: s.Markdown})
	}

	var tier map[string]string
	if rep.Deep != nil {
		tier = tierNotes(rep.Deep.Scanned)
	}
	for _, s := range rep.Sources {
		doc.Sources = append(doc.Sources, pdf.Source{
			N: s.N, Title: s.Title, URL: s.URL, Note: tier[s.URL],
		})
	}

	// Warnings are part of the record, not a footnote to drop on the way to a
	// nicer-looking document.
	if len(rep.Warnings) > 0 || rep.Incomplete {
		var b strings.Builder
		if rep.Incomplete {
			b.WriteString("- Some subquestions were still thinly evidenced when the run ended. " +
				"The chapters drawing on them say so; treat those conclusions as provisional.\n")
		}
		for _, w := range rep.Warnings {
			b.WriteString("- " + w + "\n")
		}
		doc.Appendices = append(doc.Appendices, pdf.Section{
			Title:    "Appendix E — Caveats from this run",
			Markdown: b.String(),
		})
	}

	return doc
}

// tierNotes labels a source with its domain class, so a reader scanning the
// register can see at a glance whether the evidence leans on primary
// publishers or on the open web.
func tierNotes(scanned []research.ScannedPage) map[string]string {
	out := make(map[string]string, len(scanned))
	for _, p := range scanned {
		switch p.Tier {
		case 0:
			out[p.URL] = "official, academic or standards publisher"
		case 2:
			out[p.URL] = "user-generated or aggregated source — weigh accordingly"
		}
	}
	return out
}

// isShortAnswer recognises the opening section under either name the two report
// shapes give it.
func isShortAnswer(title string) bool {
	t := strings.ToLower(strings.TrimSpace(title))
	return t == "short answer" || t == "answer"
}

// shortAnswerOf pulls the opening section's prose out of an ordinary report, so
// the cover can lead with the conclusion the way the dossier does.
func shortAnswerOf(sections []research.DeepSection) string {
	for _, s := range sections {
		if isShortAnswer(s.Title) {
			if para, _, ok := strings.Cut(strings.TrimSpace(s.Markdown), "\n\n"); ok {
				return strings.TrimSpace(para)
			}
			return strings.TrimSpace(s.Markdown)
		}
	}
	return ""
}

func orUnknown(s string) string {
	if strings.TrimSpace(s) == "" {
		return "unknown"
	}
	return s
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}
