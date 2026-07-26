// Package setup implements `kaioken init`: the one command a user runs the
// first time they point Kaioken at a repository.
//
// Init used to write a config file and stop, which left the repo no better off
// than before — the useful artefacts all lived behind three more commands. Now
// it performs the full first-run setup: create the config, scan the repository,
// and write the AGENTS.md that any agent (Kaioken's own chat agent, or another
// runtime entirely) reads before touching the code. Everything heavier — the
// wiki, the skills — stays opt-in, because those cost real tokens and minutes.
package setup

import (
	"context"
	"fmt"
	"os"

	"kaioken/internal/agentsmd"
	"kaioken/internal/config"
	"kaioken/internal/llm"
	"kaioken/internal/scan"
)

// Options controls one init run.
type Options struct {
	// Force rewrites AGENTS.md even when it already exists.
	Force bool
	// Model overrides the model recorded in a newly created config.
	Model string
	// SkipAgents writes the config and scans, but does not spend an LLM call.
	SkipAgents bool
}

// Result reports what init did, so callers can print an accurate summary.
type Result struct {
	ConfigCreated bool
	Scan          *scan.Result
	Agents        *agentsmd.Result
	// AgentsSkipped, when non-empty, explains why AGENTS.md was not written.
	AgentsSkipped string
}

// EnsureConfig loads the repository's config, creating it with defaults when it
// is missing. It reports whether it created one, and never overwrites a config
// the user has already edited.
func EnsureConfig(repo, model string) (cfg *config.Config, created bool, err error) {
	if _, statErr := os.Stat(config.Path(repo)); statErr == nil {
		cfg, err = config.Load(repo)
		return cfg, false, err
	}
	cfg = config.Default()
	if model != "" {
		cfg.Model = model
	}
	if err := cfg.Save(repo); err != nil {
		return nil, false, err
	}
	return cfg, true, nil
}

// Run performs the full first-run setup for a repository. client may be nil:
// without an API key the config and the scan still happen, and the AGENTS.md
// step is reported as skipped rather than failing the command.
func Run(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
	opts Options, pg agentsmd.Progress) (*Result, error) {

	out := &Result{}

	if pg.Started != nil {
		pg.Started("scanning repository")
	}
	res, err := scan.Repo(repo, cfg)
	if err != nil {
		return out, err
	}
	out.Scan = res
	if pg.Info != nil {
		pg.Info(res.Stats())
	}

	switch {
	case opts.SkipAgents:
		out.AgentsSkipped = "skipped by request"
	case client == nil:
		out.AgentsSkipped = "no API key — set one with `kaioken` → /key, then re-run `kaioken init`"
	case agentsmd.Exists(repo) && !opts.Force:
		// An AGENTS.md already exists and the user did not ask for a rewrite.
		// Refreshing the generated pointer block is still free and always
		// correct, so do that much.
		changed, rerr := agentsmd.RefreshKnowledge(repo)
		if rerr != nil {
			return out, rerr
		}
		if changed {
			out.AgentsSkipped = fmt.Sprintf(
				"%s exists — refreshed its knowledge section only (use force to rewrite)", agentsmd.FileName)
		} else {
			out.AgentsSkipped = fmt.Sprintf(
				"%s exists and is current — use force to rewrite it", agentsmd.FileName)
		}
	default:
		doc, gerr := agentsmd.Generate(ctx, repo, cfg, client, res, pg)
		if gerr != nil {
			return out, fmt.Errorf("writing %s: %w", agentsmd.FileName, gerr)
		}
		out.Agents = doc
	}
	return out, nil
}

// NextSteps is the guidance printed after init: what the user should run to
// turn a scanned repository into a documented one.
func NextSteps(repo string) []string {
	steps := []string{
		"`kaioken wiki x3`   — deep multi-pass wiki for this repo",
		"`kaioken skills`    — task guides an agent loads while working",
		"`kaioken hook install` — refresh the docs on every commit",
	}
	if !agentsmd.Exists(repo) {
		return steps
	}
	// Once AGENTS.md exists, the wiki and skills runs feed straight back into
	// it, so say that rather than presenting them as unrelated commands.
	return append(steps,
		fmt.Sprintf("each of those refreshes the knowledge section of %s automatically",
			agentsmd.FileName))
}
