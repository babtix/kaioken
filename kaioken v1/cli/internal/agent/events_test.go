package agent

import (
	"context"
	"sync"
	"testing"

	"kaioken/internal/llm"
)

// collectEvents is a threadsafe event sink for tests.
type collectEvents struct {
	mu     sync.Mutex
	events []Event
}

func (c *collectEvents) emit(ev Event) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.events = append(c.events, ev)
}

func (c *collectEvents) kinds() []EventKind {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]EventKind, len(c.events))
	for i, e := range c.events {
		out[i] = e.Kind
	}
	return out
}

func (c *collectEvents) first(kind EventKind) (Event, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, e := range c.events {
		if e.Kind == kind {
			return e, true
		}
	}
	return Event{}, false
}

func TestRunWithEventsSequence(t *testing.T) {
	script := &scriptedServer{replies: []map[string]any{
		toolCallReply("read_file", `{"path":"a.txt"}`),
		finalReply("all done"),
	}}
	srv := script.server(t)
	defer srv.Close()

	sink := &collectEvents{}
	a := newRunAgent(t, srv.URL)
	a.UI = &EventsUI{Emit: sink.emit}

	_, err := RunWithEvents(context.Background(), a, []llm.Message{
		{Role: "system", Content: "test"},
		{Role: "user", Content: "read a.txt"},
	}, sink.emit)
	if err != nil {
		t.Fatal(err)
	}

	kinds := sink.kinds()
	if len(kinds) < 4 {
		t.Fatalf("too few events: %v", kinds)
	}
	if kinds[0] != EventAgentStart {
		t.Errorf("first event = %s, want agent_start", kinds[0])
	}
	if kinds[len(kinds)-1] != EventAgentEnd {
		t.Errorf("last event = %s, want agent_end", kinds[len(kinds)-1])
	}
	toolStart, ok := sink.first(EventToolStart)
	if !ok || toolStart.Tool != "read_file" {
		t.Errorf("missing tool_start for read_file: %+v", toolStart)
	}
	toolEnd, ok := sink.first(EventToolEnd)
	if !ok || toolEnd.IsError {
		t.Errorf("tool_end wrong: %+v", toolEnd)
	}
	final, ok := sink.first(EventAssistant)
	if !ok || final.Text != "all done" {
		t.Errorf("assistant event wrong: %+v", final)
	}
	end, _ := sink.first(EventAgentEnd)
	if end.Err != "" {
		t.Errorf("agent_end carries error: %q", end.Err)
	}
}

func TestEventsUIDeniesWithoutApprover(t *testing.T) {
	sink := &collectEvents{}
	ui := &EventsUI{Emit: sink.emit}
	if ui.Approve(ApprovalRequest{Action: "write", Target: "x.txt"}) {
		t.Fatal("nil approver must deny")
	}
	req, ok := sink.first(EventApprovalRequired)
	if !ok || req.Action != "write" || req.ApprovalID == "" {
		t.Errorf("approval_required wrong: %+v", req)
	}
	res, ok := sink.first(EventApprovalResolved)
	if !ok || res.Approved || res.ApprovalID != req.ApprovalID {
		t.Errorf("approval_resolved wrong: %+v", res)
	}
}

func TestEventsUIApproverDecides(t *testing.T) {
	sink := &collectEvents{}
	ui := &EventsUI{
		Emit: sink.emit,
		Approver: ApproverFunc(func(_ string, req ApprovalRequest) bool {
			return req.Action == "edit"
		}),
	}
	if !ui.Approve(ApprovalRequest{Action: "edit", Target: "x"}) {
		t.Error("edit should be approved")
	}
	if ui.Approve(ApprovalRequest{Action: "run", Target: "rm -rf"}) {
		t.Error("run should be denied")
	}
}
