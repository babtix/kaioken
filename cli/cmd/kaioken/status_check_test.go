package main

import (
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"kaioken/internal/config"
	"kaioken/internal/plan"
	"kaioken/internal/scan"
	"kaioken/internal/state"
)

// seedCheckRepo mirrors the internal/status fixture: one module (core) over
// src/, plus a config and plan. fresh controls whether state.json records the
// current source hash.
func seedCheckRepo(t *testing.T, fresh bool) string {
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
		"    scope: [src]\n")
	mk("src/app.go", "package src\n")

	if !fresh {
		return repo
	}
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
		files := plan.FilesFor(fm, res)
		hash, err := state.HashFiles(res.Root, files)
		if err != nil {
			t.Fatal(err)
		}
		st.Modules[fm.ID] = state.ModuleState{
			SourceHash: hash, GeneratedAt: time.Now(), FileCount: len(files),
		}
	}
	if err := st.Save(repo); err != nil {
		t.Fatal(err)
	}
	return repo
}

func TestStatusCheckFresh(t *testing.T) {
	repo := seedCheckRepo(t, true)
	if err := cmdStatus(flags{repo: repo, check: true}); err != nil {
		t.Errorf("fresh repo: got %v, want nil", err)
	}
}

func TestStatusCheckStale(t *testing.T) {
	repo := seedCheckRepo(t, false) // no state.json -> module missing -> stale
	err := cmdStatus(flags{repo: repo, check: true})
	if !errors.Is(err, errStale) {
		t.Errorf("stale repo: got %v, want errStale", err)
	}
}

func TestStatusCheckJSONShape(t *testing.T) {
	repo := seedCheckRepo(t, false)

	orig := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	os.Stdout = w

	runErr := cmdStatus(flags{repo: repo, check: true, jsonOut: true})

	w.Close()
	os.Stdout = orig
	var buf bytes.Buffer
	if _, err := io.Copy(&buf, r); err != nil {
		t.Fatal(err)
	}

	if !errors.Is(runErr, errStale) {
		t.Errorf("got %v, want errStale", runErr)
	}
	out := buf.String()
	for _, want := range []string{`"stale":true`, `"modules":["core"]`, `"wiki_behind":false`} {
		if !bytes.Contains([]byte(out), []byte(want)) {
			t.Errorf("json output missing %s: %s", want, out)
		}
	}
}

// An uninitialised repo is an internal error under -check, not staleness:
// exit 2 via cliExit rather than the stale sentinel.
func TestStatusCheckNoConfig(t *testing.T) {
	err := cmdStatus(flags{repo: t.TempDir(), check: true})
	var ce *cliExit
	if !errors.As(err, &ce) || ce.code != 2 {
		t.Errorf("got %v, want cliExit code 2", err)
	}
}
