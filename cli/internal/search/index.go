package search

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"kaioken/internal/config"
)

// Index is a searchable snapshot of a repository's generated knowledge.
type Index struct {
	Repo   string  `json:"repo"`
	Docs   []Doc   `json:"docs"`
	Chunks []Chunk `json:"chunks"`

	// Fingerprint is the corpus state this was built from; a mismatch means
	// rebuild.
	Fingerprint string `json:"fingerprint"`

	// EmbedModel identifies the vector space. Vectors from a different model
	// are not comparable, so a change discards them.
	EmbedModel string `json:"embed_model,omitempty"`
	// Vectors is parallel to Chunks. Entries may be nil when embedding was
	// disabled or a batch failed — search handles a partially-embedded index.
	Vectors [][]float32 `json:"vectors,omitempty"`

	lx   *lexicon
	once sync.Once
}

// Result is one ranked hit.
type Result struct {
	Path    string  `json:"path"`
	Kind    Kind    `json:"kind"`
	Section string  `json:"section"`
	Title   string  `json:"title"`
	Heading string  `json:"heading"`
	Line    int     `json:"line"`
	Snippet string  `json:"snippet"`
	Score   float64 `json:"score"`
	// Lexical and Semantic expose the two component ranks, which is what makes
	// a surprising result explainable instead of magic.
	Lexical  float64 `json:"lexical"`
	Semantic float64 `json:"semantic,omitempty"`
}

// Query narrows a search.
type Query struct {
	Text string
	// Kinds restricts to wiki/card/skill; empty means all.
	Kinds []Kind
	// Section restricts to one wiki section or module id.
	Section string
	Limit   int
	// Embedder, when set, adds the semantic half. Callers that want a purely
	// offline search leave it nil.
	Embedder Embedder
}

func indexPath(repo string) string {
	return filepath.Join(repo, config.Dir, "search_index.json")
}

// Open loads the persisted index for a repo, rebuilding the lexical part when
// the corpus changed. It never calls an embedding endpoint: adding vectors is
// Build's job, so a search stays fast and offline-safe.
func Open(repo string) (*Index, error) {
	fp := corpusFingerprint(repo)

	if idx, err := load(repo); err == nil && idx.Fingerprint == fp {
		idx.Repo = repo
		return idx, nil
	}

	// Stale or missing: rebuild the text side now and keep whatever vectors
	// still match by content hash, so an incremental wiki update does not cost
	// a full re-embed on the next search.
	idx, err := build(repo, fp)
	if err != nil {
		return nil, err
	}
	if old, err := load(repo); err == nil {
		idx.reuseVectors(old)
	}
	// Persisting here is best-effort: a read-only checkout should still search.
	_ = idx.save()
	return idx, nil
}

// Build refreshes the index and computes any missing embeddings. This is the
// expensive path, called from `kaioken index` and after a wiki generation —
// not from a query.
func Build(ctx context.Context, repo string, emb Embedder, progress func(done, total int)) (*Index, error) {
	fp := corpusFingerprint(repo)
	idx, err := build(repo, fp)
	if err != nil {
		return nil, err
	}
	if old, lerr := load(repo); lerr == nil {
		idx.reuseVectors(old)
	}

	if emb != nil {
		if err := idx.embedMissing(ctx, emb, progress); err != nil {
			// A failed embed still leaves a usable lexical index; surface the
			// error but persist what we have.
			_ = idx.save()
			return idx, err
		}
	}
	if err := idx.save(); err != nil {
		return idx, err
	}
	return idx, nil
}

func build(repo, fingerprint string) (*Index, error) {
	docs, chunks, err := collect(repo)
	if err != nil {
		return nil, err
	}
	return &Index{
		Repo:        repo,
		Docs:        docs,
		Chunks:      chunks,
		Fingerprint: fingerprint,
	}, nil
}

// reuseVectors carries embeddings across a rebuild by content hash, so only
// genuinely new or edited passages get re-embedded.
func (ix *Index) reuseVectors(old *Index) {
	if old == nil || len(old.Vectors) == 0 || old.EmbedModel == "" {
		return
	}
	byHash := make(map[string][]float32, len(old.Chunks))
	for i, c := range old.Chunks {
		if i < len(old.Vectors) && old.Vectors[i] != nil {
			byHash[c.Hash] = old.Vectors[i]
		}
	}
	vecs := make([][]float32, len(ix.Chunks))
	hits := 0
	for i, c := range ix.Chunks {
		if v, ok := byHash[c.Hash]; ok {
			vecs[i] = v
			hits++
		}
	}
	if hits > 0 {
		ix.Vectors = vecs
		ix.EmbedModel = old.EmbedModel
	}
}

// embedMissing fills in vectors for chunks that have none.
func (ix *Index) embedMissing(ctx context.Context, emb Embedder, progress func(done, total int)) error {
	if emb.ID() != ix.EmbedModel {
		// Different model, different space — nothing carries over.
		ix.Vectors = nil
		ix.EmbedModel = emb.ID()
	}
	if len(ix.Vectors) != len(ix.Chunks) {
		grown := make([][]float32, len(ix.Chunks))
		copy(grown, ix.Vectors)
		ix.Vectors = grown
	}

	var todo []int
	for i := range ix.Chunks {
		if ix.Vectors[i] == nil {
			todo = append(todo, i)
		}
	}
	if len(todo) == 0 {
		return nil
	}

	done := 0
	for start := 0; start < len(todo); start += embedBatch {
		end := start + embedBatch
		if end > len(todo) {
			end = len(todo)
		}
		batch := todo[start:end]
		texts := make([]string, len(batch))
		for i, ci := range batch {
			// The heading gives an isolated passage its subject back, which
			// matters for chunks that open with "It does this by …".
			texts[i] = strings.TrimSpace(ix.Chunks[ci].Heading + "\n" + ix.Chunks[ci].Text)
		}
		vecs, err := emb.Embed(ctx, texts)
		if err != nil {
			return err
		}
		for i, ci := range batch {
			ix.Vectors[ci] = vecs[i]
		}
		done += len(batch)
		if progress != nil {
			progress(done, len(todo))
		}
		if err := ctx.Err(); err != nil {
			return err
		}
	}
	ix.EmbedModel = emb.ID()
	return nil
}

// prepare computes the token/lexicon state a query needs, once.
func (ix *Index) prepare() {
	ix.once.Do(func() {
		for i := range ix.Chunks {
			ix.Chunks[i].tokens = analyze(ix.Chunks[i].Heading + " " + ix.Chunks[i].Text)
		}
		ix.lx = buildLexicon(ix.Chunks)
	})
}

// Semantic reports whether this index carries usable vectors.
func (ix *Index) Semantic() bool {
	for _, v := range ix.Vectors {
		if v != nil {
			return true
		}
	}
	return false
}

// Stats summarises the index for status output.
func (ix *Index) Stats() (docs, chunks, embedded int) {
	for _, v := range ix.Vectors {
		if v != nil {
			embedded++
		}
	}
	return len(ix.Docs), len(ix.Chunks), embedded
}

// candidatePool is how many chunks each ranker contributes to fusion. Wider
// than any sane limit so a result the other ranker loves is not cut early.
const candidatePool = 60

// Search ranks the index against a query. With no embedder (or no vectors)
// it is plain BM25; with both it fuses the two rankings.
func (ix *Index) Search(ctx context.Context, q Query) ([]Result, error) {
	ix.prepare()
	if q.Limit <= 0 {
		q.Limit = 10
	}
	text := strings.TrimSpace(q.Text)
	if text == "" {
		return nil, nil
	}

	allowed := ix.filter(q)
	terms := analyze(text)

	lexRanked := make([]ranked, 0, len(allowed))
	for _, ci := range allowed {
		s := ix.lx.score(terms, &ix.Chunks[ci]) + phraseBonus(text, &ix.Chunks[ci])
		if s > 0 {
			lexRanked = append(lexRanked, ranked{chunk: ci, score: s})
		}
	}
	lexRanked = topN(lexRanked, candidatePool)

	var semRanked []ranked
	if q.Embedder != nil && ix.Semantic() {
		vecs, err := q.Embedder.Embed(ctx, []string{text})
		if err == nil && len(vecs) == 1 {
			semRanked = make([]ranked, 0, len(allowed))
			for _, ci := range allowed {
				if ci >= len(ix.Vectors) || ix.Vectors[ci] == nil {
					continue
				}
				semRanked = append(semRanked, ranked{chunk: ci, score: dot(vecs[0], ix.Vectors[ci])})
			}
			semRanked = topN(semRanked, candidatePool)
		}
		// An embedding failure mid-query is not fatal: BM25 already has an
		// answer, and a search that degrades quietly beats one that errors.
	}

	fused := fuse(lexRanked, semRanked)
	return ix.materialize(fused, lexRanked, semRanked, q.Limit), nil
}

// filter returns the chunk indices a query is allowed to match.
func (ix *Index) filter(q Query) []int {
	kinds := map[Kind]bool{}
	for _, k := range q.Kinds {
		kinds[k] = true
	}
	section := strings.TrimSpace(q.Section)

	out := make([]int, 0, len(ix.Chunks))
	for i, c := range ix.Chunks {
		if c.DocID < 0 || c.DocID >= len(ix.Docs) {
			continue
		}
		d := ix.Docs[c.DocID]
		if len(kinds) > 0 && !kinds[d.Kind] {
			continue
		}
		if section != "" && !strings.EqualFold(d.Section, section) &&
			!strings.HasPrefix(strings.ToLower(d.Path), strings.ToLower(section)+"/") {
			continue
		}
		out = append(out, i)
	}
	return out
}

// rrfK damps the contribution of low ranks in reciprocal-rank fusion. 60 is
// the value from the original paper and behaves well without tuning — which
// matters here because the two rankers produce scores on incomparable scales
// and normalising them would need calibration data nobody has.
const rrfK = 60.0

func fuse(lex, sem []ranked) []ranked {
	if len(sem) == 0 {
		return lex
	}
	if len(lex) == 0 {
		return sem
	}
	combined := map[int]float64{}
	for rank, r := range lex {
		combined[r.chunk] += 1 / (rrfK + float64(rank+1))
	}
	for rank, r := range sem {
		combined[r.chunk] += 1 / (rrfK + float64(rank+1))
	}
	out := make([]ranked, 0, len(combined))
	for chunk, score := range combined {
		out = append(out, ranked{chunk: chunk, score: score})
	}
	return topN(out, candidatePool)
}

// materialize turns ranked chunks into results, collapsing multiple hits in
// one document to its best chunk — three passages from the same chapter push
// out three other chapters the caller would rather see.
func (ix *Index) materialize(fused, lex, sem []ranked, limit int) []Result {
	lexScore := map[int]float64{}
	for _, r := range lex {
		lexScore[r.chunk] = r.score
	}
	semScore := map[int]float64{}
	for _, r := range sem {
		semScore[r.chunk] = r.score
	}

	seen := map[string]bool{}
	out := make([]Result, 0, limit)
	for _, r := range fused {
		if len(out) >= limit {
			break
		}
		c := ix.Chunks[r.chunk]
		d := ix.Docs[c.DocID]
		key := string(d.Kind) + "\x00" + d.Path
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, Result{
			Path:     d.Path,
			Kind:     d.Kind,
			Section:  d.Section,
			Title:    d.Title,
			Heading:  c.Heading,
			Line:     c.Line,
			Snippet:  snippet(c.Text),
			Score:    r.score,
			Lexical:  lexScore[r.chunk],
			Semantic: semScore[r.chunk],
		})
	}
	return out
}

// snippetMax caps an excerpt. Long enough to judge relevance, short enough
// that ten results do not flood a model's context.
const snippetMax = 420

func snippet(text string) string {
	s := strings.TrimSpace(text)
	if len(s) <= snippetMax {
		return s
	}
	cut := s[:snippetMax]
	// Prefer ending on a sentence or word boundary over mid-token.
	if i := strings.LastIndexAny(cut, ".!?\n"); i > snippetMax/2 {
		return strings.TrimSpace(cut[:i+1])
	}
	if i := strings.LastIndex(cut, " "); i > snippetMax/2 {
		cut = cut[:i]
	}
	return strings.TrimSpace(cut) + "…"
}

// --- persistence ---

func load(repo string) (*Index, error) {
	raw, err := os.ReadFile(indexPath(repo))
	if err != nil {
		return nil, err
	}
	var ix Index
	if err := json.Unmarshal(raw, &ix); err != nil {
		return nil, fmt.Errorf("parsing search index: %w", err)
	}
	ix.Repo = repo
	return &ix, nil
}

func (ix *Index) save() error {
	dir := filepath.Join(ix.Repo, config.Dir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	raw, err := json.Marshal(ix)
	if err != nil {
		return err
	}
	// Write-then-rename: a search running in another process must never read
	// a half-written index.
	tmp := indexPath(ix.Repo) + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, indexPath(ix.Repo)); err != nil {
		os.Remove(tmp)
		return err
	}
	return nil
}

// Sections lists the distinct sections present, for UI filters.
func (ix *Index) Sections() []string {
	seen := map[string]bool{}
	var out []string
	for _, d := range ix.Docs {
		if d.Section == "" || seen[d.Section] {
			continue
		}
		seen[d.Section] = true
		out = append(out, d.Section)
	}
	sort.Strings(out)
	return out
}

// ErrEmpty reports a repo with nothing generated to search.
var ErrEmpty = errors.New("nothing indexed — run `kaioken wiki` or `kaioken generate` first")

func envOr(name string) string {
	if name == "" {
		return ""
	}
	return os.Getenv(name)
}
