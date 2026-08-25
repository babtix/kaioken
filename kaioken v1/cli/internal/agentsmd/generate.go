package agentsmd

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

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

// skeletonTokens bounds the public-surface skeleton fed to the writer. AGENTS.md
// is about commands and constraints, not APIs, so it needs far less code than a
// wiki chapter does.
const skeletonTokens = 6000

const writeSystem = `You write AGENTS.md for one specific repository: the instruction file an
AI coding agent reads before it changes anything.

The test for every single line is: "would a competent agent likely get this WRONG without
being told?" If the answer is no, the line does not belong in the file. A short, dense
AGENTS.md that is entirely non-obvious beats a long one padded with generic advice.

INCLUDE, when the sources actually support it:
- exact developer commands, especially non-obvious ones (the real build, test, lint,
  typecheck, codegen and run commands, copied from task runners, CI or manifests)
- how to run ONE test or ONE package, not just the whole suite
- required command ORDER when it matters (for example lint -> typecheck -> test)
- monorepo or multi-package boundaries: which directory owns what, and the real entrypoints
- toolchain quirks: generated code and build artifacts that must never be hand-edited,
  migrations, codegen steps, special env loading, dev servers, deploy flow
- repo-specific conventions that DIFFER from the language or framework default
- testing quirks: fixtures, required services, snapshot workflow, slow or flaky suites
- constraints worth preserving from any existing instruction file in the sources

EXCLUDE, always:
- generic software advice ("write tests", "keep functions small", "use clear names")
- tutorials, exhaustive file trees, or a restatement of the directory listing
- obvious language conventions the model already knows
- anything you cannot support from the provided sources — never guess a command
- architecture prose that merely describes what the code is

Shape the file like this, dropping any section you have nothing real to put in:

# AGENTS.md

One or two sentences: what this repository is, and the single most important thing to know
before editing it.

## Commands
A short table or list of the exact commands, with the directory they run from when it is
not the repo root. Mark the ones that are non-obvious.

## Architecture
Only the few structural facts that change how an agent should work: package boundaries,
real entrypoints, the direction dependencies flow. A handful of bullets, not an essay.

## Conventions
Repo-specific rules that differ from defaults, each stated as an instruction.

## Gotchas
The traps: generated files, lockstep updates, required services, expensive suites.

Rules:
- Prefer executable sources of truth. When a README and a CI workflow disagree, trust CI
  and state what CI does.
- Quote commands verbatim, in backticks, exactly as they appear in the sources.
- Be terse and imperative. Aim for 40-120 lines total. Cut anything you are unsure of.
- Do NOT write a section about the .kaioken directory or the generated wiki, skills or
  knowledge cards. That section is appended automatically after you; writing your own
  would duplicate it.
- Output ONLY the markdown document. No frontmatter, no commentary, no code fence around
  the whole file.`

const improveSystem = writeSystem + `

You are IMPROVING an existing AGENTS.md, which is provided below. Do not rewrite it
blindly. Keep every claim that the current sources still support — especially team
knowledge that no config file states, since it was probably written by a human who knew
something you cannot see. Delete fluff, generic advice, and any claim the sources now
contradict. Add what is missing. Return the complete updated document.`

// Result reports what a generation run produced.
type Result struct {
	// Path is the absolute path written.
	Path string
	// Lines is the length of the final document.
	Lines int
	// Updated is true when an existing AGENTS.md was improved in place rather
	// than written fresh.
	Updated bool
	// Sources are the repo-relative files the model was given as evidence.
	Sources []string
}

// Generate writes (or improves) AGENTS.md at the repository root.
//
// The knowledge section is spliced in afterwards from disk, so calling Generate
// again after `kaioken wiki` or `kaioken skills` is cheap and safe: it refreshes
// the pointers without touching the prose.
func Generate(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
	res *scan.Result, pg Progress) (*Result, error) {

	sources := collect(repo, res)
	if len(sources) == 0 {
		return nil, fmt.Errorf("no manifests, CI config or README found in %s — "+
			"nothing to write AGENTS.md from", repo)
	}
	pg.info(fmt.Sprintf("%d evidence file(s): %s", len(sources), summarise(paths(sources), 6)))

	existing := Body(Load(repo))
	system := writeSystem
	what := "writing AGENTS.md"
	if existing != "" {
		system = improveSystem
		what = "improving AGENTS.md in place"
	}
	pg.started(what)

	doc, err := client.Chat(ctx, system, prompt(repo, cfg, res, sources, existing))
	if err != nil {
		return nil, err
	}
	doc = unfence(doc)
	if strings.TrimSpace(doc) == "" {
		return nil, fmt.Errorf("model returned an empty AGENTS.md")
	}

	final := Merge(doc, KnowledgeSection(repo))
	if err := os.WriteFile(Path(repo), []byte(final), 0o644); err != nil {
		return nil, err
	}
	lines := strings.Count(final, "\n") + 1
	pg.wrote(FileName, lines)

	return &Result{
		Path:    Path(repo),
		Lines:   lines,
		Updated: existing != "",
		Sources: paths(sources),
	}, nil
}

// RefreshKnowledge rewrites only the generated pointer section of an existing
// AGENTS.md, with no LLM call. It is what runs after a wiki or skills build, so
// the instruction file learns about new documentation for free.
func RefreshKnowledge(repo string) (bool, error) {
	doc := Load(repo)
	if strings.TrimSpace(doc) == "" {
		return false, nil // no AGENTS.md: nothing to refresh, and not an error
	}
	section := KnowledgeSection(repo)
	if section == "" {
		return false, nil
	}
	final := Merge(doc, section)
	if final == doc {
		return false, nil
	}
	if err := os.WriteFile(Path(repo), []byte(final), 0o644); err != nil {
		return false, err
	}
	return true, nil
}

// prompt assembles the evidence: repository shape, the executable sources, and
// whatever the knowledge engine has already established about this codebase.
func prompt(repo string, cfg *config.Config, res *scan.Result, sources []source, existing string) string {
	var b strings.Builder

	b.WriteString("Repository root: " + filepath.Base(repo) + "\n")
	b.WriteString("Inventory: " + res.Stats() + "\n\n")
	b.WriteString("Layout:\n\n")
	b.WriteString(res.TreeSummary(8))

	b.WriteString("\n\nSource files (executable sources of truth — trust these over prose):\n\n")
	b.WriteString(render(sources))

	if idx := codemap.Build(res); idx != nil && idx.SymbolCount() > 0 {
		b.WriteString("\nCode structure (public surface, richest files first — for entrypoints " +
			"and package boundaries only):\n\n")
		b.WriteString(idx.RepoSkeleton(skeletonTokens))
	}

	// The knowledge engine has usually already digested this repository. Reusing
	// its conclusions is what keeps AGENTS.md consistent with the wiki instead of
	// inventing a second, conflicting vocabulary for the same components.
	if brief, err := os.ReadFile(filepath.Join(repo, config.Dir, "architecture.md")); err == nil {
		b.WriteString("\nArchitecture brief already established for this repository. Use its " +
			"component names and terminology; do not contradict it, and do not copy it " +
			"wholesale — AGENTS.md is instructions, not description:\n\n")
		b.Write(brief)
		b.WriteString("\n")
	}
	if chapters := chapterIndex(repo); len(chapters) > 0 {
		b.WriteString("\nExisting wiki chapters. An agent can already read these, so do NOT " +
			"restate their content:\n")
		for _, c := range chapters {
			fmt.Fprintf(&b, "- %s\n", c.name)
		}
	}
	if sk := skillIndex(repo); len(sk) > 0 {
		b.WriteString("\nExisting task guides. Procedure for these tasks is already documented, " +
			"so do NOT re-explain them:\n")
		for _, s := range sk {
			fmt.Fprintf(&b, "- %s: %s\n", s.name, s.desc)
		}
	}
	if len(cfg.Notes) > 0 {
		b.WriteString("\nMaintainer steering notes. These are authoritative and come from a human " +
			"who knows this project — reflect them in the file:\n")
		for _, n := range cfg.Notes {
			b.WriteString("- " + n + "\n")
		}
	}
	if existing != "" {
		b.WriteString("\nCurrent AGENTS.md to improve in place:\n\n")
		b.WriteString(existing)
		b.WriteString("\n")
	}
	return b.String()
}

// summarise renders the first n names of a list, with a count of the rest.
func summarise(names []string, n int) string {
	if len(names) <= n {
		return strings.Join(names, ", ")
	}
	return fmt.Sprintf("%s … (+%d more)", strings.Join(names[:n], ", "), len(names)-n)
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
