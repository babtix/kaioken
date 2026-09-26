# KAIOKEN DESKTOP STUDIO — Architectural Blueprint & Phased Implementation Plan

**Classification:** Internal Engineering Blueprint · v1.0
**Audience:** Desktop Platform Team, Agent Runtime Team, Frontend Guild
**Scope:** `desktop/` (Electron 44 + electron-vite + React 19) ↔ `kaiopi` agent engine (`d:\project\ai_now_know\kaiopi`)
**Reference architecture:** `hermes-desktop` (Hermes Desktop, Nous Research) — adopted patterns: strict contextIsolation, node-pty ↔ @xterm bridge, React 19 + Tailwind v4, dual-pane studio layout.

---

## 0. Executive Summary — The Five Architectural Decisions

Before the detail, these are the load-bearing decisions. Everything in this document is derived from them.

| # | Decision | Choice | Rationale |
| --- | --- | --- | --- |
| D1 | Kaiopi hosting model | **Child Node.js process** (`child_process.fork` of a wrapped `kaiopi-daemon` entry), with stdio IPC channels + a loopback **control socket** (Unix domain socket / Windows named pipe) for streaming | Kaiopi is a *server-grade harness* (chord RPC, serve/SSE daemon, gitops worktrees). In-process hosting would inherit main-process GC pressure and crash the whole app on engine failure. A child process gives us: crash isolation, independent memory ceiling, zero-copy-ish streaming over a dedicated channel, and a restart supervisor. |
| D2 | IPC topology | **Per-domain async `ipcMain.handle` + push-channel `webContents.send`**. Control plane = JSON over Electron IPC (invoke/handle). Data plane (token streams, PTY bytes) = the **shared control socket is NOT exposed to renderer**; instead main process *forwards* it over Electron IPC **using batched deltas** | contextIsolation: true means only preload-mediated APIs exist. We never expose raw sockets or fs to the renderer. |
| D3 | Rendering performance | **Pull-based, rAF-aligned store writes.** Main process batches token deltas (10–16 ms windows) into `agent.delta-batch` frames; renderer's `agentStore` applies them in a `requestAnimationFrame` scheduler so token rate decouples from React render rate | LLM streams at ~100+ deltas/sec; tool events spike during verify runs. Batching at the transport + scheduler in the store guarantees 60 fps regardless of burst volume. |
| D4 | PTY | `node-pty` in **main**, `@xterm/xterm` + `@xterm/addon-webgl` in renderer, bi-directional via two typed channels: renderer→main `pty:write` (small, invoke) and main→renderer `pty:data` (batched, ≤ 24 KB payloads, backpressured by pause/resume flags) | Matches the Hermes pattern (proven); keeps the pty in main so it survives renderer reloads (HMR) without killing shells. |
| D5 | Destructive approval gate | **Synchronous-modal approval protocol**: tool pauses engine-side → main process raises `tools:approval-request` → main builds an approval window state → renderer *renders* it, but the **gating authority lives in main** (renderer only signals Deny/Allow; main enforces the 5-minute auto-deny, focus-trap defaults, and audit log). Renderer compromise ⇒ engine still safe | The Hermes destructive-safety protocol, hardened: approval is a *main-process capability*, not a renderer UI concern. |

---

## PART 1 — System Topology & IPC Protocol Specification

### 1.1 Process Model Diagram

```javascript
┌─────────────────────────────────────────────────────────────────────────────┐
│                          OS PROCESS: Kaioken Desktop                        │
│                                                                             │
│  ┌─────────────────────────┐         ┌─────────────────────────────────┐   │
│  │   ELECTRON MAIN         │         │   KAIOPi DAEMON (child)         │   │
│  │   (node)                │         │   node kaiopi-daemon.js         │   │
│  │                         │ fork()  │                                 │   │
│  │  ┌───────────────────┐  │ ══════► │  ┌───────────────────────────┐  │   │
│  │  │ ProcessSupervisor  │  │ stdio  │  │ Kaiopi Runtime            │  │   │
│  │  │ (start/stop/watch) │  │ channels│  │  · pi-agent-core loop     │  │   │
│  │  │ heartbeat /        │  │ +      │  │  · pi-ai providers        │  │   │
│  │  │ exponential backoff│  │ control│  │  · kaioken/* (index,      │  │   │
│  │  └───────────────────┘  │ socket │  │    verify, gitops, ...)   │  │   │
│  │  ┌───────────────────┐  │        │  │  · chord message bus      │  │   │
│  │  │ PtyManager        │  │        │  └───────────────────────────┘  │   │
│  │  │ (node-pty)        │  │        │           ▲                     │   │
│  │  └───────────────────┘  │        └───────────┼─────────────────────┘   │
│  │  ┌───────────────────┐  │                    │                       │
│  │  │ ApprovalGate      │  │     ┌──────────────┴────────────────┐      │
│  │  │ (main authority)  │◄┼────►│  Loopback control socket      │      │
│  │  └───────────────────┘  │     │  (unix:// .sock / \\.\pipe\ )│      │
│  │  ┌───────────────────┐  │     └───────────────────────────────┘      │
│  │  │ StreamBatcher     │  │                                            │
│  │  │ (delta coalescing)│  │                                            │
│  │  └───────────────────┘  │                                            │
│  └──────────┬──────────────┘                                            │
│             │ ipcMain.handle / webContents.send                            │
│  ┌──────────┴──────────────┐                                            │
│  │  PRELOAD (contextBridge)│   sandboxed, no node modules                 │
│  │  agent / pty / workspace│                                            │
│  │  / tools / window       │                                            │
│  └──────────┬──────────────┘                                            │
│             │ isolated world                                             │
│  ┌──────────┴──────────────┐                                            │
│  │  RENDERER (React 19)    │                                            │
│  │  sessionStore · agentStore · terminalStore · diffStore ·              │
│  │  explorerStore · costStore                                            │
│  └─────────────────────────┘                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Why not alternatives (evaluation matrix):**

| Model | Crash isolation | Memory ceiling | HMR survival | Streaming | Complexity |
| --- | --- | --- | --- | --- | --- |
| In-process worker_threads | ❌ engine crash kills main | shared | n/a | structured-clone copies | low |
| Forked child + stdio (chosen) | ✅ | ✅ (heap flags) | ✅ | channel per stream | medium |
| Remote loopback HTTP/SSE only | ✅ | ✅ | ✅ | best (server already exists) | high (dup auth/session) |
| `utilityProcess` | ✅ | ✅ | ✅ | same as fork | medium — *viable alternative*; chosen model also works with `utilityProcess.fork` with zero protocol change |

> **Note:** Electron's `utilityProcess` is the future-proof carrier; the protocol below is carrier-agnostic. Phase 1 implements `child_process.fork`; swapping to `utilityProcess` is a 20-line change in `ProcessSupervisor`.

### 1.2 Communication Planes

**Control plane** (renderer ↔ main ↔ engine): request/response JSON-RPC-style over `ipcRenderer.invoke` / `ipcMain.handle`. Used for: session lifecycle, model selection, multiplier dial, workspace scanning, file reads, approval responses.

**Data plane** (engine → main → renderer): unidirectional push streams, each with its own typed event envelope, batched by `StreamBatcher`:

- `agent.delta` (token chunks)
- `agent.tool-event` (tool lifecycle: start/progress/output/end)
- `pty.data` (terminal bytes)
- `verify.result` / `index.progress` / `cost.tick` / `wiki.update`

**Never cross the streams:** each stream has a bounded per-frame size and a coalescing policy (§1.5).

### 1.3 IPC Contract — TypeScript Definitions

All channels are prefixed by domain. The preload exposes exactly these namespaces on `window.api`.

```ts
// ─────────────────────────────────────────────────────────────
// src/shared/ipc/channels.ts — single source of truth
// ─────────────────────────────────────────────────────────────
export const CH = {
  agent: {
    createSession: 'agent:create-session',
    sendPrompt:    'agent:send-prompt',
    interrupt:     'agent:interrupt',
    setModel:      'agent:set-model',
    setMultiplier: 'agent:set-multiplier',        // ×1..×10
    getHistory:    'agent:get-history',
    // push channels (main → renderer)
    evDeltaBatch:  'agent:ev:delta-batch',
    evToolEvent:   'agent:ev:tool-event',
    evStatus:      'agent:ev:status',             // idle | thinking | executing
    evCost:        'agent:ev:cost',
    evSessionMeta: 'agent:ev:session-meta',
  },
  pty: {
    create:   'pty:create',
    write:    'pty:write',
    resize:   'pty:resize',
    kill:     'pty:kill',
    list:     'pty:list',
    evData:   'pty:ev:data',
    evExit:   'pty:ev:exit',
  },
  workspace: {
    open:        'workspace:open',
    tree:        'workspace:tree',
    readFile:    'workspace:read-file',
    listWorktrees: 'workspace:list-worktrees',
    evTreeDelta: 'workspace:ev:tree-delta',
  },
  diff: {
    open:        'diff:open',        // request diff for a change set
    acceptHunk:  'diff:accept-hunk',
    rejectHunk:  'diff:reject-hunk',
    applyAll:    'diff:apply-all',
  },
  tools: {
    approvalRespond: 'tools:approval-respond',
    evApprovalRequest: 'tools:ev:approval-request',   // push
    evApprovalResolved:'tools:ev:approval-resolved',  // push
  },
  window: {
    setFrame: 'window:set-frame',   // custom titlebar minimize/max/close
  },
} as const;
```

```ts
// ─────────────────────────────────────────────────────────────
// src/shared/ipc/types.ts — wire contracts
// ─────────────────────────────────────────────────────────────
export type ModelId = string;              // e.g. 'claude-sonnet-4', 'gemini-2.5-pro', 'ollama:qwen3-32b'
export type Multiplier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface SessionConfig {
  workspaceRoot: string;
  worktree?: string;                       // kaioken/gitops delegation branch
  model: ModelId;
  multiplier: Multiplier;
  systemPromptVariant?: 'default' | 'minimal' | 'architect';
}

// ── Agent ────────────────────────────────────────────────────
export interface DeltaFrame {              // batched token deltas
  sessionId: string;
  seq: number;                             // monotonic; renderer drops stale seq
  frames: DeltaItem[];                     // coalesced ≤ 32ms worth
  ts: number;
}
export interface DeltaItem {
  kind: 'token' | 'thinking' | 'citation' | 'mermaid' | 'error';
  text: string;                            // token/thinking text; JSON string for citation/mermaid
}

export type ToolKind =
  | 'run_command' | 'write_to_file' | 'apply_patch' | 'read_file'
  | 'kaioken/index' | 'kaioken/verify' | 'kaioken/impact' | 'kaioken/gitops' | 'kaioken/search';

export interface ToolEvent {
  sessionId: string;
  toolCallId: string;
  kind: ToolKind;
  phase: 'queued' | 'started' | 'progress' | 'awaiting-approval' | 'completed' | 'failed' | 'denied';
  title: string;                           // humanized: "Verify: npm test"
  detail?: string;                         // truncated preview (≤ 2 KB)
  progress?: { pct?: number; label?: string };
  resultSummary?: string;                  // exit code, tests pass/fail counts
  durationMs?: number;
  destructive: boolean;                    // gates approval UI
  approvalId?: string;                     // set when phase === 'awaiting-approval'
}

// ── PTY ──────────────────────────────────────────────────────
export interface PtyCreateOptions {
  shell?: string;                          // 'powershell' | 'pwsh' | 'cmd' | 'wsl' | 'bash'
  cwd: string;
  cols: number;
  rows: number;
  env?: Record<string, string>;
  name?: string;                           // tab label
}
export interface PtyDataFrame {
  id: string;
  seq: number;
  data: string;                            // base64 or utf8; base64 if flagged
  base64?: boolean;
}

// ── Approval gate ────────────────────────────────────────────
export interface ApprovalRequest {
  approvalId: string;
  toolCallId: string;
  kind: ToolKind;
  risk: 'low' | 'medium' | 'high' | 'destructive';
  summary: string;                         // "Apply patch to 3 files"
  payload: ApprovalPayload;                // diff text, command, file content — main process already validated
  createdAt: number;
  timeoutMs: number;                       // default 300_000
  // pre-computed for fast UI: engine ran verifycore pre-flight on the payload
  preflight?: { impactedSymbols: string[]; blastRadius: string; warnings: string[] };
}
export type ApprovalPayload =
  | { type: 'command'; command: string; cwd: string; envRedacted: string[] }
  | { type: 'write'; path: string; content: string; byteSize: number }
  | { type: 'patch'; patchText: string; hunks: HunkMeta[] }
  | { type: 'git'; operations: string[] };  // e.g. ['checkout -b feature/x', 'merge --squash']
export interface HunkMeta {
  index: number;
  file: string;
  oldStart: number; oldLines: number;
  newStart: number; newLines: number;
  header: string;
}
export type ApprovalDecision = 'allow' | 'allow-session' | 'deny';
export interface ApprovalResponse {
  approvalId: string;
  decision: ApprovalDecision;
  // "allow-session" grants this tool kind for session duration; recorded in audit log
}

// ── Diff ─────────────────────────────────────────────────────
export interface DiffHunk {
  id: string;                              // `${file}#${hunkIndex}`
  file: string;
  hunk: HunkMeta;
  oldText: string;
  newText: string;
  status: 'pending' | 'accepted' | 'rejected';
  renderedNote?: string;                   // kaioken/impact annotation
}
export interface DiffDocument {
  id: string;                              // toolCallId or change-set id
  title: string;
  files: string[];
  hunks: DiffHunk[];
}
```

```ts
// ─────────────────────────────────────────────────────────────
// src/shared/ipc/api.ts — the shape of window.api
// ─────────────────────────────────────────────────────────────
import type * as T from './types';

export interface AgentApi {
  createSession(cfg: T.SessionConfig): Promise<{ sessionId: string }>;
  sendPrompt(sessionId: string, prompt: string): Promise<void>;
  interrupt(sessionId: string): Promise<void>;
  setModel(sessionId: string, model: T.ModelId): Promise<void>;
  setMultiplier(sessionId: string, m: T.Multiplier): Promise<void>;
  getHistory(sessionId: string): Promise<unknown[]>;
  onDeltaBatch(cb: (f: T.DeltaFrame) => void): () => void;
  onToolEvent(cb: (e: T.ToolEvent) => void): () => void;
  onStatus(cb: (s: { sessionId: string; status: 'idle'|'thinking'|'executing' }) => void): () => void;
  onCost(cb: (c: T.CostTick) => void): () => void;
}
export interface PtyApi {
  create(opts: T.PtyCreateOptions): Promise<{ id: string; pid: number }>;
  write(id: string, data: string): Promise<void>;
  resize(id: string, cols: number, rows: number): Promise<void>;
  kill(id: string): Promise<void>;
  list(): Promise<{ id: string; name: string; pid: number }[]>;
  onData(cb: (f: T.PtyDataFrame) => void): () => void;
  onExit(cb: (e: { id: string; exitCode: number }) => void): () => void;
}
export interface WorkspaceApi {
  open(dir?: string): Promise<{ root: string }>;
  tree(subdir?: string): Promise<TreeNode[]>;
  readFile(path: string): Promise<{ content: string; truncated: boolean }>;
  listWorktrees(): Promise<WorktreeInfo[]>;
  onTreeDelta(cb: (d: TreeDelta) => void): () => void;
}
export interface DiffApi {
  open(doc: T.DiffDocument): Promise<void>;          // renderer pushes a parsed doc for review
  acceptHunk(diffId: string, hunkId: string): Promise<void>;
  rejectHunk(diffId: string, hunkId: string): Promise<void>;
  applyAll(diffId: string): Promise<void>;
}
export interface ToolsApi {
  respond(r: T.ApprovalResponse): Promise<void>;
  onApprovalRequest(cb: (r: T.ApprovalRequest) => void): () => void;
  onApprovalResolved(cb: (r: { approvalId: string; outcome: 'allowed'|'denied'|'timeout' }) => void): () => void;
}
export interface KaiokenApi {
  agent: AgentApi; pty: PtyApi; workspace: WorkspaceApi;
  diff: DiffApi; tools: ToolsApi;
}
```

### 1.4 Preload Implementation (strict sandbox)

```ts
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import { CH } from '../shared/ipc/channels';
import type { KaiokenApi } from '../shared/ipc/api';

function sub<T>(channel: string) {
  return (cb: (payload: T) => void) => {
    const listener = (_: unknown, payload: T) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

const api: KaiokenApi = {
  agent: {
    createSession: (cfg) => ipcRenderer.invoke(CH.agent.createSession, cfg),
    sendPrompt:    (id, p) => ipcRenderer.invoke(CH.agent.sendPrompt, id, p),
    interrupt:     (id)    => ipcRenderer.invoke(CH.agent.interrupt, id),
    setModel:      (id, m) => ipcRenderer.invoke(CH.agent.setModel, id, m),
    setMultiplier: (id, m) => ipcRenderer.invoke(CH.agent.setMultiplier, id, m),
    getHistory:    (id)    => ipcRenderer.invoke(CH.agent.getHistory, id),
    onDeltaBatch:  sub(CH.agent.evDeltaBatch),
    onToolEvent:   sub(CH.agent.evToolEvent),
    onStatus:      sub(CH.agent.evStatus),
    onCost:        sub(CH.agent.evCost),
  },
  pty: {
    create: (o) => ipcRenderer.invoke(CH.pty.create, o),
    write:  (id, d) => ipcRenderer.invoke(CH.pty.write, id, d),
    resize: (id, c, r) => ipcRenderer.invoke(CH.pty.resize, id, c, r),
    kill:   (id) => ipcRenderer.invoke(CH.pty.kill, id),
    list:   () => ipcRenderer.invoke(CH.pty.list),
    onData: sub(CH.pty.evData),
    onExit: sub(CH.pty.evExit),
  },
  // workspace, diff, tools — same mechanical pattern
  workspace: { /* … */ },
  diff: { /* … */ },
  tools: { /* … */ },
} as KaiokenApi;

contextBridge.exposeInMainWorld('api', api);
```

**Security rules enforced at review time:**

1. Preload exports **no** `ipcRenderer` itself — only bound functions.
2. Every `invoke` handler in main validates payloads with **zod** schemas (shared between processes, `src/shared/ipc/schemas.ts`). Unknown fields are stripped; paths are resolved and checked against `workspaceRoot` (no `..` escapes).
3. All `webContents.send` targets are validated against an allow-list; renderer cannot subscribe to arbitrary channels (the `sub` helper is channel-fixed at preload build).

### 1.5 Stream Buffering & Backpressure (the 60 fps guarantee)

**Problem shape:** LLM token deltas arrive at 50–300 msg/s; verify runs emit progress lines; PTY echoes burst at 115200 baud equivalents. React cannot re-render per message.

**Three-layer defense:**

**Layer A — Transport coalescing (main process).** `StreamBatcher<T>`: per-stream key → ring buffer; flush on whichever fires first: (a) 16 ms timer, (b) 64 KiB payload, (c) `flush()` call (e.g., tool boundary, `\n` on pty idle).

```ts
// src/main/streaming/StreamBatcher.ts
export class StreamBatcher<T> {
  private buf: T[] = [];
  private timer: NodeJS.Timeout | null = null;
  constructor(
    private readonly flushFn: (batch: T[]) => void,
    private readonly opts: { windowMs?: number; maxBytes?: number; sizeOf?: (t: T) => number } = {},
  ) {}
  push(item: T) {
    this.buf.push(item);
    const overBytes = this.opts.sizeOf && this.buf.reduce((n, i) => n + this.opts.sizeOf!(i), 0) > (this.opts.maxBytes ?? 64 * 1024);
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.opts.windowMs ?? 16);
    if (overBytes) this.flush();
  }
  flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.buf.length === 0) return;
    const batch = this.buf; this.buf = [];
    this.flushFn(batch);
  }
}
```

**Layer B — Renderer apply scheduler.** Each store's high-frequency mutation path writes to a *mutable draft buffer*, and a single `rAF` loop commits to the Zustand store once per frame. This is the classic "structural sharing + one commit per frame" pattern: cheap because token appends are string concat on a draft, and React only sees one state change per 16.6 ms.

```ts
// src/renderer/lib/frameScheduler.ts
type Commit = () => void;
const queue = new Set<Commit>();
let scheduled = false;
export function scheduleCommit(c: Commit) {
  queue.add(c);
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const batch = [...queue]; queue.clear();
      batch.forEach(fn => fn());
    });
  }
}
```

**Layer C — Virtualized rendering.** Conversation list (`@tanstack/react-virtual`), terminal (xterm handles its own rendering), diff viewer (per-hunk CodeMirror instances, only visible hunks mounted). Tool cards render in collapsed state by default; expanded state renders output through `react-shiki` in an idle callback.

**Backpressure rules:**

| Stream | Producer throttle | Renderer throttle |
| --- | --- | --- |
| `agent.delta` | engine batches ≤ 32 ms; main `StreamBatcher` 16 ms | rAF commit; drop `seq < lastSeq` frames |
| `pty.data` | node-pty emits as-is; main batches to ≤ 24 KB frames | xterm `write()` is itself buffered; we call it directly in rAF; if `terminal.buffer.active.length` > 5000 lines, send `pty:throttle` → main sets `pause()` on the pty stream |
| `verify.progress` | engine ≤ 10 msg/s | store-only, no component subscription except active card |
| `cost.tick` | engine 1/s | store-only; Cost Ledger pane subscribes |

**Sequence numbers & ordering:** every pushed frame carries `{ seq }` monotonic per stream. Renderer drops out-of-order frames (cheap guard against the rare IPC reordering on heavy load) and can request `agent:resync(sessionId, fromSeq)` if a gap is detected — main asks the engine for the session's append-only event log (pi-agent-core already keeps one).

---

## PART 2 — Project File Tree & Component Hierarchy

### 2.1 Directory Structure

```javascript
desktop/
├── electron.vite.config.ts
├── package.json
├── electron-builder.yml
├── tsconfig.json
├── tsconfig.node.json  tsconfig.web.json
├── scripts/
│   ├── dev.ps1                      # concurrently: engine watch + electron-vite dev
│   └── pack-kaiopi.mjs              # bundles kaiopi-daemon entry into out/
├── src/
│   ├── shared/                      # compiled into BOTH processes
│   │   ├── ipc/
│   │   │   ├── channels.ts          # CH — all channel names
│   │   │   ├── types.ts             # wire contracts (§1.3)
│   │   │   ├── schemas.ts           # zod schemas, used by main handlers
│   │   │   └── api.ts               # KaiokenApi interface
│   │   ├── ansi-tokens.ts           # 16-color palette → CSS var map
│   │   └── events.ts                # typed EventEmitter helpers
│   │
│   ├── main/                        # Electron main
│   │   ├── index.ts                 # app lifecycle, window creation
│   │   ├── windows.ts               # frameless window + acrylic/vibrancy opts
│   │   ├── supervisor/
│   │   │   ├── ProcessSupervisor.ts # fork/watch/restart kaiopi
│   │   │   ├── heartbeat.ts         # ping/pong, dead-man switch
│   │   │   └── engineClient.ts      # RPC client over stdio+socket
│   │   ├── ipc/
│   │   │   ├── register.ts          # wires all ipcMain.handle handlers
│   │   │   ├── agent.ts             # session mgmt + stream forwarding
│   │   │   ├── pty.ts               # node-pty manager
│   │   │   ├── workspace.ts         # fs tree, worktrees, watcher
│   │   │   ├── diff.ts              # hunk accept/reject → engine
│   │   │   ├── tools.ts             # ApprovalGate authority
│   │   │   └── window.ts            # frame controls
│   │   ├── streaming/
│   │   │   └── StreamBatcher.ts
│   │   ├── security/
│   │   │   ├── pathGuard.ts         # workspace-root path resolution
│   │   │   └── auditLog.ts          # append-only JSONL approval log
│   │   └── menu.ts                  # application menu + global accelerators
│   │
│   ├── preload/
│   │   ├── index.ts                 # contextBridge root
│   │   ├── agent.ts  pty.ts  workspace.ts  tools.ts  diff.ts
│   │   └── index.d.ts               # global Window typing
│   │
│   └── renderer/
│       ├── index.html
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx              # layout shell + surface switcher
│       │   ├── styles/
│       │   │   ├── tokens.css       # ANSI palette CSS vars (Tailwind v4 @theme)
│       │   │   └── globals.css
│       │   ├── stores/
│       │   │   ├── sessionStore.ts  # active session, model, multiplier dial
│       │   │   ├── agentStore.ts    # messages, tool calls, streaming buffer
│       │   │   ├── terminalStore.ts # pty tabs, dims, fit-addon state
│       │   │   ├── explorerStore.ts # file tree, selection
│       │   │   ├── diffStore.ts     # open DiffDocuments, hunk statuses
│       │   │   ├── approvalStore.ts # pending ApprovalRequest queue
│       │   │   └── costStore.ts     # token spend ledger
│       │   ├── lib/
│       │   │   ├── frameScheduler.ts
│       │   │   ├── markdown.ts      # remark pipeline + katex + mermaid
│       │   │   ├── streamingText.ts # draft-buffer + commit helper
│       │   │   └── cx.ts
│       │   ├── hooks/
│       │   │   ├── useAgentStream.ts    # subscribes window.api.agent.*
│       │   │   ├── usePty.ts
│       │   │   ├── useHotkeys.ts        # Ctrl+K, Ctrl+1..9, Ctrl+`
│       │   │   └── useApprovalGate.ts
│       │   ├── components/
│       │   │   ├── layout/
│       │   │   │   ├── AppShell.tsx        # grid: rail / center / inspector / terminal
│       │   │   │   ├── TitleBar.tsx        # frameless controls, session status dot
│       │   │   │   ├── NavRail.tsx         # 7 surfaces
│       │   │   │   ├── CenterPane.tsx      # surface router
│       │   │   │   ├── InspectorPane.tsx   # right dynamic panel host
│       │   │   │   └── TerminalDrawer.tsx  # collapsible, resizable
│       │   │   ├── chat/
│       │   │   │   ├── AgentStream.tsx     # virtualized conversation
│       │   │   │   ├── MessageItem.tsx     # markdown + citations + mermaid blocks
│       │   │   │   ├── Composer.tsx        # prompt input, model picker, multiplier dial
│       │   │   │   ├── ToolRunCard.tsx     # collapsible tool lifecycle card
│       │   │   │   ├── CitationChip.tsx    # verifiable AST ref chip
│       │   │   │   └── ApprovalModal.tsx   # destructive gate modal
│       │   │   ├── terminal/
│       │   │   │   ├── TerminalPane.tsx    # xterm + webgl + fit
│       │   │   │   └── TerminalTabs.tsx
│       │   │   ├── explorer/
│       │   │   │   ├── FileTree.tsx        # virtualized tree
│       │   │   │   └── WorktreeBar.tsx
│       │   │   ├── diff/
│       │   │   │   ├── DiffInspector.tsx   # file tabs + hunk list
│       │   │   │   ├── SideBySideDiff.tsx  # CodeMirror 6 read-only pair
│       │   │   │   └── HunkActions.tsx     # per-hunk accept/reject
│       │   │   ├── research/  wiki/  cards/  graph/  cost/  settings/
│       │   │   └── ui/            # HUD chrome: Scanlines, CornerBrackets, PulseDot, AuraSweep
│       │   └── surfaces/          # one root per NavRail surface (thin wrappers)
```

### 2.2 Layout Map — Surfaces ↔ Inspector Panels

```javascript
┌──TitleBar──────────────────────────────────────────────────────────────────┐
│ ● session   model ▾   ×5 dial   |  worktree ▾   |  min ▢ ✕                │
├──────┬─────────────────────────────────────────────┬───────────────────────┤
│ NAV  │  CENTER SURFACE (router)                    │  DYNAMIC INSPECTOR    │
│ RAIL │                                             │  (per selection)      │
│ 🗨 Chat│  · AgentStream (messages + tool cards)    │  · DiffInspector      │
│ 🔍   │  · Research dossier view                    │  · FileTree           │
│ 📖   │  · Wiki (mermaid sequence graphs)           │  · Mermaid preview    │
│ 🗺  │  · Codemap graph (kaioken/serve iframe/SSE)  │  · verify results     │
│ 🃏   │  · Cards grid                               │  · cost detail        │
│ 💰   │  · Cost Ledger                              │                       │
│ ⚙    │  · Settings                                 │                       │
├──────┴─────────────────────────────────────────────┴───────────────────────┤
│ TERMINAL DRAWER (Ctrl+`) — tabs, multiplexed pty sessions                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Inspector resolution rule:** a single `inspectorStore` holds `activeView: 'diff' | 'tree' | 'mermaid' | 'verify' | 'cost' | null` + payload. Both user clicks (file tree selection → `tree`; tool card "Review diff" → `diff`) and engine pushes (approval modal's diff preview shares `diffStore`) write here. Only one inspector view mounted at a time → cheap context switching, no hidden re-render cost.

### 2.3 Store Partitioning (no cross-talk re-renders)

Domain stores subscribe only to their own `window.api` channels. **Selectors are the contract**: components use `useAgentStore(s => s.messageById(id)?.text)` — Zustand's `useStore` with selector + `Object.is` equality means a token update to message *N* re-renders only that message's component (and even then, only on frame commits).

- `agentStore`: messages keyed by id, tool calls keyed by `toolCallId`, ordered id lists per session. Streaming writes go through `streamingText.ts` drafts; frame commit swaps in immutable message objects.
- `terminalStore`: holds only tab metadata and `cols/rows`. **Terminal data never touches Zustand** — it flows main → preload → xterm `write()` directly (the one sanctioned escape hatch, documented in `usePty.ts`).
- `explorerStore`: tree nodes as flat map `Record<path, Node>` + `children: string[]` (normalization avoids deep nested object churn); tree-delta events patch the map immutably.
- `diffStore`: `DiffDocument` map; hunk status updates create new hunk objects only for the touched hunk.
- `approvalStore`: queue of `ApprovalRequest`; modal renders `queue[0]`; focus-trap + deny-default enforced by component, timeout enforced by main (§3.4).
- `costStore`: append-only tick entries + derived aggregates (computed in selector memo, not stored).

---

## PART 3 — Core Implementation Deep-Dive

### 3.1 The PTY & Terminal Bridge

**File: `src/main/ipc/pty.ts`**

```ts
import { ipcMain } from 'electron';
import * as pty from 'node-pty';
import { CH } from '../../shared/ipc/channels';
import { PtyCreateOptions, PtyDataFrame } from '../../shared/ipc/types';
import { z } from 'zod';
import { StreamBatcher } from '../streaming/StreamBatcher';

const createSchema = z.object({
  shell: z.string().optional(),
  cwd: z.string().min(1),
  cols: z.number().int().min(2).max(500),
  rows: z.number().int().min(2).max(200),
  env: z.record(z.string()).optional(),
  name: z.string().optional(),
});

interface Session {
  proc: pty.IPty;
  batcher: StreamBatcher<PtyDataFrame>;
  seq: number;
  throttled: boolean;
  writeQueue: string[];     // while throttled, renderer writes queue here
}

const sessions = new Map<string, Session>();
let counter = 0;

const SHELLS: Record<string, string> = {
  powershell: 'powershell.exe', pwsh: 'pwsh.exe', cmd: 'cmd.exe',
  wsl: 'wsl.exe', bash: 'bash', zsh: 'zsh',
};

export function registerPtyIpc(getWindow: () => Electron.BrowserWindow | null) {
  const broadcast = (channel: string, payload: unknown) =>
    getWindow()?.webContents.send(channel, payload);

  ipcMain.handle(CH.pty.create, async (_e, raw: unknown) => {
    const opts = createSchema.parse(raw);
    const shell = SHELLS[opts.shell ?? defaultShell()] ?? defaultShell();
    const id = `pty-${++counter}`;
    const proc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: opts.cols, rows: opts.rows, cwd: opts.cwd,
      env: { ...process.env, ...opts.env } as Record<string, string>,
    });
    const s: Session = {
      proc, seq: 0, throttled: false, writeQueue: [],
      batcher: new StreamBatcher<PtyDataFrame>(
        (frames) => frames.forEach(f => broadcast(CH.pty.evData, f)),
        { windowMs: 8, maxBytes: 24 * 1024, sizeOf: f => f.data.length },
      ),
    };
    proc.onData(d => s.batcher.push({ id, seq: ++s.seq, data: d }));
    proc.onExit(({ exitCode }) => {
      s.batcher.flush();
      broadcast(CH.pty.evExit, { id, exitCode });
      sessions.delete(id);
    });
    sessions.set(id, s);
    return { id, pid: proc.pid };
  });

  ipcMain.handle(CH.pty.write, (_e, id: string, data: string) => {
    const s = sessions.get(id);
    if (!s) return;
    if (s.throttled) { if (s.writeQueue.length < 64) s.writeQueue.push(data); return; }
    s.proc.write(data);
  });

  ipcMain.handle(CH.pty.resize, (_e, id: string, cols: number, rows: number) => {
    sessions.get(id)?.proc.resize(cols, rows);
  });

  ipcMain.handle(CH.pty.kill, (_e, id: string) => {
    const s = sessions.get(id);
    if (s) { s.batcher.flush(); s.proc.kill(); }
  });

  ipcMain.handle(CH.pty.list, () =>
    [...sessions.entries()].map(([id, s]) => ({ id, pid: s.proc.pid, name: id })));
}
```

**Resize path:** the `FitAddon` in the renderer measures the container → `usePty` debounces 50 ms → `api.pty.resize(id, cols, rows)`. Terminal tabs each own one session; "shell toggling" = create new session with different `shell` option, kill old on user confirm (or keep both — tabs support multiplexing natively).

**File: `src/renderer/components/terminal/TerminalPane.tsx`** (annotated key lines)

```tsx
export function TerminalPane({ id, cwd }: { id: string; cwd: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    const term = new Terminal({
      theme: ansiTheme,                       // from shared/ansi-tokens.ts
      fontFamily: '"Cascadia Mono", monospace',
      fontSize: 13,
      allowProposedApi: true,
    });
    termRef.current = term;
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebglAddon());         // GPU renderer; fallback to canvas on error
    term.open(ref.current!);
    fit.fit();

    let disposed = false;
    (async () => {
      const { id: sid } = await window.api.pty.create({ cwd, cols: term.cols, rows: term.rows });
      if (disposed) { window.api.pty.kill(sid); return; }
      sessionId.current = sid;
      const unsubData = window.api.pty.onData(f => {
        if (f.id !== sid) return;
        scheduleCommit(() => term.write(f.base64 ? decodeB64(f.data) : f.data));
        // backpressure: if buffer balloons, ask main to pause the pty stream
        if (term.buffer.active.length > 5000) setThrottle(sid, true);
        else if (term.buffer.active.length < 3000) setThrottle(sid, false);
      });
      const unsubExit = window.api.pty.onExit(e => { if (e.id === sid) term.write(`\r\n[exit ${e.exitCode}]\r\n`); });
      disposers.push(unsubData, unsubExit);
    })();

    const onDataSub = term.onData(d => sessionId.current && window.api.pty.write(sessionId.current, d));
    const onResize = term.onResize(({ cols, rows }) => sessionId.current && window.api.pty.resize(sessionId.current, cols, rows));
    const ro = new ResizeObserver(() => fit.fit());
    ro.observe(ref.current!);

    return () => { disposed = true; disposers.forEach(d => d()); onDataSub.dispose(); onResize.dispose(); ro.disconnect(); term.dispose(); };
  }, [id, cwd]);

  return <div ref={ref} className="h-full w-full bg-void" />;
}
```

**Note on HMR:** because the pty lives in main, an electron-vite renderer reload only re-attaches via `pty:list` + re-subscribe; shell state survives. `TerminalDrawer` restores sessions from `pty:list` on mount.

### 3.2 The Agent Stream & Tool Execution Engine

**Rendering pipeline** (main side, `src/main/ipc/agent.ts`):

1. `agent:create-session` → supervisor RPC `session.create(cfg)` → engine allocates pi-agent-core session + attaches kaioken tools. Returns `sessionId`.
2. Engine emits events on the control socket (`delta`, `tool-event`, `status`, `cost`). `engineClient` parses → routes to per-stream `StreamBatcher` → `webContents.send`.
3. `tools:approval-request` originates **from the engine** when a gated tool fires. Main's `ApprovalGate` (§3.4) intercepts *before* forwarding `tool-event(phase:'awaiting-approval')` to renderer — gate state is authoritative in main.

**Renderer — `useAgentStream.ts` hook:**

```ts
export function useAgentStream(sessionId: string) {
  useEffect(() => {
    const unsubs = [
      window.api.agent.onDeltaBatch(frame => {
        if (frame.sessionId !== sessionId) return;
        const draft = agentStore.getState().draft(frame.sessionId);
        for (const item of frame.frames) {
          if (item.kind === 'token') draft.appendToken(item.text);
          else if (item.kind === 'thinking') draft.appendThinking(item.text);
          else if (item.kind === 'citation') draft.addCitation(JSON.parse(item.text));
          else if (item.kind === 'mermaid') draft.addMermaid(JSON.parse(item.text));
        }
        scheduleCommit(() => agentStore.getState().commit(frame.sessionId, frame.seq));
      }),
      window.api.agent.onToolEvent(ev => { if (ev.sessionId === sessionId) agentStore.getState().upsertTool(ev); }),
      window.api.agent.onStatus(s => { if (s.sessionId === sessionId) sessionStore.getState().setStatus(s.status); }),
      window.api.agent.onCost(c => costStore.getState().tick(c)),
    ];
    return () => unsubs.forEach(u => u());
  }, [sessionId]);
}
```

**ToolRunCard** renders by `phase` + `destructive`:

- `queued` → dim row, pulse dot (amber).
- `started/progress` → expander (default collapsed), spinner, `progress.label`; `kaioken/verify` progress bars get the emerald `#00e676` pass / crimson `#ff1744` fail summary on `completed`.
- `awaiting-approval` → card gains `CornerBrackets` HUD chrome + a **non-modal inline preview** (first 8 lines of payload), while the modal (queue head) holds the real gate. Modal stays authoritative; inline preview is convenience only.
- `completed` → collapsible with `<details>`-like expand; output > 4 KB rendered via `react-shiki` inside `content-visibility: auto` container.
- `denied` → card stamped "DENIED" (crimson), engine receives denial and continues.

**Citation chips:** `citation` deltas carry `{ symbol, file, line, kind }` from `kaioken/index`. Chip click → `inspectorStore.open({ view: 'tree', path: file })` + reveal line (CodeMirror `dispatch` scroll effect if file open).

### 3.3 The Diff Review System

**Data flow:** engine produces unified diff (e.g. from `apply_patch` tool or gitops merge) → main validates/parse-splits into hunks (`ApprovalPayload.patch`) → pushed to renderer either as approval payload or directly into `diffStore` via `diff:open`.

**Side-by-side with CodeMirror 6** (`SideBySideDiff.tsx`):

Each hunk renders a pair of read-only CodeMirror views inside a shared row. We do *not* use a diff extension library for layout — we compute line alignment from hunk metadata and render old/new as two independent `EditorView`s with synchronized scrolling, because our hunks are already structured (not raw diffs) and we need per-hunk action bars.

```tsx
function HunkView({ hunk, onAccept, onReject }: { hunk: DiffHunk; onAccept: () => void; onReject: () => void }) {
  const oldRef = useRef<HTMLDivElement>(null);
  const newRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mk = (text: string, theme: Extension) =>
      new EditorView({ doc: text, extensions: [EditorView.editable.of(false), EditorState.readOnly.of(true), lineNumbers(), theme, themeCompartment] });
    const oldV = mk(hunk.oldText, removedTheme);
    const newV = mk(hunk.newText, addedTheme);
    oldRef.current!.appendChild(oldV.dom);
    newRef.current!.appendChild(newV.dom);
    // synchronize scroll between the two panes
    const sync = (src: EditorView, dst: EditorView) => src.dom.addEventListener('scroll', () => { dst.dom.scrollTop = src.dom.scrollTop; });
    sync(oldV, newV); sync(newV, oldV);
    return () => { oldV.destroy(); newV.destroy(); };
  }, [hunk.oldText, hunk.newText]);

  return (
    <div className={`hunk group ${hunk.status}`}>
      <HunkActions hunk={hunk} onAccept={onAccept} onReject={onReject} />
      <div className="grid grid-cols-2 gap-px">
        <div ref={oldRef} className="diff-old" />
        <div ref={newRef} className="diff-new" />
      </div>
      {hunk.renderedNote && <ImpactNote text={hunk.renderedNote} />}
    </div>
  );
}
```

**Accept/reject semantics:**

- `acceptHunk(diffId, hunkId)` → `diffStore` marks accepted → main `diff:apply-hunk` → engine applies that hunk via gitops worktree (never in-place on main checkout; worktree delegation is the default per kaioken/gitops guardrails) → hunk status confirmed by `tool-event` echo.
- `rejectHunk` → mark rejected; on `applyAll` only accepted hunks apply.
- "Accept all / Reject all" toolbar; both are **destructive-gated** if the target is outside the active worktree (`tools:approval-request` raised, §3.4).
- Hunk state is persisted in `diffStore` per `toolCallId` so switching inspector views never loses review state.

### 3.4 The Destructive Gate — Exact Handshake

**Sequence (timing annotated):**

```javascript
ENGINE                    MAIN (ApprovalGate)              RENDERER
  │                            │                              │
  │─ tool.run_command ────────►│ 1. preflight via verifycore  │
  │   (blocked, awaiting)      │ 2. build ApprovalRequest     │
  │                            │ 3. auditLog.append(request)  │
  │                            │ 4. push tools:ev:approval-request
  │                            │─────────────────────────────►│ 5. approvalStore.enqueue
  │                            │                              │ 6. ApprovalModal (queue head)
  │                            │                              │    focus trapped to [Deny]
  │                            │                              │    Enter → Deny (NOT Allow)
  │                            │◄─ tools:approval-respond ─────│ 7. user clicks Allow / timeout
  │                            │ 8. validate response; if timeout → deny
  │                            │ 9. auditLog.append(outcome)
  │◄─ approval.result ─────────│ 10. RPC to engine: resume/deny
  │                            │ 11. push tools:ev:approval-resolved
  │─ tool-event(completed) ───►│ 12. forward to renderer
```

**Main-side authority (`src/main/ipc/tools.ts`):**

```ts
interface PendingApproval {
  req: ApprovalRequest;
  resolve: (d: ApprovalDecision) => void;
  timer: NodeJS.Timeout;
}
const pending = new Map<string, PendingApproval>();

export function registerToolsIpc(getWindow: () => Electron.BrowserWindow | null, engine: EngineClient) {
  // Called by engineClient when engine emits approval.request
  engine.on('approval.request', async (raw: unknown) => {
    const req = approvalRequestSchema.parse(raw);
    getWindow()?.webContents.send(CH.tools.evApprovalRequest, req);
    const decision = await new Promise<ApprovalDecision>((resolve) => {
      const timer = setTimeout(() => resolveTimeout(req, resolve), req.timeoutMs);
      pending.set(req.approvalId, { req, resolve, timer });
    });
    await engine.rpc('approval.respond', { approvalId: req.approvalId, decision });
    auditLog.append({ type: 'resolved', approvalId: req.approvalId, decision, at: Date.now() });
    getWindow()?.webContents.send(CH.tools.evApprovalResolved, { approvalId: req.approvalId, outcome: decision === 'deny' ? 'denied' : 'allowed' });
  });

  ipcMain.handle(CH.tools.approvalRespond, (_e, raw: unknown) => {
    const r = approvalResponseSchema.parse(raw);
    const p = pending.get(r.approvalId);
    if (!p) return { ok: false };                 // already timed out / resolved — renderer lied or raced
    clearTimeout(p.timer);
    pending.delete(r.approvalId);
    if (r.decision === 'allow-session') grantSessionScope(p.req);
    p.resolve(r.decision);
    return { ok: true };
  });
}

function resolveTimeout(req: ApprovalRequest, resolve: (d: ApprovalDecision) => void) {
  pending.delete(req.approvalId);
  resolve('deny');                                 // 5-min auto-deny
}
```

**UI-side (`ApprovalModal.tsx`):** renders only `approvalStore.queue[0]`; Radix `Dialog` with `onOpenAutoFocus` → focus the **Deny** button (and diff body focusable before it in tab order); `Escape` = Deny; no "Allow" on `Enter` anywhere in the modal; countdown ring shows `timeoutMs` remaining (1 Hz local timer); `preflight` section shows impacted symbols + blast radius from `kaioken/impact` (the "verifycore pre-flight" gives the user *deterministic* grounding before approving).

**Renderer compromise scenario:** a malicious renderer could spam `approval-respond`, but the gate only accepts responses for **currently pending** approvals, main enforces the timeout, and all decisions are audit-logged with hashes. Renderer *cannot* approve a request that main never forwarded — the engine only resumes on main's RPC.

---

## PART 4 — Step-by-Step Implementation Roadmap

Each phase ends with **acceptance criteria** that must pass before starting the next phase. Estimated effort assumes 2 engineers.

### Phase 0 — Kaiopi Daemon Wrapper (prerequisite, in `kaiopi/` repo)

Engine-side work to make kaiopi embeddable:

- `kaiopi/daemon.ts` entry: boots agent core, opens control socket (`~/.kaioken/run/kaiopi.sock` or `\\.\pipe\kaiopi`), speaks JSON-lines RPC: `{id, method, params}` / `{id, result}` / `{event, payload}`.
- Methods: `session.create/interrupt/get-history`, `approval.respond`, `pty` *not* proxied (pty stays in Electron main), `worktree.list`, `event.subscribe` filtering.
- Events: `delta`, `tool-event`, `status`, `cost`, `approval.request`, `verify.result`, `index.progress`.
- `npm run pack` produces `out/kaiopi-daemon.mjs` (esbuild bundle, external: node builtins).

**Acceptance:** `node out/kaiopi-daemon.mjs --stdio` boots, answers `ping` over socket, streams a mocked delta sequence; kill -9 restart simulation reconnects a supervisor client.

### Phase 1 — Foundation & IPC Skeleton (Week 1)

| Files | Action |
| --- | --- |
| `src/shared/ipc/*` | create channels/types/schemas/api (§1.3) |
| `src/main/index.ts`, `windows.ts` | Electron boot, frameless window, `contextIsolation: true`, `sandbox: true`, acrylic (`visualEffectState` / Mica) |
| `src/main/supervisor/*` | ProcessSupervisor: fork daemon, heartbeat 2 s, restart w/ exponential backoff (max 5), crash event → `agent:ev:status(degraded)` |
| `src/main/streaming/StreamBatcher.ts` | unit-tested coalescer |
| `src/main/security/*` | pathGuard, auditLog |
| `src/preload/*` | contextBridge namespaces |
| `src/renderer` | Vite + React 19 + Tailwind v4 + tokens.css (ANSI palette) |
| `src/renderer/stores/*` | all six stores with stub actions |

**Acceptance:** dev script launches app; renderer console shows `window.api` present; supervisor fork visible in process list; kill daemon → renderer sees `degraded` then `recovering` within 5 s; zod rejects malformed invoke payloads (test: `window.api.pty.create({cols: -1})` → structured error, no crash).

### Phase 2 — PTY & Terminal (Week 2)

| Files | Action |
| --- | --- |
| `src/main/ipc/pty.ts` | §3.1 implementation |
| `src/renderer/components/terminal/*` | TerminalPane, TerminalTabs, WebGL addon w/ canvas fallback |
| `src/renderer/hooks/usePty.ts` | session attach/restore on HMR |
| `src/renderer/components/layout/TerminalDrawer.tsx` | collapse/expand (`Ctrl+\``), resize handle, tab bar |
| `scripts/dev.ps1` | concurrently daemon + electron-vite |

**Acceptance:** full-screen `ls -R` in worktree scrolls without dropped frames (measure: no `pty:ev:data` seq gaps > 2 s sustained); resize window → shell receives SIGWINCH-equivalent (`stty size` updates); 3 concurrent tabs; renderer reload (`F5` in dev) preserves shells; 24 KB batching verified by instrumenting main (log frame sizes).

### Phase 3 — Agent Stream & Chat Surface (Weeks 3–4)

| Files | Action |
| --- | --- |
| `src/main/ipc/agent.ts` | session handlers + stream forwarding through batchers |
| `src/main/ipc/tools.ts` + `ApprovalGate` | §3.4 |
| `src/renderer/hooks/useAgentStream.ts` | §3.2 |
| `src/renderer/stores/agentStore.ts` | draft-buffer + rAF commit |
| `src/renderer/components/chat/*` | AgentStream (virtualized), MessageItem (markdown/katex/mermaid), Composer, ToolRunCard, CitationChip, **ApprovalModal** |
| `src/renderer/lib/markdown.ts` | remark + rehype-katex + mermaid (lazy init, `securityLevel: 'strict'`) |
| `src/renderer/components/ui/*` | HUD chrome primitives |

**Acceptance:** 1000-token mock stream renders at 60 fps (Performance panel: no long tasks > 50 ms from our code); tool card lifecycle matches engine events 1:1; **approval drill**: request `run_command rm -rf` → modal focus starts on Deny, Enter denies, engine receives `denied`; wait 5 min untouched → auto-deny fires, audit log contains both entries; `Ctrl+1..9` switches surfaces.

### Phase 4 — Workspace, Explorer & Diff Review (Weeks 5–6)

| Files | Action |
| --- | --- |
| `src/main/ipc/workspace.ts` | tree (with ignore rules via `kaioken/scan`), file read w/ pathGuard, chokidar watcher → `workspace:ev:tree-delta` |
| `src/renderer/components/explorer/*` | FileTree (virtualized, flat map), WorktreeBar |
| `src/main/ipc/diff.ts` + `src/renderer/stores/diffStore.ts` | hunk CRUD |
| `src/renderer/components/diff/*` | SideBySideDiff, HunkActions, DiffInspector |
| inspector store wiring | selection → inspector routing (§2.2) |

**Acceptance:** open 20k-file monorepo → tree renders < 500 ms initial, incremental deltas < 16 ms apply; diff with 40 hunks across 5 files: per-hunk accept applies only that hunk (verify via `git diff` in terminal drawer); reject + applyAll excludes rejected; accept-all on main checkout (outside worktree) triggers approval gate.

### Phase 5 — Knowledge Surfaces & Cost Ledger (Weeks 7–8)

| Surface | Implementation |
| --- | --- |
| Research | dossier view: aggregates citations + verify results into cards |
| Wiki | renders `kaioken/wiki` markdown + mermaid sequence diagrams (Mermaid 11.16) |
| Codemap Graph | embeds `kaioken/serve` loopback visualization (iframe to `http://127.0.0.1:<port>` with token-scoped origin) |
| Cards | `kaioken/cards` grid with search |
| Cost Ledger | `costStore` aggregation: per-session, per-model spend; **Multiplier Dial** UI (×1–×10) wired to `agent:set-multiplier`, with projected-cost delta shown before commit |
| Settings | model providers (via `pi-ai`), theme, keybindings |

**Acceptance:** multiplier change mid-session takes effect on next tool plan; cost ledger matches `modelport` totals within rounding; Codemap iframe loads only while surface active (origin allow-list enforced in main via `session.setPermissionRequestHandler`).

### Phase 6 — Production Packaging & Hardening (Weeks 9–10)

| Workstream | Details |
| --- | --- |
| `electron-builder.yml` | NSIS + zip, code-signing cert config, publish: GitHub releases |
| `scripts/pack-kaiopi.mjs` | bundle daemon into `resources/`; supervisor resolves daemon path via `process.resourcesPath` in prod vs `../kaiopi/out` in dev |
| Security audit pass | `sandbox: true` re-verified; preload reviewed against allow-list; `contextIsolation` asserted at runtime (`assert(contextIsolation)`); CSP `default-src 'self'`; no `nodeIntegration` anywhere |
| Perf pass | bundle analysis; xterm webgl forced; React Profiler session on 10k-message transcript → no regression |
| Crash resilience | daemon SIGKILL mid-stream → user-facing reconnect banner, session resume from pi-agent-core history log |
| Docs | `docs/architecture.md` (this blueprint, condensed), `docs/ipc.md` generated from `shared/ipc/types.ts` via typedoc |

**Acceptance:** signed installer on Windows 11 clean VM launches, creates/uses worktree, runs full loop: prompt → gated patch → diff review → accept → verify → wiki update, with audit log complete; macOS build with vibrancy; cold start < 2.5 s to interactive.

---

## 5. Risk Register & Mitigations

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| IPC flood on huge tool outputs | High | StreamBatcher caps + truncation at main (outputs > 256 KB stored to temp file, renderer pulls via `readFile`) |
| node-pty native rebuild pain across Electron versions | High | `electron-rebuild` in postinstall; CI matrix (win/mac/linux) |
| Engine crash loses in-flight approval | Medium | Approval state mirrored to main; on engine restart, pending approvals re-requested (idempotent `approvalId`) |
| Renderer re-render storms from citation storms | Medium | citation deltas batched with token frames; chips render in collapsed overflow row |
| Mermaid XSS via model output | Medium | `securityLevel: 'strict'`, DOMPurify on HTML output, mermaid rendered in sandboxed iframe without `allow-same-origin` |
| Path escape via tool payloads | Low | pathGuard on every fs-touching handler; patches apply only inside worktree unless approval `risk:'destructive'` granted |
| Windows named pipe + firewall noise | Low | socket bound to loopback only (`\\.\pipe\` is local-only by construction) |

---

## 6. Definition of Done (Global)

The blueprint is fully realized when a user can, keyboard-only, from a cold start in ≤ 2.5 s: open a workspace (`Ctrl+O`), prompt the agent (`Ctrl+K` → type), watch tokens stream at 60 fps with tool cards unfolding live, be **stopped by the destructive gate** with focus-safe denial on a dangerous patch, inspect a side-by-side diff per hunk, accept it into a gitops worktree, watch verifycore turn the HUD emerald, and audit every decision in the cost ledger — while the terminal drawer runs `npm test` untouched by any of it.