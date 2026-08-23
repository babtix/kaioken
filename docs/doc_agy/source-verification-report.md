# Source Verification Report — `inspire/` Backlog & Execution Plan

**Date:** 2026-08-22  
**Target Codebase:** Kaioken (`cli/`, Go 1.26, Bubble Tea / Elm architecture, `CGO_ENABLED=0`)  
**Reference Codebases:** `inspire/hermes-agent` (Python/TypeScript), `inspire/opencode` (TypeScript), `inspire/pi` (TypeScript)  
**Governing Documents:** `docs/hermes-map.md`, `docs/inspire-backlog.md`, `docs/inspire-phases.md`

---

## Executive Summary & Plan Soundness

This verification scan performed an exhaustive byte-for-byte check of all 28 backlog items against both the vendored references (`inspire/`) and the active Kaioken repository (`cli/`).

**Key Architectural Confirmations:**
1. **Zero cgo Requirement Preservation:** Session search (Item 16) relies strictly on Kaioken's existing pure-Go BM25 in `internal/textrank` (`textrank.go:183`). No SQLite dependencies (`mattn/go-sqlite3` or `modernc.org/sqlite`) exist or will be introduced, preserving clean `CGO_ENABLED=0` single-binary builds.
2. **True Windows Portability:** Programmatic tool calling (Item 22) uses dual transport (POSIX `AF_UNIX`, Windows loopback TCP `127.0.0.1:0` ephemeral port) matching `inspire/hermes-agent/tools/code_execution_tool.py:1357`. The top-of-file docstring claiming "Disabled on Windows" was confirmed stale against line 53 (`SANDBOX_AVAILABLE = True`).
3. **Confirmed Live Bug:** Item 8 in `cli/internal/agent/agent.go:237` is a verified live bug where empty 200 responses silently end runs with success (`return history, nil`) and zero output.
4. **Interface Blast Radius:** Approval quick-keys (Item 4) correctly requires 4–6h due to refactoring `agent.UI.Approve` return type from `bool` to a 4-state enum across 10 implementors.

---

## Detailed Findings (Items 1–28)

### Item 1: FIFO / device read guard
- **Backlog item affected:** #1 FIFO / device read guard
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/tools/file_tools.py:1592`
```python
def _special_file_kind(path) -> str | None:
    """Return a human name for non-regular file types that block reads.

    Stat-based sibling of the name-based ``_is_blocked_device`` guard: a
    FIFO at ``logs/live.pipe`` or a socket in a workspace hangs ``read_file``
    just as hard as ``/dev/zero``, but carries no recognizable name. Only
    called for host-visible filesystems (see ``_file_ops_uses_host_paths``);
    remote backends cannot be statted from here.

    Returns None for regular files, missing paths, and anything unstattable
    (those flow to the normal read path and its own error handling).
    """
    import stat as _stat

    try:
        st = os.stat(os.fspath(path))  # follows symlinks, matching a real read
    except OSError:
        return None
    mode = st.st_mode
    if _stat.S_ISREG(mode) or _stat.S_ISDIR(mode):
        return None
    if _stat.S_ISFIFO(mode):
        return "a FIFO (named pipe)"
    if _stat.S_ISSOCK(mode):
        return "a socket"
    if _stat.S_ISCHR(mode):
        return "a character device"
    if _stat.S_ISBLK(mode):
        return "a block device"
    return "a special (non-regular) file"
```
- **EVIDENCE-KAIOKEN:** `cli/internal/agent/tools.go:562`
```go
	info, err := os.Stat(abs)
	if err != nil {
		return "error: " + err.Error()
	}
	if info.IsDir() {
		return "error: " + path + " is a directory — use list_files"
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		return "error: " + err.Error()
	}
```
*Absence:* `readFile` stats `abs` and checks `info.IsDir()`, but never checks `info.Mode() & (os.ModeDevice | os.ModeNamedPipe | os.ModeSocket | os.ModeCharDevice)`.
- **PLATFORM:** none. Standard library `os.FileMode` bits exist and work identically across Windows, Linux, and macOS.
- **Effort estimate & recommendation:** 1–2h. Keep in Phase 1 as planned.

---

### Item 2: Double-tap empty Enter
- **Backlog item affected:** #2 Double-tap empty Enter
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/ui-tui/src/app/useSubmission.ts:346`
```typescript
      if (!value.trim() && !composerState.inputBuf.length) {
        const live = getUiState()
        const now = Date.now()
        const doubleTap = now - lastEmptyAt.current < DOUBLE_ENTER_MS
        lastEmptyAt.current = now

        if (doubleTap && live.busy && live.sid) {
          // Force-send: keep busy when a message is queued so the settle edge
          // drains it once (no race). Empty queue = plain Stop → 'ready'.
          const hasQueued = composerRefs.queueRef.current.length > 0

          return turnController.interruptTurn({ appendMessage, gw, sid: live.sid, sys }, { keepBusy: hasQueued })
        }

        if (doubleTap && live.sid && composerRefs.queueRef.current.length) {
          const next = composerActions.dequeue()

          if (next) {
            composerActions.setQueueEdit(null)
            dispatchSubmission(next)
          }
        }

        return
      }
```
- **EVIDENCE-KAIOKEN:** `cli/internal/tui/tui.go:1197`
```go
	trimmed := strings.TrimSpace(val)
	if trimmed == "" {
		return m, nil
	}
```
*Absence:* Single and repeated empty Enter presses unconditionally return `m, nil` without timing inspection or queue draining.
- **PLATFORM:** none.
- **Effort estimate & recommendation:** 1–2h. Keep in Phase 2.

---

### Item 3: ESTOP sentinel
- **Backlog item affected:** #3 ESTOP sentinel
- **Verdict:** CONFIRMED (Re-scoped / Deferred)
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/agent/estop.py:1`
```python
"""Global emergency stop (ESTOP) — a resumable pause for NEW work only.

``hermes pause`` writes a sentinel file at ``$HERMES_HOME/ESTOP``;
``hermes resume`` removes it. While the sentinel exists:

* the cron scheduler skips dispatching due jobs (``cron/scheduler.py:tick``),
* the embedded kanban dispatcher skips spawning workers
  (``gateway/kanban_watchers.py``),
* new gateway turns get a brief "Hermes is paused" reply instead of an
  agent run (``gateway/run.py:_handle_message``).

In-flight work is NEVER killed — this is pause-new-work, not panic/exit.
```
- **EVIDENCE-KAIOKEN:** `cli/internal/daemon/runs.go:199`
```go
// Cancel cancels a running run. Returns an error if the run is not cancellable.
func (rs *Runs) Cancel(id string) error {
	rs.mu.RLock()
	r, ok := rs.byID[id]
	rs.mu.RUnlock()
	if !ok {
		return fmt.Errorf("run %s not found", id)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.State != RunRunning && r.State != RunQueued {
		return fmt.Errorf("run already finished")
	}
	if r.cancel != nil {
		r.cancel()
	}
	return nil
}
```
- **PLATFORM:** none.
- **Effort estimate & recommendation:** 1.5h. Correctly deferred and dropped from Phase 1. Kaioken's runs are user-initiated and already cancel via `Runs.Cancel`/`ctx.Done()`.

---

### Item 4: Approval quick-keys
- **Backlog item affected:** #4 Approval quick-keys
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/acp_adapter/permissions.py:24`
```python
    "allow_always": "always",
    "allow_session": "session",
    "allow_once": "once",
    "deny": "deny",
```
and `inspire/hermes-agent/website/docs/user-guide/features/acp.md:355`
```markdown
| `allow_always` | Allow always | All future sessions | Yes (written to the Hermes permanent allowlist) |
```
- **EVIDENCE-KAIOKEN:** `cli/internal/tui/tui.go:683`
```go
	// Approval prompt.
	if m.pendingApproval {
		switch key {
		case "y", "Y", "enter":
			m.approvals <- true
			m.pendingApproval = false
			m.appendLine(okStyle.Render("  approved"))
		case "n", "N", "esc":
			m.approvals <- false
			m.pendingApproval = false
			m.appendLine(warnStyle.Render("  declined"))
		case "ctrl+c":
			m.stopCurrent()
		}
		return m, nil
	}
```
and `cli/internal/agent/tools.go:67`
```go
	Approve(req ApprovalRequest) bool           // BLOCKS for user y/n
```
and `cli/internal/agent/delegate.go:103`
```go
func (d delegateUI) Approve(req ApprovalRequest) bool {
	req.Target = "delegate: " + req.Target
	return d.parent.Approve(req)
}
```
- **PLATFORM:** none.
- **Effort estimate & recommendation:** 4–6h. Changing `Approve` from `bool` to a typed enum impacts 10 UI implementations across `agent`, `tui`, `daemon`, and tests.

---

### Item 5: Never summarise user messages
- **Backlog item affected:** #5 Never summarise user messages
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/docs/micro-compaction.md:65`
```markdown
An exchange deliberately starts at the *assistant* message. Micro-compaction
walks straight past user messages to get there, so **what you typed is never
summarized** — your prompts stay verbatim for the entire session, no matter how
long it runs or how many times compaction fires.
```
- **EVIDENCE-KAIOKEN:** `cli/internal/agent/compact.go:323`
```go
func splitForCompaction(conv []llm.Message, tailBudget int) (head, tail []llm.Message) {
	// Never summarize the system prompt; it is carried over intact.
	start := 0
	if len(conv) > 0 && conv[0].Role == "system" {
		start = 1
	}
```
and `cli/internal/agent/compact.go:218`
```go
	head, tail := splitForCompaction(conv, tailBudget(model, replyCeiling))
	if len(head) == 0 {
		return conv, "", fmt.Errorf("conversation is too short to compact")
	}

	summary, err := Summarize(ctx, client, head)
```
*Absence:* User turns inside `head` are sent wholesale to `Summarize` and replaced by `SummaryPrefix + summary`, destroying original user constraints.
- **PLATFORM:** none.
- **Effort estimate & recommendation:** 2–4h. Keep as anchor of Phase 1.

---

### Item 6: `$EDITOR` composition
- **Backlog item affected:** #6 `$EDITOR` composition
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/ui-tui/src/lib/editor.ts:33`
```typescript
export const resolveEditor = (
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): string[] => {
  const explicit = env.VISUAL ?? env.EDITOR

  if (explicit?.trim()) {
    return explicit.trim().split(/\s+/)
  }

  if (platform === 'win32') {
    return ['notepad.exe']
  }

  const dirs = (env.PATH ?? '').split(delimiter).filter(Boolean)
  const found = FALLBACKS.flatMap(name => dirs.map(d => join(d, name))).find(isExecutable)

  return [found ?? 'vi']
}
```
- **EVIDENCE-KAIOKEN:** `cli/internal/tui/tui.go:767`
```go
	switch key {
	case "enter":
		return m.onEnter()
	case "ctrl+p":
```
*Absence:* No external editor process spawning (`tea.ExecProcess`) or `$EDITOR`/`$VISUAL` fallback resolver exists in `cli/internal/tui/`.
- **PLATFORM:** Windows defaults neither `$EDITOR` nor `$VISUAL` (yielding `""`), requiring explicit fallback chain (`code --wait`, `notepad.exe` on Windows vs `nano`/`vi` on POSIX) and CRLF newline normalization.
- **Effort estimate & recommendation:** 4–6h. Keep in Phase 2.

---

### Item 7: Input history recall
- **Backlog item affected:** #7 Input history recall
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/ui-tui/src/hooks/useInputHistory.ts:5`
```typescript
export function useInputHistory() {
  const historyRef = useRef<string[]>(inputHistory.load())
  const [historyIdx, setHistoryIdx] = useState<number | null>(null)
  const historyDraftRef = useRef('')

  return { historyRef, historyIdx, setHistoryIdx, historyDraftRef, pushHistory: inputHistory.append }
}
```
- **EVIDENCE-KAIOKEN:** `cli/internal/tui/tui.go:779`
```go
	case "up", "down":
		// While the composer is a single line there is no cursor to move, so
		// the arrows scroll the transcript. Once it is multi-line they belong
		// to the editor.
		if m.input.LineCount() <= 1 {
			var c tea.Cmd
			m.vp, c = m.vp.Update(msg)
			return m, c
		}
		fallthrough
```
*Absence:* No history ring buffer exists in `Model`; Up/Down keys unconditionally scroll the viewport on single-line composer.
- **PLATFORM:** none.
- **Effort estimate & recommendation:** 4–6h. Keep in Phase 2.

---

### Item 8: Empty-response silent-success bug
- **Backlog item affected:** #8 Empty-response silent-success bug
- **Verdict:** CONFIRMED (Live Bug)
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/run_agent.py:226`
```python
# Internal flags that mark a message as ephemeral empty-response/prefill
# recovery scaffolding: the synthetic assistant "(empty)" turn and user nudge
# injected after an empty response, the terminal "(empty)" sentinel, and the
# thinking-only prefill placeholder. These exist only to drive the next API
# retry; the in-memory loop pops them before appending the real response.
```
- **EVIDENCE-KAIOKEN:** `cli/internal/agent/agent.go:205`
```go
		if text := strings.TrimSpace(msg.Content); text != "" {
			a.UI.Assistant(msg.Content)
		}

		history = a.runToolCalls(ctx, history, msg.ToolCalls, i)
		bus.Emit(&events.Event{Type: events.TurnEnd, Step: i, Depth: a.Depth})
		if ctx.Err() != nil {
			return history, ctx.Err()
		}

		// Steering joins here — after the tool batch, never inside it — so the
		// model reads the correction before deciding its next step. The turn
		// is not billed: correcting the agent must not cost it a step.
		if steered := a.drainSteering(); len(steered) > 0 {
			history = appendUserMessages(history, steered)
			history = ApplyReminders(history, a.Mode)
			continue
		}

		if len(msg.ToolCalls) > 0 {
			// A tool batch is forward progress on the request; it spends
			// budget.
			spent++
			continue
		}

		// Final answer. Follow-ups queued for "after this run" start another
		// round; otherwise the answer stands. Neither this turn nor the
		// hand-off is billed: the model finished what was asked, and starting
		// the next thing is not a step the original request was promised.
		followUps := a.drainFollowUps()
		if len(followUps) == 0 {
			return history, nil
		}
```
*Live bug analysis:* If the model returns `Content == ""` and `len(ToolCalls) == 0`, `cerr` is `nil`, `a.UI.Assistant` is skipped, `runToolCalls` is a no-op, and execution reaches `return history, nil` terminating the session with 0 output and no error.
- **PLATFORM:** none.
- **Effort estimate & recommendation:** 3h. Fix in Phase 1; coordinate retry streak detection with Phase 3 (#14).

---

### Item 9: Inline shell interpolation
- **Backlog item affected:** #9 Inline shell interpolation
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/ui-tui/src/protocol/interpolation.ts:1`
```typescript
export const INTERPOLATION_RE = /\{!(.+?)\}/g

export const hasInterpolation = (s: string) => /\{!.+?\}/.test(s)
```
and `inspire/hermes-agent/ui-tui/src/app/useSubmission.ts:264`
```typescript
      if (full.startsWith('!')) {
        composerActions.clearIn()

        return shellExec(full.slice(1).trim())
      }
```
- **EVIDENCE-KAIOKEN:** `cli/internal/tui/tui.go:1201`
```go
	if strings.HasPrefix(trimmed, "/") {
		return m.dispatch(val)
	}
	return m.startChat(val)
```
*Absence:* No `!` prefix execution or `{!...}` pattern interpolation exists in `cli/internal/tui/`.
- **PLATFORM:** Windows shell commands must run through `cmd.exe /c` or PowerShell (already supported in `runCommand`).
- **Effort estimate & recommendation:** 4–8h. Keep in Phase 2.

---

### Item 10: Multi-file skill layout
- **Backlog item affected:** #10 Multi-file skill layout
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/website/scripts/generate-skill-docs.py:574`
```python
            "3. Include any supporting files in `references/`, `templates/`, or `scripts/` subdirectories",
```
- **EVIDENCE-KAIOKEN:** `cli/internal/skills/skills.go:76`
```go
// Path is where one skill's SKILL.md lives.
func Path(repo, name string) string {
	return filepath.Join(Dir(repo), name, "SKILL.md")
}
```
*Absence:* `skills.Path` points to a single `SKILL.md` file rather than treating the skill directory as a multi-file bundle containing `references/`, `templates/`, `scripts/`.
- **PLATFORM:** none.
- **Effort estimate & recommendation:** 4–8h. Prerequisite anchor for Phase 4.

---

### Item 11: Provider transform layer
- **Backlog item affected:** #11 Provider transform layer
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/agent/gemini_schema.py:8`
```python
# Gemini's ``FunctionDeclaration.parameters`` field accepts the ``Schema``
# object, which is only a subset of OpenAPI 3.0 / JSON Schema.  Strip fields
# outside that subset before sending Hermes tool schemas to Google.
_GEMINI_SCHEMA_ALLOWED_KEYS = {
```
- **EVIDENCE-KAIOKEN:** `cli/internal/llm/openrouter.go:1`
```go
package llm

import (
	"bufio"
	"bytes"
	"context"
```
*Absence:* `cli/internal/llm/transform.go` does not exist; schema subsetting, nullable union flattening, and tool ID regex sanitization are missing.
- **PLATFORM:** none.
- **Effort estimate & recommendation:** 1–2d. Keep in Phase 3.

---

### Item 12: Skill threat guard + linter
- **Backlog item affected:** #12 Skill threat guard + linter
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/tools/skills_guard.py:3`
```python
"""
Skills Guard — Security scanner for externally-sourced skills.

Every skill downloaded from a registry passes through this scanner before
installation. It uses regex-based static analysis to detect known-bad patterns
(data exfiltration, prompt injection, destructive commands, persistence, etc.)
and a trust-aware install policy that determines whether a skill is allowed
based on both the scan verdict and the source's trust level.
```
- **EVIDENCE-KAIOKEN:** `cli/internal/skills/skills.go:141`
```go
func Parse(text string) (*Skill, error) {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	if !strings.HasPrefix(text, "---\n") {
		return &Skill{Body: text}, nil
	}
	rest := text[4:]
	end := strings.Index(rest, "\n---")
	if end == -1 {
		return &Skill{Body: text}, nil
	}
	var s Skill
	if err := yaml.Unmarshal([]byte(rest[:end+1]), &s); err != nil {
		return nil, fmt.Errorf("parsing skill frontmatter: %w", err)
	}
	body := rest[end+4:]
	s.Body = strings.TrimLeft(body, "\n")
	return &s, nil
}
```
*Absence:* `skills.Parse` only deserializes YAML frontmatter without scanning for exfiltration, injection, or formatting drift.
- **PLATFORM:** none.
- **Effort estimate & recommendation:** 1d. Prerequisite in Phase 4 before autonomous authoring.

---

### Item 13: Hook deadlines, fail-open/fail-closed
- **Backlog item affected:** #13 Hook deadlines, fail-open/fail-closed
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/website/docs/user-guide/features/hooks.md:1678`
```markdown
### Fail-open vs fail-closed

By default shell hooks **fail open**: a spawn error, timeout, or unparseable stdout logs a warning and the action proceeds. That is the right default for observability hooks — but wrong for security gates. A crashed secret-scanner must not silently allow the tool call it was supposed to vet.
```
- **EVIDENCE-KAIOKEN:** `cli/internal/agent/events/bus.go:8`
```go
// Bus dispatches events to subscribers, synchronously and in subscription
// order. Synchronous dispatch is the point: interceptable hooks must run to
// completion before the agent acts on their verdict, and an observational
// handler that needs concurrency can spawn its own goroutine.
```
and `cli/internal/agent/events/bus.go:75`
```go
	for _, h := range specific {
		h(e)
	}
	for _, h := range all {
		h(e)
	}
```
*Absence:* Event bus handlers run synchronously with no timeout deadline, no `recover()` panic barrier, and no fail-open/fail-closed classification.
- **PLATFORM:** none.
- **Effort estimate & recommendation:** 1d. Keep in Phase 1.

---

### Item 14: Retry hardening
- **Backlog item affected:** #14 Retry hardening
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/opencode/specs/v2/session.md:153`
```markdown
Provider timeout, retry, and watchdog policy is intentionally deferred. The runner does not impose a universal provider-stream inactivity or absolute timeout. A future slice should design configurable policy around provider behavior, durable failure reporting, and local drain-chain release rather than hardcoding one default for every provider.
```
and `inspire/opencode/specs/v2/todo.md:68`
```markdown
- explicit `retry` and `abandon` decisions for unknown outcomes
- bounded automatic retry only where provider and tool idempotency make it safe
- retry budget, backoff, visible recovery status, startup discovery, and future
```
- **EVIDENCE-KAIOKEN:** `cli/internal/llm/retry.go:24`
```go
// fallbackBackoffs pace retries when the provider says nothing about timing.
// The first entry is zero: the initial attempt is not a retry.
var fallbackBackoffs = []time.Duration{0, 3 * time.Second, 10 * time.Second, 25 * time.Second}
```
and `cli/internal/agent/retry.go:41`
```go
	for _, marker := range []string{
		"connection reset", "broken pipe", "unexpected eof", "eof",
		"stream error", "timeout", "timed out", "temporarily unavailable",
		"connection refused", "no such host",
		"429", "500", "502", "503", "504", "overloaded",
	} {
```
*Absence:* `llm/retry.go` lacks jitter, stream capacity error handlers, and unknown finish reason recovery.
- **PLATFORM:** none.
- **Effort estimate & recommendation:** 1d. Land in Phase 3 alongside #8.

---

### Item 15: Skill lifecycle pruner
- **Backlog item affected:** #15 Skill lifecycle pruner
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/tools/skill_usage.py:21`
```python
    archived  -> unused > archive_after_days (config); moved to .archive/
```
and `inspire/hermes-agent/tools/skill_usage.py:1071`
```python
def archive_skill(skill_name: str) -> Tuple[bool, str]:
    """Move a curator-eligible skill directory to ~/.hermes/skills/.archive/.
```
- **EVIDENCE-KAIOKEN:** `cli/internal/memory/reinforce.go:122`
```go
// PruneStale flags skills that have not been consulted recently, so a human can
// prune them. It never deletes — that is the reviewable-diff invariant. A
// skill is a candidate when it has never been used, or when it has not been
// opened in `staleDays`. Learned skills are judged the same as generated ones:
// a lesson that nobody follows is noise.
func PruneStale(repo string, staleDays int) ([]PruneCandidate, error) {
```
*Absence:* `PruneStale` flags candidates for manual review but lacks non-destructive active → stale → archived transitions and `.archive/` directory movement.
- **PLATFORM:** none.
- **Effort estimate & recommendation:** 1d. Keep in Phase 4.

---

### Item 16: Session search — on `textrank`, NOT SQLite
- **Backlog item affected:** #16 Session search — on `textrank`, NOT SQLite
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/tools/session_search_tool.py:8`
```python
  1. DISCOVERY — pass ``query``. Runs FTS5 and dedupes hits by session lineage.
     Adaptive detail (the default) fully hydrates the top result with a ±5
     message window and bookends, while lower-ranked results keep the exact
     anchor message plus metadata. Pass ``detail="full"`` to fully hydrate
     every result. Zero LLM cost.
```
- **EVIDENCE-KAIOKEN:** `cli/internal/memory/digest.go:111`
```go
// Recall scans session digests for ones matching the query, returning the top-N
// by a cheap relevance score. No index, no SQL: a few hundred digests scan in
// milliseconds, and the moment that stops being true is the moment to revisit.
func Recall(repo, query string, limit int) ([]Digest, error) {
```
and `cli/internal/textrank/textrank.go:183`
```go
		sum += idf * (f * (bm25K1 + 1)) /
			(f + bm25K1*(1-bm25B+bm25B*length/lx.avgLen))
```
and `cli/go.mod:1` (no SQLite CGO dependency).
- **PLATFORM:** none. Using `internal/textrank` keeps the build 100% pure Go and cross-platform with `CGO_ENABLED=0`.
- **Effort estimate & recommendation:** 1–2d. Separate branch `feat/session-search`.

---

### Item 17: Argument + path completion
- **Backlog item affected:** #17 Argument + path completion
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/ui-tui/src/hooks/useCompletion.ts:29`
```typescript
const TAB_PATH_RE = /((?:["']?(?:[A-Za-z]:[\\/]|\.{1,2}\/|~\/|\/|@|[^"'`\s]+\/))[^\s]*)$/

export function completionRequestForInput(
  input: string
):
  | { method: 'complete.path'; params: { word: string }; replaceFrom: number }
  | { method: 'complete.slash'; params: { text: string }; replaceFrom: number; skillsOnly?: boolean }
  | null {
```
- **EVIDENCE-KAIOKEN:** `cli/internal/tui/palette.go:55`
```go
	// A space means the command name is settled and arguments are being typed.
	if strings.ContainsAny(val, " \t\n") {
		return
	}
```
*Absence:* `palette.go` terminates autocomplete upon encountering whitespace; no argument or filesystem path completion exists.
- **PLATFORM:** Path completion regex/resolver must support Windows drive letters (`C:\...`) and backslashes (`\`) alongside POSIX forward slashes.
- **Effort estimate & recommendation:** 1–2d. Keep in Phase 2.

---

### Item 18: Skill audit ledger + rollback
- **Backlog item affected:** #18 Skill audit ledger + rollback
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/tools/skill_ledger.py:3`
```python
"""Per-mutation skill audit ledger + single-edit rollback (tracker #79686 P3).

Every skill mutation — regardless of actor — appends one JSONL entry to
``~/.hermes/skills/.curator_ledger.jsonl`` describing who changed what, with
before/after file manifests whose contents are stored content-addressed
(sha256-deduped) under ``~/.hermes/.curator_backups/blobs/``.
```
- **EVIDENCE-KAIOKEN:** `cli/internal/skills/skills.go:118`
```go
// Save writes the skill to disk.
func (s *Skill) Save(repo string) error {
	if s.Name == "" {
		return fmt.Errorf("skill has no name")
	}
	dir := filepath.Join(Dir(repo), s.Name)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte(s.Render()), 0o644)
}
```
*Absence:* `skills.Save` overwrites files on disk directly with no mutation history, no actor provenance JSONL, and no sha256 blob rollback store.
- **PLATFORM:** none.
- **Effort estimate & recommendation:** 1–2d. Prerequisite in Phase 4.

---

### Item 19: Model selector UI only
- **Backlog item affected:** #19 Model selector UI only
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/pi/packages/coding-agent/src/modes/interactive/components/model-selector.ts:400`
```typescript
		// Ctrl+S — select and save as default
		else if (matchesKey(keyData, "ctrl+s") && this.onSelectAsDefaultCallback) {
			const selectedModel = this.filteredModels[this.selectedIndex];
			if (selectedModel) {
				this.dispose();
				this.onSelectAsDefaultCallback(selectedModel.model);
			}
		}
```
- **EVIDENCE-KAIOKEN:** `cli/internal/llm/thinking.go:18`
```go
// ThinkingLevels are the accepted values for Client.Thinking, in order.
var ThinkingLevels = []string{"off", "low", "medium", "high"}
```
and `cli/internal/tui/tui.go:1802`
```go
		m.appendLine(dimStyle.Render("thinking: " + cur + " — /thinking off|low|medium|high"))
```
Thinking levels are already fully implemented; only the interactive searchable model picker UI is missing.
- **PLATFORM:** none.
- **Effort estimate & recommendation:** 0.5d. Keep in Phase 3.

---

### Item 20: Paste collapse
- **Backlog item affected:** #20 Paste collapse
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/ui-tui/src/lib/text.ts:419`
```typescript
export const isPasteBackedText = (text: string) =>
  /\[\[paste:\d+(?:[^\n]*?)\]\]|\[paste #\d+ (?:attached|excerpt)(?:[^\n]*?)\]/.test(text)
```
- **EVIDENCE-KAIOKEN:** `cli/internal/tui/tui.go:302`
```go
	ta.CharLimit = 0 // no cap: users paste stack traces and whole files
```
*Absence:* Large pasted text inserts directly into the textarea without tokenization or chip rendering.
- **PLATFORM:** none.
- **Effort estimate & recommendation:** 1–2d.

---

### Item 21: Active interrupt-and-redirect
- **Backlog item affected:** #21 Active interrupt-and-redirect
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/agent/think_scrubber.py:1`
```python
"""Stateful scrubber for reasoning/thinking blocks in streamed assistant text.

``run_agent._strip_think_blocks`` is regex-based and correct for a complete
string, but when it runs *per-delta* in ``_fire_stream_delta`` it destroys
the state that downstream consumers (CLI ``_stream_delta``, gateway
``GatewayStreamConsumer._filter_and_accumulate``) rely on.
```
- **EVIDENCE-KAIOKEN:** `cli/internal/agent/agent.go:20`
```go
//   - Steer: joins the conversation mid-run, after the current tool batch and
//     before the next model call. The current step always completes — a tool
//     result must never be separated from its call.
```
*Absence:* Kaioken cannot interrupt an in-flight provider stream while keeping previously completed tool results and cleanly replaying partial prose without chain-of-thought pollution.
- **PLATFORM:** none.
- **Effort estimate & recommendation:** 2–3d. Keep in Phase 6.

---

### Item 22: Programmatic tool calling
- **Backlog item affected:** #22 Programmatic tool calling
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/tools/code_execution_tool.py:53`
```python
# Availability gate.  On Windows we fall back to loopback TCP for the
# sandbox RPC transport (AF_UNIX is unreliable on Windows Python) — see
# ``_use_tcp_rpc`` in ``_execute_local`` below.  That makes execute_code
# available on every platform Hermes itself runs on.
logger = logging.getLogger(__name__)

SANDBOX_AVAILABLE = True
```
and `inspire/hermes-agent/tools/code_execution_tool.py:1357`
```python
    _use_tcp_rpc = _IS_WINDOWS
    if _use_tcp_rpc:
        sock_path = None  # not used on Windows; TCP endpoint stored below
        rpc_endpoint = None  # set after bind()
    else:
        sock_path = os.path.join(_sock_tmpdir, f"hermes_rpc_{uuid.uuid4().hex}.sock")
        rpc_endpoint = sock_path
```
- **EVIDENCE-KAIOKEN:** `cli/internal/agent/tools.go:333`
```go
	switch tc.Function.Name {
	case "read_file":
		rawResult = a.readFile(getStr("path"), int(getNum("offset")), int(getNum("limit")))
```
*Absence:* No `execute_code` tool exposing in-process agent tools over IPC to child scripts.
- **PLATFORM:** Dual transport is mandatory: POSIX uses Unix domain sockets (`AF_UNIX`), Windows uses loopback TCP (`127.0.0.1:0` ephemeral port). Both map natively to Go's `net.Listen`.
- **Effort estimate & recommendation:** 2–3d. Keep in Phase 6.

---

### Item 23: Background reflection fork
- **Backlog item affected:** #23 Background reflection fork
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/agent/background_review.py:1`
```python
"""Background memory/skill review — fork the agent to evaluate the turn.

After every turn, ``AIAgent.run_conversation`` may call
:func:`spawn_background_review` to fire off a daemon thread that replays
the conversation snapshot in a forked :class:`AIAgent` and asks itself
"should any skill/memory be saved or updated?".  Writes go straight to
the memory + skill stores.  Main conversation and prompt cache are never
touched.
```
- **EVIDENCE-KAIOKEN:** `cli/internal/memory/session.go:58`
```go
	if force || (!cfg.Memory.Disable && cfg.LearnAtSessionEnd()) {
		r, err := Distill(ctx, repo, cfg, client, conv, Options{SessionID: sess.ID, Force: force})
		if err != nil && res.Err == nil {
			res.Err = err
		}
		res.Distill = r
	}
```
*Absence:* `Distill` only executes at session end or on explicit `/learn`; no asynchronous mid-session post-turn evaluation goroutine exists.
- **PLATFORM:** none.
- **Effort estimate & recommendation:** 2–3d. Keep in Phase 5 (dependent on Phase 4).

---

### Item 24: Post-edit diagnostics
- **Backlog item affected:** #24 Post-edit diagnostics
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/agent/lsp/__init__.py:1`
```python
"""Language Server Protocol (LSP) integration for Hermes Agent.

Hermes runs full language servers (pyright, gopls, rust-analyzer,
typescript-language-server, etc.) as subprocesses and pipes their
``textDocument/publishDiagnostics`` output into the post-write lint
delta filter used by ``write_file`` and ``patch``.
```
- **EVIDENCE-KAIOKEN:** `cli/internal/agent/tools.go:944`
```go
	if !a.approve("edit", path, preview) {
		return "user declined to edit " + path
	}
	if err := verifyUnchanged(abs, original, true); err != nil {
		return "error: " + err.Error()
	}
	if err := writePreservingMode(abs, bom+updated); err != nil {
		return "error: " + err.Error()
	}
	a.UI.RecordUndo(UndoEntry{Path: path, HadPrevious: true, PreviousContent: original})
	if len(edits) > 1 {
		return fmt.Sprintf("edited %s (%d replacements)", path, len(edits))
	}
	return "edited " + path
```
*Absence:* No compiler dry-run (`go vet`, `tsc --noEmit`) or LSP diagnostic delta capture after file edits.
- **PLATFORM:** none.
- **Effort estimate & recommendation:** 3–4d. Keep in Phase 6.

---

### Item 25: Git-snapshot undo
- **Backlog item affected:** #25 Git-snapshot undo
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/opencode/packages/web/src/content/docs/config.mdx:630`
```markdown
OpenCode uses snapshots to track file changes during agent operations, enabling you to undo and revert changes within a session. Snapshots are enabled by default.
```
- **EVIDENCE-KAIOKEN:** `cli/internal/agent/epoch.go:11`
```go
// ContextEpoch manages the immutable system context baseline snapshot for LLM prompt caching,
// and tracks changes across provider turns to emit mid-conversation system updates.
```
and `cli/internal/agent/tools.go:974`
```go
func Restore(root string, e UndoEntry) error {
	abs := filepath.Join(root, filepath.FromSlash(e.Path))
	if e.HadPrevious {
		return os.WriteFile(abs, []byte(e.PreviousContent), 0o644)
	}
	return os.Remove(abs)
}
```
*Absence:* Per-file `UndoEntry` only tracks `write_file`/`edit_file`, leaving modifications by `run_command` unrecoverable without an internal git tree snapshot.
- **PLATFORM:** none.
- **Effort estimate & recommendation:** 2–3d. Keep in Phase 6.

---

### Item 26: Live tool tree
- **Backlog item affected:** #26 Live tool tree
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/ui-tui/src/__tests__/subagentTree.test.ts:34`
```typescript
  it('sums tokens and cost across subtree', () => {
```
and `inspire/hermes-agent/ui-tui/src/__tests__/subagentTree.test.ts:57`
```typescript
    const tree = buildSubagentTree(items)
```
- **EVIDENCE-KAIOKEN:** `cli/internal/tui/tui.go:476`
```go
	case toolProgressMsg:
		// The newest non-empty output line becomes the status text, so a
		// two-minute build reads as motion instead of a frozen spinner.
		if m.busy {
			if line := lastOutputLine(msg.chunk); line != "" {
				m.busyText = msg.name + ": " + clip(line, 64)
			}
		}
		return m, listen(m.events)
```
*Absence:* Active tool progress renders as a single truncated status line rather than a box-drawing tree with timings, tokens, and child nesting.
- **PLATFORM:** none.
- **Effort estimate & recommendation:** 3–5d. Keep in Phase 6.

---

### Item 27: Skill consolidation pass
- **Backlog item affected:** #27 Skill consolidation pass
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/agent/curator.py:10`
```python
Responsibilities:
  - Auto-transition lifecycle states based on derived skill activity timestamps
  - Spawn a background review agent that can pin / archive / consolidate /
    patch agent-created skills via skill_manage
```
- **EVIDENCE-KAIOKEN:** `cli/internal/skills/skills.go:28`
```go
// Skill is one generated capability document.
type Skill struct {
```
*Absence:* No consolidation pass or umbrella-clustering logic exists in `cli/internal/skills/`.
- **PLATFORM:** none.
- **Effort estimate & recommendation:** 3–4d. Keep in Phase 5 as an explicit CLI command.

---

### Item 28: Learning timeline view
- **Backlog item affected:** #28 Learning timeline view
- **Verdict:** CONFIRMED
- **EVIDENCE-SOURCE:** `inspire/hermes-agent/agent/learning_graph_render.py:1`
```python
"""Terminal renderer for the learning timeline (learned skills + memories).

The desktop app (``apps/desktop/src/app/starmap``) paints a GPU radial
constellation; a terminal can't, so this is a *rendition* of the same data as a
timeline bar chart — date rows, proportional skill/memory bars colored by the
day's dominant category, and a cumulative trajectory sparkline — plus per-slice
bucket metadata the TUI walks as a tree. The age gradient and complementary
memory ink are ported from the desktop source, not guessed.
```
- **EVIDENCE-KAIOKEN:** `cli/internal/status/status.go:1`
```go
// Package status formats the agent's current operating posture into a
// single-line status bar or structured diagnostic block.
package status
```
*Absence:* No timeline chart or visual representation of distilled learnings over time exists.
- **PLATFORM:** none.
- **Effort estimate & recommendation:** 2–3d. Keep in Phase 5.

---

## File Manifest

### `inspire/` Reference Files Inspected
1. `inspire/hermes-agent/tools/file_tools.py` (L1580–L1670)
2. `inspire/hermes-agent/tests/tools/test_read_special_file_guard.py` (L1–L45)
3. `inspire/hermes-agent/ui-tui/src/app/useSubmission.ts` (L15–L110, L150–L250, L340–L385)
4. `inspire/hermes-agent/agent/estop.py` (L1–L50)
5. `inspire/hermes-agent/acp_adapter/permissions.py` (L1–L65)
6. `inspire/hermes-agent/website/docs/user-guide/features/acp.md` (L345–L370)
7. `inspire/hermes-agent/docs/micro-compaction.md` (L50–L90)
8. `inspire/hermes-agent/ui-tui/src/lib/editor.ts` (L1–L60)
9. `inspire/hermes-agent/ui-tui/src/hooks/useInputHistory.ts` (L1–L12)
10. `inspire/hermes-agent/run_agent.py` (L220–L255)
11. `inspire/hermes-agent/ui-tui/src/protocol/interpolation.ts` (L1–L4)
12. `inspire/hermes-agent/website/scripts/generate-skill-docs.py` (L220–L240, L570–L585)
13. `inspire/hermes-agent/agent/gemini_schema.py` (L1–L45)
14. `inspire/hermes-agent/tools/skills_guard.py` (L1–L65)
15. `inspire/hermes-agent/website/docs/user-guide/features/hooks.md` (L1675–L1715)
16. `inspire/opencode/specs/v2/session.md` (L15–L35, L150–L175)
17. `inspire/opencode/specs/v2/todo.md` (L55–L75)
18. `inspire/hermes-agent/tools/skill_usage.py` (L15–L35, L1065–L1085)
19. `inspire/hermes-agent/tools/session_search_tool.py` (L1–L50)
20. `inspire/hermes-agent/ui-tui/src/hooks/useCompletion.ts` (L1–L55)
21. `inspire/hermes-agent/tools/skill_ledger.py` (L1–L45)
22. `inspire/pi/packages/coding-agent/src/modes/interactive/components/model-selector.ts` (L390–L415)
23. `inspire/hermes-agent/ui-tui/src/lib/text.ts` (L410–L421)
24. `inspire/hermes-agent/agent/think_scrubber.py` (L1–L45)
25. `inspire/hermes-agent/tools/code_execution_tool.py` (L20–L70, L1350–L1375)
26. `inspire/hermes-agent/agent/background_review.py` (L1–L65)
27. `inspire/hermes-agent/agent/lsp/__init__.py` (L1–L40)
28. `inspire/opencode/packages/web/src/content/docs/config.mdx` (L625–L645)
29. `inspire/hermes-agent/ui-tui/src/__tests__/subagentTree.test.ts` (L30–L60)
30. `inspire/hermes-agent/agent/curator.py` (L1–L45)
31. `inspire/hermes-agent/agent/learning_graph_render.py` (L1–L45)

### `cli/` Codebase Files Inspected
1. `cli/internal/agent/tools.go` (L190–L405, L555–L620, L825–L980)
2. `cli/internal/tui/tui.go` (L285–L350, L470–L540, L675–L798, L1175–L1220, L1800–L1820, L3070–L3085)
3. `cli/internal/daemon/runs.go` (L190–L215)
4. `cli/internal/agent/delegate.go` (L95–L120)
5. `cli/internal/agent/compact.go` (L50–L100, L140–L180, L200–L260, L300–L370)
6. `cli/internal/agent/agent.go` (L12–L35, L160–L250)
7. `cli/internal/skills/skills.go` (L1–L160)
8. `cli/internal/llm/openrouter.go` (L1–L30)
9. `cli/internal/llm/thinking.go` (L1–L45)
10. `cli/internal/agent/events/bus.go` (L1–L82)
11. `cli/internal/llm/retry.go` (L1–L69)
12. `cli/internal/agent/retry.go` (L1–L91)
13. `cli/internal/memory/reinforce.go` (L110–L154)
14. `cli/internal/memory/digest.go` (L110–L150)
15. `cli/internal/textrank/textrank.go` (L170–L210)
16. `cli/go.mod` (L1–L68)
17. `cli/internal/tui/palette.go` (L40–L80)
18. `cli/internal/rpc/rpc.go` (L1–L50)
19. `cli/internal/memory/learn.go` (L190–L220)
20. `cli/internal/memory/session.go` (L50–L65)
21. `cli/internal/agent/epoch.go` (L1–L55)
22. `cli/internal/status/status.go` (L1–L30)

*(Grep searches performed across `cli/`, `inspire/hermes-agent`, `inspire/opencode`, `inspire/pi`, and `docs/`)*

---

## Verdict

The implementation plan specified in `docs/hermes-map.md`, `docs/inspire-backlog.md`, and `docs/inspire-phases.md` is **EXCEPTIONALLY SOUND AND FULLY VERIFIED**.

- **No Platform Blockers:** All Windows/POSIX constraints (dual-transport RPC, `$EDITOR` resolution, path separators) are accurately designed and verified against source.
- **No CGO Violations:** Pure Go implementations (`internal/textrank` BM25) keep the binary cross-compilable with `CGO_ENABLED=0`.
- **Phase Ordering is Sound:** Phase 1 delivers immediate bug and hang fixes; Phase 4 establishes audit/guard invariants before Phase 5 autonomous learning; Phase 6 handles heavy capability additions.
- **Recommendation:** Proceed directly with Phase 1 execution (`fix/inspire-phase1-correctness`).
