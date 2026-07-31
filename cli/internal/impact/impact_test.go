package impact

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"kaioken/internal/codemap"
)

// groundFixture builds an index plus evidence resembling a real gather run.
func groundFixture(t *testing.T) (*evidence, *codemap.Index) {
	t.Helper()
	_, res := fixtureRepo(t)
	idx := codemap.Build(res)
	ev := &evidence{
		symbols:    []symbolHit{{Name: "ParseArgs", Files: []string{"pkg/args.go"}}},
		modules:    []moduleHit{{ID: "core", Title: "Core", Scope: []string{"pkg"}, Hit: true}},
		hitModules: []string{"core"},
		skills: []skillHit{{Name: "parse-cli-flags", Sources: []string{"pkg/args.go"},
			Path: ".kaioken/skills/parse-cli-flags/SKILL.md"}},
		docs:  []string{".kaioken/wiki/Args.md"},
		tests: []string{"pkg/args_test.go"},
	}
	return ev, idx
}

func TestGroundKeepsVerifiedItems(t *testing.T) {
	ev, idx := groundFixture(t)
	raw := &rawReport{
		Risk:    "Low",
		Summary: "a contained rename",
		Items: []rawItem{
			{Kind: "symbol", Name: "ParseArgs", Reason: "the rename target", Risk: "low"},
			{Kind: "file", Name: "caller.go", Path: "pkg/caller.go", Reason: "calls it", Risk: "low"},
			{Kind: "module", Name: "core", Reason: "owns the files", Risk: "low"},
			{Kind: "doc", Path: ".kaioken/wiki/Args.md", Name: "Args.md", Reason: "cites the file", Risk: "medium"},
			{Kind: "skill", Name: "parse-cli-flags", Reason: "source file changes", Risk: "medium"},
			{Kind: "test", Name: "args_test.go", Path: "pkg/args_test.go", Reason: "exercises it", Risk: "low"},
		},
		Checklist: []string{"grep for the old name"},
	}
	rep := ground(raw, ev, idx)

	if rep.Risk != "low" {
		t.Errorf("risk not normalized: %q", rep.Risk)
	}
	if len(rep.Unverified) != 0 {
		t.Fatalf("all items are verifiable, got unverified: %+v", rep.Unverified)
	}
	if len(rep.Items) != 6 {
		t.Fatalf("want 6 verified items (no deterministic duplicates), got %d: %+v", len(rep.Items), rep.Items)
	}
	// The symbol item had no path; grounding must anchor it.
	for _, it := range rep.Items {
		if it.Kind == KindSymbol && it.Path != "pkg/args.go" {
			t.Errorf("symbol path not filled from the index: %+v", it)
		}
	}
}

func TestGroundDemotesHallucinations(t *testing.T) {
	ev, idx := groundFixture(t)
	raw := &rawReport{
		Risk: "banana", // unknown level normalizes to medium
		Items: []rawItem{
			{Kind: "symbol", Name: "DoesNotExist", Reason: "invented", Risk: "high"},
			{Kind: "file", Name: "ghost.go", Path: "pkg/ghost.go", Reason: "invented", Risk: "extreme"},
			{Kind: "module", Name: "no-such-module", Reason: "invented", Risk: "low"},
			{Kind: "skill", Name: "no-such-skill", Reason: "invented", Risk: "low"},
			{Kind: "doc", Path: "wiki/NotThere.md", Name: "NotThere.md", Reason: "invented", Risk: "low"},
		},
	}
	rep := ground(raw, ev, idx)

	if rep.Risk != "medium" {
		t.Errorf("unknown risk must normalize to medium, got %q", rep.Risk)
	}
	if len(rep.Unverified) != 5 {
		t.Fatalf("want 5 unverified claims, got %d: %+v", len(rep.Unverified), rep.Unverified)
	}
	for _, it := range rep.Unverified {
		if it.Risk != "low" && it.Risk != "medium" && it.Risk != "high" {
			t.Errorf("item risk not normalized: %+v", it)
		}
	}
}

func TestGroundAddsDeterministicFindings(t *testing.T) {
	ev, idx := groundFixture(t)
	// The model returned nothing usable at all.
	rep := ground(&rawReport{Risk: "high", Summary: "wide"}, ev, idx)

	wantKinds := map[Kind]bool{KindModule: false, KindSkill: false, KindDoc: false, KindTest: false}
	for _, it := range rep.Items {
		wantKinds[it.Kind] = true
	}
	for k, seen := range wantKinds {
		if !seen {
			t.Errorf("deterministic %s finding missing from report: %+v", k, rep.Items)
		}
	}
}

func TestReportMarkdownAndJSON(t *testing.T) {
	rep := &Report{
		Intent:      "rename ParseArgs to ParseCLIArgs",
		Model:       "test-model",
		GeneratedAt: time.Date(2026, 7, 31, 12, 0, 0, 0, time.UTC),
		Risk:        "low",
		Summary:     "contained",
		Items: []Item{
			{Kind: KindSymbol, Name: "ParseArgs", Path: "pkg/args.go", Reason: "target", Risk: "low"},
			{Kind: KindSkill, Name: "parse-cli-flags", Reason: "stale", Risk: "medium"},
		},
		Checklist:  []string{"grep for the old name"},
		Unverified: []Item{{Kind: KindFile, Name: "ghost.go", Path: "pkg/ghost.go", Reason: "invented", Risk: "low"}},
		Notes:      []string{"no generated wiki"},
	}

	md := rep.Markdown()
	for _, want := range []string{"# Impact report", "rename ParseArgs", "## Symbols",
		"## Skills", "## Checklist", "## Unverified claims", "## Notes", "pkg/args.go"} {
		if !strings.Contains(md, want) {
			t.Errorf("markdown missing %q:\n%s", want, md)
		}
	}

	js, err := rep.JSON()
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`"risk": "low"`, `"kind": "symbol"`, `"intent"`} {
		if !strings.Contains(js, want) {
			t.Errorf("json missing %q", want)
		}
	}
}

func TestSaveWritesProvenanceFooter(t *testing.T) {
	repo := t.TempDir()
	rep := &Report{
		Intent:      "rename ParseArgs",
		GeneratedAt: time.Date(2026, 7, 31, 12, 0, 0, 0, time.UTC),
		Risk:        "low",
		Items: []Item{
			{Kind: KindSymbol, Name: "ParseArgs", Path: "pkg/args.go", Risk: "low"},
			{Kind: KindTest, Name: "args_test.go", Path: "pkg/args_test.go", Risk: "low"},
		},
	}
	rel, err := rep.save(repo)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(rel, ".kaioken/impact/") || !strings.HasSuffix(rel, ".md") {
		t.Errorf("unexpected report path %q", rel)
	}
	raw, err := os.ReadFile(filepath.Join(repo, filepath.FromSlash(rel)))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "<!-- kaioken:files pkg/args.go,pkg/args_test.go -->") {
		t.Errorf("provenance footer missing:\n%s", raw)
	}
}
