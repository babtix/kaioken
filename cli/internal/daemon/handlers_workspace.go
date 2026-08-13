package daemon

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"kaioken/internal/config"
	"kaioken/internal/gitx"
	"kaioken/internal/llm"
)

// workspaceJSON is the §2.4 Workspace object.
type workspaceJSON struct {
	ID         string    `json:"id"`
	Path       string    `json:"path"`
	Name       string    `json:"name"`
	LastOpened time.Time `json:"last_opened"`
	HasConfig  bool      `json:"has_config"`
	ConfigPath string    `json:"config_path"`
	Git        GitInfo   `json:"git"`
	Knowledge  Knowledge `json:"knowledge"`
	Model      string    `json:"model"`
	Provider   string    `json:"provider"`
	AllowRun   bool      `json:"allow_run"`
}

func (s *Server) workspaceResponse(ws *Workspace) workspaceJSON {
	repo := filepath.FromSlash(ws.Path)
	name := filepath.Base(repo)

	resp := workspaceJSON{
		ID:         ws.ID,
		Path:       ws.Path,
		Name:       name,
		LastOpened: time.Now(),
		HasConfig:  ws.HasConfig(),
		ConfigPath: config.Dir + "/config.yaml",
		Knowledge:  ws.KnowledgeSummary(),
		AllowRun:   ws.AllowRun(),
	}

	// Git info
	resp.Git = gitInfo(repo)

	// Model/provider from config
	if cfg := ws.Config(); cfg != nil {
		resp.Model = cfg.Model
		resp.Provider = cfg.Provider
		if resp.Provider == "" {
			resp.Provider = "openrouter"
		}
	}

	return resp
}

// gitInfo gathers the git sub-object for a repository path.
func gitInfo(repo string) GitInfo {
	var gi GitInfo
	if !gitx.IsRepo(repo) {
		return gi
	}
	gi.IsRepo = true
	if head, err := gitx.Head(context.Background(), repo); err == nil {
		gi.Head = head
		gi.Short = gitx.Short(head)
	}
	// Branch
	if branch, err := gitx.Branch(repo); err == nil {
		gi.Branch = branch
	}
	// Dirty count
	gi.DirtyCount = gitx.DirtyCount(repo)
	// Hook
	gi.HookInstalled = gitx.PostCommitInstalled(repo)
	return gi
}

// GET /v1/workspaces
func (s *Server) handleListWorkspaces(w http.ResponseWriter, r *http.Request) {
	list := s.mgr.List()
	out := make([]workspaceJSON, 0, len(list))
	for _, ws := range list {
		out = append(out, s.workspaceResponse(ws))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"workspaces": out,
		"recents":    s.mgr.Recents(),
	})
}

// POST /v1/workspaces
func (s *Server) handleOpenWorkspace(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Path == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "path is required", "")
		return
	}
	ws, err := s.mgr.Open(body.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, err.Error(), "")
		return
	}
	resp := s.workspaceResponse(ws)
	s.hub.Publish("workspace.opened", map[string]any{"workspace": resp})
	writeJSON(w, http.StatusCreated, resp)
}

// GET /v1/workspaces/{id}
func (s *Server) handleGetWorkspace(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ws, ok := s.mgr.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, codeWorkspaceNotFound, "no workspace with id "+id, "open it first with POST /v1/workspaces")
		return
	}
	writeJSON(w, http.StatusOK, s.workspaceResponse(ws))
}

// DELETE /v1/workspaces/{id}
func (s *Server) handleDeleteWorkspace(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, ok := s.mgr.Get(id); !ok {
		writeError(w, http.StatusNotFound, codeWorkspaceNotFound, "no workspace with id "+id, "")
		return
	}
	forget := r.URL.Query().Get("forget") == "true"
	s.mgr.Close(id, forget)
	s.hub.Publish("workspace.closed", map[string]any{"workspace_id": id})
	w.WriteHeader(http.StatusNoContent)
}

// POST /v1/workspaces/{id}/init
func (s *Server) handleInitWorkspace(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ws, ok := s.mgr.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, codeWorkspaceNotFound, "no workspace with id "+id, "")
		return
	}
	repo := filepath.FromSlash(ws.Path)
	if _, err := os.Stat(config.Path(repo)); err == nil {
		writeError(w, http.StatusConflict, "already_initialized", "config.yaml already exists", "")
		return
	}

	var body struct {
		Model string `json:"model"`
	}
	// Body is optional.
	_ = json.NewDecoder(r.Body).Decode(&body)

	cfg := config.Default()
	if body.Model != "" {
		cfg.Model = body.Model
	}
	if err := cfg.Save(repo); err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	ws.RebuildConfig()
	s.hub.Publish("workspace.changed", map[string]any{"workspace_id": id, "fields": []string{"config"}})
	writeJSON(w, http.StatusCreated, s.workspaceResponse(ws))
}

// --- T015: scan, status, git, hook ---

// workspaceFromRequest extracts the workspace from {id}, writing a 404 and
// returning nil when unknown.
func (s *Server) workspaceFromRequest(w http.ResponseWriter, r *http.Request) *Workspace {
	id := r.PathValue("id")
	ws, ok := s.mgr.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, codeWorkspaceNotFound, "no workspace with id "+id, "")
		return nil
	}
	return ws
}

// GET /v1/workspaces/{id}/scan
func (s *Server) handleScan(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	refresh := r.URL.Query().Get("refresh") == "true"
	res, err := ws.ScanCached(refresh)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}

	// Build language breakdown from ByExt.
	type langEntry struct {
		Lang  string `json:"lang"`
		Files int    `json:"files"`
		Bytes int64  `json:"bytes"`
	}
	langMap := map[string]*langEntry{}
	for _, f := range res.Files {
		lang := extToLang(f.Ext)
		le, ok := langMap[lang]
		if !ok {
			le = &langEntry{Lang: lang}
			langMap[lang] = le
		}
		le.Files++
		le.Bytes += f.Size
	}
	langs := make([]langEntry, 0, len(langMap))
	for _, le := range langMap {
		langs = append(langs, *le)
	}
	// Sort by file count descending.
	for i := 0; i < len(langs); i++ {
		for j := i + 1; j < len(langs); j++ {
			if langs[j].Files > langs[i].Files {
				langs[i], langs[j] = langs[j], langs[i]
			}
		}
	}

	cached := !refresh && time.Since(ws.scanAt) < 60*time.Second
	writeJSON(w, http.StatusOK, map[string]any{
		"root":       ws.Path,
		"files":      len(res.Files),
		"bytes":      res.TotalSize,
		"stats":      res.Stats(),
		"languages":  langs,
		"tree":       res.TreeSummary(8),
		"scanned_at": ws.scanAt.Format(time.RFC3339),
		"cached":     cached,
	})
}

// GET /v1/workspaces/{id}/files?q=&limit=
//
// Path completion for the composer's "@" mentions. It serves the cached
// scan's file list rather than walking the repo, so it costs nothing on a
// keystroke, and it respects the workspace's configured scope for free —
// a file the scanner excludes is one the agent cannot read anyway.
func (s *Server) handleFiles(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	res, err := ws.ScanCached(false)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}

	q := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	limit := 20
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}

	type scored struct {
		path  string
		lines int
		rank  int
	}
	matches := make([]scored, 0, limit)
	for _, f := range res.Files {
		rank, ok := rankPath(strings.ToLower(f.Path), q)
		if !ok {
			continue
		}
		matches = append(matches, scored{path: f.Path, lines: f.Lines, rank: rank})
	}

	// Best rank first; ties broken by the shorter path, which is almost
	// always the one the user meant.
	sort.Slice(matches, func(i, j int) bool {
		if matches[i].rank != matches[j].rank {
			return matches[i].rank > matches[j].rank
		}
		if len(matches[i].path) != len(matches[j].path) {
			return len(matches[i].path) < len(matches[j].path)
		}
		return matches[i].path < matches[j].path
	})
	if len(matches) > limit {
		matches = matches[:limit]
	}

	type fileJSON struct {
		Path  string `json:"path"`
		Name  string `json:"name"`
		Lines int    `json:"lines"`
	}
	out := make([]fileJSON, 0, len(matches))
	for _, m := range matches {
		out = append(out, fileJSON{Path: m.path, Name: path.Base(m.path), Lines: m.lines})
	}
	writeJSON(w, http.StatusOK, map[string]any{"query": q, "files": out})
}

// rankPath scores a repo-relative path against a lowercased query. Higher is
// better; ok is false when it does not match at all. An empty query matches
// everything so the menu has something to show before the first keystroke.
func rankPath(lowerPath, q string) (int, bool) {
	if q == "" {
		return 0, true
	}
	base := path.Base(lowerPath)
	switch {
	case base == q:
		return 5, true
	case strings.HasPrefix(base, q):
		return 4, true
	case strings.HasPrefix(lowerPath, q):
		return 3, true
	case strings.Contains(base, q):
		return 2, true
	case strings.Contains(lowerPath, q):
		return 1, true
	}
	return 0, false
}

// GET /v1/workspaces/{id}/status
func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	if !ws.HasConfig() {
		writeError(w, http.StatusConflict, codeNoConfig, "no config.yaml — call /init first", "")
		return
	}
	modules, err := ws.StatusModules()
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"modules": modules})
}

// GET /v1/workspaces/{id}/git
func (s *Server) handleGit(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	writeJSON(w, http.StatusOK, gitInfo(filepath.FromSlash(ws.Path)))
}

// POST /v1/workspaces/{id}/hook
func (s *Server) handleHook(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	var body struct {
		Action string `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Action == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "action is required (install|remove)", "")
		return
	}
	repo := filepath.FromSlash(ws.Path)
	switch body.Action {
	case "install":
		exe, err := os.Executable()
		if err != nil {
			writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
			return
		}
		path, err := gitx.InstallPostCommit(repo, exe)
		if err != nil {
			writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"installed": true, "path": filepath.ToSlash(path)})
	case "remove":
		removed, err := gitx.RemovePostCommit(repo)
		if err != nil {
			writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"installed": false, "removed": removed})
	default:
		writeError(w, http.StatusBadRequest, codeBadRequest, "action must be install or remove", "")
	}
}

// --- T016: config endpoints ---

// configJSON mirrors config.Config for the API response.
type configJSON struct {
	Version              int          `json:"version"`
	Model                string       `json:"model"`
	Provider             string       `json:"provider"`
	BaseURL              string       `json:"base_url"`
	Concurrency          int          `json:"concurrency"`
	EffectiveConcurrency int          `json:"effective_concurrency"`
	ConcurrencyClamped   bool         `json:"concurrency_clamped"`
	MaxModuleTokens      int          `json:"max_module_tokens"`
	MaxTokens            int          `json:"max_tokens"`
	Scope                config.Scope `json:"scope"`
	Notes                []string     `json:"notes"`
	AllowRun             bool         `json:"allow_run"`
}

func configResponse(ws *Workspace) configJSON {
	cfg := ws.Config()
	if cfg == nil {
		return configJSON{}
	}
	eff, clamped := cfg.EffectiveConcurrency(cfg.Model)
	provider := cfg.Provider
	if provider == "" {
		provider = "openrouter"
	}
	notes := cfg.Notes
	if notes == nil {
		notes = []string{}
	}
	return configJSON{
		Version:              cfg.Version,
		Model:                cfg.Model,
		Provider:             provider,
		BaseURL:              cfg.BaseURL,
		Concurrency:          cfg.Concurrency,
		EffectiveConcurrency: eff,
		ConcurrencyClamped:   clamped,
		MaxModuleTokens:      cfg.MaxModuleTokens,
		MaxTokens:            cfg.MaxTokens,
		Scope:                cfg.Scope,
		Notes:                notes,
		AllowRun:             ws.AllowRun(),
	}
}

// GET /v1/workspaces/{id}/config
func (s *Server) handleGetConfig(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	if !ws.HasConfig() {
		writeError(w, http.StatusConflict, codeNoConfig, "no config.yaml — call /init first", "")
		return
	}
	writeJSON(w, http.StatusOK, configResponse(ws))
}

// PUT /v1/workspaces/{id}/config
func (s *Server) handlePutConfig(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	if !ws.HasConfig() {
		writeError(w, http.StatusConflict, codeNoConfig, "no config.yaml — call /init first", "")
		return
	}

	var body configJSON
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "invalid JSON body", "")
		return
	}

	// Validate.
	if body.Concurrency < 1 {
		writeError(w, http.StatusBadRequest, codeBadRequest, "concurrency must be >= 1", "")
		return
	}
	if body.MaxModuleTokens < 4000 {
		writeError(w, http.StatusBadRequest, codeBadRequest, "max_module_tokens must be >= 4000", "")
		return
	}
	if body.Provider != "" {
		if _, ok := llm.Providers[body.Provider]; !ok && body.BaseURL == "" {
			writeError(w, http.StatusBadRequest, codeBadRequest,
				fmt.Sprintf("unknown provider %q and no base_url", body.Provider), "")
			return
		}
	}

	// Build the new config and save through the engine's Save (preserves header).
	cfg := ws.Config()
	cfg.Model = body.Model
	cfg.Provider = body.Provider
	cfg.BaseURL = body.BaseURL
	cfg.Concurrency = body.Concurrency
	cfg.MaxModuleTokens = body.MaxModuleTokens
	cfg.MaxTokens = body.MaxTokens
	cfg.Scope = body.Scope
	cfg.Notes = body.Notes

	repo := filepath.FromSlash(ws.Path)
	if err := cfg.Save(repo); err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}

	ws.SetAllowRun(body.AllowRun)
	ws.RebuildConfig()
	// The PRISM engine caches a resolved embedder and utility client from this
	// file, so it has to be rebuilt or the next query answers from the wiring
	// the user just changed away from.
	s.invalidatePrism()
	s.hub.Publish("workspace.changed", map[string]any{"workspace_id": ws.ID, "fields": []string{"config"}})
	writeJSON(w, http.StatusOK, configResponse(ws))
}

// extToLang maps a file extension to a language name for the scan response.
func extToLang(ext string) string {
	switch ext {
	case ".go":
		return "go"
	case ".ts", ".tsx":
		return "typescript"
	case ".js", ".jsx", ".mjs":
		return "javascript"
	case ".py":
		return "python"
	case ".rs":
		return "rust"
	case ".java":
		return "java"
	case ".c", ".h":
		return "c"
	case ".cpp", ".cc", ".hpp":
		return "cpp"
	case ".rb":
		return "ruby"
	case ".php":
		return "php"
	case ".swift":
		return "swift"
	case ".kt", ".kts":
		return "kotlin"
	case ".cs":
		return "csharp"
	case ".yaml", ".yml":
		return "yaml"
	case ".json":
		return "json"
	case ".toml":
		return "toml"
	case ".md":
		return "markdown"
	case ".html", ".htm":
		return "html"
	case ".css":
		return "css"
	case ".sql":
		return "sql"
	case ".sh", ".bash":
		return "shell"
	case ".dockerfile":
		return "dockerfile"
	default:
		if ext == "" {
			return "other"
		}
		return ext[1:] // strip the dot
	}
}
