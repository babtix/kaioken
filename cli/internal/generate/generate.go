// Package generate produces knowledge cards for each planned module by
// bundling its source files within a token budget and asking the LLM for a
// fixed card set, written under .ainow/knowledge/.
package generate

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"
	"gopkg.in/yaml.v3"

	"kaioken/internal/config"
	"kaioken/internal/gitx"
	"kaioken/internal/llm"
	"kaioken/internal/plan"
	"kaioken/internal/scan"
	"kaioken/internal/state"
)

// cards is the fixed schema every module receives. setup_commands may be
// empty when a module has nothing unique to run.
type cards struct {
	Overview      string `json:"overview"`
	Architecture  string `json:"architecture"`
	Conventions   string `json:"conventions"`
	TechStack     string `json:"tech_stack"`
	SetupCommands string `json:"setup_commands"`
}

const cardSystem = `You write KNOWLEDGE CARDS for one module of a codebase. Cards are dense,
factual context for AI coding agents and senior engineers — not marketing prose, not
tutorials. Every claim must come from the provided source files. Name real files, real
functions, real patterns. Never invent APIs or speculate.

Style example of the expected density (from another project):
"Three sibling FastAPI APIRouter modules mounted under /payments, /store, and /webhooks.
webhooks.py reads raw bytes first, verifies the X-Signature HMAC-SHA256 against
settings.LEMONSQUEEZY_WEBHOOK_SECRET, dispatches by meta.event_name through the
_EVENT_HANDLERS dict, enforces idempotency with a Redis SET NX EX 86400 claim key…"

Produce these cards:
- overview: 1–3 sentences. What the module is and does.
- architecture: the real structure — components, data flow, dependency direction,
  key mechanisms (auth, caching, error handling) with file/function names. 1–4 paragraphs.
- conventions: bullet list of concrete patterns a new contribution MUST follow
  (naming, layering, registration steps, error handling). Only patterns actually
  observable in the code.
- tech_stack: 1–3 sentences listing frameworks/libraries/infra this module actually uses.
- setup_commands: commands unique to running/testing THIS module, or "" if none.

Return ONLY a JSON object:
{"overview":"...","architecture":"...","conventions":"...","tech_stack":"...","setup_commands":"..."}`

// Options controls a generation run.
type Options struct {
	// Only, when non-empty, restricts generation to these module ids.
	Only []string
	// Force regenerates even when the source hash is unchanged, and skips
	// the diff-driven revision path.
	Force bool
	// OnStart/OnDone report progress; either may be nil.
	OnStart func(id string)
	OnDone  func(id string, err error, skipped bool)
	// OnRevised reports that a module's cards were revised from the git diff
	// rather than rebuilt from the full bundle. It fires before OnDone.
	OnRevised func(id string)
}

// Run generates cards for all (or selected) modules and refreshes the index.
func Run(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
	p *plan.Plan, res *scan.Result, opts Options) error {

	st, err := state.Load(repo)
	if err != nil {
		return err
	}
	var stMu sync.Mutex

	only := map[string]bool{}
	for _, id := range opts.Only {
		only[id] = true
	}

	// The HEAD commit becomes each regenerated module's diff baseline for the
	// next run. Resolved once: it cannot change mid-run in a meaningful way.
	head := ""
	if gitx.IsRepo(repo) {
		head, _ = gitx.Head(ctx, repo)
	}

	mods := p.Flatten()
	limit, _ := cfg.EffectiveConcurrency(client.Model)
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(limit)

	for _, fm := range mods {
		fm := fm
		if len(only) > 0 && !only[fm.ID] {
			continue
		}
		g.Go(func() error {
			files := plan.FilesFor(fm, res)
			// Parents whose files are all claimed by children may end up empty.
			if len(files) == 0 {
				if opts.OnDone != nil {
					opts.OnDone(fm.ID, nil, true)
				}
				return nil
			}
			hash, err := state.HashFiles(res.Root, files)
			if err != nil {
				return err
			}
			stMu.Lock()
			prev, seen := st.Modules[fm.ID]
			stMu.Unlock()
			if seen && prev.SourceHash == hash && !opts.Force {
				if opts.OnDone != nil {
					opts.OnDone(fm.ID, nil, true)
				}
				return nil
			}

			if opts.OnStart != nil {
				opts.OnStart(fm.ID)
			}
			// A changed module with a recorded baseline gets a revision first:
			// existing cards + the diff is far cheaper than the full bundle.
			// Any failure on this path falls through to the full rebuild — the
			// revision is an optimization, never a new way to fail.
			revised := false
			if !opts.Force && seen {
				if changed, ok := reviseWorthwhile(gctx, repo, prev.Commit, fm, files); ok {
					if err := reviseModule(gctx, repo, cfg, client, fm, files, changed, prev.Commit, res); err == nil {
						revised = true
						if opts.OnRevised != nil {
							opts.OnRevised(fm.ID)
						}
					}
				}
			}
			if !revised {
				err = generateModule(gctx, repo, cfg, client, fm, files, res)
			}
			if err == nil {
				stMu.Lock()
				st.Modules[fm.ID] = state.ModuleState{
					SourceHash:  hash,
					Model:       client.Model,
					GeneratedAt: time.Now().UTC(),
					FileCount:   len(files),
					Commit:      head,
				}
				stMu.Unlock()
			}
			if opts.OnDone != nil {
				opts.OnDone(fm.ID, err, false)
			}
			return err
		})
	}
	genErr := g.Wait()

	// Persist whatever succeeded even when some modules failed.
	if err := st.Save(repo); err != nil {
		return err
	}
	if err := WriteIndex(repo, p, st); err != nil {
		return err
	}
	return genErr
}

func generateModule(ctx context.Context, repo string, cfg *config.Config,
	client *llm.Client, fm plan.FlatModule, files []scan.File, res *scan.Result) error {

	bundle := buildBundle(res.Root, files, cfg.MaxModuleTokens)

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
	user.WriteString("Source files:\n\n")
	user.WriteString(bundle)

	var c cards
	if err := client.ChatJSON(ctx, cardSystem, user.String(), &c); err != nil {
		return fmt.Errorf("module %s: %w", fm.ID, err)
	}
	return writeCards(repo, client.Model, fm, len(files), c)
}

// writeCards validates a card set and persists it: module meta plus one file
// per card. Shared by the full-bundle and diff-revision paths so the on-disk
// shape cannot drift between them.
func writeCards(repo, model string, fm plan.FlatModule, fileCount int, c cards) error {
	if strings.TrimSpace(c.Overview) == "" || strings.TrimSpace(c.Architecture) == "" {
		return fmt.Errorf("module %s: model returned empty required cards", fm.ID)
	}

	dir := filepath.Join(repo, config.Dir, "knowledge", filepath.FromSlash(fm.ID))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	meta := map[string]any{
		"id":           fm.ID,
		"title":        fm.Title,
		"description":  fm.Description,
		"scope":        fm.Scope,
		"model":        model,
		"generated_at": time.Now().UTC().Format(time.RFC3339),
		"file_count":   fileCount,
	}
	metaRaw, err := yaml.Marshal(meta)
	if err != nil {
		return err
	}
	writes := map[string]string{
		"_module.yaml":    string(metaRaw),
		"overview.md":     c.Overview,
		"architecture.md": c.Architecture,
		"conventions.md":  c.Conventions,
		"tech_stack.md":   c.TechStack,
	}
	if strings.TrimSpace(c.SetupCommands) != "" {
		writes["setup_commands.md"] = c.SetupCommands
	} else {
		_ = os.Remove(filepath.Join(dir, "setup_commands.md"))
	}
	for name, content := range writes {
		if !strings.HasSuffix(content, "\n") {
			content += "\n"
		}
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
			return err
		}
	}
	return nil
}

// buildBundle concatenates file contents under an approximate token budget
// (chars/4), prioritizing manifests and entry points, truncating long files.
func buildBundle(root string, files []scan.File, maxTokens int) string {
	budget := maxTokens * 4 // chars

	prioritized := make([]scan.File, len(files))
	copy(prioritized, files)
	sort.SliceStable(prioritized, func(i, j int) bool {
		return filePriority(prioritized[i]) < filePriority(prioritized[j])
	})

	perFileCap := budget / max(len(files), 1)
	if perFileCap < 2000 {
		perFileCap = 2000
	}
	if perFileCap > 48000 {
		perFileCap = 48000
	}

	var b strings.Builder
	used := 0
	omitted := 0
	for _, f := range prioritized {
		if used >= budget {
			omitted++
			continue
		}
		raw, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(f.Path)))
		if err != nil {
			continue
		}
		content := string(raw)
		truncated := false
		if len(content) > perFileCap {
			// Keep head and tail: heads carry imports/types, tails carry
			// registrations and exports.
			head := perFileCap * 3 / 4
			tail := perFileCap - head
			content = content[:head] + "\n… [TRUNCATED] …\n" + content[len(content)-tail:]
			truncated = true
		}
		if used+len(content) > budget {
			room := budget - used
			if room < 1500 {
				omitted++
				continue
			}
			content = content[:room] + "\n… [TRUNCATED] …"
			truncated = true
		}
		fmt.Fprintf(&b, "===== %s", f.Path)
		if truncated {
			b.WriteString(" (truncated)")
		}
		b.WriteString(" =====\n")
		b.WriteString(content)
		b.WriteString("\n\n")
		used += len(content)
	}
	if omitted > 0 {
		fmt.Fprintf(&b, "[%d additional files omitted for length]\n", omitted)
	}
	return b.String()
}

// filePriority orders files inside a bundle: manifests, then entry points,
// then models/routes, then everything else, tests last.
func filePriority(f scan.File) int {
	base := strings.ToLower(filepath.Base(f.Path))
	p := strings.ToLower(f.Path)
	switch {
	case base == "package.json" || base == "pyproject.toml" || base == "go.mod" ||
		base == "cargo.toml" || base == "readme.md" || base == "claude.md":
		return 0
	case base == "main.py" || base == "main.go" || base == "main.tsx" ||
		base == "main.ts" || base == "app.tsx" || base == "index.ts" ||
		base == "index.tsx" || base == "__init__.py":
		return 1
	case strings.Contains(p, "model") || strings.Contains(p, "schema"):
		return 2
	case strings.Contains(p, "router") || strings.Contains(p, "route") ||
		strings.Contains(p, "controller") || strings.Contains(p, "page"):
		return 3
	case strings.Contains(p, "test") || strings.Contains(p, "spec"):
		return 9
	default:
		return 5
	}
}

// WriteIndex renders .ainow/KNOWLEDGE.md — the entry point an agent reads
// first: one line per module linking to its cards.
func WriteIndex(repo string, p *plan.Plan, st *state.State) error {
	var b strings.Builder
	b.WriteString("# Project Knowledge Base\n\n")
	b.WriteString("Generated by ainow. Read this index, then open the cards for the\n")
	b.WriteString("modules relevant to your task. Cards: `overview.md`, `architecture.md`,\n")
	b.WriteString("`conventions.md`, `tech_stack.md`, and sometimes `setup_commands.md`.\n\n")

	for _, fm := range p.Flatten() {
		depth := strings.Count(fm.ID, "/")
		indent := strings.Repeat("  ", depth)
		ms, generated := st.Modules[fm.ID]
		if generated {
			fmt.Fprintf(&b, "%s- **%s** — %s → [`knowledge/%s/`](knowledge/%s/) _(generated %s)_\n",
				indent, fm.Title, fm.Description, fm.ID, fm.ID,
				ms.GeneratedAt.Format("2006-01-02"))
		} else {
			fmt.Fprintf(&b, "%s- **%s** — %s _(not generated yet)_\n",
				indent, fm.Title, fm.Description)
		}
	}
	return os.WriteFile(filepath.Join(repo, config.Dir, "KNOWLEDGE.md"),
		[]byte(b.String()), 0o644)
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
