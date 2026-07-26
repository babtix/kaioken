package daemon

import (
	"context"
	"encoding/json"
	"strings"
	"sync/atomic"
	"time"

	"kaioken/internal/agent"
)

// chatUI implements agent.UI by publishing events through the hub and blocking
// on the approval registry. It is the direct analogue of uiAdapter in
// internal/tui/tui.go — same shape, different destination.
type chatUI struct {
	hub         *Hub
	approvals   *Approvals
	run         *RunRecord
	ws          *Workspace
	sessionID   string
	ctx         context.Context
	autoApprove *atomic.Bool
	msgIndex    int
}

func (u *chatUI) AssistantDelta(text string) {
	u.hub.ChatDelta(u.ws.ID, u.run.ID, u.sessionID, text)
}

func (u *chatUI) Assistant(text string) {
	u.hub.ChatMessage(u.ws.ID, u.run.ID, u.sessionID, "assistant", text, u.msgIndex)
	u.msgIndex++
}

func (u *chatUI) Tool(name, args string) {
	u.hub.Publish("chat.tool_call", map[string]any{
		"workspace_id": u.ws.ID, "run_id": u.run.ID, "session_id": u.sessionID,
		"call_id": "", "name": name, "args": args, "summary": compactArgs(args),
	})
}

func (u *chatUI) ToolResult(name, result string, isErr bool) {
	u.hub.Publish("chat.tool_result", map[string]any{
		"workspace_id": u.ws.ID, "run_id": u.run.ID, "session_id": u.sessionID,
		"call_id": "", "result": truncate(result, 2000), "is_error": isErr, "duration_ms": 0,
	})
}

func (u *chatUI) Info(text string) {
	u.hub.RunLog(u.ws.ID, u.run.ID, "info", text)
}

func (u *chatUI) RecordUndo(e agent.UndoEntry) {
	u.ws.pushUndo(e)
	u.hub.Publish("undo.recorded", map[string]any{
		"workspace_id": u.ws.ID, "path": e.Path, "had_previous": e.HadPrevious,
	})
}

// Approve BLOCKS the agent goroutine — by design; that is the contract of
// agent.UI. It registers a pending approval, publishes approval.request, and
// waits for the front-end's POST, a timeout, or cancellation.
func (u *chatUI) Approve(req agent.ApprovalRequest) bool {
	if u.autoApprove.Load() {
		return true
	}
	id, ch := u.approvals.Register(u.run.ID, req)

	// Build the structured diff for the event payload.
	var diff any
	if req.Action != "run" {
		diff = u.diffFor(req)
	}

	u.hub.Publish("approval.request", map[string]any{
		"workspace_id": u.ws.ID,
		"approval": map[string]any{
			"approval_id": id,
			"run_id":      u.run.ID,
			"workspace_id": u.ws.ID,
			"action":      req.Action,
			"target":      req.Target,
			"preview":     req.Preview,
			"diff":        diff,
			"command":     commandOrNil(req),
			"expires_at":  time.Now().Add(5 * time.Minute).Format(time.RFC3339),
		},
	})

	select {
	case d := <-ch:
		u.hub.Publish("approval.resolved", map[string]any{
			"approval_id": id, "decision": string(d), "by": "user",
		})
		if d == DecisionApproveAll {
			u.autoApprove.Store(true)
			return true
		}
		return d == DecisionApprove
	case <-time.After(5 * time.Minute):
		u.approvals.Expire(id)
		u.hub.Publish("approval.resolved", map[string]any{
			"approval_id": id, "decision": "deny", "by": "timeout",
		})
		return false // a timeout must DENY, never approve
	case <-u.ctx.Done():
		u.approvals.Expire(id)
		return false
	}
}

// diffFor builds the structured diff object for an approval request.
func (u *chatUI) diffFor(req agent.ApprovalRequest) map[string]any {
	// For write/edit, compute hunks from the preview (old → new).
	// The preview is the text diff the TUI shows; for the structured version
	// we need the actual file contents. Since the agent already computed the
	// preview from old/new content, we parse it into hunks.
	kind := req.Action
	isNew := strings.Contains(req.Preview, "(new file)")

	hunks := agent.DiffHunks("", "") // placeholder — real diff comes from file state
	// For now, emit the preview-based info. The full structured diff with
	// actual file contents will be wired when the agent exposes old/new.
	_ = hunks

	return map[string]any{
		"path":        req.Target,
		"kind":        kind,
		"is_new_file": isNew,
		"added":       0,
		"removed":     0,
		"hunks":       []any{},
	}
}

func commandOrNil(req agent.ApprovalRequest) any {
	if req.Action == "run" {
		return req.Target
	}
	return nil
}

// compactArgs extracts the most relevant argument from a tool call's JSON args
// for the one-line summary. Mirrors internal/tui's compactArgs without the
// lipgloss dependency.
func compactArgs(args string) string {
	var m map[string]any
	if err := json.Unmarshal([]byte(args), &m); err != nil {
		return truncate(strings.ReplaceAll(args, "\n", " "), 80)
	}
	for _, k := range []string{"path", "command", "query"} {
		if v, ok := m[k].(string); ok {
			return truncate(v, 80)
		}
	}
	return ""
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}
