package prism

import (
	"context"
	"fmt"
	"strings"
	"time"

	"kaioken/internal/config"
	"kaioken/internal/embed"
	"kaioken/internal/llm"
)

// Engine is a fully wired PRISM for one repository: the store, the two
// optional models, the caches, and the retrieval paths built on them.
//
// It exists so that the CLI, the daemon, the TUI and the MCP server all
// resolve configuration through one function. The alternative — each surface
// reading config itself — is how a corpus ends up embedded by one model and
// queried by another, which does not fail, it just quietly returns nonsense.
type Engine struct {
	Store     *Store
	Retriever *Retriever
	Agent     *Agent

	// Embed describes which embedding endpoint was chosen and why, for a
	// status line or a settings page. Never a mystery.
	Embed embed.Resolution
	// Utility names the instruct model behind the gates, empty when none is
	// configured.
	Utility string
	// Options carries the configured retrieval defaults.
	Options Options
	// AgentMode reports whether the configuration asks for the agentic path.
	AgentMode bool
	// Chunk carries the configured chunking, for ingestion.
	Chunk ChunkConfig
}

// Open builds an engine for a repository from its configuration.
//
// Resolving the embedder probes local endpoints when nothing is configured,
// which costs about a second once. Pass a context with a deadline if that
// matters to the caller.
func Open(ctx context.Context, repo string) (*Engine, error) {
	cfg, err := config.Load(repo)
	if err != nil {
		cfg = config.Default()
	}
	g := config.LoadGlobal()
	p := mergePrism(cfg.Prism, g.Prism)

	store := NewStore(repo)

	res := resolveEmbed(ctx, repo, p)
	emb, err := embed.New(res.Config)
	if err != nil {
		// A broken embedding configuration must not stop a lexical search.
		res = embed.Resolution{Source: embed.SourceNone, Detail: err.Error()}
		emb = nil
	}

	utility, utilityName := resolveUtility(cfg, g, p)

	ttl := time.Duration(p.CacheTTLSeconds) * time.Second
	r := NewRetriever(store, emb, utility, NewCache(ttl))

	return &Engine{
		Store:     store,
		Retriever: r,
		Agent:     NewAgent(r),
		Embed:     res,
		Utility:   utilityName,
		Options: Options{
			TopK:     p.TopK,
			Variants: p.Variants,
			NoGrade:  !p.GradeEnabled(),
		}.withDefaults(),
		AgentMode: p.AgentMode(),
		Chunk: ChunkConfig{
			ParentTokens: p.ParentTokens,
			ChildTokens:  p.ChildTokens,
			ChildOverlap: p.ChildOverlap,
		}.withDefaults(),
	}, nil
}

// Ingestor returns an ingestor using this engine's embedder and chunking, so
// what is written matches what will later be queried.
func (e *Engine) Ingestor() *Ingestor {
	return NewIngestor(e.Store, e.Retriever.emb, e.Chunk)
}

// Retrieve runs the configured path — static or agentic — and returns the
// agentic result shape either way, so a caller renders one thing.
func (e *Engine) Retrieve(ctx context.Context, query string, opt Options) (AgentResult, error) {
	if e.AgentMode {
		return e.Agent.Retrieve(ctx, query, AgentOptions{Options: opt})
	}
	res, err := e.Retriever.Retrieve(ctx, query, opt)
	if err != nil {
		return AgentResult{}, err
	}
	out := AgentResult{Result: res, Route: RouteSimple, SubQuestions: []string{query}}
	if !res.SourceFound {
		out.Unresolved = []string{query}
	}
	return out, nil
}

// Status is a one-line summary of what this engine can actually do, for a
// status bar or the head of a settings page.
//
// It names the degraded states explicitly rather than showing a green light
// with an asterisk: an answer built on ungraded context looks identical to a
// good one, which is the confusion this whole package exists to prevent.
func (e *Engine) Status() string {
	parts := []string{"embeddings: " + e.Embed.Detail}
	if e.Utility == "" {
		parts = append(parts, "no utility model — the relevance gate cannot run")
	} else {
		parts = append(parts, "gate: "+e.Utility)
	}
	if e.AgentMode {
		parts = append(parts, "mode: agent")
	}
	if e.Options.Variants > 1 {
		parts = append(parts, fmt.Sprintf("fusion: %d phrasings", e.Options.Variants))
	}
	return strings.Join(parts, " · ")
}

// mergePrism layers the workspace config over the global one, field by field.
// Per-field rather than whole-struct so a user can set a global utility model
// and a per-repo variant count without restating the other.
func mergePrism(local, global config.Prism) config.Prism {
	str := func(a, b string) string {
		if strings.TrimSpace(a) != "" {
			return a
		}
		return b
	}
	num := func(a, b int) int {
		if a != 0 {
			return a
		}
		return b
	}

	out := config.Prism{
		EmbedModel:            str(local.EmbedModel, global.EmbedModel),
		EmbedProvider:         str(local.EmbedProvider, global.EmbedProvider),
		EmbedBaseURL:          str(local.EmbedBaseURL, global.EmbedBaseURL),
		EmbedFallbackModel:    str(local.EmbedFallbackModel, global.EmbedFallbackModel),
		EmbedFallbackProvider: str(local.EmbedFallbackProvider, global.EmbedFallbackProvider),
		UtilityModel:          str(local.UtilityModel, global.UtilityModel),
		UtilityProvider:       str(local.UtilityProvider, global.UtilityProvider),
		Mode:                  str(local.Mode, global.Mode),
		TopK:                  num(local.TopK, global.TopK),
		Variants:              num(local.Variants, global.Variants),
		ParentTokens:          num(local.ParentTokens, global.ParentTokens),
		ChildTokens:           num(local.ChildTokens, global.ChildTokens),
		ChildOverlap:          num(local.ChildOverlap, global.ChildOverlap),
		CacheTTLSeconds:       num(local.CacheTTLSeconds, global.CacheTTLSeconds),
	}
	out.Grade = local.Grade
	if out.Grade == nil {
		out.Grade = global.Grade
	}
	return out
}

// resolveEmbed picks the embedding endpoint: an explicit prism setting, then
// whatever embed.Resolve finds (local server, then the configured hosted
// fallback), then nothing.
func resolveEmbed(ctx context.Context, repo string, p config.Prism) embed.Resolution {
	if strings.TrimSpace(p.EmbedModel) != "" {
		ec := embed.Config{
			Provider: p.EmbedProvider,
			BaseURL:  p.EmbedBaseURL,
			Model:    p.EmbedModel,
		}
		return embed.Resolution{
			Config: embed.WithEndpoint(ec),
			Source: embed.SourceConfig,
			Detail: p.EmbedModel + " (configured)",
		}
	}
	return embed.Resolve(ctx, repo, embed.Fallback{
		Provider: p.EmbedFallbackProvider,
		Model:    p.EmbedFallbackModel,
	})
}

// resolveUtility builds the instruct client behind the gates, or nil.
func resolveUtility(cfg *config.Config, g *config.Global, p config.Prism) (Utility, string) {
	model := strings.TrimSpace(p.UtilityModel)
	if model == "" {
		return nil, ""
	}

	provider := strings.TrimSpace(p.UtilityProvider)
	if provider == "" {
		provider = cfg.Provider
	}
	if provider == "" {
		provider = g.DefaultProvider
	}

	key := g.Keys[provider]
	c, err := llm.NewForProvider(provider, "", model, key)
	if err != nil {
		// A misconfigured utility model turns the gates off; it does not stop
		// retrieval, and the caller sees Graded false as it should.
		return nil, ""
	}
	return NewUtility(c), model
}
