package prism

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// fakeEmbedder returns deterministic vectors and can be told to fail a fixed
// number of times first, which is how the retry and fail-loud paths are
// exercised without a network.
type fakeEmbedder struct {
	calls    int
	failNext int
	err      error
}

func (f *fakeEmbedder) ID() string { return "fake@test" }
func (f *fakeEmbedder) Dims() int  { return 2 }

func (f *fakeEmbedder) Embed(_ context.Context, texts []string) ([][]float32, error) {
	f.calls++
	if f.failNext > 0 {
		f.failNext--
		if f.err != nil {
			return nil, f.err
		}
		return nil, errors.New("endpoint unavailable")
	}
	out := make([][]float32, len(texts))
	for i, t := range texts {
		// One axis per keyword, so a test can assert which chunk a query
		// should reach without a real model.
		if strings.Contains(strings.ToLower(t), "alpha") {
			out[i] = []float32{1, 0}
		} else {
			out[i] = []float32{0, 1}
		}
	}
	return out, nil
}

func writeFile(t *testing.T, dir, name, body string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestImportFileStoresChildrenAndParents(t *testing.T) {
	s := newStore(t)
	m := mustModule(t, s, "Notes")
	in := NewIngestor(s, &fakeEmbedder{}, ChunkConfig{
		ParentTokens: 50, ChildTokens: 15, ChildOverlap: 3, CharsPerToken: 4,
	})

	body := "# Alpha Section\n\n" + strings.Repeat("Alpha content sentence here. ", 20) +
		"\n\n# Bravo Section\n\n" + strings.Repeat("Bravo content sentence here. ", 20)
	path := writeFile(t, t.TempDir(), "notes.md", body)

	doc, err := in.ImportFile(context.Background(), m.Slug, path, nil)
	if err != nil {
		t.Fatal(err)
	}
	if doc.Status != StatusReady {
		t.Fatalf("status = %s, error = %s", doc.Status, doc.Error)
	}
	if doc.ChildCount == 0 || doc.ParentCount == 0 {
		t.Fatalf("counts: %d children, %d parents", doc.ChildCount, doc.ParentCount)
	}

	c, err := s.LoadCorpus(m.Slug)
	if err != nil {
		t.Fatal(err)
	}

	var children, parents int
	for _, ch := range c.Chunks {
		switch ch.Type {
		case Child:
			children++
			if ch.ParentIndex == NoParent {
				t.Errorf("child %d has no parent to expand to", ch.Index)
			}
			if ch.Vec == NoVector {
				t.Errorf("child %d was stored without a vector", ch.Index)
			}
		case Parent:
			parents++
			if ch.Vec != NoVector {
				t.Errorf("parent %d carries a vector; parents are never searched", ch.Index)
			}
		}
	}
	if children != doc.ChildCount || parents != doc.ParentCount {
		t.Errorf("stored %d/%d chunks, document reports %d/%d",
			children, parents, doc.ChildCount, doc.ParentCount)
	}
}

func TestImportResolvesEveryChildsParent(t *testing.T) {
	s := newStore(t)
	m := mustModule(t, s, "Links")
	in := NewIngestor(s, &fakeEmbedder{}, ChunkConfig{
		ParentTokens: 40, ChildTokens: 10, ChildOverlap: 2, CharsPerToken: 4,
	})

	body := strings.Repeat("A sentence that carries some meaning. ", 60)
	if _, err := in.ImportText(context.Background(), m.Slug, "doc.txt", "", body, nil); err != nil {
		t.Fatal(err)
	}

	c, _ := s.LoadCorpus(m.Slug)
	byIndex := map[int]Chunk{}
	for _, ch := range c.Chunks {
		byIndex[ch.Index] = ch
	}
	for _, ch := range c.Chunks {
		if ch.Type != Child {
			continue
		}
		p, ok := byIndex[ch.ParentIndex]
		if !ok {
			t.Fatalf("child %d points at parent %d, which does not exist", ch.Index, ch.ParentIndex)
		}
		if p.Type != Parent {
			t.Errorf("child %d points at chunk %d, which is a %s", ch.Index, p.Index, p.Type)
		}
	}
}

func TestImportRecordsSectionHeadings(t *testing.T) {
	s := newStore(t)
	m := mustModule(t, s, "Sections")
	in := NewIngestor(s, &fakeEmbedder{}, ChunkConfig{
		ParentTokens: 30, ChildTokens: 10, ChildOverlap: 2, CharsPerToken: 4,
	})

	body := "# Retry Policy\n\n" + strings.Repeat("Backoff and jitter apply here. ", 20)
	if _, err := in.ImportText(context.Background(), m.Slug, "d.md", "", body, nil); err != nil {
		t.Fatal(err)
	}

	c, _ := s.LoadCorpus(m.Slug)
	found := false
	for _, ch := range c.Chunks {
		if ch.Section == "Retry Policy" {
			found = true
		}
	}
	if !found {
		t.Error("no chunk carries the heading it sits under")
	}
}

func TestFailedEmbeddingFailsTheDocumentAndStoresNothing(t *testing.T) {
	// The rule this test exists for: a zero vector scores 0.0 against every
	// query, so substituting one would store chunks that are permanently
	// unretrievable inside a document reported as ready.
	s := newStore(t)
	m := mustModule(t, s, "Broken")
	in := NewIngestor(s, &fakeEmbedder{failNext: 99}, DefaultChunkConfig())
	in.backoff = time.Millisecond

	doc, err := in.ImportText(context.Background(), m.Slug, "d.txt", "", "Some content to ingest.", nil)
	if err == nil {
		t.Fatal("ingestion reported success with no embeddings")
	}
	var ee *EmbedError
	if !errors.As(err, &ee) {
		t.Errorf("error = %v, want an EmbedError", err)
	}
	if doc.Status != StatusFailed {
		t.Errorf("status = %s, want failed", doc.Status)
	}

	c, _ := s.LoadCorpus(m.Slug)
	if len(c.Chunks) != 0 {
		t.Errorf("a failed document left %d chunks behind", len(c.Chunks))
	}
	for _, v := range c.Vectors {
		if isZero(v) {
			t.Error("a zero vector was stored")
		}
	}

	mod, _ := s.Module(m.Slug)
	if mod.DocumentCount != 0 {
		t.Errorf("failed document counted toward DocumentCount = %d", mod.DocumentCount)
	}
}

func TestEmbeddingRetriesTransientFailures(t *testing.T) {
	s := newStore(t)
	m := mustModule(t, s, "Flaky")
	emb := &fakeEmbedder{failNext: 2}
	in := NewIngestor(s, emb, DefaultChunkConfig())
	in.backoff = time.Millisecond

	doc, err := in.ImportText(context.Background(), m.Slug, "d.txt", "", "Content that will eventually embed.", nil)
	if err != nil {
		t.Fatalf("ingestion gave up on a transient failure: %v", err)
	}
	if doc.Status != StatusReady {
		t.Errorf("status = %s, want ready", doc.Status)
	}
	if emb.calls != 3 {
		t.Errorf("embedder called %d times, want 3 (two failures then success)", emb.calls)
	}
}

func TestImportWithoutAnEmbedderStoresTextOnly(t *testing.T) {
	// Lexical-only is a supported state, not a broken one: BM25 needs no
	// model, no key and no network.
	s := newStore(t)
	m := mustModule(t, s, "Lexical")
	in := NewIngestor(s, nil, DefaultChunkConfig())

	doc, err := in.ImportText(context.Background(), m.Slug, "d.txt", "", "Plain content, no vectors.", nil)
	if err != nil {
		t.Fatal(err)
	}
	if doc.Status != StatusReady {
		t.Fatalf("status = %s, error = %s", doc.Status, doc.Error)
	}

	c, _ := s.LoadCorpus(m.Slug)
	if len(c.Chunks) == 0 {
		t.Fatal("no chunks stored")
	}
	if c.Semantic() {
		t.Error("corpus reports vectors after an embedder-less ingest")
	}
	for _, ch := range c.Chunks {
		if ch.Vec != NoVector {
			t.Errorf("chunk %d claims vector row %d", ch.Index, ch.Vec)
		}
	}
}

func TestImportProgressReachesEveryStage(t *testing.T) {
	s := newStore(t)
	m := mustModule(t, s, "Progress")
	in := NewIngestor(s, &fakeEmbedder{}, DefaultChunkConfig())

	seen := map[Stage]bool{}
	_, err := in.ImportText(context.Background(), m.Slug, "d.txt", "", "Content.", nil)
	if err != nil {
		t.Fatal(err)
	}
	_, err = in.ImportText(context.Background(), m.Slug, "e.txt", "", "More content.",
		func(st Stage, _, _ int) { seen[st] = true })
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []Stage{StageChunk, StageEmbed, StageStore} {
		if !seen[want] {
			t.Errorf("progress never reported stage %q", want)
		}
	}
}

func TestImportRejectsEmptyText(t *testing.T) {
	s := newStore(t)
	m := mustModule(t, s, "Empty")
	in := NewIngestor(s, &fakeEmbedder{}, DefaultChunkConfig())
	if _, err := in.ImportText(context.Background(), m.Slug, "d.txt", "", "   \n\n  ", nil); err == nil {
		t.Error("whitespace was accepted as a document")
	}
}

func TestImportIntoUnknownModule(t *testing.T) {
	s := newStore(t)
	in := NewIngestor(s, &fakeEmbedder{}, DefaultChunkConfig())
	_, err := in.ImportText(context.Background(), "ghost", "d.txt", "", "content", nil)
	if !errors.Is(err, ErrNoModule) {
		t.Errorf("import into a missing module returned %v, want ErrNoModule", err)
	}
}

// --- extraction ---

func TestExtractRefusesPDFWithAnActionableMessage(t *testing.T) {
	path := writeFile(t, t.TempDir(), "book.pdf", "%PDF-1.4")
	_, err := Extract(path)
	if err == nil {
		t.Fatal("a PDF was accepted")
	}
	var ue *ErrUnsupported
	if !errors.As(err, &ue) {
		t.Fatalf("error = %v, want ErrUnsupported", err)
	}
	if !strings.Contains(err.Error(), "convert") {
		t.Errorf("message does not say what to do instead: %v", err)
	}
}

func TestExtractRefusesUnknownExtensions(t *testing.T) {
	// Chunking a binary produces chunks that embed to noise and are
	// indistinguishable from real content once indexed.
	path := writeFile(t, t.TempDir(), "asset.bin", "\x00\x01\x02")
	if _, err := Extract(path); err == nil {
		t.Error("an unknown extension was accepted")
	}
}

func TestExtractNormalisesCRLF(t *testing.T) {
	// The chunker looks for "\n\n" as a paragraph break; on a CRLF file it
	// would never find one and every document would split mid-sentence.
	path := writeFile(t, t.TempDir(), "win.md", "line one\r\n\r\nline two\r\n")
	got, err := Extract(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.ContainsRune(got, '\r') {
		t.Errorf("carriage returns survived: %q", got)
	}
	if !strings.Contains(got, "\n\n") {
		t.Errorf("paragraph break lost: %q", got)
	}
}

func TestExtractRejectsInvalidUTF8(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bad.txt")
	if err := os.WriteFile(path, []byte{0xff, 0xfe, 0x00}, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Extract(path); err == nil {
		t.Error("invalid UTF-8 was accepted")
	}
}

func TestExtractRejectsAnEmptyFile(t *testing.T) {
	path := writeFile(t, t.TempDir(), "empty.md", "\n\n   \n")
	if _, err := Extract(path); err == nil {
		t.Error("a file with no text was accepted")
	}
}

func TestSupportedMatchesWhatExtractAccepts(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"a.md", "b.txt", "c.go", "d.yaml"} {
		if !Supported(name) {
			t.Errorf("Supported(%q) = false", name)
			continue
		}
		if _, err := Extract(writeFile(t, dir, name, "content here")); err != nil {
			t.Errorf("Extract(%q) rejected what Supported accepted: %v", name, err)
		}
	}
	for _, name := range []string{"e.pdf", "f.bin", "g"} {
		if Supported(name) {
			t.Errorf("Supported(%q) = true", name)
		}
	}
}

func isZero(v []float32) bool {
	for _, x := range v {
		if x != 0 {
			return false
		}
	}
	return len(v) > 0
}
