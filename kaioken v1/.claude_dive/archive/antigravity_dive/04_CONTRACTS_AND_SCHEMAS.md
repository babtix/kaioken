# Kaioken v2 — Interface Contracts & Data Schemas

**Location:** `.antigravity_dive/04_CONTRACTS_AND_SCHEMAS.md`  
**Date:** 2026-08-23  
**Status:** Authoritative Implementation Specification  
**Language / Protocols:** Go 1.24, JSON-RPC 2.0, SSE, JSONL, YAML  

---

## 1. Daemon JSON-RPC 2.0 & SSE Protocol Specification

The Kaioken Daemon exposes a local JSON-RPC 2.0 interface over `AF_UNIX` (`~/.kaioken/daemon.sock`) and Named Pipe (`\\.\pipe\kaioken-daemon`) / Loopback TCP (`127.0.0.1:41731`).

### 1.1 JSON-RPC Methods

#### `session.create`
* **Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "session.create",
  "params": {
    "workspace_root": "d:/project/ai_now_know",
    "model": "gemini-3.7-flash",
    "parent_id": null
  }
}
```
* **Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "session_id": "ses_01j6k8wz9e8x",
    "created_at": "2026-08-23T19:00:00Z",
    "leaf_id": "ent_001"
  }
}
```

#### `turn.submit`
* **Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "turn.submit",
  "params": {
    "session_id": "ses_01j6k8wz9e8x",
    "prompt": "Refactor internal/retrieval to add lexical tokenizer",
    "attachments": []
  }
}
```
* **Response:** Returns immediate acknowledgment with `run_id`. Real-time progress is streamed over the SSE endpoint.

#### `turn.approve`
* **Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "turn.approve",
  "params": {
    "run_id": "run_01j6k8x5m2q",
    "call_id": "call_98231",
    "verdict": "AllowSession" // AllowOnce | AllowSession | AllowAlways | Deny
  }
}
```

---

### 1.2 SSE Stream Event Schemas (`GET /events?run_id=...`)

```json
// Event: chunk (Partial model text)
{
  "event": "chunk",
  "data": {
    "text": "I am modifying lexical.go to add tokenization."
  }
}

// Event: tool_start (Tool execution pending approval / dispatch)
{
  "event": "tool_start",
  "data": {
    "call_id": "call_98231",
    "tool_name": "edit_file",
    "args": {
      "path": "cli/internal/retrieval/lexical.go",
      "target": "func Tokenize()...",
      "replacement": "func Tokenize(text string)..."
    }
  }
}

// Event: approval_required (Prompts client for 4-state verdict)
{
  "event": "approval_required",
  "data": {
    "call_id": "call_98231",
    "tool_name": "run_command",
    "command": "go test -race ./...",
    "risk_level": "medium"
  }
}

// Event: tool_done (Tool output completed)
{
  "event": "tool_done",
  "data": {
    "call_id": "call_98231",
    "tool_name": "edit_file",
    "duration_ms": 42,
    "success": true,
    "output_preview": "Successfully modified lexical.go"
  }
}

// Event: turn_completed (Turn finished)
{
  "event": "turn_completed",
  "data": {
    "run_id": "run_01j6k8x5m2q",
    "leaf_id": "ent_045",
    "total_tokens": 4120,
    "cost_usd": 0.0014,
    "signals_detected": ["error_recovery"]
  }
}
```

---

## 2. Session JSONL Tree Storage Format

Sessions are stored at `.kaioken/sessions/<session_id>.jsonl`. The format uses tree nodes linked by `parent_id` to support branching, forks, and rollbacks.

```json
{"type": "header", "version": 2, "session_id": "ses_01j6k8wz9e8x", "workspace": "d:/project/ai_now_know", "created_at": "2026-08-23T19:00:00Z"}
{"type": "entry", "id": "ent_001", "parent_id": null, "turn_id": "turn_1", "role": "user", "content": "Refactor retrieval", "timestamp": "2026-08-23T19:00:01Z"}
{"type": "entry", "id": "ent_002", "parent_id": "ent_001", "turn_id": "turn_1", "role": "assistant", "content": "Checking files...", "tool_calls": [{"id": "call_1", "name": "read_file", "args": {"path": "cli/internal/retrieval/chunk.go"}}], "timestamp": "2026-08-23T19:00:03Z"}
{"type": "entry", "id": "ent_003", "parent_id": "ent_002", "turn_id": "turn_1", "role": "tool", "tool_call_id": "call_1", "content": "package retrieval...", "timestamp": "2026-08-23T19:00:04Z"}
{"type": "entry", "id": "ent_004", "parent_id": "ent_003", "turn_id": "turn_1", "role": "assistant", "content": "Refactor complete.", "timestamp": "2026-08-23T19:00:08Z"}
```

---

## 3. Knowledge Artifact & Mutation Ledger Schemas

### 3.1 Standard Knowledge Frontmatter Schema (`.kaioken/wiki/`, `.kaioken/skills/`)
```yaml
id: "feat-pure-go-retrieval"
type: "wiki"                    # wiki | skill | memory
title: "Pure Go BM25 Retrieval Subsystem"
source_provenance:
  files:
    - "cli/internal/retrieval/chunk.go"
    - "cli/internal/retrieval/lexical.go"
    - "cli/internal/retrieval/grader.go"
  git_commit: "a867302f"
created_at: "2026-08-23T14:30:00Z"
last_verified_at: "2026-08-23T18:00:00Z"
freshness_state: "fresh"        # fresh | stale | archived
sha256_hash: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
tags: ["retrieval", "bm25", "search", "core"]
```

### 3.2 Append-Only Mutation Ledger Schema (`.kaioken/ledger.jsonl`)
```json
{
  "seq": 1042,
  "timestamp": "2026-08-23T19:05:00Z",
  "actor": "reflection_worker",
  "action": "propose_skill",
  "artifact_id": "skill-go-test-flags",
  "artifact_type": "skill",
  "sha256_before": null,
  "sha256_after": "7d793037a0760186574b0282f2f435e7",
  "diff_patch": "--- /dev/null\n+++ b/.kaioken/skills/skill-go-test-flags/SKILL.md\n@@ -0,0 +1,15 @@\n+...",
  "approved_by": "operator",
  "approval_verdict": "AllowAlways"
}
```

---

## 4. Programmatic Tool Calling (PTC) IPC Wire Protocol

When `execute_code` is invoked, the child process communicates with the Kaioken daemon over local socket/pipe.

### 4.1 Child Process Invocation Handshake
* **Environment Injected into Child:**
  * `KAIOKEN_IPC_SOCKET`: Path to socket or `127.0.0.1:port`.
  * `KAIOKEN_SESSION_TOKEN`: Ephemeral HMAC authorization token.
  * All sensitive system environment variables (`AWS_*`, `GITHUB_TOKEN`, `*_API_KEY`) stripped.

### 4.2 IPC Wire Message Frames (NDJSON)

#### Child $\rightarrow$ Daemon (Tool Call Request):
```json
{
  "ipc_id": "msg_001",
  "token": "tok_99a8f21e",
  "action": "call_tool",
  "tool_name": "grep_search",
  "arguments": {
    "query": "Tokenize",
    "search_path": "cli/internal/retrieval"
  }
}
```

#### Daemon $\rightarrow$ Child (Tool Call Response):
```json
{
  "ipc_id": "msg_001",
  "success": true,
  "result": {
    "matches": [
      {"file": "cli/internal/retrieval/lexical.go", "line": 42, "content": "func Tokenize(s string) []string {"}
    ]
  },
  "error": null
}
```

---

## 5. Go Struct & Interface Definitions

```go
package agent

import (
	"context"
	"time"
)

// ApprovalVerdict represents the 4-state user permission response.
type ApprovalVerdict int

const (
	VerdictDeny ApprovalVerdict = iota
	VerdictAllowOnce
	VerdictAllowSession
	VerdictAllowAlways
)

func (v ApprovalVerdict) String() string {
	switch v {
	case VerdictAllowOnce:
		return "AllowOnce"
	case VerdictAllowSession:
		return "AllowSession"
	case VerdictAllowAlways:
		return "AllowAlways"
	default:
		return "Deny"
	}
}

// UI defines the interactive user-interface boundary for approvals and alerts.
type UI interface {
	Approve(ctx context.Context, call ToolCallSummary) (ApprovalVerdict, error)
	Notify(level string, message string)
	RenderToolTree(activeCalls []ToolNode)
}

// ToolCallSummary contains sanitized context for user approval.
type ToolCallSummary struct {
	CallID     string            `json:"call_id"`
	ToolName   string            `json:"tool_name"`
	Args       map[string]any    `json:"args"`
	RiskLevel  string            `json:"risk_level"` // low | medium | high | destructive
	Preview    string            `json:"preview"`
}

// PlatformAdapter specifies the minimal interface for future external surfaces.
type PlatformAdapter interface {
	SurfaceID() string
	SendMessage(ctx context.Context, sessionID string, message string) error
	ReceiveEvents(ctx context.Context) (<-chan SurfaceEvent, error)
}

type SurfaceEvent struct {
	SessionID string
	Sender    string
	Text      string
	Timestamp time.Time
}
```
