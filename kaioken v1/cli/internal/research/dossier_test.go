package research

import (
	"context"
	"strings"
	"testing"

	"kaioken/internal/websearch"
)

func deepRun(t *testing.T, script *scriptedLLM, opts Options) *Report {
	t.Helper()
	rep, err := deepRunWith(t, script, opts)
	if err != nil {
		t.Fatal(err)
	}
	return rep
}

func deepRunWith(t *testing.T, script *scriptedLLM, opts Options) (*Report, error) {
	t.Helper()
	pinHome(t)
	srv := script.server(t)
	t.Cleanup(srv.Close)

	search := &fakeSearch{hits: []websearch.Result{
		{URL: "https://eia.gov/lcoe", Title: "Levelized cost", Snippet: "cost per MWh", Rank: 1},
		{URL: "https://b.example/dead", Title: "Dead link", Rank: 2},
	}}
	fetch := &fakeFetcher{bodies: map[string]string{
		"https://eia.gov/lcoe": strings.Repeat(
			"Utility-scale solar in Europe fell below EUR 40 per MWh during 2024. "+
				"Nuclear cost per MWh in Europe ranged far higher across the same period. "+
				"Provisional 2025 figures were published in March. ", 30),
	}}

	opts.Fetcher = fetch
	return Run(context.Background(), newTestClient(t, srv.URL), search,
		"Is solar cheaper than nuclear in Europe?", opts, Progress{})
}

// ×10 is a different product from ×3, not a bigger one. The dossier has to come
// back with chapters, a findings register, a search log and a coverage log.
func TestDeepRunProducesADossier(t *testing.T) {
	script := &scriptedLLM{}
	rep := deepRun(t, script, Options{Multiplier: 1, Deep: true, MaxRounds: 2, Concurrency: 4})

	if rep.Deep == nil {
		t.Fatal("a deep run produced no dossier")
	}
	if strings.TrimSpace(rep.Deep.Summary) == "" {
		t.Error("the dossier has no short answer for its cover")
	}

	chapters := rep.Deep.Chapters()
	if len(chapters) < 3 {
		t.Errorf("got %d chapters, want the outline's three plus the short answer", len(chapters))
	}
	// Every planned chapter must actually have been written.
	for _, want := range []string{"How the two costs are measured", "What drives the gap"} {
		if !hasSection(chapters, want) {
			t.Errorf("chapter %q is missing; got %v", want, titles(chapters))
		}
	}

	apps := rep.Deep.Appendices()
	for _, want := range []string{"Appendix A", "Appendix B", "Appendix C", "Appendix D"} {
		if !hasPrefixSection(apps, want) {
			t.Errorf("%s is missing; got %v", want, titles(apps))
		}
	}

	if len(rep.Deep.Queries) == 0 {
		t.Error("the search log is empty")
	}
	if len(rep.Deep.Findings) == 0 {
		t.Error("the findings register is empty")
	}
	// The coverage log records the dead link too: a page that was tried and
	// failed is part of an honest account of what was covered.
	if len(rep.Deep.Scanned) < 2 {
		t.Errorf("the coverage log has %d entries, want every page reached", len(rep.Deep.Scanned))
	}
	var unread int
	for _, p := range rep.Deep.Scanned {
		if !p.Read {
			unread++
		}
	}
	if unread == 0 {
		t.Error("the coverage log dropped the page that could not be read")
	}
}

// A failed chapter must not sink the dossier — the pipeline's own rule is
// that a shorter dossier beats a failed one, and at this depth a single
// provider refusal mid-write is an ordinary event, not a catastrophe.
func TestDossierSurvivesAFailedChapter(t *testing.T) {
	script := &scriptedLLM{failChapter: "What drives the gap"}
	rep, err := deepRunWith(t, script, Options{Multiplier: 1, Deep: true, MaxRounds: 1, Concurrency: 4})
	if err != nil {
		t.Fatalf("one failed chapter sank the whole dossier: %v", err)
	}
	// The findings register mentions every researched question under a
	// "### B<n>." heading, so the chapter's absence must be checked at
	// section level, not by substring.
	for _, sec := range SplitSections(rep.Markdown) {
		if sec.Title == "What drives the gap" {
			t.Error("the failed chapter has a section of its own in the dossier")
		}
	}
	if !strings.Contains(rep.Markdown, "## How the two costs are measured") {
		t.Error("the chapters that were written did not reach the dossier")
	}
}

// The default mode must be untouched by the deep one.
func TestShallowRunProducesNoDossier(t *testing.T) {
	script := &scriptedLLM{}
	rep := deepRun(t, script, Options{Multiplier: 3, MaxRounds: 1, Concurrency: 4})
	if rep.Deep != nil {
		t.Error("a ×3 run produced a dossier; the deep mode must be opt-in")
	}
	if !strings.Contains(rep.Markdown, "Short answer") {
		t.Errorf("the ordinary report shape was lost:\n%s", rep.Markdown)
	}
}

// Each chapter is written against evidence retrieved for that chapter, which is
// what stops the second half of a long document being written from memory of
// the first.
func TestDeepChaptersAreWrittenIndividually(t *testing.T) {
	script := &scriptedLLM{}
	deepRun(t, script, Options{Multiplier: 1, Deep: true, MaxRounds: 1, Concurrency: 4})

	if written := script.chaptersWritten(); len(written) < 3 {
		t.Errorf("only %d chapter calls were made for a 3-chapter outline: %v", len(written), written)
	}
	if !script.sawPromptContaining("<untrusted-source") {
		t.Error("chapters were written without fenced source passages")
	}
}

// The ×N dial has to reach the scan volume the deep mode promises.
func TestDeepPlanScansHundredsOfPages(t *testing.T) {
	if got := ScanCeiling(DeepMultiplier, false); got < 300 {
		t.Errorf("ScanCeiling(×%d) = %d, want at least 300 pages", DeepMultiplier, got)
	}
	// The everyday multipliers must not have grown with it.
	if got := ScanCeiling(3, false); got > 60 {
		t.Errorf("ScanCeiling(×3) = %d; the default depth should not have changed", got)
	}
	deep := planFor(DeepMultiplier, false)
	if !deep.deep {
		t.Error("×10 did not select the deep profile")
	}
	if shallow := planFor(9, false); shallow.deep {
		t.Error("×9 selected the deep profile")
	}
	if forced := planFor(1, true); !forced.deep {
		t.Error("-deep did not force the deep profile at ×1")
	}
}

func TestSplitSectionsRoundTrips(t *testing.T) {
	md := "## One\n\nBody one.\n\n## Two\n\nBody two.\n"
	got := SplitSections(md)
	if len(got) != 2 || got[0].Title != "One" || got[1].Title != "Two" {
		t.Fatalf("SplitSections = %+v", got)
	}
	if got[0].Markdown != "Body one." {
		t.Errorf("body = %q, want the section's own text only", got[0].Markdown)
	}
}

// A model that repeats the chapter title despite being told not to must not
// produce it twice in the rendered document.
func TestStripEchoedTitle(t *testing.T) {
	for _, prefix := range []string{"# ", "## ", "### "} {
		got := stripEchoedTitle(prefix+"What drives the gap\n\nBody.", "What drives the gap")
		if strings.Contains(got, "What drives the gap") {
			t.Errorf("%q prefix: title survived: %q", prefix, got)
		}
	}
	// A heading that is not the title stays.
	if got := stripEchoedTitle("## Basis\n\nBody.", "What drives the gap"); !strings.Contains(got, "Basis") {
		t.Errorf("an unrelated heading was stripped: %q", got)
	}
}

func hasSection(secs []DeepSection, title string) bool {
	for _, s := range secs {
		if s.Title == title {
			return true
		}
	}
	return false
}

func hasPrefixSection(secs []DeepSection, prefix string) bool {
	for _, s := range secs {
		if strings.HasPrefix(s.Title, prefix) {
			return true
		}
	}
	return false
}

func titles(secs []DeepSection) []string {
	out := make([]string, 0, len(secs))
	for _, s := range secs {
		out = append(out, s.Title)
	}
	return out
}
