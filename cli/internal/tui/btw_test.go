package tui

import (
	"strings"
	"testing"

	"kaioken/internal/agent"
)

// /btw records context without starting a turn: the message joins the
// conversation framed as an aside, and no chat run begins.
func TestBTWRecordsAsideWithoutStartingATurn(t *testing.T) {
	m := newTestModel(t)
	before := len(m.conversation)

	updated, _ := m.dispatch("/btw staging is down, ignore those failures")
	got := updated.(Model)

	if len(got.conversation) != before+1 {
		t.Fatalf("conversation grew by %d, want 1", len(got.conversation)-before)
	}
	last := got.conversation[len(got.conversation)-1]
	if last.Role != "user" {
		t.Errorf("role = %q, want user", last.Role)
	}
	body, ok := agent.AsideBody(last.Content)
	if !ok {
		t.Fatalf("message is not framed as an aside: %q", last.Content)
	}
	if body != "staging is down, ignore those failures" {
		t.Errorf("body = %q, want the typed text", body)
	}
	if got.busy || got.runningAgent != nil {
		t.Error("/btw started an agent run — it must not spend a turn")
	}
	if joined := strings.Join(got.lines, "\n"); !strings.Contains(joined, "next reply") {
		t.Errorf("transcript does not say when the agent will see it:\n%s", joined)
	}
}

// A bare /btw explains itself instead of recording an empty note.
func TestBTWWithoutTextExplainsItself(t *testing.T) {
	m := newTestModel(t)
	before := len(m.conversation)

	updated, _ := m.dispatch("/btw")
	got := updated.(Model)

	if len(got.conversation) != before {
		t.Errorf("bare /btw recorded a message; conversation grew by %d", len(got.conversation)-before)
	}
	if joined := strings.Join(got.lines, "\n"); !strings.Contains(joined, "usage:") {
		t.Errorf("bare /btw did not print usage:\n%s", joined)
	}
}

// While a chat turn is running the aside goes through the steering queue —
// appending to m.conversation there would be lost when the run returns its
// own history.
func TestBTWSteersWhileTheAgentIsRunning(t *testing.T) {
	m := newTestModel(t)
	ag := &agent.Agent{}
	m.runningAgent = ag
	before := len(m.conversation)

	updated, _ := m.dispatch("/btw the file moved")
	got := updated.(Model)

	if n := ag.QueuedCount(); n != 1 {
		t.Fatalf("%d messages queued, want 1", n)
	}
	if len(got.conversation) != before {
		t.Errorf("aside was appended to the conversation as well; grew by %d", len(got.conversation)-before)
	}
	if joined := strings.Join(got.lines, "\n"); !strings.Contains(joined, "current step") {
		t.Errorf("transcript does not say the aside was queued:\n%s", joined)
	}
}
