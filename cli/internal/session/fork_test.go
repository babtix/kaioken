package session

import (
	"os"
	"path/filepath"
	"testing"

	"kaioken/internal/llm"
)

func forkFixture() *Session {
	s := New("m1", "p1")
	s.Record([]llm.Message{
		{Role: "system", Content: "sys"},
		{Role: "user", Content: "first question"},
		{Role: "assistant", Content: "", ToolCalls: []llm.ToolCall{{ID: "c1"}}},
		{Role: "tool", ToolCallID: "c1", Name: "read_file", Content: "data"},
		{Role: "assistant", Content: "first answer"},
		{Role: "user", Content: "second question"},
		{Role: "assistant", Content: "second answer"},
	})
	return s
}

func TestSafeCutNeverSplitsToolExchange(t *testing.T) {
	s := forkFixture()
	// Cutting inside the tool exchange (indexes 2..4) must fall back to the
	// user message at index 1.
	for _, cut := range []int{2, 3, 4} {
		if got := SafeCut(s.Messages, cut); got != 1 {
			t.Errorf("SafeCut(%d) = %d, want 1", cut, got)
		}
	}
	// The ends and user positions are already safe.
	if got := SafeCut(s.Messages, len(s.Messages)); got != len(s.Messages) {
		t.Errorf("SafeCut(end) = %d", got)
	}
	if got := SafeCut(s.Messages, 5); got != 5 {
		t.Errorf("SafeCut(5) = %d, want 5", got)
	}
	if got := SafeCut(s.Messages, -3); got != 0 {
		t.Errorf("SafeCut(-3) = %d, want 0", got)
	}
}

func TestCutAfterTurn(t *testing.T) {
	s := forkFixture()
	if got := s.CutAfterTurn(1); got != 5 {
		t.Errorf("CutAfterTurn(1) = %d, want 5 (start of second turn)", got)
	}
	if got := s.CutAfterTurn(2); got != len(s.Messages) {
		t.Errorf("CutAfterTurn(2) = %d, want end", got)
	}
	if got := s.CutAfterTurn(99); got != len(s.Messages) {
		t.Errorf("CutAfterTurn(99) = %d, want end", got)
	}
	if got := s.CutAfterTurn(0); got != 0 {
		t.Errorf("CutAfterTurn(0) = %d, want 0", got)
	}
}

func TestForkAtRecordsLineageAndLeavesSourceAlone(t *testing.T) {
	s := forkFixture()
	before := len(s.Messages)

	fork, tail := s.ForkAt(s.CutAfterTurn(1))
	if fork.ParentID != s.ID {
		t.Errorf("ParentID = %q, want %q", fork.ParentID, s.ID)
	}
	if fork.ForkedAt != 5 {
		t.Errorf("ForkedAt = %d, want 5", fork.ForkedAt)
	}
	if len(fork.Messages) != 5 {
		t.Errorf("fork kept %d messages, want 5", len(fork.Messages))
	}
	if len(tail) != 2 {
		t.Errorf("tail = %d messages, want 2", len(tail))
	}
	if len(s.Messages) != before {
		t.Error("fork modified the source session")
	}
	if fork.ID == s.ID {
		t.Error("fork shares the source's id")
	}

	// Round-trip: the fork persists and reloads with lineage intact.
	repo := t.TempDir()
	if err := fork.SaveForce(repo); err != nil {
		t.Fatal(err)
	}
	loaded, err := Load(repo, fork.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.ParentID != s.ID || loaded.ForkedAt != 5 {
		t.Errorf("lineage lost on reload: parent=%q forkedAt=%d", loaded.ParentID, loaded.ForkedAt)
	}
	metas, err := List(repo)
	if err != nil {
		t.Fatal(err)
	}
	if len(metas) != 1 || metas[0].ParentID != s.ID {
		t.Errorf("listing lost lineage: %+v", metas)
	}
}

func TestImportSavedSession(t *testing.T) {
	repo := t.TempDir()
	src := forkFixture()
	if err := src.SaveForce(repo); err != nil {
		t.Fatal(err)
	}
	imported, err := Import(repo, filepath.Join(Dir(repo), src.ID+".jsonl"), "m2", "p2")
	if err != nil {
		t.Fatal(err)
	}
	if len(imported.Messages) != len(src.Messages) {
		t.Errorf("imported %d messages, want %d", len(imported.Messages), len(src.Messages))
	}
	if imported.ID == src.ID {
		t.Error("import reused the source id")
	}
	if _, err := Load(repo, imported.ID); err != nil {
		t.Errorf("imported session not on disk: %v", err)
	}
}

func TestImportJSONL(t *testing.T) {
	repo := t.TempDir()
	p := filepath.Join(t.TempDir(), "transcript.jsonl")
	content := `{"role":"user","content":"hello"}
{"not":"a message"}

{"role":"assistant","content":"hi there"}
`
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	s, err := Import(repo, p, "m", "p")
	if err != nil {
		t.Fatal(err)
	}
	if len(s.Messages) != 2 {
		t.Fatalf("imported %d messages, want 2", len(s.Messages))
	}
	if s.Messages[1].Content != "hi there" {
		t.Errorf("unexpected message: %+v", s.Messages[1])
	}
}

func TestImportJSONArray(t *testing.T) {
	repo := t.TempDir()
	p := filepath.Join(t.TempDir(), "arr.json")
	if err := os.WriteFile(p, []byte(`[{"role":"user","content":"q"},{"role":"assistant","content":"a"}]`), 0o644); err != nil {
		t.Fatal(err)
	}
	s, err := Import(repo, p, "m", "p")
	if err != nil {
		t.Fatal(err)
	}
	if len(s.Messages) != 2 {
		t.Fatalf("imported %d messages, want 2", len(s.Messages))
	}
}

func TestImportRejectsGarbage(t *testing.T) {
	repo := t.TempDir()
	p := filepath.Join(t.TempDir(), "junk.txt")
	if err := os.WriteFile(p, []byte("not json at all"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Import(repo, p, "m", "p"); err == nil {
		t.Fatal("expected an error importing garbage")
	}
	if _, err := Import(repo, filepath.Join(t.TempDir(), "missing.json"), "m", "p"); err == nil {
		t.Fatal("expected an error for a missing file")
	}
}
