// Package session persists chat conversations to disk so a run can be picked
// up later. Sessions live alongside the rest of Kaioken's state, one JSON file
// per conversation, and are written after every completed turn.
package session

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"kaioken/internal/config"
	"kaioken/internal/llm"
)

// maxTitle caps the derived title length.
const maxTitle = 64

// Session is one saved conversation.
type Session struct {
	ID       string        `json:"id"`
	Title    string        `json:"title"`
	Model    string        `json:"model"`
	Provider string        `json:"provider"`
	Created  time.Time     `json:"created"`
	Updated  time.Time     `json:"updated"`
	Mode     string        `json:"mode,omitempty"`
	Epochs   []Epoch       `json:"epochs,omitempty"`
	Messages []llm.Message `json:"messages"`
}

// Epoch marks a point where the conversation's context changed shape. Kind is
// "mode_switch" or "compaction".
type Epoch struct {
	Kind string    `json:"kind"`
	Mode string    `json:"mode,omitempty"`
	Note string    `json:"note,omitempty"`
	At   time.Time `json:"at"`
}

// AddEpoch appends an epoch marker stamped with the current time.
func (s *Session) AddEpoch(kind, mode, note string) {
	s.Epochs = append(s.Epochs, Epoch{Kind: kind, Mode: mode, Note: note, At: time.Now()})
}

// Meta is a session summary for listings — everything but the transcript.
type Meta struct {
	ID      string
	Title   string
	Model   string
	Updated time.Time
	Turns   int
}

// Dir is where a repository's sessions are stored.
func Dir(repo string) string {
	return filepath.Join(repo, config.Dir, "sessions")
}

func path(repo, id string) string {
	return filepath.Join(Dir(repo), id+".json")
}

// New starts an empty session with a time-ordered id.
func New(model, provider string) *Session {
	now := time.Now()
	return &Session{
		ID:       fmt.Sprintf("%s-%04d", now.Format("20060102-150405"), rand.Intn(10000)),
		Model:    model,
		Provider: provider,
		Created:  now,
		Updated:  now,
	}
}

// Record replaces the transcript and refreshes the derived title/timestamp.
func (s *Session) Record(messages []llm.Message) {
	s.Messages = messages
	s.Updated = time.Now()
	if s.Title == "" {
		s.Title = deriveTitle(messages)
	}
}

// Turns counts user messages — a rough measure of conversation length.
func (s *Session) Turns() int {
	n := 0
	for _, msg := range s.Messages {
		if msg.Role == "user" {
			n++
		}
	}
	return n
}

// Empty reports whether the session holds nothing worth saving. A conversation
// that is only its system prompt is not worth a file.
func (s *Session) Empty() bool { return s.Turns() == 0 }

// Save writes the session, creating the sessions directory as needed. A
// session with no user turns yet is skipped — there's nothing worth keeping.
func (s *Session) Save(repo string) error {
	if s.Empty() {
		return nil
	}
	return s.SaveForce(repo)
}

// SaveForce writes the session unconditionally, even if it has no messages
// yet. Used when creating a session, so its id can be looked up right away
// instead of only appearing on disk after the first completed turn.
func (s *Session) SaveForce(repo string) error {
	if err := os.MkdirAll(Dir(repo), 0o755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path(repo, s.ID), raw, 0o644)
}

// Load reads one session by id.
func Load(repo, id string) (*Session, error) {
	raw, err := os.ReadFile(path(repo, id))
	if err != nil {
		return nil, err
	}
	var s Session
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil, fmt.Errorf("parsing session %s: %w", id, err)
	}
	return &s, nil
}

// Delete removes a saved session.
func Delete(repo, id string) error { return os.Remove(path(repo, id)) }

// List returns session summaries, newest first. A missing directory is not an
// error — it just means nothing has been saved yet.
func List(repo string) ([]Meta, error) {
	entries, err := os.ReadDir(Dir(repo))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var metas []Meta
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".json") {
			continue
		}
		s, err := Load(repo, strings.TrimSuffix(name, ".json"))
		if err != nil {
			continue // a corrupt file must not hide the rest
		}
		metas = append(metas, Meta{
			ID: s.ID, Title: s.Title, Model: s.Model,
			Updated: s.Updated, Turns: s.Turns(),
		})
	}
	sort.Slice(metas, func(i, j int) bool { return metas[i].Updated.After(metas[j].Updated) })
	return metas, nil
}

// deriveTitle summarises a conversation by its first user message.
func deriveTitle(messages []llm.Message) string {
	for _, msg := range messages {
		if msg.Role != "user" {
			continue
		}
		line := strings.TrimSpace(msg.Content)
		if i := strings.IndexByte(line, '\n'); i != -1 {
			line = line[:i]
		}
		line = strings.Join(strings.Fields(line), " ")
		if line == "" {
			continue
		}
		if len(line) > maxTitle {
			// Trim on a rune boundary so a multi-byte character is not split.
			r := []rune(line)
			if len(r) > maxTitle {
				r = r[:maxTitle]
			}
			line = strings.TrimSpace(string(r)) + "…"
		}
		return line
	}
	return "(no prompt yet)"
}
