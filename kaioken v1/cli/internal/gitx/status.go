package gitx

import (
	"context"
	"path/filepath"
	"strings"
)

// FileStatus is one working-tree path reported by `git status --porcelain`,
// classified by kind and by whether the change is staged (index vs HEAD) or
// unstaged (working tree vs index). The desktop explorer's git navigator
// renders this list with A/M/D badges the way a real IDE does.
type FileStatus struct {
	Path     string `json:"path"`     // repo-relative, slash-separated
	Kind     string `json:"kind"`     // added | modified | deleted | renamed | untracked
	Staged   bool   `json:"staged"`   // changed in the index vs HEAD
	Unstaged bool   `json:"unstaged"` // changed in the working tree vs index
}

// Status lists every modified, staged, deleted, renamed and untracked path in
// repo's working tree. It is the structured counterpart of DirtyCount: the
// explorer's "Git changes" panel wants per-file A/M/D, not just a number. Empty
// (non-nil) when the tree is clean or the repo is not a git work tree.
func Status(repo string) ([]FileStatus, error) {
	out, err := run(context.Background(), repo, "status", "--porcelain")
	if err != nil {
		return nil, err
	}
	statuses := []FileStatus{}
	for _, line := range strings.Split(out, "\n") {
		if len(line) < 3 {
			continue
		}
		x, y := line[0], line[1]
		rest := line[3:]
		// Rename/copy is reported as "old -> new"; keep the destination.
		if i := strings.Index(rest, " -> "); i >= 0 {
			rest = rest[i+4:]
		}
		p := filepath.ToSlash(strings.TrimSpace(rest))
		if p == "" {
			continue
		}
		fs := FileStatus{Path: p}
		if x == '?' && y == '?' {
			fs.Kind = "untracked"
			fs.Unstaged = true
		} else {
			fs.Staged = x != ' ' && x != '?' && x != '!'
			fs.Unstaged = y != ' ' && y != '?' && y != '!'
			c := x
			if c == ' ' || c == '?' || c == '!' {
				c = y
			}
			fs.Kind = statusKind(c)
		}
		statuses = append(statuses, fs)
	}
	return statuses, nil
}

func statusKind(c byte) string {
	switch c {
	case 'A':
		return "added"
	case 'M':
		return "modified"
	case 'D':
		return "deleted"
	case 'R', 'C':
		return "renamed"
	default:
		return "modified"
	}
}
