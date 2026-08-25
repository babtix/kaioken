package impact

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/codemap"
	"kaioken/internal/plan"
	"kaioken/internal/scan"
	"kaioken/internal/skills"
)

// fixtureRepo writes a tiny repository with one declared symbol, a caller,
// a sibling test, a module plan, a skill and a wiki document with provenance.
func fixtureRepo(t *testing.T) (string, *scan.Result) {
	t.Helper()
	repo := t.TempDir()
	files := map[string]string{
		"pkg/args.go": "package pkg\n\n// ParseArgs parses the command line.\nfunc ParseArgs(s string) string { return s }\n",
		"pkg/caller.go": "package pkg\n\nfunc use() string {\n\treturn ParseArgs(\"x\")\n}\n",
		"pkg/args_test.go": "package pkg\n\nimport \"testing\"\n\nfunc TestParseArgs(t *testing.T) {\n\t_ = ParseArgs(\"y\")\n}\n",
		"other/notes.go": "package other\n\nfunc unrelated() {}\n",
	}
	res := &scan.Result{Root: repo}
	for path, content := range files {
		full := filepath.Join(repo, filepath.FromSlash(path))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
		res.Files = append(res.Files, scan.File{
			Path:  path,
			Size:  int64(len(content)),
			Lines: strings.Count(content, "\n") + 1,
			Ext:   filepath.Ext(path),
		})
	}
	return repo, res
}

func TestMatchSymbols(t *testing.T) {
	_, res := fixtureRepo(t)
	idx := codemap.Build(res)

	hits := matchSymbols(idx, "rename `ParseArgs` to ParseCLIArgs")
	if len(hits) != 1 {
		t.Fatalf("want 1 symbol hit, got %d: %+v", len(hits), hits)
	}
	if hits[0].Name != "ParseArgs" {
		t.Errorf("want ParseArgs, got %q", hits[0].Name)
	}
	if len(hits[0].Files) != 1 || hits[0].Files[0] != "pkg/args.go" {
		t.Errorf("want declaring file pkg/args.go, got %v", hits[0].Files)
	}
	if len(hits[0].Sigs) == 0 || !strings.Contains(hits[0].Sigs[0], "pkg/args.go:") {
		t.Errorf("want a path:line signature anchor, got %v", hits[0].Sigs)
	}

	if got := matchSymbols(idx, "change nothing that exists"); len(got) != 0 {
		t.Errorf("unmatched intent must yield no hits, got %v", got)
	}
}

func TestFindReferences(t *testing.T) {
	_, res := fixtureRepo(t)
	seeds := map[string]bool{"pkg/args.go": true}

	refs := findReferences(res, []string{"ParseArgs"}, seeds)
	var paths []string
	for _, r := range refs {
		paths = append(paths, r.Path)
	}
	want := map[string]bool{"pkg/caller.go": true, "pkg/args_test.go": true}
	if len(refs) != 2 || !want[paths[0]] || !want[paths[1]] {
		t.Fatalf("want caller.go and args_test.go, got %v", paths)
	}
	for _, r := range refs {
		if len(r.Lines) == 0 || !strings.Contains(r.Lines[0], "ParseArgs") {
			t.Errorf("%s: want matching lines, got %v", r.Path, r.Lines)
		}
	}
}

func TestScopeContains(t *testing.T) {
	cases := []struct {
		scope []string
		file  string
		want  bool
	}{
		{[]string{"pkg"}, "pkg/args.go", true},
		{[]string{"pkg/args.go"}, "pkg/args.go", true},
		{[]string{"pkg"}, "pkgx/args.go", false},
		{[]string{""}, "pkg/args.go", false},
		{[]string{"other"}, "pkg/args.go", false},
	}
	for _, c := range cases {
		if got := scopeContains(c.scope, c.file); got != c.want {
			t.Errorf("scopeContains(%v, %q) = %v, want %v", c.scope, c.file, got, c.want)
		}
	}
}

func TestMatchModules(t *testing.T) {
	repo, _ := fixtureRepo(t)
	p := &plan.Plan{Version: 1, Modules: []plan.Module{
		{ID: "core", Title: "Core", Scope: []string{"pkg"}},
		{ID: "misc", Title: "Misc", Scope: []string{"other"}},
	}}
	if err := p.Save(repo); err != nil {
		t.Fatal(err)
	}

	var notes []string
	mods, hit := matchModules(repo, []string{"pkg/args.go"}, &notes)
	if len(mods) != 2 {
		t.Fatalf("want 2 modules, got %d", len(mods))
	}
	if len(hit) != 1 || hit[0] != "core" {
		t.Errorf("want hit [core], got %v", hit)
	}
	if len(notes) != 0 {
		t.Errorf("plan exists — want no notes, got %v", notes)
	}
}

func TestMatchModulesMissingPlanDegrades(t *testing.T) {
	repo := t.TempDir()
	var notes []string
	mods, hit := matchModules(repo, []string{"pkg/args.go"}, &notes)
	if mods != nil || hit != nil {
		t.Errorf("want nil results without a plan, got %v %v", mods, hit)
	}
	if len(notes) != 1 {
		t.Errorf("want one degradation note, got %v", notes)
	}
}

func TestMatchSkills(t *testing.T) {
	repo, _ := fixtureRepo(t)
	s := &skills.Skill{Name: "parse-cli-flags", Description: "how to add a flag",
		Sources: []string{"pkg/args.go"}, Body: "steps"}
	if err := s.Save(repo); err != nil {
		t.Fatal(err)
	}

	var notes []string
	hits := matchSkills(repo, []string{"pkg/args.go"}, &notes)
	if len(hits) != 1 || hits[0].Name != "parse-cli-flags" {
		t.Fatalf("want the stale skill, got %v", hits)
	}
	if hits[0].Path == "" {
		t.Error("skill hit must carry its SKILL.md path")
	}

	if hits := matchSkills(repo, []string{"other/notes.go"}, &notes); len(hits) != 0 {
		t.Errorf("unrelated change must match no skills, got %v", hits)
	}
}

func TestMatchDocs(t *testing.T) {
	repo, _ := fixtureRepo(t)
	wikiDir := filepath.Join(repo, ".kaioken", "wiki")
	if err := os.MkdirAll(wikiDir, 0o755); err != nil {
		t.Fatal(err)
	}
	doc := "# Args\n\nAbout parsing.\n\n<!-- kaioken:files pkg/args.go,pkg/caller.go -->\n"
	if err := os.WriteFile(filepath.Join(wikiDir, "Args.md"), []byte(doc), 0o644); err != nil {
		t.Fatal(err)
	}
	other := "# Other\n\n<!-- kaioken:files other/notes.go -->\n"
	if err := os.WriteFile(filepath.Join(wikiDir, "Other.md"), []byte(other), 0o644); err != nil {
		t.Fatal(err)
	}

	var notes []string
	docs := matchDocs(repo, []string{"pkg/args.go"}, &notes)
	if len(docs) != 1 || docs[0] != ".kaioken/wiki/Args.md" {
		t.Fatalf("want [.kaioken/wiki/Args.md], got %v", docs)
	}
}

func TestFindTests(t *testing.T) {
	_, res := fixtureRepo(t)
	tests := findTests(res, []string{"pkg/caller.go"}, []string{"pkg/args.go"})
	if len(tests) != 1 || tests[0] != "pkg/args_test.go" {
		t.Fatalf("want [pkg/args_test.go], got %v", tests)
	}
}

func TestIsTestPath(t *testing.T) {
	yes := []string{"pkg/args_test.go", "src/app.spec.ts", "src/app.test.tsx",
		"tests/helper.py", "a/__tests__/x.js", "pkg/test_util.py"}
	no := []string{"pkg/args.go", "src/app.ts", "contest/rules.md", "testing.go"}
	for _, p := range yes {
		if !isTestPath(p) {
			t.Errorf("isTestPath(%q) = false, want true", p)
		}
	}
	for _, p := range no {
		if isTestPath(p) {
			t.Errorf("isTestPath(%q) = true, want false", p)
		}
	}
}
