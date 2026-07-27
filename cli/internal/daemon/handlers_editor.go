package daemon

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
)

// maxEditorWrite caps a single save. The editor loads at most 1 MiB (see
// handleFile), so a larger write means something other than an edited buffer.
const maxEditorWrite = 4 << 20 // 4 MiB

// PUT /v1/workspaces/{id}/file?path=<rel>   {"content": "..."}
//
// Overwrites a file in the workspace with the editor's buffer. Writes go
// through a temporary file in the same directory and are then renamed, so an
// interrupted save cannot leave a half-written source file on disk — the whole
// point of an editor is that it must not be able to destroy your work.
func (s *Server) handlePutFile(w http.ResponseWriter, r *http.Request) {
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

	var body struct {
		Content string `json:"content"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxEditorWrite))
	if err := dec.Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "invalid request body", err.Error())
		return
	}

	// Refuse to create a file that is not already tracked by the editor's own
	// view of the repo: this endpoint saves edits, it does not scaffold.
	info, err := os.Stat(abs)
	if err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "file not found", rel)
		return
	}
	if info.IsDir() {
		writeError(w, http.StatusBadRequest, codeBadRequest, "path is a directory", rel)
		return
	}

	tmp, err := os.CreateTemp(filepath.Dir(abs), ".kaioken-save-*")
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	tmpName := tmp.Name()
	// Any failure from here on must not leave the scratch file behind.
	defer os.Remove(tmpName)

	if _, err := tmp.WriteString(body.Content); err != nil {
		tmp.Close()
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	if err := tmp.Close(); err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	// Preserve the original mode; CreateTemp makes 0600, which would silently
	// strip the executable bit from a script.
	if err := os.Chmod(tmpName, info.Mode().Perm()); err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	if err := os.Rename(tmpName, abs); err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}

	after, err := os.Stat(abs)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"path":     rel,
		"bytes":    after.Size(),
		"modified": after.ModTime().UTC().Format("2006-01-02T15:04:05Z07:00"),
	})
}
