package daemon

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"path"
	"path/filepath"
	"sort"
	"strings"

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

// maxGitPaths caps how many paths one staging call may name. "Stage all" on a
// large repo is legitimate; a request an order of magnitude past that is not,
// and shelling out to git with an unbounded argv is how you hit the platform
// command-length limit at the worst moment.
const maxGitPaths = 10000

// maxGitDiffBytes truncates a single file's diff. A panel renders a few hundred
// lines before the user stops reading; a generated file's 50 MB diff would
// otherwise be marshalled, shipped and parsed for nothing.
const maxGitDiffBytes = 512 << 10 // 512 KiB

// gitChange is one row in the source-control panel: the classification from
// gitx.Status plus the added/removed line counts the panel shows beside it.
type gitChange struct {
	gitx.FileStatus
	Added   int `json:"added"`
	Removed int `json:"removed"`
}

// GET /v1/workspaces/{id}/git/status
//
// Per-file working-tree changes with A/M/D/untracked classification, a
// staged/unstaged split, per-file line counts and the branch's ahead/behind
// position — the structured counterpart of the aggregate dirty_count that GET
// /git already returns. This is what the explorer's source-control panel
// renders instead of shelling out to git from the front-end.
func (s *Server) handleGitStatus(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	s.writeGitStatus(w, filepath.FromSlash(ws.Path))
}

// POST /v1/workspaces/{id}/git/stage    {"paths": ["a.go"]}
// POST /v1/workspaces/{id}/git/unstage  {"paths": ["a.go"]}
//
// Each responds with the refreshed status, so a panel toggling a checkbox gets
// its new state from the same round trip rather than racing a follow-up GET.
func (s *Server) handleGitStage(w http.ResponseWriter, r *http.Request) {
	s.gitPathOp(w, r, gitx.Stage)
}

func (s *Server) handleGitUnstage(w http.ResponseWriter, r *http.Request) {
	s.gitPathOp(w, r, gitx.Unstage)
}

// POST /v1/workspaces/{id}/git/discard {"paths": ["a.go"]}
//
// Irreversible: it throws away uncommitted work and deletes untracked files.
// The confirmation belongs to the caller — by the time a request arrives here
// the user is taken to have agreed to it.
func (s *Server) handleGitDiscard(w http.ResponseWriter, r *http.Request) {
	s.gitPathOp(w, r, gitx.Discard)
}

// POST /v1/workspaces/{id}/git/commit {"message": "...", "amend": false}
func (s *Server) handleGitCommit(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	repo := filepath.FromSlash(ws.Path)
	if !gitx.IsRepo(repo) {
		writeError(w, http.StatusBadRequest, codeBadRequest, "not a git repository", "")
		return
	}
	var body struct {
		Message string `json:"message"`
		Amend   bool   `json:"amend"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "invalid request body", err.Error())
		return
	}
	if strings.TrimSpace(body.Message) == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "commit message is required", "")
		return
	}
	sha, err := gitx.Commit(r.Context(), repo, body.Message, body.Amend)
	if err != nil {
		// A rejecting pre-commit hook, a missing user.email or nothing staged
		// all land here. The git message is the useful part, so pass it on.
		writeError(w, http.StatusConflict, codeEngineError, "commit failed", err.Error())
		return
	}
	payload, err := gitStatusPayload(r.Context(), repo)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	payload["commit"] = map[string]any{"sha": sha, "short": gitx.Short(sha)}
	writeJSON(w, http.StatusOK, payload)
}

// GET /v1/workspaces/{id}/git/diff?path=<rel>&staged=true
//
// The unified diff for one path, truncated at maxGitDiffBytes. Untracked files
// are synthesised against /dev/null by gitx so a new file still renders as a
// diff rather than an empty pane.
func (s *Server) handleGitDiff(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	repo := filepath.FromSlash(ws.Path)
	if !gitx.IsRepo(repo) {
		writeError(w, http.StatusBadRequest, codeBadRequest, "not a git repository", "")
		return
	}
	rel := r.URL.Query().Get("path")
	if rel == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "path is required", "")
		return
	}
	if _, err := safeJoin(repo, rel); err != nil {
		writeError(w, http.StatusBadRequest, codePathEscape, "path escapes workspace", rel)
		return
	}
	staged := r.URL.Query().Get("staged") == "true"
	diff, err := gitx.FileDiff(r.Context(), repo, filepath.ToSlash(rel), staged, maxGitDiffBytes)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"path":      filepath.ToSlash(rel),
		"staged":    staged,
		"diff":      diff,
		"truncated": strings.HasSuffix(diff, "[diff truncated]"),
	})
}

// gitPathOp is the shared body of stage/unstage/discard: decode a path list,
// validate every entry stays inside the workspace, run op, answer with the
// refreshed status.
func (s *Server) gitPathOp(w http.ResponseWriter, r *http.Request, op func(context.Context, string, []string) error) {
	ws := s.workspaceFromRequest(w, r)
	if ws == nil {
		return
	}
	repo := filepath.FromSlash(ws.Path)
	if !gitx.IsRepo(repo) {
		writeError(w, http.StatusBadRequest, codeBadRequest, "not a git repository", "")
		return
	}
	var body struct {
		Paths []string `json:"paths"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "invalid request body", err.Error())
		return
	}
	if len(body.Paths) == 0 {
		writeError(w, http.StatusBadRequest, codeBadRequest, "paths is required and must be non-empty", "")
		return
	}
	if len(body.Paths) > maxGitPaths {
		writeError(w, http.StatusBadRequest, codeBadRequest,
			fmt.Sprintf("too many paths (%d, limit %d)", len(body.Paths), maxGitPaths), "")
		return
	}
	paths := make([]string, 0, len(body.Paths))
	for _, p := range body.Paths {
		if _, err := safeJoin(repo, p); err != nil {
			writeError(w, http.StatusBadRequest, codePathEscape, "path escapes workspace", p)
			return
		}
		paths = append(paths, filepath.ToSlash(p))
	}
	if err := op(r.Context(), repo, paths); err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	s.writeGitStatus(w, repo)
}

// writeGitStatus answers with the current status payload, or the not-a-repo
// shape for a workspace that is not under version control.
func (s *Server) writeGitStatus(w http.ResponseWriter, repo string) {
	payload, err := gitStatusPayload(context.Background(), repo)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}
	writeJSON(w, http.StatusOK, payload)
}

// gitStatusPayload builds the §2.4 git status body. Line stats and upstream
// tracking are best-effort: a repo with no upstream, or a `git diff` that fails
// on some exotic config, still yields a usable file list rather than a 500.
func gitStatusPayload(ctx context.Context, repo string) (map[string]any, error) {
	if !gitx.IsRepo(repo) {
		return map[string]any{
			"is_repo":      false,
			"branch":       "",
			"head":         "",
			"short":        "",
			"upstream":     "",
			"ahead":        0,
			"behind":       0,
			"dirty_count":  0,
			"staged_count": 0,
			"changes":      []gitChange{},
		}, nil
	}
	statuses, err := gitx.Status(repo)
	if err != nil {
		return nil, err
	}
	stats, err := gitx.LineStats(ctx, repo)
	if err != nil {
		stats = map[string]gitx.LineStat{}
	}
	changes := make([]gitChange, 0, len(statuses))
	staged := 0
	for _, st := range statuses {
		if st.Staged {
			staged++
		}
		s := stats[st.Path]
		changes = append(changes, gitChange{FileStatus: st, Added: s.Added, Removed: s.Removed})
	}
	branch, _ := gitx.Branch(repo)
	head, _ := gitx.Head(ctx, repo)
	upstream, ahead, behind := gitx.Upstream(ctx, repo)
	return map[string]any{
		"is_repo":      true,
		"branch":       branch,
		"head":         head,
		"short":        gitx.Short(head),
		"upstream":     upstream,
		"ahead":        ahead,
		"behind":       behind,
		"dirty_count":  len(changes),
		"staged_count": staged,
		"changes":      changes,
	}, nil
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
