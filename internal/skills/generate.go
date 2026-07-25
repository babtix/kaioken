package skills

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"

	"kaioken/internal/codemap"
	"kaioken/internal/config"
	"kaioken/internal/llm"
	"kaioken/internal/scan"
)

// Progress receives live updates; any callback may be nil.
type Progress struct {
	Info    func(text string)
	Started func(what string)
	Wrote   func(path string, lines int)
	Failed  func(what string, err error)
}

func (p Progress) info(t string) {
	if p.Info != nil {
		p.Info(t)
	}
}
func (p Progress) started(w string) {
	if p.Started != nil {
		p.Started(w)
	}
}
func (p Progress) wrote(path string, lines int) {
	if p.Wrote != nil {
		p.Wrote(path, lines)
	}
}
func (p Progress) failed(w string, err error) {
	if p.Failed != nil {
		p.Failed(w, err)
	}
}

// proposal is one planned skill, before its body is written.
type proposal struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Task        string   `json:"task"`
	Files       []string `json:"files"`
}

const planSystem = `You are deciding which SKILLS to write for a specific repository.

A skill is a short, task-oriented guide an AI coding agent loads at the moment it starts
work: "how do I do X in THIS project". Good skills describe RECURRING TASKS a contributor
actually performs — not descriptions of what the code is, which the wiki already covers.

Good skills for a typical repo look like:
- add-an-api-endpoint, add-a-cli-command, add-a-database-migration
- write-a-test, run-the-test-suite, debug-a-failing-build
- add-a-ui-component, wire-a-new-config-option, release-a-version

Bad skills (do NOT produce these):
- "architecture-overview", "project-structure" — those are wiki chapters, not tasks
- anything a general model already knows without this repo ("how to write Go")

Propose 5-12 skills that fit THIS repository's actual stack and layout. For each give:
- name: kebab-case, verb-led, specific ("add-a-tui-command", not "tui")
- description: one or two sentences saying what it covers AND when an agent should load it.
  This is what a runtime matches against, so name the concrete triggers.
- task: one sentence stating the task the skill teaches
- files: the repo-relative files or directories that show how this task is done here —
  include real examples an agent should imitate

Return ONLY JSON: {"skills":[{"name":"...","description":"...","task":"...","files":["..."]}]}`

const writeSystem = `You write ONE skill for an AI coding agent working in a specific
repository. The agent has already read this project's wiki; your job is procedural, not
descriptive: how is this task actually performed HERE.

Write markdown with this shape:

# <Task title>

One or two sentences: what this skill covers and when to use it.

## Prerequisites
Only if there are real ones (a running service, a generated file, an env var).

## Steps
A numbered list. Each step names REAL files and functions from the sources, in the order a
contributor touches them. Where a step means "copy the existing pattern", show the pattern
with a short verbatim excerpt and its path.

## Conventions to follow
The local rules that are NOT obvious from the code alone: naming, error handling, where
registration happens, what must be updated in lockstep. Be specific to this repo.

## Verification
How to confirm the change worked here — the actual test/build/run command used in this repo.

## Common mistakes
Failure modes a newcomer or an agent hits in THIS codebase. Only real ones you can support
from the sources (a registry that must be updated, a test that must be regenerated).

Rules:
- Ground everything in the provided sources. Never invent a file, function, command or step.
- Be concise and imperative. This is a checklist an agent follows, not an essay. Aim for
  60-150 lines; if the task is genuinely simple, be shorter.
- Quote code verbatim when showing a pattern, and cite its path.
- Do NOT restate what the code is; state what to DO.

Output ONLY the markdown body. No frontmatter, no JSON, no commentary.`

// Options controls a generation run.
type Options struct {
	Force bool     // rewrite skills that already exist
	Only  []string // restrict to these skill names
}

// Run plans and writes the full skill set for a repository.
func Run(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
	res *scan.Result, opts Options, pg Progress) ([]*Skill, error) {

	idx := codemap.Build(res)

	pg.started("planning skills")
	proposals, err := plan(ctx, repo, cfg, client, res, idx)
	if err != nil {
		return nil, fmt.Errorf("planning skills: %w", err)
	}
	pg.info(fmt.Sprintf("planned %d skills", len(proposals)))

	only := map[string]bool{}
	for _, n := range opts.Only {
		only[Slug(n)] = true
	}

	limit, _ := cfg.EffectiveConcurrency(client.Model)
	var mu sync.Mutex
	var written []*Skill

	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(limit)
	for _, p := range proposals {
		p := p
		if len(only) > 0 && !only[p.Name] {
			continue
		}
		if !opts.Force {
			if _, err := os.Stat(Path(repo, p.Name)); err == nil {
				pg.info("skip (exists): " + p.Name)
				continue
			}
		}
		g.Go(func() error {
			pg.started("write: " + p.Name)
			s, err := write(gctx, repo, cfg, client, res, idx, p)
			if err != nil {
				pg.failed(p.Name, err)
				return nil // one failed skill must not abort the set
			}
			if err := s.Save(repo); err != nil {
				pg.failed(p.Name, err)
				return nil
			}
			pg.wrote(filepath.ToSlash(filepath.Join(config.Dir, "skills", s.Name, "SKILL.md")),
				strings.Count(s.Body, "\n")+1)
			mu.Lock()
			written = append(written, s)
			mu.Unlock()
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return written, err
	}

	all, err := List(repo)
	if err != nil {
		return written, err
	}
	if err := WriteIndex(repo, all); err != nil {
		return written, err
	}
	return written, nil
}

// Refresh regenerates only the skills whose sources the given paths changed.
// It is what `kaioken update` calls, so skills track the code like the wiki does.
func Refresh(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
	res *scan.Result, changed []string, pg Progress) ([]*Skill, error) {

	all, err := List(repo)
	if err != nil || len(all) == 0 {
		return nil, err
	}
	stale := Stale(all, changed)
	if len(stale) == 0 {
		return nil, nil
	}
	pg.info(fmt.Sprintf("%d skill(s) affected by the change", len(stale)))

	idx := codemap.Build(res)
	limit, _ := cfg.EffectiveConcurrency(client.Model)
	var mu sync.Mutex
	var updated []*Skill

	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(limit)
	for _, s := range stale {
		s := s
		g.Go(func() error {
			pg.started("refresh: " + s.Name)
			p := proposal{
				Name: s.Name, Description: s.Description,
				Task: s.Description, Files: s.Sources,
			}
			fresh, err := write(gctx, repo, cfg, client, res, idx, p)
			if err != nil {
				pg.failed(s.Name, err)
				return nil
			}
			if err := fresh.Save(repo); err != nil {
				pg.failed(s.Name, err)
				return nil
			}
			pg.wrote(filepath.ToSlash(filepath.Join(config.Dir, "skills", fresh.Name, "SKILL.md")),
				strings.Count(fresh.Body, "\n")+1)
			mu.Lock()
			updated = append(updated, fresh)
			mu.Unlock()
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return updated, err
	}
	if all, err := List(repo); err == nil {
		_ = WriteIndex(repo, all)
	}
	return updated, nil
}

// plan asks the model which tasks deserve a skill in this repository.
func plan(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
	res *scan.Result, idx *codemap.Index) ([]proposal, error) {

	var user strings.Builder
	user.WriteString("Repository layout:\n\n")
	user.WriteString(res.TreeSummary(10))
	user.WriteString("\n\nManifests (stack, scripts, entry points):\n\n")
	user.WriteString(res.ManifestContents(4000))
	user.WriteString("\n\nCode structure (public surface):\n\n")
	user.WriteString(idx.RepoSkeleton(8000))

	// The architecture brief and wiki, when present, already digested this
	// repository — reuse that rather than re-deriving it.
	if brief, err := os.ReadFile(filepath.Join(repo, config.Dir, "architecture.md")); err == nil {
		user.WriteString("\nArchitecture brief:\n")
		user.Write(brief)
		user.WriteString("\n")
	}
	if chapters := wikiChapters(repo); len(chapters) > 0 {
		user.WriteString("\nExisting wiki chapters (do not duplicate these; they describe, you prescribe):\n")
		for _, c := range chapters {
			user.WriteString("- " + c + "\n")
		}
	}
	if len(cfg.Notes) > 0 {
		user.WriteString("\nMaintainer steering notes (authoritative):\n")
		for _, n := range cfg.Notes {
			user.WriteString("- " + n + "\n")
		}
	}

	var out struct {
		Skills []proposal `json:"skills"`
	}
	if err := client.ChatJSON(ctx, planSystem, user.String(), &out); err != nil {
		return nil, err
	}
	if len(out.Skills) == 0 {
		return nil, fmt.Errorf("model proposed no skills")
	}

	seen := map[string]bool{}
	var props []proposal
	for _, p := range out.Skills {
		p.Name = Slug(p.Name)
		if p.Name == "" || seen[p.Name] {
			continue
		}
		seen[p.Name] = true
		props = append(props, p)
	}
	return props, nil
}

// write generates one skill's body from its proposal.
func write(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
	res *scan.Result, idx *codemap.Index, p proposal) (*Skill, error) {

	files := resolve(res, p.Files)
	paths := make([]string, 0, len(files))
	for _, f := range files {
		paths = append(paths, f.Path)
	}

	var user strings.Builder
	fmt.Fprintf(&user, "Skill: %s\n\nTask it teaches:\n%s\n\nWhen it applies:\n%s\n",
		p.Name, p.Task, p.Description)
	if brief, err := os.ReadFile(filepath.Join(repo, config.Dir, "architecture.md")); err == nil {
		user.WriteString("\nArchitecture brief for this repository (use its vocabulary):\n")
		user.Write(brief)
		user.WriteString("\n")
	}
	if len(cfg.Notes) > 0 {
		user.WriteString("\nMaintainer steering notes (authoritative):\n")
		for _, n := range cfg.Notes {
			user.WriteString("- " + n + "\n")
		}
	}
	user.WriteString("\n")
	user.WriteString(idx.Bundle(paths, codemap.BundleOptions{
		Goal: p.Task + " " + p.Description, MaxTokens: cfg.MaxModuleTokens,
	}))

	body, err := client.Chat(ctx, writeSystem, user.String())
	if err != nil {
		return nil, err
	}
	body = unfence(strings.TrimSpace(body))
	if body == "" {
		return nil, fmt.Errorf("model returned an empty skill body")
	}

	desc := strings.TrimSpace(p.Description)
	if desc == "" {
		desc = p.Task
	}
	return &Skill{
		Name:        p.Name,
		Description: desc,
		Sources:     paths,
		GeneratedAt: time.Now().UTC(),
		Model:       client.Model,
		Body:        body,
	}, nil
}

// resolve maps scope entries (files or directory prefixes) onto scanned files.
func resolve(res *scan.Result, scope []string) []scan.File {
	seen := map[string]bool{}
	var out []scan.File
	for _, s := range scope {
		s = strings.Trim(filepath.ToSlash(strings.TrimSpace(s)), "/")
		if s == "" {
			continue
		}
		for _, f := range res.Files {
			if f.Path == s || strings.HasPrefix(f.Path, s+"/") {
				if !seen[f.Path] {
					seen[f.Path] = true
					out = append(out, f)
				}
			}
		}
	}
	return out
}

// wikiChapters lists generated chapter names, when a wiki exists.
func wikiChapters(repo string) []string {
	entries, err := os.ReadDir(filepath.Join(repo, config.Dir, "wiki"))
	if err != nil {
		return nil
	}
	var out []string
	for _, e := range entries {
		if e.IsDir() {
			out = append(out, e.Name())
		}
	}
	return out
}

// unfence strips a markdown fence some models wrap whole documents in.
func unfence(doc string) string {
	doc = strings.TrimSpace(doc)
	for _, tag := range []string{"```markdown", "```md", "```"} {
		if strings.HasPrefix(doc, tag) {
			doc = strings.TrimPrefix(doc, tag)
			doc = strings.TrimSuffix(strings.TrimSpace(doc), "```")
			break
		}
	}
	return strings.TrimSpace(doc)
}
