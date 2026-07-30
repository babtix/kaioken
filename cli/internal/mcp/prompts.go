package mcp

import (
	"fmt"
	"strings"

	"kaioken/internal/skills"
)

// Prompts show up as slash commands in most clients. They are worth having
// because they carry the repo's own context into a request the user would
// otherwise phrase from scratch — and phrase without knowing the wiki exists.

func (s *Server) registerPrompts() {
	s.prompts = []Prompt{
		{
			Name:        "onboard",
			Description: "Get oriented in this repository using its generated knowledge base.",
			Handler:     promptOnboard,
		},
		{
			Name:        "explain",
			Description: "Explain a subsystem, grounded in the wiki rather than guessed from source.",
			Arguments: []promptArgument{
				{Name: "topic", Description: "Subsystem, file or concept to explain.", Required: true},
			},
			Handler: promptExplain,
		},
		{
			Name:        "review",
			Description: "Review the working diff against this repository's documented conventions.",
			Arguments: []promptArgument{
				{Name: "base", Description: "Base revision to diff against. Defaults to HEAD."},
			},
			Handler: promptReview,
		},
	}
}

func userMessage(text string) *promptResult {
	return &promptResult{
		Messages: []promptMessage{{
			Role:    "user",
			Content: content{Type: "text", Text: text},
		}},
	}
}

func promptOnboard(ctx callContext, _ map[string]string) (*promptResult, error) {
	return userMessage(fmt.Sprintf(
		`Get me oriented in the repository at %s.

Work in this order and say what each step told you:
1. repo_scan — the shape and size of the codebase.
2. wiki_tree — what the knowledge base already covers.
3. repo_status — which parts of that knowledge are current and which are stale.
4. skills_list — procedures already established for working here.

Then summarise: what this project is, how it is structured, and which two or
three things I should read first. Flag anything the wiki claims that
repo_status says is out of date.`, ctx.srv.repo)), nil
}

func promptExplain(ctx callContext, args map[string]string) (*promptResult, error) {
	topic := strings.TrimSpace(args["topic"])
	if topic == "" {
		return nil, fmt.Errorf("topic is required")
	}
	return userMessage(fmt.Sprintf(
		`Explain %q in the repository at %s.

Start with wiki_search for %q and read the best match with wiki_read — the
wiki explains intent and history that the source does not state. Then read the
actual implementation to confirm the wiki is still accurate, and call
repo_status if the answer hinges on code that may have moved since generation.

Say explicitly where the wiki and the code disagree, if they do.`,
		topic, ctx.srv.repo, topic)), nil
}

func promptReview(ctx callContext, args map[string]string) (*promptResult, error) {
	base := strings.TrimSpace(args["base"])
	if base == "" {
		base = "HEAD"
	}

	// Naming the repo's actual skills beats telling the model "follow the
	// conventions": it can only follow what it knows exists.
	var known string
	if all, err := skills.List(ctx.srv.repo); err == nil && len(all) > 0 {
		names := make([]string, 0, len(all))
		for _, sk := range all {
			names = append(names, sk.Name)
		}
		known = "\n\nSkills defined for this repo: " + strings.Join(names, ", ") +
			". Load the relevant ones with skills_get before judging style."
	}

	return userMessage(fmt.Sprintf(
		`Review the changes in %s against %s.

Read the diff with repo_git (operation "diff", base %q). For each area the diff
touches, check the wiki with wiki_search for the conventions and constraints
that already apply there.%s

Report only real problems: correctness, a violated documented constraint, a
convention the repo actually follows and this diff breaks. Say plainly if you
find nothing worth flagging.`,
		ctx.srv.repo, base, base, known)), nil
}
