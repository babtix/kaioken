// Package gitdraft turns the working tree's diff into a draft commit message
// and PR description. It is grounded twice over: the change itself comes from
// git, and the house style comes from the repo's own commit history and the
// steering notes in its config — so the draft reads like this project wrote
// it, not like a generic template.
package gitdraft

import (
	"context"
	"fmt"
	"strings"

	"kaioken/internal/config"
	"kaioken/internal/gitx"
	"kaioken/internal/llm"
)

// maxPatchBytes caps how much diff the model sees. Beyond this the draft
// stops getting better and only gets more expensive.
const maxPatchBytes = 24_000

const draftSystem = `You write commit messages and pull-request descriptions for a repository.

You are given the unified diff of the current change, the repository's recent commit
subjects as house style, and any steering notes the team recorded.

Rules:
- The commit message follows the repository's own conventional-commit style
  (type(scope): summary), matching the tone and scopes of the recent subjects.
- The summary line stays under 72 characters; add a short body only when the change
  has real why to explain.
- The PR description has three parts: what changed, why, and how to test it.
- Describe only what the diff actually shows. Never invent tickets, reviewers,
  or behavior the diff does not support.

Output exactly this shape, no commentary around it:

## Commit message
<message>

## PR description
<description>`

// Draft produces the commit message + PR description for everything changed
// since base (default HEAD, i.e. the uncommitted work). It makes exactly one
// LLM call; everything else is read from git.
func Draft(ctx context.Context, repo string, cfg *config.Config, client *llm.Client, base string) (string, error) {
	if strings.TrimSpace(base) == "" {
		base = "HEAD"
	}
	patch, err := gitx.Patch(ctx, repo, base, nil, maxPatchBytes)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(patch) == "" {
		return "", fmt.Errorf("no changes since %s — nothing to draft", base)
	}

	var user strings.Builder
	fmt.Fprintf(&user, "Diff of the current change (against %s):\n\n%s\n", base, patch)

	// House style: what commits in this repo actually look like. Recent
	// history rather than base..HEAD — an uncommitted change still deserves
	// the project's voice.
	if subjects, serr := gitx.RecentSubjects(ctx, repo, 20); serr == nil && len(subjects) > 0 {
		user.WriteString("\nRecent commit subjects, as style reference:\n")
		for _, s := range subjects {
			fmt.Fprintf(&user, "  %s\n", s)
		}
	}
	if cfg != nil && len(cfg.Notes) > 0 {
		user.WriteString("\nTeam steering notes:\n")
		for _, n := range cfg.Notes {
			fmt.Fprintf(&user, "  - %s\n", n)
		}
	}

	out, err := client.Chat(ctx, draftSystem, user.String())
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}
