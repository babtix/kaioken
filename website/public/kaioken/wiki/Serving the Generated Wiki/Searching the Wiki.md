# Searching the Wiki

This chapter explains how the search functionality works when serving the generated wiki documentation via the local web server. It covers the search endpoint, query processing, result matching, highlighting, and the user interface for searching the wiki.

## Table of Contents
- [How Search Works](#how-search-works)
- [Search Algorithm](#search-algorithm)
- [Result Ranking and Display](#result-ranking-and-display)
- [User Interface](#user-interface)
- [Limitations](#limitations)
- [Referenced Files](#referenced-files)

## How Search Works

The search feature is implemented as an HTTP endpoint at `/search` handled by the `handleSearch` method in the `Server` struct. When a user submits a search query, the server:

1. Extracts the query parameter `q` from the URL
2. Performs a case-insensitive substring search across all lines of every markdown document in the wiki
3. Collects up to 5 matching lines per document
4. Highlights matching terms by wrapping them in `<mark>` tags
5. Renders results showing document links, section names, and highlighted snippets

The search operates on the raw markdown content as stored in the wiki directory (`<repo>/.kaioken/wiki/`), not the rendered HTML.

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

## Search Algorithm

The search algorithm performs a linear scan through all wiki documents:

1. **Document traversal**: Uses `s.sections()` to get the hierarchical structure (sections → documents) matching the sidebar navigation order
2. **Line-by-line matching**: For each document, splits content into lines and checks if the lowercase line contains the lowercase query string
3. **Match collection**: Collects up to 5 matching lines per document to limit result size
4. **Highlighting**: Uses `highlightHTML` to wrap query matches in `<mark>` tags after HTML-escaping the entire line

The `highlightHTML` function implements case-insensitive highlighting:

`internal/serve/serve.go:307-328`
```go
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

## Result Ranking and Display

Results are presented in a specific order determined by the wiki's section structure:

1. **Section order**: Sections appear in the order returned by `os.ReadDir` (typically filesystem order)
2. **Document order within sections**: 
   - The document matching the section name (e.g., `Getting Started.md` in `Getting Started` section) appears first
   - Remaining documents are sorted alphabetically by title
3. **Match order within documents**: Matches appear in the order they occur in the file (line by line)

Each result displays:
- A link to the document (`/d/<section>/<document>.md`)
- The document title
- The section name in smaller text
- Up to 5 highlighted snippets, each showing:
  - Line number (e.g., "line 42")
  - The matching line with query terms wrapped in `<mark>` tags

After all results, a summary shows:
- Total number of matching lines across all documents
- Number of documents containing at least one match

If no matches are found, a "No matches." message is displayed.

## User Interface

The search interface consists of two components:

### Persistent Search Box
Every wiki page includes a search form in the sidebar:
```html
<form action="/search"><input id="nav-search" name="q" placeholder="search… ( / )" autocomplete="off"></form>
```
- Located in the sidebar beneath the Kaioken branding
- Submits to `/search` via GET when Enter is pressed
- Placeholder text indicates the keyboard shortcut for focus

### Search Shortcut
Pressing `/` anywhere in the interface (except when focused in a textarea) focuses the search box:
```javascript
document.addEventListener('keydown', function (e) {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT' &&
      document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    if (search) search.focus();
  }
});
```

### Search Results Page
When submitting a non-empty query:
- Displays "Search: [query]" as the page title
- Shows each matching document as a result card with:
  * Document title linked to the document
  * Section name in smaller text
  * Up to 5 highlighted snippets with line numbers
- Shows a summary line: "[X] match(es) across [Y] document(s)"
- If no results: displays "No matches."

The results page uses the standard wiki page layout with sidebar navigation, breadcrumbs, and table of contents rail (when applicable).

## Limitations

The current search implementation has several constraints:

1. **Simple substring matching**: 
   - No stemming, fuzzy matching, or relevance scoring
   - Matches require exact character sequences (case-insensitive)
   - No support for boolean operators (AND/OR) or quoted phrases

2. **Result limits**:
   - Maximum 5 matching lines displayed per document
   - No pagination for results beyond the first 5 lines per document

3. **Indexing**:
   - No persistent search index; searches scan all documents on each request
   - Performance may degrade with very large wikis (though capped by `maxDocBytes` per document)

4. **Content scope**:
   - Only searches `.md` files in the wiki directory
   - Does not search generated assets, code snippets, or metadata
   - Excludes non-markdown files and directories

Despite these limitations, the search provides adequate functionality for navigating typical generated wikis, which tend to be moderately sized and structured with clear section organization.

## Referenced Files
- internal/serve/serve.go (lines 253-303, 307-328)

<!-- kaioken:files internal/serve/serve.go -->
