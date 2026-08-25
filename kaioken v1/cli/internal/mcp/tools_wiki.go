package mcp

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"kaioken/internal/search"
	"kaioken/internal/wiki"
)

// The wiki tools are the reason this server exists: a generated chapter that
// already explains a subsystem beats an agent re-reading the source to
// rediscover it.

func (s *Server) registerWikiTools() {
	s.register(Tool{
		Name: "wiki_search",
		Description: "Search the generated repository wiki. Returns ranked chapter " +
			"excerpts with their paths, which wiki_read then opens in full. Use this " +
			"before reading source files: the wiki explains why code is shaped the way " +
			"it is, which the source alone does not.",
		InputSchema: object().
			str("query", "What to look for — a subsystem, concept, symbol or question.").
			str("section", "Optional section id to restrict the search to (see wiki_tree).").
			integer("limit", "Maximum results.", 10, 1, 50).
			require("query").
			build(),
		Handler: wikiSearch,
	})

	s.register(Tool{
		Name: "wiki_read",
		Description: "Read one wiki document in full, with its table of contents and " +
			"the source files it was written from. Paths come from wiki_search or wiki_tree.",
		InputSchema: object().
			str("path", `Wiki-relative path, e.g. "architecture/overview.md".`).
			require("path").
			build(),
		Handler: wikiRead,
	})

	s.register(Tool{
		Name: "wiki_tree",
		Description: "List the wiki's sections and the documents in each. Call this " +
			"first to learn what the knowledge base covers before searching it.",
		InputSchema: object().
			str("section", "Optional section id to expand on its own.").
			build(),
		Handler: wikiTree,
	})
}

func wikiSearch(ctx callContext, raw json.RawMessage) (*ToolResult, error) {
	var args struct {
		Query   string `json:"query"`
		Section string `json:"section"`
		Limit   int    `json:"limit"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return nil, fmt.Errorf("bad arguments: %w", err)
	}
	query := strings.TrimSpace(args.Query)
	if query == "" {
		return nil, fmt.Errorf("query is required")
	}
	if args.Limit <= 0 {
		args.Limit = 10
	}

	hits, err := ctx.srv.search(ctx, search.Query{
		Text:    query,
		Kinds:   []search.Kind{search.KindWiki, search.KindCard},
		Section: args.Section,
		Limit:   args.Limit,
	})
	if err != nil {
		return nil, err
	}
	if len(hits) == 0 {
		return textResult(fmt.Sprintf(
			"No matches for %q in the knowledge base of %s.\n\n"+
				"Either the wiki is not generated yet (run `kaioken wiki` there) or the topic "+
				"genuinely is not covered — read the source directly in that case.",
			query, ctx.srv.repo)), nil
	}

	var b strings.Builder
	fmt.Fprintf(&b, "%d match(es) for %q:\n\n", len(hits), query)
	for _, h := range hits {
		label := h.Path
		if h.Kind == search.KindCard {
			label = "knowledge/" + h.Path
		}
		fmt.Fprintf(&b, "## %s", h.Title)
		if h.Heading != "" && h.Heading != h.Title {
			fmt.Fprintf(&b, " › %s", h.Heading)
		}
		fmt.Fprintf(&b, "\n`%s:%d`\n\n%s\n\n", label, h.Line, h.Snippet)
	}
	b.WriteString("Open any of these in full with wiki_read.")
	return jsonResult(b.String(), map[string]any{"query": query, "results": hits}), nil
}

func wikiRead(ctx callContext, raw json.RawMessage) (*ToolResult, error) {
	var args struct {
		Path string `json:"path"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return nil, fmt.Errorf("bad arguments: %w", err)
	}
	rel := strings.TrimSpace(args.Path)
	if rel == "" {
		return nil, fmt.Errorf("path is required")
	}

	full, err := safeJoin(wiki.WikiDir(ctx.srv.repo), rel)
	if err != nil {
		return nil, err
	}
	if !strings.HasSuffix(full, ".md") {
		full += ".md"
	}
	body, err := os.ReadFile(full)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("no wiki document at %q — call wiki_tree for the available paths", rel)
		}
		return nil, err
	}

	text := string(body)
	doc := map[string]any{
		"path":     filepath.ToSlash(rel),
		"title":    firstHeading(text, rel),
		"toc":      tableOfContents(text),
		"markdown": text,
	}
	return jsonResult(text, doc), nil
}

func wikiTree(ctx callContext, raw json.RawMessage) (*ToolResult, error) {
	var args struct {
		Section string `json:"section"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return nil, fmt.Errorf("bad arguments: %w", err)
	}

	repo := ctx.srv.repo
	dir := wiki.WikiDir(repo)
	if _, err := os.Stat(dir); err != nil {
		return nil, fmt.Errorf("no wiki generated in %s yet — run `kaioken wiki` there first", repo)
	}

	// The outline is the authoritative section list with human titles; the
	// filesystem is the authority on what actually got written. Prefer the
	// outline for naming and fall back to directory names for anything it
	// does not mention (hand-added chapters, renames).
	titles := map[string]string{}
	if outline, err := wiki.LoadOutline(repo); err == nil {
		for _, sec := range outline.Sections {
			titles[wiki.SafeName(sec.Title)] = sec.Title
			titles[sec.ID] = sec.Title
		}
	}

	type sectionOut struct {
		ID    string   `json:"id"`
		Title string   `json:"title"`
		Docs  []string `json:"docs"`
	}
	var sections []sectionOut

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var rootDocs []string
	for _, e := range entries {
		if !e.IsDir() {
			if strings.HasSuffix(e.Name(), ".md") {
				rootDocs = append(rootDocs, e.Name())
			}
			continue
		}
		id := e.Name()
		if args.Section != "" && id != args.Section && wiki.SafeName(args.Section) != id {
			continue
		}
		title := titles[id]
		if title == "" {
			title = humanize(id)
		}
		var docs []string
		sub, _ := os.ReadDir(filepath.Join(dir, id))
		for _, d := range sub {
			if !d.IsDir() && strings.HasSuffix(d.Name(), ".md") {
				docs = append(docs, id+"/"+d.Name())
			}
		}
		sort.Strings(docs)
		sections = append(sections, sectionOut{ID: id, Title: title, Docs: docs})
	}
	sort.Slice(sections, func(i, j int) bool { return sections[i].ID < sections[j].ID })

	var b strings.Builder
	fmt.Fprintf(&b, "Wiki for %s\n\n", repo)
	for _, d := range rootDocs {
		fmt.Fprintf(&b, "- %s\n", d)
	}
	for _, sec := range sections {
		fmt.Fprintf(&b, "\n## %s (`%s`)\n", sec.Title, sec.ID)
		for _, d := range sec.Docs {
			fmt.Fprintf(&b, "  - %s\n", d)
		}
	}
	if len(sections) == 0 && len(rootDocs) == 0 {
		b.WriteString("(empty — run `kaioken wiki` to generate it)\n")
	}
	return jsonResult(b.String(), map[string]any{
		"sections": sections,
		"root":     rootDocs,
	}), nil
}

// firstHeading pulls a document title from its first ATX heading, falling
// back to the filename.
func firstHeading(text, fallback string) string {
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(line, "# ") {
			return strings.TrimSpace(line[2:])
		}
	}
	return humanize(strings.TrimSuffix(filepath.Base(fallback), ".md"))
}

type tocEntry struct {
	Level  int    `json:"level"`
	Title  string `json:"title"`
	Anchor string `json:"anchor"`
}

func tableOfContents(text string) []tocEntry {
	var out []tocEntry
	fenced := false
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "```") {
			fenced = !fenced
			continue
		}
		if fenced || !strings.HasPrefix(line, "#") {
			continue
		}
		level := 0
		for level < len(line) && line[level] == '#' {
			level++
		}
		if level > 6 || level >= len(line) || line[level] != ' ' {
			continue
		}
		title := strings.TrimSpace(line[level:])
		out = append(out, tocEntry{Level: level, Title: title, Anchor: anchorize(title)})
	}
	return out
}

// anchorize mirrors GitHub's heading-anchor rules closely enough for a client
// to build a working deep link.
func anchorize(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == ' ', r == '-', r == '_':
			b.WriteByte('-')
		}
	}
	return strings.Trim(b.String(), "-")
}

func humanize(id string) string {
	s := strings.NewReplacer("_", " ", "-", " ").Replace(id)
	parts := strings.Fields(s)
	for i, p := range parts {
		parts[i] = strings.ToUpper(p[:1]) + p[1:]
	}
	return strings.Join(parts, " ")
}

// safeJoin resolves rel under root and refuses anything that escapes it.
// Every path a client supplies goes through here.
func safeJoin(root, rel string) (string, error) {
	if filepath.IsAbs(rel) {
		return "", fmt.Errorf("path must be relative, got %q", rel)
	}
	clean := filepath.Clean(filepath.FromSlash(rel))
	full := filepath.Join(root, clean)
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	absFull, err := filepath.Abs(full)
	if err != nil {
		return "", err
	}
	relCheck, err := filepath.Rel(absRoot, absFull)
	if err != nil || relCheck == ".." || strings.HasPrefix(relCheck, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("path %q escapes the workspace", rel)
	}
	return absFull, nil
}
