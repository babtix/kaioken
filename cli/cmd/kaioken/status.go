package main

import (
	"encoding/json"
	"errors"
	"fmt"

	"kaioken/internal/status"
)

// errStale is the drift gate's finding: generated knowledge is out of date.
// main maps it to exit 1 with no "error:" prefix — the printed report is the
// output, stale is the verdict.
var errStale = errors.New("generated knowledge is stale")

// cmdStatus prints per-module freshness. With -check it becomes the CI drift
// gate: same report, but the exit code carries the verdict (0 fresh, 1 stale,
// 2 internal error). With -json it emits a machine-readable summary instead.
func cmdStatus(f flags) error {
	rep, err := status.Assess(f.repo)
	if err != nil {
		if f.check {
			return &cliExit{code: 2, err: err}
		}
		return err
	}

	if f.jsonOut {
		out := struct {
			Stale      bool     `json:"stale"`
			Modules    []string `json:"modules"`
			WikiBehind bool     `json:"wiki_behind"`
		}{rep.Stale(), rep.StaleModules(), rep.WikiBehind}
		if out.Modules == nil {
			out.Modules = []string{} // stable JSON shape for pipelines
		}
		raw, jerr := json.Marshal(out)
		if jerr != nil {
			return jerr
		}
		fmt.Println(string(raw))
	} else {
		for _, m := range rep.Modules {
			switch m.State {
			case status.Empty:
				fmt.Printf("  ∅ %-40s (no files in scope)\n", m.ID)
			case status.Missing:
				fmt.Printf("  ○ %-40s not generated (%d files)\n", m.ID, m.Files)
			case status.Fresh:
				fmt.Printf("  ✓ %-40s up-to-date (%s)\n", m.ID, m.GeneratedAt.Format("2006-01-02 15:04"))
			case status.Changed:
				fmt.Printf("  Δ %-40s CHANGED since %s\n", m.ID, m.GeneratedAt.Format("2006-01-02 15:04"))
			}
		}
		if rep.WikiBehind {
			fmt.Println("  ⚠ wiki is behind HEAD — run `kaioken update`")
		}
	}

	if f.check && rep.Stale() {
		return errStale
	}
	return nil
}
