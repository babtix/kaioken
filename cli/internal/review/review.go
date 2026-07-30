// Package review reads a diff and judges it against what this repository has
// already written down about itself — wiki chapters, knowledge cards, skills
// and the config's steering notes.
//
// That grounding is the whole point. A generic reviewer flags generic things:
// missing error handling, a long function, a name it dislikes. A reviewer that
// has read the repo's own documentation can say "this bypasses the retry
// budget the networking chapter describes", which is a finding worth having.
package review

import (
	"context"
	"encoding/json"
	"fmt"
	"path"
	"sort"
	"strings"
	"time"

	"kaioken/internal/config"
	"kaioken/internal/gitx"
	"kaioken/internal/llm"
	"kaioken/internal/search"
	"kaioken/internal/skills"
)

// Severity orders findings. Only three levels: a reviewer with ten severities
// spends its judgement on grading rather than on finding things.
type Severity string

const (
	// SeverityBlocker is a defect: wrong behaviour, a broken invariant, a
	// security hole. Something that should not merge.
	SeverityBlocker Severity = "blocker"
	// SeverityConcern is a real problem that a reasonable reviewer could
	// decide to accept.
	SeverityConcern Severity = "concern"
	// SeverityNote is worth saying once and not worth arguing about.
	SeverityNote Severity = "note"
)

// Finding is one reviewed issue.
type Finding struct {
	File     string   `json:"file"`
	Line     int      `json:"line,omitempty"`
	Severity Severity `json:"severity"`
	// Title is a one-line statement of the defect.
	Title string `json:"title"`
	// Detail explains the failure: what input or state leads to what wrong
	// outcome. A finding that cannot say this is a style opinion.
	Detail string `json:"detail"`
	// Grounding cites the wiki chapter, skill or note this is judged against,
	// empty when the finding stands on the code alone.
	Grounding string `json:"grounding,omitempty"`
}

// Report is the outcome of one review.
type Report struct {
	Repo     string    `json:"repo"`
	Base     string    `json:"base"`
	Head     string    `json:"head"`
	Files    []string  `json:"files"`
	Findings []Finding `json:"findings"`
	// Context lists what the reviewer actually read, so a user can tell a
	// grounded review from a blind one.
	Context   []string      `json:"context"`
	Model     string        `json:"model"`
	Elapsed   time.Duration `json:"-"`
	CostUSD   float64       `json:"cost_usd,omitempty"`
	Skipped   []string      `json:"skipped,omitempty"`
	Verdict   string        `json:"verdict"`
	Truncated bool          `json:"truncated,omitempty"`
}

// Options control a review.
type Options struct {
	// Base is the revision to diff against. Empty means HEAD, i.e. review the
	// uncommitted working tree.
	Base string
	// Only restricts the review to these repo-relative paths.
	Only []string
	// MaxDiffBytes caps how much patch text reaches the model.
	MaxDiffBytes int
	// Severity filters the report; findings below it are dropped.
	Severity Severity
}

// Progress reports what a review is doing; every field may be nil.
type Progress struct {
	Stage  func(string)
	Detail func(string)
}

func (p Progress) stage(s string) {
	if p.Stage != nil {
		p.Stage(s)
	}
}
func (p Progress) detail(s string) {
	if p.Detail != nil {
		p.Detail(s)
	}
}

// defaultDiffBytes caps the patch. Large enough for a normal change, small
// enough to leave room for the knowledge context that makes the review useful
// — a review that reads the whole diff and none of the documentation is worse
// than one that reads half the diff and all of the conventions.
const defaultDiffBytes = 120_000

// Run reviews the working diff and returns the findings.
func Run(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
	opts Options, pg Progress) (*Report, error) {

	started := time.Now()
	if !gitx.IsRepo(repo) {
		return nil, fmt.Errorf("%s is not a git repository", repo)
	}
	base := strings.TrimSpace(opts.Base)
	if base == "" {
		base = "HEAD"
	}
	if !gitx.HasCommit(ctx, repo, base) {
		return nil, fmt.Errorf("no such revision %q", base)
	}
	if opts.MaxDiffBytes <= 0 {
		opts.MaxDiffBytes = defaultDiffBytes
	}

	// Git reports diff paths relative to the work tree root but resolves
	// pathspecs relative to the working directory. Reviewing a subdirectory
	// therefore has to run git from the root, or the paths Changes hands back
	// match nothing when Patch is asked for them and the review silently sees
	// an empty diff. Knowledge lookups still use repo — that is where
	// Kaioken's generated wiki lives.
	gitRoot := gitx.Root(ctx, repo)

	pg.stage("collecting the diff")
	changes, err := gitx.Changes(ctx, gitRoot, base)
	if err != nil {
		return nil, err
	}
	changes = filterChanges(changes, opts.Only)
	if len(changes) == 0 {
		return &Report{
			Repo: repo, Base: base, Model: client.Model,
			Verdict: "no changes to review", Elapsed: time.Since(started),
		}, nil
	}

	files := make([]string, 0, len(changes))
	for _, c := range changes {
		files = append(files, c.Path)
	}
	pg.detail(fmt.Sprintf("%d changed file(s)", len(files)))

	patch, err := gitx.Patch(ctx, gitRoot, base, files, opts.MaxDiffBytes)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(patch) == "" {
		return &Report{
			Repo: repo, Base: base, Model: client.Model,
			Files: files, Verdict: "no textual changes to review",
			Elapsed: time.Since(started),
		}, nil
	}

	pg.stage("gathering what the repo says about the changed areas")
	knowledge, cited := gatherContext(ctx, repo, cfg, files, pg)

	head, _ := gitx.Head(ctx, gitRoot)
	rep := &Report{
		Repo:      repo,
		Base:      base,
		Head:      head,
		Files:     files,
		Context:   cited,
		Model:     client.Model,
		Truncated: len(patch) >= opts.MaxDiffBytes,
	}

	pg.stage(fmt.Sprintf("reviewing with %s", client.Model))
	findings, err := judge(ctx, client, cfg, patch, knowledge)
	if err != nil {
		return nil, err
	}

	rep.Findings = filterSeverity(findings, opts.Severity)
	sort.SliceStable(rep.Findings, func(i, j int) bool {
		return severityRank(rep.Findings[i].Severity) < severityRank(rep.Findings[j].Severity)
	})
	rep.Verdict = verdict(rep.Findings)
	rep.Elapsed = time.Since(started)
	if usd, known := client.CostUSD(); known {
		rep.CostUSD = usd
	}
	return rep, nil
}

func filterChanges(changes []gitx.Change, only []string) []gitx.Change {
	var out []gitx.Change
	for _, c := range changes {
		if c.Deleted() {
			// A deleted file has no code to review; its absence shows up as
			// context in the diffs of whatever referenced it.
			continue
		}
		if len(only) == 0 {
			out = append(out, c)
			continue
		}
		for _, prefix := range only {
			prefix = strings.TrimSuffix(path.Clean(prefix), "/")
			if c.Path == prefix || strings.HasPrefix(c.Path, prefix+"/") {
				out = append(out, c)
				break
			}
		}
	}
	return out
}

// contextBudget caps the knowledge text bundled with the diff.
const contextBudget = 40_000

// gatherContext pulls the documentation that bears on the changed files. It
// searches the knowledge index with the changed paths and their identifiers as
// the query, which is a cheap way to ask "what has this repo already said
// about the area being edited".
func gatherContext(ctx context.Context, repo string, cfg *config.Config,
	files []string, pg Progress) (string, []string) {

	var b strings.Builder
	var cited []string

	// Steering notes are the highest-signal context there is: a human wrote
	// them specifically to be applied to every request.
	if len(cfg.Notes) > 0 {
		b.WriteString("## Project notes (authored by the maintainers)\n\n")
		for _, n := range cfg.Notes {
			fmt.Fprintf(&b, "- %s\n", n)
		}
		b.WriteString("\n")
		cited = append(cited, "config notes")
	}

	idx, err := search.Open(repo)
	if err != nil || len(idx.Docs) == 0 {
		pg.detail("no generated knowledge — reviewing against the code alone")
		return b.String(), cited
	}
	emb, _ := search.NewEmbedder(search.EmbedConfigFor(repo))

	// One query per changed area, deduplicated by document, so a ten-file
	// change does not send ten copies of the same chapter.
	seen := map[string]bool{}
	var docs []search.Result
	for _, q := range contextQueries(files) {
		hits, err := idx.Search(ctx, search.Query{Text: q, Limit: 3, Embedder: emb})
		if err != nil {
			continue
		}
		for _, h := range hits {
			key := string(h.Kind) + "/" + h.Path
			if seen[key] {
				continue
			}
			seen[key] = true
			docs = append(docs, h)
		}
	}

	if len(docs) > 0 {
		b.WriteString("## What this repository already documents about the changed areas\n\n")
		for _, d := range docs {
			if b.Len() > contextBudget {
				break
			}
			label := string(d.Kind) + ": " + d.Path
			fmt.Fprintf(&b, "### %s\n_(%s", d.Title, label)
			if d.Heading != "" {
				fmt.Fprintf(&b, " › %s", d.Heading)
			}
			fmt.Fprintf(&b, ")_\n\n%s\n\n", d.Snippet)
			cited = append(cited, label)
		}
	}

	// Skills are procedures the repo has committed to; a diff that ignores one
	// is worth flagging, so they go in whole rather than as snippets.
	if all, err := skills.List(repo); err == nil {
		var relevant []*skills.Skill
		for _, sk := range all {
			if sk.Origin == skills.OriginLearned || touchesSources(sk.Sources, files) {
				relevant = append(relevant, sk)
			}
		}
		if len(relevant) > 0 {
			b.WriteString("## Established procedures for this repository\n\n")
			for _, sk := range relevant {
				if b.Len() > contextBudget {
					break
				}
				fmt.Fprintf(&b, "### skill: %s\n%s\n\n%s\n\n", sk.Name, sk.Description, sk.Body)
				cited = append(cited, "skill: "+sk.Name)
			}
		}
	}

	pg.detail(fmt.Sprintf("%d knowledge source(s)", len(cited)))
	return b.String(), cited
}

// contextQueries turns changed paths into search queries. Directory names and
// file stems are what wiki chapters are actually written about, so they make
// better queries than the raw paths.
func contextQueries(files []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, f := range files {
		dir := path.Dir(f)
		stem := strings.TrimSuffix(path.Base(f), path.Ext(f))
		for _, q := range []string{dir, stem} {
			q = strings.NewReplacer("/", " ", "_", " ", "-", " ").Replace(q)
			q = strings.TrimSpace(q)
			if q == "" || q == "." || seen[q] {
				continue
			}
			seen[q] = true
			out = append(out, q)
		}
		if len(out) >= 12 {
			break
		}
	}
	return out
}

func touchesSources(sources, files []string) bool {
	for _, s := range sources {
		for _, f := range files {
			if s == f || strings.HasPrefix(f, strings.TrimSuffix(s, "/")+"/") {
				return true
			}
		}
	}
	return false
}

const reviewSystem = `You are reviewing a diff for a specific repository, and you have been given
that repository's own documentation: its wiki, its established procedures, and
notes its maintainers wrote.

Judge the diff against THAT material, not against generic best practice. The
findings worth reporting are:
- Correctness defects: a concrete input or state that produces a wrong result,
  a crash, a race, a leak, a security hole.
- Violations of something this repository has documented: a constraint a wiki
  chapter states, a procedure a skill describes, an instruction in the notes.
- A change that makes the documentation wrong — the code now contradicts a
  chapter, and one of the two needs updating.

Do NOT report: style preferences, naming opinions, "consider adding a comment",
missing tests unless the repo documents a testing requirement, or speculative
refactors. If the diff is fine, say so with an empty findings list. An empty
list is a valid and common answer; padding it costs the reviewer's credibility.

For every finding, state the failure concretely: what input or sequence leads
to what wrong outcome. If you cannot state that, it is not a finding.

Severity: "blocker" for defects that should not merge, "concern" for real
problems a maintainer could reasonably accept, "note" for anything else.

Return ONLY JSON:
{"findings":[{"file":"path/from/the/diff","line":123,"severity":"blocker|concern|note",
"title":"one line","detail":"the concrete failure","grounding":"which chapter/skill/note this violates, or empty"}]}`

func judge(ctx context.Context, client *llm.Client, cfg *config.Config,
	patch, knowledge string) ([]Finding, error) {

	var user strings.Builder
	if knowledge != "" {
		user.WriteString(knowledge)
		user.WriteString("\n---\n\n")
	}
	user.WriteString("## The diff under review\n\n```diff\n")
	user.WriteString(patch)
	user.WriteString("\n```\n")

	var out struct {
		Findings []Finding `json:"findings"`
	}
	if err := client.ChatJSON(ctx, reviewSystem, user.String(), &out); err != nil {
		return nil, err
	}

	// Normalise what the model returned: an unrecognised severity becomes a
	// note rather than being dropped, since the text may still be right.
	for i := range out.Findings {
		switch out.Findings[i].Severity {
		case SeverityBlocker, SeverityConcern, SeverityNote:
		default:
			out.Findings[i].Severity = SeverityNote
		}
	}
	return out.Findings, nil
}

func severityRank(s Severity) int {
	switch s {
	case SeverityBlocker:
		return 0
	case SeverityConcern:
		return 1
	default:
		return 2
	}
}

func filterSeverity(in []Finding, min Severity) []Finding {
	if min == "" {
		return in
	}
	limit := severityRank(min)
	var out []Finding
	for _, f := range in {
		if severityRank(f.Severity) <= limit {
			out = append(out, f)
		}
	}
	return out
}

func verdict(findings []Finding) string {
	var blockers, concerns int
	for _, f := range findings {
		switch f.Severity {
		case SeverityBlocker:
			blockers++
		case SeverityConcern:
			concerns++
		}
	}
	switch {
	case blockers > 0:
		return fmt.Sprintf("%d blocker(s) — do not merge as is", blockers)
	case concerns > 0:
		return fmt.Sprintf("%d concern(s) worth a maintainer's decision", concerns)
	case len(findings) > 0:
		return "nothing blocking; notes only"
	default:
		return "no findings"
	}
}

// Markdown renders a report for humans.
func (r *Report) Markdown() string {
	var b strings.Builder
	fmt.Fprintf(&b, "# Review — %s\n\n", r.Verdict)
	fmt.Fprintf(&b, "`%s` against `%s`", shortSHA(r.Head), r.Base)
	if r.Model != "" {
		fmt.Fprintf(&b, " · %s", r.Model)
	}
	if r.CostUSD > 0 {
		fmt.Fprintf(&b, " · $%.4f", r.CostUSD)
	}
	fmt.Fprintf(&b, "\n\n%d file(s) reviewed", len(r.Files))
	if r.Truncated {
		b.WriteString(" _(diff truncated — review covers the first portion only)_")
	}
	b.WriteString("\n\n")

	if len(r.Findings) == 0 {
		b.WriteString("No findings.\n")
	}
	for _, sev := range []Severity{SeverityBlocker, SeverityConcern, SeverityNote} {
		var group []Finding
		for _, f := range r.Findings {
			if f.Severity == sev {
				group = append(group, f)
			}
		}
		if len(group) == 0 {
			continue
		}
		fmt.Fprintf(&b, "## %s\n\n", strings.ToUpper(string(sev)))
		for _, f := range group {
			loc := f.File
			if f.Line > 0 {
				loc = fmt.Sprintf("%s:%d", f.File, f.Line)
			}
			fmt.Fprintf(&b, "### %s\n`%s`\n\n%s\n", f.Title, loc, f.Detail)
			if f.Grounding != "" {
				fmt.Fprintf(&b, "\n_Grounded in: %s_\n", f.Grounding)
			}
			b.WriteString("\n")
		}
	}

	if len(r.Context) > 0 {
		b.WriteString("---\n\n_Reviewed against: " + strings.Join(r.Context, ", ") + "_\n")
	}
	return b.String()
}

// JSON renders the report for a machine — a CI step, a bot, a dashboard.
func (r *Report) JSON() (string, error) {
	raw, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

// HasBlockers reports whether the review found something that should not
// merge, which is what a CI step exits on.
func (r *Report) HasBlockers() bool {
	for _, f := range r.Findings {
		if f.Severity == SeverityBlocker {
			return true
		}
	}
	return false
}

func shortSHA(s string) string {
	if len(s) > 8 {
		return s[:8]
	}
	if s == "" {
		return "working tree"
	}
	return s
}
