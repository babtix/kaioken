package research

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"kaioken/internal/search"
	"kaioken/internal/webfetch"
	"kaioken/internal/websearch"
)

// Retrieval is an interface, not a dependency: the same engine researches
// the open web and the user's own repository, and the paths above do not
// care which one a subtopic needs. Search returns ranked candidates; Fetch
// turns one candidate into a citable document.

// Hit is one search candidate.
type Hit struct {
	ID      string // URL, or repo-relative path
	Title   string
	Snippet string
	Score   float64
}

// Retriever answers searches and fetches documents for one backend.
type Retriever interface {
	Name() string
	Search(ctx context.Context, q string, k int) ([]Hit, error)
	Fetch(ctx context.Context, id string) (Document, error)
}

// ------------------------------------------------------------------- web

// WebRetriever reaches the open web: ranked hits from the configured search
// provider, page bodies from the configured fetcher. Search deliberately
// returns snippets only — full-content search modes would fetch pages nobody
// chose to read, and budgets stop being meaningful once fetching is
// automatic.
type WebRetriever struct {
	provider websearch.Provider
	fetcher  Fetcher
	store    *SourceStore
	meter    *Meter
}

// NewWebRetriever wires the web backend over the run's shared store and
// meter. fetcher left nil gets the SSRF-guarded default.
func NewWebRetriever(provider websearch.Provider, fetcher Fetcher, store *SourceStore, meter *Meter) *WebRetriever {
	if fetcher == nil {
		fetcher = webfetch.New()
	}
	return &WebRetriever{provider: provider, fetcher: fetcher, store: store, meter: meter}
}

func (w *WebRetriever) Name() string { return "web:" + w.provider.Name() }

// Search asks the provider for ranked hits and converts them.
func (w *WebRetriever) Search(ctx context.Context, q string, k int) ([]Hit, error) {
	results, err := w.provider.Search(ctx, q, k)
	if err != nil {
		return nil, err
	}
	if w.meter != nil {
		w.meter.AddSearches(1)
	}
	hits := make([]Hit, 0, len(results))
	for _, r := range results {
		hits = append(hits, Hit{
			ID: r.URL, Title: r.Title, Snippet: r.Snippet,
			Score: 1 / float64(max(1, r.Rank)),
		})
	}
	return hits, nil
}

// Fetch reads one page through the shared store: a document already held —
// under this URL or an identical-content one — comes back from cache without
// billing a fetch.
func (w *WebRetriever) Fetch(ctx context.Context, id string) (Document, error) {
	if doc, ok := w.store.Seen(id); ok {
		return doc, nil
	}
	if err := webfetch.ValidateURL(id); err != nil {
		return Document{}, err
	}
	pages, errs := w.fetcher.FetchMany(ctx, []string{id}, 1)
	if len(pages) == 0 {
		if err, ok := errs[id]; ok {
			return Document{}, err
		}
		return Document{}, fmt.Errorf("fetching %s: no page returned", id)
	}
	if w.meter != nil {
		w.meter.AddFetches(1)
	}
	p := pages[0]
	doc, _ := w.store.Put(p.URL, p.Title, p.Text, OriginWeb)
	return doc, nil
}

// ------------------------------------------------------------------- code

// codeFetchCap bounds how much of one file a worker may carry: a code
// document that arrives whole in a prompt is usually a sign the wrong file
// was fetched, and the budget says so out loud.
const codeFetchCap = 40000

// CodeRetriever researches the repository's generated knowledge — the same
// index that backs `kaioken search` — and reads the underlying files.
type CodeRetriever struct {
	repo string

	mu    sync.Mutex
	idx   *search.Index
	fails bool
}

// NewCodeRetriever binds the code backend to a repository root.
func NewCodeRetriever(repo string) *CodeRetriever {
	return &CodeRetriever{repo: repo}
}

func (c *CodeRetriever) Name() string { return "code" }

// index opens (or rebuilds) the knowledge index once per run. A repo with
// no generated knowledge has nothing to search; that is an empty result,
// not an error.
func (c *CodeRetriever) index() (*search.Index, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.idx != nil || c.fails {
		return c.idx, c.idx != nil
	}
	idx, err := search.Open(c.repo)
	if err != nil {
		c.fails = true
		return nil, false
	}
	c.idx = idx
	return idx, true
}

// Search ranks the knowledge index against the query.
func (c *CodeRetriever) Search(ctx context.Context, q string, k int) ([]Hit, error) {
	idx, ok := c.index()
	if !ok {
		return nil, nil
	}
	results, err := idx.Search(ctx, search.Query{Text: q, Limit: k})
	if err != nil {
		return nil, err
	}
	hits := make([]Hit, 0, len(results))
	for _, r := range results {
		hits = append(hits, Hit{
			ID: r.Path, Title: r.Title, Snippet: r.Snippet, Score: r.Score,
		})
	}
	return hits, nil
}

// Fetch reads one indexed document from the repository. The id may carry a
// trailing #Lstart-Lend; the span is advisory and the whole file arrives,
// capped.
func (c *CodeRetriever) Fetch(_ context.Context, id string) (Document, error) {
	path, _, _ := strings.Cut(id, "#")
	path = strings.TrimSpace(path)
	if path == "" {
		return Document{}, fmt.Errorf("empty code path")
	}
	// A knowledge-index path can never legitimately leave the repository:
	// absolute paths, drive letters and traversal are refused before the
	// file is touched, and the joined result is re-checked against the root.
	if filepath.IsAbs(path) || strings.HasPrefix(path, "..") {
		return Document{}, fmt.Errorf("code path %q is not repository-relative", path)
	}
	abs := filepath.Join(c.repo, filepath.FromSlash(path))
	if rel, err := filepath.Rel(c.repo, abs); err != nil || strings.HasPrefix(rel, "..") {
		return Document{}, fmt.Errorf("code path %q escapes the repository", path)
	}
	raw, err := os.ReadFile(abs)
	if err != nil {
		// The index may know the document under a wiki-relative path that
		// does not map straight onto a file; a miss reads as empty, not fatal.
		return Document{}, err
	}
	content := string(raw)
	if len(content) > codeFetchCap {
		content = content[:codeFetchCap] + "\n\n[truncated]"
	}
	title := filepath.Base(path)
	return Document{ID: path, Title: title, Content: sanitizeRetrieved(content), Origin: OriginCode}, nil
}

// ------------------------------------------------------------------- multi

// MultiRetriever fans one subtopic out to several backends and merges what
// comes back, for the hybrid tags. Fetch dispatches on the id's shape:
// http(s) ids belong to the web backend, everything else to code.
type MultiRetriever struct {
	web  Retriever
	code Retriever
}

// NewMultiRetriever combines the two backends. Either may be nil, in which
// case the other stands alone.
func NewMultiRetriever(web, code Retriever) *MultiRetriever {
	return &MultiRetriever{web: web, code: code}
}

func (m *MultiRetriever) Name() string { return "web+code" }

// Search runs both backends in parallel and interleaves their hits best
// first. A backend that fails loses the round, not the run.
func (m *MultiRetriever) Search(ctx context.Context, q string, k int) ([]Hit, error) {
	type result struct {
		hits []Hit
		err  error
	}
	ch := make(chan result, 2)
	for _, r := range []Retriever{m.web, m.code} {
		if r == nil {
			continue
		}
		r := r
		go func() {
			hits, err := r.Search(ctx, q, k)
			ch <- result{hits, err}
		}()
	}

	var all []Hit
	var firstErr error
	for i := 0; i < cap(ch); i++ {
		res := <-ch
		if res.err != nil && firstErr == nil {
			firstErr = res.err
			continue
		}
		all = append(all, res.hits...)
	}
	if len(all) == 0 && firstErr != nil {
		return nil, firstErr
	}
	// Merge by score, best first; a caller wanting per-backend provenance
	// reads it off the id shape.
	for i := 1; i < len(all); i++ {
		for j := i; j > 0 && all[j].Score > all[j-1].Score; j-- {
			all[j], all[j-1] = all[j-1], all[j]
		}
	}
	if len(all) > k {
		all = all[:k]
	}
	return all, nil
}

// Fetch routes to whichever backend owns the id.
func (m *MultiRetriever) Fetch(ctx context.Context, id string) (Document, error) {
	if strings.HasPrefix(id, "http://") || strings.HasPrefix(id, "https://") {
		if m.web == nil {
			return Document{}, fmt.Errorf("no web retriever configured")
		}
		return m.web.Fetch(ctx, id)
	}
	if m.code == nil {
		return Document{}, fmt.Errorf("no code retriever configured")
	}
	return m.code.Fetch(ctx, id)
}

// retrieversFor assembles the backend set a run works with. code is nil
// when the repo is empty or has no searchable knowledge base.
func retrieversFor(provider websearch.Provider, fetcher Fetcher, store *SourceStore, meter *Meter, repo string) (web, code, multi Retriever) {
	w := NewWebRetriever(provider, fetcher, store, meter)
	if repo != "" {
		code = NewCodeRetriever(repo)
	}
	return w, code, NewMultiRetriever(w, code)
}
