package prism

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"kaioken/internal/embed"
)

// Ingestion is where the corpus's honesty is won or lost, because every later
// stage trusts what lands here. Two rules carry that weight:
//
// A failed embedding fails the document. The tempting alternative — store the
// chunk with a zero vector and move on — produces a chunk that scores 0.0
// against every query, so it is stored, counted, and permanently unretrievable
// inside a document reported as ready. That is silent corruption, discoverable
// only by audit. Failing is recoverable: the file can be imported again.
//
// Embedding completes before the first write. So a document that fails leaves
// no chunks behind to clean up, and the store never holds half a document.

// EmbedError reports that vectors could not be produced for a document.
type EmbedError struct{ Err error }

func (e *EmbedError) Error() string { return "embedding failed: " + e.Err.Error() }
func (e *EmbedError) Unwrap() error { return e.Err }

// Ingestor turns files into retrievable chunks.
type Ingestor struct {
	store *Store
	emb   embed.Embedder
	cfg   ChunkConfig
	// backoff is the first retry delay, doubling each attempt. A field rather
	// than a constant so tests exercise the retry path without sleeping.
	backoff time.Duration
}

// NewIngestor wires an ingestor. A nil embedder is allowed and means text-only
// ingestion: the corpus is searchable by BM25 and every retrieval from it
// reports itself degraded until the module is re-indexed with an embedder.
func NewIngestor(store *Store, emb embed.Embedder, cfg ChunkConfig) *Ingestor {
	return &Ingestor{store: store, emb: emb, cfg: cfg.withDefaults(), backoff: embedBackoff}
}

// Stage names a phase of ingestion, for progress reporting.
type Stage string

const (
	StageExtract Stage = "extract"
	StageChunk   Stage = "chunk"
	StageEmbed   Stage = "embed"
	StageStore   Stage = "store"
)

// Progress is called as ingestion advances. total is 0 for stages that are not
// divisible into steps.
type Progress func(stage Stage, done, total int)

func (p Progress) report(stage Stage, done, total int) {
	if p != nil {
		p(stage, done, total)
	}
}

// ImportFile ingests one file into a module.
func (in *Ingestor) ImportFile(ctx context.Context, slug, path string, progress Progress) (Document, error) {
	progress.report(StageExtract, 0, 0)
	text, err := Extract(path)
	if err != nil {
		return Document{}, err
	}
	return in.ImportText(ctx, slug, filepath.Base(path), path, text, progress)
}

// ImportText ingests already-extracted text. source may be empty when the text
// did not come from a file.
func (in *Ingestor) ImportText(ctx context.Context, slug, filename, source, text string, progress Progress) (Document, error) {
	if _, err := in.store.Module(slug); err != nil {
		return Document{}, err
	}
	if strings.TrimSpace(text) == "" {
		return Document{}, errors.New("nothing to ingest: the text is empty")
	}

	now := time.Now().UTC()
	doc := Document{
		ID:        newID(),
		Filename:  filename,
		Source:    source,
		Status:    StatusProcessing,
		Bytes:     int64(len(text)),
		CreatedAt: now,
		UpdatedAt: now,
	}
	// Recorded before the work starts so a long ingest is visible rather than
	// looking like nothing happened.
	if err := in.store.PutDocument(slug, doc); err != nil {
		return Document{}, err
	}

	ready, err := in.ingest(ctx, slug, doc, text, progress)
	if err != nil {
		doc.Status = StatusFailed
		doc.Error = truncateErr(err.Error())
		if perr := in.store.PutDocument(slug, doc); perr != nil {
			return doc, fmt.Errorf("%w (and recording the failure also failed: %v)", err, perr)
		}
		return doc, err
	}
	return ready, nil
}

func (in *Ingestor) ingest(ctx context.Context, slug string, doc Document, text string, progress Progress) (Document, error) {
	progress.report(StageChunk, 0, 0)

	pairs := chunkParentChild(text, in.cfg)
	if len(pairs) == 0 {
		return doc, errors.New("chunking produced nothing usable")
	}
	heads := indexHeadings([]rune(text))

	// Parents are deduplicated: several children share one, and it is stored
	// once. Sorting the keys keeps the on-disk order deterministic, which is
	// what makes two ingests of the same file produce the same corpus.
	parentText := map[int]string{}
	parentSection := map[int]string{}
	for _, p := range pairs {
		parentText[p.parentIdx] = p.parentText
		parentSection[p.parentIdx] = heads.at(p.parentStart)
	}
	parentIdxs := make([]int, 0, len(parentText))
	for idx := range parentText {
		parentIdxs = append(parentIdxs, idx)
	}
	sort.Ints(parentIdxs)

	// Children take indices 0..N-1 and parents N..N+M-1, so every chunk in a
	// document has a unique index and a child can name its parent by it.
	globalParent := make(map[int]int, len(parentIdxs))
	for i, idx := range parentIdxs {
		globalParent[idx] = len(pairs) + i
	}

	childTexts := make([]string, len(pairs))
	for i, p := range pairs {
		// The section gives an isolated passage its subject back, which
		// matters for a child that opens with "It does this by …".
		childTexts[i] = embedText(heads.at(p.childStart), p.childText)
	}

	var vectors [][]float32
	embedModel := ""
	if in.emb != nil {
		var err error
		if vectors, err = in.embedAll(ctx, childTexts, progress); err != nil {
			return doc, &EmbedError{Err: err}
		}
		embedModel = in.emb.ID()
	}

	progress.report(StageStore, 0, 0)
	chunks := make([]Chunk, 0, len(pairs)+len(parentIdxs))
	for i, p := range pairs {
		chunks = append(chunks, Chunk{
			DocID:       doc.ID,
			Index:       i,
			Type:        Child,
			ParentIndex: globalParent[p.parentIdx],
			Section:     heads.at(p.childStart),
			Text:        p.childText,
		})
	}
	for _, idx := range parentIdxs {
		chunks = append(chunks, Chunk{
			DocID:       doc.ID,
			Index:       globalParent[idx],
			Type:        Parent,
			ParentIndex: NoParent,
			Section:     parentSection[idx],
			Text:        parentText[idx],
		})
	}

	if err := in.store.AppendChunks(slug, embedModel, chunks, vectors); err != nil {
		return doc, err
	}

	doc.Status = StatusReady
	doc.ChildCount = len(pairs)
	doc.ParentCount = len(parentIdxs)
	doc.Error = ""
	if err := in.store.PutDocument(slug, doc); err != nil {
		return doc, err
	}
	return doc, nil
}

// embedRetries is how many times one batch is retried before the document
// fails. Three attempts clears a rate limit or a dropped connection; more just
// delays the report of a genuinely unreachable endpoint.
const embedRetries = 3

// embedBackoff is the first retry delay, doubling each attempt.
const embedBackoff = 2 * time.Second

// embedAll embeds every child text, one batch at a time so a transient failure
// costs one batch rather than the document, and so progress is reportable.
func (in *Ingestor) embedAll(ctx context.Context, texts []string, progress Progress) ([][]float32, error) {
	out := make([][]float32, 0, len(texts))
	progress.report(StageEmbed, 0, len(texts))

	for start := 0; start < len(texts); start += embed.BatchSize {
		end := min(start+embed.BatchSize, len(texts))
		batch := texts[start:end]

		var vecs [][]float32
		var err error
		for attempt := 1; attempt <= embedRetries; attempt++ {
			if vecs, err = in.emb.Embed(ctx, batch); err == nil {
				break
			}
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			if attempt == embedRetries {
				return nil, fmt.Errorf("batch at chunk %d: %w", start, err)
			}
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(in.backoff << (attempt - 1)):
			}
		}
		if len(vecs) != len(batch) {
			return nil, fmt.Errorf("batch at chunk %d: got %d vectors for %d texts", start, len(vecs), len(batch))
		}
		out = append(out, vecs...)
		progress.report(StageEmbed, len(out), len(texts))
	}
	return out, nil
}

// embedText is what actually gets embedded for a child: its section heading
// followed by its text. Both ingestion and querying must build this the same
// way, so it lives in one function.
func embedText(section, text string) string {
	return strings.TrimSpace(section + "\n" + text)
}

func newID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		// Time alone is weaker but still unique enough at import rates, and an
		// unavailable RNG is not a reason to refuse an import.
		return fmt.Sprintf("%x", time.Now().UnixNano())
	}
	return hex.EncodeToString(b[:])
}

// truncateErr bounds a stored error message. Errors from an HTTP endpoint can
// carry a whole response body, and the document record is read on every list.
func truncateErr(s string) string {
	const max = 500
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}
