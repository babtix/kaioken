package daemon

import (
	"context"
	"net/http"
	"path"
	"path/filepath"
	"sort"

	"kaioken/internal/gitx"
	"kaioken/internal/scan"
)

// explorerNode is one entry in the structured file tree served by
// GET /v1/workspaces/{id}/tree. Directories carry Children; files carry the
// scan metadata the agent itself uses (lines, size, ext). The shape mirrors
// what a desktop explorer renders directly — no client-side rebuilding needed.
type explorerNode struct {
	Name     string          `json:"name"`
	Path     string          `json:"path"` // repo-relative, slash-separated; "" at root
	Type     string          `json:"type"` // "directory" | "file"
	Children []*explorerNode `json:"children,omitempty"`
	Lines    int             `json:"lines,omitempty"`
	Size     int64           `json:"size,omitempty"`
	Ext      string          `json:"ext,omitempty"`
}

// GET /v1/workspaces/{id}/tree?refresh=true
//
// A structured, scope-aware file tree built from the same cached scan that
// /scan and /files use — so a file the scanner excludes (and the agent cannot
// read) is one the explorer never shows. Directories are derived from file
// paths, so empty directories do not appear; that matches the agent's view of
// the repository.
func (s *Server) handleTree(w http.ResponseWriter, r *http.Request) {
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
	root := buildExplorerTree(res.Files, filepath.Base(filepath.FromSlash(ws.Path)))
	writeJSON(w, http.StatusOK, map[string]any{
		"root":     ws.Path,
		"name":     root.Name,
		"children": root.Children,
		"total":    len(res.Files),
	})
}

// GET /v1/workspaces/{id}/git/status
//
// Per-file working-tree changes with A/M/D/untracked classification and a
// staged/unstaged split — the structured counterpart of the aggregate
// dirty_count that GET /git already returns. This is what the explorer's "Git
// changes" panel renders instead of shelling out to git from the front-end.
func (s *Server) handleGitStatus(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	repo := filepath.FromSlash(ws.Path)
	if !gitx.IsRepo(repo) {
		writeJSON(w, http.StatusOK, map[string]any{
			"is_repo":     false,
			"branch":      "",
			"head":        "",
			"short":       "",
			"dirty_count": 0,
			"changes":     []gitx.FileStatus{},
		})
		return
	}
	changes, err := gitx.Status(repo)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	branch, _ := gitx.Branch(repo)
	head, _ := gitx.Head(context.Background(), repo)
	writeJSON(w, http.StatusOK, map[string]any{
		"is_repo":     true,
		"branch":      branch,
		"head":        head,
		"short":       gitx.Short(head),
		"dirty_count": len(changes),
		"changes":     changes,
	})
}

// buildExplorerTree assembles a nested directory/file tree from the scanner's
// flat file list. Directories sort before files, each group alphabetical — the
// ordering a file explorer is expected to show.
func buildExplorerTree(files []scan.File, rootName string) *explorerNode {
	root := &explorerNode{Name: rootName, Path: "", Type: "directory"}
	dirs := map[string]*explorerNode{"": root}
	var ensureDir func(p string) *explorerNode
	ensureDir = func(p string) *explorerNode {
		if n, ok := dirs[p]; ok {
			return n
		}
		parent := ""
		if i := lastSlash(p); i >= 0 {
			parent = p[:i]
		}
		pn := ensureDir(parent)
		n := &explorerNode{Name: path.Base(p), Path: p, Type: "directory"}
		pn.Children = append(pn.Children, n)
		dirs[p] = n
		return n
	}
	for _, f := range files {
		dir := ""
		if i := lastSlash(f.Path); i >= 0 {
			dir = f.Path[:i]
		}
		dn := ensureDir(dir)
		dn.Children = append(dn.Children, &explorerNode{
			Name:  path.Base(f.Path),
			Path:  f.Path,
			Type:  "file",
			Lines: f.Lines,
			Size:  f.Size,
			Ext:   f.Ext,
		})
	}
	sortExplorer(root)
	return root
}

func sortExplorer(n *explorerNode) {
	if len(n.Children) == 0 {
		return
	}
	sort.SliceStable(n.Children, func(i, j int) bool {
		a, b := n.Children[i], n.Children[j]
		if a.Type != b.Type {
			return a.Type == "directory"
		}
		return a.Name < b.Name
	})
	for _, c := range n.Children {
		if c.Type == "directory" {
			sortExplorer(c)
		}
	}
}

func lastSlash(p string) int {
	for i := len(p) - 1; i >= 0; i-- {
		if p[i] == '/' {
			return i
		}
	}
	return -1
}
