package session

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"kaioken/internal/llm"
)

func conv(userTexts ...string) []llm.Message {
	msgs := []llm.Message{{Role: "system", Content: "you are kaioken"}}
	for _, t := range userTexts {
		msgs = append(msgs,
			llm.Message{Role: "user", Content: t},
			llm.Message{Role: "assistant", Content: "reply to " + t})
	}
	return msgs
}

func TestSaveLoadRoundTrip(t *testing.T) {
	repo := t.TempDir()
	s := New("test/model", "openrouter")
	s.Record(conv("first question", "second question"))

	if err := s.Save(repo); err != nil {
		t.Fatal(err)
	}
	got, err := Load(repo, s.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != "first question" {
		t.Errorf("title = %q, want the first user message", got.Title)
	}
	if got.Turns() != 2 {
		t.Errorf("turns = %d, want 2", got.Turns())
	}
	if len(got.Messages) != len(s.Messages) {
		t.Errorf("messages = %d, want %d", len(got.Messages), len(s.Messages))
	}
	if got.Messages[0].Role != "system" {
		t.Error("the system prompt must survive the round trip")
	}
}

// An untouched session must not litter the repo with empty files.
func TestEmptySessionIsNotSaved(t *testing.T) {
	repo := t.TempDir()
	s := New("m", "p")
	s.Record([]llm.Message{{Role: "system", Content: "prompt"}})

	if !s.Empty() {
		t.Fatal("a system-prompt-only session should count as empty")
	}
	if err := s.Save(repo); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(Dir(repo), s.ID+".json")); !os.IsNotExist(err) {
		t.Error("an empty session should not be written to disk")
	}
}

func TestListNewestFirst(t *testing.T) {
	repo := t.TempDir()
	for i, title := range []string{"oldest", "middle", "newest"} {
		s := New("m", "p")
		s.ID = "id-" + title // deterministic ids for the assertion
		s.Record(conv(title))
		s.Updated = time.Now().Add(time.Duration(i) * time.Hour)
		if err := s.Save(repo); err != nil {
			t.Fatal(err)
		}
	}
	metas, err := List(repo)
	if err != nil {
		t.Fatal(err)
	}
	if len(metas) != 3 {
		t.Fatalf("expected 3 sessions, got %d", len(metas))
	}
	if metas[0].Title != "newest" || metas[2].Title != "oldest" {
		t.Errorf("wrong order: %s, %s, %s", metas[0].Title, metas[1].Title, metas[2].Title)
	}
}

// A missing sessions directory means "nothing saved yet", not an error.
func TestListMissingDirIsEmpty(t *testing.T) {
	metas, err := List(t.TempDir())
	if err != nil {
		t.Fatalf("expected no error for a missing directory, got %v", err)
	}
	if len(metas) != 0 {
		t.Errorf("expected no sessions, got %d", len(metas))
	}
}

// One unreadable file must not hide every other session.
func TestListSkipsCorruptFiles(t *testing.T) {
	repo := t.TempDir()
	good := New("m", "p")
	good.Record(conv("keep me"))
	if err := good.Save(repo); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(Dir(repo), "broken.json"), []byte("{not json"), 0o644); err != nil {
		t.Fatal(err)
	}

	metas, err := List(repo)
	if err != nil {
		t.Fatal(err)
	}
	if len(metas) != 1 || metas[0].Title != "keep me" {
		t.Errorf("a corrupt file hid the valid sessions: %+v", metas)
	}
}

func TestDeriveTitle(t *testing.T) {
	cases := []struct {
		name     string
		messages []llm.Message
		want     string
	}{
		{
			name:     "first user line only",
			messages: conv("explain the auth flow\nand the session model"),
			want:     "explain the auth flow",
		},
		{
			name:     "no user message yet",
			messages: []llm.Message{{Role: "system", Content: "prompt"}},
			want:     "(no prompt yet)",
		},
		{
			name: "whitespace collapsed",
			messages: []llm.Message{
				{Role: "user", Content: "   lots    of     space   "},
			},
			want: "lots of space",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := deriveTitle(c.messages); got != c.want {
				t.Errorf("deriveTitle = %q, want %q", got, c.want)
			}
		})
	}
}

func TestDeriveTitleTruncates(t *testing.T) {
	long := strings.Repeat("a", 200)
	got := deriveTitle([]llm.Message{{Role: "user", Content: long}})
	if !strings.HasSuffix(got, "…") {
		t.Errorf("long title should be elided, got %q", got)
	}
	if len([]rune(got)) > maxTitle+1 {
		t.Errorf("title is %d runes, want at most %d", len([]rune(got)), maxTitle+1)
	}
}

// The title is derived once and then kept, so a later Record does not rename
// a conversation the user already recognises in the list.
func TestTitleIsStable(t *testing.T) {
	s := New("m", "p")
	s.Record(conv("original question"))
	s.Record(conv("original question", "a follow-up"))
	if s.Title != "original question" {
		t.Errorf("title changed to %q", s.Title)
	}
}

func TestDelete(t *testing.T) {
	repo := t.TempDir()
	s := New("m", "p")
	s.Record(conv("bye"))
	if err := s.Save(repo); err != nil {
		t.Fatal(err)
	}
	if err := Delete(repo, s.ID); err != nil {
		t.Fatal(err)
	}
	if metas, _ := List(repo); len(metas) != 0 {
		t.Errorf("expected no sessions after delete, got %d", len(metas))
	}
}
