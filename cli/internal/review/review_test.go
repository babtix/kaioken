package review

import (
	"encoding/json"
	"strings"
	"testing"

	"kaioken/internal/gitx"
)

func TestVerdictReflectsWorstSeverity(t *testing.T) {
	for _, tc := range []struct {
		name     string
		findings []Finding
		want     string
	}{
		{"clean", nil, "no findings"},
		{"notes only", []Finding{{Severity: SeverityNote}}, "nothing blocking"},
		{"concerns", []Finding{{Severity: SeverityNote}, {Severity: SeverityConcern}}, "concern(s)"},
		{"blockers win", []Finding{{Severity: SeverityConcern}, {Severity: SeverityBlocker}}, "do not merge"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := verdict(tc.findings)
			if !strings.Contains(got, tc.want) {
				t.Errorf("verdict = %q, want it to contain %q", got, tc.want)
			}
		})
	}
}

func TestFilterSeverityDropsBelowThreshold(t *testing.T) {
	in := []Finding{
		{Severity: SeverityBlocker, Title: "b"},
		{Severity: SeverityConcern, Title: "c"},
		{Severity: SeverityNote, Title: "n"},
	}
	got := filterSeverity(in, SeverityConcern)
	if len(got) != 2 {
		t.Fatalf("got %d findings, want 2", len(got))
	}
	for _, f := range got {
		if f.Severity == SeverityNote {
			t.Error("note survived a concern threshold")
		}
	}
	if len(filterSeverity(in, "")) != 3 {
		t.Error("empty threshold dropped findings")
	}
}

func TestHasBlockersDrivesExitCode(t *testing.T) {
	clean := &Report{Findings: []Finding{{Severity: SeverityConcern}}}
	if clean.HasBlockers() {
		t.Error("concerns must not fail a build")
	}
	blocked := &Report{Findings: []Finding{{Severity: SeverityBlocker}}}
	if !blocked.HasBlockers() {
		t.Error("blocker did not register")
	}
}

func TestFilterChangesSkipsDeletionsAndRespectsOnly(t *testing.T) {
	changes := []gitx.Change{
		{Status: "M", Path: "cli/internal/llm/client.go"},
		{Status: "D", Path: "cli/internal/old/gone.go"},
		{Status: "A", Path: "desktop/src/App.tsx"},
	}
	got := filterChanges(changes, []string{"cli/internal"})
	if len(got) != 1 {
		t.Fatalf("got %d changes, want 1: %+v", len(got), got)
	}
	if got[0].Path != "cli/internal/llm/client.go" {
		t.Errorf("kept the wrong path: %s", got[0].Path)
	}

	all := filterChanges(changes, nil)
	if len(all) != 2 {
		t.Errorf("unfiltered got %d, want 2 (the deletion must be dropped)", len(all))
	}
}

func TestContextQueriesUseDirsAndStems(t *testing.T) {
	got := contextQueries([]string{"cli/internal/llm/openrouter.go", "desktop/src/routes/Chat.tsx"})
	joined := strings.Join(got, "|")
	for _, want := range []string{"cli internal llm", "openrouter", "desktop src routes", "Chat"} {
		if !strings.Contains(joined, want) {
			t.Errorf("queries %v missing %q", got, want)
		}
	}
}

func TestMarkdownGroupsBySeverity(t *testing.T) {
	r := &Report{
		Base:  "main",
		Head:  "abcdef1234",
		Files: []string{"a.go"},
		Findings: []Finding{
			{File: "a.go", Line: 12, Severity: SeverityBlocker, Title: "nil deref",
				Detail: "a nil cfg reaches Load", Grounding: "wiki: config/loading.md"},
			{File: "a.go", Severity: SeverityNote, Title: "naming"},
		},
		Verdict: "1 blocker(s) — do not merge as is",
		Context: []string{"wiki: config/loading.md"},
	}
	md := r.Markdown()

	if !strings.Contains(md, "BLOCKER") || !strings.Contains(md, "NOTE") {
		t.Error("severity groups missing")
	}
	if !strings.Contains(md, "a.go:12") {
		t.Error("line number not rendered")
	}
	if !strings.Contains(md, "Grounded in: wiki: config/loading.md") {
		t.Error("grounding not rendered — that citation is the point of the reviewer")
	}
	if strings.Index(md, "BLOCKER") > strings.Index(md, "NOTE") {
		t.Error("notes rendered before blockers")
	}
}

func TestSARIFIsWellFormed(t *testing.T) {
	r := &Report{
		Findings: []Finding{
			{File: "cli/main.go", Line: 3, Severity: SeverityBlocker, Title: "boom", Detail: "it explodes"},
			{File: "cli/other.go", Severity: SeverityNote, Title: "meh", Detail: "minor"},
		},
	}
	out, err := r.SARIF()
	if err != nil {
		t.Fatal(err)
	}

	var log struct {
		Version string `json:"version"`
		Runs    []struct {
			Tool struct {
				Driver struct {
					Name  string `json:"name"`
					Rules []struct {
						ID string `json:"id"`
					} `json:"rules"`
				} `json:"driver"`
			} `json:"tool"`
			Results []struct {
				RuleID    string `json:"ruleId"`
				Level     string `json:"level"`
				Locations []struct {
					PhysicalLocation struct {
						ArtifactLocation struct {
							URI string `json:"uri"`
						} `json:"artifactLocation"`
						Region struct {
							StartLine int `json:"startLine"`
						} `json:"region"`
					} `json:"physicalLocation"`
				} `json:"locations"`
			} `json:"results"`
		} `json:"runs"`
	}
	if err := json.Unmarshal([]byte(out), &log); err != nil {
		t.Fatalf("SARIF is not valid JSON: %v", err)
	}
	if log.Version != "2.1.0" {
		t.Errorf("version = %q", log.Version)
	}
	if len(log.Runs) != 1 || len(log.Runs[0].Results) != 2 {
		t.Fatalf("expected 1 run with 2 results, got %+v", log.Runs)
	}
	if len(log.Runs[0].Tool.Driver.Rules) != 2 {
		t.Errorf("expected one rule per distinct severity, got %d", len(log.Runs[0].Tool.Driver.Rules))
	}

	res := log.Runs[0].Results
	if res[0].Level != "error" {
		t.Errorf("blocker level = %q, want error", res[0].Level)
	}
	if res[1].Level != "note" {
		t.Errorf("note level = %q, want note", res[1].Level)
	}
	// A finding with no line still needs a valid region: SARIF consumers
	// reject startLine 0, which would silently drop the annotation.
	if got := res[1].Locations[0].PhysicalLocation.Region.StartLine; got != 1 {
		t.Errorf("lineless finding got startLine %d, want 1", got)
	}
	if res[0].Locations[0].PhysicalLocation.ArtifactLocation.URI != "cli/main.go" {
		t.Error("artifact URI lost")
	}
}

func TestSARIFConcernIsWarningNotError(t *testing.T) {
	// A concern is explicitly the tier a maintainer may accept; emitting it as
	// an error would make CI fail on it and erase the distinction.
	if got := sarifLevel(SeverityConcern); got != "warning" {
		t.Errorf("concern maps to %q, want warning", got)
	}
}
