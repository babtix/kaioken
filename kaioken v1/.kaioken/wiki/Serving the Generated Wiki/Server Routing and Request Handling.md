# Server Routing and Request Handling

This chapter describes how the Kaioken wiki server serves generated documentation via HTTP endpoints. It covers the three routes (`/`, `/d/`, and `/search`), their request processing flows, and the supporting functions that render content, build navigation, and handle search.

## Table of Contents
- [Architecture Overview](#architecture-overview)
- [Index Endpoint (`/`)](#index-endpoint-)
- [Documentation Endpoint (`/d/`)](#documentation-endpoint-d)
- [Search Endpoint (`/search`)](#search-endpoint-search)
- [Supporting Functions](#supporting-functions)
- [Request Flow Diagrams](#request-flow-diagrams)
- [Referenced Files](#referenced-files)

## Architecture Overview

The wiki server is implemented in `internal/serve/serve.go`. It uses the `goldmark` Markdown renderer to convert `.md` files to HTML and serves them within a consistent HTML template that includes a sidebar navigation, breadcrumbs, and search functionality.

The `Server` struct holds the repository path and a pre-configured Markdown renderer:

```go
// Server renders a repository's wiki over HTTP.
type Server struct {
	repo string
	md   goldmark.Markdown
}
```

The `New` function initializes the server with GitHub Flavored Markdown support:

`internal/serve/serve.go:54-62`
```go
// New builds a server for a repository.
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

The `Run` function starts the HTTP server, binding to the provided address and invoking the `ready` callback with the bound URL:

`internal/serve/serve.go:67-92`
```go
// Run serves the wiki until ctx is cancelled. It returns the address actually
// bound, via the ready callback, so a caller can print a working URL even when
// port 0 was requested.
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

The `routes` method registers three handlers:

`internal/serve/serve.go:94-100`
```go
func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/d/", s.handleDoc)
	mux.HandleFunc("/search", s.handleSearch)
	return mux
}
```

## Index Endpoint (`/`)

The root endpoint (`/`) serves the wiki overview page. It optionally displays a `README.md` file from the wiki root and renders a grid of section cards linking to each documentation chapter.

### Request Handling

`handleIndex` checks for an exact path match to `/`, then attempts to read `README.md`:

`internal/serve/serve.go:172-191`
```go
func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	body := "# Repository Wiki\n\nPick a chapter from the sidebar.\n"
	if raw, err := os.ReadFile(filepath.Join(wiki.WikiDir(s.repo), "README.md")); err == nil {
		body = string(raw)
	}
	var content bytes.Buffer
	if err := s.md.Convert([]byte(body), &content); err != nil {
		http.Error(w, "render error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	s.page(w, pageInfo{
		title:    "Wiki",
		bodyHTML: content.String() + s.indexCards(),
		isIndex:  true,
	})
}
```

If `README.md` exists, its content is converted to HTML and combined with the output of `indexCards()` (which generates the section grid). The combined HTML is passed to the `page` function for full template rendering.

### Section Card Generation

`indexCards` builds the navigation grid by iterating over sections returned from `sections()`:

`internal/serve/serve.go:194-218`
```go
func (s *Server) indexCards() string {
	secs := s.sections()
	if len(secs) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString(`<div class="cards">`)
	for _, sec := range secs {
		fmt.Fprintf(&b, `<a class="card" href="/d/%s"><div class="card-name">%s</div>`,
			htmlEscape(sec.Docs[0].Rel), htmlEscape(sec.Name))
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

For each section, it links to the first document (typically the section's main document) and lists up to three document titles, with a "more" indicator if there are additional documents.

## Documentation Endpoint (`/d/`)

The `/d/` endpoint serves individual documentation pages. It expects a wiki-relative path (e.g., `Architecture/Data Flow.md`) and renders the corresponding Markdown file as HTML within the full page template.

### Request Handling

`handleDoc` extracts the path prefix, resolves it to an absolute filesystem path, reads and truncates the file (to `maxDocBytes`), converts it to HTML, and builds a `pageInfo`:

`internal/serve/serve.go:220-251`
```go
func (s *Server) handleDoc(w http.ResponseWriter, r *http.Request) {
	rel := strings.TrimPrefix(r.URL.Path, "/d/")
	abs, err := s.resolve(rel)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	raw, err := os.ReadFile(abs)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if len(raw) > maxDocBytes {
		raw = raw[:maxDocBytes]
	}
	var content bytes.Buffer
	if err := s.md.Convert(raw, &content); err != nil {
		http.Error(w, "render error: "+err.Error(), http.StatusInternalServerError)
		return
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
}
```

The `resolve` function ensures the requested path stays within the wiki directory:

`internal/serve/serve.go:147-160`
```go
// resolve maps a wiki-relative path to an absolute one, refusing escapes.
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

## Search Endpoint (`/search`)

The `/search` endpoint handles full-text search across all documentation files. It accepts a query parameter `q` and returns matching documents with highlighted snippets.

### Request Handling

`handleSearch` processes the query, searches each document line-by-line for case-insensitive matches, and builds a results page:

`internal/serve/serve.go:253-303`
```go
func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
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
				htmlEscape(doc.Rel), htmlEscape), htmlEscape(doc.Title), htmlEscape(doc.Title), htmlEscape(sec.Name),
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

For each matching line, `highlightHTML` wraps the search term in `<mark>` tags after escaping HTML:

`internal/serve/serve.go:307-328`
```go
// highlightHTML escapes a line and wraps case-insensitive needle matches in
// <mark> tags for the search results page.
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

## Supporting Functions

Several functions support the handlers by providing navigation, page rendering, and utility features.

### Section Tree Construction

`sections` walks the wiki directory to build a hierarchical navigation structure:

`internal/serve/serve.go:103-144`
```go
// sections walks the wiki directory into a nav tree.
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

Each section's documents are sorted so that the document matching the section name appears first, followed by alphabetical ordering.

### Page Rendering

`page` assembles the full HTML response, including sidebar navigation, breadcrumbs, metadata, previous/next navigation, and table of contents:

`internal/serve/serve.go:332-437`
```go
// page renders fully-built article HTML inside the site chrome: sidebar tree,
// breadcrumbs, meta line, prev/next pager, and the table-of-contents rail.
func (s *Server) page(w http.ResponseWriter, info pageInfo) {
	// ... (omitted for brevity; see source for full implementation)
}
```

Key steps include:
1. Extracting the first `<h1>` for breadcrumb placement.
2. Generating heading anchors and table of contents via `injectHeadingIDs`.
3. Building breadcrumbs and metadata (read time, last updated).
4. Computing previous/next document links via `neighbors`.
5. Rendering the sidebar tree with section groups and documents.
6. Injecting CSS and JavaScript constants (`styles`, `scripts`, `mermaidBootstrap`, `favicon`).

### Navigation Helpers

`neighbors` computes the previous and next documents in reading order:

`internal/serve/serve.go:447-464`
```go
// neighbors returns the docs before and after rel in reading order.
func neighbors(secs []Section, rel string) (prev, next *Doc) {
	var flat []Doc
	for _, sec := range secs {
		flat = append(flat, sec.Docs...)
	}
	for i := range flat {
		if flat[i].Rel == rel {
			if i > 0 {
				prev = &flat[i-1]
			}
			if i+1 < len(flat) {
				next = &flat[i+1]
			}
			return
		}
	}
	return
}
```

`humanDate` formats timestamps for the metadata line:

`internal/serve/serve.go:466-478`
```go
func humanDate(t time.Time) string {
	d := time.Since(t)
	switch {
	case d < time.Hour:
		return "just now"
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	case d < 7*24*time.Hour:
		return fmt.Sprintf("%dd ago", int(d.Hours()/24))
	default:
		return t.Format("Jan 2, 2006")
	}
}
```

### HTML Utilities

`injectHeadingIDs` adds stable IDs to `<h2>` and `<h3>` elements for table of contents linking:

`internal/serve/serve.go:493-523`
```go
// injectHeadingIDs adds stable id attributes to h2/h3 elements and returns the
// rewritten HTML plus a table of contents built from them.
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

`slugify` converts heading text to URL-safe anchor IDs:

`internal/serve/serve.go:526-543`
```go
// slugify turns heading text into a URL-safe anchor id.
func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	lastDash := false
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z' || r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		case r == ' ' || r == '-' || r == '_' || r == '.':
			if !lastDash && b.Len() > 0 {
				b.WriteRune('-')
				lastDash = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}
```

## Request Flow Diagrams

### Index Request Flow
```mermaid
sequenceDiagram
    participant Client
    participant Server
    participant Filesystem
    Client->>Server: GET /
    Server->>Filesystem: Read wiki/WikiDir/repo/README.md
    alt README exists
        Filesystem-->>Server: README content
    else
        Server->>Server: Use default wiki title
    end
    Server->>Server: Convert README to HTML (goldmark)
    Server->>Server: Generate section cards (sections() + indexCards())
    Server->>Server: Combine content and render full page (page())
    Server-->>Client: HTML response
```

### Document Request Flow
```mermaid
sequenceDiagram
    participant Client
    participant Server
    participant Filesystem
    Client->>Server: GET /d/Architecture/Data Flow.md
    Server->>Server: Extract rel = "Architecture/Data Flow.md"
    Server->>Filesystem: resolve(rel) → absolute path
    alt Path invalid or outside wiki
        Server-->>Client: 404 Not Found
    else
        Filesystem-->>Server: File content
        Server->>Server: Truncate to maxDocBytes if needed
        Server->>Server: Convert to HTML (goldmark)
        Server->>Server: Build pageInfo (title, words, modTime)
        Server->>Server: Render full page (page())
        Server-->>Client: HTML response
    end
```

### Search Request Flow
```mermaid
sequenceDiagram
    participant Client
    participant Server
    participant Filesystem
    Client->>Server: GET /search?q=term
    Server->>Server: Extract query q = "term"
    alt q empty
        Server->>Server: Show empty search prompt
        Server->>Server: Render full page (page())
        Server-->>Client: HTML response
    else
        Server->>Server: sections() → list of sections/docs
        loop For each document
            Server->>Filesystem: Read document
            alt Read success
                Filesystem-->>Server: File content
                Server->>Server: Scan lines for case-insensitive matches
                Server->>Server: For each match, generate highlighted snippet
            else
                Server->>Server: Skip document
            end
        end
        Server->>Server: Build results HTML with hits and snippets
        Server->>Server: Render full page (page())
        Server-->>Client: HTML response
    end
```

## Referenced Files
- `internal/serve/serve.go` (primary implementation)

<!-- kaioken:files internal/serve/serve.go -->
