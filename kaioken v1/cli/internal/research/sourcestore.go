package research

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Origin says where a document came from, which decides how it may be cited
// and which retriever owns it.
type Origin string

const (
	OriginWeb  Origin = "web"
	OriginCode Origin = "code"
)

// Document is one retrieved source, reduced to citable text.
type Document struct {
	ID      string    // URL, or repo-relative path
	Title   string
	Content string    // sanitised text, markdown where available
	Hash    string    // sha256 of Content, the dedup key
	Origin  Origin
	Fetched time.Time
}

// SourceStore is the process-wide pool every path and worker shares. It
// dedups twice: the canonicalised ID catches the same URL arriving with
// different tracking tails, and the content hash catches the same text
// living under two URLs. A fetch served from either cache is not billed
// against the budget — without that, five parallel workers researching
// adjacent subtopics each fetch the same three top-ranked pages.
type SourceStore struct {
	mu      sync.Mutex
	dir     string // run-state sources dir; empty disables persistence
	byCanon map[string]Document
	byHash  map[string]Document
	order   []string // hashes in arrival order
	log     func(kind string, detail string)
}

// NewSourceStore starts a store. dir, when non-empty, receives the
// content-addressed <hash>.md files a resumed run reloads.
func NewSourceStore(dir string) *SourceStore {
	return &SourceStore{
		dir:     dir,
		byCanon: map[string]Document{},
		byHash:  map[string]Document{},
	}
}

// SetEventLogger installs the events.jsonl hook. Every fetch lands in the
// log so a bad run is auditable after the fact.
func (s *SourceStore) SetEventLogger(fn func(kind string, detail string)) {
	s.mu.Lock()
	s.log = fn
	s.mu.Unlock()
}

// Seen reports whether an id was already resolved, returning the stored
// document. Callers check this before paying for a fetch.
func (s *SourceStore) Seen(id string) (Document, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	doc, ok := s.byCanon[canonicalID(id)]
	return doc, ok
}

// ByHash returns the document carrying a content hash.
func (s *SourceStore) ByHash(hash string) (Document, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	doc, ok := s.byHash[hash]
	return doc, ok
}

// Put registers fetched content under its id. cached reports that the
// content was already in the store — under this id or another — and
// therefore must not be billed against the fetch budget.
func (s *SourceStore) Put(id, title, content string, origin Origin) (Document, bool) {
	content = sanitizeRetrieved(content)
	hash := hashContent(content)
	canon := canonicalID(id)

	s.mu.Lock()
	if doc, ok := s.byCanon[canon]; ok {
		s.mu.Unlock()
		return doc, true
	}
	if doc, ok := s.byHash[hash]; ok {
		// Same words, different address: alias the id and skip the bill.
		s.byCanon[canon] = doc
		s.mu.Unlock()
		return doc, true
	}
	doc := Document{
		ID: id, Title: strings.TrimSpace(title), Content: content,
		Hash: hash, Origin: origin, Fetched: time.Now().UTC(),
	}
	s.byCanon[canon] = doc
	s.byHash[hash] = doc
	s.order = append(s.order, hash)
	log := s.log
	dir := s.dir
	s.mu.Unlock()

	// Disk and audit trail outside the lock: neither may hold up the other
	// workers, and a failed write must not lose the in-memory document.
	if dir != "" {
		_ = writeSourceFile(dir, doc)
	}
	if log != nil {
		log("fetch", fmt.Sprintf("%s (%s, %d chars, %s)", id, origin, len(content), hash[:12]))
	}
	return doc, false
}

// Docs returns every stored document in arrival order.
func (s *SourceStore) Docs() []Document {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Document, 0, len(s.order))
	for _, h := range s.order {
		out = append(out, s.byHash[h])
	}
	return out
}

// Count is how many distinct documents the store holds.
func (s *SourceStore) Count() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.order)
}

// canonicalID collapses the address variants that would otherwise fetch the
// same page twice, reusing the corpus's URL normalisation for web ids and
// passing code ids through untouched.
func canonicalID(id string) string {
	if strings.HasPrefix(id, "http://") || strings.HasPrefix(id, "https://") {
		return normalizeURL(id)
	}
	return id
}

func hashContent(content string) string {
	sum := sha256.Sum256([]byte(content))
	return hex.EncodeToString(sum[:])
}

// ---------------------------------------------------------------- persistence

// writeSourceFile stores one document content-addressed: a one-line comment
// header carrying the metadata a resume needs, then the text itself. The
// filename is the validated content hash and nothing else, so no document
// field can ever influence the path.
func writeSourceFile(dir string, doc Document) error {
	if !validSourceHash(doc.Hash) {
		return fmt.Errorf("refusing to write source with malformed hash %q", doc.Hash)
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	header := fmt.Sprintf("<!-- kaioken-source | id: %s | title: %s | origin: %s | fetched: %s -->\n\n",
		flattenHeader(doc.ID), flattenHeader(doc.Title), doc.Origin, doc.Fetched.Format(time.RFC3339))
	return os.WriteFile(filepath.Join(dir, doc.Hash+".md"), []byte(header+doc.Content), 0o644)
}

// validSourceHash admits only what hashContent produces — 64 lowercase hex
// characters — so a hash can never carry separators, dots or traversal into
// a file path.
func validSourceHash(h string) bool {
	if len(h) != 64 {
		return false
	}
	for _, r := range h {
		if (r < '0' || r > '9') && (r < 'a' || r > 'f') {
			return false
		}
	}
	return true
}

// flattenHeader keeps a header field on one line and inside the comment.
func flattenHeader(s string) string {
	s = strings.Join(strings.Fields(s), " ")
	return strings.ReplaceAll(s, "-->", "- ->")
}

var sourceHeaderRe = regexp.MustCompile(`(?s)^<!-- kaioken-source \| id: (.*?) \| title: (.*?) \| origin: (\w+) \| fetched: (.*?) -->\n\n`)

// LoadSources reloads the content-addressed pool from a run directory, for
// --resume. Files that no longer parse are skipped rather than sinking the
// resume.
func LoadSources(s *SourceStore, dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		// Only names this package's own writer produces are read back; the
		// name then has to match the content's hash or the file is skipped.
		stem := strings.TrimSuffix(e.Name(), ".md")
		if !validSourceHash(stem) {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			continue
		}
		m := sourceHeaderRe.FindSubmatch(raw)
		if m == nil {
			continue
		}
		fetched, _ := time.Parse(time.RFC3339, string(m[4]))
		_ = fetched // arrival order, not original timestamps, drives the rebuild
		doc, cached := s.Put(string(m[1]), string(m[2]), string(raw[len(m[0]):]), Origin(m[3]))
		if !cached && doc.Hash != stem {
			// Content that no longer matches its filename is evidence of a
			// tampered run dir; drop it from the rebuild.
			s.drop(doc.Hash)
		}
	}
	return nil
}

// Hashes lists the stored content hashes in arrival order, for findings to
// reference.
func (s *SourceStore) Hashes() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.order...)
}

// drop removes a document the loader decided not to trust.
func (s *SourceStore) drop(hash string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	doc, ok := s.byHash[hash]
	if !ok {
		return
	}
	delete(s.byHash, hash)
	for canon, d := range s.byCanon {
		if d.Hash == hash {
			delete(s.byCanon, canon)
		}
	}
	for i, h := range s.order {
		if h == hash {
			s.order = append(s.order[:i], s.order[i+1:]...)
			break
		}
	}
	_ = doc
}

// ------------------------------------------------------------------ sanitize

// zeroWidth are the invisible characters a page can hide directives in.
var zeroWidth = strings.NewReplacer(
	"\u200b", "", // zero-width space
	"\u200c", "", // zero-width non-joiner
	"\u200d", "", // zero-width joiner
	"\u2060", "", // word joiner
	"\ufeff", "", // BOM / zero-width no-break space
)

var htmlCommentRe = regexp.MustCompile(`(?s)<!--.*?-->`)

// sanitizeRetrieved cleans attacker-controlled text at the fetch boundary,
// before it ever reaches a model: HTML comments and zero-width characters
// are both places a page can hide instructions aimed at the agent reading
// it. This is a filter, not a sandbox — the fencing in the prompts is the
// second wall.
func sanitizeRetrieved(text string) string {
	text = htmlCommentRe.ReplaceAllString(text, "")
	text = zeroWidth.Replace(text)
	return text
}
