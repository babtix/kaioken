# Kaioken Desktop Studio — Architectural Blueprint & Phased Implementation Plan

**Prepared as: Principal Desktop Architect / Staff Systems Engineer**
**Scope: `desktop/` — Electron 44 + electron-vite + React 19 shell wired to the `kaiopi` runtime at `d:\project\ai_now_know\kaiopi`**

---

## 0. Executive Decision Summary

Before the deep dive, the eight load-bearing architectural verdicts. Each is justified in Part 1.

| # | Question | Decision |
|---|----------|----------|
| D1 | How to host `kaiopi` | **Electron `utilityProcess`** (forked from Main) communicating over **`MessageChannelMain`** with a JSON-RPC 2.0 envelope. Not in-process, not stdio child, not UDS, not HTTP. |
| D2 | Where policy lives | **Main process is the sole policy enforcement point.** The renderer's approval click is *advisory input*; Main validates, enforces, and forwards to the engine. |
| D3 | Data plane for PTY | **Per-session `MessagePortMain` transferred to the preload**, bypassing `ipcRenderer.invoke` for every byte. Keystrokes and output never round-trip through Main's invoke queue. |
| D4 | Agent token streaming | Engine batches deltas (16 ms / 32 deltas) → Main dumb-relays → renderer **`StreamBuffer` flushes once per `requestAnimationFrame`**. Token text lives *outside* React state until `message.done`. |
| D5 | State management | **Zustand v5 partitioned by domain** + an imperative `StreamBuffer` singleton + `useSyncExternalStore` for the streaming text node. Terminal bytes never enter React state at all. |
| D6 | Destructive gate | Main-owned `ApprovalRegistry` with a 5-minute authoritative timer, one-shot approval IDs, safe-default focus (**Deny**), diff preview generated engine-side (no TOCTOU display mismatch). |
| D7 | `kaioken/serve` | Runs **inside the engine utility process**, loopback-only, **ephemeral port + bearer token, disabled by default**, started lazily when the Codemap surface opens. Never used as the primary transport. |
| D8 | Diff review | Two read-only **CodeMirror 6 `EditorView`s** (old/new) aligned by a filler-line algorithm, hunk decorations + gutter accept/reject buttons, filtered-patch apply validated against `baseSha`. |

---

# Part 1 — System Topology & IPC Protocol Specification

## 1.1 The Hosting Decision: Why `utilityProcess`

The four candidate transports, evaluated:

| Criterion | In-process / worker thread | Child process (stdio IPC) | UDS / named pipe | Loopback HTTP/SSE | **utilityProcess (chosen)** |
|---|---|---|---|---|---|
| Crash containment | ❌ Native crash (tree-sitter, conpty) kills the app or corrupts shared heap | ✅ | ✅ | ✅ | ✅ Full isolation, `exit`/`stderr` events |
| Restart without app restart | ❌ Worker terminate is abrupt, no lifecycle hooks | ✅ | ⚠️ Daemon supervision you build yourself | ⚠️ Daemon supervision you build yourself | ✅ `fork()` again in ~200 ms |
| Packaging (electron-builder) | ✅ trivial | ❌ Requires locating a system Node or shipping one | ❌ Same | ✅ | ✅ **Uses the Electron binary itself — zero extra runtime to ship** |
| Transport quality | ✅ (shared memory) | ⚠️ NDJSON framing over stdio you hand-roll, mixed with stdout noise | ⚠️ Two platform APIs to maintain | ❌ SSE is one-directional; HTTP framing per token; port binding | ✅ **`MessagePortMain` native, structured-clone, port transfer** |
| Security | ❌ kaiopi code runs with full app privileges in-process | ✅ | ✅ | ❌ Loopback port = attack surface, firewall prompts on Windows | ✅ No sockets, no ports, private kernel-level channel |
| Windows specifics | — | ❌ stdio framing quirks | ⚠️ Named pipe naming/path rules | ⚠️ Firewall dialog | ✅ Identical cross-platform |

**Verdict:** `utilityProcess` gives us child-process crash isolation *plus* Electron-native `MessagePortMain` semantics *plus* zero packaging burden. It is precisely the seam Electron added for this use case (VS Code's shared/pty hosts follow the same pattern). HTTP/SSE is retained **only** as an opt-in visualization channel because `kaioken/serve` already exists (D7).

**What explicitly does *not* happen:**
- `kaiopi` is never `require`d into the Main process (CPU-heavy AST/BM25 work would jank window management, titlebar, and IPC pumping).
- The renderer never gets `nodeIntegration` and never talks to the engine except through Main-mediated, type-checked methods.
- No fixed ports are bound anywhere in the default configuration.

## 1.2 Process Model

```
┌──────────────────────────── Renderer (Chromium, sandboxed, contextIsolation: true) ────────────────────────────┐
│  React 19 · Tailwind v4 · CodeMirror 6 · @xterm/xterm 6 (WebGL) · react-shiki · mermaid 11 · katex             │
│                                                                                                                 │
│  Zustand stores: agent · terminal(meta) · explorer · diff · approval · spend · nav · settings                   │
│  Imperative layer: StreamBuffer (rAF flush) · TypedIpc facade · IncrementalMarkdown                              │
└───────▲───────────────────────────────────────────────────────────────────▲──────────────────────────────────────┘
        │ window.api.*  (contextBridge proxies: invoke + event callbacks)   │ per-session MessagePorts (PTY data)
┌───────┴───────────────────────────────────────────────────────────────────┴──────────────────────────────────────┐
│ Preload (sandboxed; only ipcRenderer + contextBridge) — OWNS the PTY MessagePorts; page never sees a port object │
└───────▲───────────────────────────────────────────────────────────────────▲──────────────────────────────────────┘
        │ ipcMain.handle / webContents.send          webContents.postMessage(channel, msg, [port])
┌───────┴───────────────────────────────────────────────────────────────────┴──────────────────────────────────────┐
│ Electron Main (full Node) — POLICY · LIFECYCLE · NATIVE                                                          │
│  ┌──────────┐ ┌────────────┐ ┌───────────────┐ ┌──────────────────┐ ┌─────────────────────────────────────┐    │
│  │ WindowMgr│ │ IpcRegistry│ │ ApprovalGate  │ │ WorkspaceGuard   │ │ EngineHost (utilityProcess supe.)  │    │
│  │ (frame-  │ │ (typed     │ │ (registry +   │ │ (path jail,      │ │  fork/kill/backoff/resume           │    │
│  │  less)   │ │  handlers) │ │  policy + TTL)│ │  fs allowlist)   │ │  JSON-RPC over MessageChannelMain   │    │
│  └──────────┘ └────────────┘ └───────────────┘ └──────────────────┘ └─────────────────────────────────────┘    │
│  ┌───────────────────────┐   ┌──────────────┐   ┌────────────────────┐                                        │
│  │ PtyService (node-pty) │   │ Keychain      │   │ ServeBridge (lazy) │                                        │
│  │ per-session ports     │   │ (safeStorage) │   │ 127.0.0.1 metadata │                                        │
│  └───────────────────────┘   └──────────────┘   └────────────────────┘                                        │
└──────────────────────────────────────┬───────────────────────────────┬───────────────────────────────────────────┘
                          MessagePortMain #1 (control+events)          │ engine-side kaioken/serve
                                       │                               │ 127.0.0.1:<ephemeral>?token=…
┌──────────────────────────────────────▼───────────────────────────────▼───────────────────────────────────────────┐
│ Agent Engine Host — Electron utilityProcess (serviceName: 'kaiopi-engine')                                       │
│   kaiopi harness: pi-agent-core (loop) · pi-ai (multi-provider) · pi-coding-agent (shell) · chord (internal bus) │
│   Kaioken truth layer: index · search · scan · verify/verifycore · impact · gitops · modelport · plan/cards ·    │
│                        wiki · serve                                                                             │
│   Session journal (append-only, flush-on-exit) → crash recovery                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Plane separation principle (memorize this)

> **Main mediates anything requiring policy. Raw byte-streams get direct ports.**
>
> - **Control plane** (session start/prompt/cancel, approvals, dial, patch apply): renderer → preload → `ipcMain.handle` → Main validates → engine RPC. Main inspects *everything*.
> - **Agent event plane** (tokens, tool status): engine → Main → `webContents.send`. Main stays a *dumb relay* for these (no allocation, no transformation) but retains visibility for spend tracking, tray badges, and approval correlation.
> - **PTY data plane**: engine-free, direct renderer-preload ↔ Main-PtyService `MessagePort`. Main is in the address space but not in the message path — ports are kernel-mediated pairs.

## 1.3 The IPC Contract — `src/shared/ipc-contract.ts`

This file is the **single source of truth**, imported by main, preload, and renderer. It contains no `electron` imports (it must compile in all three sandboxes). CI enforces that the preload exposes exactly `satisfies KaiokenApi`.

```ts
// src/shared/ipc-contract.ts
// ─── Common ─────────────────────────────────────────────────────────────
export type Unsubscribe = () => void;
export type Multiplier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type EngineState =
  | 'offline' | 'starting' | 'ready' | 'crashed' | 'restarting' | 'stopping';

export interface WorkspaceInfo { root: string; name: string; gitBranch: string | null }

// ─── Agent ──────────────────────────────────────────────────────────────
export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'openrouter' | 'local';

export interface AgentStartConfig {
  workspaceRoot: string;
  provider: ProviderId;
  model: string;
  apiKeyRef: string;                 // handle into safeStorage; the secret itself NEVER crosses to the renderer
  multiplier: Multiplier;
  budgetUsdCeiling?: number;         // hard spend cap enforced by modelport via the engine
}

export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'awaiting-approval' | 'error' | 'cancelled';

export interface AgentSessionInfo {
  sessionId: string; workspace: WorkspaceInfo;
  provider: ProviderId; model: string;
  multiplier: Multiplier; status: AgentStatus;
  createdAt: number; spendUsd: number;
}

export interface TokenUsage { input: number; output: number; cachedInput?: number; costUsd: number }

export interface VerificationBadge {
  kind: 'grounded' | 'tests' | 'build' | 'refs';
  label: string;                     // e.g. "tests 12/12", "grounded: 9 citations"
  pass: boolean; detail?: string;
}

export type ToolName =
  | 'run_command' | 'write_to_file' | 'apply_patch' | 'git_operations'
  | 'read_file' | 'list_dir'
  | 'kaioken/index' | 'kaioken/search' | 'kaioken/verify' | 'kaioken/impact'
  | 'kaioken/plan' | 'kaioken/wiki' | 'kaioken/cards';

export interface ToolRun {
  callId: string; sessionId: string; tool: ToolName;
  title: string;                     // engine-authored one-line human summary
  argsPreview: unknown;
  status: 'running' | 'success' | 'failure' | 'denied' | 'cancelled';
  startedAt: number; durationMs?: number; exitCode?: number | null;
  verification?: VerificationBadge[];
}

export interface SpendEntry {
  ts: number; sessionId: string; provider: ProviderId; model: string;
  inputTokens: number; outputTokens: number; multiplier: Multiplier; costUsd: number;
}

// ─── Patches / Diffs ────────────────────────────────────────────────────
export type DiffLine = { type: 'context' | 'add' | 'del'; oldN?: number; newN?: number; text: string };

export interface DiffHunk {
  hunkId: string;
  oldStart: number; oldLines: number;   // 1-based, unified-diff header semantics
  newStart: number; newLines: number;
  lines: DiffLine[];
}

export interface PatchSet {
  patchId: string; sessionId: string;
  path: string;                        // repo-relative
  language: string;
  baseSha: string;                     // git blob sha of the file the patch was computed against
  oldFile: string;                     // full original text — renderer renders THIS, not a re-computed diff
  hunks: DiffHunk[];
}

export type ApplyPatchResult =
  | { ok: true; appliedHunkIds: string[] }
  | { ok: false; error: 'stale-base' | 'no-hunks' | 'apply-failed'; detail?: string; currentSha?: string };

// ─── Agent event stream (engine → main → renderer) ──────────────────────
export type AgentEvent =
  | { type: 'session.status';   sessionId: string; status: AgentStatus; detail?: string }
  | { type: 'message.start';    sessionId: string; messageId: string; role: 'assistant' | 'user' }
  | { type: 'message.delta';    sessionId: string; messageId: string; seq: number; deltas: string[] } // batched
  | { type: 'message.done';     sessionId: string; messageId: string; usage?: TokenUsage }
  | { type: 'tool.start';       sessionId: string; run: ToolRun }
  | { type: 'tool.output';      sessionId: string; callId: string; seq: number;
      stream: 'stdout' | 'stderr' | 'json'; chunk: string }               // chunk ≤ 8 KiB, overflow countered
  | { type: 'tool.done';        sessionId: string; callId: string;
      status: ToolRun['status']; exitCode?: number | null; durationMs: number; verification?: VerificationBadge[] }
  | { type: 'patch.proposed';   sessionId: string; patch: PatchSet }
  | { type: 'patch.applied';    sessionId: string; patchId: string; appliedHunkIds: string[] }
  | { type: 'spend';            sessionId: string; entry: SpendEntry }
  | { type: 'journal';          sessionId: string; lastSeq: number };     // heartbeat: highest persisted seq

// ─── Destructive gate ───────────────────────────────────────────────────
export type GatedTool = 'run_command' | 'write_to_file' | 'apply_patch' | 'git_operations';
export type RiskLevel = 'low' | 'medium' | 'high' | 'destructive';
export type ApprovalDecision = 'allow' | 'allow-session' | 'deny';

export interface ApprovalRequest {
  approvalId: string;                 // unguessable, one-shot
  sessionId: string; callId: string;
  tool: GatedTool;
  summary: string;                    // plain-language sentence: "Write 214 lines to src/main/ipc/agent.ts"
  risk: RiskLevel;                    // engine-classified (scan + impact + pattern rules)
  preview:
    | { kind: 'command'; argv: string[]; cwd: string }
    | { kind: 'diff'; patch: PatchSet }
    | { kind: 'git'; plan: string[] };   // e.g. ["branch: kai/agent-session-7", "merge --no-ff into main"]
  requestedAt: number; expiresInMs: number;   // 300_000 default
}

export type ResolveResult =
  | { ok: true; decision: ApprovalDecision }
  | { ok: false; error: 'unknown-or-expired' | 'vetoed-by-policy' };

// ─── PTY ────────────────────────────────────────────────────────────────
export interface PtyCreateOptions {
  cwd: string; cols: number; rows: number;
  shell?: string; args?: string[];     // omit → platform default (PowerShell on Windows, $SHELL elsewhere)
  env?: Record<string, string>;
}
export interface PtySessionInfo { id: string; shell: string; cwd: string; createdAt: number; alive: boolean }

export interface PtyApi {
  create(opts: PtyCreateOptions): Promise<string>;
  /** Direct port via preload. Data path: renderer ↔ preload ↔ main-PtyService. No invoke round-trips. */
  write(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  kill(id: string): void;
  onData(id: string, cb: (data: string) => void): Unsubscribe;
  onExit(id: string, cb: (exitCode: number | null) => void): Unsubscribe;
  list(): Promise<PtySessionInfo[]>;
}

// ─── Workspace (Main-enforced path jail) ────────────────────────────────
export interface TreeNode {
  path: string; name: string; kind: 'file' | 'dir';
  size?: number; gitStatus?: 'M' | 'A' | 'D' | '?' | null;
  childrenLoaded: boolean;
}
export interface FileSlice { path: string; content: string; truncated: boolean; sha: string }

export interface WorkspaceApi {
  pickFolder(): Promise<WorkspaceInfo | null>;              // native dialog
  getTree(dir?: string, depth?: number): Promise<TreeNode[]>;   // lazy, kaioken/scan-backed (respects .gitignore)
  readFile(path: string, startLine?: number, endLine?: number): Promise<FileSlice>;
  watchTree(cb: (changes: Array<{ path: string; kind: 'add' | 'remove' | 'modify' }>)): Unsubscribe;
}

// ─── Agent + Tools + System ─────────────────────────────────────────────
export interface SearchOpts { limit?: number; mode?: 'bm25' | 'fuzzy' | 'symbol' }
export interface SearchHit { path: string; line: number; score: number; snippet: string; symbol?: string }
export interface SymbolRef { symbol: string; path: string; line: number; kind: string }

export interface AgentApi {
  startSession(cfg: AgentStartConfig): Promise<AgentSessionInfo>;
  resumeSession(sessionId: string, lastSeq: number): Promise<AgentSessionInfo>;   // crash recovery replay
  endSession(sessionId: string): Promise<void>;
  sendPrompt(sessionId: string, text: string): Promise<{ messageId: string }>;
  cancel(sessionId: string): Promise<void>;
  setMultiplier(sessionId: string, m: Multiplier): Promise<void>;
  applyPatch(patchId: string, acceptedHunkIds: string[]): Promise<ApplyPatchResult>;
  search(query: string, opts?: SearchOpts): Promise<SearchHit[]>;       // kaioken/search
  resolveSymbol(fqn: string): Promise<SymbolRef[]>;                     // kaioken/index
  listSessions(): Promise<AgentSessionInfo[]>;
  onEvent(h: (e: AgentEvent) => void): Unsubscribe;
  onEngineState(h: (s: EngineState, detail?: string) => void): Unsubscribe;
}

export interface ToolsApi {
  resolveApproval(approvalId: string, decision: ApprovalDecision): Promise<ResolveResult>;
  onApprovalRequest(h: (req: ApprovalRequest) => void): Unsubscribe;
  onApprovalResolved(h: (r: { approvalId: string; decision: ApprovalDecision; reason?: string }) => void): Unsubscribe;
}

export interface SystemApi {
  windowAction(a: 'minimize' | 'maximize' | 'close'): void;
  openExternal(url: string): Promise<boolean>;   // Main validates scheme+host allowlist
  platform: NodeJS.Platform; appVersion: string;
}

export interface KaiokenApi {
  agent: AgentApi; pty: PtyApi; workspace: WorkspaceApi; tools: ToolsApi; system: SystemApi;
}
```

## 1.4 Engine RPC Protocol (Main ↔ utilityProcess)

JSON-RPC 2.0-flavored envelopes over one `MessageChannelMain`:

```ts
// src/shared/rpc.ts
export type EngineMessage =
  | { kind: 'req';    id: string; method: string; params?: unknown }
  | { kind: 'res';    id: string; ok: true; result: unknown }
  | { kind: 'res';    id: string; ok: false; error: { code: number; message: string; data?: unknown } }
  | { kind: 'notify'; method: string; params: unknown };
```

| Method | Kind | Purpose |
|---|---|---|
| `engine/ping` · `engine/shutdown` | req | Liveness; graceful stop (flush journal, stop serve) |
| `agent/start` · `agent/resume` · `agent/prompt` · `agent/cancel` | req | Session lifecycle (`resume` takes `lastSeq`, replays journal) |
| `tool/approve` | req | **Main → engine only.** Carries `{ approvalId, decision }`. The engine accepts approvals exclusively from this method. |
| `model/dial` | req | Multiplier ×1–×10 → `kaioken/modelport` |
| `patch/apply` | req | `{ patchId, hunkIds }` → validates `baseSha`, applies filtered patch via `kaioken/gitops` |
| `search/query` · `index/refs` · `impact/predict` · `wiki/*` · `cards/*` · `spend/query` | req | Truth-layer reads |
| `serve/start` · `serve/stop` | req | Loopback daemon lifecycle → returns `{ port, token }` |
| `agent.event` | notify | The `AgentEvent` union, seq-numbered |
| `approval/request` | notify | Gate request → Main routes to policy/registry |

**Request discipline:** every `req` gets a 60 s timeout (10 s for ping), an id from `crypto.randomUUID()`, and a pending-map entry that is deleted exactly once. Late/duplicate responses are dropped. This makes restarts safe: on engine exit, all pending promises reject with `EngineOfflineError` and the renderer surfaces a reconnect banner rather than hanging spinners.

## 1.5 Jank-Free 60 FPS Streaming Pipeline & Backpressure

The jank risk is **not** Main-relaying tokens (Chromium IPC forwards a small object in microseconds). The risk is **N store updates → N React commits per second**. The fix is a four-stage funnel where each stage has a bounded budget:

```
Provider SSE ──▶ ENGINE (utilityProcess) ──▶ MAIN (dumb relay) ──▶ RENDERER StreamBuffer ──▶ one commit / rAF
                batch: 16ms OR 32 deltas      zero processing        coalesce + flush on      ONLY the streaming
                seq++ per batch                                      requestAnimationFrame    message component
```

**Stage 1 — Engine batching.** Provider chunks are coalesced; a batch is flushed every ≤16 ms or when 32 deltas accumulate, whichever first. Each `message.delta` carries a monotonic `seq`.

**Stage 2 — Main relay.** `webContents.send('agent:event', ev)` verbatim. No JSON re-serialization, no logging in the hot path (telemetry samples 1/N).

**Stage 3 — Renderer `StreamBuffer`.** Deltas append into a per-`messageId` pending buffer; a single scheduled `requestAnimationFrame` flush publishes at most **one** snapshot change per frame. Backpressure adaptation:

```ts
// src/renderer/src/lib/stream-buffer.ts
export class StreamBuffer {
  private current = new Map<string, string>();   // committed snapshot (stable between flushes → getSnapshot-safe)
  private pending = new Map<string, string>();   // unflushed tail
  private raf = 0;
  private subs = new Map<string, Set<() => void>>();

  push(messageId: string, delta: string): void {
    this.pending.set(messageId, (this.pending.get(messageId) ?? '') + delta);
    // Adaptive coalescing: if the tail has grown pathological (> 64 KiB), stop growing per-delta
    // work and let the next frame publish one large append — bounded CPU regardless of provider speed.
    if (!this.raf) this.raf = requestAnimationFrame(() => this.flush());
  }

  private flush(): void {
    this.raf = 0;
    for (const [id, tail] of this.pending) {
      this.current.set(id, (this.current.get(id) ?? '') + tail);
      this.subs.get(id)?.forEach((cb) => cb());
    }
    this.pending.clear();
  }

  snapshot(messageId: string): string { return this.current.get(messageId) ?? ''; }

  commitFinal(messageId: string, full: string): void {   // called on message.done
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.pending.delete(messageId);
    this.current.set(messageId, full);
    this.subs.get(messageId)?.forEach((cb) => cb());
    this.current.delete(messageId); this.subs.delete(messageId);  // hand off to zustand as immutable message
  }

  subscribe(messageId: string, cb: () => void): Unsubscribe {
    if (!this.subs.has(messageId)) this.subs.set(messageId, new Set());
    this.subs.get(messageId)!.add(cb);
    return () => this.subs.get(messageId)?.delete(cb);
  }
}
export const streamBuffer = new StreamBuffer();
```

Consumed via React 19's `useSyncExternalStore` — the snapshot string is referentially stable between frames, so React bails out automatically:

```tsx
function StreamingText({ messageId }: { messageId: string }) {
  const subscribe = useCallback(
    (cb: () => void) => streamBuffer.subscribe(messageId, cb), [messageId]);
  const text = useSyncExternalStore(subscribe, () => streamBuffer.snapshot(messageId));
  return <MemoizedMarkdown streaming text={text} />;   // incremental parser — see §3.2
}
```

**Stage 4 — Incremental markdown.** Full re-parse of a growing 50 KB message every frame is the second jank source. `lib/markdown/incremental.ts` splits text into block-level units (blank-line paragraphs, fenced code, math blocks), caches parsed blocks keyed by content hash, and re-parses **only the last (mutable) block**. `mermaid` and `katex` renders are deferred until `message.done` (placeholder shimmer while streaming). CodeMirror's `@lezer` parsers run in idle chunks for very large code blocks.

**Gap detection & resync.** The renderer tracks `lastSeq` per stream. A gap (engine restart, dropped frame) triggers `agent/resume(sessionId, lastSeq)` — the engine replays from its on-disk journal (append-only JSONL, fsynced every 500 ms). The `journal` heartbeat event lets the renderer detect silent divergence without waiting for a user-visible hole.

**Explicit budgets** (enforced by a perf-harness page, see Phase 2 acceptance):

| Metric | Budget |
|---|---|
| Sustained token throughput | ≥ 400 tok/s with ≤ 1 React commit per frame (React Profiler count) |
| Long-message streaming (50 KB) | ≥ 55 fps while scrolled to bottom |
| Terminal flood (`yes`, `cat` of 50 MB) | No renderer frame drops; xterm buffer absorbs |
| PTY keystroke latency | < 8 ms P99 renderer → pty echo |
| File-tree expand (10k siblings) | < 16 ms main-thread |
| Diff first paint (5k-line file) | < 150 ms |
| Engine crash → ready again | < 3 s (backoff included), journal resume < 1 s |

## 1.6 Lifecycle: Startup, Graceful Shutdown, Crash, Restart

**Startup order:** Main boots → window created (frameless) → `EngineHost.start()` forks utility process → init message hands over `MessagePort` → `engine/ping` (10 s timeout) → `ready` → renderer hydration queries `agent.listSessions()`.

**Graceful shutdown:**

```ts
// src/main/lifecycle.ts
app.on('before-quit', (e) => {
  if (shuttingDown) return;
  e.preventDefault(); shuttingDown = true;
  shutdown().finally(() => app.exit(0));
});

async function shutdown() {
  ptyService.killAll();                        // SIGTERM; on Windows: taskkill /T for conpty trees
  await engineHost.shutdown(2_000);            // engine/shutdown → flush journal → resolve, else proc.kill()
}
```

**Crash & restart (`EngineHost`):**

- `proc.on('exit')` → close ports, reject all pending RPCs with `EngineOfflineError`, emit `crashed`.
- Restart with exponential backoff: 500 ms → 1 s → 2 s → 4 s → 8 s cap, attempts reset on `ready`.
- Renderer shows a non-blocking "Engine offline — reconnecting (attempt N/…)" banner (amber, per design system). Editor/terminal/diff panes remain usable (they are not engine-dependent).
- On `ready`, renderer calls `agent.resumeSession(sessionId, lastSeq)` per open session; journal replay reconstructs message and tool state; the `patch.proposed` replay restores pending diffs (hunk accept/reject state is renderer-local and re-attaches by `hunkId`).
- `kaioken/serve` restarts with the engine; the Codemap surface re-fetches with the new token.

---

# Part 2 — Project File Tree & Component Hierarchy

## 2.1 Directory Structure

```
desktop/
├─ electron.vite.config.ts              # multi-entry: main index + engine-entry; preload; renderer w/ react + tailwind v4
├─ electron-builder.yml                 # Phase 6
├─ package.json                         # node-pty & kaiopi in "dependencies" (must ship); postinstall: @electron/rebuild
├─ tsconfig.{web,node}.json
├─ build/                               # icons, entitlements.mac.plist, notarize script
└─ src/
   ├─ shared/                           # ← imported by ALL THREE worlds. No electron imports allowed (lint-enforced).
   │  ├─ ipc-contract.ts                # Part 1 contract — the boundary bible
   │  ├─ rpc.ts                         # EngineMessage envelopes
   │  └─ constants.ts                   # channel names, timeouts, budgets
   ├─ main/
   │  ├─ index.ts                       # app entry: single-instance lock, lifecycle wiring
   │  ├─ window.ts                      # frameless BrowserWindow factory (titleBarStyle:'hidden',
   │  │                                 #   mac vibrancy / win backgroundMaterial:'acrylic', CSP-ready)
   │  ├─ lifecycle.ts                   # graceful shutdown orchestration
   │  ├─ context.ts                     # AppContext { engine, approvals, policy, pty, keychain, getWindow }
   │  ├─ ipc/
   │  │  ├─ index.ts                    # registerAll(ctx) aggregator
   │  │  ├─ agent.ts                    # session control relay + engine notification fan-out
   │  │  ├─ pty.ts                      # pty:create, port transfer, session registry, list
   │  │  ├─ workspace.ts                # path-jailed fs + tree + watcher (delegates listing to kaioken/scan via engine)
   │  │  ├─ tools.ts                    # tools:resolveApproval (the ONLY approval ingress)
   │  │  └─ system.ts                   # window controls, openExternal allowlist
   │  ├─ engine/
   │  │  ├─ engine-host.ts              # utilityProcess supervisor: fork/kill/backoff/pending-RPC/restart
   │  │  ├─ approval-registry.ts        # one-shot IDs, TTL timers, fail-closed resolution
   │  │  ├─ approval-policy.ts          # auto-allow/auto-deny/ask rules (allowlists, never-patterns, risk ceilings)
   │  │  └─ serve-bridge.ts             # lazily asks engine for serve {port,token}; metadata only
   │  ├─ pty/
   │  │  └─ pty-service.ts              # node-pty sessions + per-session MessageChannelMain
   │  └─ keychain.ts                    # safeStorage encrypt/decrypt for provider keys
   ├─ engine/                           # code bundled INTO the utility process (separate rollup input)
   │  └─ engine-entry.ts                # parentPort init, kaiopi facade, RPC dispatch, token batching, journal
   ├─ preload/
   │  ├─ index.ts                       # contextBridge.exposeInMainWorld('api', {...} satisfies KaiokenApi)
   │  ├─ agent.ts  ├─ pty.ts            # pty.ts OWNS the MessagePorts (page never touches them)
   │  ├─ workspace.ts ├─ tools.ts └─ system.ts
   └─ renderer/
      ├─ index.html                     # CSP meta tag
      └─ src/
         ├─ main.tsx  ├─ App.tsx        # keyboard map mount, providers
         ├─ styles/
         │  ├─ theme.css                # Tailwind v4 @theme: Kaioken ANSI-mapped tokens
         │  └─ hud.css                  # scanlines, hud-corners, aura-pulse (STATE-ONLY utilities)
         ├─ lib/
         │  ├─ ipc.ts                   # typed window.api facade + onEvent wiring into stores
         │  ├─ stream-buffer.ts         # §1.5
         │  ├─ markdown/incremental.ts  # block-cache streaming markdown
         │  ├─ diff/align.ts            # hunk → aligned old/new line arrays
         │  ├─ diff/cm-diff.ts          # CM6 decorations, hunk gutter actions, synced scroll
         │  └─ keyboard/accelerators.ts # Ctrl+K, Ctrl+1..7, Ctrl+`, dial, approval keys
         ├─ stores/
         │  ├─ agentStore.ts            # sessions, message METADATA (ids/roles/tool refs) — never token text
         │  ├─ terminalStore.ts         # session metadata ONLY (xterm owns its own buffer!)
         │  ├─ explorerStore.ts         # normalized path→node map, lazy-loaded
         │  ├─ diffStore.ts             # PatchSets + per-hunk accept/reject state
         │  ├─ approvalStore.ts         # pending gate requests (low frequency)
         │  ├─ spendStore.ts  ├─ navStore.ts (surface, layout sizes, persisted) └─ settingsStore.ts
         ├─ components/
         │  ├─ shell/    TitleBar · WorkspaceShell · NavRail · SplitHandle · StatusBar
         │  ├─ chat/     MessageList · Message · StreamingText · Composer · MultiplierDial
         │  ├─ tools/    ToolRunCard · bodies/{BashBody, VerifyBody, IndexBody, ImpactBody, PatchBody}
         │  ├─ approvals/ApprovalModal · RiskBadge · ApprovalCountdown · DiffApprovalPreview
         │  ├─ terminal/ TerminalDrawer · TerminalTabs · TerminalPane
         │  ├─ explorer/ FileTree (windowed) · FileTreeRow
         │  ├─ diff/     DiffInspector · SideBySideDiff · HunkActionBar
         │  ├─ omnibox/  Omnibox (Ctrl+K) · CommandRegistry
         │  └─ common/   CitationChip · VerificationBadges · MermaidBlock · KbdHint · EmptyState
         └─ surfaces/    AgentStreamSurface · ResearchSurface · WikiSurface · CodemapSurface
                         · CardsSurface · LedgerSurface · SettingsSurface
```

**Build note (critical, easy to miss):** `engine-entry.ts` is a second Rollup input in `electron-vite.config.ts`. `kaiopi` + `pi-*` packages bundle into *that* chunk, not into `index.js`. `node-pty` stays `external` (native `.node` binary, rebuilt via `@electron/rebuild`, `asarUnpack`ed in packaging).

## 2.2 Component Hierarchy

```
<App>
 ├─ <TitleBar/>                                   frameless drag region · traffic lights / WCO · engineState dot · workspace path
 └─ <WorkspaceShell>                              CSS Grid: [nav | main | inspector] + bottom drawer
     ├─ <NavRail/>                                7 surfaces (Ctrl+1..7) · MiniMultiplierDial
     ├─ <SurfaceRouter key={navStore.surface}>    // remount-free keyed switch
     │   ├─ AgentStreamSurface   → MessageList · ToolRunCards · Composer · MultiplierDial · CitationChips
     │   ├─ ResearchSurface      → SearchBar · HitList (BM25) · SymbolRefs → CitationChips → jump-to-file
     │   ├─ WikiSurface          → WikiDoc (markdown+katex) · MermaidBlock · RegenButton
     │   ├─ CodemapSurface       → GraphCanvas (fetch 127.0.0.1:{port}/graph?token) · ImpactOverlay
     │   ├─ CardsSurface         → CardGrid · CardDetail (inspector)
     │   ├─ LedgerSurface        → SpendTable · Sparkline · DialHistory · BudgetGuage
     │   └─ SettingsSurface      → Providers(safeStorage) · Gates · Appearance · Budgets · Keybindings
     ├─ <InspectorPanel>                          resizable right pane, tabbed:
     │   ├─ DiffInspector        SideBySideDiff (CM6 ×2) + HunkActionBar + "Apply accepted"
     │   ├─ FileTreeInspector    windowed tree + git status dots
     │   └─ GraphInspector       Mermaid preview of selected wiki section
     └─ <TerminalDrawer>                           Ctrl+` toggle · TerminalTabs · TerminalPane (imperative xterm)
 ├─ <Omnibox/>                                    Ctrl+K overlay: commands + fuzzy files + symbols
 ├─ <ApprovalModal/>                              destructive gate (portal, focus-trapped, Deny-first)
 └─ <Toasts/> <EngineOfflineBanner/>
```

## 2.3 Surface ↔ Engine Mapping

| Accel | Surface | Primary store | Engine methods | Default inspector |
|---|---|---|---|---|
| Ctrl+1 | Agent Stream | `agentStore` + `streamBuffer` | `agent/*`, `tool/approve`, `patch/apply` | Diff / Files |
| Ctrl+2 | Research | `researchStore` (local) | `search/query`, `index/refs` | Citations |
| Ctrl+3 | Wiki | `wikiStore` | `wiki/get`, `wiki/regenerate` | Mermaid preview |
| Ctrl+4 | Codemap | `graphStore` | `serve/start` → loopback fetch, `impact/predict` | — (full-bleed) |
| Ctrl+5 | Cards | `cardsStore` | `cards/list`, `cards/get` | Card detail |
| Ctrl+6 | Cost Ledger | `spendStore` | `spend/query`, `model/dial` | — |
| Ctrl+7 | Settings | `settingsStore` | — (local + safeStorage via Main) | — |

## 2.4 State Partitioning Rules (the anti-jank constitution)

1. **Terminal bytes never enter React.** xterm owns its buffer; Zustand holds only `{id, title, cwd, alive}`. A 10 MB/s flood costs zero React work.
2. **Token text lives outside Zustand until `message.done`.** The `StreamBuffer` + `useSyncExternalStore` isolate the streaming component; the message list re-renders nothing during streaming.
3. **Stores are slice-subscribed.** Components select narrow fields (`useStore(s => s.activeSessionId)`); `subscribeWithSelector` prevents tool-card updates from touching the file tree. React 19 + optional React Compiler handles memoization; hot lists are additionally `memo`'ed on stable ids.
4. **Explorer is normalized** (`Record<path, TreeNode>` + `childrenLoaded` lazy flags), windowed rendering (only visible rows mounted), `watchTree` patches apply immutably by path.
5. **Diff state is keyed by `hunkId`** so engine replay after a crash re-attaches user selections.
6. **Layout sizes persist** (`navStore` → localStorage) — splitters and drawer height survive restarts.

## 2.5 Design Tokens (Tailwind v4) — ANSI DNA

```css
/* src/renderer/src/styles/theme.css */
@import "tailwindcss";

@theme {
  --color-void:   #0a0b0e;   /* ANSI 0 — deep void background */
  --color-void-2: #10131a;
  --color-panel:  #13161f;
  --color-line:   #1e2330;
  --color-neon:   #00e5ff;   /* ANSI cyan — active reasoning, links, focus rings */
  --color-amber:  #ffb300;   /* ANSI yellow — warnings, awaiting-approval */
  --color-ember:  #ff6d00;   /* ANSI orange — high-risk */
  --color-danger: #ff1744;   /* ANSI red — failure, ARMED destructive */
  --color-pass:   #00e676;   /* ANSI green — verified, success */
  --color-ash:    #8b93a7;   /* secondary text */
  --color-fog:    #c3c9d6;   /* primary text */
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}
```

HUD rules (enforced by lint rule + review checklist): `.scanlines`, `.hud-corners`, `.aura-pulse` may only be applied through `data-state` attributes (`data-state="thinking" | "armed" | "power-10"`), never as decoration.

---

# Part 3 — Core Implementation Deep-Dive

## 3.1 The PTY & Terminal Bridge

Architecture: **`node-pty` sessions live in Main; each session gets a dedicated `MessageChannelMain`; one end is wired to the pty, the other is transferred to the preload** (which retains it and exposes a function-based API — `MessagePort` objects cannot cross `contextBridge`, which is exactly what we want: the page never holds the port).

### `src/main/pty/pty-service.ts` + `src/main/ipc/pty.ts`

```ts
// src/main/pty/pty-service.ts
import { BrowserWindow, MessageChannelMain, MessagePortMain } from 'electron';
import { randomUUID } from 'node:crypto';
import pty from 'node-pty';

type PortMsg =
  | { t: 'write'; data: string }
  | { t: 'resize'; cols: number; rows: number }
  | { t: 'kill' };

const DEFAULT_SHELL = process.platform === 'win32'
  ? (process.env.COMSPEC ?? 'powershell.exe')
  : (process.env.SHELL ?? '/bin/zsh');

class PtySession {
  readonly id = randomUUID();
  private port: MessagePortMain;
  constructor(private term: pty.IPty, port: MessagePortMain) {
    this.port = port;
    this.port.on('message', (e) => {
      const m = e.data as PortMsg;
      if (m.t === 'write') this.term.write(m.data);
      else if (m.t === 'resize') this.term.resize(Math.max(2, m.cols), Math.max(1, m.rows));
      else if (m.t === 'kill') this.term.kill();
    });
    this.port.start();
    this.term.onData((d) => this.port.postMessage({ t: 'data', d }));
    this.term.onExit(({ exitCode }) => {
      this.port.postMessage({ t: 'exit', exitCode });
      this.port.close();                       // renderer onExit unsubscribes; preload drops its ref
    });
  }
  info() { return { id: this.id, shell: this.term.process, createdAt: Date.now(), alive: true }; }
  kill() { try { this.term.kill(); } catch { /* already dead */ } }
}

export class PtyService {
  private sessions = new Map<string, PtySession>();

  create(win: BrowserWindow, opts: PtyCreateOptions): string {
    const { port1, port2 } = new MessageChannelMain();
    const term = pty.spawn(opts.shell ?? DEFAULT_SHELL, opts.args ?? [], {
      name: 'xterm-256color',
      cols: Math.max(2, opts.cols), rows: Math.max(1, opts.rows),
      cwd: opts.cwd, env: { ...process.env, ...opts.env, TERM: 'xterm-256color', KAIOKEN: '1' } as Record<string, string>,
    });
    const session = new PtySession(term, port1);
    this.sessions.set(session.id, session);
    // Hand the paired port to the preload. This is the last time Main touches the data path.
    win.webContents.postMessage('pty:port', { id: session.id }, [port2]);
    return session.id;
  }

  killAll() { for (const s of this.sessions.values()) s.kill(); this.sessions.clear(); }
  list() { return [...this.sessions.values()].map((s) => s.info()); }
}
```

```ts
// src/main/ipc/pty.ts
import { ipcMain } from 'electron';
export function registerPtyIpc(pty: PtyService, getWindow: () => BrowserWindow | null) {
  ipcMain.handle('pty:create', (_e, opts: PtyCreateOptions) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) throw new Error('no-window');
    return pty.create(win, opts);
  });
  ipcMain.handle('pty:list', () => pty.list());
  // No pty:write / pty:resize / pty:data channels exist. They travel on the ports.
}
```

Renderer lifecycle: `getWindow().webContents.on('destroyed', () => pty.killAll())` — but the drawer *collapse* never kills sessions; only window close does.

### `src/preload/pty.ts` — port ownership stays here

```ts
// src/preload/pty.ts
import { ipcRenderer } from 'electron';
import type { PtyApi, PtyCreateOptions, Unsubscribe } from '../shared/ipc-contract';

const ports = new Map<string, MessagePort>();
const dataCbs = new Map<string, Set<(d: string) => void>>();
const exitCbs = new Map<string, Set<(c: number | null) => void>>();

ipcRenderer.on('pty:port', (event, { id }: { id: string }) => {
  const port = event.ports[0];                 // transferred MessagePort — lives in the preload only
  ports.set(id, port);
  port.onmessage = (e) => {
    const m = e.data;
    if (m.t === 'data') dataCbs.get(id)?.forEach((cb) => cb(m.d));
    else if (m.t === 'exit') {
      exitCbs.get(id)?.forEach((cb) => cb(m.exitCode));
      port.close(); ports.delete(id); dataCbs.delete(id); exitCbs.delete(id);
    }
  };
  port.start();
});

const reg = <T,>(map: Map<string, Set<T>>, id: string, cb: T): Unsubscribe => {
  if (!map.has(id)) map.set(id, new Set());
  map.get(id)!.add(cb);
  return () => map.get(id)?.delete(cb);
};

export const ptyApi: PtyApi = {
  create: (opts: PtyCreateOptions) => ipcRenderer.invoke('pty:create', opts) as Promise<string>,
  write:  (id, data) => ports.get(id)?.postMessage({ t: 'write', data }),
  resize: (id, cols, rows) => ports.get(id)?.postMessage({ t: 'resize', cols, rows }),
  kill:   (id) => ports.get(id)?.postMessage({ t: 'kill' }),
  onData: (id, cb) => reg(dataCbs, id, cb),
  onExit: (id, cb) => reg(exitCbs, id, cb),
  list:   () => ipcRenderer.invoke('pty:list'),
};
```

Note the security property for free: a compromised page can only write/resize/kill sessions by id — it cannot spawn new processes (`pty:create` is Main-side and could be rate-limited), cannot read arbitrary fds, and the ports die with their session.

### `src/renderer/src/components/terminal/TerminalPane.tsx`

```tsx
import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';

const KAIOKEN_THEME = {               // 1:1 with CLI ANSI palette
  background: '#0a0b0e', foreground: '#c3c9d6', cursor: '#00e5ff', cursorAccent: '#0a0b0e',
  selectionBackground: '#00e5ff33',
  black: '#0a0b0e', red: '#ff1744', green: '#00e676', yellow: '#ffb300',
  blue: '#00e5ff', magenta: '#ff6d00', cyan: '#00e5ff', white: '#c3c9d6',
  brightBlack: '#8b93a7', brightRed: '#ff1744', brightGreen: '#00e676',
  brightYellow: '#ffb300', brightBlue: '#00e5ff', brightMagenta: '#ff6d00',
  brightCyan: '#00e5ff', brightWhite: '#ffffff',
};

export function TerminalPane({ sessionId }: { sessionId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", monospace', fontSize: 13, lineHeight: 1.25,
      cursorBlink: true, scrollback: 5000, allowProposedApi: true,
      theme: KAIOKEN_THEME, convertEol: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    try { term.loadAddon(new WebglAddon()); }            // GPU path; DOM renderer is the automatic fallback
    catch { /* WebGL unavailable → default renderer */ }

    fit.fit();
    const api = window.api.pty;

    // Data plane wiring (preload-owned port — zero ipcRenderer.invoke in the hot path)
    const offData = api.onData(sessionId, (d) => term.write(d));
    term.onData((d) => api.write(sessionId, d));         // keystrokes, pastes, resize replies
    const offExit = api.onExit(sessionId, (code) =>
      term.writeln(`\r\n\x1b[38;5;${code === 0 ? 82 : 196}m[exited ${code ?? 'signal'}]\x1b[0m`));

    // Resize: visual fit first, then tell the kernel-side pty (debounced; terminal resize storms are real)
    let rt: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        fit.fit();
        api.resize(sessionId, term.cols, term.rows);     // keeps stty size, prompt wrapping, TUI apps correct
      }, 50);
    });
    ro.observe(host);

    return () => { clearTimeout(rt); ro.disconnect(); offData(); offExit(); term.dispose(); };
  }, [sessionId]);

  return <div ref={hostRef} className="h-full w-full bg-void" />;
}
```

**Multiplexing & shell toggling.** `TerminalDrawer` hosts `TerminalTabs`; each tab = one `sessionId` from `terminalStore` (metadata only). "New shell" → `window.api.pty.create({ cwd: workspaceRoot, cols, rows, shell: profile })` — profiles (`PowerShell`, `pwsh`, `cmd`, `bash`, `zsh`) are Settings-defined, resolved in Main. Sessions survive drawer collapse (the xterm instance unmounts only on tab close; on re-open we create a fresh pane against the *same* sessionId — history lives in the pty-side scrollback only if the pane stays mounted; for MVP, collapsing keeps panes mounted via CSS `display:none`, which preserves buffers; document this trade-off).

---

## 3.2 Agent Stream & Tool Execution Engine

### Event → store wiring (`lib/ipc.ts`)

```ts
export function bindAgentEvents() {
  window.api.agent.onEvent((e) => {
    switch (e.type) {
      case 'message.delta':
        streamBuffer.push(e.messageId, e.deltas.join('')); break;   // NO zustand write
      case 'message.done':
        agentStore.getState().commitMessage(e.sessionId, e.messageId); // freeze into immutable store
        streamBuffer.commitFinal(e.messageId, agentStore.getState().getMessageText(e.messageId));
        break;
      case 'tool.start': agentStore.getState().upsertToolRun(e.run); break;
      case 'tool.output': agentStore.getState().appendToolOutput(e.callId, e.chunk, e.stream); break; // capped ring buffer per card
      case 'tool.done':   agentStore.getState().finishToolRun(e); break;
      case 'patch.proposed':
        diffStore.getState().addPatch(e.patch);                     // auto-focus inspector (unless "sticky")
        navStore.getState().openInspectorTab('diff');
        break;
      case 'spend':       spendStore.getState().record(e.entry); break;
      case 'session.status': agentStore.getState().setStatus(e.sessionId, e.status, e.detail); break;
    }
  });
}
```

`tool.output` chunks land in a per-run ring buffer (last 64 KB, exposed to the card via a tiny external store with the same rAF-flush pattern — never Zustand for high-frequency stdout).

### Tool cards — structured dossiers, not log soup

```tsx
const TOOL_BODIES: Record<string, (p: { run: ToolRun }) => JSX.Element> = {
  'run_command':      BashBody,        // argv chips + live stdout/stderr echo + exit code badge (pass #00e676 / danger #ff1744)
  'kaioken/verify':   VerifyBody,      // gate rows: grounded ✓, tests 12/12, build ✓ — each row a VerificationBadge
  'kaioken/index':    IndexBody,       // "12,482 symbols · O(1) oracle ready · 340 ms" + top changed symbols
  'kaioken/impact':   ImpactBody,      // blast-radius chips: files touched / tests in radius / risk — "Open in Codemap" jump
  'apply_patch':      PatchBody,       // patch summary → "Review in Inspector" (opens DiffInspector on that patchId)
  'kaioken/wiki':     WikiBody,        // sections regenerated + Mermaid sequence preview
};

export function ToolRunCard({ run }: { run: ToolRun }) {
  const open = useToolCardOpen(run.callId, run.status === 'running');  // auto-expand while running, persisted collapse
  const Body = TOOL_BODIES[run.tool] ?? GenericBody;
  return (
    <div data-state={run.status === 'running' ? 'thinking' : undefined}
         className="kai-card border border-line bg-panel/60 rounded-lg overflow-hidden">
      <ToolCardHeader run={run} onToggle={...} />      {/* tool glyph · title · duration · status badge · data-state pulse */}
      {open && <Body run={run} />}
      {run.verification && <VerificationBadges badges={run.verification} />}   {/* emerald pass / crimson fail chips */}
    </div>
  );
}
```

**Citation chips.** Assistant messages citing code render `CitationChip` components (`symbol ▸ path:line`) sourced from `kaioken/index` refs embedded in the message metadata; clicking jumps the file tree + opens the file at the line (via `workspace.readFile` with line range). This is the "verifiable dossier" identity: every claim is a clickable, grounded reference.

**The Multiplier Dial.** Radial control in the composer (×1–×10). Local optimistic UI → `agent.setMultiplier` → `model/dial`. Visual intensity scales with value (aura pulse reserved for ×8+). Budget guard: if projected spend for the current session (`spendStore`) exceeds the configured ceiling, the dial renders amber and the engine has already hard-capped via `modelport` — the UI reflects engine truth, it never invents limits.

---

## 3.3 The Destructive Gate — Exact Handshake

```
Renderer            Main (policy point)            Engine (utilityProcess)
   │ prompt ──invoke──▶ │ ──agent/prompt──▶ │
   │                    │                   │  tool call intercepted (write_to_file)
   │                    │                   │ ◀─ approval/request {approvalId, tool, risk, preview(diff), expiresInMs}
   │                    │ ApprovalPolicy.evaluate(req)
   │                    │   ├─ auto-allow rule (e.g. read-only, allowlisted fmt cmd) ──▶ tool/approve(allow) → executes
   │                    │   └─ 'ask' → register in ApprovalRegistry (5:00 timer, Main-authoritative)
   │ ◀─ tools:approval (req) │
   │ ApprovalModal (focus → Deny; Tab: Deny→diff→Allow; Esc = Deny)
   │ resolveApproval(id,'allow') ─invoke─▶ │ validate: active? not expired? decision permitted for risk level?
   │                    │ ──tool/approve {approvalId, decision}──▶ │
   │                    │ ◀──────────── tool.start / tool.done ────│
   │ ◀─ agent:event (tool.*) │   ◀─ tools:approval:resolved ──│
   │   [if 5:00 elapses: Main resolves 'deny' (reason: 'timeout'), notifies both sides]
```

```ts
// src/main/engine/approval-registry.ts
import { BrowserWindow } from 'electron';
import type { ApprovalRequest, ApprovalDecision, ResolveResult } from '../../shared/ipc-contract';

interface Active { req: ApprovalRequest; timer: NodeJS.Timeout; expiresAt: number }
const MAX_PENDING = 3;

export class ApprovalRegistry {
  private active = new Map<string, Active>();
  constructor(private engine: EngineHost, private policy: ApprovalPolicy,
              private getWindow: () => BrowserWindow | null, private ttlMs = 300_000) {}

  handle(req: ApprovalRequest): void {
    const verdict = this.policy.evaluate(req);           // 'auto-allow' | 'auto-deny' | 'ask'
    if (verdict !== 'ask') return void this.resolve(req.approvalId,
      verdict === 'auto-allow' ? 'allow' : 'deny', `policy:${verdict}`);

    if (this.active.size >= MAX_PENDING) {               // fail closed — never stack a wall of modals
      const oldest = [...this.active.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
      this.resolve(oldest[0], 'deny', 'queue-overflow');
    }
    const timer = setTimeout(() => this.resolve(req.approvalId, 'deny', 'timeout'), this.ttlMs);
    this.active.set(req.approvalId, { req, timer, expiresAt: Date.now() + this.ttlMs });
    this.getWindow()?.webContents.send('tools:approval', req);
  }

  async resolve(approvalId: string, decision: ApprovalDecision, reason?: string): Promise<ResolveResult> {
    const entry = this.active.get(approvalId);
    if (!entry) return { ok: false, error: 'unknown-or-expired' };   // one-shot, idempotent, FAIL CLOSED:
                                                                      // late clicks / replays can never approve a dead id
    this.active.delete(approvalId);
    clearTimeout(entry.timer);

    const enforced = this.policy.enforce(entry.req, decision);       // Main may STILL veto (e.g. 'allow-session'
    if (enforced.veto) return { ok: false, error: 'vetoed-by-policy' };  //  is forbidden for risk:'destructive')
    await this.engine.request('tool/approve', { approvalId, decision: enforced.decision });
    this.getWindow()?.webContents.send('tools:approval:resolved', { approvalId, decision: enforced.decision, reason });
    return { ok: true, decision: enforced.decision };
  }
}
```

**ApprovalModal safety rules (non-negotiable, test-enforced):**
1. Autofocus lands on **Deny**. `Enter` therefore denies. Approve requires an explicit `Tab`/click to reach **Allow** — an accidental Enter mid-reading can never destroy work.
2. The diff body is scrollable and tab-reachable *before* Allow in the tab order (Deny → diff scroller → Allow-session → Allow).
3. `Escape` = Deny. Countdown ring renders `expiresAt` (delivered in the request); Main's timer is authoritative — a frozen renderer cannot extend the window.
4. `data-state="armed"` (crimson aura) only when `risk === 'destructive'`.
5. The preview is **engine-computed** (`preview: { kind: 'diff', patch }`) — the renderer displays exactly what the engine would apply. No client-side diff recomputation means no display/execution divergence.
6. There is **no renderer path to the engine** except `tools:resolveApproval`; Main owns the registry, so a compromised renderer cannot fabricate approvals for ids it invented.

---

## 3.4 The Diff Review System (CodeMirror 6, per-hunk accept/reject)

**Protocol:** the engine emits `patch.proposed` with `oldFile` (full text), `hunks`, and `baseSha`. The renderer never diffs anything itself — it *aligns* and *renders*.

### Step 1 — Alignment (`lib/diff/align.ts`): make old/new visually parallel

```ts
import type { PatchSet, DiffHunk } from '../../../shared/ipc-contract';

export interface AlignedPatch {
  oldText: string; newText: string;
  hunkRanges: { hunkId: string; old: [number, number]; neu: [number, number] }[];  // 0-based line ranges
}

export function alignPatch(patch: PatchSet): AlignedPatch {
  const base = patch.oldFile.split('\n');
  const old: string[] = [], neu: string[] = [];
  const hunkRanges: AlignedPatch['hunkRanges'] = [];
  let o = 0;                                             // cursor into base (0-based)

  for (const h of patch.hunks) {
    while (o < h.oldStart - 1) { old.push(base[o]); neu.push(base[o]); o++; }        // equal run: parallel copy
    const oldS = old.length, neuS = neu.length;
    for (const ln of h.lines) {
      if (ln.type === 'context')      { old.push(ln.text); neu.push(ln.text); o++; }
      else if (ln.type === 'del')     { old.push(ln.text); neu.push(''); o++; }      // filler keeps columns aligned
      else /* add */                  { old.push('');     neu.push(ln.text); }
    }
    hunkRanges.push({ hunkId: h.hunkId,
      old: [oldS, old.length], neu: [neuS, neu.length] });
  }
  while (o < base.length) { old.push(base[o]); neu.push(base[o]); o++; }
  return { oldText: old.join('\n'), newText: neu.join('\n'), hunkRanges };
}
```

### Step 2 — CM6 extension: hunk decorations + gutter accept/reject + synced scroll

```ts
// src/renderer/src/lib/diff/cm-diff.ts
import { EditorView, Decoration, gutter, GutterMarker, ViewPlugin, DecorationSet } from '@codemirror/view';
import { StateEffect, StateField, EditorState, Compartment } from '@codemirror/state';
import type { AlignedPatch } from './align';

export type HunkState = 'pending' | 'accepted' | 'rejected';
export const setHunkState = StateEffect.define<{ hunkId: string; state: HunkState }>();
export const hunkStates = StateField.define<Record<string, HunkState>>({
  create: () => ({}),
  update: (v, tr) => {
    for (const e of tr.effects) if (e.is(setHunkState)) v = { ...v, [e.value.hunkId]: e.value.state };
    return v;
  },
});

class HunkActionMarker extends GutterMarker {
  constructor(private hunkId: string, private side: 'old' | 'new',
              private onAction: (hunkId: string, s: HunkState) => void) { super(); }
  toDOM() {
    const el = document.createElement('div'); el.className = 'kai-hunk-actions flex gap-1 py-0.5';
    if (this.side === 'new') {
      const ok = mkBtn('✓', 'accept', () => this.onAction(this.hunkId, 'accepted'));   // emerald
      const no = mkBtn('✕', 'reject', () => this.onAction(this.hunkId, 'rejected'));   // crimson
      el.append(ok, no);
    }
    return el;
  }
  eq(other: HunkActionMarker) { return other.hunkId === this.hunkId; }
}

/** Line + gutter decorations for one side, derived from hunkRanges + hunkStates. */
export function diffDecorations(aligned: AlignedPatch, side: 'old' | 'new',
                                onAction: (id: string, s: HunkState) => void) {
  const ranges = aligned.hunkRanges.map((r) => ({ id: r.hunkId, s: r[side][0], e: r[side][1] }));
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = this.build(view); }
    update(u: EditorUpdate) { this.decorations = this.build(u.view); }   // rebuild on setHunkState effects (cheap, ranged)
    build(view: EditorView): DecorationSet {
      const states = view.state.field(hunkStates);
      const b = new RangeSetBuilder<Decoration>();
      const markers: { from: number; marker: GutterMarker }[] = [];
      for (const r of ranges) {
        if (r.e <= r.s) continue;
        const st = states[r.id] ?? 'pending';
        for (let l = r.s; l < r.e && l < view.state.doc.lines; l++) {
          const from = view.state.doc.line(l + 1).from;
          const cls = st === 'rejected'
            ? 'kai-line-rejected'                                  // dimmed + strike-through gutter dot
            : side === 'old' ? 'kai-line-del' : 'kai-line-add';    // del: danger-tinted bg / add: pass-tinted bg
          b.add(from, from, Decoration.line({ class: cls }));
        }
        const head = view.state.doc.line(Math.min(r.s + 1, view.state.doc.lines)).from;
        markers.push({ from: head, marker: new HunkActionMarker(r.id, side, onAction) });
      }
      // (gutter below returns markers via a function; combine in caller)
      return b.finish();
    }
  }, { decorations: (v) => v.decorations })
  // + gutter({ class: 'kai-hunk-gutter', markers: (view) => buildMarkers(view) })
}

/** Scroll-lock two views (rAF-guarded to avoid feedback loops). */
export function bindScroll(primary: EditorView, secondary: EditorView) {
  let lock = false;
  const sync = (from: EditorView, to: EditorView) => {
    if (lock) return; lock = true;
    to.scrollDOM.scrollTop = from.scrollDOM.scrollTop;    // alignment is line-parallel thanks to fillers
    requestAnimationFrame(() => (lock = false));
  };
  primary.scrollDOM.addEventListener('scroll', () => sync(primary, secondary), { passive: true });
  secondary.scrollDOM.addEventListener('scroll', () => sync(secondary, primary), { passive: true });
}
```

Each side is a read-only `EditorView` built with `EditorState.create({ doc, extensions: [readOnly, lineNumbers(), highlight of `patch.language` via `@codemirror/language-data` lazy loading, hunkStates, diffDecorations(...), minimalSetup] })`. Because both documents are line-parallel (fillers), scrollTop sync is exact and per-hunk line math is trivial.

### Step 3 — Apply protocol

```tsx
// DiffInspector footer
const accepted = hunks.filter((h) => diffStore.getState().hunkState(patch.patchId, h.hunkId) === 'accepted');
const result = await window.api.agent.applyPatch(patch.patchId, accepted.map((h) => h.hunkId));
if (!result.ok && result.error === 'stale-base') {
  // File changed on disk since the engine computed the patch (TOCTOU guard).
  // Offer: "Re-diff against current file" → agent emits a fresh patch.proposed.
}
```

Engine-side, `patch/apply` verifies `git hash-object <file> === baseSha`, constructs a filtered patch containing **only accepted hunks**, and applies it through `kaioken/gitops` (worktree-safe apply with merge guardrails). Rejected hunks are simply omitted; nothing partial ever touches the worktree. Result → `patch.applied` event → card + inspector update; spend/impact events may follow (impact re-run on applied paths).

---

# Part 4 — Step-by-Step Implementation Roadmap

Each phase ends in a **demoable, testable increment**. Phases 1–2 are the riskiest (IPC + streaming) and land first deliberately.

---

## Phase 1 — Foundation & IPC Spine

**Goal:** frameless window, typed IPC boundary, engine process supervised with crash/restart, zero functionality — maximum certainty in the skeleton.

**Files created/modified:**
- `src/shared/ipc-contract.ts` (partial: System, Pty stubs, EngineState), `src/shared/rpc.ts`, `src/shared/constants.ts`
- `src/main/index.ts`, `src/main/window.ts` (frameless: `titleBarStyle: 'hidden'` + `titleBarOverlay` on Windows, `vibrancy: 'under-window'` on macOS, `backgroundMaterial: 'acrylic'` on Win 11), `src/main/lifecycle.ts`, `src/main/context.ts`
- `src/main/engine/engine-host.ts` (fork/backoff/pending-RPC), `src/engine/engine-entry.ts` (**echo + ping only**), `src/main/ipc/index.ts`, `src/main/ipc/system.ts`
- `src/preload/index.ts` + `system.ts`; `src/renderer/src/lib/ipc.ts`; `App.tsx` with `WorkspaceShell` grid + `TitleBar` + placeholder `NavRail`
- `electron.vite.config.ts` — **second main input for `engine-entry`**; `tsconfig` path aliases for `src/shared`
- ESLint boundary rules: renderer may import only `shared/*` types + `window.api`; `no-restricted-imports` bans `electron` outside `main/`/`preload/`

**Acceptance criteria:**
1. `engine/ping` round-trip via DevTools console call succeeds (< 50 ms).
2. `engineHost.proc.kill()` (simulated crash) → app survives, engine state banner shows `crashed → restarting → ready`, backoff sequence visible in logs, ≤ 3 s to ready.
3. `app.quit()` with a fake pending RPC → promise rejects with `EngineOfflineError`, no hang, clean exit code 0.
4. In renderer DevTools: `process === undefined`, `require === undefined` (sandbox + isolation verified).
5. `tsc --noEmit` green across all three tsconfigs; preload object `satisfies KaiokenApi`.

---

## Phase 2 — Agent Engine Integration & Streaming Pipeline

**Goal:** real kaiopi sessions, 60 fps token streaming under load, multiplier dial wired end-to-end.

**Files:**
- `src/engine/engine-entry.ts`: kaiopi facade (`agent/start|prompt|cancel|resume`, `model/dial`), event emitter, **16 ms/32-delta batcher**, session journal (append-only JSONL, fsync 500 ms)
- `src/main/ipc/agent.ts` (notification fan-out; `approval/request` stub→auto-deny), `src/main/keychain.ts` (safeStorage)
- Renderer: `stores/agentStore.ts`, `lib/stream-buffer.ts`, `lib/markdown/incremental.ts`, `components/chat/*` (MessageList, StreamingText, Composer, MultiplierDial), `surfaces/AgentStreamSurface.tsx`
- `src/main/engine/approval-policy.ts` v1 (path-jailed writes auto-ask; everything else engine-classified)

**Acceptance criteria:**
1. Live session against a real provider streams visibly at full speed; **React Profiler shows ≤ 60 commits/s during streaming regardless of token rate** (verified with a scripted fake provider at 500+ tok/s).
2. 50 KB streamed message: ≥ 55 fps while pinned to bottom; mermaid/katex deferred until `message.done` (no layout thrash).
3. `cancel` mid-stream stops within 200 ms; partial text commits as a message with a "cancelled" status chip.
4. Kill engine mid-stream → restart → `resumeSession(lastSeq)` replays the journal with no visible gap or duplicate tokens.
5. Dial ×1→×8 changes engine-side behavior (visible in spend events); UI reflects engine truth within one round-trip.

---

## Phase 3 — Terminal PTY Subsystem

**Goal:** production terminal drawer with the port architecture of §3.1.

**Files:**
- `src/main/pty/pty-service.ts`, `src/main/ipc/pty.ts`, `src/preload/pty.ts`
- `src/renderer/src/components/terminal/{TerminalDrawer, TerminalTabs, TerminalPane}.tsx`, `stores/terminalStore.ts`
- `lib/keyboard/accelerators.ts`: `Ctrl+\`` (use `e.code === 'Backquote'` for layout independence)
- `package.json`: `node-pty` → `dependencies`; `"postinstall": "electron-rebuild -f -w node-pty"`

**Acceptance criteria:**
1. Type `stty size`; drag the split → reported cols/rows track the visual fit within 60 ms of drag-end (debounce verified).
2. `yes` flood for 10 s: terminal absorbs output (xterm buffer), **zero renderer long tasks > 50 ms** in Performance panel; UI (chat, tree) stays interactive.
3. `vim`/`htop` full-screen TUIs render and resize correctly (conpty + xterm-256color verified on Windows PowerShell and pwsh; zsh on macOS/Linux).
4. Drawer collapse keeps the session alive (process still listed in `pty:list`); drawer re-expand reattaches; window close kills all (task manager shows no orphans).
5. Keystroke P99 < 8 ms (instrument `write` → echo with a test script).
6. WebGL renderer active (about:sandbox-safe check in logs); forced-WebGL-failure falls back to DOM renderer without exception.

---

## Phase 4 — Tool Execution Cards & Destructive Gate

**Goal:** the safety and dossier identity of the product.

**Files:**
- `src/main/engine/approval-registry.ts`, full `approval-policy.ts`, `src/main/ipc/tools.ts`
- `src/preload/tools.ts`; `stores/approvalStore.ts`, `diffStore.ts` (state only)
- `components/tools/*` (ToolRunCard + BashBody, VerifyBody, IndexBody, ImpactBody, PatchBody), `components/approvals/*` (ApprovalModal, ApprovalCountdown, DiffApprovalPreview), `components/common/VerificationBadges.tsx`
- Engine: gate hooks in kaiopi tool dispatcher (`approval/request` emission for the four gated tools), verification badge emission from `verifycore`

**Acceptance criteria:**
1. E2E script: agent proposes `write_to_file` → modal appears → **keyboard-only flow**: press Enter → action is DENIED (safe default proven).
2. Auto-cancel: mock clock (or 5 s TTL config) → modal auto-denies, `tools:approval:resolved {reason:'timeout'}`, engine receives deny, tool card shows `denied` (amber).
3. One-shot proof: call `resolveApproval(id,'allow')` twice → second returns `unknown-or-expired`; approve a fabricated uuid → same. **There is no code path from renderer to engine tools.**
4. Policy: command matching `neverPatterns` (e.g. `rm -rf`, `sudo`) → auto-deny with policy reason; reads inside workspace → auto-allow per settings; writes outside workspace root → hard veto even if user clicks Allow.
5. Fourth pending approval auto-denies the oldest (`queue-overflow`) — no modal stacking.
6. `verify` tool runs render per-gate badge rows; a failing test shows crimson row + expandable output.

---

## Phase 5 — Inspector, Diff Review & Knowledge Surfaces

**Goal:** the right pane and the remaining six surfaces.

**Files:**
- `lib/diff/align.ts`, `lib/diff/cm-diff.ts`, `components/diff/{DiffInspector, SideBySideDiff, HunkActionBar}.tsx`
- `components/explorer/{FileTree, FileTreeRow}.tsx`, `stores/explorerStore.ts`; `src/main/ipc/workspace.ts` (path jail: every path `realpath`'d and prefix-checked against the session workspace root)
- `surfaces/{ResearchSurface, WikiSurface, CodemapSurface, CardsSurface, LedgerSurface}.tsx` + stores; `components/common/{MermaidBlock, CitationChip}.tsx`
- `src/main/engine/serve-bridge.ts` (lazy `serve/start`; `connect-src` allows `http://127.0.0.1:*` in CSP; token appended; daemon off unless Codemap opened)

**Acceptance criteria:**
1. **Hunk math proof:** on a scratch git repo, accept 2 of 4 hunks → Apply → `git diff` shows exactly the two hunks; `git apply --check` on the engine's filtered patch passes. Rejected hunks untouched.
2. TOCTOU: externally modify the file after `patch.proposed` → Apply returns `stale-base` → UI offers re-diff; no partial writes ever hit disk.
3. File tree: 10,000-file fixture — expand/scroll < 16 ms main-thread (Performance trace); `watchTree` reflects an external `touch` within ~1 s as an immutable store patch (only affected rows re-render).
4. Diff of a 5,000-line file paints both panes < 150 ms; scroll-lock stays glitch-free under fast wheel scrolling (no feedback loops — verified by log-free rAF lock).
5. Wiki renders markdown + Mermaid sequence + katex; regenerating re-streams sections without full-surface remount.
6. Codemap: opening the surface starts serve (loopback, ephemeral port); request without token → 401; graph interactive (pan/zoom/impact highlight); closing app kills the daemon (no lingering listener — `netstat` clean).
7. Ledger sums match engine `spend/query` to the cent; dial history entries carry the multiplier that produced them.

---

## Phase 6 — Velocity, Polish & Production Packaging

**Goal:** keyboard-first velocity, the full design system, and shippable artifacts.

**Files:**
- `components/omnibox/*` + `lib/keyboard/accelerators.ts` (full map: `Ctrl+K` omnibox — commands + fuzzy files via `workspace.search` + symbols via `index/refs`; `Ctrl+1..7`; `Ctrl+\``; `Ctrl+Shift+↑/↓` dial; `A`/`D` on focused hunk)
- `surfaces/SettingsSurface.tsx` (providers + safeStorage keys, gate policy config, TTL, budgets, appearance, shell profiles)
- `styles/hud.css` finalization (scanlines/aura strictly state-bound), empty/error states, `EngineOfflineBanner` polish
- `electron-builder.yml`, `build/entitlements.mac.plist`, `scripts/notarize.js`, CI matrix (win/mac/linux)

```yaml
# electron-builder.yml (essentials)
appId: works.kaioken.studio
productName: Kaioken Studio
files: ["out/**"]
asar: true
asarUnpack:                              # native + forked-process code must live on the real FS
  - "**/node_modules/node-pty/**"
  - "out/main/engine-entry.js"
  - "out/main/engine/**"                 # kaiopi bundle (or ship kaiopi via "extraResources" if it exceeds asar-unpack ergonomics)
win:  { target: [nsis] }
mac:  { target: [dmg, zip], hardenedRuntime: true, entitlements: build/entitlements.mac.plist, afterSign: scripts/notarize.js }
linux: { target: [AppImage, deb], category: Development }
publish: [{ provider: github }]          # electron-updater; update applies on quit — never mid-session
```

**Engine path resolution (packaged):** `utilityProcess.fork` requires a real file path; resolve via
`join(__dirname, 'engine-entry.js').replace('app.asar', 'app.asar.unpacked')` when `app.isPackaged`.

**Acceptance criteria:**
1. **Keyboard-only workflow test** (scripted): open app → `Ctrl+K` → open workspace → prompt → review patch hunks with `A`/`D` → apply → open terminal → run tests → switch all 7 surfaces — zero mouse input, all accelerators fire (capture-phase listener; terminal passthrough verified for non-bound keys).
2. Omnibox fuzzy search returns files (BM25 via `kaioken/search`) and symbols (AST oracle) < 100 ms on the 10k-file fixture.
3. Packaged builds launch on Windows (nsis), macOS (notarized dmg), Linux (AppImage): terminal works (node-pty ABI correct in asar-unpack), engine forks, provider key decrypts via safeStorage, auto-update smoke test green.
4. No `Ctrl+Shift+I` in production build (or gated behind settings); CSP violations: zero console warnings.
5. Cold start < 2.5 s to interactive (measured on reference hardware); engine `ready` < 1.2 s after that.

---

## Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `node-pty` ABI mismatch after Electron upgrades | Pinned Electron version + `postinstall` rebuild + packaged-build terminal smoke test in CI (Phase 3/6 criteria) |
| `utilityProcess` + asar path edge cases | `asarUnpack` the engine bundle; a `resolveEngineEntry()` helper + unit test on both dev & packaged paths |
| Provider stream bursts > renderer budget | StreamBuffer adaptive coalescing (64 KB tail rule) + seq gap detection + journal resync (§1.5) |
| conpty bursty output on Windows floods renderer | Ports (not invoke) + xterm scrollback cap; optional `windowsHide`/buffer tuning if traces show pressure |
| Approval UX fatigue → rubber-stamping | Risk-tiered policy (auto-allow safe reads), queue cap of 3, summary-first copy, destructive-only `armed` styling — the gate stays *rare and meaningful* |
| kaiopi API drift vs. this contract | `ipc-contract.ts` lives in `desktop/src/shared` and is consumed by the engine entry at build time — type break = compile break, not runtime surprise |

## Immediate Next Actions (this week)

1. Land `src/shared/ipc-contract.ts` + `rpc.ts` and wire the three tsconfigs + lint boundaries (Phase 1, day 1).
2. `engine-host.ts` + echo `engine-entry.ts` + crash/restart harness — this de-risks the single most novel seam.
3. Port-benchmark micro-test: `webContents.postMessage` port transfer + 1 MB/s synthetic PTY flood, measure renderer frame budget before writing any UI.
4. Lock the Tailwind v4 token sheet with the CLI palette owner so desktop and CLI never diverge.

This blueprint is executable as written: every phase has a verifiable exit, every IPC message has one owner, and every byte that crosses the process boundary is typed, sequenced, and policed. Ship Phase 1 first — everything else hangs off that spine.