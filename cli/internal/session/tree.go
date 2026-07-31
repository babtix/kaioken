package session

// Tree-structured session storage (format v2).
//
// A saved conversation used to be a flat JSON array — resume it, append to
// it, and history is a line. But two real operations refuse to stay linear:
// compaction replaces the transcript with a summary, and a user who wants to
// retry an approach needs to rewind without destroying what came after. So
// v2 stores a session as JSONL: a header line, then one entry per line, each
// entry naming its parent. History becomes a tree; the "conversation" is
// just the path from the root to the active leaf, and everything ever said
// stays reachable from /tree.
//
// The legacy flat format is still read (and migrated on load); it is never
// written again.

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"math/rand"
	"sort"
	"time"

	"kaioken/internal/llm"
)

// FormatVersion is the JSONL session format written by this build.
const FormatVersion = 2

// Entry is one node of the session tree. Type says which payload fields are
// meaningful; today every entry is a "message", but the format leaves room
// for richer node kinds without a version bump.
type Entry struct {
	Type     string       `json:"type"`
	ID       string       `json:"id"`
	ParentID string       `json:"parent_id,omitempty"`
	At       time.Time    `json:"at"`
	Message  *llm.Message `json:"message,omitempty"`
	// Summary/FromID annotate branch_summary entries: what was abandoned
	// and where it forked from.
	Summary string `json:"summary,omitempty"`
	FromID  string `json:"from_id,omitempty"`
}

// entryTypeMessage is the only entry type currently written.
const entryTypeMessage = "message"

// newEntryID returns an 8-hex-char id, unique enough within one session.
func newEntryID() string {
	return fmt.Sprintf("%08x", rand.Uint32())
}

// msgKey is the identity used to align in-memory messages with stored
// entries: full JSON equality, so any change at all reads as divergence.
func msgKey(m llm.Message) string {
	raw, _ := json.Marshal(m)
	return string(raw)
}

// byID indexes the entries.
func (s *Session) byID() map[string]*Entry {
	m := make(map[string]*Entry, len(s.Entries))
	for i := range s.Entries {
		m[s.Entries[i].ID] = &s.Entries[i]
	}
	return m
}

// pathTo returns the entries from the root to the given entry id, inclusive.
func (s *Session) pathTo(id string) []*Entry {
	index := s.byID()
	var rev []*Entry
	for cur := index[id]; cur != nil; cur = index[cur.ParentID] {
		rev = append(rev, cur)
		if cur.ParentID == "" {
			break
		}
	}
	out := make([]*Entry, 0, len(rev))
	for i := len(rev) - 1; i >= 0; i-- {
		out = append(out, rev[i])
	}
	return out
}

// activePath returns the root→leaf entries of the active branch.
func (s *Session) activePath() []*Entry {
	if s.Leaf == "" {
		return nil
	}
	return s.pathTo(s.Leaf)
}

// ActiveMessages reconstructs the conversation along the active branch.
func (s *Session) ActiveMessages() []llm.Message {
	var out []llm.Message
	for _, e := range s.activePath() {
		if e.Type == entryTypeMessage && e.Message != nil {
			out = append(out, *e.Message)
		}
	}
	return out
}

// syncTree reconciles the tree with s.Messages after a Record. The common
// prefix of the active path is kept; everything after the divergence point
// becomes a new branch. An append-only turn extends the current branch; a
// compaction or a fork leaves the old branch intact and grows a new one.
func (s *Session) syncTree() {
	active := make([]*Entry, 0)
	for _, e := range s.activePath() {
		if e.Type == entryTypeMessage && e.Message != nil {
			active = append(active, e)
		}
	}

	common := 0
	for common < len(active) && common < len(s.Messages) &&
		msgKey(*active[common].Message) == msgKey(s.Messages[common]) {
		common++
	}

	leaf := ""
	if common > 0 {
		leaf = active[common-1].ID
	}
	now := time.Now()
	for _, m := range s.Messages[common:] {
		msg := m
		e := Entry{
			Type: entryTypeMessage, ID: newEntryID(), ParentID: leaf,
			At: now, Message: &msg,
		}
		s.Entries = append(s.Entries, e)
		leaf = e.ID
	}
	s.Leaf = leaf
}

// LeafInfo describes one branch tip for /tree.
type LeafInfo struct {
	ID      string
	At      time.Time
	Turns   int    // user messages on the branch
	Preview string // the newest user message on the branch
	Active  bool
}

// Leaves lists every branch tip, newest first, the active one included.
func (s *Session) Leaves() []LeafInfo {
	hasChild := map[string]bool{}
	for _, e := range s.Entries {
		if e.ParentID != "" {
			hasChild[e.ParentID] = true
		}
	}
	var out []LeafInfo
	for _, e := range s.Entries {
		if hasChild[e.ID] {
			continue
		}
		info := LeafInfo{ID: e.ID, At: e.At, Active: e.ID == s.Leaf}
		for _, pe := range s.pathTo(e.ID) {
			if pe.Type == entryTypeMessage && pe.Message != nil && pe.Message.Role == "user" {
				info.Turns++
				info.Preview = firstLine(pe.Message.Content)
			}
		}
		out = append(out, info)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].At.After(out[j].At) })
	return out
}

// SwitchLeaf makes another branch tip the active conversation.
func (s *Session) SwitchLeaf(id string) error {
	if _, ok := s.byID()[id]; !ok {
		return fmt.Errorf("no entry %s in this session", id)
	}
	s.Leaf = id
	s.Messages = s.ActiveMessages()
	s.Updated = time.Now()
	return nil
}

// ForkBack rewinds the active branch by the given number of user turns. The
// abandoned turns stay in the tree; the next Record grows a sibling branch.
func (s *Session) ForkBack(turns int) error {
	if turns <= 0 {
		return fmt.Errorf("fork needs a positive number of turns")
	}
	path := s.activePath()
	seen := 0
	for i := len(path) - 1; i >= 0; i-- {
		e := path[i]
		if e.Type == entryTypeMessage && e.Message != nil && e.Message.Role == "user" {
			seen++
			if seen == turns {
				s.Leaf = e.ParentID
				s.Messages = s.ActiveMessages()
				s.Updated = time.Now()
				return nil
			}
		}
	}
	return fmt.Errorf("the branch only has %d turn(s)", seen)
}

// BranchMessages returns the messages on fromLeaf's branch that are not on
// the active branch — the work a /tree switch is about to leave behind, in
// order, for summarization.
func (s *Session) BranchMessages(fromLeaf string) []llm.Message {
	onActive := map[string]bool{}
	for _, e := range s.activePath() {
		onActive[e.ID] = true
	}
	var out []llm.Message
	for _, e := range s.pathTo(fromLeaf) {
		if onActive[e.ID] {
			continue
		}
		if e.Type == entryTypeMessage && e.Message != nil {
			out = append(out, *e.Message)
		}
	}
	return out
}

// ---- JSONL codec ----

// fileHeader is the first line of a v2 session file.
type fileHeader struct {
	Type     string         `json:"type"`
	Version  int            `json:"version"`
	ID       string         `json:"id"`
	Title    string         `json:"title,omitempty"`
	Model    string         `json:"model,omitempty"`
	Provider string         `json:"provider,omitempty"`
	Mode     string         `json:"mode,omitempty"`
	Thinking string         `json:"thinking,omitempty"`
	ParentID string         `json:"parent_id,omitempty"`
	ForkedAt int            `json:"forked_at,omitempty"`
	Created  time.Time      `json:"created"`
	Updated  time.Time      `json:"updated"`
	Leaf     string         `json:"leaf,omitempty"`
	Epochs   []Epoch        `json:"epochs,omitempty"`
	Inbox    []DurableInput `json:"inbox,omitempty"`
}

// encodeJSONL renders the session in v2 format: header line, then one entry
// per line in file order.
func encodeJSONL(s *Session) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	head := fileHeader{
		Type: "session", Version: FormatVersion,
		ID: s.ID, Title: s.Title, Model: s.Model, Provider: s.Provider,
		Mode: s.Mode, Thinking: s.Thinking, ParentID: s.ParentID, ForkedAt: s.ForkedAt,
		Created: s.Created, Updated: s.Updated,
		Leaf: s.Leaf, Epochs: s.Epochs, Inbox: s.Inbox,
	}
	if err := enc.Encode(head); err != nil {
		return nil, err
	}
	for i := range s.Entries {
		if err := enc.Encode(s.Entries[i]); err != nil {
			return nil, err
		}
	}
	return buf.Bytes(), nil
}

// decodeJSONL parses a v2 session file and reconstructs the active
// conversation from the tree.
func decodeJSONL(raw []byte) (*Session, error) {
	sc := bufio.NewScanner(bytes.NewReader(raw))
	sc.Buffer(make([]byte, 0, 64*1024), 64*1024*1024)
	if !sc.Scan() {
		return nil, fmt.Errorf("empty session file")
	}
	var head fileHeader
	if err := json.Unmarshal(sc.Bytes(), &head); err != nil || head.Type != "session" {
		return nil, fmt.Errorf("not a session file header")
	}
	s := &Session{
		ID: head.ID, Title: head.Title, Model: head.Model, Provider: head.Provider,
		Mode: head.Mode, Thinking: head.Thinking, ParentID: head.ParentID, ForkedAt: head.ForkedAt,
		Created: head.Created, Updated: head.Updated,
		Leaf: head.Leaf, Epochs: head.Epochs, Inbox: head.Inbox,
	}
	for sc.Scan() {
		line := bytes.TrimSpace(sc.Bytes())
		if len(line) == 0 {
			continue
		}
		var e Entry
		if err := json.Unmarshal(line, &e); err != nil {
			continue // one bad line must not lose the session
		}
		s.Entries = append(s.Entries, e)
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	// A file whose header lost its leaf still has entries; fall back to the
	// last one so the session opens rather than opening empty.
	if s.Leaf == "" && len(s.Entries) > 0 {
		s.Leaf = s.Entries[len(s.Entries)-1].ID
	}
	s.Messages = s.ActiveMessages()
	return s, nil
}

func firstLine(s string) string {
	for i, r := range s {
		if r == '\n' {
			return s[:i]
		}
	}
	return s
}
