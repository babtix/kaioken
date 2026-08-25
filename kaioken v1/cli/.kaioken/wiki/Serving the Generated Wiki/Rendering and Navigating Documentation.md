# Rendering and Navigating Documentation

## Table of Contents
- [Overview](#overview)
- [Server Setup and Routing](#server-setup-and-routing)
- [Markdown Processing Pipeline](#markdown-processing-pipeline)
- [Navigation Structure](#navigation-structure)
- [Document Page Composition](#document-page-composition)
- [Table of Contents Generation](#table-of-contents-generation)
- [Search Functionality](#search-functionality)
- [Client-Side Enhancements](#client-side-enhancements)
- [Referenced Files](#referenced-files)

## Overview
The `serve` package converts generated markdown documentation into an interactive HTML site with features including:
- Markdown-to-HTML rendering with GitHub Flavored Markdown support
- Collapsible sidebar navigation showing document hierarchy
- Breadcrumbs and contextual metadata (reading time, last updated)
- Automatic table of contents from H2/H3 headings
- Previous/next document navigation in reading order
- Full-text search with hit highlighting
- Syntax highlighting via client-side JavaScript
- Responsive design with dark/light theme support
- Mermaid diagram rendering
- Interactive knowledge graph visualization (with filtering and navigation)

## Server Setup and Routing
The HTTP server is initialized via `New` and started with `Run`. It defines five routes for wiki navigation:

| Method | Path   | Handler         | Purpose                              |
|--------|--------|-----------------|--------------------------------------|
| GET    | /      | `handleIndex`   | Wiki overview with README and section cards |
| GET    | /d/    | `handleDoc`     | Individual documentation page        |
| GET    | /search| `handleSearch`  | Search results page                  |
| GET    | /graph | `handleGraphPage`| Interactive knowledge graph view     |
| GET    | /graph.json| `handleGraphJSON`| Graph data in JSON format          |

### Server Initialization
`internal/serve/serve.go:89-97`
```go
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
Creates a server instance with:
- Repository path for locating wiki files
- Goldmark markdown processor configured with:
  - GFM extension (tables, strikethrough, autolinks)
  - Unsafe HTML rendering (allows raw HTML in markdown output)

`internal/serve/serve.go:102-127`
```go
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
Startup sequence:
1. Validates wiki directory exists via `wiki.WikiDir(repo)`
2. Binds TCP listener on specified address
3. Configures HTTP server with:
   - Handler from `routes()`
   - 10-second read header timeout
4. Invokes `ready` callback with bound URL (for port 0 assignment)
5. Sets up graceful shutdown on context cancellation
6. Starts server and returns error (unless normal shutdown)

## Markdown Processing Pipeline
Markdown files are converted to HTML through a standardized pipeline:

1. **File Reading**
   - `handleDoc` reads absolute path from `resolve(rel)`
   - Truncates to `maxDocBytes` (4MB) to prevent OOM
   ```go
   if len(raw) > maxDocBytes {
       raw = raw[:maxDocBytes]
   }
   ```

2. **Markdown Conversion**
   - Uses pre-configured `goldmark.Markdown` instance
   ```go
   var content bytes.Buffer
   if err := s.md.Convert(raw, &content); err != nil {
       http.Error(w, "render error: "+err.Error(), http.StatusInternalServerError)
       return
   }
   ```

3. **Content Post-Processing**
   - Splits first H1 for breadcrumb placement (`handleDoc`/`handleIndex`)
   - Generates table of contents via `injectHeadingIDs`
   - Calculates reading time (`wordsPerMinute` = 220 WPM)
   - Formats modification time via `humanDate`

## Navigation Structure
The wiki's hierarchical organization is derived from filesystem layout:

`internal/serve/serve.go:140-181`
```go
func (s *Server) sections() []Section {
	root := wiki.WikiDir(s.repo)
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil
	}
	var out []Section
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		docs, err := os.ReadDir(filepath.Join(root, e.Name()))
		if err != nil {
			continue
		}
		sec := Section{Name: e.Name()}
		for _, d := range docs {
			if d.IsDir() || !strings.HasSuffix(d.Name(), ".md") {
				continue
			}
			sec.Docs = append(sec.Docs, Doc{
				Title: strings.TrimSuffix(d.Name(), ".md"),
				Rel:   e.Name() + "/" + d.Name(),
			})
		}
		if len(sec.Docs) == 0 {
			continue
		}
		// The chapter's own document leads; the rest follow alphabetically.
		sort.Slice(sec.Docs, func(i, j int) bool {
			if sec.Docs[i].Title == sec.Name {
				return true
			}
			if sec.Docs[j].Title == sec.Name {
				return false
			}
			return sec.Docs[i].Title < sec.Docs[j].Title
		})
		out = append(out, sec)
	}
	return out
}
```
Creates navigation tree where:
- Top-level sections = wiki subdirectories
- Documents = `.md` files within sections
- Sorting rules:
  - Section's "lead" document (matching section name) appears first
  - Remaining documents sorted alphabetically by title
- Empty sections are omitted

## Document Page Composition
The `page` function assembles complete HTML documents:

`internal/serve/serve.go:426-539`
```go
func (s *Server) page(w io.Writer, info pageInfo) {
	secs := s.sections()

	// Split out the first H1 so the breadcrumb + meta line can sit above it.
	bodyHTML := info.bodyHTML
	var h1 string
	if i := strings.Index(bodyHTML, "</h1>"); i != -1 {
		h1 = bodyHTML[:i+5]
		bodyHTML = bodyHTML[i+5:]
	}

	// Heading anchors + table of contents from h2/h3.
	bodyHTML, toc := injectHeadingIDs(bodyHTML)

	// Breadcrumbs and the doc meta line.
	var crumb, meta string
	if info.current != "" {
		parts := strings.SplitN(info.current, "/", 2)
		secName, docTitle := parts[0], info.title
		if len(parts) == 2 && strings.TrimSuffix(parts[1], ".md") == parts[0] {
			docTitle = "" // the chapter lead doc — the section crumb is enough
		}
		crumb = fmt.Sprintf(`<nav class="crumbs"><a href="%s">Wiki</a><span class="sep">/</span><span>%s</span>`, s.homeHref(), htmlEscape(secName))
		if docTitle != "" {
			crumb += fmt.Sprintf(`<span class="sep">/</span><span>%s</span>`, htmlEscape(docTitle))
		}
		crumb += `</nav>`

		var bits []string
		if info.words > 0 {
			mins := info.words / wordsPerMinute
			if mins < 1 {
				mins = 1
			}
			bits = append(bits, fmt.Sprintf("~%d min read", mins))
		}
		if !info.modTime.IsZero() {
			bits = append(bits, "updated "+humanDate(info.modTime))
		}
		if len(bits) > 0 {
			meta = `<div class="meta">` + strings.Join(bits, `<span class="dot">·</span>`) + `</div>`
		}
	}

	// Prev / next pager across the flattened reading order.
	var pager string
	if info.current != "" {
		prev, next := neighbors(secs, info.current)
		pager = `<nav class="pager">`
		if prev != nil {
			pager += fmt.Sprintf(`<a class="pager-prev" href="%s"><span class="pager-label">← Previous</span><span class="pager-title">%s</span></a>`,
				htmlEscape(s.docHref(prev.Rel)), htmlEscape(prev.Title))
		} else {
			pager += `<span></span>`
		}
		if next != nil {
			pager += fmt.Sprintf(`<a class="pager-next" href="%s"><span class="pager-label">Next →</span><span class="pager-title">%s</span></a>`,
				htmlEscape(s.docHref(next.Rel)), htmlEscape(next.Title))
		}
		pager += `</nav>`
	}

	// TOC rail (only when there is enough structure to navigate).
	var tocHTML string
	if len(toc) >= 2 {
		var tb strings.Builder
		tb.WriteString(`<nav class="toc"><div class="toc-title">On this page</div><ul>`)
		for _, e := range toc {
			fmt.Fprintf(&tb, `<li class="lvl%d"><a href="#%s">%s</a></li>`, e.level, e.id, e.text)
		}
		tb.WriteString(`</ul></nav>`)
		tocHTML = tb.String()
	}

	// Search and the graph view only exist on the HTTP server; a static
	// export drops both rather than shipping dead links.
	searchForm := `<form action="/search"><input id="nav-search" name="q" placeholder="search… ( / )" autocomplete="off"></form>`
	if s.static {
		searchForm = ""
	}
	fmt.Fprintf(w, `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>%s · Kaioken Wiki</title><link rel="icon" href="%s"><style>%s</style></head><body>
<aside id="sidebar"><div class="brand"><span class="brand-mark">⚡</span>KAIOKEN<span class="brand-sub">wiki</span></div>
%s
<div class="nav-tools"><button type="button" id="expand-all">expand</button><button type="button" id="collapse-all">collapse</button></div>
<nav id="tree">`, htmlEscape(info.title), favicon, styles, searchForm)

	homeClass := "home"
	if info.isIndex {
		homeClass += " active"
	}
	fmt.Fprintf(w, `<a class="%s" href="%s">⌂ Overview</a>`, homeClass, s.homeHref())
	if !s.static {
		fmt.Fprintf(w, `<a class="home" href="/graph">◈ Graph</a>`)
	}
	for _, sec := range secs {
		open, active := "", ""
		if strings.HasPrefix(info.current, sec.Name+"/") {
			open, active = " open", " current"
		}
		fmt.Fprintf(w, `<details class="sec-group"%s><summary class="%s"><span class="chev"></span><span class="sec-name">%s</span><span class="count">%d</span></summary><div class="sec-docs">`,
			open, strings.TrimSpace(active), htmlEscape(sec.Name), len(sec.Docs))
		for _, doc := range sec.Docs {
			fmt.Fprintf(w, `<a href="%s"%s>%s</a>`,
				htmlEscape(s.docHref(doc.Rel)), activeClass(doc.Rel == info.current), htmlEscape(doc.Title))
		}
		fmt.Fprintf(w, `</div></details>`)
	}
	fmt.Fprintf(w, `</nav></aside>
<main><article>%s%s%s%s%s</article>%s</main>
<button id="to-top" title="Back to top" aria-label="Back to top">↑</button>%s%s</body></html>`,
		crumb, meta, h1, bodyHTML, pager, tocHTML, scripts, mermaidBootstrap)
}
```
Key composition elements:
1. **H1 Separation**: Extracts first H1 to position breadcrumbs above main heading
2. **Table of Contents**: Generated from H2/H3 headings via `injectHeadingIDs`
3. **Breadcrumbs**: Shows Wiki → Section → Document hierarchy
4. **Meta Line**: Displays reading time and last updated timestamp
5. **Prev/Pager**: Navigation links based on flattened reading order
6. **TOC Rail**: Conditional sidebar shown when ≥2 headings exist
7. **Sidebar Tree**: Collapsible section/document list with active highlighting
8. **Search Box**: Global `/` keyboard shortcut activation (omitted in static exports)
9. **Expand/Collapse Controls**: Sidebar section toggles
10. **Graph Link**: Navigation to interactive knowledge view (omitted in static exports)
11. **Back-to-Top Button**: Appears after 500px scroll

## Table of Contents Generation
TOC creation involves heading processing and ID generation:

`internal/serve/serve.go:595-625`
```go
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
Process:
1. Matches H2/H3 tags via regex `(?i)<h([23])(\s[^>]*)?>(.*?)</h[23]>`
2. For headings without existing `id`:
   - Strips inner HTML tags via `tagRe`
   - Generates base ID with `slugify`
   - Resolves duplicates by appending `-n` where `n` is occurrence count
   - Rebuilds heading with new ID attribute
3. Returns rewritten HTML and TOC entries

## Search Functionality
The search endpoint indexes document content on-demand:

`internal/serve/serve.go:307-358`
```go
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
		b.WriteString(`<p class="no-hits">No matches.</p>`
	} else {
		fmt.Fprintf(&b, `<p class="hit-summary">%d match(es) across %d document(s)</p>`, total, hits)
	}
	s.page(w, pageInfo{title: "Search", bodyHTML: b.String()})
}
```
Features:
- Case-insensitive substring matching
- Per-document hit limiting (5 matches/doc)
- Result highlighting with `<mark>` tags
- Hit summary statistics
- Fallback message for no results

## Client-Side Enhancements
The served wiki includes self-contained JavaScript for:
- Live sidebar filtering as you type
- Keyboard shortcut (`/`) to focus search
- Section expand/collapse controls
- Scroll-activated table of contents highlighting
- Code block copy-to-clipboard buttons
- Smooth scroll back-to-top button
- Mermaid diagram rendering (CDN-loaded with offline fallback)
- Responsive layout (mobile sidebar → top bar)

## Referenced Files
- internal/serve/serve.go

<!-- kaioken:files internal/serve/serve.go -->
