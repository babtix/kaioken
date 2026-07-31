package session

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/llm"
)

func treeFixture() *Session {
	s := New("m", "p")
	s.Record([]llm.Message{
		{Role: "system", Content: "sys"},
		{Role: "user", Content: "question one"},
		{Role: "assistant", Content: "answer one"},
		{Role: "user", Content: "question two"},
		{Role: "assistant", Content: "answer two"},
	})
	return s
}

func TestSyncTreeLinearAppend(t *testing.T) {
	s := treeFixture()
	if len(s.Entries) != 5 {
		t.Fatalf("entries = %d, want 5", len(s.Entries))
	}
	if got := s.ActiveMessages(); len(got) != 5 {
		t.Fatalf("active path = %d messages, want 5", len(got))
	}
	// Appending extends the same branch without duplicating entries.
	msgs := append(append([]llm.Message(nil), s.Messages...),
		llm.Message{Role: "user", Content: "question three"})
	s.Record(msgs)
	if len(s.Entries) != 6 {
		t.Fatalf("after append entries = %d, want 6", len(s.Entries))
	}
	if len(s.Leaves()) != 1 {
		t.Fatalf("linear session should have one leaf, got %d", len(s.Leaves()))
	}
}

func TestSyncTreeDivergenceBranches(t *testing.T) {
	s := treeFixture()
	// Replace the second turn — like a compaction or a retry would.
	diverged := []llm.Message{
		{Role: "system", Content: "sys"},
		{Role: "user", Content: "question one"},
		{Role: "assistant", Content: "answer one"},
		{Role: "user", Content: "a different second question"},
	}
	s.Record(diverged)
	if len(s.Leaves()) != 2 {
		t.Fatalf("expected 2 leaves after divergence, got %d", len(s.Leaves()))
	}
	if got := s.ActiveMessages(); len(got) != 4 || got[3].Content != "a different second question" {
		t.Fatalf("active path wrong: %+v", got)
	}
	// The old branch is intact: 5 original + 1 new entry.
	if len(s.Entries) != 6 {
		t.Fatalf("entries = %d, want 6 (old branch preserved)", len(s.Entries))
	}
}

func TestForkBackAndRegrow(t *testing.T) {
	s := treeFixture()
	if err := s.ForkBack(1); err != nil {
		t.Fatal(err)
	}
	if len(s.Messages) != 3 {
		t.Fatalf("after fork, messages = %d, want 3", len(s.Messages))
	}
	// Grow a sibling branch.
	msgs := append(append([]llm.Message(nil), s.Messages...),
		llm.Message{Role: "user", Content: "question two, take two"})
	s.Record(msgs)
	leaves := s.Leaves()
	if len(leaves) != 2 {
		t.Fatalf("expected 2 leaves, got %d", len(leaves))
	}
	// The abandoned branch still ends at "answer two".
	var previews []string
	for _, l := range leaves {
		previews = append(previews, l.Preview)
	}
	joined := strings.Join(previews, " | ")
	if !strings.Contains(joined, "question two, take two") || !strings.Contains(joined, "question two") {
		t.Errorf("leaf previews wrong: %s", joined)
	}
}

func TestForkBackTooFar(t *testing.T) {
	s := treeFixture()
	if err := s.ForkBack(5); err == nil {
		t.Fatal("expected an error rewinding past the start")
	}
}

func TestSwitchLeafRestoresBranch(t *testing.T) {
	s := treeFixture()
	if err := s.ForkBack(1); err != nil {
		t.Fatal(err)
	}
	s.Record(append(append([]llm.Message(nil), s.Messages...),
		llm.Message{Role: "user", Content: "retry"}))

	// Find the non-active leaf (the original branch) and switch to it.
	var other string
	for _, l := range s.Leaves() {
		if !l.Active {
			other = l.ID
		}
	}
	if other == "" {
		t.Fatal("no inactive leaf found")
	}
	if err := s.SwitchLeaf(other); err != nil {
		t.Fatal(err)
	}
	last := s.Messages[len(s.Messages)-1]
	if last.Content != "answer two" {
		t.Errorf("switch did not restore the original branch, tail = %q", last.Content)
	}
}

func TestBranchMessages(t *testing.T) {
	s := treeFixture()
	oldLeaf := s.Leaf
	if err := s.ForkBack(1); err != nil {
		t.Fatal(err)
	}
	s.Record(append(append([]llm.Message(nil), s.Messages...),
		llm.Message{Role: "user", Content: "retry"}))

	abandoned := s.BranchMessages(oldLeaf)
	if len(abandoned) != 2 {
		t.Fatalf("abandoned = %d messages, want 2 (the rewound turn)", len(abandoned))
	}
	if abandoned[0].Content != "question two" || abandoned[1].Content != "answer two" {
		t.Errorf("wrong abandoned messages: %+v", abandoned)
	}
}

func TestJSONLRoundTripPreservesTree(t *testing.T) {
	repo := t.TempDir()
	s := treeFixture()
	if err := s.ForkBack(1); err != nil {
		t.Fatal(err)
	}
	s.Record(append(append([]llm.Message(nil), s.Messages...),
		llm.Message{Role: "user", Content: "retry"}))
	if err := s.SaveForce(repo); err != nil {
		t.Fatal(err)
	}

	loaded, err := Load(repo, s.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.Entries) != len(s.Entries) {
		t.Errorf("entries: %d, want %d", len(loaded.Entries), len(s.Entries))
	}
	if loaded.Leaf != s.Leaf {
		t.Errorf("leaf: %q, want %q", loaded.Leaf, s.Leaf)
	}
	if len(loaded.Leaves()) != 2 {
		t.Errorf("leaves: %d, want 2", len(loaded.Leaves()))
	}
	if len(loaded.Messages) != len(s.Messages) {
		t.Errorf("active messages: %d, want %d", len(loaded.Messages), len(s.Messages))
	}
}

func TestLegacyMigrationOnLoad(t *testing.T) {
	repo := t.TempDir()
	if err := os.MkdirAll(Dir(repo), 0o755); err != nil {
		t.Fatal(err)
	}
	// A legacy flat-JSON session, written the way old builds wrote it.
	legacy := `{"id":"old-1","title":"legacy","model":"m","provider":"p",
		"created":"2025-01-01T00:00:00Z","updated":"2025-01-02T00:00:00Z",
		"messages":[{"role":"system","content":"sys"},{"role":"user","content":"hi"},
		{"role":"assistant","content":"hello"}]}`
	if err := os.WriteFile(filepath.Join(Dir(repo), "old-1.json"), []byte(legacy), 0o644); err != nil {
		t.Fatal(err)
	}

	s, err := Load(repo, "old-1")
	if err != nil {
		t.Fatal(err)
	}
	if len(s.Messages) != 3 || len(s.Entries) != 3 || s.Leaf == "" {
		t.Fatalf("migration incomplete: msgs=%d entries=%d leaf=%q", len(s.Messages), len(s.Entries), s.Leaf)
	}

	// The next save upgrades the file to v2 and retires the legacy one.
	if err := s.Save(repo); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(Dir(repo), "old-1.jsonl")); err != nil {
		t.Error("v2 file missing after save")
	}
	if _, err := os.Stat(filepath.Join(Dir(repo), "old-1.json")); !os.IsNotExist(err) {
		t.Error("legacy file should be retired after the v2 write")
	}
	if metas, _ := List(repo); len(metas) != 1 {
		t.Errorf("listing after migration: %d sessions, want 1", len(metas))
	}
}
