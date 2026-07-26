package daemon

import (
	"encoding/json"
	"sync"
	"sync/atomic"
	"time"
)

// ringSize is the replay buffer depth (docs/02-api-contract.md §2.2): a
// client reconnecting with a `since` older than this receives `stream.reset`.
const ringSize = 512

// subBuffer is each subscriber channel's capacity. A slow subscriber is
// dropped rather than allowed to stall a publisher — see Publish.
const subBuffer = 256

// Event is one item on the stream. Data holds the type-specific fields,
// flattened into the top level of the JSON frame alongside Seq/Type/Ts and
// whichever of WorkspaceID/RunID/SessionID are non-empty.
type Event struct {
	Seq         uint64
	Type        string
	TS          time.Time
	WorkspaceID string
	RunID       string
	SessionID   string
	Data        map[string]any
}

// MarshalJSON flattens Data alongside the event's own fields, exactly as
// docs/02-api-contract.md §2.2 shows: `{"seq":…,"ts":…,"type":…,…fields}`.
func (e Event) MarshalJSON() ([]byte, error) {
	m := make(map[string]any, len(e.Data)+6)
	for k, v := range e.Data {
		m[k] = v
	}
	m["seq"] = e.Seq
	m["type"] = e.Type
	m["ts"] = e.TS.Format(time.RFC3339)
	if e.WorkspaceID != "" {
		m["workspace_id"] = e.WorkspaceID
	}
	if e.RunID != "" {
		m["run_id"] = e.RunID
	}
	if e.SessionID != "" {
		m["session_id"] = e.SessionID
	}
	return json.Marshal(m)
}

// Hub fans out events to every SSE connection in the process and retains the
// last ringSize of them so a reconnecting client can replay what it missed.
type Hub struct {
	mu      sync.Mutex
	seq     atomic.Uint64
	ring    [ringSize]Event
	head    int // next write position; also the oldest retained slot once full
	count   int // number of valid ring entries, caps at ringSize
	subs    map[uint64]chan Event
	nextSub uint64
}

func NewHub() *Hub {
	return &Hub{subs: make(map[uint64]chan Event)}
}

// Publish assigns the next seq, writes the ring, and fans out
// non-blockingly: a subscriber whose buffer is full is dropped (its channel
// closed and removed) rather than allowed to stall a pipeline run.
func (h *Hub) Publish(typ string, fields map[string]any) uint64 {
	seq := h.seq.Add(1)
	ev := Event{Seq: seq, Type: typ, TS: time.Now(), Data: fields}
	if v, ok := fields["workspace_id"].(string); ok {
		ev.WorkspaceID = v
	}
	if v, ok := fields["run_id"].(string); ok {
		ev.RunID = v
	}
	if v, ok := fields["session_id"].(string); ok {
		ev.SessionID = v
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	h.ring[h.head] = ev
	h.head = (h.head + 1) % ringSize
	if h.count < ringSize {
		h.count++
	}

	for id, ch := range h.subs {
		select {
		case ch <- ev:
		default:
			delete(h.subs, id)
			close(ch)
		}
	}
	return seq
}

// Subscribe registers a channel for future events. It first backfills
// anything already published with Seq > since — closing the gap between a
// caller's own Replay(since) and this call — then adds it to the live fan-out
// set. The returned func unsubscribes and closes the channel; callers must
// call it exactly once.
func (h *Hub) Subscribe(since uint64) (<-chan Event, func()) {
	h.mu.Lock()
	defer h.mu.Unlock()

	ch := make(chan Event, subBuffer)
	if backfill, ok := h.replayLocked(since); ok {
		for _, ev := range backfill {
			select {
			case ch <- ev:
			default:
			}
		}
	}

	h.nextSub++
	id := h.nextSub
	h.subs[id] = ch

	var once sync.Once
	unsub := func() {
		once.Do(func() {
			h.mu.Lock()
			defer h.mu.Unlock()
			if existing, ok := h.subs[id]; ok {
				delete(h.subs, id)
				close(existing)
			}
		})
	}
	return ch, unsub
}

// Replay returns retained events with Seq > since, oldest first. ok is false
// when since is older than the buffer's oldest retained event — the caller
// must then emit stream.reset rather than trust a replay with a gap in it.
func (h *Hub) Replay(since uint64) ([]Event, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.replayLocked(since)
}

func (h *Hub) replayLocked(since uint64) ([]Event, bool) {
	all := h.orderedLocked()
	if len(all) == 0 {
		return nil, true
	}
	oldest := all[0].Seq
	if since != 0 && since < oldest-1 {
		return nil, false
	}
	out := make([]Event, 0, len(all))
	for _, ev := range all {
		if ev.Seq > since {
			out = append(out, ev)
		}
	}
	return out, true
}

// CurrentSeq returns the most recently assigned Seq (0 if nothing has been
// published yet).
func (h *Hub) CurrentSeq() uint64 {
	return h.seq.Load()
}

// OldestSeq returns the Seq of the oldest currently retained event, or 0 if
// the ring is empty. Used for the stream.reset frame's from_seq field.
func (h *Hub) OldestSeq() uint64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	all := h.orderedLocked()
	if len(all) == 0 {
		return 0
	}
	return all[0].Seq
}

// orderedLocked returns the ring's current contents oldest-first. Caller
// must hold h.mu.
func (h *Hub) orderedLocked() []Event {
	if h.count == 0 {
		return nil
	}
	if h.count < ringSize {
		out := make([]Event, h.count)
		copy(out, h.ring[:h.count])
		return out
	}
	out := make([]Event, 0, ringSize)
	out = append(out, h.ring[h.head:]...)
	out = append(out, h.ring[:h.head]...)
	return out
}

// ── typed publishers — one per docs/02-api-contract.md §2.3 event type.
// No raw string literals for event names outside this file.

func (h *Hub) WorkspaceOpened(workspace any) uint64 {
	return h.Publish("workspace.opened", map[string]any{"workspace": workspace})
}

func (h *Hub) WorkspaceClosed(workspaceID string) uint64 {
	return h.Publish("workspace.closed", map[string]any{"workspace_id": workspaceID})
}

func (h *Hub) WorkspaceChanged(workspaceID string, fields []string) uint64 {
	return h.Publish("workspace.changed", map[string]any{"workspace_id": workspaceID, "fields": fields})
}

func (h *Hub) RunStarted(workspaceID string, run any) uint64 {
	return h.Publish("run.started", map[string]any{"workspace_id": workspaceID, "run": run})
}

func (h *Hub) RunProgress(workspaceID, runID, phase, message string, done, total int) uint64 {
	return h.Publish("run.progress", map[string]any{
		"workspace_id": workspaceID, "run_id": runID, "phase": phase, "message": message, "done": done, "total": total,
	})
}

func (h *Hub) RunLog(workspaceID, runID, level, text string) uint64 {
	return h.Publish("run.log", map[string]any{"workspace_id": workspaceID, "run_id": runID, "level": level, "text": text})
}

func (h *Hub) RunArtifact(workspaceID, runID, path string, lines int, kind string) uint64 {
	return h.Publish("run.artifact", map[string]any{
		"workspace_id": workspaceID, "run_id": runID, "path": path, "lines": lines, "kind": kind,
	})
}

func (h *Hub) RunFinished(workspaceID, runID, state string, durationMs int64, errMsg string, summary any) uint64 {
	fields := map[string]any{
		"workspace_id": workspaceID, "run_id": runID, "state": state, "duration_ms": durationMs, "summary": summary,
	}
	if errMsg != "" {
		fields["error"] = errMsg
	}
	return h.Publish("run.finished", fields)
}

func (h *Hub) ChatDelta(workspaceID, runID, sessionID, text string) uint64 {
	return h.Publish("chat.delta", map[string]any{
		"workspace_id": workspaceID, "run_id": runID, "session_id": sessionID, "text": text,
	})
}

func (h *Hub) ChatMessage(workspaceID, runID, sessionID, role string, content any, index int) uint64 {
	return h.Publish("chat.message", map[string]any{
		"workspace_id": workspaceID, "run_id": runID, "session_id": sessionID, "role": role, "content": content, "index": index,
	})
}

func (h *Hub) ChatToolCall(workspaceID, runID, sessionID, callID, name string, args any, summary string) uint64 {
	return h.Publish("chat.tool_call", map[string]any{
		"workspace_id": workspaceID, "run_id": runID, "session_id": sessionID,
		"call_id": callID, "name": name, "args": args, "summary": summary,
	})
}

func (h *Hub) ChatToolResult(workspaceID, runID, sessionID, callID string, result any, isErr bool, durationMs int64) uint64 {
	return h.Publish("chat.tool_result", map[string]any{
		"workspace_id": workspaceID, "run_id": runID, "session_id": sessionID,
		"call_id": callID, "result": result, "is_error": isErr, "duration_ms": durationMs,
	})
}

func (h *Hub) ApprovalRequest(workspaceID, runID string, approval any) uint64 {
	return h.Publish("approval.request", map[string]any{
		"workspace_id": workspaceID, "run_id": runID, "approval": approval,
	})
}

func (h *Hub) ApprovalResolved(workspaceID, approvalID, decision, by string) uint64 {
	return h.Publish("approval.resolved", map[string]any{
		"workspace_id": workspaceID, "approval_id": approvalID, "decision": decision, "by": by,
	})
}

func (h *Hub) UndoRecorded(workspaceID, path string, hadPrevious bool, depth int) uint64 {
	return h.Publish("undo.recorded", map[string]any{
		"workspace_id": workspaceID, "path": path, "had_previous": hadPrevious, "depth": depth,
	})
}

func (h *Hub) UsageUpdated(workspaceID string, calls, promptTokens, completionTokens int) uint64 {
	return h.Publish("usage.updated", map[string]any{
		"workspace_id": workspaceID, "calls": calls, "prompt_tokens": promptTokens, "completion_tokens": completionTokens,
	})
}

func (h *Hub) SessionUpdated(workspaceID string, session any) uint64 {
	return h.Publish("session.updated", map[string]any{"workspace_id": workspaceID, "session": session})
}

func (h *Hub) ErrorEvent(code, message string) uint64 {
	return h.Publish("error", map[string]any{"code": code, "message": message})
}
