package agent

// Typed agent events.
//
// The UI interface tells one front-end what to draw. An Event tells any
// consumer what happened — the TUI, a headless run printing JSON lines, an
// RPC client driving the agent from another process. The event stream is the
// contract that keeps those front-ends from each inventing a slightly
// different vocabulary for the same run: they all subscribe to the same
// typed sequence, and approval becomes a request/response pair inside it
// instead of a blocking method only an interactive screen can implement.

import (
	"context"
	"strconv"
	"sync/atomic"

	"kaioken/internal/llm"
)

// EventKind names one kind of agent event.
type EventKind string

const (
	// EventAgentStart opens a run; EventAgentEnd closes it (Err set on failure).
	EventAgentStart EventKind = "agent_start"
	EventAgentEnd   EventKind = "agent_end"
	// EventAssistantDelta is streamed prose; EventAssistant the complete text.
	EventAssistantDelta EventKind = "assistant_delta"
	EventAssistant      EventKind = "assistant"
	// EventToolStart announces a tool call; EventToolEnd carries its result.
	EventToolStart EventKind = "tool_start"
	EventToolEnd   EventKind = "tool_end"
	// EventInfo is a status note (budget warnings, sub-agent progress).
	EventInfo EventKind = "info"
	// EventApprovalRequired asks the consumer to decide; EventApprovalResolved
	// reports the decision that was made.
	EventApprovalRequired EventKind = "approval_required"
	EventApprovalResolved EventKind = "approval_resolved"
	// EventUndoRecorded reports that a write/edit captured an undo entry.
	EventUndoRecorded EventKind = "undo_recorded"
)

// Event is one entry in the agent's event stream. Only the fields relevant
// to the Kind are set; the struct is flat so it serializes to a stable JSON
// shape for headless and RPC consumers.
type Event struct {
	Kind EventKind `json:"kind"`
	// Text carries prose: deltas, complete replies, info lines, errors.
	Text string `json:"text,omitempty"`
	// Tool call fields.
	Tool    string `json:"tool,omitempty"`
	Args    string `json:"args,omitempty"`
	Result  string `json:"result,omitempty"`
	IsError bool   `json:"is_error,omitempty"`
	// Err is the run error on agent_end, empty on success.
	Err string `json:"error,omitempty"`
	// Approval fields.
	ApprovalID string `json:"approval_id,omitempty"`
	Action     string `json:"action,omitempty"`
	Target     string `json:"target,omitempty"`
	Preview    string `json:"preview,omitempty"`
	Approved   bool   `json:"approved,omitempty"`
	// Path is the file behind an undo entry.
	Path string `json:"path,omitempty"`
}

// Approver decides approval requests on behalf of an event-stream consumer.
// Decide blocks until a decision exists; returning false denies. The id ties
// the decision to the EventApprovalRequired event that announced it.
type Approver interface {
	Decide(id string, req ApprovalRequest) bool
}

// ApproverFunc adapts a function to the Approver interface.
type ApproverFunc func(id string, req ApprovalRequest) bool

// Decide implements Approver.
func (f ApproverFunc) Decide(id string, req ApprovalRequest) bool { return f(id, req) }

// DenyAll is the safe default policy for unattended runs: every state-
// changing action is declined, and the model is told so.
var DenyAll = ApproverFunc(func(string, ApprovalRequest) bool { return false })

// approvalSeq numbers approval requests process-wide, so ids stay unique
// across concurrent runs feeding one consumer.
var approvalSeq atomic.Int64

// EventsUI implements the UI interface by translating every callback into a
// typed Event. It is how non-TUI front-ends (headless run, RPC) consume a
// run: the same agent, a different subscriber.
type EventsUI struct {
	// Emit receives every event, in order, from the agent's goroutine. It
	// must not be nil and should not block longer than the consumer can
	// afford — the agent waits on it.
	Emit func(Event)
	// Approver decides approval requests. Nil denies everything (DenyAll).
	Approver Approver
	// OnUndo receives undo entries so a front-end can offer reverts. Nil
	// discards them (the event is still emitted).
	OnUndo func(UndoEntry)
}

func (u *EventsUI) AssistantDelta(text string) {
	u.Emit(Event{Kind: EventAssistantDelta, Text: text})
}

func (u *EventsUI) Assistant(text string) {
	u.Emit(Event{Kind: EventAssistant, Text: text})
}

func (u *EventsUI) Tool(name, args string) {
	u.Emit(Event{Kind: EventToolStart, Tool: name, Args: args})
}

func (u *EventsUI) ToolResult(name, result string, isErr bool) {
	u.Emit(Event{Kind: EventToolEnd, Tool: name, Result: result, IsError: isErr})
}

func (u *EventsUI) Info(text string) {
	u.Emit(Event{Kind: EventInfo, Text: text})
}

func (u *EventsUI) Approve(req ApprovalRequest) bool {
	id := "appr_" + strconv.FormatInt(approvalSeq.Add(1), 10)
	u.Emit(Event{
		Kind:       EventApprovalRequired,
		ApprovalID: id,
		Action:     req.Action,
		Target:     req.Target,
		Preview:    req.Preview,
	})
	approver := u.Approver
	if approver == nil {
		approver = DenyAll
	}
	ok := approver.Decide(id, req)
	u.Emit(Event{Kind: EventApprovalResolved, ApprovalID: id, Approved: ok})
	return ok
}

func (u *EventsUI) RecordUndo(e UndoEntry) {
	if u.OnUndo != nil {
		u.OnUndo(e)
	}
	u.Emit(Event{Kind: EventUndoRecorded, Path: e.Path})
}

// RunWithEvents drives a.Run bracketed by agent_start and agent_end events.
// The agent's UI should be the EventsUI feeding the same emit function, so
// the consumer sees one coherent stream.
func RunWithEvents(ctx context.Context, a *Agent, history []llm.Message, emit func(Event)) ([]llm.Message, error) {
	emit(Event{Kind: EventAgentStart})
	out, err := a.Run(ctx, history)
	end := Event{Kind: EventAgentEnd}
	if err != nil {
		end.Err = err.Error()
	}
	emit(end)
	return out, err
}
