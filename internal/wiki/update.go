package wiki

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"golang.org/x/sync/errgroup"
	"gopkg.in/yaml.v3"

	"kaioken/internal/codemap"
	"kaioken/internal/config"
	"kaioken/internal/gitx"
	"kaioken/internal/llm"
	"kaioken/internal/scan"
)

// maxPatchBytes caps how much raw diff we hand a single document revision.
const maxPatchBytes = 60_000

// Stamp records the commit a generated wiki corresponds to, so a later update
// knows exactly which diff to feed the model. It also remembers which sections
// failed, so a flaky run can be resumed instead of repeated.
type Stamp struct {
	Commit      string    `yaml:"commit"`
	GeneratedAt time.Time `yaml:"generated_at"`
	Model       string    `yaml:"model"`
	Multiplier  int       `yaml:"multiplier"`
	// Failed lists the section titles that did not generate cleanly.
	Failed []string `yaml:"failed,omitempty"`
}

// StampPath is where the baseline lives.
func StampPath(repo string) string {
	return filepath.Join(repo, config.Dir, "wiki_state.yaml")
}

// LoadStamp reads the baseline; a missing file yields a zero Stamp, not an error.
func LoadStamp(repo string) *Stamp {
	raw, err := os.ReadFile(StampPath(repo))
	if err != nil {
		return &Stamp{}
	}
	var s Stamp
	if err := yaml.Unmarshal(raw, &s); err != nil {
		return &Stamp{}
	}
	return &s
}

// SaveStamp records the commit the wiki now reflects, along with any sections
// that failed. A repo without git simply stores an empty commit, and Update
// will say so rather than guess.
func SaveStamp(repo, model string, multiplier int, failed []string) error {
	s := Stamp{
		GeneratedAt: time.Now().UTC(), Model: model,
		Multiplier: multiplier, Failed: failed,
	}
	if gitx.IsRepo(repo) {
		if head, err := gitx.Head(context.Background(), repo); err == nil {
			s.Commit = head
		}
	}
	if err := os.MkdirAll(filepath.Join(repo, config.Dir), 0o755); err != nil {
		return err
	}
	raw, err := yaml.Marshal(s)
	if err != nil {
		return err
	}
	header := []byte("# kaioken wiki baseline — the commit the generated wiki reflects.\n" +
		"# `kaioken update` diffs the repo against this commit and revises only\n" +
		"# the documents the change actually touches. Delete to re-baseline.\n")
	return os.WriteFile(StampPath(repo), append(header, raw...), 0o644)
}

// UpdateReport summarises one incremental run.
type UpdateReport struct {
	Base       string
	Head       string
	Changes    []gitx.Change
	Commits    []string
	Updated    []string // repo-relative doc paths that were revised
	Unassigned []string // changed files no section claims — hints at a re-plan
}

// docTarget is one markdown file that a set of changed files invalidates.
type docTarget struct {
	Path    string   // absolute path to the .md
	Section Section  // the section it belongs to
	Title   string   // document title (section or subsection)
	Files   []string // changed repo-relative files that hit this doc
}

const updateSystem = `You are maintaining an existing chapter of a repository wiki. The code
has changed and your job is to produce the UPDATED chapter.

You are given: the current document, the git diff of what changed, and the current contents of
the changed files.

Rules:
- PRESERVE everything still accurate — keep the document's structure, headings, anchors,
  tables, mermaid diagrams and depth. This is a revision, not a rewrite.
- Rewrite only what the diff invalidates: changed signatures, renamed or deleted files,
  altered flows, new components. Add real coverage for genuinely new functionality.
- DELETE documentation for code that no longer exists.
- Keep the "Referenced Files" list accurate.
- Never invent APIs, files or behavior absent from the sources.

Output ONLY the complete updated markdown document — no commentary, no diff, no JSON.`

const changelogSystem = `You summarise a repository's changes for a documentation changelog.
Given commit subjects and a diff, write 2–5 bullet points describing what actually changed in
the software, in plain engineering language. No preamble, no headings — bullets only.`

// Update revises only the wiki documents that the repository's git diff
// actually invalidates, using the recorded baseline commit. baseOverride (a
// SHA, tag or expression like HEAD~5) wins over the recorded baseline.
func Update(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
	res *scan.Result, baseOverride string, pg Progress) (*UpdateReport, error) {

	outline, err := loadOutline(repo)
	if err != nil || outline == nil || len(outline.Sections) == 0 {
		return nil, fmt.Errorf("no wiki plan at %s — run the wiki first", OutlinePath(repo))
	}
	if _, err := os.Stat(WikiDir(repo)); err != nil {
		return nil, fmt.Errorf("no generated wiki at %s — run the wiki first", WikiDir(repo))
	}
	if !gitx.IsRepo(repo) {
		return nil, fmt.Errorf("update needs git: %s is not a git repository (git must also be on PATH)", repo)
	}

	base, err := resolveBase(ctx, repo, baseOverride)
	if err != nil {
		return nil, err
	}
	head, err := gitx.Head(ctx, repo)
	if err != nil {
		return nil, err
	}

	changes, err := gitx.Changes(ctx, repo, base)
	if err != nil {
		return nil, err
	}
	changes = filterChanges(changes)
	rep := &UpdateReport{Base: base, Head: head, Changes: changes}
	if len(changes) == 0 {
		return rep, nil
	}
	rep.Commits, _ = gitx.Subjects(ctx, repo, base, 40)

	pg.info(fmt.Sprintf("%s → %s: %d changed files", gitx.Short(base), gitx.Short(head), len(changes)))

	targets, unassigned := affectedDocs(repo, outline, changes)
	rep.Unassigned = unassigned
	if len(targets) == 0 {
		return rep, nil
	}
	pg.info(fmt.Sprintf("%d document(s) affected", len(targets)))
	idx := codemap.Build(res)

	// Revise each affected document in parallel, bounded like a full run.
	updated := make([]string, len(targets))
	limit, clamped := cfg.EffectiveConcurrency(client.Model)
	if clamped {
		pg.info(fmt.Sprintf("free-tier model — concurrency capped at %d to avoid rate limits", limit))
	}
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(limit)
	for i, t := range targets {
		i, t := i, t
		g.Go(func() error {
			pg.started("update: " + t.Title)
			doc, err := reviseDoc(gctx, repo, cfg, client, res, idx, outline, t, base, rep.Commits)
			if err != nil {
				pg.failed(t.Title, err)
				return nil // one failed document must not abort the run
			}
			if err := os.WriteFile(t.Path, []byte(doc), 0o644); err != nil {
				pg.failed(t.Title, err)
				return nil
			}
			updated[i] = rel(repo, t.Path)
			pg.wrote(rel(repo, t.Path), countLines(doc))
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return rep, err
	}
	for _, u := range updated {
		if u != "" {
			rep.Updated = append(rep.Updated, u)
		}
	}
	if len(rep.Updated) == 0 {
		return rep, fmt.Errorf("every affected document failed to update")
	}

	if err := writeChangelog(ctx, repo, client, rep); err != nil {
		pg.failed("changelog", err)
	}
	if err := writeIndex(repo, outline); err != nil {
		return rep, err
	}
	// An update does not regenerate sections, so any outstanding failures from
	// the last full run still stand.
	return rep, SaveStamp(repo, client.Model, outline.Multiplier, LoadStamp(repo).Failed)
}

// resolveBase picks the baseline commit: an explicit override, else the stamp.
func resolveBase(ctx context.Context, repo, override string) (string, error) {
	if override != "" {
		sha, err := gitx.Resolve(ctx, repo, override)
		if err != nil {
			return "", fmt.Errorf("baseline %q does not resolve to a commit: %w", override, err)
		}
		return sha, nil
	}
	stamp := LoadStamp(repo)
	if stamp.Commit == "" {
		return "", fmt.Errorf("no baseline recorded — this wiki predates diff tracking.\n" +
			"Re-run the wiki once to set a baseline, or pass an explicit one (e.g. HEAD~10)")
	}
	if !gitx.HasCommit(ctx, repo, stamp.Commit) {
		return "", fmt.Errorf("baseline commit %s is not in this repository (rebased or a different clone?)\n"+
			"Pass an explicit baseline, or re-run the wiki to re-baseline", gitx.Short(stamp.Commit))
	}
	return stamp.Commit, nil
}

// filterChanges drops Kaioken's own output — the wiki rewriting itself must not
// look like a source change on the next run.
func filterChanges(in []gitx.Change) []gitx.Change {
	var out []gitx.Change
	for _, c := range in {
		if c.Path == config.Dir || strings.HasPrefix(c.Path, config.Dir+"/") {
			continue
		}
		out = append(out, c)
	}
	return out
}

// affectedDocs maps changed files onto the documents that describe them: a
// section's own document when the change falls inside its file scope, plus any
// subsection document that cites the changed path (documents end with a
// "Referenced Files" list, which makes this reliable). Changed files no section
// claims come back as unassigned — a hint that the plan needs revisiting.
func affectedDocs(repo string, outline *Outline, changes []gitx.Change) (targets []docTarget, unassigned []string) {
	claimed := map[string]bool{}

	for _, sec := range outline.Sections {
		dir := filepath.Join(WikiDir(repo), safeName(sec.Title))
		mainName := safeName(sec.Title) + ".md"
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			name := e.Name()
			if e.IsDir() || !strings.HasSuffix(name, ".md") {
				continue
			}
			docPath := filepath.Join(dir, name)
			raw, err := os.ReadFile(docPath)
			if err != nil {
				continue
			}
			body := string(raw)
			isMain := name == mainName

			hits := docHits(body, sec, changes, isMain)
			if len(hits) == 0 {
				continue
			}
			for _, h := range hits {
				claimed[h] = true
			}
			title := sec.Title
			if !isMain {
				title = sec.Title + " / " + strings.TrimSuffix(name, ".md")
			}
			targets = append(targets, docTarget{
				Path: docPath, Section: sec, Title: title, Files: hits,
			})
		}
	}

	for _, c := range changes {
		if !claimed[c.Path] {
			unassigned = append(unassigned, c.Path)
		}
	}
	sort.Strings(unassigned)
	return targets, unassigned
}

// docHits returns the changed files that invalidate one document.
//
// The provenance footer records exactly which sources a document was written
// from, so it is the primary signal. A section's MAIN document additionally
// matches the plan's file scope: a newly added file appears in no existing
// document's provenance, and the section overview is where it belongs.
// Documents generated before stamping existed fall back to scanning the prose
// for file paths.
func docHits(body string, sec Section, changes []gitx.Change, isMain bool) []string {
	prov := parseProvenance(body)
	seen := map[string]bool{}
	var hits []string
	add := func(p string) {
		if !seen[p] {
			seen[p] = true
			hits = append(hits, p)
		}
	}

	for _, c := range changes {
		switch {
		case len(prov) > 0 && matchScope(prov, c.Path):
			add(c.Path)
		case len(prov) == 0 && !isMain && strings.Contains(body, c.Path):
			// Legacy document: fall back to citation scanning.
			add(c.Path)
		}
		if isMain && matchScope(sec.Files, c.Path) {
			add(c.Path)
		}
	}
	return hits
}

// matchScope reports whether path falls under any scope entry (a file or a
// directory prefix), mirroring how resolveFiles interprets a section's files.
func matchScope(scope []string, path string) bool {
	path = filepath.ToSlash(path)
	for _, s := range scope {
		s = strings.Trim(filepath.ToSlash(strings.TrimSpace(s)), "/")
		if s == "" {
			continue
		}
		if path == s || strings.HasPrefix(path, s+"/") {
			return true
		}
	}
	return false
}

// reviseDoc asks the model to revise one document against the diff.
func reviseDoc(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
	res *scan.Result, idx *codemap.Index, outline *Outline, t docTarget,
	base string, commits []string) (string, error) {

	existing, err := os.ReadFile(t.Path)
	if err != nil {
		return "", err
	}
	patch, err := gitx.Patch(ctx, repo, base, t.Files, maxPatchBytes)
	if err != nil {
		return "", err
	}

	var user strings.Builder
	fmt.Fprintf(&user, "Document: %s\nSection goal: %s\n\n", t.Title, t.Section.Goal)
	user.WriteString("Global wiki context (sibling chapters exist — stay in your lane):\n")
	user.WriteString(outlineContext(outline, t.Section.ID))
	if len(commits) > 0 {
		user.WriteString("\nCommits since the documented baseline:\n")
		for _, c := range commits {
			user.WriteString("  " + c + "\n")
		}
	}
	if len(cfg.Notes) > 0 {
		user.WriteString("\nMaintainer steering notes (authoritative):\n")
		for _, n := range cfg.Notes {
			user.WriteString("- " + n + "\n")
		}
	}
	user.WriteString("\n===== CURRENT DOCUMENT =====\n")
	user.Write(existing)
	user.WriteString("\n\n===== GIT DIFF =====\n")
	if strings.TrimSpace(patch) == "" {
		user.WriteString("(no textual diff — files were added or removed)\n")
	} else {
		user.WriteString(patch)
	}
	user.WriteString("\n\n===== CURRENT CONTENTS OF THE CHANGED FILES =====\n")
	user.WriteString(bundleFiles(idx, resolveFiles(res, t.Files, nil),
		t.Title+" "+t.Section.Goal, cfg.MaxModuleTokens))

	doc, err := client.Chat(ctx, updateSystem, user.String())
	if err != nil {
		return "", err
	}
	// Carry the provenance forward, widened by whatever this revision covered,
	// so the next update can still tell what this document describes.
	sources := livePaths(res, append(parseProvenance(string(existing)), t.Files...))
	return stampProvenance(unfence(doc), sources), nil
}

// writeChangelog appends a dated entry to the wiki changelog, with a
// model-written summary when one is available.
func writeChangelog(ctx context.Context, repo string, client *llm.Client, rep *UpdateReport) error {
	var b strings.Builder
	fmt.Fprintf(&b, "## %s — %s → %s\n\n", time.Now().UTC().Format("2006-01-02 15:04"),
		gitx.Short(rep.Base), gitx.Short(rep.Head))
	fmt.Fprintf(&b, "%d files changed · %d documents updated\n\n", len(rep.Changes), len(rep.Updated))

	if summary := changeSummary(ctx, client, rep); summary != "" {
		b.WriteString(summary + "\n\n")
	}
	b.WriteString("**Documents updated**\n\n")
	for _, u := range rep.Updated {
		fmt.Fprintf(&b, "- %s\n", u)
	}
	b.WriteString("\n<details><summary>Changed files</summary>\n\n")
	for _, c := range rep.Changes {
		fmt.Fprintf(&b, "- `%s` %s\n", c.Status, c.Path)
	}
	b.WriteString("\n</details>\n\n")

	path := filepath.Join(WikiDir(repo), "CHANGELOG.md")
	raw, err := os.ReadFile(path)
	if err != nil {
		raw = []byte("# Wiki Changelog\n\nWhat Kaioken revised, and why.\n\n")
	}
	// Newest entry first, directly under the title block.
	prev := string(raw)
	head, tail := prev, ""
	if idx := strings.Index(prev, "\n## "); idx != -1 {
		head, tail = prev[:idx+1], prev[idx+1:]
	}
	return os.WriteFile(path, []byte(head+b.String()+tail), 0o644)
}

func changeSummary(ctx context.Context, client *llm.Client, rep *UpdateReport) string {
	var user strings.Builder
	if len(rep.Commits) > 0 {
		user.WriteString("Commits:\n")
		for _, c := range rep.Commits {
			user.WriteString("  " + c + "\n")
		}
	}
	user.WriteString("\nChanged files:\n")
	for _, c := range rep.Changes {
		fmt.Fprintf(&user, "  %s %s\n", c.Status, c.Path)
	}
	out, err := client.Chat(ctx, changelogSystem, user.String())
	if err != nil {
		return ""
	}
	return strings.TrimSpace(out)
}

// unfence strips a markdown code fence some models wrap whole documents in.
func unfence(doc string) string {
	doc = strings.TrimSpace(doc)
	if strings.HasPrefix(doc, "```markdown") || strings.HasPrefix(doc, "```md") {
		doc = strings.TrimPrefix(doc, "```markdown")
		doc = strings.TrimPrefix(doc, "```md")
		doc = strings.TrimSuffix(strings.TrimSpace(doc), "```")
	}
	return strings.TrimSpace(doc) + "\n"
}
