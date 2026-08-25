# Serving the Generated Wiki

Kaioken includes a built-in HTTP server for browsing generated wiki documentation locally. This server transforms the markdown-based wiki into an interactive site with features like collapsible navigation, search, table of contents, code highlighting, and a knowledge graph view—all accessible via a standard web browser.

## Table of Contents
- [Starting the Server](#starting-the-server)
- [Server Architecture](#server-architecture)
- [Handling Requests](#handling-requests)
  - [The Index Page](#the-index-page)
  - [Document Requests](#document-requests)
  - [Search Requests](#search-requests)
  - [Graph Requests](#graph-requests)
- [Features](#features)
  - [Markdown Rendering](#markdown-rendering)
  - [Table of Contents](#table-of-contents)
  - [Code Highlighting and Mermaid Diagrams](#code-highlighting-and-mermaid-diagrams)
  - [Search Functionality](#search-functionality)
  - [Navigation and UI](#navigation-and-ui)
  - [Graph View](#graph-view)
- [Security and Error Handling](#security-and-error-handling)
- [Responsive Design](#responsive-design)

## Starting the Server

The wiki server is started via the `kaioken serve` CLI command or the `/serve` slash-command in the TUI. It requires a pre-generated wiki (produced by `kaioken wiki` or `kaioken update`).

When started, the server:
1. Verifies the wiki directory exists (`.kaioken/wiki` relative to the repository root)
2. Binds to an available TCP port (defaulting to `127.0.0.1:0` for random port selection)
3. Reports the bound address via a ready callback (used by the CLI/TUI to display the URL)
4. Serves requests until the context is cancelled

The server implementation lives in `internal/serve/serve.go`:

```
`internal/serve/serve.go:89-97`
func New(repo string) *Server {
	return &Server{
		repo: repo,
		md: goldmark.New(
			goldmark.WithExtensions(extension.GFM), // tables, strikethrough, autolinks
			goldmark.WithRendererOptions(mdhtml.WithUnsafe()),
		),
	}
}
```

```
`internal/serve/serve.go:102-127`
func Run(ctx context.Context, repo, addr string, ready func(url string)) error {
	if _, err := os.Stat(wiki.WikiDir(repo)); err != nil {
		return fmt.Errorf("no generated wiki at %s — run the wiki first", wiki.WikiDir(repo))
	}
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	srv := &http.Server{
		Handler:           New(repo).routes(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	if ready != nil {
		ready("http://" + ln.Addr().String())
	}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
	}()
	if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
```

The `New` function initializes a markdown renderer with GitHub Flavored Markdown support (tables, task lists, autolinks) and allows unsafe HTML (needed for Mermaid diagrams and custom styling). The `Run` function handles server lifecycle, including graceful shutdown on context cancellation.

## Server Architecture

The server centers around the `Server` struct, which holds the repository path, a pre-configured markdown parser, and a static export flag:

```
`internal/serve/serve.go:50-57`
type Server struct {
	repo string
	md   goldmark.Markdown
	// static switches the link scheme from server routes (/d/<rel>) to flat
	// relative .html slugs, and drops the server-only chrome (search, graph).
	// Set only by the static export path.
	static bool
}
```

Key unexported types support internal operations:
- `Section`: Represents a wiki chapter directory containing documents
- `Doc`: Represents a single markdown document with title and relative path
- `pageInfo`: Encapsulates all data needed to render a complete HTML page

```
`internal/serve/serve.go:38-41`
type Section struct {
	Name string
	Docs []Doc
}
```

```
`internal/serve/serve.go:44-47`
type Doc struct {
	Title string
	Rel   string // slash path relative to the wiki root, e.g. "Architecture/Data Flow.md"
}
```

```
`internal/serve/serve.go:200-207`
type pageInfo struct {
	title    string
	current  string // slash-relative path of the active doc, "" when none
	bodyHTML string // fully rendered article HTML
	isIndex  bool
	modTime  time.Time
	words    int
}
```

The server's route mapping is defined in `routes()`:

```
`internal/serve/serve.go:129-137`
func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/d/", s.handleDoc)
	mux.HandleFunc("/search", s.handleSearch)
	mux.HandleFunc("/graph", s.handleGraphPage)
	mux.HandleFunc("/graph.json", s.handleGraphJSON)
	return mux
}
```

This creates five endpoints:
- `GET /`: Wiki index page
- `GET /d/<path>`: Individual document
- `GET /search`: Search interface
- `GET /graph`: Interactive knowledge graph view
- `GET /graph.json`: Raw graph data in JSON format

## Handling Requests

### The Index Page

The index handler (`handleIndex`) serves the wiki's landing page. It:
1. Attempts to load `README.md` from the wiki root
2. Falls back to a default welcome message if README is missing
3. Renders the markdown content using the goldmark parser
4. Appends chapter overview cards generated by `indexCards()`

```
`internal/serve/serve.go:209-218`
func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := s.renderIndex(w); err != nil {
		http.Error(w, "render error: "+err.Error(), http.StatusInternalServerError)
	}
}

// renderIndex writes the overview page — the wiki README (or a placeholder)
// plus the chapter cards. Shared verbatim by the HTTP server and the static
// export, so the two cannot drift apart.
func (s *Server) renderIndex(w io.Writer) error {
	body := "# Repository Wiki\n\nPick a chapter from the sidebar.\n"
	if raw, err := os.ReadFile(filepath.Join(wiki.WikiDir(s.repo), "README.md")); err == nil {
		body = string(raw)
	}
	var content bytes.Buffer
	if err := s.md.Convert([]byte(body), &content); err != nil {
		return err
	}
	s.page(w, pageInfo{
		title:    "Wiki",
		bodyHTML: content.String() + s.indexCards(),
		isIndex:  true,
	})
	return nil
}
```

The `indexCards()` function generates a responsive grid showing each chapter with:
- Chapter name as a link to its lead document
- Document count
- Preview of up to three document titles per chapter

```
`internal/serve/serve.go:241-265`
func (s *Server) indexCards() string {
	secs := s.sections()
	if len(secs) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString(`<div class="cards">`)
	for _, sec := range secs {
		fmt.Fprintf(&b, `<a class="card" href="%s"><div class="card-name">%s</div>`,
			htmlEscape(s.docHref(sec.Docs[0].Rel)), htmlEscape(sec.Name))
		fmt.Fprintf(&b, `<div class="card-count">%d docs</div><ul>`, len(sec.Docs))
		for i, d := range sec.Docs {
			if i >= 3 {
				break
			}
			fmt.Fprintf(&b, `<li>%s</li>`, htmlEscape(d.Title))
		}
		if len(sec.Docs) > 3 {
			fmt.Fprintf(&b, `<li class="more">+ %d more…</li>`, len(sec.Docs)-3)
		}
		b.WriteString(`</ul></a>`)
	}
	b.WriteString(`</div>`)
	return b.String()
}
```

### Document Requests

The document handler (`handleDoc`) serves individual markdown files:
1. Extracts the relative path from `/d/<path>`
2. Validates the path is within the wiki directory via `resolve()`
3. Reads and truncates the file to `maxDocBytes` (4MB)
4. Converts markdown to HTML
5. Extracts metadata (word count, modification time)
6. Renders the full page via `page()`

```
`internal/serve/serve.go:267-273`
func (s *Server) handleDoc(w http.ResponseWriter, r *http.Request) {
	rel := strings.TrimPrefix(r.URL.Path, "/d/")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := s.renderDoc(w, rel); err != nil {
		http.Error(w, "not found", http.StatusNotFound)
	}
}

// renderDoc writes one document page. Errors cover both a missing file and a
// path outside the wiki; the HTTP layer answers both with 404.
func (s *Server) renderDoc(w io.Writer, rel string) error {
	abs, err := s.resolve(rel)
	if err != nil {
		return err
	}
	raw, err := os.ReadFile(abs)
	if err != nil {
		return err
	}
	if len(raw) > maxDocBytes {
		raw = raw[:maxDocBytes]
	}
	var content bytes.Buffer
	if err := s.md.Convert(raw, &content); err != nil {
		return err
	}
	title := strings.TrimSuffix(filepath.Base(rel), ".md")
	info := pageInfo{
		title:    title,
		current:  rel,
		bodyHTML: content.String(),
		words:    len(strings.Fields(string(raw))),
	}
	if fi, err := os.Stat(abs); err == nil {
		info.modTime = fi.ModTime()
	}
	s.page(w, info)
	return nil
}
```

Path resolution prevents directory traversal attacks:

```
`internal/serve/serve.go:184-197`
func (s *Server) resolve(rel string) (string, error) {
	root, err := filepath.Abs(wiki.WikiDir(s.repo))
	if err != nil {
		return "", err
	}
	abs, err := filepath.Abs(filepath.Join(root, filepath.FromSlash(rel)))
	if err != nil {
		return "", err
	}
	if abs != root && !strings.HasPrefix(abs, root+string(os.PathSeparator)) {
		return "", fmt.Errorf("path outside the wiki")
	}
	return abs, nil
}
```

### Search Requests

The search handler (`handleSearch`) provides full-text search across all documents:
1. Extracts query parameter `q`
2. Returns empty state if query is blank
3. For each document:
   - Reads file content
   - Performs case-insensitive line-by-line search
   - Collects up to 5 matching lines per document
   - Highlights matches using `highlightHTML()`
4. Renders results with hit counts and snippets

```
`internal/serve/serve.go:307-358`
func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		s.page(w, pageInfo{
			title:    "Search",
			bodyHTML: "<h1>Search</h1><p>Enter a term above.</p>",
		})
		return
	}
	var b strings.Builder
	fmt.Fprintf(&b, `<h1>Search: %s</h1>`, htmlEscape(q))
	needle := strings.ToLower(q)
	hits, total := 0, 0
	for _, sec := range s.sections() {
		for _, doc := range sec.Docs {
			abs, err := s.resolve(doc.Rel)
			if err != nil {
				continue
			}
			raw, err := os.ReadFile(abs)
			if err != nil {
				continue
			}
			var matches []string
			for i, line := range strings.Split(string(raw), "\n") {
				if strings.Contains(strings.ToLower(line), needle) {
					matches = append(matches, fmt.Sprintf(
						`<div class="hit"><span class="hit-line">line %d</span> %s</div>`,
						i+1, highlightHTML(line, q)))
					if len(matches) >= 5 {
						break
					}
				}
			}
			if len(matches) == 0 {
				continue
			}
			hits++
			total += len(matches)
			fmt.Fprintf(&b, `<div class="result"><a class="result-title" href="/d/%s">%s <span class="result-sec">/ %s</span></a><div class="result-matches">%s</div></div>`,
				htmlEscape(doc.Rel), htmlEscape(doc.Title), htmlEscape(sec.Name),
				strings.Join(matches, ""))
		}
	}
	if hits == 0 {
		b.WriteString(`<p class="no-hits">No matches.</p>`)
	} else {
		fmt.Fprintf(&b, `<p class="hit-summary">%d match(es) across %d document(s)</p>`, total, hits)
	}
	s.page(w, pageInfo{title: "Search", bodyHTML: b.String()})
}
```

The `highlightHTML()` function escapes HTML and wraps matches in `<mark>` tags:

```
`internal/serve/serve.go:400-421`
func highlightHTML(line, needle string) string {
	if needle == "" {
		return htmlEscape(line)
	}
	lower, n := strings.ToLower(line), strings.ToLower(needle)
	var b strings.Builder
	start := 0
	for {
		i := strings.Index(lower[start:], n)
		if i < 0 {
			b.WriteString(htmlEscape(line[start:]))
			break
		}
		i += start
		b.WriteString(htmlEscape(line[start:i]))
		b.WriteString("<mark>")
		b.WriteString(htmlEscape(line[i : i+len(n)]))
		b.WriteString("</mark>")
		start = i + len(n)
	}
	return b.String()
}
```

### Graph Requests

The graph handlers provide an interactive knowledge graph view of the wiki:
- `handleGraphJSON` serves the raw graph data as JSON
- `handleGraphPage` renders an interactive visualization using the embedded KaioGraph engine

```
`internal/serve/serve.go:363-396`
func (s *Server) handleGraphJSON(w http.ResponseWriter, r *http.Request) {
	g, err := wiki.BuildGraph(s.repo)
	if err != nil {
		http.Error(w, "graph error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(g)
}

// handleGraphPage renders the full-bleed graph view: a canvas driven by the
// embedded engine, plus a small control strip. Clicking a doc node navigates
// to /d/<rel>; file nodes are inert — there is no editor to open into.
func (s *Server) handleGraphPage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Graph · Kaioken Wiki</title><link rel="icon" href="` + favicon + `"><style>` +
		styles + graphStyles + `</style></head><body class="graph-page">
<a class="graph-back" href="/">← wiki</a>
<div class="graph-bar">
<label><input type="checkbox" id="f-files" checked> files</label>
<label><input type="checkbox" id="f-contains" checked> contains</label>
<label><input type="checkbox" id="f-links" checked> links</label>
<label><input type="checkbox" id="f-source" checked> source</label>
<button type="button" id="g-fit">fit</button>
<span id="g-stats"></span>
</div>
<div class="graph-main"><canvas id="graph-canvas"></canvas>
<div id="g-empty">no wiki generated yet — run the wiki first</div></div>
<script>` + graphJS + `</script>
<script>` + graphBoot + `</script>
</body></html>`))
}
```

The graph data is built by `wiki.BuildGraph`, representing:
- **Nodes**: Documents (kind: `doc`), files (kind: `file`), and chapters (kind: `section`)
- **Edges**: Contains relationships (file contains symbol), links (document links to another), and source (file belongs to section)

The interactive view includes:
- **Control panel**: Toggle visibility of node types (files, contains edges, links, source nodes)
- **Fit button**: Centers and zooms to show all nodes
- **Statistics panel**: Shows counts of documents, files, and edges
- **Navigation**: Clicking a document node navigates to its wiki page

## Features

### Markdown Rendering

All documents are rendered using [goldmark](https://github.com/yuin/goldmark) with GitHub Flavored Markdown extensions:
- Tables
- Task lists
- Strikethrough
- Autolinks
- Mermaid fences (preserved for client-side rendering)

The renderer is initialized with unsafe HTML enabled to support Mermaid diagrams and custom styling:

```
`internal/serve/serve.go:89-97`
md: goldmark.New(
	goldmark.WithExtensions(extension.GFM), // tables, strikethrough, autolinks
	goldmark.WithRendererOptions(mdhtml.WithUnsafe()),
),
```

### Table of Contents

Documents containing `h2` or `h3` headings generate a table of contents rail (visible on screens ≥1240px width). The process:
1. Extracts heading elements via regex
2. Generates stable anchor IDs using `slugify()`
3. Deduplicates identical heading text with numeric suffixes
4. Builds nested TOC structure indicating heading level (2 or 3)

```
`internal/serve/serve.go:595-625`
func injectHeadingIDs(htmlBody string) (string, []tocEntry) {
	var toc []tocEntry
	seen := map[string]int{}
	out := headingRe.ReplaceAllStringFunc(htmlBody, func(m string) string {
		sub := headingRe.FindStringSubmatch(m)
		level := 2
		if sub[1] == "3" {
			level = 3
		}
		attrs := sub[2]
		inner := sub[3]
		if strings.Contains(attrs, "id=") {
			return m // already anchored
		}
		text := strings.TrimSpace(tagRe.ReplaceAllString(inner, ""))
		base := slugify(text)
		if base == "" {
			return m
		}
		// Deduplicate: the count is keyed on the base slug so a third identical
		// heading becomes "-2", not a collision with "-1".
		id := base
		if n := seen[base]; n > 0 {
			id = fmt.Sprintf("%s-%d", base, n)
		}
		seen[base]++
		toc = append(toc, tocEntry{id: id, text: text, level: level})
		return fmt.Sprintf(`<h%d%s id="%s">%s</h%d>`, level, attrs, id, inner, level)
	})
	return out, toc
}
```

```

<!-- kaioken:files internal/serve/serve.go,internal/serve/serve_test.go -->
