package mcp

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"kaioken/internal/search"
	"kaioken/internal/skills"
	"kaioken/internal/state"
)

// Skills are the part of Kaioken an agent benefits from most directly: a
// learned skill is a procedure that already worked in this repo, which is
// strictly better than the model re-deriving it.

func (s *Server) registerSkillTools() {
	s.register(Tool{
		Name: "skills_list",
		Description: "List the repository's task skills — short procedures for doing " +
			"specific work in this codebase, some generated from static analysis and some " +
			"distilled from sessions that actually did the task. Check this before " +
			"planning any non-trivial change here.",
		InputSchema: object().
			enum("origin", "Filter by how the skill came to exist.", "any", "generated", "learned", "human").
			boolean("include_body", "Include each skill's full text instead of just its description.").
			build(),
		Handler: skillsList,
	})

	s.register(Tool{
		Name:        "skills_get",
		Description: "Read one skill in full, including the source files it was written from.",
		InputSchema: object().
			str("name", "Skill name, as listed by skills_list.").
			require("name").
			build(),
		Handler: skillsGet,
	})

	s.register(Tool{
		Name: "skills_search",
		Description: "Find skills relevant to a task by meaning, not just name. Use when " +
			"skills_list is long and you want the two or three that bear on what you are doing.",
		InputSchema: object().
			str("query", "What you are about to do, in a sentence.").
			integer("limit", "Maximum results.", 5, 1, 25).
			require("query").
			build(),
		Handler: skillsSearch,
	})
}

type skillSummary struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Origin      string   `json:"origin"`
	Sources     []string `json:"sources,omitempty"`
	UseCount    int      `json:"use_count,omitempty"`
	Stale       bool     `json:"stale"`
	Body        string   `json:"body,omitempty"`
}

func skillsList(ctx callContext, raw json.RawMessage) (*ToolResult, error) {
	var args struct {
		Origin      string `json:"origin"`
		IncludeBody bool   `json:"include_body"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return nil, fmt.Errorf("bad arguments: %w", err)
	}

	all, err := skills.List(ctx.srv.repo)
	if err != nil {
		return nil, fmt.Errorf("reading skills: %w", err)
	}
	if len(all) == 0 {
		return textResult(fmt.Sprintf(
			"No skills in %s yet. Run `kaioken skills` there to generate them from the codebase.",
			ctx.srv.repo)), nil
	}

	stale := staleSet(ctx.srv.repo, all)

	out := make([]skillSummary, 0, len(all))
	for _, sk := range all {
		origin := sk.Origin
		if origin == "" {
			origin = skills.OriginHuman
		}
		if args.Origin != "" && args.Origin != "any" && origin != args.Origin {
			continue
		}
		sum := skillSummary{
			Name:        sk.Name,
			Description: sk.Description,
			Origin:      origin,
			Sources:     sk.Sources,
			UseCount:    sk.UseCount,
			Stale:       stale[sk.Name],
		}
		if args.IncludeBody {
			sum.Body = sk.Body
		}
		out = append(out, sum)
	}
	sort.Slice(out, func(i, j int) bool {
		// Learned skills first — they encode something that actually happened
		// — then by how often they have paid off.
		li, lj := out[i].Origin == skills.OriginLearned, out[j].Origin == skills.OriginLearned
		if li != lj {
			return li
		}
		if out[i].UseCount != out[j].UseCount {
			return out[i].UseCount > out[j].UseCount
		}
		return out[i].Name < out[j].Name
	})

	var b strings.Builder
	fmt.Fprintf(&b, "%d skill(s) in %s:\n\n", len(out), ctx.srv.repo)
	for _, sk := range out {
		fmt.Fprintf(&b, "- **%s** (%s", sk.Name, sk.Origin)
		if sk.UseCount > 0 {
			fmt.Fprintf(&b, ", used %d×", sk.UseCount)
		}
		if sk.Stale {
			b.WriteString(", stale")
		}
		fmt.Fprintf(&b, ") — %s\n", sk.Description)
		if sk.Body != "" {
			fmt.Fprintf(&b, "\n%s\n\n", sk.Body)
		}
	}
	if !args.IncludeBody {
		b.WriteString("\nRead any of them in full with skills_get.")
	}
	return jsonResult(b.String(), map[string]any{"skills": out}), nil
}

func skillsGet(ctx callContext, raw json.RawMessage) (*ToolResult, error) {
	var args struct {
		Name string `json:"name"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return nil, fmt.Errorf("bad arguments: %w", err)
	}
	name := strings.TrimSpace(args.Name)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}

	sk, err := skills.Load(ctx.srv.repo, skills.Slug(name))
	if err != nil {
		return nil, fmt.Errorf("no skill %q — call skills_list for the available set", name)
	}

	var b strings.Builder
	fmt.Fprintf(&b, "# %s\n\n%s\n\n", sk.Name, sk.Description)
	if len(sk.Sources) > 0 {
		fmt.Fprintf(&b, "_Written from: %s_\n\n", strings.Join(sk.Sources, ", "))
	}
	b.WriteString(sk.Body)

	return jsonResult(b.String(), map[string]any{
		"name":        sk.Name,
		"description": sk.Description,
		"origin":      sk.Origin,
		"sources":     sk.Sources,
		"use_count":   sk.UseCount,
		"body":        sk.Body,
	}), nil
}

func skillsSearch(ctx callContext, raw json.RawMessage) (*ToolResult, error) {
	var args struct {
		Query string `json:"query"`
		Limit int    `json:"limit"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return nil, fmt.Errorf("bad arguments: %w", err)
	}
	query := strings.TrimSpace(args.Query)
	if query == "" {
		return nil, fmt.Errorf("query is required")
	}
	if args.Limit <= 0 {
		args.Limit = 5
	}

	hits, err := ctx.srv.search(ctx, search.Query{
		Text:  query,
		Kinds: []search.Kind{search.KindSkill},
		Limit: args.Limit,
	})
	if err != nil {
		return nil, err
	}
	if len(hits) == 0 {
		return textResult(fmt.Sprintf("No skills match %q.", query)), nil
	}

	var b strings.Builder
	fmt.Fprintf(&b, "%d skill(s) relevant to %q:\n\n", len(hits), query)
	for _, h := range hits {
		fmt.Fprintf(&b, "- **%s** — %s\n", h.Path, h.Snippet)
	}
	b.WriteString("\nRead one in full with skills_get.")
	return jsonResult(b.String(), map[string]any{"results": hits}), nil
}

// staleSet marks skills whose source files changed since they were written.
// A stale skill is still worth reading — it was true recently — so this
// annotates rather than filters.
func staleSet(repo string, all []*skills.Skill) map[string]bool {
	out := map[string]bool{}
	st, err := state.Load(repo)
	if err != nil {
		return out
	}
	// A skill is stale when it predates the most recent card generation for a
	// module whose scope it draws on. Card state is the only per-file
	// generation timestamp on disk, so it is the available proxy.
	var newest time.Time
	for _, ms := range st.Modules {
		if ms.GeneratedAt.After(newest) {
			newest = ms.GeneratedAt
		}
	}
	if newest.IsZero() {
		return out
	}
	for _, sk := range all {
		if !sk.GeneratedAt.IsZero() && sk.GeneratedAt.Before(newest) {
			out[sk.Name] = true
		}
	}
	return out
}
