package daemon

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"kaioken/internal/config"
	"kaioken/internal/llm"
	"kaioken/internal/research"
	"kaioken/internal/webfetch"
	"kaioken/internal/websearch"
)

// --- T061: Settings endpoints ---

type providerJSON struct {
	Name            string `json:"name"`
	BaseURL         string `json:"base_url"`
	KeyEnv          string `json:"key_env"`
	HasKey          bool   `json:"has_key"`
	KeySource       string `json:"key_source"` // config | env | local | none
	Hint            string `json:"hint,omitempty"`
	RequiresBaseURL bool   `json:"requires_base_url,omitempty"`
	// Local marks an endpoint running on the user's own machine: no key, no
	// spend, and availability that depends on whether the server is up.
	Local bool `json:"local,omitempty"`
}

// searchProviderJSON describes one web-search vendor for the settings UI.
type searchProviderJSON struct {
	Name      string `json:"name"`
	KeyEnv    string `json:"key_env"`
	Signup    string `json:"signup"`
	HasKey    bool   `json:"has_key"`
	KeySource string `json:"key_source"` // config | env | none
	Hint      string `json:"hint,omitempty"`
}

// searchSettings builds the web-search section of GET /v1/settings.
func searchSettings(g *config.Global) map[string]any {
	names := make([]string, 0, len(websearch.Registry))
	for name := range websearch.Registry {
		names = append(names, name)
	}
	sort.Strings(names)

	providers := make([]searchProviderJSON, 0, len(names))
	for _, name := range names {
		info := websearch.Registry[name]
		sp := searchProviderJSON{Name: name, KeyEnv: info.KeyEnv, Signup: info.Signup, KeySource: "none"}
		if key := g.Keys[name]; key != "" {
			sp.HasKey = true
			sp.KeySource = "config"
			sp.Hint = keyHint(key)
		} else if envKey := os.Getenv(info.KeyEnv); envKey != "" {
			sp.HasKey = true
			sp.KeySource = "env"
			sp.Hint = keyHint(envKey)
		}
		providers = append(providers, sp)
	}
	return map[string]any{
		"provider":  g.Research.SearchProvider,
		"providers": providers,
	}
}

// GET /v1/settings
func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	g := config.LoadGlobal()
	providers := make([]providerJSON, 0, len(llm.Providers))
	for name, p := range llm.Providers {
		pj := providerJSON{
			Name: name, BaseURL: p.BaseURL, KeyEnv: p.KeyEnv, KeySource: "none",
			RequiresBaseURL: p.RequiresBaseURL,
			Local:           llm.IsLocal(name),
		}
		// A local endpoint needs no key, so the settings UI must not render it
		// as unconfigured — it is ready as soon as the server is running.
		if pj.Local {
			pj.HasKey = true
			pj.KeySource = "local"
		} else if key := g.Keys[name]; key != "" {
			pj.HasKey = true
			pj.KeySource = "config"
			pj.Hint = keyHint(key)
		} else if envKey := os.Getenv(p.KeyEnv); envKey != "" {
			pj.HasKey = true
			pj.KeySource = "env"
			pj.Hint = keyHint(envKey)
		}
		providers = append(providers, pj)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"default_provider": g.DefaultProvider,
		"default_model":    g.DefaultModel,
		"config_path":      config.GlobalPath(),
		"providers":        providers,
		"search":           searchSettings(g),
		"embed":            embedSettings(g),
		"fetcher":          fetcherSettings(g),
	})
}

// fetcherSettings reports how research reads pages, so the UI can show the
// tier that will actually run rather than only the value on disk. The two can
// differ: auto downgrades silently when no browser is installed, and a
// Firecrawl key is what turns the scraper on.
func fetcherSettings(g *config.Global) map[string]any {
	detail, ok := research.DescribeFetcher(g)
	api, local := research.FetcherToggles(g.Research.FetcherMode)

	browser, browserErr := webfetch.BrowserPath()
	out := map[string]any{
		"mode":  g.Research.FetcherMode, // "" means auto
		"modes": research.FetcherModes,
		// The same setting as two independent switches, which is how the
		// settings surfaces present it.
		"api":              api,
		"local":            local,
		"detail":           detail,
		"ok":               ok,
		"browser":          browser,
		"firecrawl_key":    false,
		"firecrawl_env":    websearch.Registry["firecrawl"].KeyEnv,
		"firecrawl_signup": websearch.Registry["firecrawl"].Signup,
	}
	if browserErr != nil {
		out["browser_error"] = browserErr.Error()
	}
	if key := websearch.KeyFor("firecrawl", g.Keys); key != "" {
		out["firecrawl_key"] = true
		out["firecrawl_key_source"] = "env"
		if strings.TrimSpace(g.Keys["firecrawl"]) != "" {
			out["firecrawl_key_source"] = "config"
		}
		out["firecrawl_hint"] = keyHint(key)
	}
	return out
}

// embedSettings reports the retrieval configuration, so the UI can say whether
// search is hybrid or lexical and offer to make it hybrid.
func embedSettings(g *config.Global) map[string]any {
	return map[string]any{
		"model":    g.Search.EmbedModel,
		"provider": g.Search.EmbedProvider,
		"base_url": g.Search.EmbedBaseURL,
		"enabled":  strings.TrimSpace(g.Search.EmbedModel) != "",
	}
}

// GET /v1/settings/local
//
// Probes every known local inference server in parallel and reports which are
// running and what they serve. Separate from GET /v1/settings because it
// touches the network: the settings page must render instantly whether or not
// five endpoints are refusing connections.
func (s *Server) handleLocalProviders(w http.ResponseWriter, r *http.Request) {
	found := llm.DiscoverLocal(r.Context())
	running := 0
	for _, st := range found {
		if st.Running {
			running++
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"providers": found,
		"running":   running,
	})
}

// POST /v1/settings/local — register a custom local endpoint.
func (s *Server) handleAddLocalProvider(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name    string `json:"name"`
		BaseURL string `json:"base_url"`
		Label   string `json:"label"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "invalid JSON", "")
		return
	}
	entry := config.LocalEndpoint{
		Name:    strings.ToLower(strings.TrimSpace(body.Name)),
		BaseURL: strings.TrimSpace(body.BaseURL),
		Label:   strings.TrimSpace(body.Label),
	}
	if err := llm.RegisterLocal(llm.LocalProvider{
		Name: entry.Name, BaseURL: entry.BaseURL, Label: entry.Label,
	}); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, err.Error(), "")
		return
	}

	g := config.LoadGlobal()
	replaced := false
	for i, e := range g.Local {
		if e.Name == entry.Name {
			g.Local[i] = entry
			replaced = true
			break
		}
	}
	if !replaced {
		g.Local = append(g.Local, entry)
	}
	if err := g.Save(); err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}

	st := llm.ProbeLocal(r.Context(), llm.LocalProvider{
		Name: entry.Name, BaseURL: entry.BaseURL, Label: entry.Label,
	})
	writeJSON(w, http.StatusOK, st)
}

// PUT /v1/settings/embed — set the embedding model that upgrades search from
// BM25 to hybrid. An empty model turns the semantic half back off, which is a
// supported state rather than a broken one.
func (s *Server) handlePutEmbed(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Model    string `json:"model"`
		Provider string `json:"provider"`
		BaseURL  string `json:"base_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "invalid JSON", "")
		return
	}
	g := config.LoadGlobal()
	g.Search.EmbedModel = strings.TrimSpace(body.Model)
	g.Search.EmbedProvider = strings.TrimSpace(body.Provider)
	g.Search.EmbedBaseURL = strings.TrimSpace(body.BaseURL)
	if err := g.Save(); err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	writeJSON(w, http.StatusOK, embedSettings(g))
}

// PUT /v1/settings
func (s *Server) handlePutSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		DefaultProvider string `json:"default_provider"`
		DefaultModel    string `json:"default_model"`
		// Pointer, because "" is a meaningful value here: it resets the
		// search selection back to "every provider with a key".
		SearchProvider *string `json:"search_provider"`
		// Pointer for the same reason: "" resets the page-reading tier to
		// auto, which is a choice and not an absence.
		FetcherMode *string `json:"fetcher_mode"`
		// The same setting expressed as the two switches a settings screen
		// shows. Sending one flips it and leaves the other alone, so a UI
		// does not have to know the mode names to toggle half of it.
		FetcherAPI   *bool `json:"fetcher_api"`
		FetcherLocal *bool `json:"fetcher_local"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "invalid JSON", "")
		return
	}
	g := config.LoadGlobal()
	if body.DefaultProvider != "" {
		g.DefaultProvider = body.DefaultProvider
	}
	if body.DefaultModel != "" {
		g.DefaultModel = body.DefaultModel
	}
	if body.SearchProvider != nil {
		sel, err := validSearchSelection(*body.SearchProvider)
		if err != nil {
			writeError(w, http.StatusBadRequest, codeBadRequest, err.Error(), "")
			return
		}
		g.Research.SearchProvider = sel
	}
	if body.FetcherMode != nil {
		mode := strings.ToLower(strings.TrimSpace(*body.FetcherMode))
		if mode == "auto" {
			// Store the default as empty, matching how the config file reads
			// when the user has never touched it.
			mode = ""
		}
		if !research.ValidFetcherMode(mode) {
			writeError(w, http.StatusBadRequest, codeBadRequest,
				fmt.Sprintf("unknown fetcher mode %q (want %s)", *body.FetcherMode,
					strings.Join(research.FetcherModes, ", ")), "")
			return
		}
		g.Research.FetcherMode = mode
	}
	if body.FetcherAPI != nil || body.FetcherLocal != nil {
		api, local := research.FetcherToggles(g.Research.FetcherMode)
		if body.FetcherAPI != nil {
			api = *body.FetcherAPI
		}
		if body.FetcherLocal != nil {
			local = *body.FetcherLocal
		}
		g.Research.FetcherMode = research.FetcherModeFor(api, local)
	}
	if err := g.Save(); err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"default_provider": g.DefaultProvider,
		"default_model":    g.DefaultModel,
		"search_provider":  g.Research.SearchProvider,
		"fetcher":          fetcherSettings(g),
	})
}

// validSearchSelection normalises and validates a search_provider value:
// empty/auto/both/all pass through, anything else must be a comma/plus list
// of registered vendor names.
func validSearchSelection(sel string) (string, error) {
	sel = strings.ToLower(strings.TrimSpace(sel))
	switch sel {
	case "", "auto", "both", "all":
		return sel, nil
	}
	for _, name := range strings.FieldsFunc(sel, func(r rune) bool { return r == ',' || r == '+' || r == ' ' }) {
		if _, ok := websearch.Registry[name]; !ok {
			return "", fmt.Errorf("unknown search provider %q", name)
		}
	}
	return sel, nil
}

// PUT /v1/settings/keys/{provider}
func (s *Server) handlePutKey(w http.ResponseWriter, r *http.Request) {
	prov := r.PathValue("provider")
	var body struct {
		Key string `json:"key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Key) == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "key is required", "")
		return
	}
	g := config.LoadGlobal()
	// A paste often drags a trailing newline along; the API rejects the
	// resulting header with a confusing 401, so strip it at the door.
	g.Keys[prov] = strings.TrimSpace(body.Key)
	if err := g.Save(); err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	// Cached clients were built with the old key — drop them so the next
	// request picks up the new one without a daemon restart.
	s.mgr.RebuildAllConfig()
	w.WriteHeader(http.StatusNoContent)
}

// DELETE /v1/settings/keys/{provider}
func (s *Server) handleDeleteKey(w http.ResponseWriter, r *http.Request) {
	prov := r.PathValue("provider")
	g := config.LoadGlobal()
	delete(g.Keys, prov)
	if err := g.Save(); err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	// Same as a key change: cached clients must not keep the deleted key.
	s.mgr.RebuildAllConfig()
	w.WriteHeader(http.StatusNoContent)
}

// POST /v1/settings/keys/{provider}/test
func (s *Server) handleTestKey(w http.ResponseWriter, r *http.Request) {
	prov := r.PathValue("provider")

	// Search vendors are tested with a probe search — llm.NewForProvider
	// knows nothing about them.
	if _, isSearch := websearch.Registry[prov]; isSearch {
		g := config.LoadGlobal()
		if websearch.KeyFor(prov, g.Keys) == "" {
			writeError(w, http.StatusConflict, codeNoAPIKey, "no key configured for "+prov, "")
			return
		}
		p, err := websearch.Resolve(prov, g.Keys)
		if err != nil {
			writeError(w, http.StatusConflict, codeNoAPIKey, err.Error(), "")
			return
		}
		hits, err := p.Search(r.Context(), "kaioken", 1)
		if err != nil {
			writeError(w, http.StatusBadGateway, codeProviderError, err.Error(), "")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "results": len(hits)})
		return
	}

	g := config.LoadGlobal()
	key := g.Keys[prov]
	if key == "" {
		if p, ok := llm.Providers[prov]; ok {
			key = os.Getenv(p.KeyEnv)
		}
	}
	if key == "" {
		writeError(w, http.StatusConflict, codeNoAPIKey, "no key configured for "+prov, "")
		return
	}
	client, err := llm.NewForProvider(prov, "", "test", key)
	if err != nil {
		writeError(w, http.StatusConflict, codeNoAPIKey, err.Error(), "")
		return
	}
	models, err := client.ListModels(r.Context(), "")
	if err != nil {
		writeError(w, http.StatusBadGateway, codeProviderError, err.Error(), "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "models": len(models)})
}

// --- T062: Models endpoint ---

type cachedModels struct {
	at   time.Time
	list []llm.ModelInfo
}

var (
	modelsCache   = map[string]cachedModels{}
	modelsCacheMu sync.Mutex
)

// GET /v1/models
func (s *Server) handleModels(w http.ResponseWriter, r *http.Request) {
	prov := r.URL.Query().Get("provider")
	if prov == "" {
		prov = "openrouter"
	}
	filter := r.URL.Query().Get("filter")
	refresh := r.URL.Query().Get("refresh") == "true"

	modelsCacheMu.Lock()
	cached, ok := modelsCache[prov]
	if !refresh && ok && time.Since(cached.at) < 10*time.Minute {
		modelsCacheMu.Unlock()
		writeModelsResponse(w, prov, cached.list, filter)
		return
	}
	modelsCacheMu.Unlock()

	// Fetch from provider.
	g := config.LoadGlobal()
	key := g.Keys[prov]
	if key == "" {
		if p, pok := llm.Providers[prov]; pok {
			key = os.Getenv(p.KeyEnv)
		}
	}
	if key == "" {
		writeError(w, http.StatusConflict, codeNoAPIKey, "no key for "+prov, "")
		return
	}
	client, err := llm.NewForProvider(prov, "", "list", key)
	if err != nil {
		writeError(w, http.StatusConflict, codeNoAPIKey, err.Error(), "")
		return
	}
	models, err := client.ListModels(r.Context(), "")
	if err != nil {
		writeError(w, http.StatusBadGateway, codeProviderError, err.Error(), "")
		return
	}

	modelsCacheMu.Lock()
	modelsCache[prov] = cachedModels{at: time.Now(), list: models}
	modelsCacheMu.Unlock()

	writeModelsResponse(w, prov, models, filter)
}

func writeModelsResponse(w http.ResponseWriter, prov string, models []llm.ModelInfo, filter string) {
	type modelJSON struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	var out []modelJSON
	for _, m := range models {
		if filter != "" && !strings.Contains(strings.ToLower(m.ID), strings.ToLower(filter)) {
			continue
		}
		out = append(out, modelJSON{ID: m.ID, Name: m.Name})
	}
	writeJSON(w, http.StatusOK, map[string]any{"provider": prov, "models": out, "count": len(out)})
}

// keyHint shows first 5 + last 4 chars when key >= 12 chars.
func keyHint(key string) string {
	if len(key) < 12 {
		return ""
	}
	return key[:5] + "…" + key[len(key)-4:]
}
