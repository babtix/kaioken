package daemon

import (
	"net/http"
	"os"
	"path/filepath"

	"kaioken/internal/config"
	"kaioken/internal/reportpdf"
	"kaioken/internal/research"
	"kaioken/internal/version"
)

// --- Research history ---
//
// Every finished research run is persisted to <repo>/.kaioken/research as a
// markdown report plus a structured JSON twin (see internal/research/store).
// These endpoints let a client list, reopen and prune that history, so a
// deep search survives an app restart instead of living only in the
// run.finished event that announced it.

// researchDir resolves the workspace's research directory.
func researchDir(ws *Workspace) string {
	return filepath.Join(filepath.FromSlash(ws.Path), config.Dir, "research")
}

// GET /v1/workspaces/{id}/research
func (s *Server) handleListResearch(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	reports := research.List(researchDir(ws))
	if reports == nil {
		reports = []*research.SavedReport{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"reports": reports})
}

// GET /v1/workspaces/{id}/research/{slug}
func (s *Server) handleGetResearch(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	saved, err := research.Load(researchDir(ws), r.PathValue("slug"))
	if err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "no saved research with that slug", "")
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

// POST /v1/workspaces/{id}/research/{slug}/export
//
// Renders a saved report as a signed PDF beside its Markdown twin and returns
// where it landed. The daemon does the rendering rather than the client because
// it already has the workspace on disk and the fonts, and because the signature
// has to be produced by the same code that produced the research — a PDF built
// in the renderer of whatever app happens to be open is not the same artifact.
func (s *Server) handleExportResearch(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	slug := r.PathValue("slug")
	dir := researchDir(ws)
	saved, err := research.Load(dir, slug)
	if err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "no saved research with that slug", "")
		return
	}

	// Load returns the slug validated, so this join cannot escape the
	// workspace's research directory.
	abs := filepath.Join(dir, saved.Slug+".pdf")
	pages, err := reportpdf.WriteSavedFile(saved, reportpdf.Meta{
		Tool: "kaioken", Version: version.Version,
	}, abs)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, "could not render the PDF", err.Error())
		return
	}

	rel := filepath.ToSlash(filepath.Join(config.Dir, "research", saved.Slug+".pdf"))
	var size int64
	if fi, statErr := os.Stat(abs); statErr == nil {
		size = fi.Size()
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"path":  filepath.ToSlash(abs),
		"rel":   rel,
		"pages": pages,
		"bytes": size,
		"deep":  saved.Deep != nil,
	})
}

// DELETE /v1/workspaces/{id}/research/{slug}
func (s *Server) handleDeleteResearch(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	if err := research.Delete(researchDir(ws), r.PathValue("slug")); err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, codeNotFound, "no saved research with that slug", "")
			return
		}
		writeError(w, http.StatusBadRequest, codeBadRequest, err.Error(), "")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- Interrupted runs (stop & continue) ---
//
// Every research run checkpoints itself to the global runs directory as it
// goes, so stopping a run is not losing it: the state stays on disk until
// it is continued or discarded — across restarts, across months. These
// endpoints are the listing and the discard half of that contract; the
// continue half is POST /v1/workspaces/{id}/runs with a resume param.

// GET /v1/research/runs — every interrupted run, newest first.
func (s *Server) handleListResearchRuns(w http.ResponseWriter, r *http.Request) {
	runs := research.ResumableRuns()
	if runs == nil {
		runs = []research.ResumableRun{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"runs": runs})
}

// DELETE /v1/research/runs/{run_id} — discard an interrupted run for good.
func (s *Server) handleDeleteResearchRun(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("run_id")
	if err := research.DeleteRun(id); err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, codeNotFound, "no interrupted run with that id", "")
			return
		}
		writeError(w, http.StatusBadRequest, codeBadRequest, err.Error(), "")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
