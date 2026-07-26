package daemon

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"kaioken/internal/config"
	"kaioken/internal/llm"
)

// --- T061: Settings endpoints ---

type providerJSON struct {
	Name            string `json:"name"`
	BaseURL         string `json:"base_url"`
	KeyEnv          string `json:"key_env"`
	HasKey          bool   `json:"has_key"`
	KeySource       string `json:"key_source"` // config | env | none
	Hint            string `json:"hint,omitempty"`
	RequiresBaseURL bool   `json:"requires_base_url,omitempty"`
}

// GET /v1/settings
func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	g := config.LoadGlobal()
	providers := make([]providerJSON, 0, len(llm.Providers))
	for name, p := range llm.Providers {
		pj := providerJSON{
			Name: name, BaseURL: p.BaseURL, KeyEnv: p.KeyEnv, KeySource: "none",
			RequiresBaseURL: p.RequiresBaseURL,
		}
		key := g.Keys[name]
		if key != "" {
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
	})
}

// PUT /v1/settings
func (s *Server) handlePutSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		DefaultProvider string `json:"default_provider"`
		DefaultModel    string `json:"default_model"`
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
	if err := g.Save(); err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"default_provider": g.DefaultProvider, "default_model": g.DefaultModel})
}

// PUT /v1/settings/keys/{provider}
func (s *Server) handlePutKey(w http.ResponseWriter, r *http.Request) {
	prov := r.PathValue("provider")
	var body struct {
		Key string `json:"key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Key == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "key is required", "")
		return
	}
	g := config.LoadGlobal()
	g.Keys[prov] = body.Key
	if err := g.Save(); err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
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
	w.WriteHeader(http.StatusNoContent)
}

// POST /v1/settings/keys/{provider}/test
func (s *Server) handleTestKey(w http.ResponseWriter, r *http.Request) {
	prov := r.PathValue("provider")
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
