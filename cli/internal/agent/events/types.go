// Package events is the agent's lifecycle bus. Every notable moment in a
// run — a turn starting, a tool executing, a compaction firing — is emitted
// as an Event, and any part of the program (the TUI, the daemon, an
// extension host) can subscribe without the agent knowing who is listening.
//
// Two event kinds are interceptable: a ToolCall handler may block the call
// or rewrite its arguments, and a ToolResult handler may rewrite the result
// before the model sees it. Everything else is observational.
package events

import "kaioken/internal/llm"

// Type identifies what happened.
type Type string

const (
	// Run lifecycle.
	AgentStart Type = "agent_start" // a Run began
	AgentEnd   Type = "agent_end"   // a Run finished (Err set on failure)
	TurnStart  Type = "turn_start"  // one model call is about to be made
	TurnEnd    Type = "turn_end"    // the model call and its tool batch completed

	// Assistant message lifecycle. MessageUpdate carries streaming deltas
	// and fires on the network goroutine — handlers must be quick and
	// thread-safe.
	MessageStart  Type = "message_start"
	MessageUpdate Type = "message_update"
	MessageEnd    Type = "message_end"

	// Tool execution, observational.
	ToolExecutionStart  Type = "tool_execution_start"
	ToolExecutionUpdate Type = "tool_execution_update" // partial output while running
	ToolExecutionEnd    Type = "tool_execution_end"

	// Interceptable hooks.
	BeforeProviderRequest Type = "before_provider_request" // may mutate History
	ToolCall              Type = "tool_call"               // may Block or rewrite ToolArgs
	ToolResult            Type = "tool_result"             // may rewrite Result

	// Compaction and retry.
	CompactionStart Type = "compaction_start"
	CompactionEnd   Type = "compaction_end"
	RetryStart      Type = "retry_start"
	RetryEnd        Type = "retry_end"

	// Session lifecycle. SessionBeforeSwitch/Fork fire before the change is
	// applied; a handler may Block to veto it.
	SessionBeforeSwitch Type = "session_before_switch"
	SessionBeforeFork   Type = "session_before_fork"
)

// Event is one lifecycle moment. Which fields are populated depends on
// Type; unrelated fields are left zero. Handlers receive a pointer and, for
// the interceptable types, communicate back by mutating it.
type Event struct {
	Type Type

	// Turn index within the run, when the event belongs to a turn.
	Step int

	// Depth is the emitting agent's delegation depth: 0 is the agent the
	// user talks to, 1 a task-tool sub-agent. Sub-agents share their
	// parent's bus, so subscribers use this to tell the streams apart.
	Depth int

	// Tool fields (ToolExecution*, ToolCall, ToolResult).
	ToolName   string
	ToolCallID string
	ToolArgs   string // JSON arguments; a ToolCall handler may rewrite it
	Result     string // a ToolResult handler may rewrite it
	Partial    string // ToolExecutionUpdate: the newest chunk of output
	IsError    bool

	// Text is prose: assistant deltas/content, compaction notes, retry
	// reasons.
	Text string

	// Err is set on AgentEnd, TurnEnd, ToolExecutionEnd and Retry* when the
	// underlying operation failed.
	Err error

	// SessionID names the target of Session* events.
	SessionID string

	// History is the outgoing conversation for BeforeProviderRequest. A
	// handler may mutate messages in place or replace the slice through the
	// pointer; the agent sends whatever is left here.
	History *[]llm.Message

	// Block, set by a handler of an interceptable event, cancels the
	// operation. BlockReason is surfaced to the model (tool_call) or the
	// user (session events).
	Block       bool
	BlockReason string
}
