package daemon

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"kaioken/internal/config"
	"kaioken/internal/prism"
)

// PRISM over HTTP. Modules and documents are ordinary CRUD; the two things
// worth care are that ingestion runs in the background (a large import must
// not hold a request open) and that a query's three honesty flags survive the
// serialisation intact, because a UI that renders only "found" is exactly the
// UI this engine exists to avoid.

// prismEngine returns the engine for the workspace named in the request,
// building it on first use and reusing it afterwards, or writes the error and
// returns nil.
//
// Reuse is not only an optimisation. The engine owns the store's lock and the
// tokenised view of each module, so two requests holding two engines over the
// same files hold two different locks — which, as the concurrent import and
// status poll a UI performs will demonstrate, is not a lock at all.
func (s *Server) prismEngine(w http.ResponseWriter, r *http.Request) (*prism.Engine, string) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return nil, ""
	}
	repo := filepath.FromSlash(ws.Path)

	s.prismMu.Lock()
	defer s.prismMu.Unlock()

	if e, ok := s.prisms[repo]; ok {
		return e, repo
	}

	// Building probes local endpoints when nothing is configured. Bounded, so
	// a firewalled machine does not hang a request on a refused connection.
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	e, err := prism.Open(ctx, repo)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return nil, ""
	}
	if s.prisms == nil {
		s.prisms = map[string]*prism.Engine{}
	}
	s.prisms[repo] = e
	return e, repo
}

// invalidatePrism drops every cached engine, so the next request rebuilds
// against the configuration that was just written. Called from the settings
// and workspace-config write paths: an engine holds a resolved embedder and a
// utility client, and serving a query from the pre-change wiring is how a user
// concludes their setting did nothing.
func (s *Server) invalidatePrism() {
	s.prismMu.Lock()
	defer s.prismMu.Unlock()
	s.prisms = nil
}

// writePrismError maps the package's sentinel errors onto status codes so a
// client can tell "you asked for something that is not there" from "the engine
// broke".
func writePrismError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, prism.ErrNoModule), errors.Is(err, prism.ErrNoDocument):
		writeError(w, http.StatusNotFound, codeNotFound, err.Error(), "")
	case errors.Is(err, prism.ErrModuleExists):
		writeError(w, http.StatusConflict, codeBadRequest, err.Error(), "")
	default:
		var unsupported *prism.ErrUnsupported
		if errors.As(err, &unsupported) {
			writeError(w, http.StatusBadRequest, codeBadRequest, err.Error(), "")
			return
		}
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
	}
}

// GET /v1/workspaces/{id}/prism — engine status plus the module list.
func (s *Server) handlePrismStatus(w http.ResponseWriter, r *http.Request) {
	e, _ := s.prismEngine(w, r)
	if e == nil {
		return
	}
	mods, err := e.Store.Modules()
	if err != nil {
		writePrismError(w, err)
		return
	}
	if mods == nil {
		mods = []prism.Module{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  e.Status(),
		"embed":   map[string]any{"source": e.Embed.Source, "detail": e.Embed.Detail, "model": e.Embed.Model},
		"utility": e.Utility,
		"mode":    modeName(e.AgentMode),
		"options": map[string]any{
			"top_k":    e.Options.TopK,
			"variants": e.Options.Variants,
			"grade":    !e.Options.NoGrade,
		},
		"modules": mods,
	})
}

func modeName(agent bool) string {
	if agent {
		return "agent"
	}
	return "static"
}

// POST /v1/workspaces/{id}/prism/modules
func (s *Server) handlePrismCreateModule(w http.ResponseWriter, r *http.Request) {
	e, _ := s.prismEngine(w, r)
	if e == nil {
		return
	}
	var body struct {
		Name         string `json:"name"`
		Slug         string `json:"slug"`
		Description  string `json:"description"`
		SystemPrompt string `json:"system_prompt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, err.Error(), "")
		return
	}

	m, err := e.Store.CreateModule(body.Name, body.Slug, body.Description)
	if err != nil {
		writePrismError(w, err)
		return
	}
	if strings.TrimSpace(body.SystemPrompt) != "" {
		if m, err = e.Store.UpdateModule(m.Slug, func(mod *prism.Module) {
			mod.SystemPrompt = body.SystemPrompt
		}); err != nil {
			writePrismError(w, err)
			return
		}
	}
	writeJSON(w, http.StatusCreated, m)
}

// PATCH /v1/workspaces/{id}/prism/modules/{slug}
func (s *Server) handlePrismUpdateModule(w http.ResponseWriter, r *http.Request) {
	e, _ := s.prismEngine(w, r)
	if e == nil {
		return
	}
	var body struct {
		Name         *string `json:"name"`
		Description  *string `json:"description"`
		SystemPrompt *string `json:"system_prompt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, err.Error(), "")
		return
	}

	m, err := e.Store.UpdateModule(r.PathValue("slug"), func(mod *prism.Module) {
		if body.Name != nil {
			mod.Name = *body.Name
		}
		if body.Description != nil {
			mod.Description = *body.Description
		}
		if body.SystemPrompt != nil {
			mod.SystemPrompt = *body.SystemPrompt
		}
	})
	if err != nil {
		writePrismError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, m)
}

// DELETE /v1/workspaces/{id}/prism/modules/{slug}
func (s *Server) handlePrismDeleteModule(w http.ResponseWriter, r *http.Request) {
	e, _ := s.prismEngine(w, r)
	if e == nil {
		return
	}
	if err := e.Store.DeleteModule(r.PathValue("slug")); err != nil {
		writePrismError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": r.PathValue("slug")})
}

// GET /v1/workspaces/{id}/prism/modules/{slug}/documents
func (s *Server) handlePrismDocuments(w http.ResponseWriter, r *http.Request) {
	e, _ := s.prismEngine(w, r)
	if e == nil {
		return
	}
	slug := r.PathValue("slug")
	if _, err := e.Store.Module(slug); err != nil {
		writePrismError(w, err)
		return
	}
	docs, err := e.Store.Documents(slug)
	if err != nil {
		writePrismError(w, err)
		return
	}
	if docs == nil {
		docs = []prism.Document{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"documents": docs})
}

// POST /v1/workspaces/{id}/prism/modules/{slug}/documents
//
// Takes a path on the machine the daemon runs on, or inline text. Ingestion
// runs in the background: embedding a book-length document is minutes of work,
// and holding an HTTP request open for it turns any proxy timeout into a
// half-imported corpus.
func (s *Server) handlePrismImport(w http.ResponseWriter, r *http.Request) {
	e, repo := s.prismEngine(w, r)
	if e == nil {
		return
	}
	slug := r.PathValue("slug")
	if _, err := e.Store.Module(slug); err != nil {
		writePrismError(w, err)
		return
	}

	var body struct {
		Path     string `json:"path"`
		Filename string `json:"filename"`
		Text     string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, err.Error(), "")
		return
	}
	if strings.TrimSpace(body.Path) == "" && strings.TrimSpace(body.Text) == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "path or text is required", "")
		return
	}

	// Extraction happens synchronously so an unsupported file type is a 400
	// the caller can act on, rather than a background failure they have to go
	// looking for.
	text, filename := body.Text, body.Filename
	if body.Path != "" {
		path, err := safeJoin(repo, body.Path)
		if err != nil {
			// An absolute path outside the workspace is allowed here — a user
			// importing their own documents will point at Documents or
			// Downloads — but it must be an explicit absolute path, not a
			// traversal out of a relative one.
			if !filepath.IsAbs(body.Path) {
				writeError(w, http.StatusBadRequest, codeBadRequest, err.Error(), "")
				return
			}
			path = body.Path
		}
		if text, err = prism.Extract(path); err != nil {
			writePrismError(w, err)
			return
		}
		if filename == "" {
			filename = filepath.Base(path)
		}
	}
	if filename == "" {
		filename = "untitled.txt"
	}

	// Detached from the request: the client polls the document list, which
	// carries the status the ingestor writes as it goes.
	go func(text, filename, source string) {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
		defer cancel()
		if _, err := e.Ingestor().ImportText(ctx, slug, filename, source, text, nil); err != nil {
			// The failure is also recorded on the document itself, which is
			// what the client polls; this line is for the operator watching
			// the daemon.
			fmt.Fprintf(os.Stderr, "prism import %s/%s failed: %v\n", slug, filename, err)
		}
	}(text, filename, body.Path)

	writeJSON(w, http.StatusAccepted, map[string]any{
		"module":   slug,
		"filename": filename,
		"status":   string(prism.StatusProcessing),
	})
}

// DELETE /v1/workspaces/{id}/prism/modules/{slug}/documents/{doc}
func (s *Server) handlePrismDeleteDocument(w http.ResponseWriter, r *http.Request) {
	e, _ := s.prismEngine(w, r)
	if e == nil {
		return
	}
	if err := e.Store.DeleteDocument(r.PathValue("slug"), r.PathValue("doc")); err != nil {
		writePrismError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": r.PathValue("doc")})
}

// POST /v1/workspaces/{id}/prism/query
func (s *Server) handlePrismQuery(w http.ResponseWriter, r *http.Request) {
	e, _ := s.prismEngine(w, r)
	if e == nil {
		return
	}
	var body struct {
		Query    string `json:"query"`
		Module   string `json:"module"`
		TopK     int    `json:"top_k"`
		Variants int    `json:"variants"`
		NoGrade  bool   `json:"no_grade"`
		Agent    *bool  `json:"agent"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, err.Error(), "")
		return
	}
	if strings.TrimSpace(body.Query) == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "query is required", "")
		return
	}
	if strings.TrimSpace(body.Module) == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "module is required", "")
		return
	}

	opt := e.Options
	opt.Module = body.Module
	if body.TopK > 0 {
		opt.TopK = body.TopK
	}
	if body.Variants > 0 {
		opt.Variants = body.Variants
	}
	if body.NoGrade {
		opt.NoGrade = true
	}

	started := time.Now()
	agentMode := e.AgentMode
	if body.Agent != nil {
		agentMode = *body.Agent
	}

	var res prism.AgentResult
	var err error
	if agentMode {
		res, err = e.Agent.Retrieve(r.Context(), body.Query, prism.AgentOptions{Options: opt})
	} else {
		var one prism.Result
		one, err = e.Retriever.Retrieve(r.Context(), body.Query, opt)
		res = prism.AgentResult{
			Result:       one,
			Route:        prism.RouteSimple,
			SubQuestions: []string{body.Query},
		}
		if err == nil && !one.SourceFound {
			res.Unresolved = []string{body.Query}
		}
	}
	if err != nil {
		writePrismError(w, err)
		return
	}
	// JSON null and an empty list mean different things to a UI iterating the
	// result; an empty answer is a list with nothing in it.
	if res.Chunks == nil {
		res.Chunks = []string{}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"query":  body.Query,
		"module": body.Module,
		// The three flags are separate fields, never folded into one. A client
		// that renders only "found" cannot tell an empty corpus from a broken
		// retriever, which is the confusion this engine exists to prevent.
		"source_found":  res.SourceFound,
		"graded":        res.Graded,
		"degraded":      res.Degraded,
		"chunks":        res.Chunks,
		"route":         res.Route,
		"sub_questions": res.SubQuestions,
		"unresolved":    res.Unresolved,
		"steps":         res.Steps,
		"elapsed_ms":    time.Since(started).Milliseconds(),
	})
}

// GET /v1/settings/prism
func (s *Server) handleGetPrismSettings(w http.ResponseWriter, r *http.Request) {
	g := config.LoadGlobal()
	writeJSON(w, http.StatusOK, prismSettings(&g.Prism))
}

// PUT /v1/settings/prism
//
// Writes the global defaults. A workspace can still override any field in its
// own config; this is where a user points every workspace at one local
// embedding server and one cheap utility model.
func (s *Server) handlePutPrismSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		EmbedModel            *string `json:"embed_model"`
		EmbedProvider         *string `json:"embed_provider"`
		EmbedBaseURL          *string `json:"embed_base_url"`
		EmbedFallbackModel    *string `json:"embed_fallback_model"`
		EmbedFallbackProvider *string `json:"embed_fallback_provider"`
		UtilityModel          *string `json:"utility_model"`
		UtilityProvider       *string `json:"utility_provider"`
		Mode                  *string `json:"mode"`
		TopK                  *int    `json:"top_k"`
		Variants              *int    `json:"variants"`
		Grade                 *bool   `json:"grade"`
		ParentTokens          *int    `json:"parent_tokens"`
		ChildTokens           *int    `json:"child_tokens"`
		ChildOverlap          *int    `json:"child_overlap"`
		CacheTTLSeconds       *int    `json:"cache_ttl_seconds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, err.Error(), "")
		return
	}

	g := config.LoadGlobal()
	p := &g.Prism

	setStr(&p.EmbedModel, body.EmbedModel)
	setStr(&p.EmbedProvider, body.EmbedProvider)
	setStr(&p.EmbedBaseURL, body.EmbedBaseURL)
	setStr(&p.EmbedFallbackModel, body.EmbedFallbackModel)
	setStr(&p.EmbedFallbackProvider, body.EmbedFallbackProvider)
	setStr(&p.UtilityModel, body.UtilityModel)
	setStr(&p.UtilityProvider, body.UtilityProvider)
	setStr(&p.Mode, body.Mode)
	setInt(&p.TopK, body.TopK)
	setInt(&p.ParentTokens, body.ParentTokens)
	setInt(&p.ChildTokens, body.ChildTokens)
	setInt(&p.ChildOverlap, body.ChildOverlap)
	setInt(&p.CacheTTLSeconds, body.CacheTTLSeconds)
	if body.Grade != nil {
		p.Grade = body.Grade
	}
	if body.Variants != nil {
		v := *body.Variants
		if v < 1 {
			v = 1
		}
		if v > prism.MaxVariants {
			v = prism.MaxVariants
		}
		p.Variants = v
	}
	if p.Mode != "" && !strings.EqualFold(p.Mode, "static") && !strings.EqualFold(p.Mode, "agent") {
		writeError(w, http.StatusBadRequest, codeBadRequest,
			`mode must be "static" or "agent"`, p.Mode)
		return
	}

	if err := g.Save(); err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	s.invalidatePrism()
	writeJSON(w, http.StatusOK, prismSettings(p))
}

func prismSettings(p *config.Prism) map[string]any {
	return map[string]any{
		"embed_model":             p.EmbedModel,
		"embed_provider":          p.EmbedProvider,
		"embed_base_url":          p.EmbedBaseURL,
		"embed_fallback_model":    p.EmbedFallbackModel,
		"embed_fallback_provider": p.EmbedFallbackProvider,
		"utility_model":           p.UtilityModel,
		"utility_provider":        p.UtilityProvider,
		"mode":                    defaultStr(p.Mode, "static"),
		"top_k":                   defaultInt(p.TopK, prism.DefaultTopK),
		"variants":                defaultInt(p.Variants, 1),
		"grade":                   p.GradeEnabled(),
		"parent_tokens":           defaultInt(p.ParentTokens, prism.DefaultChunkConfig().ParentTokens),
		"child_tokens":            defaultInt(p.ChildTokens, prism.DefaultChunkConfig().ChildTokens),
		"child_overlap":           defaultInt(p.ChildOverlap, prism.DefaultChunkConfig().ChildOverlap),
		"cache_ttl_seconds":       defaultInt(p.CacheTTLSeconds, int(prism.DefaultCacheTTL.Seconds())),
		"max_variants":            prism.MaxVariants,
	}
}

func setStr(dst *string, src *string) {
	if src != nil {
		*dst = strings.TrimSpace(*src)
	}
}

func setInt(dst *int, src *int) {
	if src != nil && *src >= 0 {
		*dst = *src
	}
}

func defaultStr(v, dflt string) string {
	if strings.TrimSpace(v) == "" {
		return dflt
	}
	return v
}

func defaultInt(v, dflt int) int {
	if v == 0 {
		return dflt
	}
	return v
}
