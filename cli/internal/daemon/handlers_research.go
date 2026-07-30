package daemon

import (
	"net/http"
	"os"
	"path/filepath"

	"kaioken/internal/config"
	"kaioken/internal/research"
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
