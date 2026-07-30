package search

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"
	"time"

	"kaioken/internal/config"
	"kaioken/internal/llm"
)

// Embeddings ride on the OpenAI-compatible /embeddings shape, which is what
// OpenAI, Together, DeepInfra, Mistral, Voyage and — the one that matters
// most here — a local Ollama all speak. That means the semantic half of
// search can run entirely offline against nomic-embed-text with no key.

// Embedder turns text into vectors.
type Embedder interface {
	// Embed returns one vector per input, in order.
	Embed(ctx context.Context, texts []string) ([][]float32, error)
	// ID identifies the model, so a changed model invalidates stored vectors
	// instead of silently comparing incompatible spaces.
	ID() string
	// Dims is the vector width, for sanity-checking a loaded index.
	Dims() int
}

// EmbedConfig describes where to get embeddings. Zero value means disabled,
// which leaves search lexical-only.
type EmbedConfig struct {
	// Provider is a key in llm.Providers, or empty to use BaseURL directly.
	Provider string
	// BaseURL overrides the provider default.
	BaseURL string
	// Model is the embedding model id.
	Model string
	// APIKey authenticates; local endpoints leave it empty.
	APIKey string
}

// Enabled reports whether a model was configured.
func (c EmbedConfig) Enabled() bool { return strings.TrimSpace(c.Model) != "" }

// EmbedConfigFor resolves the embedding setup for a repo: workspace config
// first, then the global defaults, then the key store. Returns a disabled
// config when no embedding model is set anywhere — the common case, and not
// an error.
func EmbedConfigFor(repo string) EmbedConfig {
	g := config.LoadGlobal()
	cfg, err := config.Load(repo)
	if err != nil {
		cfg = config.Default()
	}

	ec := EmbedConfig{
		Provider: cfg.Search.EmbedProvider,
		BaseURL:  cfg.Search.EmbedBaseURL,
		Model:    cfg.Search.EmbedModel,
	}
	if ec.Model == "" {
		ec.Model = g.Search.EmbedModel
	}
	if ec.Provider == "" {
		ec.Provider = g.Search.EmbedProvider
	}
	if ec.BaseURL == "" {
		ec.BaseURL = g.Search.EmbedBaseURL
	}
	if ec.Provider != "" {
		ec.APIKey = g.Keys[ec.Provider]
		if ec.APIKey == "" {
			if p, ok := llm.Providers[ec.Provider]; ok && p.KeyEnv != "" {
				ec.APIKey = envOr(p.KeyEnv)
			}
		}
		if ec.BaseURL == "" {
			if p, ok := llm.Providers[ec.Provider]; ok {
				ec.BaseURL = p.BaseURL
			}
		}
	}
	return ec
}

// httpEmbedder calls an OpenAI-compatible /embeddings endpoint.
type httpEmbedder struct {
	baseURL string
	model   string
	apiKey  string
	http    *http.Client
	dims    int
}

// NewEmbedder builds an embedder, or returns nil when embeddings are off.
func NewEmbedder(c EmbedConfig) (Embedder, error) {
	if !c.Enabled() {
		return nil, nil
	}
	base := strings.TrimSuffix(strings.TrimSpace(c.BaseURL), "/")
	if base == "" {
		return nil, fmt.Errorf("embedding model %q has no endpoint — set search.embed_provider or search.embed_base_url", c.Model)
	}
	return &httpEmbedder{
		baseURL: base,
		model:   strings.TrimSpace(c.Model),
		apiKey:  c.APIKey,
		http:    &http.Client{Timeout: 120 * time.Second},
	}, nil
}

func (e *httpEmbedder) ID() string { return e.model + "@" + e.baseURL }
func (e *httpEmbedder) Dims() int  { return e.dims }

// embedBatch is how many passages go in one request. Large enough to amortise
// round trips, small enough that a local model with a modest batch limit and
// a 120s timeout still finishes.
const embedBatch = 32

func (e *httpEmbedder) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	out := make([][]float32, 0, len(texts))
	for start := 0; start < len(texts); start += embedBatch {
		end := start + embedBatch
		if end > len(texts) {
			end = len(texts)
		}
		vecs, err := e.embedOnce(ctx, texts[start:end])
		if err != nil {
			return nil, err
		}
		out = append(out, vecs...)
	}
	return out, nil
}

func (e *httpEmbedder) embedOnce(ctx context.Context, texts []string) ([][]float32, error) {
	body, err := json.Marshal(map[string]any{"model": e.model, "input": texts})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, e.baseURL+"/embeddings", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if e.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+e.apiKey)
	}

	resp, err := e.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("embedding request: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("embedding endpoint %s: %s: %s",
			e.baseURL, resp.Status, strings.TrimSpace(truncate(string(raw), 300)))
	}

	var parsed struct {
		Data []struct {
			Index     int       `json:"index"`
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("parsing embedding response: %w", err)
	}
	if len(parsed.Data) != len(texts) {
		return nil, fmt.Errorf("embedding endpoint returned %d vectors for %d inputs", len(parsed.Data), len(texts))
	}

	// The spec says results carry their input index; not every server sorts
	// them, so place by index rather than trusting order.
	out := make([][]float32, len(texts))
	for _, d := range parsed.Data {
		idx := d.Index
		if idx < 0 || idx >= len(out) {
			return nil, fmt.Errorf("embedding response index %d out of range", idx)
		}
		out[idx] = normalize(d.Embedding)
	}
	for i, v := range out {
		if v == nil {
			return nil, fmt.Errorf("embedding response missing vector %d", i)
		}
		if e.dims == 0 {
			e.dims = len(v)
		}
	}
	return out, nil
}

// normalize scales to unit length so cosine similarity is a plain dot
// product, which is the whole inner loop of a query.
func normalize(v []float32) []float32 {
	var sum float64
	for _, x := range v {
		sum += float64(x) * float64(x)
	}
	if sum == 0 {
		return v
	}
	inv := float32(1 / math.Sqrt(sum))
	for i := range v {
		v[i] *= inv
	}
	return v
}

// dot is cosine similarity for already-normalised vectors. Mismatched widths
// score zero rather than panicking: a stale index should degrade to lexical,
// not crash a search.
func dot(a, b []float32) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}
	var sum float32
	for i := range a {
		sum += a[i] * b[i]
	}
	return float64(sum)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
