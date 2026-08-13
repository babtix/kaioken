package agent

import (
	"context"
	"fmt"
	"strings"

	"kaioken/internal/llm"
	"kaioken/internal/prism"
)

// injectPrismContext automatically retrieves relevant context from imported
// PRISM document modules for the active user prompt when in ModePrism.
func (a *Agent) injectPrismContext(ctx context.Context, history []llm.Message) []llm.Message {
	if a.Root == "" || len(history) == 0 {
		return history
	}
	lastUser := lastUserIndex(history)
	if lastUser < 0 {
		return history
	}

	query := strings.TrimSpace(stripReminders(history[lastUser].Content))
	if query == "" || strings.HasPrefix(query, "/") {
		return history
	}

	e, err := prism.Open(ctx, a.Root)
	if err != nil {
		return history
	}

	mods, err := e.Store.Modules()
	if err != nil || len(mods) == 0 {
		notice := "PRISM knowledge search: no imported document modules exist yet. (Use /prism import to ingest documents)."
		return append(history, ContextUpdate(notice))
	}

	var allChunks []string
	var hitModules []string
	sourced := false
	graded := false

	for _, m := range mods {
		if m.DocumentCount == 0 && m.ChunkCount == 0 {
			continue
		}
		opt := e.Options
		opt.Module = m.Slug
		res, rerr := e.Retrieve(ctx, query, opt)
		if rerr != nil {
			continue
		}
		if len(res.Chunks) > 0 {
			hitModules = append(hitModules, m.Name+" ("+m.Slug+")")
			if res.SourceFound {
				sourced = true
			}
			if res.Graded {
				graded = true
			}
			for i, ch := range res.Chunks {
				allChunks = append(allChunks, fmt.Sprintf("[%s chunk %d]\n%s", m.Slug, i+1, strings.TrimSpace(ch)))
			}
		}
	}

	if len(allChunks) == 0 {
		notice := fmt.Sprintf("PRISM knowledge search: no relevant chunks matched %q across %d module(s).", query, len(mods))
		return append(history, ContextUpdate(notice))
	}

	var b strings.Builder
	b.WriteString(fmt.Sprintf("PRISM Grounded Context (modules: %s | sourced: %t | graded: %t):\n\n",
		strings.Join(hitModules, ", "), sourced, graded))
	for i, ch := range allChunks {
		if i >= 8 { // cap at top 8 chunks to preserve token context
			break
		}
		b.WriteString(ch)
		b.WriteString("\n\n")
	}

	return append(history, ContextUpdate(strings.TrimSpace(b.String())))
}

// queryPrism executes an explicit PRISM retrieval against imported modules.
func (a *Agent) queryPrism(ctx context.Context, query, module string) string {
	query = strings.TrimSpace(query)
	if query == "" {
		return "error: query is required"
	}
	if a.Root == "" {
		return "error: no repository root available"
	}

	e, err := prism.Open(ctx, a.Root)
	if err != nil {
		return "error: could not open PRISM engine: " + err.Error()
	}

	mods, err := e.Store.Modules()
	if err != nil || len(mods) == 0 {
		return "no PRISM modules found in repository. Import documents first using /prism import."
	}

	module = strings.TrimSpace(module)
	if module == "" {
		module = mods[0].Slug
	}

	opt := e.Options
	opt.Module = module
	res, err := e.Retrieve(ctx, query, opt)
	if err != nil {
		return "error running PRISM retrieval: " + err.Error()
	}

	if len(res.Chunks) == 0 {
		return fmt.Sprintf("PRISM retrieval for %q in module %q returned no matching sources (source_found: %t, graded: %t).",
			query, module, res.SourceFound, res.Graded)
	}

	var b strings.Builder
	b.WriteString(fmt.Sprintf("PRISM Result (module: %s, source_found: %t, graded: %t, route: %s):\n\n",
		module, res.SourceFound, res.Graded, res.Route))
	for i, ch := range res.Chunks {
		b.WriteString(fmt.Sprintf("--- Source Chunk %d ---\n%s\n\n", i+1, strings.TrimSpace(ch)))
	}
	return strings.TrimSpace(b.String())
}
