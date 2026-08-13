package tui

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"kaioken/internal/config"
	"kaioken/internal/prism"
)

// /prism drives the imported-document retriever from the TUI.
//
// The diagnostics print with every answer rather than behind a verbose switch.
// An answer built on ungraded context looks identical to a good one, and a
// user who cannot see the difference will trust both equally — which is the
// confusion this engine exists to prevent.

// prismDoneMsg carries the result of a background prism operation back to the
// update loop. Ingestion and retrieval both reach the network, so neither may
// run on the UI goroutine.
type prismDoneMsg struct {
	lines []string
	err   error
}

func (m Model) doPrism(args []string, rest string) (tea.Model, tea.Cmd) {
	sub := ""
	if len(args) > 0 {
		sub = strings.ToLower(args[0])
		rest = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(rest), args[0]))
	}

	switch sub {
	case "", "status":
		return m.prismStatus()
	case "modules", "ls":
		return m.prismModules()
	case "new":
		return m.prismNew(rest)
	case "rm", "delete":
		return m.prismRemove(rest)
	case "use", "module":
		return m.prismUse(rest)
	case "import", "add":
		return m.prismImport(rest)
	case "docs":
		return m.prismDocs()
	case "set":
		return m.prismSet(rest)
	case "ask", "query":
		return m.prismAsk(rest)
	default:
		// A bare `/prism <question>` is the common case once a module is
		// selected, so an unrecognised subcommand is treated as the question
		// rather than as a mistake.
		return m.prismAsk(strings.TrimSpace(sub + " " + rest))
	}
}

// prismEngine builds the engine for the active repo. It is rebuilt per command
// rather than cached on the model: the TUI's own /prism set writes config, and
// a stale engine would answer from the wiring the user just changed away from.
func (m Model) prismEngine() (*prism.Engine, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return prism.Open(ctx, m.repo)
}

func (m Model) prismStatus() (tea.Model, tea.Cmd) {
	e, err := m.prismEngine()
	if err != nil {
		m.appendLine(errStyle.Render(err.Error()))
		return m, nil
	}
	m.appendLine(dimStyle.Render(e.Status()))

	mods, err := e.Store.Modules()
	if err != nil {
		m.appendLine(errStyle.Render(err.Error()))
		return m, nil
	}
	if len(mods) == 0 {
		m.appendLine(dimStyle.Render(`no modules — /prism new "<name>" to make one`))
		return m, nil
	}
	for _, mod := range mods {
		marker := "  "
		if mod.Slug == m.prismModule {
			marker = "▸ "
		}
		m.appendLine(fmt.Sprintf("%s%-24s %d doc(s), %d chunk(s)",
			marker, mod.Slug, mod.DocumentCount, mod.ChunkCount))
	}
	if m.prismModule == "" {
		m.appendLine(dimStyle.Render("/prism use <slug> to select one"))
	}
	return m, nil
}

func (m Model) prismModules() (tea.Model, tea.Cmd) { return m.prismStatus() }

func (m Model) prismNew(name string) (tea.Model, tea.Cmd) {
	if name == "" {
		m.appendLine(warnStyle.Render(`usage: /prism new "<name>"`))
		return m, nil
	}
	mod, err := prism.NewStore(m.repo).CreateModule(strings.Trim(name, `"`), "", "")
	if err != nil {
		m.appendLine(errStyle.Render(err.Error()))
		return m, nil
	}
	m.prismModule = mod.Slug
	m.appendLine(okStyle.Render("created module " + mod.Slug + " — now selected"))
	m.appendLine(dimStyle.Render("/prism import <path> to add documents"))
	return m, nil
}

func (m Model) prismRemove(slug string) (tea.Model, tea.Cmd) {
	slug = strings.TrimSpace(slug)
	if slug == "" {
		slug = m.prismModule
	}
	if slug == "" {
		m.appendLine(warnStyle.Render("usage: /prism rm <slug>"))
		return m, nil
	}
	store := prism.NewStore(m.repo)
	mod, err := store.Module(slug)
	if err != nil {
		m.appendLine(errStyle.Render(err.Error()))
		return m, nil
	}
	// Every embedding in the module goes with it, and rebuilding them costs
	// real money. Say what is being thrown away before throwing it away.
	if !m.prismConfirmRm(slug) {
		m.appendLine(warnStyle.Render(fmt.Sprintf(
			"%s holds %d document(s) and %d chunk(s) — repeat the command to confirm",
			slug, mod.DocumentCount, mod.ChunkCount)))
		return m, nil
	}
	if err := store.DeleteModule(slug); err != nil {
		m.appendLine(errStyle.Render(err.Error()))
		return m, nil
	}
	if m.prismModule == slug {
		m.prismModule = ""
	}
	m.appendLine(okStyle.Render("deleted module " + slug))
	return m, nil
}

// prismConfirmRm implements the type-it-twice confirmation, which is the only
// confirmation a line-oriented interface can offer without a modal.
func (m *Model) prismConfirmRm(slug string) bool {
	if m.prismPendingRm == slug {
		m.prismPendingRm = ""
		return true
	}
	m.prismPendingRm = slug
	return false
}

func (m Model) prismUse(slug string) (tea.Model, tea.Cmd) {
	slug = strings.TrimSpace(slug)
	if slug == "" {
		m.appendLine(warnStyle.Render("usage: /prism use <slug>"))
		return m, nil
	}
	if _, err := prism.NewStore(m.repo).Module(slug); err != nil {
		m.appendLine(errStyle.Render(err.Error()))
		return m, nil
	}
	m.prismModule = slug
	m.appendLine(okStyle.Render("active module: " + slug))
	return m, nil
}

func (m Model) prismDocs() (tea.Model, tea.Cmd) {
	if m.prismModule == "" {
		m.appendLine(warnStyle.Render("no module selected — /prism use <slug>"))
		return m, nil
	}
	docs, err := prism.NewStore(m.repo).Documents(m.prismModule)
	if err != nil {
		m.appendLine(errStyle.Render(err.Error()))
		return m, nil
	}
	if len(docs) == 0 {
		m.appendLine(dimStyle.Render("no documents in " + m.prismModule))
		return m, nil
	}
	for _, d := range docs {
		style := okStyle
		switch d.Status {
		case prism.StatusFailed:
			style = errStyle
		case prism.StatusProcessing:
			style = warnStyle
		}
		m.appendLine(fmt.Sprintf("%s %-40s %d child / %d parent",
			style.Render(fmt.Sprintf("%-10s", d.Status)), d.Filename, d.ChildCount, d.ParentCount))
		if d.Error != "" {
			m.appendLine(dimStyle.Render("           " + d.Error))
		}
	}
	return m, nil
}

func (m Model) prismImport(path string) (tea.Model, tea.Cmd) {
	path = strings.Trim(strings.TrimSpace(path), `"`)
	if path == "" {
		m.appendLine(warnStyle.Render("usage: /prism import <path>"))
		return m, nil
	}
	if m.prismModule == "" {
		m.appendLine(warnStyle.Render("no module selected — /prism use <slug>"))
		return m, nil
	}
	if !filepath.IsAbs(path) {
		path = filepath.Join(m.repo, path)
	}

	module := m.prismModule
	m.appendLine(dimStyle.Render("importing " + filepath.Base(path) + " …"))

	// Embedding a document is a network round trip per batch, so it runs off
	// the UI goroutine and reports back through prismDoneMsg.
	return m, func() tea.Msg {
		e, err := prism.Open(context.Background(), m.repo)
		if err != nil {
			return prismDoneMsg{err: err}
		}
		paths, err := prismExpand(path)
		if err != nil {
			return prismDoneMsg{err: err}
		}

		var lines []string
		if !e.Embed.Enabled() {
			lines = append(lines, "! no embedding model — this import will be lexical only")
		}
		for _, p := range paths {
			doc, err := e.Ingestor().ImportFile(context.Background(), module, p, nil)
			if err != nil {
				lines = append(lines, fmt.Sprintf("! %s: %v", filepath.Base(p), err))
				continue
			}
			lines = append(lines, fmt.Sprintf("+ %-36s %d child / %d parent chunk(s)",
				doc.Filename, doc.ChildCount, doc.ParentCount))
		}
		if mod, err := e.Store.Module(module); err == nil {
			lines = append(lines, fmt.Sprintf("%s now holds %d document(s), %d chunk(s)",
				mod.Slug, mod.DocumentCount, mod.ChunkCount))
		}
		return prismDoneMsg{lines: lines}
	}
}

func (m Model) prismAsk(query string) (tea.Model, tea.Cmd) {
	query = strings.TrimSpace(query)
	if query == "" {
		m.appendLine(warnStyle.Render(`usage: /prism ask "<question>"`))
		return m, nil
	}
	if m.prismModule == "" {
		m.appendLine(warnStyle.Render("no module selected — /prism use <slug>"))
		return m, nil
	}

	module, repo := m.prismModule, m.repo
	return m, func() tea.Msg {
		e, err := prism.Open(context.Background(), repo)
		if err != nil {
			return prismDoneMsg{err: err}
		}
		opt := e.Options
		opt.Module = module

		started := time.Now()
		res, err := e.Retrieve(context.Background(), query, opt)
		if err != nil {
			return prismDoneMsg{err: err}
		}
		return prismDoneMsg{lines: prismAnswerLines(res, time.Since(started))}
	}
}

// prismAnswerLines renders an answer with its diagnostics on top.
func prismAnswerLines(res prism.AgentResult, elapsed time.Duration) []string {
	lines := []string{fmt.Sprintf("%s · %s · %d chunk(s) · %dms",
		prismFlags(res.Result), res.Route, len(res.Chunks), elapsed.Milliseconds())}

	if res.Route == prism.RouteComplex {
		for _, s := range res.Steps {
			mark := "miss"
			if s.SourceFound {
				mark = "hit "
			}
			lines = append(lines, fmt.Sprintf("  %s  %s", mark, s.Query))
		}
	}
	if len(res.Chunks) == 0 {
		return append(lines, "no source in this module answers that.")
	}
	for i, c := range res.Chunks {
		lines = append(lines, fmt.Sprintf("── %d ──", i+1), c)
	}
	for _, u := range res.Unresolved {
		lines = append(lines, "unresolved: "+u)
	}
	return lines
}

// prismFlags spells the three flags out as words. The degraded states are
// upper-cased because they are warnings, not data.
func prismFlags(r prism.Result) string {
	parts := make([]string, 0, 3)
	if r.SourceFound {
		parts = append(parts, "sourced")
	} else {
		parts = append(parts, "NO SOURCE")
	}
	if r.Graded {
		parts = append(parts, "graded")
	} else {
		parts = append(parts, "UNGRADED")
	}
	if r.Degraded {
		parts = append(parts, "DEGRADED")
	}
	return strings.Join(parts, " · ")
}

// prismSettableKeys is the editable surface, kept in one place so the help
// text and the setter cannot drift apart.
var prismSettableKeys = []string{
	"embed_model", "embed_provider", "embed_base_url",
	"embed_fallback_model", "embed_fallback_provider",
	"utility_model", "utility_provider",
	"mode", "top_k", "variants", "grade",
	"parent_tokens", "child_tokens", "child_overlap", "cache_ttl_seconds",
}

// prismSet writes one setting to the workspace config, so every knob the
// engine reads is reachable without leaving the TUI.
func (m Model) prismSet(rest string) (tea.Model, tea.Cmd) {
	fields := strings.Fields(rest)
	if len(fields) == 0 {
		m.appendLine(dimStyle.Render("settable: " + strings.Join(prismSettableKeys, ", ")))
		for _, l := range m.prismConfigLines() {
			m.appendLine(l)
		}
		return m, nil
	}
	if len(fields) == 1 {
		m.appendLine(warnStyle.Render("usage: /prism set <key> <value>"))
		return m, nil
	}

	key := strings.ToLower(fields[0])
	value := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(rest), fields[0]))

	cfg, err := config.Load(m.repo)
	if err != nil {
		m.appendLine(errStyle.Render(err.Error()))
		return m, nil
	}
	if err := prismApply(&cfg.Prism, key, value); err != nil {
		m.appendLine(errStyle.Render(err.Error()))
		return m, nil
	}
	if err := cfg.Save(m.repo); err != nil {
		m.appendLine(errStyle.Render(err.Error()))
		return m, nil
	}
	m.appendLine(okStyle.Render(fmt.Sprintf("prism.%s = %s", key, value)))

	// Re-resolving immediately is the point: a user who sets an embedding
	// model wants to know now whether it was found, not at the next query.
	if strings.HasPrefix(key, "embed") {
		if e, err := m.prismEngine(); err == nil {
			m.appendLine(dimStyle.Render(e.Status()))
		}
	}
	return m, nil
}

// prismApply writes one key onto a config block, validating as it goes.
func prismApply(p *config.Prism, key, value string) error {
	num := func() (int, error) {
		n, err := strconv.Atoi(value)
		if err != nil || n < 0 {
			return 0, fmt.Errorf("%s wants a non-negative number, got %q", key, value)
		}
		return n, nil
	}

	switch key {
	case "embed_model":
		p.EmbedModel = value
	case "embed_provider":
		p.EmbedProvider = value
	case "embed_base_url":
		p.EmbedBaseURL = value
	case "embed_fallback_model":
		p.EmbedFallbackModel = value
	case "embed_fallback_provider":
		p.EmbedFallbackProvider = value
	case "utility_model":
		p.UtilityModel = value
	case "utility_provider":
		p.UtilityProvider = value
	case "mode":
		v := strings.ToLower(value)
		if v != "static" && v != "agent" {
			return fmt.Errorf(`mode must be "static" or "agent", got %q`, value)
		}
		p.Mode = v
	case "grade":
		v := strings.EqualFold(value, "true") || strings.EqualFold(value, "on") ||
			strings.EqualFold(value, "yes")
		p.Grade = &v
	case "variants":
		n, err := num()
		if err != nil {
			return err
		}
		if n < 1 {
			n = 1
		}
		if n > prism.MaxVariants {
			return fmt.Errorf("variants is capped at %d — past that the phrasings paraphrase each other", prism.MaxVariants)
		}
		p.Variants = n
	case "top_k":
		n, err := num()
		if err != nil {
			return err
		}
		p.TopK = n
	case "parent_tokens":
		n, err := num()
		if err != nil {
			return err
		}
		p.ParentTokens = n
	case "child_tokens":
		n, err := num()
		if err != nil {
			return err
		}
		p.ChildTokens = n
	case "child_overlap":
		n, err := num()
		if err != nil {
			return err
		}
		p.ChildOverlap = n
	case "cache_ttl_seconds":
		n, err := num()
		if err != nil {
			return err
		}
		p.CacheTTLSeconds = n
	default:
		return fmt.Errorf("unknown prism setting %q — settable: %s", key, strings.Join(prismSettableKeys, ", "))
	}
	return nil
}

// prismConfigLines renders the current settings, marking the ones still on
// their default so "unset" and "set to the default value" are distinguishable.
func (m Model) prismConfigLines() []string {
	cfg, err := config.Load(m.repo)
	if err != nil {
		return []string{errStyle.Render(err.Error())}
	}
	p := cfg.Prism

	show := func(key, value, dflt string) string {
		if strings.TrimSpace(value) == "" {
			return dimStyle.Render(fmt.Sprintf("  %-24s %s", key, dflt))
		}
		return fmt.Sprintf("  %-24s %s", key, value)
	}
	// Zero renders as empty so show() falls through to the dimmed default,
	// which is how "unset" stays distinguishable from "set to the default".
	numOr := func(n int) string {
		if n == 0 {
			return ""
		}
		return strconv.Itoa(n)
	}

	chunk := prism.DefaultChunkConfig()
	return []string{
		show("embed_model", p.EmbedModel, "(auto: local, then fallback)"),
		show("embed_provider", p.EmbedProvider, "(auto)"),
		show("embed_fallback_model", p.EmbedFallbackModel, "(none — no paid fallback)"),
		show("utility_model", p.UtilityModel, "(none — the relevance gate cannot run)"),
		show("mode", p.Mode, "static"),
		show("top_k", numOr(p.TopK), strconv.Itoa(prism.DefaultTopK)),
		show("variants", numOr(p.Variants), "1 (fusion off)"),
		show("grade", boolWord(p.Grade), "on (when a utility model exists)"),
		show("parent_tokens", numOr(p.ParentTokens), strconv.Itoa(chunk.ParentTokens)),
		show("child_tokens", numOr(p.ChildTokens), strconv.Itoa(chunk.ChildTokens)),
		show("child_overlap", numOr(p.ChildOverlap), strconv.Itoa(chunk.ChildOverlap)),
		show("cache_ttl_seconds", numOr(p.CacheTTLSeconds), strconv.Itoa(int(prism.DefaultCacheTTL.Seconds()))),
	}
}

func boolWord(b *bool) string {
	if b == nil {
		return ""
	}
	if *b {
		return "on"
	}
	return "off"
}

// prismExpand turns one path into the list of importable files under it.
func prismExpand(path string) ([]string, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		if !prism.Supported(path) {
			return nil, fmt.Errorf("%s: unsupported file type", filepath.Base(path))
		}
		return []string{path}, nil
	}

	var out []string
	err = filepath.WalkDir(path, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			// .kaioken holds PRISM's own state; importing a module's chunk
			// store back into itself is the first thing a recursive walk does.
			if name := d.Name(); strings.HasPrefix(name, ".") && p != path {
				return filepath.SkipDir
			}
			switch d.Name() {
			case "node_modules", "vendor", "target", "dist", "build", "__pycache__":
				return filepath.SkipDir
			}
			return nil
		}
		if prism.Supported(p) {
			out = append(out, p)
		}
		return nil
	})
	sort.Strings(out)
	return out, err
}
