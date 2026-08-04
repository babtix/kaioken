package daemon

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"kaioken/internal/config"
	"kaioken/internal/generate"
	"kaioken/internal/plan"
	"kaioken/internal/reportpdf"
	"kaioken/internal/research"
	"kaioken/internal/version"
	"kaioken/internal/skills"
	"kaioken/internal/webfetch"
	"kaioken/internal/websearch"
	"kaioken/internal/wiki"
)

// --- T035: Run endpoints ---

// POST /v1/workspaces/{id}/runs
func (s *Server) handleStartRun(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	var body struct {
		Kind   string         `json:"kind"`
		Params map[string]any `json:"params"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Kind == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "kind is required", "")
		return
	}
	if body.Params == nil {
		body.Params = map[string]any{}
	}

	// Conflict check: same kind already active.
	if s.runs.ActiveKind(ws.ID, body.Kind) {
		writeError(w, http.StatusConflict, codeRunConflict,
			fmt.Sprintf("a %s run is already active on this workspace", body.Kind), "")
		return
	}

	// API key check for LLM-backed runs.
	if needsKey(body.Kind) {
		if _, err := ws.Client(); err != nil {
			writeError(w, http.StatusConflict, codeNoAPIKey, err.Error(), "")
			return
		}
	}

	fn, err := s.runFn(ws, body.Kind, body.Params)
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, err.Error(), "")
		return
	}

	run := s.runs.Start(ws, body.Kind, body.Params, s.bookRunSpend(ws, body.Kind, fn))
	writeJSON(w, http.StatusAccepted, run)
}

// GET /v1/workspaces/{id}/runs
func (s *Server) handleListRuns(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	activeOnly := r.URL.Query().Get("active") == "true"
	limit := 20
	fmt.Sscanf(r.URL.Query().Get("limit"), "%d", &limit)
	runs := s.runs.List(ws.ID, activeOnly, limit)
	writeJSON(w, http.StatusOK, map[string]any{"runs": runs})
}

// GET /v1/runs/{run_id}
func (s *Server) handleGetRun(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("run_id")
	run, ok := s.runs.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, codeNotFound, "run not found", "")
		return
	}
	writeJSON(w, http.StatusOK, run)
}

// POST /v1/runs/{run_id}/cancel
func (s *Server) handleCancelRun(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("run_id")
	if err := s.runs.Cancel(id); err != nil {
		writeError(w, http.StatusConflict, codeRunNotCancellable, err.Error(), "")
		return
	}
	w.WriteHeader(http.StatusAccepted)
}

// POST /v1/runs/{run_id}/revert deletes the files a run wrote, returning the
// repo to its pre-run state. Only the run's own recorded artifacts are touched,
// and every path is confined to the workspace root via safeJoin.
func (s *Server) handleRevertRun(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("run_id")
	run, ok := s.runs.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, codeNotFound, "run not found", "")
		return
	}
	ws, ok := s.mgr.Get(run.WorkspaceID)
	if !ok {
		writeError(w, http.StatusNotFound, codeWorkspaceNotFound, "workspace not found", "")
		return
	}
	repo := filepath.FromSlash(ws.Path)

	run.mu.Lock()
	artifacts := make([]Artifact, len(run.Artifacts))
	copy(artifacts, run.Artifacts)
	run.mu.Unlock()

	deleted := 0
	for _, a := range artifacts {
		abs, err := safeJoin(repo, a.Path)
		if err != nil {
			continue // never touch anything outside the repo
		}
		if err := os.Remove(abs); err == nil {
			deleted++
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": deleted, "total": len(artifacts)})
}

// --- T038: Estimate endpoint ---

// GET /v1/workspaces/{id}/estimate
func (s *Server) handleEstimate(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	kind := r.URL.Query().Get("kind")
	if kind == "" {
		kind = "wiki"
	}
	multiplier := 3
	fmt.Sscanf(r.URL.Query().Get("multiplier"), "%d", &multiplier)

	repo := filepath.FromSlash(ws.Path)
	cfg := ws.Config()
	if cfg == nil {
		cfg = defaultCfg()
	}
	res, err := ws.ScanCached(false)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}

	if kind != "wiki" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "estimate only supports kind=wiki", "")
		return
	}

	est := wiki.EstimateRun(repo, cfg, res, multiplier)
	writeJSON(w, http.StatusOK, map[string]any{
		"kind":          "wiki",
		"multiplier":    multiplier,
		"calls":         est.Calls,
		"prompt_tokens": est.PromptTokens,
		"output_tokens": est.OutputTokens,
		"total_tokens":  est.PromptTokens + est.OutputTokens,
		"heavy":         est.Calls > 50,
		"passes":        est.Passes,
		"text":          est.String(),
	})
}

// --- T036 + T037: Engine wiring ---

// runFn builds the goroutine body for each run kind.
func (s *Server) runFn(ws *Workspace, kind string, params map[string]any) (func(ctx context.Context, r *RunRecord) error, error) {
	repo := filepath.FromSlash(ws.Path)

	switch kind {
	case "scan":
		return func(ctx context.Context, r *RunRecord) error {
			res, err := ws.ScanCached(true)
			if err != nil {
				return err
			}
			r.SetProgress("scan", "scanning", 1, 1)
			r.finishSummary = map[string]any{"files": len(res.Files), "bytes": res.TotalSize}
			return nil
		}, nil

	case "plan":
		return func(ctx context.Context, r *RunRecord) error {
			client, err := ws.Client()
			if err != nil {
				return err
			}
			cfg := ws.Config()
			res, err := ws.ScanCached(false)
			if err != nil {
				return err
			}
			r.SetProgress("plan", "planning modules", 0, 0)
			p, err := plan.Generate(ctx, client, cfg, res)
			if err != nil {
				return err
			}
			if err := p.Save(repo); err != nil {
				return err
			}
			flat := p.Flatten()
			r.finishSummary = map[string]any{"modules": len(flat), "coverage_pct": 0}
			return nil
		}, nil

	case "generate":
		return func(ctx context.Context, r *RunRecord) error {
			client, err := ws.Client()
			if err != nil {
				return err
			}
			cfg := ws.Config()
			p, err := plan.Load(repo)
			if err != nil {
				return err
			}
			res, err := ws.ScanCached(false)
			if err != nil {
				return err
			}
			opts := generate.Options{
				Force: boolParam(params, "force"),
				Only:  stringSliceParam(params, "only"),
				OnStart: func(id string) {
					r.SetProgress("generate", id, 0, 0)
					s.hub.RunLog(ws.ID, r.ID, "info", "generating "+id)
				},
				OnDone: func(id string, err error, skipped bool) {
					if err != nil {
						s.hub.RunLog(ws.ID, r.ID, "error", id+": "+err.Error())
					} else if !skipped {
						s.hub.RunArtifact(ws.ID, r.ID, ".kaioken/knowledge/"+id, 0, "card")
					}
				},
			}
			r.SetProgress("generate", "generating cards", 0, 0)
			err = generate.Run(ctx, repo, cfg, client, p, res, opts)
			r.finishSummary = map[string]any{"generated": 0, "skipped": 0, "failed": 0}
			return err
		}, nil

	case "wiki":
		return func(ctx context.Context, r *RunRecord) error {
			client, err := ws.Client()
			if err != nil {
				return err
			}
			cfg := ws.Config()
			res, err := ws.ScanCached(false)
			if err != nil {
				return err
			}
			multiplier := intParam(params, "multiplier", 3)
			force := boolParam(params, "force")
			pg := s.wikiProgress(ws, r)
			r.SetProgress("wiki", "starting", 0, 0)
			err = wiki.Run(ctx, repo, cfg, client, res, multiplier, force, pg)
			stamp := wiki.LoadStamp(repo)
			r.finishSummary = map[string]any{
				"sections": 0, "documents": 0, "failed": stamp.Failed,
			}
			return err
		}, nil

	case "wiki_retry":
		return func(ctx context.Context, r *RunRecord) error {
			client, err := ws.Client()
			if err != nil {
				return err
			}
			cfg := ws.Config()
			res, err := ws.ScanCached(false)
			if err != nil {
				return err
			}
			pg := s.wikiProgress(ws, r)
			r.SetProgress("wiki_retry", "retrying failed sections", 0, 0)
			n, err := wiki.Retry(ctx, repo, cfg, client, res, pg)
			r.finishSummary = map[string]any{"retried": n}
			return err
		}, nil

	case "update":
		return func(ctx context.Context, r *RunRecord) error {
			client, err := ws.Client()
			if err != nil {
				return err
			}
			cfg := ws.Config()
			res, err := ws.ScanCached(false)
			if err != nil {
				return err
			}
			base := stringParam(params, "base")
			pg := s.wikiProgress(ws, r)
			r.SetProgress("update", "computing diff", 0, 0)
			rep, err := wiki.Update(ctx, repo, cfg, client, res, base, pg)
			if err != nil {
				return err
			}
			r.finishSummary = map[string]any{
				"changed_files": len(rep.Changes),
				"updated_docs":  len(rep.Updated),
				"unassigned":    rep.Unassigned,
				"base":          rep.Base,
			}
			return nil
		}, nil

	case "skills":
		return func(ctx context.Context, r *RunRecord) error {
			client, err := ws.Client()
			if err != nil {
				return err
			}
			cfg := ws.Config()
			res, err := ws.ScanCached(false)
			if err != nil {
				return err
			}
			opts := skills.Options{
				Force: boolParam(params, "force"),
				Only:  stringSliceParam(params, "only"),
			}
			pg := skills.Progress{
				Info:    func(t string) { s.hub.RunLog(ws.ID, r.ID, "info", t) },
				Started: func(w string) { r.SetProgress("skills", w, 0, 0) },
				Wrote:   func(p string, lines int) { s.hub.RunArtifact(ws.ID, r.ID, p, lines, "skill") },
				Failed:  func(w string, err error) { s.hub.RunLog(ws.ID, r.ID, "error", w+": "+err.Error()) },
			}
			r.SetProgress("skills", "building skills", 0, 0)
			written, err := skills.Run(ctx, repo, cfg, client, res, opts, pg)
			r.finishSummary = map[string]any{"written": len(written)}
			return err
		}, nil

	case "research":
		// Validation and provider resolution happen here, at request time, so
		// a missing question or search key is a 400 the user sees immediately
		// rather than a run that starts and dies asynchronously.
		question := strings.TrimSpace(stringParam(params, "question"))
		if question == "" {
			return nil, fmt.Errorf("research requires a question param")
		}
		global := config.LoadGlobal()
		provider, err := websearch.Resolve(global.Research.SearchProvider, global.Keys)
		if err != nil {
			return nil, err
		}
		return func(ctx context.Context, r *RunRecord) error {
			client, err := ws.Client()
			if err != nil {
				return err
			}
			cfg := ws.Config()
			if cfg == nil {
				// Research never reads the repository, so an uninitialised
				// workspace is no reason to refuse.
				cfg = defaultCfg()
			}
			multiplier := intParam(params, "multiplier", 3)
			resume := strings.TrimSpace(stringParam(params, "resume"))
			limit, _ := cfg.EffectiveConcurrency(client.Model)

			opts := research.Options{
				Multiplier:  multiplier,
				MaxRounds:   global.Research.MaxRounds,
				MaxDuration: global.Research.ResearchTimeout(),
				Concurrency: limit,
				Mode:        stringParam(params, "mode"),
				// Resume continues an interrupted run from its checkpoint —
				// the engine validates that the question belongs to it.
				Resume:      resume,
				Verify:      boolParam(params, "verify") || global.Research.Verify,
				Repo:        repo,
			}
			if opts.Mode == "" {
				opts.Mode = global.Research.Mode
			}
			// Firecrawl in the active search set means its scrape API reads
			// the pages too (with the built-in fetcher as per-URL fallback).
			// Pinning "tavily" therefore means zero Firecrawl calls at all.
			if strings.Contains(provider.Name(), "firecrawl") {
				if fk := websearch.KeyFor("firecrawl", global.Keys); fk != "" {
					opts.Fetcher = webfetch.NewFirecrawl(fk, nil)
				}
			}

			// SetProgress alone only mutates the record — the hub publish is
			// what makes the desktop's research timeline move live.
			stage := func(msg string, done, total int) {
				r.SetProgress("research", msg, done, total)
				s.hub.RunProgress(ws.ID, r.ID, "research", msg, done, total)
			}

			stage("starting", 0, 0)
			rep, err := research.Run(ctx, client, provider, question, opts, research.Progress{
				Stage:  func(t string) { stage(t, 0, 0) },
				Detail: func(t string) { s.hub.RunLog(ws.ID, r.ID, "info", t) },
				Round:  func(n, of int) { stage(fmt.Sprintf("round %d of %d", n, of), n, of) },
			})
			if err != nil {
				return err
			}

			// Persist the rendered report alongside the wiki so the run
			// leaves the same kind of durable artifact the CLI command does,
			// plus the structured JSON twin the history endpoints serve —
			// that is what lets the user reopen this answer later.
			slug := research.Slug(question)
			rel := filepath.ToSlash(filepath.Join(config.Dir, "research", slug+".md"))
			abs, err := safeJoin(repo, rel)
			if err == nil {
				if err := os.MkdirAll(filepath.Dir(abs), 0o755); err == nil {
					rendered := rep.Render()
					if err := os.WriteFile(abs, []byte(rendered), 0o644); err == nil {
						lines := strings.Count(rendered, "\n") + 1
						r.AddArtifact(rel, lines, "research_report")
						s.hub.RunArtifact(ws.ID, r.ID, rel, lines, "research_report")
					}
					prov := research.Provenance{
						Model: client.Model, SearchProvider: provider.Name(), Multiplier: multiplier,
					}
					if _, err := research.Save(filepath.Dir(abs), rep, rel, prov); err != nil {
						s.hub.RunLog(ws.ID, r.ID, "error", "saving research history: "+err.Error())
					}
					// A deep run's real artifact is the signed dossier. It is
					// registered like any other so the desktop can open it.
					if rep.Deep != nil {
						pdfRel := strings.TrimSuffix(rel, ".md") + ".pdf"
						pdfAbs := strings.TrimSuffix(abs, ".md") + ".pdf"
						pages, perr := reportpdf.WriteFile(rep, reportpdf.Meta{
							Tool: "kaioken", Version: version.Version, Model: client.Model,
							Provider: provider.Name(), Multiplier: multiplier,
						}, pdfAbs)
						if perr != nil {
							s.hub.RunLog(ws.ID, r.ID, "error", "writing the dossier PDF: "+perr.Error())
						} else {
							r.AddArtifact(pdfRel, pages, "research_dossier")
							s.hub.RunArtifact(ws.ID, r.ID, pdfRel, pages, "research_dossier")
						}
					}
				}
			}

			// The whole report rides in the summary: run.finished is the only
			// event the desktop needs to render the answer surface.
			sources := make([]map[string]any, 0, len(rep.Sources))
			for _, src := range rep.Sources {
				sources = append(sources, map[string]any{"n": src.N, "url": src.URL, "title": src.Title})
			}
			calls, promptToks, completionToks := client.Usage()
			r.finishSummary = map[string]any{
				"question":    rep.Question,
				"markdown":    rep.Markdown,
				"sources":     sources,
				"rounds":      rep.Rounds,
				"searched":    rep.Searched,
				"fetched":     rep.Fetched,
				"incomplete":  rep.Incomplete,
				"warnings":    rep.Warnings,
				"deep":        rep.Deep != nil,
				"report_path": rel,
				"slug":        slug,
				"providers":   provider.Name(),
				"calls":       calls,
				"tokens":      promptToks + completionToks,
				// The hybrid engine's metadata: which path ran, whether it was
				// promoted mid-run, the line-itemised meter, and the grounding
				// pass's verdict — the answer surface shows all four.
				"path":          rep.Path,
				"run_id":        rep.RunID,
				"escalated":     rep.Escalated,
				"escalated_from": rep.EscalatedFrom,
				"cost":          rep.Cost,
			}
			if rep.Grounding != nil {
				r.finishSummary["grounding"] = map[string]any{
					"checked":    rep.Grounding.Checked,
					"rate":       rep.Grounding.Rate(),
					"ungrounded": len(rep.Grounding.Ungrounded),
				}
			}
			return nil
		}, nil

	default:
		return nil, fmt.Errorf("unknown run kind %q", kind)
	}
}

// wikiProgress builds the wiki.Progress adapter that publishes through the hub.
func (s *Server) wikiProgress(ws *Workspace, r *RunRecord) wiki.Progress {
	return wiki.Progress{
		Info:    func(t string) { s.hub.RunLog(ws.ID, r.ID, "info", t) },
		Started: func(w string) { r.SetProgress("sections", w, 0, 0) },
		Wrote: func(p string, lines int) {
			r.AddArtifact(p, lines, "wiki_doc")
			s.hub.RunArtifact(ws.ID, r.ID, p, lines, "wiki_doc")
		},
		Failed: func(w string, err error) { s.hub.RunLog(ws.ID, r.ID, "error", w+": "+err.Error()) },
	}
}

// --- helpers ---

func needsKey(kind string) bool {
	switch kind {
	case "scan":
		return false
	default:
		return true
	}
}

func defaultCfg() *config.Config {
	return config.Default()
}

func boolParam(m map[string]any, key string) bool {
	v, _ := m[key].(bool)
	return v
}

func intParam(m map[string]any, key string, def int) int {
	if v, ok := m[key].(float64); ok {
		return int(v)
	}
	return def
}

func stringParam(m map[string]any, key string) string {
	v, _ := m[key].(string)
	return v
}

func stringSliceParam(m map[string]any, key string) []string {
	raw, ok := m[key].([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, v := range raw {
		if s, ok := v.(string); ok {
			out = append(out, s)
		}
	}
	return out
}
