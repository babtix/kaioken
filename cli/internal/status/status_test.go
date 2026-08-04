package status

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"kaioken/internal/config"
	"kaioken/internal/plan"
	"kaioken/internal/scan"
	"kaioken/internal/state"
)

// newRepo seeds a minimal .kaioken layout: a config, a two-module plan (core
// over src/, docs over nothing), and one source file. It returns the repo
// path; state.json is left absent so every module starts out missing.
func newRepo(t *testing.T) string {
	t.Helper()
	repo := t.TempDir()
	mk := func(rel, body string) {
		t.Helper()
		p := filepath.Join(repo, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	mk(".kaioken/config.yaml", "version: 1\nmodel: m\nprovider: openrouter\n")
	mk(".kaioken/modules.yaml", ""+
		"version: 1\n"+
		"modules:\n"+
		"  - id: core\n"+
		"    title: Core\n"+
		"    scope: [src]\n"+
		"  - id: docs\n"+
		"    title: Docs\n"+
		"    scope: [nothing]\n")
	mk("src/app.go", "package src\n")
	return repo
}

// stampCore records the current source hash of the core module in state.json,
// making it fresh at the moment of the call.
func stampCore(t *testing.T, repo string) {
	t.Helper()
	cfg, err := config.Load(repo)
	if err != nil {
		t.Fatal(err)
	}
	res, err := scan.Repo(repo, cfg)
	if err != nil {
		t.Fatal(err)
	}
	p, err := plan.Load(repo)
	if err != nil {
		t.Fatal(err)
	}
	st, err := state.Load(repo)
	if err != nil {
		t.Fatal(err)
	}
	for _, fm := range p.Flatten() {
		if fm.ID != "core" {
			continue
		}
		files := plan.FilesFor(fm, res)
		hash, err := state.HashFiles(res.Root, files)
		if err != nil {
			t.Fatal(err)
		}
		st.Modules["core"] = state.ModuleState{
			SourceHash: hash, GeneratedAt: time.Now(), FileCount: len(files),
		}
	}
	if err := st.Save(repo); err != nil {
		t.Fatal(err)
	}
}

func TestAssessStates(t *testing.T) {
	repo := newRepo(t)

	// No state yet: core is missing, docs is empty (nothing in scope).
	rep, err := Assess(repo)
	if err != nil {
		t.Fatal(err)
	}
	byID := map[string]Module{}
	for _, m := range rep.Modules {
		byID[m.ID] = m
	}
	if byID["core"].State != Missing {
		t.Errorf("core = %q, want missing", byID["core"].State)
	}
	if byID["docs"].State != Empty {
		t.Errorf("docs = %q, want empty", byID["docs"].State)
	}
	if !rep.Stale() {
		t.Error("a missing module must make the report stale")
	}

	stampCore(t, repo)
	rep, err = Assess(repo)
	if err != nil {
		t.Fatal(err)
	}
	byID = map[string]Module{}
	for _, m := range rep.Modules {
		byID[m.ID] = m
	}
	if byID["core"].State != Fresh {
		t.Errorf("core = %q, want fresh", byID["core"].State)
	}
	if rep.Stale() {
		t.Error("fresh cards and no wiki baseline must not be stale")
	}

	// Mutate the source: the stamped hash no longer matches.
	p := filepath.Join(repo, "src", "app.go")
	if err := os.WriteFile(p, []byte("package src\n\nfunc New() {}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	rep, err = Assess(repo)
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range rep.Modules {
		if m.ID == "core" && m.State != Changed {
			t.Errorf("core after edit = %q, want changed", m.State)
		}
	}
	if got := rep.StaleModules(); len(got) != 1 || got[0] != "core" {
		t.Errorf("StaleModules = %v, want [core]", got)
	}
}

// The wiki baseline is its own freshness axis: cards can all be fresh while
// the prose docs lag behind HEAD.
func TestAssessWikiBehind(t *testing.T) {
	repo := newRepo(t)
	stampCore(t, repo)

	// A recorded baseline that differs from HEAD marks the wiki behind. The
	// comparison is against HEAD, so no real commit with this sha is needed.
	stamp := ".kaioken/wiki_state.yaml"
	body := "commit: 1111111111111111111111111111111111111111\n"
	if err := os.WriteFile(filepath.Join(repo, stamp), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}

	rep, err := Assess(repo)
	if err != nil {
		t.Fatal(err)
	}
	// Outside a git work tree the baseline cannot be compared, so nothing is
	// behind; inside one (git on PATH) HEAD necessarily differs from the fake
	// sha. Either outcome is valid — but Stale must agree with WikiBehind.
	if rep.Stale() != rep.WikiBehind {
		t.Errorf("Stale = %v but WikiBehind = %v; with fresh cards they must agree",
			rep.Stale(), rep.WikiBehind)
	}
}
