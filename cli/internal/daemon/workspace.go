package daemon

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"kaioken/internal/agent"
	"kaioken/internal/config"
	"kaioken/internal/llm"
	"kaioken/internal/plan"
	"kaioken/internal/scan"
	"kaioken/internal/skills"
	"kaioken/internal/state"
	"kaioken/internal/wiki"
)

// Workspace is one opened repository. It caches config, scan results and the
// LLM client, rebuilding them lazily when the underlying files change. All
// exported accessors are safe for concurrent use; the daemon's handlers hit
// them from multiple goroutines (SSE, REST, run workers).
type Workspace struct {
	ID   string `json:"id"`
	Path string `json:"path"` // absolute, slash-normalised in JSON

	mu       sync.RWMutex
	cfg      *config.Config
	hasCfg   bool
	global   *config.Global
	client   *llm.Client
	budget   *agent.BudgetGuard // built with the client; watches its spend
	scanRes  *scan.Result
	scanAt   time.Time
	allowRun bool
	undo     []agent.UndoEntry
}

// Manager tracks open workspaces and persists the recents list. IDs are
// deterministic (sha256 of the absolute path) so the front-end can cache
// per-workspace state across daemon restarts.
type Manager struct {
	mu      sync.RWMutex
	byID    map[string]*Workspace
	byPath  map[string]*Workspace
	recents []string
}

// recentEntry is one item in the GET /workspaces recents array.
type recentEntry struct {
	Path    string `json:"path"`
	Missing bool   `json:"missing,omitempty"`
}

// NewManager loads the persisted recents list.
func NewManager() *Manager {
	m := &Manager{
		byID:   make(map[string]*Workspace),
		byPath: make(map[string]*Workspace),
	}
	m.recents = loadRecents()
	return m
}

// workspaceID derives a deterministic, short, opaque id from a path.
func workspaceID(absPath string) string {
	h := sha256.Sum256([]byte(filepath.ToSlash(absPath)))
	return "ws_" + hex.EncodeToString(h[:3])
}

// Open resolves path to an absolute directory, verifies it exists, and returns
// the (possibly already-open) workspace. Missing config is not an error — the
// UI offers Initialize when has_config is false.
func (m *Manager) Open(path string) (*Workspace, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("resolving path: %w", err)
	}
	info, err := os.Stat(abs)
	if err != nil {
		return nil, fmt.Errorf("opening %s: %w", abs, err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("%s is not a directory", abs)
	}

	slashPath := filepath.ToSlash(abs)

	m.mu.Lock()
	defer m.mu.Unlock()

	if ws, ok := m.byPath[slashPath]; ok {
		m.touchRecents(slashPath)
		return ws, nil
	}

	ws := &Workspace{
		ID:   workspaceID(abs),
		Path: slashPath,
	}
	ws.reload()

	m.byID[ws.ID] = ws
	m.byPath[slashPath] = ws
	m.touchRecents(slashPath)
	m.saveRecents()
	return ws, nil
}

// Get returns an open workspace by id.
func (m *Manager) Get(id string) (*Workspace, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	ws, ok := m.byID[id]
	return ws, ok
}

// Close drops a workspace from memory. forget=true also removes it from the
// recents list.
func (m *Manager) Close(id string, forget bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	ws, ok := m.byID[id]
	if !ok {
		return
	}
	delete(m.byID, id)
	delete(m.byPath, ws.Path)
	if forget {
		m.removeRecent(ws.Path)
		m.saveRecents()
	}
}

// List returns all open workspaces.
func (m *Manager) List() []*Workspace {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]*Workspace, 0, len(m.byID))
	for _, ws := range m.byID {
		out = append(out, ws)
	}
	return out
}

// Count returns the number of open workspaces.
func (m *Manager) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.byID)
}

// Recents returns the persisted recents list, most-recent first, capped at 20.
// Entries that no longer exist on disk are flagged.
func (m *Manager) Recents() []recentEntry {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]recentEntry, 0, len(m.recents))
	for _, p := range m.recents {
		_, err := os.Stat(filepath.FromSlash(p))
		out = append(out, recentEntry{Path: p, Missing: err != nil})
	}
	return out
}

// --- recents persistence ---

func recentsPath() string {
	if dir := os.Getenv(config.HomeEnv); dir != "" {
		return filepath.Join(dir, "recents.json")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".", ".kaioken-recents.json")
	}
	return filepath.Join(home, ".kaioken", "recents.json")
}

func loadRecents() []string {
	raw, err := os.ReadFile(recentsPath())
	if err != nil {
		return nil
	}
	var list []string
	if json.Unmarshal(raw, &list) != nil {
		return nil
	}
	return list
}

// touchRecents moves path to the front, deduplicates, and caps at 20.
// Caller must hold m.mu.
func (m *Manager) touchRecents(path string) {
	out := make([]string, 0, 20)
	out = append(out, path)
	for _, p := range m.recents {
		if p != path {
			out = append(out, p)
		}
	}
	if len(out) > 20 {
		out = out[:20]
	}
	m.recents = out
}

// removeRecent drops a path from recents. Caller must hold m.mu.
func (m *Manager) removeRecent(path string) {
	out := m.recents[:0]
	for _, p := range m.recents {
		if p != path {
			out = append(out, p)
		}
	}
	m.recents = out
}

// saveRecents persists the list. Caller must hold m.mu (or accept the race in
// tests that never run concurrently).
func (m *Manager) saveRecents() {
	path := recentsPath()
	_ = os.MkdirAll(filepath.Dir(path), 0o755)
	raw, err := json.Marshal(m.recents)
	if err != nil {
		return
	}
	_ = os.WriteFile(path, raw, 0o644)
}

// --- Workspace accessors ---

// reload (re)reads config and global from disk. Called on Open and after a
// config PUT.
func (ws *Workspace) reload() {
	repo := filepath.FromSlash(ws.Path)
	cfg, err := config.Load(repo)
	if err != nil {
		ws.cfg = nil
		ws.hasCfg = false
	} else {
		ws.cfg = cfg
		ws.hasCfg = true
	}
	ws.global = config.LoadGlobal()
	// Invalidate the client so it is rebuilt with the new config.
	ws.client = nil
}

// HasConfig reports whether .kaioken/config.yaml exists.
func (ws *Workspace) HasConfig() bool {
	ws.mu.RLock()
	defer ws.mu.RUnlock()
	return ws.hasCfg
}

// Config returns the loaded config (may be nil when HasConfig is false).
func (ws *Workspace) Config() *config.Config {
	ws.mu.RLock()
	defer ws.mu.RUnlock()
	return ws.cfg
}

// Notes returns the user's standing steering instructions from config, or nil
// when the workspace has none. They are copied out under the lock so a caller
// cannot mutate the workspace's slice through the returned value.
func (ws *Workspace) Notes() []string {
	ws.mu.RLock()
	defer ws.mu.RUnlock()
	if ws.cfg == nil || len(ws.cfg.Notes) == 0 {
		return nil
	}
	out := make([]string, len(ws.cfg.Notes))
	copy(out, ws.cfg.Notes)
	return out
}

// MemoryDisabled reports whether the experience loop (remember/recall tools,
// digest, distillation) is turned off for this workspace. Project memory
// already on disk still reaches the prompt via the memory context source.
func (ws *Workspace) MemoryDisabled() bool {
	ws.mu.RLock()
	defer ws.mu.RUnlock()
	return ws.cfg == nil || ws.cfg.Memory.Disable
}

// ProviderName is the provider this workspace bills against, resolved the same
// way Client does. Used by the spending ledger, which records the provider
// even when no client was ever built.
func (ws *Workspace) ProviderName() string {
	ws.mu.RLock()
	defer ws.mu.RUnlock()
	if ws.cfg != nil && ws.cfg.Provider != "" {
		return ws.cfg.Provider
	}
	return "openrouter"
}

// Client returns the LLM client, building it lazily using the same resolution
// order as cmd/kaioken/main.go:newClient — repo config model/provider → global
// saved key → provider env var. A missing key is an error only at call time.
func (ws *Workspace) Client() (*llm.Client, error) {
	ws.mu.Lock()
	defer ws.mu.Unlock()
	if ws.client != nil {
		return ws.client, nil
	}
	if ws.cfg == nil {
		return nil, fmt.Errorf("no config — run init first")
	}
	provider := ws.cfg.Provider
	if provider == "" {
		provider = "openrouter"
	}
	key := ""
	if ws.global != nil {
		key = ws.global.Keys[provider]
	}
	if key == "" {
		if p, ok := llm.Providers[provider]; ok {
			key = os.Getenv(p.KeyEnv)
		}
	}
	c, err := llm.NewForProvider(provider, ws.cfg.BaseURL, ws.cfg.Model, key)
	if err != nil {
		return nil, err
	}
	c.MaxTokens = ws.cfg.MaxTokens
	ws.client = c
	// The guard is born with the client so "session spend" and its limits
	// always measure the same thing.
	ws.budget = agent.NewBudgetGuard(ws.cfg.Budget.WarnAt, ws.cfg.Budget.HardStop)
	return c, nil
}

// Budget returns the guard built alongside the client, nil when no budget is
// configured (or no client has been built yet).
func (ws *Workspace) Budget() *agent.BudgetGuard {
	ws.mu.RLock()
	defer ws.mu.RUnlock()
	return ws.budget
}

// ScanCached returns the scan result, re-running the scan when refresh is true or
// the cache is older than 60 seconds.
func (ws *Workspace) ScanCached(refresh bool) (*scan.Result, error) {
	ws.mu.Lock()
	defer ws.mu.Unlock()
	if !refresh && ws.scanRes != nil && time.Since(ws.scanAt) < 60*time.Second {
		return ws.scanRes, nil
	}
	cfg := ws.cfg
	if cfg == nil {
		cfg = config.Default()
	}
	res, err := scan.Repo(filepath.FromSlash(ws.Path), cfg)
	if err != nil {
		return nil, err
	}
	ws.scanRes = res
	ws.scanAt = time.Now()
	return res, nil
}

// AllowRun returns the desktop-only allow_run toggle.
func (ws *Workspace) AllowRun() bool {
	ws.mu.RLock()
	defer ws.mu.RUnlock()
	return ws.allowRun
}

// SetAllowRun sets the desktop-only allow_run toggle.
func (ws *Workspace) SetAllowRun(v bool) {
	ws.mu.Lock()
	defer ws.mu.Unlock()
	ws.allowRun = v
}

// pushUndo records a file change for the /undo stack.
func (ws *Workspace) pushUndo(e agent.UndoEntry) {
	ws.mu.Lock()
	defer ws.mu.Unlock()
	ws.undo = append(ws.undo, e)
}

// popUndo removes and returns the last undo entry.
func (ws *Workspace) popUndo() (agent.UndoEntry, bool) {
	ws.mu.Lock()
	defer ws.mu.Unlock()
	if len(ws.undo) == 0 {
		return agent.UndoEntry{}, false
	}
	e := ws.undo[len(ws.undo)-1]
	ws.undo = ws.undo[:len(ws.undo)-1]
	return e, true
}

// undoDepth returns the number of entries on the undo stack.
func (ws *Workspace) undoDepth() int {
	ws.mu.RLock()
	defer ws.mu.RUnlock()
	return len(ws.undo)
}

// RebuildConfig reloads config from disk and invalidates the client. Called
// after a PUT /config.
func (ws *Workspace) RebuildConfig() {
	ws.mu.Lock()
	defer ws.mu.Unlock()
	ws.reload()
}

// --- Knowledge summary (for the Workspace JSON object) ---

// Knowledge is the derived knowledge state surfaced in the Workspace object.
type Knowledge struct {
	HasModules    bool     `json:"has_modules"`
	ModuleCount   int      `json:"module_count"`
	HasCards      bool     `json:"has_cards"`
	HasWiki       bool     `json:"has_wiki"`
	WikiSections  int      `json:"wiki_sections"`
	WikiDocs      int      `json:"wiki_docs"`
	WikiBase      string   `json:"wiki_base"`
	WikiModel     string   `json:"wiki_model"`
	WikiMultiplier int     `json:"wiki_multiplier"`
	WikiFailed    []string `json:"wiki_failed"`
	HasSkills     bool     `json:"has_skills"`
	SkillCount    int      `json:"skill_count"`
	HasBrief      bool     `json:"has_brief"`
}

// KnowledgeSummary derives the knowledge sub-object from disk state. Missing
// pieces are false/0, never an error.
func (ws *Workspace) KnowledgeSummary() Knowledge {
	repo := filepath.FromSlash(ws.Path)
	var k Knowledge

	// Modules
	if p, err := plan.Load(repo); err == nil {
		flat := p.Flatten()
		k.HasModules = len(flat) > 0
		k.ModuleCount = len(flat)
	}

	// Cards — check for the knowledge directory with at least one module dir
	knowledgeDir := filepath.Join(repo, config.Dir, "knowledge")
	if entries, err := os.ReadDir(knowledgeDir); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				k.HasCards = true
				break
			}
		}
	}

	// Wiki
	wikiDir := wiki.WikiDir(repo)
	if entries, err := os.ReadDir(wikiDir); err == nil {
		sections := 0
		docs := 0
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			sections++
			if sub, serr := os.ReadDir(filepath.Join(wikiDir, e.Name())); serr == nil {
				for _, d := range sub {
					if !d.IsDir() && strings.HasSuffix(d.Name(), ".md") {
						docs++
					}
				}
			}
		}
		k.HasWiki = docs > 0
		k.WikiSections = sections
		k.WikiDocs = docs
	}

	// Wiki stamp
	stamp := wiki.LoadStamp(repo)
	if stamp.Commit != "" {
		k.WikiBase = stamp.Commit
		if len(stamp.Commit) > 7 {
			k.WikiBase = stamp.Commit[:7]
		}
		k.WikiModel = stamp.Model
		k.WikiMultiplier = stamp.Multiplier
		k.WikiFailed = stamp.Failed
	}
	if k.WikiFailed == nil {
		k.WikiFailed = []string{}
	}

	// Skills
	if all, err := skills.List(repo); err == nil && len(all) > 0 {
		k.HasSkills = true
		k.SkillCount = len(all)
	}

	// Brief
	if _, err := os.Stat(wiki.BriefPath(repo)); err == nil {
		k.HasBrief = true
	}

	return k
}

// GitInfo is the git sub-object of the Workspace response.
type GitInfo struct {
	IsRepo        bool   `json:"is_repo"`
	Head          string `json:"head"`
	Short         string `json:"short"`
	Branch        string `json:"branch"`
	DirtyCount    int    `json:"dirty_count"`
	HookInstalled bool   `json:"hook_installed"`
}

// ModuleStatus is one module's freshness for GET /status.
type ModuleStatus struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	State       string `json:"state"` // fresh | changed | missing | empty
	Files       int    `json:"files"`
	GeneratedAt string `json:"generated_at,omitempty"`
}

// StatusModules computes module freshness exactly as cmdStatus does.
func (ws *Workspace) StatusModules() ([]ModuleStatus, error) {
	repo := filepath.FromSlash(ws.Path)
	cfg := ws.Config()
	if cfg == nil {
		return nil, fmt.Errorf("no config")
	}
	p, err := plan.Load(repo)
	if err != nil {
		return nil, err
	}
	st, err := state.Load(repo)
	if err != nil {
		return nil, err
	}
	res, err := ws.ScanCached(false)
	if err != nil {
		return nil, err
	}

	var out []ModuleStatus
	for _, fm := range p.Flatten() {
		files := plan.FilesFor(fm, res)
		ms := ModuleStatus{ID: fm.ID, Title: fm.Title, Files: len(files)}
		switch {
		case len(files) == 0:
			ms.State = "empty"
		default:
			msState, ok := st.Modules[fm.ID]
			if !ok {
				ms.State = "missing"
			} else {
				ms.GeneratedAt = msState.GeneratedAt.Format(time.RFC3339)
				hash, herr := state.HashFiles(res.Root, files)
				if herr != nil {
					return nil, herr
				}
				if hash == msState.SourceHash {
					ms.State = "fresh"
				} else {
					ms.State = "changed"
				}
			}
		}
		out = append(out, ms)
	}
	return out, nil
}
