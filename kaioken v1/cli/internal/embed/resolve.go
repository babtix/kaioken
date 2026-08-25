package embed

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"kaioken/internal/llm"
)

// Embedding a whole corpus against a hosted API is slow and metered, and the
// vectors never leave the machine anyway, so a local server is the right answer
// whenever there is one. But "local first" must not mean "local silently": a
// corpus embedded against Ollama and then queried against a hosted model would
// compare vectors from two different spaces and return plausible nonsense. So
// the resolution reports which tier it landed on, and the surfaces show it.

// Source says where a resolved configuration came from.
type Source string

const (
	// SourceConfig means the user named a model explicitly. Always wins.
	SourceConfig Source = "config"
	// SourceLocal means a running local server was found serving one.
	SourceLocal Source = "local"
	// SourceHosted means neither of the above, and the hosted fallback applied.
	SourceHosted Source = "hosted"
	// SourceNone means no embedder is available; retrieval stays lexical.
	SourceNone Source = "none"
)

// Fallback is the hosted endpoint to use when nothing is configured and no
// local server is serving an embedding model. It is passed in rather than
// defaulted here so that no model id is buried in this package — which model
// to pay for is a deployment decision.
type Fallback struct {
	// Provider is a key in llm.Providers, e.g. "openrouter".
	Provider string
	// Model is the embedding model id to request from it.
	Model string
}

// Resolution is a Config plus the story of how it was chosen.
type Resolution struct {
	Config
	Source Source
	// Detail is a sentence for a settings page or a status line. Always set,
	// including when Source is SourceNone, where it explains what is missing.
	Detail string
}

// Enabled reports whether this resolution can actually embed.
func (r Resolution) Enabled() bool { return r.Source != SourceNone && r.Config.Enabled() }

// Resolve picks an embedding endpoint for a repo, cheapest and most private
// first: an explicit configuration, then a local server that is already
// running and already serving an embedding model, then the hosted fallback.
//
// Probing costs one round trip per local endpoint with a short timeout, and
// only happens when nothing is configured — so a configured install never pays
// for discovery, and an unconfigured one pays about a second, once.
func Resolve(ctx context.Context, repo string, fb Fallback) Resolution {
	if ec := ConfigFor(repo); ec.Enabled() {
		return Resolution{
			Config: ec,
			Source: SourceConfig,
			Detail: fmt.Sprintf("%s (configured)", ec.Model),
		}
	}

	if ec, detail, ok := discoverLocal(ctx); ok {
		return Resolution{Config: ec, Source: SourceLocal, Detail: detail}
	}

	if strings.TrimSpace(fb.Model) != "" {
		ec := WithEndpoint(Config{Provider: fb.Provider, Model: fb.Model})
		if ec.BaseURL != "" && ec.APIKey != "" {
			return Resolution{
				Config: ec,
				Source: SourceHosted,
				Detail: fmt.Sprintf("%s via %s", ec.Model, fb.Provider),
			}
		}
		if ec.APIKey == "" {
			return Resolution{
				Source: SourceNone,
				Detail: fmt.Sprintf("no local embedding model found, and %s has no API key", fb.Provider),
			}
		}
	}

	return Resolution{
		Source: SourceNone,
		Detail: "no embedding model — retrieval is lexical only " +
			"(with Ollama running: ollama pull nomic-embed-text)",
	}
}

// preferredLocal ranks local servers by how likely they are to be serving
// embeddings. Ollama leads because pulling an embedding model there is one
// command and most people who have one have it there.
var preferredLocal = []string{"ollama", "lmstudio", "llamacpp", "vllm", "jan"}

// preferredModels ranks embedding models by general retrieval quality. Matched
// as a prefix, because a local tag carries a suffix: Ollama reports
// nomic-embed-text as "nomic-embed-text:latest".
var preferredModels = []string{
	"nomic-embed-text",
	"mxbai-embed-large",
	"bge-m3",
	"snowflake-arctic-embed",
	"all-minilm",
}

// discoverLocal probes every known local endpoint and picks the best embedding
// model on offer. Selection is deterministic — model preference outranks
// server preference — so the same machine resolves the same way every run,
// which is what keeps a corpus and its queries in one vector space.
func discoverLocal(ctx context.Context) (Config, string, bool) {
	running := map[string]llm.LocalStatus{}
	for _, st := range llm.DiscoverLocal(ctx) {
		if st.Running && len(st.Models) > 0 {
			running[st.Name] = st
		}
	}
	if len(running) == 0 {
		return Config{}, "", false
	}

	pick := func(match func(string) bool) (Config, string, bool) {
		for _, name := range serversInPreferenceOrder(running) {
			st := running[name]
			for _, m := range st.Models {
				if !match(strings.ToLower(m)) {
					continue
				}
				return Config{
						Provider: st.Name,
						BaseURL:  strings.TrimSuffix(st.BaseURL, "/"),
						Model:    m,
					},
					fmt.Sprintf("%s via %s (local)", m, displayName(st)), true
			}
		}
		return Config{}, "", false
	}

	for _, want := range preferredModels {
		if ec, detail, ok := pick(func(m string) bool { return strings.HasPrefix(m, want) }); ok {
			return ec, detail, true
		}
	}
	// Anything with "embed" in the name is an embedding model. Generating text
	// with one produces garbage and embedding with a chat model produces
	// garbage, so the name is the only signal available and it is a good one.
	return pick(func(m string) bool { return strings.Contains(m, "embed") })
}

// serversInPreferenceOrder lists the running servers, known ones first in
// preference order, then any user-registered endpoint.
func serversInPreferenceOrder(running map[string]llm.LocalStatus) []string {
	var out []string
	seen := map[string]bool{}
	for _, name := range preferredLocal {
		if _, ok := running[name]; ok {
			out = append(out, name)
			seen[name] = true
		}
	}
	var rest []string
	for name := range running {
		if !seen[name] {
			rest = append(rest, name)
		}
	}
	// Sorted, not map order: an unranked endpoint must still resolve the same
	// way on every run, or a re-index could land in a different vector space.
	sort.Strings(rest)
	return append(out, rest...)
}

func displayName(st llm.LocalStatus) string {
	if st.Label != "" {
		return st.Label
	}
	return st.Name
}
