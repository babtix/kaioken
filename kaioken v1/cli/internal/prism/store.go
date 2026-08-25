package prism

import (
	"bufio"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"kaioken/internal/config"
)

// The corpus lives in plain files under .kaioken/prism/, one directory per
// module:
//
//	modules.json          the module list
//	<slug>/docs.json      per-document ingestion state
//	<slug>/chunks.jsonl   one chunk per line, children and parents
//	<slug>/vectors.f32    packed little-endian float32, one row per child
//	<slug>/vectors.json   {model, dims, rows} — which space the rows are in
//
// Vectors are binary rather than JSON because they are the only part that gets
// large. A 768-wide vector costs 3 KiB packed and roughly 12 KiB as a JSON
// float array, so a book-sized module would spend forty megabytes and a slow
// parse on a file nothing ever reads by hand. internal/search stores its
// vectors as JSON only because a generated wiki is small.

var (
	// ErrNoModule reports a module that does not exist.
	ErrNoModule = errors.New("no such module")
	// ErrModuleExists reports a slug already in use.
	ErrModuleExists = errors.New("module already exists")
	// ErrNoDocument reports a document id absent from a module.
	ErrNoDocument = errors.New("no such document")
)

// Store is the on-disk corpus for one repository.
type Store struct {
	repo string
	// mu guards reads as well as writes.
	//
	// Locking only the writers is not enough. A reader holding a file open is
	// what makes the concurrent rename fail on Windows, so a status poll
	// arriving mid-import — exactly what a UI does while a document ingests —
	// takes the write down with it. Reads are cheap and short, so an RWMutex
	// costs nothing and removes the class.
	//
	// Cross-process safety is separate: whole files are written and renamed,
	// and appends are ordered so a crash leaves unreferenced data rather than
	// dangling references.
	mu sync.RWMutex
}

// NewStore returns the store for a repository. It touches no disk until used,
// so a repo that has never imported anything costs nothing.
func NewStore(repo string) *Store { return &Store{repo: repo} }

func (s *Store) dir() string { return filepath.Join(s.repo, config.Dir, "prism") }

func (s *Store) moduleDir(slug string) string { return filepath.Join(s.dir(), slug) }

func (s *Store) modulesPath() string { return filepath.Join(s.dir(), "modules.json") }

func (s *Store) docsPath(slug string) string {
	return filepath.Join(s.moduleDir(slug), "docs.json")
}

func (s *Store) chunksPath(slug string) string {
	return filepath.Join(s.moduleDir(slug), "chunks.jsonl")
}

func (s *Store) vectorsPath(slug string) string {
	return filepath.Join(s.moduleDir(slug), "vectors.f32")
}

func (s *Store) vectorMetaPath(slug string) string {
	return filepath.Join(s.moduleDir(slug), "vectors.json")
}

// --- modules ---

// Modules lists every module, by name.
func (s *Store) Modules() ([]Module, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.modules()
}

// modules is Modules without locking, for callers that already hold it.
func (s *Store) modules() ([]Module, error) {
	var mods []Module
	if err := readJSON(s.modulesPath(), &mods); err != nil {
		return nil, err
	}
	sort.Slice(mods, func(i, j int) bool { return mods[i].Name < mods[j].Name })
	return mods, nil
}

// Module returns one module by slug.
func (s *Store) Module(slug string) (Module, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.module(slug)
}

func (s *Store) module(slug string) (Module, error) {
	mods, err := s.modules()
	if err != nil {
		return Module{}, err
	}
	for _, m := range mods {
		if m.Slug == slug {
			return m, nil
		}
	}
	return Module{}, fmt.Errorf("%w: %s", ErrNoModule, slug)
}

// CreateModule adds a module. The slug is derived from the name unless one is
// given, and must be unique.
func (s *Store) CreateModule(name, slug, description string) (Module, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	name = strings.TrimSpace(name)
	if name == "" {
		return Module{}, errors.New("a module needs a name")
	}
	if strings.TrimSpace(slug) == "" {
		slug = name
	}
	sl, err := slugify(slug)
	if err != nil {
		return Module{}, err
	}

	mods, err := s.modules()
	if err != nil {
		return Module{}, err
	}
	for _, m := range mods {
		if m.Slug == sl {
			return Module{}, fmt.Errorf("%w: %s", ErrModuleExists, sl)
		}
	}

	now := time.Now().UTC()
	mod := Module{
		Slug:        sl,
		Name:        name,
		Description: strings.TrimSpace(description),
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	mods = append(mods, mod)
	if err := os.MkdirAll(s.moduleDir(sl), 0o755); err != nil {
		return Module{}, err
	}
	if err := writeJSON(s.modulesPath(), mods); err != nil {
		return Module{}, err
	}
	return mod, nil
}

// UpdateModule applies a mutation to one module and persists it.
func (s *Store) UpdateModule(slug string, apply func(*Module)) (Module, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.updateModuleLocked(slug, apply)
}

func (s *Store) updateModuleLocked(slug string, apply func(*Module)) (Module, error) {
	mods, err := s.modules()
	if err != nil {
		return Module{}, err
	}
	for i := range mods {
		if mods[i].Slug != slug {
			continue
		}
		apply(&mods[i])
		mods[i].Slug = slug // a mutation must not move the module on disk
		mods[i].UpdatedAt = time.Now().UTC()
		if err := writeJSON(s.modulesPath(), mods); err != nil {
			return Module{}, err
		}
		return mods[i], nil
	}
	return Module{}, fmt.Errorf("%w: %s", ErrNoModule, slug)
}

// DeleteModule removes a module and everything in it.
func (s *Store) DeleteModule(slug string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	mods, err := s.modules()
	if err != nil {
		return err
	}
	kept := make([]Module, 0, len(mods))
	found := false
	for _, m := range mods {
		if m.Slug == slug {
			found = true
			continue
		}
		kept = append(kept, m)
	}
	if !found {
		return fmt.Errorf("%w: %s", ErrNoModule, slug)
	}
	// The list goes first: if removing the directory fails halfway, an
	// unreferenced directory is inert, whereas a listed module with no
	// directory is an error on every read.
	if err := writeJSON(s.modulesPath(), kept); err != nil {
		return err
	}
	return os.RemoveAll(s.moduleDir(slug))
}

// --- documents ---

// Documents lists a module's documents, newest first.
func (s *Store) Documents(slug string) ([]Document, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.documents(slug)
}

func (s *Store) documents(slug string) ([]Document, error) {
	var docs []Document
	if err := readJSON(s.docsPath(slug), &docs); err != nil {
		return nil, err
	}
	sort.Slice(docs, func(i, j int) bool { return docs[i].CreatedAt.After(docs[j].CreatedAt) })
	return docs, nil
}

// PutDocument inserts or replaces a document record.
func (s *Store) PutDocument(slug string, doc Document) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.putDocumentLocked(slug, doc)
}

func (s *Store) putDocumentLocked(slug string, doc Document) error {
	if _, err := s.module(slug); err != nil {
		return err
	}
	docs, err := s.documents(slug)
	if err != nil {
		return err
	}
	doc.UpdatedAt = time.Now().UTC()
	replaced := false
	for i := range docs {
		if docs[i].ID == doc.ID {
			docs[i] = doc
			replaced = true
			break
		}
	}
	if !replaced {
		docs = append(docs, doc)
	}
	if err := os.MkdirAll(s.moduleDir(slug), 0o755); err != nil {
		return err
	}
	if err := writeJSON(s.docsPath(slug), docs); err != nil {
		return err
	}
	return s.recountLocked(slug, docs)
}

// DeleteDocument removes a document and every chunk and vector it owns.
func (s *Store) DeleteDocument(slug, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	docs, err := s.documents(slug)
	if err != nil {
		return err
	}
	kept := make([]Document, 0, len(docs))
	found := false
	for _, d := range docs {
		if d.ID == id {
			found = true
			continue
		}
		kept = append(kept, d)
	}
	if !found {
		return fmt.Errorf("%w: %s", ErrNoDocument, id)
	}

	if err := s.compactLocked(slug, func(c Chunk) bool { return c.DocID != id }); err != nil {
		return err
	}
	if err := writeJSON(s.docsPath(slug), kept); err != nil {
		return err
	}
	return s.recountLocked(slug, kept)
}

// recountLocked recomputes the module's counters from the data they summarise.
// They are derived and never incremented in place, so ingestion and deletion
// cannot drift apart — a module that says it holds four documents holds four.
func (s *Store) recountLocked(slug string, docs []Document) error {
	ready, chunks := 0, 0
	for _, d := range docs {
		if d.Status == StatusReady {
			ready++
			chunks += d.ChildCount + d.ParentCount
		}
	}
	_, err := s.updateModuleLocked(slug, func(m *Module) {
		m.DocumentCount = ready
		m.ChunkCount = chunks
	})
	return err
}

// --- chunks and vectors ---

// vectorMeta records which space the rows in vectors.f32 belong to. Vectors
// written under one embedding model are not comparable with a query embedded
// by another, so the model id travels with them and a mismatch is refused
// rather than silently producing plausible nonsense.
type vectorMeta struct {
	Model string `json:"model"`
	Dims  int    `json:"dims"`
	Rows  int    `json:"rows"`
}

// AppendChunks stores a document's chunks and its children's vectors.
//
// vectors must be parallel to the children in chunks, in order; parents take
// no vector. Pass a nil vectors slice to store text only, which is what an
// ingest with no embedder available does.
//
// Order matters and is the whole crash-safety story: vectors land first, then
// the chunks that reference them, then the caller marks the document ready. A
// crash anywhere leaves rows nothing points at, which is inert, rather than
// chunks pointing at rows that do not exist, which is not.
func (s *Store) AppendChunks(slug, embedModel string, chunks []Chunk, vectors [][]float32) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, err := s.module(slug); err != nil {
		return err
	}
	if err := os.MkdirAll(s.moduleDir(slug), 0o755); err != nil {
		return err
	}

	base := 0
	if len(vectors) > 0 {
		var err error
		if base, err = s.appendVectorsLocked(slug, embedModel, vectors); err != nil {
			return err
		}
	}

	// Assign rows to children in the order their vectors were supplied.
	next := base
	out := make([]Chunk, len(chunks))
	copy(out, chunks)
	for i := range out {
		if out[i].Type != Child || len(vectors) == 0 {
			out[i].Vec = NoVector
			continue
		}
		out[i].Vec = next
		next++
	}
	if len(vectors) > 0 && next-base != len(vectors) {
		return fmt.Errorf("prism: %d vectors supplied for %d child chunks", len(vectors), next-base)
	}

	f, err := os.OpenFile(s.chunksPath(slug), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	w := bufio.NewWriter(f)
	enc := json.NewEncoder(w)
	for _, c := range out {
		if err := enc.Encode(c); err != nil {
			return err
		}
	}
	if err := w.Flush(); err != nil {
		return err
	}
	return f.Sync()
}

func (s *Store) appendVectorsLocked(slug, model string, vectors [][]float32) (int, error) {
	var meta vectorMeta
	if err := readJSON(s.vectorMetaPath(slug), &meta); err != nil {
		return 0, err
	}
	dims := len(vectors[0])
	if dims == 0 {
		return 0, errors.New("prism: refusing to store a zero-width vector")
	}

	if meta.Rows > 0 {
		if meta.Model != model {
			return 0, fmt.Errorf(
				"prism: module %q holds vectors from %q but this ingest uses %q — "+
					"re-index the module to change embedding model", slug, meta.Model, model)
		}
		if meta.Dims != dims {
			return 0, fmt.Errorf("prism: module %q holds %d-wide vectors, got %d", slug, meta.Dims, dims)
		}
	}

	buf := make([]byte, 4*dims)
	f, err := os.OpenFile(s.vectorsPath(slug), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return 0, err
	}
	defer f.Close()
	w := bufio.NewWriter(f)
	for i, v := range vectors {
		if len(v) != dims {
			return 0, fmt.Errorf("prism: vector %d is %d wide, expected %d", i, len(v), dims)
		}
		for j, x := range v {
			binary.LittleEndian.PutUint32(buf[4*j:], math.Float32bits(x))
		}
		if _, err := w.Write(buf); err != nil {
			return 0, err
		}
	}
	if err := w.Flush(); err != nil {
		return 0, err
	}
	if err := f.Sync(); err != nil {
		return 0, err
	}

	base := meta.Rows
	meta.Model, meta.Dims, meta.Rows = model, dims, meta.Rows+len(vectors)
	if err := writeJSON(s.vectorMetaPath(slug), meta); err != nil {
		return 0, err
	}
	return base, nil
}

// Corpus is everything retrieval needs from one module, loaded once.
type Corpus struct {
	Module Module
	Chunks []Chunk
	// Vectors is indexed by Chunk.Vec. Rows belonging to deleted documents are
	// absent, so a lookup goes through the chunk rather than by position.
	Vectors map[int][]float32
	// EmbedModel names the space Vectors live in, empty when there are none.
	EmbedModel string
	Dims       int
}

// Semantic reports whether this corpus can answer a vector query.
func (c *Corpus) Semantic() bool { return len(c.Vectors) > 0 }

// LoadCorpus reads a module into memory. Modules are bounded by what a person
// imported, so this is a read of a few megabytes rather than a database.
func (s *Store) LoadCorpus(slug string) (*Corpus, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	mod, err := s.module(slug)
	if err != nil {
		return nil, err
	}
	chunks, err := s.readChunks(slug)
	if err != nil {
		return nil, err
	}

	var meta vectorMeta
	if err := readJSON(s.vectorMetaPath(slug), &meta); err != nil {
		return nil, err
	}

	c := &Corpus{Module: mod, Chunks: chunks, EmbedModel: meta.Model, Dims: meta.Dims}
	if meta.Rows == 0 || meta.Dims == 0 {
		return c, nil
	}

	rows, err := s.readVectors(slug, meta)
	if err != nil {
		// A damaged vector file must not take the corpus down with it: BM25
		// still answers, and the caller reports the run as degraded.
		return c, nil
	}
	c.Vectors = make(map[int][]float32, len(chunks))
	for _, ch := range chunks {
		if ch.Vec >= 0 && ch.Vec < len(rows) {
			c.Vectors[ch.Vec] = rows[ch.Vec]
		}
	}
	return c, nil
}

// Fingerprint identifies a module's corpus state cheaply, without reading it.
// Callers key caches on it, so ingesting or deleting invalidates them by
// construction rather than by remembering to call an invalidate function —
// the failure mode there is a module that keeps serving pre-import results
// and reads as "the upload didn't work".
func (s *Store) Fingerprint(slug string) string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var b strings.Builder
	for _, p := range []string{s.chunksPath(slug), s.vectorsPath(slug)} {
		if info, err := os.Stat(p); err == nil {
			fmt.Fprintf(&b, "%d-%d;", info.Size(), info.ModTime().UnixNano())
		} else {
			b.WriteString("-;")
		}
	}
	return b.String()
}

func (s *Store) readChunks(slug string) ([]Chunk, error) {
	f, err := os.Open(s.chunksPath(slug))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	defer f.Close()

	var out []Chunk
	sc := bufio.NewScanner(f)
	// A parent chunk runs to a few thousand characters, which can be tens of
	// kilobytes once it is UTF-8 and JSON-escaped. The default 64 KiB token
	// limit would reject those lines as too long.
	sc.Buffer(make([]byte, 0, 64<<10), 4<<20)
	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		var c Chunk
		if err := json.Unmarshal(line, &c); err != nil {
			// One unreadable line is a torn append, not a reason to lose the
			// module. Skip it; the document it belonged to can be re-imported.
			continue
		}
		out = append(out, c)
	}
	return out, sc.Err()
}

func (s *Store) readVectors(slug string, meta vectorMeta) ([][]float32, error) {
	raw, err := os.ReadFile(s.vectorsPath(slug))
	if err != nil {
		return nil, err
	}
	width := 4 * meta.Dims
	rows := len(raw) / width
	out := make([][]float32, rows)
	for r := 0; r < rows; r++ {
		v := make([]float32, meta.Dims)
		off := r * width
		for j := 0; j < meta.Dims; j++ {
			v[j] = math.Float32frombits(binary.LittleEndian.Uint32(raw[off+4*j:]))
		}
		out[r] = v
	}
	return out, nil
}

// compactLocked rewrites a module's chunks and vectors keeping only what the
// predicate accepts, renumbering vector rows so the two files stay dense.
func (s *Store) compactLocked(slug string, keep func(Chunk) bool) error {
	chunks, err := s.readChunks(slug)
	if err != nil {
		return err
	}
	var meta vectorMeta
	if err := readJSON(s.vectorMetaPath(slug), &meta); err != nil {
		return err
	}
	var rows [][]float32
	if meta.Rows > 0 && meta.Dims > 0 {
		if rows, err = s.readVectors(slug, meta); err != nil {
			rows = nil
		}
	}

	var keptChunks []Chunk
	var keptVectors [][]float32
	for _, c := range chunks {
		if !keep(c) {
			continue
		}
		if c.Vec >= 0 && c.Vec < len(rows) {
			keptVectors = append(keptVectors, rows[c.Vec])
			c.Vec = len(keptVectors) - 1
		} else {
			c.Vec = NoVector
		}
		keptChunks = append(keptChunks, c)
	}

	if err := s.writeChunks(slug, keptChunks); err != nil {
		return err
	}
	return s.writeVectors(slug, meta.Model, meta.Dims, keptVectors)
}

func (s *Store) writeChunks(slug string, chunks []Chunk) error {
	path := s.chunksPath(slug)
	tmp := path + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	w := bufio.NewWriter(f)
	enc := json.NewEncoder(w)
	for _, c := range chunks {
		if err := enc.Encode(c); err != nil {
			f.Close()
			os.Remove(tmp)
			return err
		}
	}
	if err := w.Flush(); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, path)
}

func (s *Store) writeVectors(slug, model string, dims int, vectors [][]float32) error {
	path := s.vectorsPath(slug)
	if len(vectors) == 0 {
		os.Remove(path)
		return writeJSON(s.vectorMetaPath(slug), vectorMeta{Model: model, Dims: dims})
	}
	tmp := path + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	w := bufio.NewWriter(f)
	buf := make([]byte, 4*dims)
	for _, v := range vectors {
		for j := 0; j < dims && j < len(v); j++ {
			binary.LittleEndian.PutUint32(buf[4*j:], math.Float32bits(v[j]))
		}
		if _, err := w.Write(buf); err != nil {
			f.Close()
			os.Remove(tmp)
			return err
		}
	}
	if err := w.Flush(); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		return err
	}
	return writeJSON(s.vectorMetaPath(slug), vectorMeta{Model: model, Dims: dims, Rows: len(vectors)})
}

// --- helpers ---

// slugify reduces a name to a filesystem- and URL-safe identifier. The output
// alphabet is [a-z0-9-] only, which is also what makes it safe to use directly
// as a directory name: no separator, no dot, nothing to traverse with.
func slugify(s string) (string, error) {
	var b strings.Builder
	lastDash := true // suppresses a leading dash
	for _, r := range strings.ToLower(strings.TrimSpace(s)) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		case r == ' ' || r == '-' || r == '_' || r == '.' || r == '/':
			if !lastDash {
				b.WriteByte('-')
				lastDash = true
			}
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "", fmt.Errorf("%q has no letters or digits to make a slug from", s)
	}
	if len(out) > 64 {
		out = strings.Trim(out[:64], "-")
	}
	return out, nil
}

// readJSON decodes a file into v. A missing file leaves v untouched and is not
// an error: an empty corpus is the normal starting state.
func readJSON(path string, v any) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if len(raw) == 0 {
		return nil
	}
	if err := json.Unmarshal(raw, v); err != nil {
		return fmt.Errorf("parsing %s: %w", filepath.Base(path), err)
	}
	return nil
}

// writeJSON writes v, then renames into place so a concurrent reader never
// sees a half-written file.
func writeJSON(path string, v any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		os.Remove(tmp)
		return err
	}
	return nil
}
