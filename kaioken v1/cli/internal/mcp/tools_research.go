package mcp

import (
	"encoding/json"
	"fmt"
	"strings"

	"kaioken/internal/config"
	"kaioken/internal/research"
	"kaioken/internal/websearch"
)

// research_run is the one tool here that spends money and touches the network,
// so it is registered only when the operator passes --allow-research. A client
// that never sees it cannot be talked into calling it.

func (s *Server) registerResearchTools() {
	s.register(Tool{
		Name: "research_run",
		Description: "Answer a question from the open web: plan subquestions, search, " +
			"read pages, search again for what is still missing, then write a cited " +
			"report. Costs LLM tokens and search-provider credits — use it for questions " +
			"the repository itself cannot answer.",
		InputSchema: object().
			str("question", "The question to research.").
			integer("multiplier", "Depth dial: 1 is a quick look, 3 the default, 10 exhaustive.", 3, 1, 10).
			integer("max_rounds", "Cap on search→read→reason rounds. 0 lets the multiplier decide.", 0, 0, 12).
			require("question").
			build(),
		Handler: researchRun,
	})
}

func researchRun(ctx callContext, raw json.RawMessage) (*ToolResult, error) {
	var args struct {
		Question   string `json:"question"`
		Multiplier int    `json:"multiplier"`
		MaxRounds  int    `json:"max_rounds"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return nil, fmt.Errorf("bad arguments: %w", err)
	}
	question := strings.TrimSpace(args.Question)
	if question == "" {
		return nil, fmt.Errorf("question is required")
	}
	if args.Multiplier <= 0 {
		args.Multiplier = 3
	}

	client, err := ctx.srv.client()
	if err != nil {
		return nil, fmt.Errorf("research needs an LLM provider: %w", err)
	}
	global := config.LoadGlobal()
	provider, err := websearch.Resolve(global.Research.SearchProvider, global.Keys)
	if err != nil {
		return nil, fmt.Errorf("research needs a search provider: %w", err)
	}

	opts := research.Options{
		Multiplier:  args.Multiplier,
		MaxRounds:   args.MaxRounds,
		MaxDuration: global.Research.ResearchTimeout(),
	}
	if opts.MaxRounds == 0 {
		opts.MaxRounds = global.Research.MaxRounds
	}
	opts.Concurrency, _ = ctx.srv.config().EffectiveConcurrency(client.Model)

	ctx.srv.log.info("research start", "question", question, "provider", provider.Name())
	rep, err := research.Run(ctx, client, provider, question, opts, research.Progress{
		Stage: func(s string) { ctx.srv.log.debug("research", "stage", s) },
	})
	if err != nil {
		return nil, err
	}

	// The id must be the source's own citation number, not its position: the
	// markdown's [n] markers resolve against that number, and renumbering the
	// list here would silently point every citation at the wrong page.
	sources := make([]map[string]any, 0, len(rep.Sources))
	for _, src := range rep.Sources {
		sources = append(sources, map[string]any{
			"id": src.N, "url": src.URL, "title": src.Title,
		})
	}

	var b strings.Builder
	b.WriteString(rep.Markdown)
	if rep.Incomplete {
		b.WriteString("\n\n_This run hit its round budget with questions still open; " +
			"raise multiplier or max_rounds for a fuller answer._")
	}
	for _, w := range rep.Warnings {
		b.WriteString("\n\n_Note: " + w + "_")
	}
	return jsonResult(b.String(), map[string]any{
		"question":   rep.Question,
		"markdown":   rep.Markdown,
		"sources":    sources,
		"rounds":     rep.Rounds,
		"searched":   rep.Searched,
		"fetched":    rep.Fetched,
		"incomplete": rep.Incomplete,
		"warnings":   rep.Warnings,
		"deep":       rep.Deep != nil,
		"elapsed_ms": rep.Elapsed.Milliseconds(),
	}), nil
}
