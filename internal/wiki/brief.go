package wiki

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"kaioken/internal/config"
	"kaioken/internal/scan"
)

// Sections are generated in parallel and each one only sees its siblings'
// titles and goals — never what they actually wrote. Left alone that produces
// the same concept explained three times in three incompatible vocabularies.
//
// The brief fixes it upstream: one pass establishes the real architecture and
// the canonical name for each concept, and every later prompt receives it
// verbatim as ground truth. It is written to disk so a maintainer can correct
// it once and have every chapter inherit the correction.

// planSkeletonTokens bounds the repo skeleton fed to the planner and briefer.
const planSkeletonTokens = 12000

const briefSystem = `You are the principal engineer on this codebase, writing the ONE
authoritative brief that every chapter of its documentation will be written from. Other
writers will each see only their own files plus this brief, so it must carry the shared
truth they cannot derive alone.

Produce a compact markdown document, no more than about 80 lines, with exactly these
sections:

## What this system is
Two or three sentences: what it does and for whom. Concrete, not marketing.

## Architecture
The real top-level components and how they relate. Name actual packages, directories and
types from the input. State the dependency direction between them.

## Key flows
The two or three most important paths through the system (a request, a job, a build),
each as a short ordered list naming the real functions or files involved.

## Glossary
The canonical name for each domain concept, one per line as "**Term** — definition".
Include any term the codebase uses inconsistently, and state which name is canonical.
Every chapter will be required to use these exact terms.

## Conventions
Patterns a newcomer must follow: error handling, configuration, naming, layering.
Only ones actually visible in the code.

Ground everything in the provided structure and sources. Never invent a component.
Output ONLY the markdown brief.`

// BriefPath is where the shared architecture brief is stored.
func BriefPath(repo string) string {
	return filepath.Join(repo, config.Dir, "architecture.md")
}

// loadOrBuildBrief fills r.brief, generating and persisting it when absent.
// A hand-edited brief on disk is always preferred: it is the maintainer's
// channel for correcting the model's view of their own system.
func (r *run) loadOrBuildBrief(ctx context.Context) error {
	if !r.force {
		if raw, err := os.ReadFile(BriefPath(r.repo)); err == nil && len(strings.TrimSpace(string(raw))) > 0 {
			r.brief = string(raw)
			r.pg.info("using existing architecture brief (" + config.Dir + "/architecture.md)")
			return nil
		}
	}

	r.pg.started("architecture brief")
	var user strings.Builder
	user.WriteString("Repository layout:\n\n")
	user.WriteString(r.res.TreeSummary(10))
	user.WriteString("\n\nManifests:\n\n")
	user.WriteString(r.res.ManifestContents(4000))
	if r.idx != nil {
		user.WriteString("\n\nCode structure (public surface, richest files first):\n\n")
		user.WriteString(r.idx.RepoSkeleton(planSkeletonTokens))
	}
	if facts := detectFacts(r.res, r.idx); facts.Any() {
		user.WriteString("\nDetected framework facts:\n")
		user.WriteString(facts.Summary(60))
	}
	if r.outline != nil {
		user.WriteString("\nPlanned wiki sections (the chapters that will use this brief):\n")
		for _, s := range r.outline.Sections {
			fmt.Fprintf(&user, "- %s: %s\n", s.Title, s.Goal)
		}
	}
	user.WriteString(r.notesBlock())

	brief, err := r.client.Chat(ctx, briefSystem, user.String())
	if err != nil {
		return err
	}
	brief = unfence(brief)
	if strings.TrimSpace(brief) == "" {
		return fmt.Errorf("model returned an empty brief")
	}
	r.brief = brief

	if err := os.MkdirAll(filepath.Join(r.repo, config.Dir), 0o755); err != nil {
		return err
	}
	header := "<!-- kaioken architecture brief — injected verbatim into every chapter prompt.\n" +
		"     EDIT FREELY: corrections here propagate to the whole wiki on the next run.\n" +
		"     Delete this file to have it regenerated. -->\n\n"
	if err := os.WriteFile(BriefPath(r.repo), []byte(header+brief), 0o644); err != nil {
		return err
	}
	r.pg.wrote(rel(r.repo, BriefPath(r.repo)), countLines(brief))
	return nil
}

// reportCoverage tells the user what fraction of the repository the plan
// actually claims. A plan that silently ignores a third of the codebase is a
// planning bug, and it should surface before generation spends tokens on it.
func (r *run) reportCoverage() {
	claimed, unclaimed, dirs := coverage(r.res, r.outline)
	total := claimed + len(unclaimed)
	if total == 0 {
		return
	}
	pct := claimed * 100 / total
	msg := fmt.Sprintf("plan covers %d%% of scanned files (%d of %d)", pct, claimed, total)
	if len(unclaimed) == 0 {
		r.pg.info(msg)
		return
	}
	r.pg.info(msg + fmt.Sprintf(" — %d unclaimed", len(unclaimed)))
	if len(dirs) > 0 {
		shown := dirs
		if len(shown) > 6 {
			shown = shown[:6]
		}
		r.pg.info("  largest unclaimed areas: " + strings.Join(shown, ", "))
		r.pg.info("  add them to " + config.Dir + "/wiki_plan.yaml, or re-plan with force")
	}
}

// coverage counts scanned files claimed by at least one section, and ranks the
// directories where the misses cluster.
func coverage(res *scan.Result, outline *Outline) (claimed int, unclaimed []string, dirs []string) {
	byDir := map[string]int{}
	for _, f := range res.Files {
		path := f.Path
		hit := false
		for _, sec := range outline.Sections {
			if matchScope(sec.Files, path) {
				hit = true
				break
			}
		}
		if hit {
			claimed++
			continue
		}
		unclaimed = append(unclaimed, path)
		d := filepath.ToSlash(filepath.Dir(path))
		if d == "." {
			d = "(root)"
		}
		byDir[d]++
	}
	type dirCount struct {
		dir string
		n   int
	}
	var counts []dirCount
	for d, n := range byDir {
		counts = append(counts, dirCount{d, n})
	}
	sort.Slice(counts, func(i, j int) bool {
		if counts[i].n != counts[j].n {
			return counts[i].n > counts[j].n
		}
		return counts[i].dir < counts[j].dir
	})
	for _, c := range counts {
		dirs = append(dirs, fmt.Sprintf("%s (%d)", c.dir, c.n))
	}
	sort.Strings(unclaimed)
	return claimed, unclaimed, dirs
}
