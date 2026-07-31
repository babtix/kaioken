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
// It refuses a report that has no dossier. A four-section answer laid out on
// A4 is a worse artifact than the Markdown it came from — the PDF exists for
// the deep mode, where the document is the point.
func Write(rep *research.Report, meta Meta, w io.Writer) (int, error) {
	if rep == nil {
		return 0, fmt.Errorf("no report to render")
	}
	if rep.Deep == nil {
		return 0, fmt.Errorf("this report has no dossier; PDF output is produced by deep research (×%d or -deep)",
			research.DeepMultiplier)
	}
	return pdf.Render(document(rep, meta), w)
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

	doc := &pdf.Document{
		Title:   rep.Question,
		Summary: rep.Deep.Summary,
		Meta: []pdf.Field{
			{Label: "Depth", Value: fmt.Sprintf("×%d deep research", meta.Multiplier)},
			{Label: "Pages read", Value: fmt.Sprintf("%d of %d reached", rep.Fetched, len(rep.Deep.Scanned))},
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

	for _, s := range rep.Deep.Chapters() {
		// The short answer is on the cover; repeating it as chapter one wastes
		// the reader's first page.
		if strings.EqualFold(strings.TrimSpace(s.Title), "Short answer") {
			continue
		}
		doc.Sections = append(doc.Sections, pdf.Section{Title: s.Title, Markdown: s.Markdown})
	}
	for _, s := range rep.Deep.Appendices() {
		doc.Appendices = append(doc.Appendices, pdf.Section{Title: s.Title, Markdown: s.Markdown})
	}

	tier := tierNotes(rep.Deep.Scanned)
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
