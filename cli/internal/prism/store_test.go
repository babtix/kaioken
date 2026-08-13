package prism

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/config"
)

func newStore(t *testing.T) *Store {
	t.Helper()
	return NewStore(t.TempDir())
}

func mustModule(t *testing.T, s *Store, name string) Module {
	t.Helper()
	m, err := s.CreateModule(name, "", "")
	if err != nil {
		t.Fatalf("CreateModule(%q): %v", name, err)
	}
	return m
}

func TestCreateModuleDerivesASlug(t *testing.T) {
	s := newStore(t)
	m := mustModule(t, s, "Contract Law")
	if m.Slug != "contract-law" {
		t.Errorf("slug = %q, want contract-law", m.Slug)
	}
}

func TestCreateModuleRejectsDuplicateSlug(t *testing.T) {
	s := newStore(t)
	mustModule(t, s, "Cardiology")
	if _, err := s.CreateModule("cardiology", "", ""); !errors.Is(err, ErrModuleExists) {
		t.Errorf("second create returned %v, want ErrModuleExists", err)
	}
}

func TestSlugifyCannotEscapeTheStoreDirectory(t *testing.T) {
	// The slug becomes a directory name, so anything that could traverse must
	// not survive slugification.
	for _, in := range []string{"../../etc", "a/../../b", "..", "./x"} {
		got, err := slugify(in)
		if err != nil {
			continue
		}
		if strings.ContainsAny(got, `/\.`) {
			t.Errorf("slugify(%q) = %q, which contains a path character", in, got)
		}
	}
}

func TestSlugifyRejectsNamesWithNoContent(t *testing.T) {
	if _, err := slugify("!!! ???"); err == nil {
		t.Error("slugify accepted a name with no letters or digits")
	}
}

func TestModuleUnknownSlug(t *testing.T) {
	s := newStore(t)
	if _, err := s.Module("nope"); !errors.Is(err, ErrNoModule) {
		t.Errorf("Module() returned %v, want ErrNoModule", err)
	}
}

func TestDeleteModuleRemovesItsData(t *testing.T) {
	s := newStore(t)
	m := mustModule(t, s, "Temp")
	if err := s.AppendChunks(m.Slug, "", []Chunk{{DocID: "d", Text: "x", Type: Child}}, nil); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteModule(m.Slug); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(s.repo, config.Dir, "prism", m.Slug)); !os.IsNotExist(err) {
		t.Error("module directory survived deletion")
	}
	mods, _ := s.Modules()
	if len(mods) != 0 {
		t.Errorf("modules = %v after deleting the only one", mods)
	}
}

func TestModuleCountersOnlyCountReadyDocuments(t *testing.T) {
	// A module's advertised count must describe what is retrievable, not what
	// is mid-ingest or failed.
	s := newStore(t)
	m := mustModule(t, s, "Docs")

	for _, d := range []Document{
		{ID: "1", Status: StatusReady, ChildCount: 4, ParentCount: 1},
		{ID: "2", Status: StatusProcessing, ChildCount: 9, ParentCount: 9},
		{ID: "3", Status: StatusFailed, ChildCount: 9, ParentCount: 9},
	} {
		if err := s.PutDocument(m.Slug, d); err != nil {
			t.Fatal(err)
		}
	}

	got, err := s.Module(m.Slug)
	if err != nil {
		t.Fatal(err)
	}
	if got.DocumentCount != 1 {
		t.Errorf("DocumentCount = %d, want 1", got.DocumentCount)
	}
	if got.ChunkCount != 5 {
		t.Errorf("ChunkCount = %d, want 5", got.ChunkCount)
	}
}

func TestAppendChunksRoundTripsVectors(t *testing.T) {
	s := newStore(t)
	m := mustModule(t, s, "Vectors")

	chunks := []Chunk{
		{DocID: "d", Index: 0, Type: Child, ParentIndex: 2, Text: "first"},
		{DocID: "d", Index: 1, Type: Child, ParentIndex: 2, Text: "second"},
		{DocID: "d", Index: 2, Type: Parent, ParentIndex: NoParent, Text: "the parent"},
	}
	vecs := [][]float32{{1, 0, 0}, {0, 1, 0}}
	if err := s.AppendChunks(m.Slug, "test@local", chunks, vecs); err != nil {
		t.Fatal(err)
	}

	c, err := s.LoadCorpus(m.Slug)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Chunks) != 3 {
		t.Fatalf("loaded %d chunks, want 3", len(c.Chunks))
	}
	if c.EmbedModel != "test@local" || c.Dims != 3 {
		t.Errorf("corpus reports model %q dims %d", c.EmbedModel, c.Dims)
	}
	if !c.Semantic() {
		t.Fatal("corpus reports no vectors after storing two")
	}

	for _, ch := range c.Chunks {
		switch ch.Type {
		case Parent:
			if ch.Vec != NoVector {
				t.Errorf("parent chunk was given vector row %d", ch.Vec)
			}
		case Child:
			v, ok := c.Vectors[ch.Vec]
			if !ok {
				t.Fatalf("child %d has no vector at row %d", ch.Index, ch.Vec)
			}
			if len(v) != 3 {
				t.Errorf("vector width = %d, want 3", len(v))
			}
		}
	}
	// Rows were assigned in supply order.
	if got := c.Vectors[c.Chunks[0].Vec]; got[0] != 1 {
		t.Errorf("first child got vector %v, want the first one supplied", got)
	}
	if got := c.Vectors[c.Chunks[1].Vec]; got[1] != 1 {
		t.Errorf("second child got vector %v, want the second one supplied", got)
	}
}

func TestAppendChunksRefusesAnotherEmbeddingModel(t *testing.T) {
	// Vectors from two models are not comparable. Accepting the second set
	// would leave a module whose retrieval quietly degrades to noise for
	// whichever half was written in the other space.
	s := newStore(t)
	m := mustModule(t, s, "Mixed")

	child := []Chunk{{DocID: "d", Type: Child, Text: "x"}}
	if err := s.AppendChunks(m.Slug, "model-a", child, [][]float32{{1, 0}}); err != nil {
		t.Fatal(err)
	}
	err := s.AppendChunks(m.Slug, "model-b", child, [][]float32{{0, 1}})
	if err == nil {
		t.Fatal("second model was accepted into the same vector space")
	}
	if !strings.Contains(err.Error(), "re-index") {
		t.Errorf("error does not say how to recover: %v", err)
	}
}

func TestAppendChunksRefusesMismatchedWidth(t *testing.T) {
	s := newStore(t)
	m := mustModule(t, s, "Widths")
	child := []Chunk{{DocID: "d", Type: Child, Text: "x"}}
	if err := s.AppendChunks(m.Slug, "m", child, [][]float32{{1, 0}}); err != nil {
		t.Fatal(err)
	}
	if err := s.AppendChunks(m.Slug, "m", child, [][]float32{{1, 0, 0}}); err == nil {
		t.Error("a 3-wide vector was accepted into a 2-wide module")
	}
}

func TestDeleteDocumentCompactsVectorRows(t *testing.T) {
	// Deleting the first document must renumber what is left; a stale row
	// index would hand back another document's vector.
	s := newStore(t)
	m := mustModule(t, s, "Compact")

	if err := s.AppendChunks(m.Slug, "m",
		[]Chunk{{DocID: "a", Index: 0, Type: Child, Text: "alpha"}},
		[][]float32{{1, 0}}); err != nil {
		t.Fatal(err)
	}
	if err := s.AppendChunks(m.Slug, "m",
		[]Chunk{{DocID: "b", Index: 0, Type: Child, Text: "bravo"}},
		[][]float32{{0, 1}}); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"a", "b"} {
		if err := s.PutDocument(m.Slug, Document{ID: id, Status: StatusReady, ChildCount: 1}); err != nil {
			t.Fatal(err)
		}
	}

	if err := s.DeleteDocument(m.Slug, "a"); err != nil {
		t.Fatal(err)
	}

	c, err := s.LoadCorpus(m.Slug)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Chunks) != 1 || c.Chunks[0].DocID != "b" {
		t.Fatalf("chunks after delete = %+v, want only b", c.Chunks)
	}
	v, ok := c.Vectors[c.Chunks[0].Vec]
	if !ok {
		t.Fatal("surviving chunk lost its vector")
	}
	if v[1] != 1 {
		t.Errorf("surviving chunk got vector %v — it kept the deleted document's row", v)
	}
	if len(c.Vectors) != 1 {
		t.Errorf("%d vectors survived, want 1", len(c.Vectors))
	}
}

func TestDeleteDocumentUnknownID(t *testing.T) {
	s := newStore(t)
	m := mustModule(t, s, "Empty")
	if err := s.DeleteDocument(m.Slug, "ghost"); !errors.Is(err, ErrNoDocument) {
		t.Errorf("DeleteDocument returned %v, want ErrNoDocument", err)
	}
}

func TestLoadCorpusOfAnEmptyModule(t *testing.T) {
	s := newStore(t)
	m := mustModule(t, s, "Fresh")
	c, err := s.LoadCorpus(m.Slug)
	if err != nil {
		t.Fatalf("loading an empty module errored: %v", err)
	}
	if len(c.Chunks) != 0 || c.Semantic() {
		t.Errorf("empty module loaded as %+v", c)
	}
}

func TestLoadCorpusSurvivesADamagedVectorFile(t *testing.T) {
	// BM25 still answers without vectors. Losing the whole module because the
	// binary sidecar is torn would turn a degraded search into no search.
	s := newStore(t)
	m := mustModule(t, s, "Damaged")
	if err := s.AppendChunks(m.Slug, "m",
		[]Chunk{{DocID: "d", Type: Child, Text: "x"}}, [][]float32{{1, 0}}); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(s.vectorsPath(m.Slug)); err != nil {
		t.Fatal(err)
	}

	c, err := s.LoadCorpus(m.Slug)
	if err != nil {
		t.Fatalf("LoadCorpus failed instead of degrading: %v", err)
	}
	if len(c.Chunks) != 1 {
		t.Errorf("lost the text as well as the vectors: %+v", c.Chunks)
	}
	if c.Semantic() {
		t.Error("corpus claims vectors it cannot read")
	}
}

func TestAppendChunksToUnknownModule(t *testing.T) {
	s := newStore(t)
	err := s.AppendChunks("ghost", "m", []Chunk{{DocID: "d", Text: "x"}}, nil)
	if !errors.Is(err, ErrNoModule) {
		t.Errorf("append to a missing module returned %v, want ErrNoModule", err)
	}
}
