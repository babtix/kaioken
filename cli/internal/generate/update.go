package generate

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"kaioken/internal/config"
	"kaioken/internal/gitx"
	"kaioken/internal/llm"
	"kaioken/internal/plan"
	"kaioken/internal/scan"
)

// Diff-driven card revision.
//
// A module whose hash changed used to be rebuilt from its full source bundle
// — tens of thousands of tokens — even when the change was one function. The
// wiki's incremental update showed the cheaper shape: hand the model what it
// wrote last time, the diff, and only the files the diff touches, and ask for
// a revision. The cards get the same treatment here. state.json remembers the
// commit each card set was generated at; that commit is the diff baseline.

// cardPatchBytes caps the raw diff handed to a revision, mirroring the wiki
// updater's ceiling.
const cardPatchBytes = 60_000

const cardUpdateSystem = `You maintain the KNOWLEDGE CARDS for one module of a codebase. The code has
changed and your job is to produce the UPDATED card set.

You are given: the current cards, the git diff of what changed inside this module, and the
current contents of the changed files.

Rules:
- PRESERVE everything still accurate — keep each card's density, structure and factual claims.
  This is a revision, not a rewrite.
- Rewrite only what the diff invalidates: changed signatures, renamed or deleted files, altered
  flows, new components. Cover genuinely new functionality.
- DELETE claims about code that no longer exists.
- Never invent APIs, files or behavior absent from the sources.

The cards keep their fixed schema:
- overview: 1–3 sentences. What the module is and does.
- architecture: the real structure with file/function names. 1–4 paragraphs.
- conventions: bullet list of concrete patterns a contribution MUST follow.
- tech_stack: 1–3 sentences of frameworks/libraries/infra actually used.
- setup_commands: commands unique to running/testing THIS module, or "" if none.

Return ONLY a JSON object:
{"overview":"...","architecture":"...","conventions":"...","tech_stack":"...","setup_commands":"..."}`

// reviseWorthwhile decides whether a changed module should be revised from
// its diff instead of rebuilt, and returns the changed files inside it.
//
// The revision path needs a resolvable baseline and a diff that is genuinely
// smaller than the module: an empty intersection means the change never got
// committed (the hash covers the working tree, the diff only commits), and a
// diff touching more than half the module's files would carry most of the
// bundle anyway — in both cases the full rebuild is the honest choice.
func reviseWorthwhile(ctx context.Context, repo, baseCommit string,
	fm plan.FlatModule, files []scan.File) ([]string, bool) {

	if baseCommit == "" || !gitx.IsRepo(repo) || !gitx.HasCommit(ctx, repo, baseCommit) {
		return nil, false
	}
	changes, err := gitx.Changes(ctx, repo, baseCommit)
	if err != nil || len(changes) == 0 {
		return nil, false
	}

	current := make(map[string]bool, len(files))
	for _, f := range files {
		current[f.Path] = true
	}

	var changed []string
	for _, c := range changes {
		// A deleted file is no longer in the module's file set but its
		// disappearance still invalidates cards, so scope matching catches it.
		if current[c.Path] || inScope(fm.Scope, c.Path) {
			changed = append(changed, c.Path)
		}
	}
	if len(changed) == 0 || len(changed) > len(files)/2 {
		return nil, false
	}
	return changed, true
}

// inScope mirrors how a module's scope prefixes claim files.
func inScope(scope []string, path string) bool {
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

// reviseModule asks the model to revise a module's existing cards against the
// git diff. Any error is a signal to fall back to the full rebuild, so it
// deliberately validates its inputs rather than limping through them.
func reviseModule(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
	fm plan.FlatModule, files []scan.File, changed []string, baseCommit string,
	res *scan.Result) error {

	existing, err := readExistingCards(repo, fm.ID)
	if err != nil {
		return err
	}
	patch, err := gitx.Patch(ctx, repo, baseCommit, changed, cardPatchBytes)
	if err != nil {
		return err
	}

	// Only the changed files' current contents ride along — that is the
	// whole saving. Deleted files are simply absent; the diff names them.
	changedSet := make(map[string]bool, len(changed))
	for _, p := range changed {
		changedSet[p] = true
	}
	var changedFiles []scan.File
	for _, f := range files {
		if changedSet[f.Path] {
			changedFiles = append(changedFiles, f)
		}
	}

	var user strings.Builder
	fmt.Fprintf(&user, "Module: %s\nTitle: %s\nDescription: %s\nScope: %s\n\n",
		fm.ID, fm.Title, fm.Description, strings.Join(fm.Scope, ", "))
	if len(cfg.Notes) > 0 {
		user.WriteString("Maintainer steering notes (authoritative, follow them):\n")
		for _, n := range cfg.Notes {
			user.WriteString("- " + n + "\n")
		}
		user.WriteString("\n")
	}
	user.WriteString("===== CURRENT CARDS =====\n")
	user.WriteString(existing)
	user.WriteString("\n===== GIT DIFF (this module only) =====\n")
	if strings.TrimSpace(patch) == "" {
		user.WriteString("(no textual diff — files were added or removed)\n")
	} else {
		user.WriteString(patch)
	}
	user.WriteString("\n\n===== CURRENT CONTENTS OF THE CHANGED FILES =====\n")
	if len(changedFiles) == 0 {
		user.WriteString("(every changed file was deleted)\n")
	} else {
		user.WriteString(buildBundle(res.Root, changedFiles, cfg.MaxModuleTokens))
	}

	var c cards
	if err := client.ChatJSON(ctx, cardUpdateSystem, user.String(), &c); err != nil {
		return fmt.Errorf("module %s: %w", fm.ID, err)
	}
	return writeCards(repo, client.Model, fm, len(files), c)
}

// readExistingCards assembles the on-disk card set into one labelled block.
// A module missing its required cards is not revisable.
func readExistingCards(repo, id string) (string, error) {
	dir := filepath.Join(repo, config.Dir, "knowledge", filepath.FromSlash(id))
	var b strings.Builder
	required := map[string]bool{"overview.md": true, "architecture.md": true}
	for _, name := range []string{
		"overview.md", "architecture.md", "conventions.md", "tech_stack.md", "setup_commands.md",
	} {
		raw, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			if required[name] {
				return "", fmt.Errorf("module %s: no existing %s to revise", id, name)
			}
			continue
		}
		fmt.Fprintf(&b, "--- %s ---\n%s\n", strings.TrimSuffix(name, ".md"),
			strings.TrimSpace(string(raw)))
	}
	return b.String(), nil
}
