// Package status answers one question about a repository: is Kaioken's
// generated knowledge still fresh? It is the shared core behind `kaioken
// status`, the CI drift gate (`status -check`) and the multi-repo hub —
// none of which should each re-derive what "stale" means.
package status

import (
	"context"
	"time"

	"kaioken/internal/config"
	"kaioken/internal/gitx"
	"kaioken/internal/plan"
	"kaioken/internal/scan"
	"kaioken/internal/state"
	"kaioken/internal/wiki"
)

// Module states, from freshest to stalest.
const (
	Fresh   = "fresh"   // cards match the current source hash
	Changed = "changed" // source moved since the cards were generated
	Missing = "missing" // planned but never generated
	Empty   = "empty"   // no files in scope — nothing to be stale about
)

// Module is the freshness of one knowledge module.
type Module struct {
	ID          string
	State       string // one of Fresh, Changed, Missing, Empty
	Files       int
	GeneratedAt time.Time // zero when never generated
}

// Stale reports whether this module invalidates the generated knowledge.
// Empty modules are not stale: there is nothing the docs could be wrong about.
func (m Module) Stale() bool { return m.State == Changed || m.State == Missing }

// Report is the freshness of one repository's generated knowledge.
type Report struct {
	Modules []Module
	// WikiBehind is true when commits landed after the wiki's recorded
	// baseline — the prose docs describe an older tree than HEAD.
	WikiBehind bool
}

// Stale reports whether anything in the report is out of date.
func (r *Report) Stale() bool {
	if r.WikiBehind {
		return true
	}
	for _, m := range r.Modules {
		if m.Stale() {
			return true
		}
	}
	return false
}

// StaleModules lists the ids of modules that are changed or missing, in plan
// order.
func (r *Report) StaleModules() []string {
	var out []string
	for _, m := range r.Modules {
		if m.Stale() {
			out = append(out, m.ID)
		}
	}
	return out
}

// Assess computes the freshness of repo's generated knowledge. It makes no
// LLM calls and no network calls — safe for CI.
func Assess(repo string) (*Report, error) {
	cfg, err := config.Load(repo)
	if err != nil {
		return nil, err
	}
	p, err := plan.Load(repo)
	if err != nil {
		return nil, err
	}
	st, err := state.Load(repo)
	if err != nil {
		return nil, err
	}
	res, err := scan.Repo(repo, cfg)
	if err != nil {
		return nil, err
	}

	rep := &Report{}
	for _, fm := range p.Flatten() {
		files := plan.FilesFor(fm, res)
		mod := Module{ID: fm.ID, Files: len(files)}
		ms, ok := st.Modules[fm.ID]
		switch {
		case len(files) == 0:
			mod.State = Empty
		case !ok:
			mod.State = Missing
		default:
			hash, herr := state.HashFiles(res.Root, files)
			if herr != nil {
				return nil, herr
			}
			mod.GeneratedAt = ms.GeneratedAt
			if hash == ms.SourceHash {
				mod.State = Fresh
			} else {
				mod.State = Changed
			}
		}
		rep.Modules = append(rep.Modules, mod)
	}

	// The wiki baseline is a separate freshness axis from the cards: prose
	// docs can lag even when every card is current.
	stamp := wiki.LoadStamp(repo)
	if stamp.Commit != "" && gitx.IsRepo(repo) {
		if head, herr := gitx.Head(context.Background(), repo); herr == nil && head != stamp.Commit {
			rep.WikiBehind = true
		}
	}
	return rep, nil
}
