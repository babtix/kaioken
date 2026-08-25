// Fork and import.
//
// A linear session answers "where was I?"; a fork answers "what if I had
// gone the other way?". Forking copies the first part of a conversation
// into a new session file — the source is never touched — so an alternative
// approach can be explored without losing the branch that already exists.
// Import brings a transcript from outside (another repo, another tool) into
// the same lifecycle.
package session

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"kaioken/internal/llm"
)

// SafeCut clamps a fork boundary to a position a provider will accept. A
// history may not end on an assistant message with unanswered tool calls,
// and a tool result may not be separated from the call that produced it —
// so the only safe places to cut are immediately before a user message, or
// the very ends. Requested cuts elsewhere move backwards to the nearest
// user message.
func SafeCut(messages []llm.Message, cut int) int {
	if cut >= len(messages) {
		return len(messages)
	}
	if cut < 0 {
		cut = 0
	}
	for cut > 0 && messages[cut].Role != "user" {
		cut--
	}
	return cut
}

// CutAfterTurn returns the message index that keeps the first n user turns
// complete — each turn with all of its assistant replies and tool results —
// and drops everything after. n past the end keeps the whole conversation.
func (s *Session) CutAfterTurn(n int) int {
	if n <= 0 {
		return 0
	}
	seen := 0
	for i, m := range s.Messages {
		if m.Role == "user" {
			seen++
			if seen == n+1 {
				return i
			}
		}
	}
	return len(s.Messages)
}

// ForkAt creates a new session that keeps the first cut messages of s and
// records its lineage. It returns the fork and the tail that was left
// behind — the caller may want to summarize what the fork abandons. The
// source session is not modified; the fork is not yet saved.
func (s *Session) ForkAt(cut int) (*Session, []llm.Message) {
	cut = SafeCut(s.Messages, cut)
	fork := New(s.Model, s.Provider)
	fork.ParentID = s.ID
	fork.ForkedAt = cut
	fork.Mode = s.Mode
	fork.Messages = append([]llm.Message(nil), s.Messages[:cut]...)
	if title := deriveTitle(fork.Messages); title != "(no prompt yet)" {
		fork.Title = "⑂ " + title
	}
	return fork, s.Messages[cut:]
}

// Import reads an external transcript — a saved Session, a JSON array of
// messages, or JSONL with one message per line — and creates a new session
// from it. The new session is saved before it is returned, so it appears in
// listings immediately.
func Import(repo, filePath, model, provider string) (*Session, error) {
	raw, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}
	msgs, err := parseTranscript(raw)
	if err != nil {
		return nil, fmt.Errorf("parsing %s: %w", filePath, err)
	}
	s := New(model, provider)
	s.Record(msgs)
	if err := s.SaveForce(repo); err != nil {
		return nil, err
	}
	return s, nil
}

// parseTranscript accepts the shapes a conversation travels in.
func parseTranscript(raw []byte) ([]llm.Message, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil, fmt.Errorf("file is empty")
	}

	// A v2 tree session: header line, then entries. The active branch is the
	// transcript such a file carries.
	if bytes.HasPrefix(trimmed, []byte(`{"type":"session"`)) {
		if s, err := decodeJSONL(trimmed); err == nil {
			return validMessages(s.Messages)
		}
	}

	// A full saved session (ours or a compatible tool's).
	var full struct {
		Messages []llm.Message `json:"messages"`
	}
	if err := json.Unmarshal(trimmed, &full); err == nil && len(full.Messages) > 0 {
		return validMessages(full.Messages)
	}

	// A bare JSON array of messages.
	var arr []llm.Message
	if err := json.Unmarshal(trimmed, &arr); err == nil && len(arr) > 0 {
		return validMessages(arr)
	}

	// JSONL: one message object per line. Lines that are not messages
	// (event records from other tools) are skipped rather than fatal — the
	// transcript inside is what matters.
	var msgs []llm.Message
	sc := bufio.NewScanner(bytes.NewReader(trimmed))
	sc.Buffer(make([]byte, 0, 1024*1024), 16*1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var m llm.Message
		if err := json.Unmarshal([]byte(line), &m); err == nil && m.Role != "" {
			msgs = append(msgs, m)
		}
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	return validMessages(msgs)
}

// validMessages keeps entries that carry a role and rejects an import that
// yields nothing — an empty session helps nobody.
func validMessages(msgs []llm.Message) ([]llm.Message, error) {
	var out []llm.Message
	for _, m := range msgs {
		if m.Role != "" {
			out = append(out, m)
		}
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("no messages found — expected a saved session, a JSON array of messages, or JSONL")
	}
	return out, nil
}
