package main

import (
	"context"
	"fmt"

	"kaioken/internal/config"
	"kaioken/internal/gitdraft"
)

// cmdGitDraft prints a draft commit message and PR description for the
// current change. It only ever drafts — it never stages or commits, so the
// human stays the one who writes history. The optional positional is the
// diff baseline (default HEAD, i.e. the uncommitted work).
func cmdGitDraft(ctx context.Context, f flags) error {
	cfg, err := config.Load(f.repo)
	if err != nil {
		cfg = config.Default()
	}
	client, err := newClient(cfg, f)
	if err != nil {
		return err
	}
	draft, err := gitdraft.Draft(ctx, f.repo, cfg, client, f.positional)
	if err != nil {
		return err
	}
	fmt.Println(draft)
	return nil
}
