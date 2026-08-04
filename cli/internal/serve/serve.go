// Package serve renders a generated wiki as a browsable local site. Reading a
// two-thousand-line markdown chapter in an editor is rough; this gives it a
// collapsible sidebar tree, an in-page table of contents, working links, and
// search, without leaving the machine.
package serve

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	mdhtml "github.com/yuin/goldmark/renderer/html"

	"kaioken/internal/wiki"
)

// maxDocBytes caps a single rendered document.
const maxDocBytes = 4 << 20

// wordsPerMinute calibrates the reading-time estimate.
const wordsPerMinute = 220

// Section is one chapter directory and the documents inside it.
type Section struct {
	Name string
	Docs []Doc
}

// Doc is one markdown document.
type Doc struct {
	Title string
	Rel   string // slash path relative to the wiki root, e.g. "Architecture/Data Flow.md"
}

// Server renders a repository's wiki over HTTP.
type Server struct {
	repo string
	md   goldmark.Markdown
	// static switches the link scheme from server routes (/d/<rel>) to flat
	// relative .html slugs, and drops the server-only chrome (search, graph).
	// Set only by the static export path.
	static bool
}

// docHref returns the href for one wiki document: a server route in the
// default mode, a flat .html slug in static mode.
func (s *Server) docHref(rel string) string {
	if s.static {
		return staticHref(rel)
	}
	return "/d/" + rel
}

// homeHref returns the href of the overview page.
func (s *Server) homeHref() string {
	if s.static {
		return "index.html"
	}
	return "/"
}

// staticHref maps a wiki-relative doc path to its flat static filename:
// "Section/Doc Name.md" -> "section--doc-name.html". Slashes become a double
// dash so a section name and a doc name never blur into one slug.
func staticHref(rel string) string {
	rel = strings.TrimSuffix(rel, ".md")
	parts := strings.Split(rel, "/")
	for i, p := range parts {
		parts[i] = slugify(p)
	}
	return strings.Join(parts, "--") + ".html"
}

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

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/d/", s.handleDoc)
	mux.HandleFunc("/search", s.handleSearch)
	mux.HandleFunc("/graph", s.handleGraphPage)
	mux.HandleFunc("/graph.json", s.handleGraphJSON)
	return mux
}

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

// pageInfo carries everything the chrome needs to render one page.
type pageInfo struct {
	title    string
	current  string // slash-relative path of the active doc, "" when none
	bodyHTML string // fully rendered article HTML
	isIndex  bool
	modTime  time.Time
	words    int
}

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

// indexCards renders the chapter overview grid shown below the README.
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

// handleGraphJSON serves the same wiki.BuildGraph payload the daemon does at
// /v1/workspaces/{id}/wiki/graph — the same encoder on the same struct, so
// the two transports are byte-identical for the same repository.
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

// page renders fully-built article HTML inside the site chrome: sidebar tree,
// breadcrumbs, meta line, prev/next pager, and the table-of-contents rail.
// It writes plain HTML — callers own the transport headers.
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

func activeClass(on bool) string {
	if on {
		return ` class="active"`
	}
	return ""
}

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

// ---- headings / table of contents ----

type tocEntry struct {
	id    string
	text  string
	level int
}

var headingRe = regexp.MustCompile(`(?i)<h([23])(\s[^>]*)?>(.*?)</h[23]>`)
var tagRe = regexp.MustCompile(`<[^>]+>`)

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

func htmlEscape(s string) string { return html.EscapeString(s) }

// favicon is an inline SVG bolt in the brand color — no static assets needed.
const favicon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23d24317'/%3E%3Ctext x='16' y='23' font-size='18' text-anchor='middle' fill='white' font-family='sans-serif' font-weight='bold'%3EK%3C/text%3E%3C/svg%3E"

// scripts is the inline JS layer: sidebar filter, tree controls, scroll-spy,
// code copy buttons, back-to-top, and the "/" search shortcut. Everything is
// self-contained — no CDN required.
const scripts = `
<script>
(function () {
  var search = document.getElementById('nav-search');
  var tree = document.getElementById('tree');

  /* "/" focuses search from anywhere. */
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' &&
        document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      if (search) search.focus();
    }
  });

  /* Live sidebar filter: hide non-matching docs, expand matching sections. */
  if (search && tree) {
    search.addEventListener('input', function () {
      var q = search.value.trim().toLowerCase();
      var groups = tree.querySelectorAll('details.sec-group');
      for (var i = 0; i < groups.length; i++) {
        var g = groups[i], any = false;
        var links = g.querySelectorAll('.sec-docs a');
        for (var j = 0; j < links.length; j++) {
          var hit = !q || links[j].textContent.toLowerCase().indexOf(q) !== -1;
          links[j].style.display = hit ? '' : 'none';
          if (hit) any = true;
        }
        g.style.display = any ? '' : 'none';
        if (q) { g.open = any; }
      }
    });
  }

  /* Expand / collapse everything. */
  function setAll(open) {
    var groups = tree.querySelectorAll('details.sec-group');
    for (var i = 0; i < groups.length; i++) groups[i].open = open;
  }
  var ex = document.getElementById('expand-all');
  var co = document.getElementById('collapse-all');
  if (ex) ex.addEventListener('click', function () { setAll(true); });
  if (co) co.addEventListener('click', function () { setAll(false); });

  /* Scroll-spy for the table of contents. */
  var tocLinks = document.querySelectorAll('.toc a');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var byId = {};
    tocLinks.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          tocLinks.forEach(function (a) { a.classList.remove('on'); });
          var a = byId[en.target.id];
          if (a) a.classList.add('on');
        }
      });
    }, { rootMargin: '0px 0px -75% 0px' });
    document.querySelectorAll('article h2[id], article h3[id]').forEach(function (h) { spy.observe(h); });
  }

  /* Copy button on every code block. */
  document.querySelectorAll('article pre').forEach(function (pre) {
    if (pre.querySelector('.mermaid')) return;
    var btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = 'copy';
    btn.addEventListener('click', function () {
      var code = pre.querySelector('code');
      var text = (code || pre).innerText;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
      }
      btn.textContent = 'copied!';
      setTimeout(function () { btn.textContent = 'copy'; }, 1400);
    });
    pre.appendChild(btn);
  });

  /* Back to top. */
  var top = document.getElementById('to-top');
  if (top) {
    window.addEventListener('scroll', function () {
      top.classList.toggle('show', window.scrollY > 500);
    });
    top.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
})();
</script>`

// mermaidBootstrap upgrades fenced mermaid blocks into diagrams when the
// library is reachable. Offline the diagram source stays visible as code,
// which is still readable — so no CDN failure breaks the page.
const mermaidBootstrap = `
<script>
(function () {
  var blocks = document.querySelectorAll('pre > code.language-mermaid');
  if (!blocks.length) return;
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
  s.onload = function () {
    blocks.forEach(function (b) {
      var d = document.createElement('div');
      d.className = 'mermaid';
      d.textContent = b.textContent;
      b.parentElement.replaceWith(d);
    });
    window.mermaid.initialize({ startOnLoad: true, theme:
      matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default' });
    window.mermaid.run();
  };
  document.body.appendChild(s);
})();
</script>`

const styles = `
:root{--bg:#fff;--bg-side:#fafaf9;--fg:#1a1a1a;--dim:#666;--line:#e3e3e3;--accent:#d24317;
  --accent-soft:rgba(210,67,23,.09);--code:#f6f6f6;--mark:#ffe9a8;--shadow:0 2px 10px rgba(0,0,0,.06)}
@media (prefers-color-scheme:dark){
  :root{--bg:#131313;--bg-side:#0f0f0f;--fg:#e8e8e8;--dim:#999;--line:#2c2c2c;--accent:#ff7a45;
    --accent-soft:rgba(255,122,69,.12);--code:#1c1c1c;--mark:#7a5c10;--shadow:0 2px 10px rgba(0,0,0,.4)}
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;display:flex;background:var(--bg);color:var(--fg);
  font:16.5px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased}

/* ---- sidebar ---- */
aside{width:300px;flex:0 0 300px;height:100vh;overflow-y:auto;position:sticky;top:0;
  background:var(--bg-side);border-right:1px solid var(--line);padding:18px 0 32px}
.brand{display:flex;align-items:center;gap:8px;font-weight:800;letter-spacing:.16em;
  color:var(--accent);padding:2px 20px 14px;font-size:14px}
.brand-mark{font-size:15px}
.brand-sub{font-weight:500;letter-spacing:.05em;color:var(--dim);font-size:11px;text-transform:lowercase}
aside form{padding:0 16px 8px}
aside input{width:100%;padding:8px 11px;border:1px solid var(--line);border-radius:7px;
  background:var(--bg);color:var(--fg);font-size:13.5px;outline:none;transition:border-color .15s}
aside input:focus{border-color:var(--accent)}
.nav-tools{display:flex;gap:6px;padding:0 16px 10px}
.nav-tools button{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--dim);
  background:none;border:1px solid var(--line);border-radius:5px;padding:3px 8px;cursor:pointer}
.nav-tools button:hover{color:var(--accent);border-color:var(--accent)}
nav#tree{display:flex;flex-direction:column}
nav#tree a.home{padding:6px 20px;color:var(--fg);text-decoration:none;font-size:14px;font-weight:600;
  border-left:2px solid transparent}
nav#tree a.home:hover{background:var(--accent-soft)}
nav#tree a.home.active{border-left-color:var(--accent);color:var(--accent)}
details.sec-group{border-left:2px solid transparent}
details.sec-group.current{border-left-color:var(--accent)}
details.sec-group summary{display:flex;align-items:center;gap:7px;padding:9px 16px 9px 14px;
  cursor:pointer;user-select:none;list-style:none;font-size:11.5px;font-weight:700;
  text-transform:uppercase;letter-spacing:.08em;color:var(--dim);transition:color .15s}
details.sec-group summary::-webkit-details-marker{display:none}
details.sec-group summary:hover{color:var(--fg)}
.chev::before{content:"▸";display:inline-block;font-size:9px;transition:transform .15s}
details.sec-group[open]>summary .chev::before{transform:rotate(90deg)}
.sec-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.count{font-size:10px;font-weight:500;background:var(--code);border-radius:9px;padding:1px 7px;color:var(--dim)}
.sec-docs{display:flex;flex-direction:column;padding:2px 0 8px}
.sec-docs a{padding:4.5px 16px 4.5px 37px;color:var(--fg);text-decoration:none;font-size:13.5px;
  line-height:1.45;border-radius:0 6px 6px 0;margin-right:8px;transition:background .12s}
.sec-docs a:hover{background:var(--accent-soft)}
.sec-docs a.active{background:var(--accent-soft);color:var(--accent);font-weight:600}

/* ---- main content ---- */
main{flex:1;min-width:0;display:flex;justify-content:center;padding:44px 40px 110px}
article{width:100%;max-width:820px}
.crumbs{font-size:13px;color:var(--dim);margin-bottom:6px}
.crumbs a{color:var(--dim);text-decoration:none}
.crumbs a:hover{color:var(--accent)}
.crumbs .sep{margin:0 7px;opacity:.5}
.meta{font-size:12.5px;color:var(--dim);margin-bottom:26px}
.meta .dot{margin:0 8px;opacity:.5}
article h1,article h2,article h3,article h4{line-height:1.25;margin:1.7em 0 .6em;letter-spacing:-.01em}
article h1{margin-top:0;font-size:2.15em;font-weight:800}
article h2{font-size:1.55em;border-bottom:1px solid var(--line);padding-bottom:.3em}
article h3{font-size:1.22em}
article h2:hover .anchor,article h3:hover .anchor{opacity:1}
article a{color:var(--accent);text-decoration:none}
article a:hover{text-decoration:underline}
article p{margin:.85em 0}
article ul,article ol{padding-left:1.6em}
article li{margin:.25em 0}
article code{background:var(--code);padding:.15em .4em;border-radius:4px;font-size:.86em;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
article pre{position:relative;background:var(--code);padding:15px 17px;border-radius:9px;
  overflow-x:auto;border:1px solid var(--line)}
article pre code{background:none;padding:0;font-size:.85em;line-height:1.6}
.copy-btn{position:absolute;top:8px;right:8px;font-size:10.5px;color:var(--dim);background:var(--bg);
  border:1px solid var(--line);border-radius:5px;padding:3px 9px;cursor:pointer;opacity:0;transition:opacity .15s}
article pre:hover .copy-btn{opacity:1}
.copy-btn:hover{color:var(--accent);border-color:var(--accent)}
article table{border-collapse:collapse;margin:1.1em 0;display:block;overflow-x:auto;max-width:100%}
article th,article td{border:1px solid var(--line);padding:8px 12px;text-align:left;font-size:.92em}
article th{background:var(--code);font-weight:600}
article tr:nth-child(even) td{background:var(--accent-soft)}
article blockquote{margin:1.1em 0;padding:.6em 1.1em;border-left:3px solid var(--accent);
  background:var(--accent-soft);border-radius:0 7px 7px 0;color:var(--fg)}
article blockquote p{margin:.3em 0}
article img{max-width:100%;border-radius:8px}
article hr{border:none;border-top:1px solid var(--line);margin:2.2em 0}
mark{background:var(--mark);color:inherit;padding:.05em .2em;border-radius:3px}
.mermaid{background:var(--code);padding:16px;border-radius:8px;overflow-x:auto;text-align:center}

/* ---- prev / next pager ---- */
.pager{display:flex;gap:14px;margin-top:56px;padding-top:22px;border-top:1px solid var(--line)}
.pager a{flex:1;display:flex;flex-direction:column;gap:3px;padding:13px 16px;border:1px solid var(--line);
  border-radius:9px;text-decoration:none;transition:border-color .15s,transform .15s}
.pager a:hover{border-color:var(--accent);transform:translateY(-1px);text-decoration:none}
.pager-label{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--dim)}
.pager-title{font-size:14px;font-weight:600;color:var(--fg)}
.pager-next{text-align:right;align-items:flex-end}

/* ---- table of contents rail ---- */
.toc{display:none}
@media (min-width:1240px){
  .toc{display:block;flex:0 0 215px;position:sticky;top:44px;align-self:flex-start;
    max-height:calc(100vh - 88px);overflow-y:auto;font-size:12.5px;padding-left:22px;
    border-left:1px solid var(--line);margin-left:36px}
}
.toc-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;
  color:var(--dim);margin-bottom:9px}
.toc ul{list-style:none;margin:0;padding:0}
.toc li{margin:0}
.toc a{display:block;padding:3.5px 0;color:var(--dim);text-decoration:none;line-height:1.45;
  border-left:2px solid transparent;transition:color .12s}
.toc li.lvl3 a{padding-left:13px}
.toc a:hover{color:var(--fg)}
.toc a.on{color:var(--accent);font-weight:600}

/* ---- index cards ---- */
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:15px;margin-top:38px}
.card{display:block;padding:17px 19px;border:1px solid var(--line);border-radius:11px;
  text-decoration:none;color:var(--fg);background:var(--bg);
  transition:border-color .15s,transform .15s,box-shadow .15s}
.card:hover{border-color:var(--accent);transform:translateY(-2px);box-shadow:var(--shadow);text-decoration:none}
.card-name{font-weight:700;font-size:15px}
.card-count{font-size:11.5px;color:var(--dim);margin:3px 0 9px}
.card ul{list-style:none;margin:0;padding:0}
.card li{font-size:12.5px;color:var(--dim);padding:2.5px 0;border-top:1px dashed var(--line)}
.card li.more{font-style:italic;opacity:.75}

/* ---- search results ---- */
.result{margin:20px 0;padding:15px 18px;border:1px solid var(--line);border-radius:9px}
.result-title{font-weight:700;font-size:15.5px}
.result-sec{font-weight:400;font-size:13px;color:var(--dim)}
.result-matches{margin-top:9px}
.hit{font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  padding:3.5px 0;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hit-line{color:var(--accent);font-size:11px;margin-right:8px}
.hit-summary{font-size:13px;color:var(--dim);margin-top:24px}
.no-hits{color:var(--dim)}

/* ---- back to top ---- */
#to-top{position:fixed;right:26px;bottom:26px;width:40px;height:40px;border-radius:50%;
  border:1px solid var(--line);background:var(--bg-side);color:var(--dim);font-size:17px;
  cursor:pointer;opacity:0;pointer-events:none;transition:opacity .2s,color .15s,border-color .15s;z-index:9}
#to-top.show{opacity:1;pointer-events:auto}
#to-top:hover{color:var(--accent);border-color:var(--accent)}

/* ---- responsive ---- */
@media (max-width:860px){
  body{flex-direction:column}
  aside{width:100%;flex:none;height:auto;position:static;border-right:none;
    border-bottom:1px solid var(--line)}
  main{padding:26px 18px 72px}
  .pager{flex-direction:column}
}`

// graphStyles is the extra chrome for the full-bleed /graph page, on top of
// the shared styles so the palette and the prefers-color-scheme switch are
// exactly the ones the rest of the site uses.
const graphStyles = `
body.graph-page{display:block;height:100vh;overflow:hidden}
.graph-main{position:relative;width:100%;height:100vh}
#graph-canvas{display:block}
.graph-back{position:fixed;top:14px;left:16px;z-index:5;font-size:13px;color:var(--dim);
  text-decoration:none;background:var(--bg-side);border:1px solid var(--line);
  border-radius:7px;padding:6px 12px;box-shadow:var(--shadow)}
.graph-back:hover{color:var(--accent);border-color:var(--accent)}
.graph-bar{position:fixed;top:14px;right:16px;z-index:5;display:flex;gap:12px;align-items:center;
  background:var(--bg-side);border:1px solid var(--line);border-radius:9px;padding:7px 12px;
  font-size:12px;color:var(--dim);box-shadow:var(--shadow)}
.graph-bar label{display:flex;gap:4px;align-items:center;cursor:pointer;user-select:none}
.graph-bar input{accent-color:var(--accent)}
.graph-bar button{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--dim);
  background:none;border:1px solid var(--line);border-radius:5px;padding:3px 9px;cursor:pointer}
.graph-bar button:hover{color:var(--accent);border-color:var(--accent)}
#g-stats{font-size:11.5px}
#g-empty{display:none;position:absolute;inset:0;align-items:center;justify-content:center;
  color:var(--dim);font-size:14px}`

// graphBoot wires the embedded engine to the page: fetch the payload, read
// the palette off the CSS variables, and navigate on doc clicks.
const graphBoot = `
(function () {
  var canvas = document.getElementById('graph-canvas');
  var engine = new KaioGraph.GraphEngine();
  engine.mount(canvas);

  function colors() {
    var s = getComputedStyle(document.documentElement);
    var v = function (name, fb) { return (s.getPropertyValue(name).trim()) || fb; };
    return {
      background: 'transparent',
      doc: v('--accent', '#d24317'),
      file: v('--dim', '#666'),
      section: v('--dim', '#666'),
      edge: v('--line', '#e3e3e3'),
      label: v('--dim', '#666'),
      accent: v('--accent', '#d24317')
    };
  }
  engine.setColors(colors());
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    engine.setColors(colors());
  });

  engine.onSelect = function (node) {
    if (node.kind === 'doc' && node.rel) location.href = '/d/' + encodeURI(node.rel);
    /* file nodes are inert: no editor to open into */
  };

  var filters = { files: true, kinds: { contains: true, links: true, source: true } };
  function bind(id, apply) {
    var el = document.getElementById(id);
    el.addEventListener('change', function () { apply(el.checked); engine.setFilters(filters); });
  }
  bind('f-files', function (on) { filters.files = on; });
  bind('f-contains', function (on) { filters.kinds.contains = on; });
  bind('f-links', function (on) { filters.kinds.links = on; });
  bind('f-source', function (on) { filters.kinds.source = on; });
  document.getElementById('g-fit').addEventListener('click', function () { engine.fit(); });

  fetch('/graph.json').then(function (r) { return r.json(); }).then(function (g) {
    engine.setGraph(g);
    document.getElementById('g-stats').textContent =
      g.stats.docs + ' docs · ' + g.stats.files + ' files · ' + g.stats.edges + ' edges';
    if (!g.nodes.length) document.getElementById('g-empty').style.display = 'flex';
  });
})();`
