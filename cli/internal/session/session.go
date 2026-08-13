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

type PromptDeliveryMode string

const (
	DeliverySteer PromptDeliveryMode = "steer"
	DeliveryQueue PromptDeliveryMode = "queue"
)

// DurableInput represents a prompt admitted to the durable inbox prior to promotion.
type DurableInput struct {
	ID        string             `json:"id"`
	Content   string             `json:"content"`
	Delivery  PromptDeliveryMode `json:"delivery"`
	CreatedAt time.Time          `json:"created_at"`
	Promoted  bool               `json:"promoted"`
}

// Session is one saved conversation.
type Session struct {
	ID       string         `json:"id"`
	Title    string         `json:"title"`
	Model    string         `json:"model"`
	Provider string         `json:"provider"`
	Created  time.Time      `json:"created"`
	Updated  time.Time      `json:"updated"`
	Mode     string         `json:"mode,omitempty"`
	// Thinking is the reasoning level in force when the session was last
	// saved, so a resume restores the depth the conversation was had at.
	Thinking string `json:"thinking,omitempty"`
	// ParentID and ForkedAt record lineage: this session was created by
	// forking ParentID, keeping its first ForkedAt messages. Zero values
	// mean the session was started fresh.
	ParentID string         `json:"parent_id,omitempty"`
	ForkedAt int            `json:"forked_at,omitempty"`
	Epochs   []Epoch        `json:"epochs,omitempty"`
	Inbox    []DurableInput `json:"inbox,omitempty"`
	Messages []llm.Message  `json:"messages"`

	// Entries is the full session tree in file order, and Leaf the tip of
	// the active branch — Messages is always the root→Leaf path. Maintained
	// by Record via syncTree; persisted in the JSONL v2 format, not in the
	// legacy JSON one.
	Entries []Entry `json:"-"`
	Leaf    string  `json:"-"`
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

// AdmitInput adds a prompt to the durable inbox.
func (s *Session) AdmitInput(content string, mode PromptDeliveryMode) DurableInput {
	if mode == "" {
		mode = DeliverySteer
	}
	input := DurableInput{
		ID:        fmt.Sprintf("inp_%d", time.Now().UnixNano()),
		Content:   content,
		Delivery:  mode,
		CreatedAt: time.Now(),
		Promoted:  false,
	}
	s.Inbox = append(s.Inbox, input)
	return input
}

// PendingInputs returns unpromoted inbox entries matching the delivery mode.
func (s *Session) PendingInputs(mode PromptDeliveryMode) []DurableInput {
	var res []DurableInput
	for _, in := range s.Inbox {
		if !in.Promoted && (mode == "" || in.Delivery == mode) {
			res = append(res, in)
		}
	}
	return res
}

// PromotePending marks matching pending inputs as promoted.
func (s *Session) PromotePending(mode PromptDeliveryMode) []DurableInput {
	var promoted []DurableInput
	for i := range s.Inbox {
		if !s.Inbox[i].Promoted && (mode == "" || s.Inbox[i].Delivery == mode) {
			s.Inbox[i].Promoted = true
			promoted = append(promoted, s.Inbox[i])
		}
	}
	return promoted
}


// Meta is a session summary for listings — everything but the transcript.
type Meta struct {
	ID       string
	Title    string
	Model    string
	Updated  time.Time
	Turns    int
	ParentID string
}

// Dir is where a repository's sessions are stored.
func Dir(repo string) string {
	return filepath.Join(repo, config.Dir, "sessions")
}

func path(repo, id string) string {
	return filepath.Join(Dir(repo), id+".json")
}

func pathJSONL(repo, id string) string {
	return filepath.Join(Dir(repo), id+".jsonl")
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
	s.syncTree()
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
	// A session loaded from the legacy format has messages but no tree yet;
	// build one so the v2 write is complete.
	if len(s.Entries) == 0 && len(s.Messages) > 0 {
		s.syncTree()
	}
	raw, err := encodeJSONL(s)
	if err != nil {
		return err
	}
	if err := os.WriteFile(pathJSONL(repo, s.ID), raw, 0o644); err != nil {
		return err
	}
	// The write above supersedes any legacy flat file for the same id —
	// leaving it behind would double-list the session.
	_ = os.Remove(path(repo, s.ID))
	return nil
}

// Load reads one session by id, in either format. Legacy flat files migrate
// to the tree in memory; the next save writes v2.
func Load(repo, id string) (*Session, error) {
	if raw, err := os.ReadFile(pathJSONL(repo, id)); err == nil {
		return decodeJSONL(raw)
	}
	raw, err := os.ReadFile(path(repo, id))
	if err != nil {
		return nil, err
	}
	var s Session
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil, fmt.Errorf("parsing session %s: %w", id, err)
	}
	s.syncTree()
	return &s, nil
}

// Delete removes a saved session in whichever format it exists.
func Delete(repo, id string) error {
	errJSONL := os.Remove(pathJSONL(repo, id))
	errJSON := os.Remove(path(repo, id))
	if errJSONL != nil && errJSON != nil {
		return errJSONL
	}
	return nil
}

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
	seen := map[string]bool{}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() {
			continue
		}
		var id string
		switch {
		case strings.HasSuffix(name, ".jsonl"):
			id = strings.TrimSuffix(name, ".jsonl")
		case strings.HasSuffix(name, ".json"):
			id = strings.TrimSuffix(name, ".json")
		default:
			continue
		}
		if seen[id] {
			continue // both formats on disk: Load prefers the v2 file
		}
		seen[id] = true
		s, err := Load(repo, id)
		if err != nil {
			continue // a corrupt file must not hide the rest
		}
		metas = append(metas, Meta{
			ID: s.ID, Title: s.Title, Model: s.Model,
			Updated: s.Updated, Turns: s.Turns(), ParentID: s.ParentID,
		})
	}
	sort.Slice(metas, func(i, j int) bool { return metas[i].Updated.After(metas[j].Updated) })
	return metas, nil
}

// firstTitleLine returns the first line of a message that says something
// about the conversation. A line that is wholly enclosed in square brackets
// is an annotation the front-end prepended, not the user's words — /btw
// frames asides that way — so it is skipped rather than becoming the title.
func firstTitleLine(content string) string {
	for _, line := range strings.Split(strings.TrimSpace(content), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			continue
		}
		return line
	}
	return ""
}

// deriveTitle summarises a conversation by its first user message.
func deriveTitle(messages []llm.Message) string {
	for _, msg := range messages {
		if msg.Role != "user" {
			continue
		}
		line := firstTitleLine(msg.Content)
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
