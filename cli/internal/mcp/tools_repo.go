package mcp

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"kaioken/internal/gitx"
	"kaioken/internal/plan"
	"kaioken/internal/scan"
	"kaioken/internal/state"
)

func (s *Server) registerRepoTools() {
	s.register(Tool{
		Name: "repo_scan",
		Description: "Inventory the repository: file and line counts, language breakdown, " +
			"and a directory tree summary. Cheap and offline — a good first call for " +
			"orienting in an unfamiliar codebase.",
		InputSchema: object().
			integer("tree_depth", "How many files to show per directory in the tree summary.", 8, 0, 50).
			build(),
		Handler: repoScan,
	})

	s.register(Tool{
		Name: "repo_status",
		Description: "Report how current Kaioken's knowledge is: which modules have " +
			"up-to-date cards, which changed since generation, and which were never " +
			"generated. Call this before trusting a wiki chapter about fast-moving code.",
		InputSchema: object().build(),
		Handler:     repoStatus,
	})

	s.register(Tool{
		Name: "repo_git",
		Description: "Read-only git inspection: working-tree status, recent commit " +
			"subjects, or a diff against a base revision. Never writes to the repository.",
		InputSchema: object().
			enum("operation", "What to read.", "status", "log", "diff").
			str("base", `Base revision for diff/log, e.g. "HEAD~5" or "main". Defaults to HEAD.`).
			integer("limit", "Maximum commits for log, or maximum diff kilobytes.", 20, 1, 200).
			require("operation").
			build(),
		Handler: repoGit,
	})
}

func repoScan(ctx callContext, raw json.RawMessage) (*ToolResult, error) {
	var args struct {
		TreeDepth int `json:"tree_depth"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return nil, fmt.Errorf("bad arguments: %w", err)
	}
	if args.TreeDepth <= 0 {
		args.TreeDepth = 8
	}

	res, err := scan.Repo(ctx.srv.repo, ctx.srv.config())
	if err != nil {
		return nil, fmt.Errorf("scanning %s: %w", ctx.srv.repo, err)
	}

	langs := map[string]int{}
	for _, f := range res.Files {
		ext := strings.TrimPrefix(filepath.Ext(f.Path), ".")
		if ext == "" {
			ext = "(none)"
		}
		langs[ext]++
	}
	type langCount struct {
		Ext   string `json:"ext"`
		Files int    `json:"files"`
	}
	ranked := make([]langCount, 0, len(langs))
	for ext, n := range langs {
		ranked = append(ranked, langCount{Ext: ext, Files: n})
	}
	sort.Slice(ranked, func(i, j int) bool {
		if ranked[i].Files != ranked[j].Files {
			return ranked[i].Files > ranked[j].Files
		}
		return ranked[i].Ext < ranked[j].Ext
	})
	if len(ranked) > 20 {
		ranked = ranked[:20]
	}

	var b strings.Builder
	fmt.Fprintf(&b, "# %s\n\n%s\n\n## Languages\n\n", ctx.srv.repo, res.Stats())
	for _, l := range ranked {
		fmt.Fprintf(&b, "- %s: %d file(s)\n", l.Ext, l.Files)
	}
	b.WriteString("\n## Tree\n\n```\n")
	b.WriteString(res.TreeSummary(args.TreeDepth))
	b.WriteString("```\n")

	return jsonResult(b.String(), map[string]any{
		"repo":      ctx.srv.repo,
		"stats":     res.Stats(),
		"files":     len(res.Files),
		"languages": ranked,
	}), nil
}

type moduleStatus struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	State       string    `json:"state"`
	Model       string    `json:"model,omitempty"`
	FileCount   int       `json:"file_count,omitempty"`
	GeneratedAt time.Time `json:"generated_at,omitempty"`
}

func repoStatus(ctx callContext, _ json.RawMessage) (*ToolResult, error) {
	repo := ctx.srv.repo

	p, err := plan.Load(repo)
	if err != nil {
		return textResult(fmt.Sprintf(
			"No module plan in %s — Kaioken has not analysed this repository yet.\n"+
				"Run `kaioken init` then `kaioken plan` and `kaioken generate` there.", repo)), nil
	}
	st, err := state.Load(repo)
	if err != nil {
		return nil, err
	}
	res, err := scan.Repo(repo, ctx.srv.config())
	if err != nil {
		return nil, err
	}

	// Bucket every scanned file by path so a module's scope can be resolved to
	// the files it actually covers, which is what the hash is taken over.
	flat := p.Flatten()
	out := make([]moduleStatus, 0, len(flat))
	counts := map[string]int{}
	for _, fm := range flat {
		ms, generated := st.Modules[fm.ID]
		status := moduleStatus{ID: fm.ID, Title: fm.Title}
		switch {
		case !generated:
			status.State = "missing"
		default:
			status.Model = ms.Model
			status.FileCount = ms.FileCount
			status.GeneratedAt = ms.GeneratedAt
			files := filesInScope(res, fm.Scope)
			if len(files) == 0 {
				status.State = "empty"
				break
			}
			hash, herr := state.HashFiles(repo, files)
			if herr != nil || hash != ms.SourceHash {
				status.State = "changed"
			} else {
				status.State = "uptodate"
			}
		}
		counts[status.State]++
		out = append(out, status)
	}

	var b strings.Builder
	fmt.Fprintf(&b, "Knowledge freshness for %s\n\n", repo)
	fmt.Fprintf(&b, "%d up to date, %d changed, %d never generated, %d empty\n\n",
		counts["uptodate"], counts["changed"], counts["missing"], counts["empty"])
	for _, m := range out {
		marker := map[string]string{
			"uptodate": "✓", "changed": "↻", "missing": "·", "empty": "∅",
		}[m.State]
		fmt.Fprintf(&b, "%s %-40s %s\n", marker, m.ID, m.State)
	}
	if counts["changed"] > 0 || counts["missing"] > 0 {
		b.WriteString("\nRun `kaioken update` in the repo to refresh the stale entries. " +
			"Treat chapters about `changed` modules as possibly behind the code.\n")
	}

	return jsonResult(b.String(), map[string]any{
		"repo":    repo,
		"modules": out,
		"summary": counts,
	}), nil
}

// filesInScope resolves a module's scope patterns against the scan result,
// matching generate's own rule: a scope entry is a file path or a directory
// prefix.
func filesInScope(res *scan.Result, scope []string) []scan.File {
	var out []scan.File
	for _, f := range res.Files {
		for _, s := range scope {
			s = strings.TrimSuffix(filepath.ToSlash(s), "/")
			if f.Path == s || strings.HasPrefix(f.Path, s+"/") {
				out = append(out, f)
				break
			}
		}
	}
	return out
}

func repoGit(ctx callContext, raw json.RawMessage) (*ToolResult, error) {
	var args struct {
		Operation string `json:"operation"`
		Base      string `json:"base"`
		Limit     int    `json:"limit"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return nil, fmt.Errorf("bad arguments: %w", err)
	}
	repo := ctx.srv.repo
	if !gitx.IsRepo(repo) {
		return nil, fmt.Errorf("%s is not a git repository", repo)
	}
	if args.Limit <= 0 {
		args.Limit = 20
	}
	base := strings.TrimSpace(args.Base)
	if base == "" {
		base = "HEAD"
	}

	switch args.Operation {
	case "status":
		branch, _ := gitx.Branch(repo)
		head, _ := gitx.Head(ctx, repo)
		changes, err := gitx.Changes(ctx, repo, "HEAD")
		if err != nil {
			return nil, err
		}
		var b strings.Builder
		fmt.Fprintf(&b, "branch %s at %s\n", branch, gitx.Short(head))
		if len(changes) == 0 {
			b.WriteString("working tree clean\n")
		} else {
			fmt.Fprintf(&b, "%d changed file(s):\n", len(changes))
			for _, c := range changes {
				fmt.Fprintf(&b, "  %s %s\n", c.Status, c.Path)
			}
		}
		return jsonResult(b.String(), map[string]any{
			"branch": branch, "head": head, "changes": changes,
		}), nil

	case "log":
		subjects, err := gitx.Subjects(ctx, repo, base, args.Limit)
		if err != nil {
			return nil, err
		}
		var b strings.Builder
		fmt.Fprintf(&b, "%d commit(s) from %s:\n", len(subjects), base)
		for _, s := range subjects {
			fmt.Fprintf(&b, "  %s\n", s)
		}
		return jsonResult(b.String(), map[string]any{"base": base, "subjects": subjects}), nil

	case "diff":
		if !gitx.HasCommit(ctx, repo, base) {
			return nil, fmt.Errorf("no such revision %q in %s", base, repo)
		}
		patch, err := gitx.Patch(ctx, repo, base, nil, args.Limit*1024)
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(patch) == "" {
			return textResult(fmt.Sprintf("No changes against %s.", base)), nil
		}
		return jsonResult(patch, map[string]any{"base": base, "patch": patch}), nil

	default:
		return nil, fmt.Errorf("unknown operation %q — use status, log or diff", args.Operation)
	}
}

// fileExists is used by the resource layer to distinguish "no such document"
// from a read error worth reporting.
func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
