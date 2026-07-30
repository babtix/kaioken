package daemon

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode"

	"kaioken/internal/config"
	"kaioken/internal/plan"
	"kaioken/internal/search"
	"kaioken/internal/skills"
	"kaioken/internal/wiki"

	"gopkg.in/yaml.v3"
)

// safeJoin resolves rel against root, rejecting path traversal. Every
// path-taking handler uses this — one helper, one test suite (T045).
func safeJoin(root, rel string) (string, error) {
	rel = filepath.ToSlash(rel)
	if strings.HasPrefix(rel, "/") || strings.Contains(rel, "..") {
		return "", fmt.Errorf("path escapes root")
	}
	// A Windows drive-letter prefix ("C:/Windows/win.ini") has neither a
	// leading "/" nor "..", so it survives the checks above — but
	// filepath.Join does not treat it as a new root, it appends the literal
	// string as a subpath. That happens to 404 rather than read the real
	// file on this repo's layout, but it is undefined behavior to lean on:
	// Windows may parse the embedded ":" as NTFS alternate-data-stream
	// syntax instead of simply failing. Reject it outright, and check this
	// regardless of the host OS since filepath.IsAbs only recognizes
	// drive letters when actually running on Windows.
	if len(rel) >= 2 && rel[1] == ':' {
		return "", fmt.Errorf("path escapes root")
	}
	joined := filepath.Join(root, filepath.FromSlash(rel))
	abs, err := filepath.Abs(joined)
	if err != nil {
		return "", err
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	if !strings.HasPrefix(abs, absRoot+string(filepath.Separator)) && abs != absRoot {
		return "", fmt.Errorf("path escapes root")
	}
	return abs, nil
}

// --- T044: Wiki tree and document endpoints ---

type wikiDocMeta struct {
	Title        string `json:"title"`
	Rel          string `json:"rel"`
	Lines        int    `json:"lines"`
	Words        int    `json:"words"`
	ReadingMin   int    `json:"reading_minutes"`
	Modified     string `json:"modified"`
	IsSectionDoc bool   `json:"is_section_doc"`
}

type wikiSection struct {
	Name string        `json:"name"`
	Docs []wikiDocMeta `json:"docs"`
}

// GET /v1/workspaces/{id}/wiki/tree
func (s *Server) handleWikiTree(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	repo := filepath.FromSlash(ws.Path)
	wikiDir := wiki.WikiDir(repo)
	entries, err := os.ReadDir(wikiDir)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"root": config.Dir + "/wiki", "has_readme": false, "sections": []any{}, "changelog": false})
		return
	}

	var sections []wikiSection
	hasReadme := false
	hasChangelog := false
	for _, e := range entries {
		if !e.IsDir() {
			if e.Name() == "README.md" {
				hasReadme = true
			}
			if e.Name() == "CHANGELOG.md" {
				hasChangelog = true
			}
			continue
		}
		docs, _ := os.ReadDir(filepath.Join(wikiDir, e.Name()))
		sec := wikiSection{Name: e.Name()}
		for _, d := range docs {
			if d.IsDir() || !strings.HasSuffix(d.Name(), ".md") {
				continue
			}
			rel := e.Name() + "/" + d.Name()
			title := strings.TrimSuffix(d.Name(), ".md")
			lines, words := countLinesWords(filepath.Join(wikiDir, e.Name(), d.Name()))
			mod := modTime(filepath.Join(wikiDir, e.Name(), d.Name()))
			sec.Docs = append(sec.Docs, wikiDocMeta{
				Title: title, Rel: rel, Lines: lines, Words: words,
				ReadingMin: words / 220, Modified: mod, IsSectionDoc: title == e.Name(),
			})
		}
		if len(sec.Docs) == 0 {
			continue
		}
		// Section doc first, then alphabetical.
		sort.Slice(sec.Docs, func(i, j int) bool {
			if sec.Docs[i].IsSectionDoc != sec.Docs[j].IsSectionDoc {
				return sec.Docs[i].IsSectionDoc
			}
			return sec.Docs[i].Title < sec.Docs[j].Title
		})
		sections = append(sections, sec)
	}
	sort.Slice(sections, func(i, j int) bool { return sections[i].Name < sections[j].Name })

	writeJSON(w, http.StatusOK, map[string]any{
		"root": config.Dir + "/wiki", "has_readme": hasReadme, "sections": sections, "changelog": hasChangelog,
	})
}

// GET /v1/workspaces/{id}/wiki/doc
func (s *Server) handleWikiDoc(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	rel := r.URL.Query().Get("path")
	if rel == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "path query param required", "")
		return
	}
	repo := filepath.FromSlash(ws.Path)
	wikiDir := wiki.WikiDir(repo)
	abs, err := safeJoin(wikiDir, rel)
	if err != nil {
		writeError(w, http.StatusForbidden, codePathEscape, "path escapes wiki directory", "")
		return
	}
	raw, err := os.ReadFile(abs)
	if err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "document not found", "")
		return
	}
	md := string(raw)
	title := strings.TrimSuffix(filepath.Base(abs), ".md")
	lines := strings.Count(md, "\n") + 1
	words := len(strings.Fields(md))
	prov := wiki.ReadProvenance(md)
	if prov == nil {
		prov = []string{}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"path": rel, "title": title, "markdown": md,
		"lines": lines, "words": words, "reading_minutes": words / 220,
		"modified": modTime(abs), "provenance": prov, "toc": extractTOC(md),
	})
}

// --- T046: Wiki search ---

// GET /v1/workspaces/{id}/wiki/search
//
// Backed by internal/search: BM25 over heading-aware chunks, fused with vector
// similarity when the workspace has an embedding model configured. The index
// is opened per request — it rebuilds only when the corpus fingerprint moved,
// so a repeat search is a file read and a scan, not a re-walk of the wiki.
func (s *Server) handleWikiSearch(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		writeJSON(w, http.StatusOK, map[string]any{"query": "", "hits": []any{}})
		return
	}
	limit := 50
	fmt.Sscanf(r.URL.Query().Get("limit"), "%d", &limit)

	repo := filepath.FromSlash(ws.Path)
	idx, err := search.Open(repo)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}

	query := search.Query{
		Text:    q,
		Section: r.URL.Query().Get("section"),
		Limit:   limit,
	}
	for _, k := range strings.Split(r.URL.Query().Get("kind"), ",") {
		if k = strings.TrimSpace(k); k != "" {
			query.Kinds = append(query.Kinds, search.Kind(k))
		}
	}
	if len(query.Kinds) == 0 {
		// An endpoint named wiki/search returns wiki documents. Cards and
		// skills live at paths a wiki reader cannot open, so they are opt-in
		// via ?kind= rather than a surprise in the results list.
		query.Kinds = []search.Kind{search.KindWiki}
	}
	// Embedding is opt-in per workspace; when it is off this stays nil and the
	// search is pure BM25 with no network call on the request path.
	query.Embedder, _ = search.NewEmbedder(search.EmbedConfigFor(repo))

	hits, err := idx.Search(r.Context(), query)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	if hits == nil {
		hits = []search.Result{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"query":    q,
		"hits":     hits,
		"semantic": idx.Semantic(),
		"sections": idx.Sections(),
	})
}

// --- Wiki graph ---

// GET /v1/workspaces/{id}/wiki/graph
//
// The whole graph is computed in wiki.BuildGraph so this payload and the one
// `kaioken serve` writes at /graph.json stay byte-identical for the same repo.
func (s *Server) handleWikiGraph(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	repo := filepath.FromSlash(ws.Path)
	g, err := wiki.BuildGraph(repo)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	writeJSON(w, http.StatusOK, g)
}

// --- T047: Source file endpoint ---

// GET /v1/workspaces/{id}/file
func (s *Server) handleFile(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	rel := r.URL.Query().Get("path")
	if rel == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "path required", "")
		return
	}
	repo := filepath.FromSlash(ws.Path)
	abs, err := safeJoin(repo, rel)
	if err != nil {
		writeError(w, http.StatusForbidden, codePathEscape, "path escapes repo root", "")
		return
	}
	info, err := os.Stat(abs)
	if err != nil || info.IsDir() {
		writeError(w, http.StatusNotFound, codeNotFound, "file not found", "")
		return
	}

	raw, err := os.ReadFile(abs)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}

	const maxBytes = 1 << 20
	truncated := len(raw) > maxBytes
	if truncated {
		raw = raw[:maxBytes]
	}

	lines := strings.Split(string(raw), "\n")
	totalLines := len(lines)
	from := 0
	to := totalLines
	fmt.Sscanf(r.URL.Query().Get("from"), "%d", &from)
	fmt.Sscanf(r.URL.Query().Get("to"), "%d", &to)
	if from < 1 {
		from = 1
	}
	if to > totalLines || to < from {
		to = totalLines
	}
	content := strings.Join(lines[from-1:to], "\n")

	writeJSON(w, http.StatusOK, map[string]any{
		"path": rel, "language": extLang(filepath.Ext(abs)),
		"content": content, "from": from, "to": to, "total_lines": totalLines, "truncated": truncated,
	})
}

// --- T052: Plan and brief endpoints ---

// GET /v1/workspaces/{id}/wiki/plan
func (s *Server) handleGetWikiPlan(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	repo := filepath.FromSlash(ws.Path)
	path := wiki.OutlinePath(repo)
	raw, err := os.ReadFile(path)
	if err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "no wiki_plan.yaml", "")
		return
	}
	var outline any
	_ = yaml.Unmarshal(raw, &outline)
	writeJSON(w, http.StatusOK, map[string]any{
		"outline": outline, "yaml": string(raw), "path": config.Dir + "/wiki_plan.yaml", "modified": modTime(path),
	})
}

// PUT /v1/workspaces/{id}/wiki/plan
func (s *Server) handlePutWikiPlan(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	var body struct {
		YAML    string `json:"yaml"`
		Outline any    `json:"outline"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "invalid JSON", "")
		return
	}
	var raw []byte
	if body.YAML != "" {
		raw = []byte(body.YAML)
	} else if body.Outline != nil {
		var err error
		raw, err = yaml.Marshal(body.Outline)
		if err != nil {
			writeError(w, http.StatusBadRequest, codeBadRequest, "cannot marshal outline", "")
			return
		}
	} else {
		writeError(w, http.StatusBadRequest, codeBadRequest, "yaml or outline required", "")
		return
	}
	// Validate YAML parses.
	var check any
	if err := yaml.Unmarshal(raw, &check); err != nil {
		writeError(w, http.StatusUnprocessableEntity, codeInvalidYAML, err.Error(), "")
		return
	}
	repo := filepath.FromSlash(ws.Path)
	path := wiki.OutlinePath(repo)
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"yaml": string(raw), "path": config.Dir + "/wiki_plan.yaml", "modified": modTime(path)})
}

// GET /v1/workspaces/{id}/wiki/brief
func (s *Server) handleGetBrief(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	repo := filepath.FromSlash(ws.Path)
	path := wiki.BriefPath(repo)
	raw, err := os.ReadFile(path)
	if err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "no architecture.md", "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"markdown": string(raw), "path": config.Dir + "/architecture.md", "modified": modTime(path)})
}

// PUT /v1/workspaces/{id}/wiki/brief
func (s *Server) handlePutBrief(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	var body struct {
		Markdown string `json:"markdown"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "invalid JSON", "")
		return
	}
	repo := filepath.FromSlash(ws.Path)
	path := wiki.BriefPath(repo)
	if err := os.WriteFile(path, []byte(body.Markdown), 0o644); err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"markdown": body.Markdown, "path": config.Dir + "/architecture.md", "modified": modTime(path)})
}

// --- T054-T056: Cards, modules, skills endpoints ---

// GET /v1/workspaces/{id}/modules
func (s *Server) handleGetModules(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	repo := filepath.FromSlash(ws.Path)
	p, err := plan.Load(repo)
	if err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "no modules.yaml", "")
		return
	}
	raw, _ := os.ReadFile(plan.FilePath(repo))
	res, _ := ws.ScanCached(false)
	var warnings []string
	coverage := 0
	if res != nil {
		warnings = plan.Validate(p, res)
		// Coverage: share of files claimed.
		claimed := map[string]bool{}
		for _, fm := range p.Flatten() {
			for _, f := range plan.FilesFor(fm, res) {
				claimed[f.Path] = true
			}
		}
		if len(res.Files) > 0 {
			coverage = len(claimed) * 100 / len(res.Files)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"plan": p, "yaml": string(raw), "path": config.Dir + "/modules.yaml",
		"modified": modTime(plan.FilePath(repo)), "validation": warnings, "coverage_pct": coverage,
	})
}

// PUT /v1/workspaces/{id}/modules
func (s *Server) handlePutModules(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	var body struct {
		YAML string `json:"yaml"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.YAML == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "yaml required", "")
		return
	}
	var p plan.Plan
	if err := yaml.Unmarshal([]byte(body.YAML), &p); err != nil {
		writeError(w, http.StatusUnprocessableEntity, codeInvalidYAML, err.Error(), "")
		return
	}
	repo := filepath.FromSlash(ws.Path)
	if err := p.Save(repo); err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"path": config.Dir + "/modules.yaml", "modified": modTime(plan.FilePath(repo))})
}

// GET /v1/workspaces/{id}/skills
func (s *Server) handleGetSkills(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	repo := filepath.FromSlash(ws.Path)
	all, err := skills.List(repo)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	type skillJSON struct {
		Name        string   `json:"name"`
		Description string   `json:"description"`
		Sources     []string `json:"sources"`
		GeneratedAt string   `json:"generated_at"`
		Path        string   `json:"path"`
		Stale       bool     `json:"stale"`
		Origin      string   `json:"origin"`
		UseCount    int      `json:"use_count"`
	}
	out := make([]skillJSON, 0, len(all))
	for _, sk := range all {
		stale := false
		for _, src := range sk.Sources {
			if info, err := os.Stat(filepath.Join(repo, filepath.FromSlash(src))); err == nil {
				if info.ModTime().After(sk.GeneratedAt) {
					stale = true
					break
				}
			}
		}
		out = append(out, skillJSON{
			Name: sk.Name, Description: sk.Description, Sources: sk.Sources,
			GeneratedAt: sk.GeneratedAt.Format(time.RFC3339), Path: config.Dir + "/skills/" + sk.Name + "/SKILL.md", Stale: stale,
			Origin: sk.Origin, UseCount: sk.UseCount,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"skills": out})
}

// GET /v1/workspaces/{id}/skills/{name}
func (s *Server) handleGetSkill(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	name := r.PathValue("name")
	repo := filepath.FromSlash(ws.Path)
	sk, err := skills.Load(repo, name)
	if err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "skill not found", "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"name": sk.Name, "description": sk.Description, "sources": sk.Sources,
		"markdown": sk.Body, "path": config.Dir + "/skills/" + name + "/SKILL.md",
	})
}

// PUT /v1/workspaces/{id}/skills/{name}
func (s *Server) handlePutSkill(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	name := r.PathValue("name")
	var body struct {
		Description string   `json:"description"`
		Sources     []string `json:"sources"`
		Markdown    string   `json:"markdown"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "invalid JSON", "")
		return
	}
	sk := &skills.Skill{Name: name, Description: body.Description, Sources: body.Sources, Body: body.Markdown}
	// Validate through skills.Parse before writing, per the contract — a
	// round-trip through Render confirms the frontmatter actually parses.
	if _, err := skills.Parse(sk.Render()); err != nil {
		writeError(w, http.StatusUnprocessableEntity, codeInvalidYAML, err.Error(), "")
		return
	}
	repo := filepath.FromSlash(ws.Path)
	if err := sk.Save(repo); err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"name": sk.Name, "description": sk.Description, "sources": sk.Sources,
		"markdown": sk.Body, "path": config.Dir + "/skills/" + name + "/SKILL.md",
		"origin": sk.Origin, "use_count": sk.UseCount,
	})
}

// GET /v1/workspaces/{id}/cards
func (s *Server) handleGetCards(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	repo := filepath.FromSlash(ws.Path)
	knowledgeDir := filepath.Join(repo, config.Dir, "knowledge")
	entries, err := os.ReadDir(knowledgeDir)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"modules": []any{}})
		return
	}
	type cardJSON struct {
		Name  string `json:"name"`
		Path  string `json:"path"`
		Lines int    `json:"lines"`
	}
	type modJSON struct {
		ID    string     `json:"id"`
		Cards []cardJSON `json:"cards"`
	}
	var mods []modJSON
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		mod := modJSON{ID: e.Name()}
		cards, _ := os.ReadDir(filepath.Join(knowledgeDir, e.Name()))
		for _, c := range cards {
			if c.IsDir() || !strings.HasSuffix(c.Name(), ".md") {
				continue
			}
			lines, _ := countLinesWords(filepath.Join(knowledgeDir, e.Name(), c.Name()))
			mod.Cards = append(mod.Cards, cardJSON{
				Name: strings.TrimSuffix(c.Name(), ".md"),
				Path: config.Dir + "/knowledge/" + e.Name() + "/" + c.Name(),
				Lines: lines,
			})
		}
		mods = append(mods, mod)
	}
	writeJSON(w, http.StatusOK, map[string]any{"modules": mods})
}

// GET /v1/workspaces/{id}/cards/{module}/{card}
func (s *Server) handleGetCard(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	module := r.PathValue("module")
	card := r.PathValue("card")
	repo := filepath.FromSlash(ws.Path)
	knowledgeDir := filepath.Join(repo, config.Dir, "knowledge")
	abs, err := safeJoin(knowledgeDir, module+"/"+card+".md")
	if err != nil {
		writeError(w, http.StatusForbidden, codePathEscape, "path escapes knowledge directory", "")
		return
	}
	raw, err := os.ReadFile(abs)
	if err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "card not found", "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"markdown": string(raw),
		"path":     config.Dir + "/knowledge/" + module + "/" + card + ".md",
		"modified": modTime(abs),
	})
}

// --- helpers ---

func countLinesWords(path string) (lines, words int) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return 0, 0
	}
	s := string(raw)
	lines = strings.Count(s, "\n") + 1
	words = len(strings.Fields(s))
	return
}

func modTime(path string) string {
	info, err := os.Stat(path)
	if err != nil {
		return ""
	}
	return info.ModTime().Format(time.RFC3339)
}

func extLang(ext string) string {
	switch ext {
	case ".go":
		return "go"
	case ".ts", ".tsx":
		return "typescript"
	case ".js", ".jsx":
		return "javascript"
	case ".py":
		return "python"
	case ".rs":
		return "rust"
	case ".md":
		return "markdown"
	case ".yaml", ".yml":
		return "yaml"
	case ".json":
		return "json"
	default:
		return strings.TrimPrefix(ext, ".")
	}
}

type tocEntry struct {
	Level int    `json:"level"`
	Text  string `json:"text"`
	Slug  string `json:"slug"`
}

// extractTOC scans for ATX headings outside fenced code blocks.
func extractTOC(md string) []tocEntry {
	var toc []tocEntry
	inFence := false
	for _, line := range strings.Split(md, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "```") {
			inFence = !inFence
			continue
		}
		if inFence {
			continue
		}
		level := 0
		for _, ch := range trimmed {
			if ch == '#' {
				level++
			} else {
				break
			}
		}
		if level < 2 || level > 4 || len(trimmed) <= level {
			continue
		}
		text := strings.TrimSpace(trimmed[level:])
		toc = append(toc, tocEntry{Level: level, Text: text, Slug: slugify(text)})
	}
	return toc
}

// slugify mirrors rehype-slug: lowercase, non-alphanumerics to -, collapse.
func slugify(s string) string {
	s = strings.ToLower(s)
	var b strings.Builder
	lastDash := false
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
			lastDash = false
		} else if !lastDash {
			b.WriteByte('-')
			lastDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}
