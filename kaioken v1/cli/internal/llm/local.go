package llm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"kaioken/internal/config"
)

// Local models are a different kind of provider, not just another entry in the
// registry. They need no API key, they may or may not be running right now,
// and the model list is whatever the user happened to pull — none of which the
// hosted-provider path handles. The differences are contained here so the rest
// of the system keeps treating a local endpoint like any other provider.

// LocalDefaults are the servers worth probing without being told to. Each
// speaks the OpenAI-compatible /chat/completions and /models shapes on a
// well-known port.
var LocalDefaults = []LocalProvider{
	{Name: "ollama", Label: "Ollama", BaseURL: "http://localhost:11434/v1", Docs: "https://ollama.com"},
	{Name: "lmstudio", Label: "LM Studio", BaseURL: "http://localhost:1234/v1", Docs: "https://lmstudio.ai"},
	{Name: "llamacpp", Label: "llama.cpp", BaseURL: "http://localhost:8080/v1", Docs: "https://github.com/ggml-org/llama.cpp"},
	{Name: "vllm", Label: "vLLM", BaseURL: "http://localhost:8000/v1", Docs: "https://docs.vllm.ai"},
	{Name: "jan", Label: "Jan", BaseURL: "http://localhost:1337/v1", Docs: "https://jan.ai"},
}

// LocalProvider describes one local inference server.
type LocalProvider struct {
	Name    string `json:"name"`
	Label   string `json:"label"`
	BaseURL string `json:"base_url"`
	Docs    string `json:"docs,omitempty"`
}

// IsLocal reports whether a provider name refers to a local endpoint — either
// a built-in default or one the user registered. Callers use it to skip the
// key requirement.
func IsLocal(name string) bool {
	loadUserLocals()
	localMu.RLock()
	defer localMu.RUnlock()
	if _, ok := localExtra[name]; ok {
		return true
	}
	for _, p := range LocalDefaults {
		if p.Name == name {
			return true
		}
	}
	return false
}

var (
	localMu    sync.RWMutex
	localExtra = map[string]LocalProvider{}
	localOnce  sync.Once
)

// loadUserLocals folds the user's configured endpoints into the registry on
// first use. Doing it lazily rather than from an init in every entry point
// means the CLI, the daemon, the TUI and the MCP server all see the same
// providers without any of them having to remember to bootstrap.
func loadUserLocals() {
	localOnce.Do(func() {
		for _, e := range config.LoadGlobal().Local {
			_ = RegisterLocal(LocalProvider{
				Name:    e.Name,
				BaseURL: e.BaseURL,
				Label:   e.Label,
			})
		}
	})
}

// RegisterLocal adds a user-defined local endpoint to the provider registry.
// Called once at startup from the global config, so a custom server behaves
// exactly like a built-in one everywhere downstream.
func RegisterLocal(p LocalProvider) error {
	name := strings.TrimSpace(strings.ToLower(p.Name))
	base := strings.TrimSuffix(strings.TrimSpace(p.BaseURL), "/")
	if name == "" || base == "" {
		return fmt.Errorf("local provider needs both a name and a base_url")
	}
	if _, taken := Providers[name]; taken && !IsLocal(name) {
		return fmt.Errorf("%q is already a built-in provider — pick another name", name)
	}
	p.Name, p.BaseURL = name, base

	localMu.Lock()
	localExtra[name] = p
	localMu.Unlock()

	// Registering into Providers is what makes NewForProvider, the model
	// catalog and the settings UI find it without any of them knowing about
	// local endpoints as a concept.
	Providers[name] = Provider{BaseURL: base}
	return nil
}

// LocalProviders lists every local endpoint: the built-in defaults plus
// whatever the user registered.
func LocalProviders() []LocalProvider {
	loadUserLocals()
	localMu.RLock()
	defer localMu.RUnlock()

	seen := map[string]bool{}
	out := make([]LocalProvider, 0, len(LocalDefaults)+len(localExtra))
	for _, p := range LocalDefaults {
		seen[p.Name] = true
		if custom, ok := localExtra[p.Name]; ok {
			// A user override of a default keeps the friendly label.
			if custom.Label == "" {
				custom.Label = p.Label
			}
			if custom.Docs == "" {
				custom.Docs = p.Docs
			}
			out = append(out, custom)
			continue
		}
		out = append(out, p)
	}
	for name, p := range localExtra {
		if !seen[name] {
			out = append(out, p)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// LocalStatus is what a probe found.
type LocalStatus struct {
	LocalProvider
	// Running reports whether the endpoint answered.
	Running bool `json:"running"`
	// Models are the ids it offers, empty when not running.
	Models []string `json:"models,omitempty"`
	// Error explains a failed probe in user terms.
	Error string `json:"error,omitempty"`
	// LatencyMS is how long the probe took, which is the one number that
	// predicts whether a local model is pleasant to use.
	LatencyMS int64 `json:"latency_ms,omitempty"`
}

// probeTimeout bounds one endpoint check. Short: this runs on a settings page
// against up to five endpoints, most of which are not running, and a refused
// connection should feel instant rather than like a hang.
const probeTimeout = 1500 * time.Millisecond

// ProbeLocal checks one endpoint and lists its models.
func ProbeLocal(ctx context.Context, p LocalProvider) LocalStatus {
	st := LocalStatus{LocalProvider: p}
	started := time.Now()

	ctx, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimSuffix(p.BaseURL, "/")+"/models", nil)
	if err != nil {
		st.Error = err.Error()
		return st
	}
	resp, err := (&http.Client{Timeout: probeTimeout}).Do(req)
	st.LatencyMS = time.Since(started).Milliseconds()
	if err != nil {
		st.Error = explainProbe(err, p)
		return st
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		st.Error = fmt.Sprintf("%s answered %s", p.BaseURL, resp.Status)
		return st
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		st.Error = err.Error()
		return st
	}
	var parsed struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
		// Ollama's native /api/tags shape, in case a user points at that path.
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		st.Error = "endpoint is not OpenAI-compatible: " + err.Error()
		return st
	}
	for _, m := range parsed.Data {
		st.Models = append(st.Models, m.ID)
	}
	for _, m := range parsed.Models {
		st.Models = append(st.Models, m.Name)
	}
	sort.Strings(st.Models)
	st.Running = true
	return st
}

// explainProbe turns a transport error into something a user can act on. "no
// server is running there" is the answer 90% of the time and the stdlib error
// buries it under a wrapped syscall.
func explainProbe(err error, p LocalProvider) string {
	var opErr *net.OpError
	if errors.As(err, &opErr) || strings.Contains(err.Error(), "connection refused") {
		return fmt.Sprintf("nothing listening at %s — start %s first", p.BaseURL, displayName(p))
	}
	if strings.Contains(err.Error(), "context deadline exceeded") {
		return fmt.Sprintf("%s did not answer within %s", p.BaseURL, probeTimeout)
	}
	return err.Error()
}

func displayName(p LocalProvider) string {
	if p.Label != "" {
		return p.Label
	}
	return p.Name
}

// DiscoverLocal probes every known local endpoint in parallel and returns what
// is actually running.
func DiscoverLocal(ctx context.Context) []LocalStatus {
	providers := LocalProviders()
	out := make([]LocalStatus, len(providers))

	var wg sync.WaitGroup
	for i, p := range providers {
		wg.Add(1)
		go func(i int, p LocalProvider) {
			defer wg.Done()
			out[i] = ProbeLocal(ctx, p)
		}(i, p)
	}
	wg.Wait()
	return out
}

// NewLocal builds a client for a local endpoint. The difference from
// NewForProvider is the whole point: no key is required, because a local
// server has nobody to bill.
func NewLocal(name, baseURLOverride, model string) (*Client, error) {
	base := strings.TrimSuffix(strings.TrimSpace(baseURLOverride), "/")
	if base == "" {
		for _, p := range LocalProviders() {
			if p.Name == name {
				base = p.BaseURL
				break
			}
		}
	}
	if base == "" {
		return nil, fmt.Errorf("no endpoint known for local provider %q — set base_url", name)
	}
	if strings.TrimSpace(model) == "" {
		return nil, fmt.Errorf("no model set — run `kaioken models %s` to see what %s is serving", name, name)
	}
	return &Client{
		// Some local servers reject a request with no Authorization header
		// even though they ignore the value; a placeholder costs nothing and
		// removes a confusing 401 from a server that has no auth at all.
		APIKey:  "local",
		BaseURL: base,
		Model:   model,
		// Local generation on CPU is slow in a way no hosted endpoint is: a
		// 30B model on a laptop can take minutes for a long reply, and the
		// hosted 300s ceiling would cut it off mid-sentence.
		HTTP: &http.Client{Timeout: 30 * time.Minute},
	}, nil
}
