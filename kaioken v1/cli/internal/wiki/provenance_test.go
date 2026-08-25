package wiki

import (
	"strings"
	"testing"

	"kaioken/internal/gitx"
	"kaioken/internal/scan"
)

func TestStampAndParseProvenance(t *testing.T) {
	doc := "# Chapter\n\nSome prose.\n"
	stamped := stampProvenance(doc, []string{"a/b.go", "c.go"})

	if !strings.Contains(stamped, "# Chapter") {
		t.Error("stamping lost the document body")
	}
	got := parseProvenance(stamped)
	if len(got) != 2 || got[0] != "a/b.go" || got[1] != "c.go" {
		t.Errorf("parseProvenance = %v, want [a/b.go c.go]", got)
	}
}

// Re-stamping must replace the old footer, not stack a second one.
func TestStampProvenanceReplaces(t *testing.T) {
	doc := stampProvenance("# Doc\n", []string{"old.go"})
	doc = stampProvenance(doc, []string{"new.go"})

	if n := strings.Count(doc, provenancePrefix); n != 1 {
		t.Errorf("found %d provenance footers, want 1:\n%s", n, doc)
	}
	if got := parseProvenance(doc); len(got) != 1 || got[0] != "new.go" {
		t.Errorf("parseProvenance = %v, want [new.go]", got)
	}
}

func TestStampProvenanceDedupes(t *testing.T) {
	doc := stampProvenance("# Doc\n", []string{"a.go", "a.go", "b.go", ""})
	got := parseProvenance(doc)
	if len(got) != 2 {
		t.Errorf("parseProvenance = %v, want 2 unique paths", got)
	}
}

func TestParseProvenanceAbsentIsNil(t *testing.T) {
	if got := parseProvenance("# Just a document\n"); got != nil {
		t.Errorf("expected nil for an unstamped document, got %v", got)
	}
}

func TestLivePathsDropsDeleted(t *testing.T) {
	res := &scan.Result{Files: []scan.File{{Path: "kept.go"}, {Path: "also.go"}}}
	got := livePaths(res, []string{"kept.go", "deleted.go", "also.go"})
	if len(got) != 2 || got[0] != "kept.go" || got[1] != "also.go" {
		t.Errorf("livePaths = %v, want the two surviving files", got)
	}
}

// Provenance is the primary matching signal for subsection documents.
func TestDocHitsUsesProvenance(t *testing.T) {
	sec := Section{Title: "Core", Files: []string{"internal/core"}}
	// The prose never mentions the file; only the footer does.
	body := stampProvenance("# Sub\n\nNo paths in this prose.\n", []string{"internal/core/engine.go"})

	changes := []gitx.Change{{Status: "M", Path: "internal/core/engine.go"}}
	hits := docHits(body, sec, changes, false)
	if len(hits) != 1 || hits[0] != "internal/core/engine.go" {
		t.Errorf("docHits = %v, want the provenance match", hits)
	}
}

// A subsection whose provenance does not cover the change must be left alone.
func TestDocHitsSkipsUnrelatedSubsection(t *testing.T) {
	sec := Section{Title: "Core", Files: []string{"internal/core"}}
	body := stampProvenance("# Sub\n", []string{"internal/core/other.go"})

	changes := []gitx.Change{{Status: "M", Path: "internal/core/engine.go"}}
	if hits := docHits(body, sec, changes, false); len(hits) != 0 {
		t.Errorf("unrelated subsection was flagged: %v", hits)
	}
}

// A brand-new file exists in no document's provenance, so the section's MAIN
// document must still claim it via the plan's file scope — otherwise new code
// would never get documented.
func TestDocHitsMainClaimsNewFileViaScope(t *testing.T) {
	sec := Section{Title: "Core", Files: []string{"internal/core"}}
	body := stampProvenance("# Core\n", []string{"internal/core/engine.go"})

	changes := []gitx.Change{{Status: "?", Path: "internal/core/brand_new.go"}}

	if hits := docHits(body, sec, changes, true); len(hits) != 1 {
		t.Errorf("main doc should claim a new in-scope file, got %v", hits)
	}
	if hits := docHits(body, sec, changes, false); len(hits) != 0 {
		t.Errorf("a subsection should not claim a file it never covered, got %v", hits)
	}
}

// Documents generated before stamping existed still match by citation.
func TestDocHitsLegacyFallsBackToProse(t *testing.T) {
	sec := Section{Title: "Core", Files: []string{"internal/core"}}
	legacy := "# Sub\n\n## Referenced Files\n- internal/core/engine.go\n"

	changes := []gitx.Change{{Status: "M", Path: "internal/core/engine.go"}}
	hits := docHits(legacy, sec, changes, false)
	if len(hits) != 1 {
		t.Errorf("legacy prose scan failed: %v", hits)
	}
}

// A stamped document must NOT also match by prose — that was the unreliable
// path the footer exists to replace.
func TestDocHitsStampedIgnoresProse(t *testing.T) {
	sec := Section{Title: "Core", Files: []string{"internal/core"}}
	// Mentions engine.go in prose, but its provenance says otherwise.
	body := stampProvenance("# Sub\n\nSee internal/core/engine.go for details.\n",
		[]string{"internal/core/other.go"})

	changes := []gitx.Change{{Status: "M", Path: "internal/core/engine.go"}}
	if hits := docHits(body, sec, changes, false); len(hits) != 0 {
		t.Errorf("a passing prose mention should not trigger a rewrite: %v", hits)
	}
}
