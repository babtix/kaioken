# Kaioken Desktop Studio — Architectural Blueprint & Implementation Plan

**Role assumed:** Principal Desktop Architect / Staff Systems Engineer
**Scope:** Complete process topology, IPC protocol, code-level deep dives, and a 6-phase execution roadmap for `desktop/` integrating the `kaiopi` runtime.

---

## 0. Executive Decision Summary

Your six architectural questions, answered with verdicts before justification:

| # | Question | Verdict | One-line rationale |
|---|----------|---------|-------------------|
| 1 | Where does `kaiopi` run? | **Electron `utilityProcess.fork()`** (dedicated "agent-host" process), MessagePort-based IPC | OS-level crash isolation from Main, Electron lifecycle integration, structured-clone transfer (no JSON serialization tax), restartable without killing the window |
| 1b | Is loopback HTTP/SSE (via `kaioken/serve`) the transport? | **No for control/data plane; yes as a secondary graph viewer** | Port management, Windows firewall prompts, SSE one-way asymmetry, and reconnect complexity are pure liability for the primary channel |
| 2 | Streaming jank | **Coalescing buffers at 3 boundaries + mutable ring + rAF commit + `useSyncExternalStore`** | Never let a token delta touch React state directly; one commit per frame, per-message subscriptions |
| 3 | PTY architecture | **Second utility process ("pty-host") owning `node-pty` sessions; per-session MessagePort to renderer; xterm 6 + WebGL** | PTY crash ≠ app crash; session survives renderer reload via replay buffer; main process never touches terminal bytes |
| 4 | Layout | **CSS Grid shell + `react-resizable-panels`; surface registry with keep-alive; no docking framework** | Deterministic, keyboard-first, zero third-party layout lock-in |
| 5 | State | **Zustand, slice-per-domain, split hot/cold stores; hot text lives in module-scope mutable buffers, not store objects** | File tree and diff viewer are structurally incapable of re-rendering on token deltas |
| 6 | Destructive gate | **Authoritative approval service in Main; single-use request IDs; parked-promise broker in agent-host; Deny-first focus trap; Main-enforced 5-min auto-deny** | Renderer can only *propose* decisions; Main is the single point of truth |

---

## Part 1 — System Topology & IPC Protocol Specification

### 1.1 Process Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ELECTRON MAIN PROCESS (privileged, never blocked)                           │
│                                                                             │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────────────────┐  │
│  │ WindowService │  │ ProtocolRouter│  │ Supervisors (state machines)     │  │
│  │ frameless     │  │ invoke/event  │  │  ├─ AgentSupervisor ─────────────┼──┼──► UTILITY: agent-host
│  │ vibrancy      │  │ + port broker │  │  └─ PtySupervisor ───────────────┼──┼──► UTILITY: pty-host
│  └──────────────┘  └───────────────┘  └──────────────────────────────────┘  │      (kaiopi runtime,
│  ┌───────────────────────────────────┐  ┌────────────────────────────────┐  │       chord bus, kaioken
│  │ ApprovalService (AUTHORITATIVE)   │  │ SecurityService                │  │       packages, index pool)
│  │  single-use IDs, timeouts, scope  │  │  path policy, CSP, permissions │  │
│  └───────────────────────────────────┘  └────────────────────────────────┘  │
│  ┌────────────────────────┐  ┌──────────────────────────────────────────┐   │
│  │ ConfigStore (SafeStorage)│  │ FS Watcher broker (batched 100ms)       │   │
│  └────────────────────────┘  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
        │ ipcRenderer.invoke / events (CONTROL PLANE)         │ MessagePortMain
        ▼                                                     ▼ (transferred, DATA PLANE)
┌──────────────────────────┐   per-session ports    ┌────────────────────────────┐
│ PRELOAD (contextBridge)  │◄──────────────────────►│ UTILITY: pty-host          │
│ sandbox:true, no Node API│                        │  node-pty sessions         │
└──────────────────────────┘                        │  16ms/16KB coalescer       │
        ▲                                           │  1MB replay ring/session   │
        │ direct MessagePort (transferred)          └────────────────────────────┘
        │
┌─────────────────────────────────────────────────────────────────────────────┐
│ RENDERER (React 19, sandboxed, contextIsolation:true)                       │
│  ingest.ts → Zustand domain stores → virtualized surfaces                   │
│  xterm 6 + WebGL │ CodeMirror 6 diff review │ shiki stream artifacts        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Transport Decision Matrix

| Option | Crash isolation | Blocking risk | Throughput | Lifecycle integration | Verdict |
|---|---|---|---|---|---|
| In-process in Main | ❌ engine crash kills app | ❌ AST/BM25 indexing freezes window mgmt | best | native | Rejected |
| Worker thread in Main | ⚠️ native segfault still takes down the process | ⚠️ shared event loop pressure | best | native | Rejected |
| **`utilityProcess.fork()`** | ✅ true OS process | ✅ own V8 heap + event loop | ✅ structured clone via MessagePort, zero-copy `ArrayBuffer` transfer | ✅ `exit` events, auto child of app | **Chosen** |
| Child process over stdio JSON-RPC | ✅ | ✅ | ⚠️ JSON serialization cost per message | ⚠️ manual plumbing | Kept as escape hatch (headless CLI mode of kaiopi) |
| Loopback HTTP/SSE | ✅ | ✅ | good | ❌ ports, firewall, auth | Secondary only (`kaioken/serve` graph window) |

**Two utility processes, not one.** The agent-host and pty-host are separate because their failure modes are unrelated (a `node-pty` ConPTY teardown bug must never restart a mid-flight agent run) and their traffic profiles differ wildly (bursty small tokens vs. megabytes of terminal output).

**Inside agent-host:** kaiopi runs on its event loop, but CPU-bound kaioken work (AST symbol indexing, BM25 corpus build) dispatches to a **worker-thread pool inside agent-host** (`piscina` or hand-rolled). This gives two-level isolation: indexing storms never delay agent token callbacks, and neither can ever touch the Electron Main process.

### 1.3 Control Plane vs. Data Plane

This is the most important structural decision. **All traffic does not flow through Main.**

- **Control plane** (Main-routed): lifecycle, run start/cancel, approvals, config, workspace RPCs, dialogs. Low frequency, must be validated and auditable. `ipcMain.handle` / `webContents.send`.
- **Data plane** (Main-bypassing): agent event streams (tokens, tool output) and PTY bytes. Main performs a one-time **MessagePortMain handoff**, then the renderer and utility process talk peer-to-peer. Main cannot become a bottleneck at 3,000 tok/s or during a `npm install` flood, and Main's event loop never sees a single terminal byte.

```
Renderer                 Main                        agent-host
   │  'agent:port-request' │                              │
   ├──────────────────────►│  agentSupervisor.attachPort(port1)
   │                       ├─────────────────────────────►│
   │  'agent:port' + [port2] (transferred)                │
   │◄──────────────────────┤                              │
   │        port2.onmessage ←──── envelopes ──────────────┤
   │        port2.postMessage ──── invoke/run ───────────►│
```

### 1.4 IPC Protocol Contracts (TypeScript)

All contracts live in `src/shared/protocol/` — imported by Main, both hosts, preload, and renderer. One source of truth.

```ts
// src/shared/protocol/envelope.ts
export interface Envelope<T = unknown> {
  v: 1;                     // protocol version — reject mismatches at handshake
  id: string;               // ULID, correlation for RPC
  kind: 'rpc' | 'event';
  ch: Channel;
  ts: number;
  payload: T;
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: ErrorCode; message: string; detail?: unknown } };

export type ErrorCode =
  | 'ENGINE_DOWN' | 'SESSION_NOT_FOUND' | 'APPROVAL_REQUIRED' | 'APPROVAL_DENIED'
  | 'APPROVAL_TIMEOUT' | 'PATH_ESCAPES_WORKSPACE' | 'PROTOCOL_MISMATCH'
  | 'TOOL_FAILED' | 'CANCELLED' | 'IO' | 'INTERNAL';

export type Channel =
  | 'sys' | 'agent' | 'pty' | 'workspace' | 'approval' | 'config' | 'window';
```

```ts
// src/shared/protocol/agent.ts
export type Multiplier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type ToolName =
  | 'bash' | 'read_file' | 'write_to_file' | 'apply_patch' | 'list_dir'
  | 'kaioken.index' | 'kaioken.search' | 'kaioken.scan' | 'kaioken.verifycore'
  | 'kaioken.verify' | 'kaioken.impact' | 'kaioken.gitops' | 'kaioken.modelport'
  | 'kaioken.plan' | 'kaioken.cards' | 'kaioken.wiki';
export type RiskLevel = 'safe' | 'elevated' | 'destructive';

export interface AgentRunParams {
  sessionId: string;
  prompt: string;
  attachments?: { id: string; path: string; kind: 'file' | 'symbol' | 'diff' }[];
  multiplier: Multiplier;          // kaioken/modelport dial
  provider?: 'openai' | 'anthropic' | 'google' | 'ollama' | 'openrouter';
  model?: string;
}

export interface ToolCallEnvelope {
  callId: string;
  tool: ToolName;
  title: string;                   // "Run vitest suite" — agent-provided
  intent?: string;                 // one-line why
  risk: RiskLevel;
  args: Record<string, unknown>;
}

export type AgentEvent =
  | { type: 'run.started';   runId: string; sessionId: string }
  | { type: 'run.completed'; runId: string; stopReason: string; usage: Usage }
  | { type: 'run.failed';    runId: string; error: { code: ErrorCode; message: string } }
  | { type: 'token.delta';     runId: string; msgId: string; text: string }        // COALESCED
  | { type: 'reasoning.delta'; runId: string; msgId: string; text: string }        // COALESCED
  | { type: 'msg.finalized';   runId: string; msgId: string; blocks: ContentBlock[] }
  | { type: 'tool.started';    runId: string; call: ToolCallEnvelope }
  | { type: 'tool.progress';   runId: string; callId: string; patch: ToolProgress }
  | { type: 'tool.output';     runId: string; callId: string; chunk: string; stream: 'stdout' | 'stderr' } // COALESCED
  | { type: 'tool.completed';  runId: string; callId: string; result: ToolResult }
  | { type: 'usage.tick';      runId: string; spend: SpendSnapshot }               // kaioken/modelport
  | { type: 'artifact.ready';  runId: string; artifact: ArtifactRef };             // diff / graph / card → inspector

export type ArtifactRef =
  | { kind: 'diff'; path: string; baseRev: string; proposedRev: string }
  | { kind: 'graph'; mermaid: string; title: string }
  | { kind: 'card'; cardId: string }
  | { kind: 'impact'; root: string; symbols: string[] };

export interface Usage { inputTokens: number; outputTokens: number; costUsd: number }
export interface SpendSnapshot { runUsd: number; sessionUsd: number; multiplier: Multiplier; projectedUsd: number }
```

```ts
// src/shared/protocol/approval.ts
export interface ApprovalRequest {
  requestId: string;               // ULID, SINGLE-USE
  runId: string;
  callId: string;
  tool: ToolName;
  risk: 'elevated' | 'destructive';
  summary: string;                 // "Write 84 lines to src/agent/index.ts"
  command?: string; cwd?: string;  // bash
  diff?: { path: string; base: string; proposed: string; lang: string };  // writes/patches
  timeoutMs: number;               // default 300_000
  expiresAt: number;
  scopeKey?: string;               // "bash:npm test" — eligible for session-scope grant
}

export type ApprovalDecision =
  | { verdict: 'approved'; scope: 'once' | 'session' }
  | { verdict: 'denied'; reason?: string }
  | { verdict: 'timeout' };        // synthesized by Main — never by renderer

export interface ToolsApi {
  onApprovalRequest(cb: (req: ApprovalRequest) => void): Unsubscribe;
  resolve(requestId: string, decision: Extract<ApprovalDecision, { verdict: 'approved' | 'denied' }>): Promise<Result<void>>;
  listPending(): Promise<ApprovalRequest[]>;   // after renderer reload — Main re-emits
}
```

```ts
// src/shared/protocol/pty.ts
export type ShellProfile = 'pwsh' | 'powershell' | 'cmd' | 'bash' | 'zsh' | 'fish' | 'auto';

export interface PtyCreateOptions {
  cwd: string;
  shell?: ShellProfile;            // 'auto' → pwsh > powershell > cmd on Win32
  env?: Record<string, string>;
  cols: number;
  rows: number;
}

export interface PtySessionMeta { id: string; shell: ShellProfile; pid: number; cwd: string; title: string }

export interface PtyApi {
  create(opts: PtyCreateOptions): Promise<Result<PtySessionMeta>>;
  attach(id: string, onData: (chunk: string) => void, onExit: (e: { exitCode: number }) => void): Promise<Result<{ replay: string }>>;
  write(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  kill(id: string): Promise<Result<void>>;
  list(): Promise<PtySessionMeta[]>;
}
```

```ts
// src/shared/protocol/workspace.ts
export interface WorkspaceApi {
  setRoot(path: string): Promise<Result<void>>;
  scan(): Promise<Result<FileNode[]>>;                 // kaioken/scan — ignore rules applied
  watch(): Promise<Result<void>>;                      // chokidar, batched 100ms → onFsEvent
  onFsEvent(cb: (batch: FsEvent[]) => void): Unsubscribe;
  readFile(relPath: string, maxBytes?: number): Promise<Result<{ content: string; truncated: boolean }>>;
  search(query: string, opts?: { glob?: string }): Promise<Result<SearchHit[]>>;   // kaioken/search BM25
  symbols(query: string): Promise<SymbolHit[]>;                                    // kaioken/index oracle
  references(symbolId: string): Promise<Reference[]>;                              // O(1) ref resolution
  impact(symbolIds: string[]): Promise<Result<ImpactGraph>>;                       // kaioken/impact
  wikiGraph(): Promise<Result<{ mermaid: string; pages: WikiPage[] }>>;
  openGraphViewer(): Promise<Result<{ url: string }>>;                             // kaioken/serve loopback
}
```

```ts
// src/shared/protocol/index.ts — the entire bridge surface
export interface KaiokenBridge {
  sys: {
    ping(): Promise<number>;                                    // → pong latency ms
    engineStatus(): Promise<{ status: EngineStatus; detail?: string }>;
    onEngineStatus(cb: (s: EngineStatus, detail?: string) => void): Unsubscribe;
    openExternal(url: string): Promise<Result<void>>;
  };
  agent: {
    openStream(): Promise<void>;                                // MessagePort handshake
    startRun(p: AgentRunParams): Promise<Result<{ runId: string }>>;
    cancelRun(runId: string, reason?: string): Promise<Result<void>>;
    listSessions(): Promise<Result<SessionMeta[]>>;
  };
  pty: PtyApi;
  workspace: WorkspaceApi;
  tools: ToolsApi;
  config: {
    get<T>(ns: string, key: string, fallback: T): Promise<T>;
    set<T>(ns: string, key: string, value: T): Promise<void>;
    setSecret(key: string, value: string): Promise<void>;       // SafeStorage-encrypted
    getSecret(key: string): Promise<string | null>;
  };
  window: {
    minimize(): void; toggleMaximize(): void; close(): void;
    onMaximized(cb: (max: boolean) => void): Unsubscribe;
  };
}
// Ambient declaration
declare global { interface Window { api: KaiokenBridge } }
```

**Validation policy:** Control-plane messages are validated with zod schemas co-located in `shared/protocol` (cheap, low-frequency). Data-plane envelopes are validated by a hand-rolled discriminant `switch` (zero-allocation, hot path). Unknown channel/type → drop + `console.error` + counter; never throw across the boundary.

### 1.5 Stream Buffering & Backpressure Strategy

The pipeline and its latency budget:

```
kaiopi token callback → agent-host TokenCoalescer (≤24ms / 2KB / boundary)
   → MessagePort → renderer ingest (append to mutable ring, mark dirty)
   → rAF commit (≤16.6ms) → React read → paint
──────────────────────────────────────────────────────────────
worst-case end-to-end staleness: ~45ms — imperceptible; cost: zero per-token renders
```

**Boundary 1 — agent-host `TokenCoalescer`:**

```ts
// src/agent-host/coalescers/token.ts
type Flush = (chunks: Array<{ key: string; text: string; kind: 'token' | 'reasoning' }>) => void;

export class TokenCoalescer {
  private buf = new Map<string, { text: string; kind: 'token' | 'reasoning' }>();
  private bytes = 0;
  constructor(private send: Flush, private maxDelayMs = 24, private maxBytes = 2048) {
    setInterval(() => this.flush('tick'), this.maxDelayMs).unref();
  }
  push(key: string, kind: 'token' | 'reasoning', text: string) {
    const cur = this.buf.get(key);
    this.buf.set(key, { text: (cur?.text ?? '') + text, kind });
    this.bytes += text.length;
    if (this.bytes >= this.maxBytes) this.flush('size');
  }
  /** Called on boundary events: tool.started, msg.finalized, run.completed — guarantees ordering. */
  flushNow() { this.flush('boundary'); }
  private flush(_reason: string) {
    if (!this.buf.size) return;
    const out = [...this.buf].map(([key, v]) => ({ key, text: v.text, kind: v.kind }));
    this.buf.clear(); this.bytes = 0;
    this.send(out);
  }
}
```

Token deltas are **losslessly mergeable** (concatenation), so coalescing is semantically transparent — no credit accounting needed for text. Ordering with tool events is preserved because boundary events force an immediate flush before the tool event is emitted.

**Boundary 2 — pty-host coalescer:** identical shape, 16ms / 16KB, per-session, plus a **1MB replay ring** (array of chunks + byte counter; drop whole chunks from the front — safe, because xterm's parser is stateful *across* writes, so partial escape sequences at chunk boundaries are tolerated by design).

**Boundary 3 — renderer rAF commit:** `ingest.ts` appends into module-scope mutable buffers and bumps a version counter at most once per `requestAnimationFrame`. See §3.2.

**True backpressure for tool output:** token coalescing hides latency but can't bound memory if a tool streams 50MB. The agent-host wraps each tool's stdout reader in a **bounded queue (64 chunks / 1MB per callId)**; when full, it `pause()`s the underlying Node stream — real OS-pipe backpressure propagates to the tool process. When the renderer drains (rAF commit lands), the queue releases. No invented "credit" protocol needed; the kernel does the flow control.

### 1.6 Supervision & Lifecycle

```ts
// src/main/supervisors/base.ts
export type HostState = 'idle' | 'starting' | 'handshaking' | 'ready' | 'restarting' | 'fatal' | 'stopped';

export abstract class UtilitySupervisor {
  protected proc?: Electron.UtilityProcess;
  protected state: HostState = 'idle';
  private restarts: number[] = [];
  private missedPings = 0;

  start(): void {
    this.state = 'starting';
    this.proc = utilityProcess.fork(this.entryPath(), [], {
      serviceName: this.name,
      stdio: 'pipe',                       // stderr ring buffer for diagnostics
    });
    this.proc.on('message', this.onMessage);   // handshake, heartbeat, envelope routing
    this.proc.on('exit', this.onExit);
    this.armHandshake(5_000);              // no 'sys.hello' in 5s → treat as crash
    this.heartbeat = setInterval(() => {
      if (++this.missedPings >= 3) this.restart('heartbeat timeout');
      else this.send({ ch: 'sys', kind: 'rpc', payload: { op: 'ping' } });
    }, 5_000);
  }

  protected onUnexpectedExit = (code: number): void => {
    clearInterval(this.heartbeat);
    const now = Date.now();
    this.restarts = this.restarts.filter(t => now - t < 60_000);
    if (this.restarts.push(now) > 5) {
      this.state = 'fatal';                          // surface "Engine offline" banner + manual Restart
      this.notifyRenderer();
      return;
    }
    this.state = 'restarting';
    this.notifyRenderer();                           // HUD shows degraded state
    setTimeout(() => this.start(), Math.min(500 * 2 ** this.restarts.length, 15_000));
  };

  async shutdown(timeoutMs = 5_000): Promise<void> {
    this.send({ ch: 'sys', kind: 'rpc', id: ulid(), payload: { op: 'shutdown' } });
    await waitForExit(this.proc, timeoutMs);         // agent flushes session journal first
    if (isAlive(this.proc)) this.proc.kill();        // force
  }
}
```

**Operational rules:**

1. **Handshake:** host sends `{ op: 'sys.hello', protocolVersion: 1, capabilities: [...] }` within 5s. Version mismatch → `fatal` with actionable error, never a silent loop.
2. **Crash recovery semantics:** agent-host restart reattaches to a **persisted session journal** (append-only NDJSON of run events, fsynced on `msg.finalized` / `tool.completed`). Runs interrupted by a crash render as `failed(ENGINE_DOWN)` with a "Resume" affordance. PTY sessions, by contrast, are **not** recoverable across pty-host death (they're OS processes); the drawer shows `session ended (exit code N)` per tab.
3. **Orphan hygiene (Windows):** utility-process grandchildren (tools spawned by the agent) must not outlive the app. Register children in a Windows **Job Object** (via kaiopi's process layer) with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`; fallback `taskkill /pid <pid> /T /F` on shutdown timeout.
4. **Quit ordering:** `before-quit` → deny in-flight destructive approvals (auto-resolve as `denied(app-shutdown)`) → `agentSupervisor.shutdown()` (flush journal) → `ptySupervisor.shutdown()` (SIGHUP sessions) → destroy windows → `app.quit()`.

---

## Part 2 — Project File Tree & Component Hierarchy

### 2.1 Directory Structure

```
desktop/
├─ package.json
├─ electron.vite.config.ts            # multi-entry: main + agent-host + pty-host (§2.2)
├─ electron-builder.yml
├─ tsconfig.json                      # solution refs
├─ tsconfig.node.json                 # main, preload, agent-host, pty-host
├─ tsconfig.web.json                  # renderer
├─ resources/                         # icons, tray, titlebar glyphs
└─ src/
   ├─ shared/                         # imported by ALL processes — no Node/Electron imports
   │  ├─ protocol/
   │  │  ├─ envelope.ts  agent.ts  approval.ts  pty.ts  workspace.ts  config.ts
   │  │  ├─ schemas.ts                # zod validators for control plane
   │  │  └─ index.ts                  # KaiokenBridge interface
   │  ├─ result.ts  ids.ts  riskTable.ts   # tool→risk classification (shared truth)
   │  └─ diff/
   │     ├─ chunks.ts                 # chunk model + applyChunks() (pure, unit-tested)
   │     └─ golden/                   # golden patch fixtures
   ├─ main/
   │  ├─ index.ts                     # bootstrap, single-instance lock, quit ordering
   │  ├─ app/
   │  │  ├─ window.ts                 # BrowserWindow, frameless, vibrancy, CSP
   │  │  ├─ titlebar.ts               # IPC for window controls
   │  │  ├─ shortcuts.ts              # hidden menu accelerators: Ctrl+K, Ctrl+1..9, Ctrl+`
   │  │  └─ security.ts               # will-navigate block, setWindowOpenHandler, permissions
   │  ├─ ipc/
   │  │  ├─ router.ts                 # typed invoke router w/ zod validation
   │  │  ├─ ports.ts                  # MessagePortMain handoff broker
   │  │  ├─ agent.ts  pty.ts  workspace.ts  approval.ts  config.ts  window.ts
   │  ├─ services/
   │  │  ├─ approvalService.ts        # AUTHORITATIVE gate: IDs, timeouts, scope grants
   │  │  ├─ pathPolicy.ts             # realpath + prefix containment, symlink escape denial
   │  │  ├─ fsWatch.ts                # chokidar → 100ms batch → renderer
   │  │  └─ secrets.ts                # SafeStorage
   │  └─ supervisors/
   │     ├─ base.ts                   # UtilitySupervisor (§1.6)
   │     ├─ agentSupervisor.ts  ptySupervisor.ts
   ├─ preload/
   │  ├─ index.ts                     # contextBridge.exposeInMainWorld('api', …)
   │  ├─ lib/portBridge.ts            # attach-once MessagePort helper
   │  └─ agent.ts  pty.ts  workspace.ts  tools.ts  config.ts
   ├─ agent-host/                     # UTILITY PROCESS — kaiopi runtime
   │  ├─ index.ts                     # process.parentPort wiring, sys.hello, heartbeat
   │  ├─ bus.ts                       # envelope router (control in / data out)
   │  ├─ runtime/
   │  │  ├─ kaiopiAdapter.ts          # OUR port interface ⇄ @earendil-works/* binding
   │  │  ├─ sessionManager.ts         # journal persistence, resume
   │  │  └─ chordBridge.ts            # @earendil-works/chord bus in-process
   │  ├─ tools/
   │  │  ├─ approvalBroker.ts         # parked promises per requestId
   │  │  ├─ riskEngine.ts             # + red-line pattern list (never session-scopable)
   │  │  └─ pathGuard.ts              # workspace containment for every path arg
   │  ├─ coalescers/token.ts  output.ts
   │  ├─ indexers/pool.ts             # worker_threads pool: kaioken/index, kaioken/search
   │  ├─ serve/wikiServer.ts          # kaioken/serve loopback daemon (graph window only)
   │  └─ heartbeat.ts
   ├─ pty-host/                       # UTILITY PROCESS — node-pty
   │  ├─ index.ts
   │  ├─ sessions.ts                  # session registry, replay rings, fan-out
   │  ├─ coalescer.ts
   │  └─ shellDetect.ts               # pwsh→powershell→cmd / zsh→bash probing
   └─ renderer/
      ├─ index.html                   # CSP meta tag
      └─ src/
         ├─ main.tsx  App.tsx
         ├─ bootstrap/
         │  ├─ ipcClient.ts           # window.api ready-guard, port handshake
         │  ├─ ingest.ts              # single event router → stores
         │  └─ theme.ts               # ANSI token → CSS vars
         ├─ styles/tokens.css         # the 16-color ANSI map + HUD primitives
         ├─ stores/                   # Zustand — domain-partitioned (§ Part 1.5)
         │  ├─ surfaceStore.ts        # active surface, Ctrl+1..9
         │  ├─ agentStreamStore.ts    # HOT: runs, messages, tool cards
         │  ├─ approvalStore.ts       # gate queue
         │  ├─ terminalStore.ts       # COLD: session metadata only (never bytes)
         │  ├─ explorerStore.ts       # fs tree (batched watcher updates)
         │  ├─ diffStore.ts           # artifacts + hunk decisions
         │  ├─ costStore.ts           # multiplier, spend, dial state
         │  ├─ settingsStore.ts  omniboxStore.ts
         ├─ lib/
         │  ├─ xterm/setup.ts  cm/diffSetup.ts  cm/theme.ts
         │  ├─ markdown/streamBlocks.ts   # block splitter + katex/mermaid lazy
         │  └─ hooks/useVersioned.ts      # useSyncExternalStore binding
         └─ components/
            ├─ chrome/    TitleBar.tsx  NavRail.tsx  StatusBar.tsx  HudFrame.tsx
            ├─ omnibox/   Omnibox.tsx  providers/*
            ├─ agent/     AgentStream.tsx  MessageBlock.tsx  Markdown.tsx
            │             ToolCard.tsx  MultiplierDial.tsx  Composer.tsx
            ├─ approval/  ApprovalModal.tsx  DiffPreview.tsx  Countdown.tsx
            ├─ inspector/ InspectorPane.tsx  DiffReview.tsx  FileViewer.tsx
            │             GraphView.tsx  CardsView.tsx  ImpactView.tsx
            ├─ explorer/  FileTree.tsx  TreeNode.tsx
            ├─ terminal/  TerminalDrawer.tsx  TerminalTabs.tsx  TerminalPane.tsx
            └─ surfaces/  ChatSurface.tsx  ResearchSurface.tsx  WikiSurface.tsx
                          CodemapSurface.tsx  CardsSurface.tsx
                          LedgerSurface.tsx  SettingsSurface.tsx
```

### 2.2 Critical Build Config — Multi-Entry Utility Hosts

`electron-vite` only scaffolds `main`/`preload`/`renderer`. The two utility hosts must be additional rollup entries of the **main** build. This is the #1 gotcha — get it right on day one:

```ts
// desktop/electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'agent-host': resolve(__dirname, 'src/agent-host/index.ts'),
          'pty-host': resolve(__dirname, 'src/pty-host/index.ts'),
        },
        output: {
          format: 'cjs',                 // CJS for all main-side processes: native-module
          entryFileNames: '[name].js',   // + require() compatibility, zero loader surprises
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } } },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
  },
});
```

Fork with `utilityProcess.fork(path.join(__dirname, 'agent-host.js'))` (same output dir as main). Keep `kaiopi`, `kaioken/*`, `@earendil-works/*`, and `node-pty` **external** and `asarUnpack`ed (see Phase 6).

### 2.3 Component Hierarchy & Surface Map

```
App
├─ HudFrame                    # state-driven overlays ONLY (scanlines/aura/corners)
├─ TitleBar                    # frameless drag region, window controls, EngineStatusPill
├─ Omnibox                     # Ctrl+K overlay — command registry w/ fuzzy providers
├─ Body (CSS Grid: rail | main | inspector)
│  ├─ NavRail                  # 7 surfaces: chat research wiki codemap cards ledger settings
│  ├─ <SurfaceOutlet>          # keep-alive: expensive surfaces stay mounted, visibility-hidden
│  │  ├─ ChatSurface           # Ctrl+1 — RunHeader(MultiplierDial, SpendPill) + AgentStream + Composer
│  │  ├─ ResearchSurface       # Ctrl+2 — deep-research runs, citation chips
│  │  ├─ WikiSurface           # Ctrl+3 — kaioken/wiki docs, Mermaid sequence graphs
│  │  ├─ CodemapSurface        # Ctrl+4 — AST symbol graph (kaioken/index), canvas-based
│  │  ├─ CardsSurface          # Ctrl+5 — atomic knowledge cards (kaioken/cards)
│  │  ├─ LedgerSurface         # Ctrl+6 — kaioken/modelport cost ledger, per-run/per-model
│  │  └─ SettingsSurface       # Ctrl+7 — providers, keys(SafeStorage), approval policy, dial default
│  └─ InspectorPane (right)    # artifact-driven; stack + tabs
│     ├─ DiffReview            # side-by-side CM6, per-hunk accept/reject (§3.3)
│     ├─ FileViewer            # shiki, symbol chips → references
│     ├─ GraphView             # mermaid 11, lazy-loaded, SVG cached by content hash
│     ├─ CardsView / ImpactView
│     └─ FileTree              # explorerStore; batched watcher updates
├─ TerminalDrawer (bottom)     # Ctrl+` — TerminalTabs → TerminalPane* (xterm6+WebGL)
├─ StatusBar                   # engine state, branch (kaioken/gitops), tokens, $, ×dial
└─ ApprovalModal               # z-index apex, focus-trapped on Deny (§3.2/Part 1.4)
```

**Keep-alive rule:** Codemap (canvas + graph layout) and Wiki (large docs) are never unmounted on switch — `display:none` via `hidden` attribute preserves state; Chat stays mounted always (stream must never pause visually).

**HUD state reservation table** (enforced in `HudFrame` — overlays are *never* decorative):

| State | Overlay |
|---|---|
| Agent reasoning | cyan scanline sweep + pulse dot |
| Destructive approval pending | crimson bracketed corners + frame pulse |
| verifycore pass | emerald aura sweep, corners turn emerald |
| verifycore fail | amber → crimson flash, status pill text |
| Dial change (×1→×10) | arc sweep animation on dial + StatusBar |

---

## Part 3 — Core Implementation Deep-Dives

### 3.1 The PTY & Terminal Bridge

**`src/pty-host/index.ts`** — the sole owner of `node-pty`:

```ts
import { spawn, type IPty } from 'node-pty';
import { detectShell } from './shellDetect';
import { ChunkCoalescer } from './coalescer';

interface Session {
  pty: IPty;
  meta: PtySessionMeta;
  replay: string[]; replayBytes: number;      // 1MB ring
  ports: Set<any>;                            // attached renderer MessagePorts (multi-view safe)
  coalescer: ChunkCoalescer;
}

const sessions = new Map<string, Session>();
const REPLAY_CAP = 1_000_000;

export function handleCreate(msg: any, replyPort: any) {
  const opts = msg.payload as PtyCreateOptions;
  const shell = detectShell(opts.shell ?? 'auto');
  const id = msg.id;
  const pty = spawn(shell.binary, shell.args, {
    name: 'xterm-256color',
    cols: opts.cols, rows: opts.rows,
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env, TERM: 'xterm-256color' } as Record<string, string>,
    useConpty: process.platform === 'win32',
    conptyInheritCursor: false,
  });
  const coalescer = new ChunkCoalescer(16, 16_384, (merged) => {
    for (const p of sessions.get(id)!.ports) p.postMessage({ type: 'data', data: merged });
  });
  const s: Session = { pty, meta: { id, shell: shell.profile, pid: pty.pid, cwd: opts.cwd, title: shell.title },
                       replay: [], replayBytes: 0, ports: new Set(), coalescer };
  sessions.set(id, s);

  pty.onData((data) => {
    s.replay.push(data); s.replayBytes += data.length;
    while (s.replayBytes > REPLAY_CAP) s.replayBytes -= s.replay.shift()!.length;
    coalescer.push(data);
  });
  pty.onExit(({ exitCode }) => {
    for (const p of s.ports) p.postMessage({ type: 'exit', exitCode });
    sessions.delete(id);
  });
  replyPort.postMessage({ ok: true, value: s.meta });
}

// process.parentPort wiring (utility process entry)
process.parentPort.on('message', (e) => {
  const { op, id, payload, ports } = e.data;
  if (op === 'pty.create') return handleCreate(e.data, makeReply(e));
  if (op === 'pty.attach' && ports?.[0]) {            // renderer transferred its port
    const s = sessions.get(payload.id);
    if (!s) return e.ports?.[0]?.postMessage?.({ ok: false, error: { code: 'INTERNAL', message: 'no session' } });
    const port = ports[0]; s.ports.add(port); port.start();
    port.postMessage({ type: 'replay', data: s.replay.join('') });
    port.on('message', (m: any) => {
      if (m.data.type === 'write') s.pty.write(m.data.data);
      if (m.data.type === 'resize') s.pty.resize(m.data.cols, m.data.rows);
    });
    port.on('close', () => s.ports.delete(port));
  }
  if (op === 'pty.kill') { sessions.get(payload.id)?.pty.kill(); }
});
```

**`src/main/ipc/pty.ts`** — thin privileged router (per your naming convention; the heavy lifting lives in pty-host):

```ts
import { ipcMain } from 'electron';
import type { PtySupervisor } from '../supervisors/ptySupervisor';

export function registerPtyIpc(supervisor: PtySupervisor) {
  // Control plane: create/kill/list — validated, low-frequency
  ipcMain.handle('pty:create', (_e, opts: PtyCreateOptions) =>
    supervisor.rpc<{ ok: true; value: PtySessionMeta }>({ op: 'pty.create', payload: opts }));
  ipcMain.handle('pty:kill',  (_e, id: string) => supervisor.rpc({ op: 'pty.kill', payload: { id } }));
  ipcMain.handle('pty:list',  () => supervisor.rpc({ op: 'pty.list' }));

  // Data plane: one MessagePortMain per session, transferred renderer ⇄ pty-host.
  // After this handoff, Main never sees terminal bytes again.
  ipcMain.on('pty:attach', (e, id: string) => {
    const { port1, port2 } = new MessageChannelMain();
    supervisor.attachPort(id, port1);                  // forwarded into utility process
    e.sender.postMessage('pty:attached', { id }, [port2]);
  });
}
```

**`src/preload/pty.ts`**:

```ts
import { ipcRenderer, contextBridge } from 'electron';

contextBridge.exposeInMainWorld('ptyNamespace', {
  create: (opts) => ipcRenderer.invoke('pty:create', opts),
  kill: (id) => ipcRenderer.invoke('pty:kill', id),
  list: () => ipcRenderer.invoke('pty:list'),
  attach: (id) => new Promise((resolve) => {
    ipcRenderer.once('pty:attached', (_e, meta, port) => resolve({ meta, port })); // transferred port
    ipcRenderer.send('pty:attach', id);
  }),
});
// assembled into window.api.pty by preload/index.ts
```

**`src/renderer/components/terminal/TerminalPane.tsx`**:

```tsx
export function TerminalPane({ sessionId }: { sessionId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal>();

  useEffect(() => {
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", monospace', fontSize: 13, lineHeight: 1.2,
      cursorBlink: true, scrollback: 5000, allowProposedApi: true,
      theme: ansiTheme,                       // generated from styles/tokens.css ANSI map
      background: 'transparent',              // vibrancy compositing via HudFrame
    });
    const fit = new FitAddon(); term.loadAddon(fit);
    term.open(hostRef.current!);
    let webgl = new WebglAddon();
    webgl.onContextLoss(() => { webgl.dispose(); webgl = new WebglAddon(); term.loadAddon(webgl); });
    term.loadAddon(webgl);
    fit.fit();
    termRef.current = term;

    let disposed = false;
    (async () => {
      const { port } = await window.api.pty.attach(sessionId);   // may resolve with replay
      if (disposed) { port.close(); return; }

      // ── Renderer-side rAF write pump (Boundary 3) ──
      let pending = ''; let scheduled = false;
      port.onmessage = (e) => {
        const d = e.data;
        if (d.type === 'replay') { term.write(d.data); return; }
        if (d.type === 'data') {
          pending += d.data;
          if (!scheduled) {
            scheduled = true;
            requestAnimationFrame(() => { scheduled = false; term.write(pending); pending = ''; });
          }
        }
        if (d.type === 'exit') useTerminalStore.getState().markExited(sessionId, d.exitCode);
      };
      term.onData((data) => port.postMessage({ type: 'write', data }));

      // ── Resize: ResizeObserver → fit → debounced RPC (80ms) ──
      let resizeTimer: number | undefined;
      const ro = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          fit.fit();
          port.postMessage({ type: 'resize', cols: term.cols, rows: term.rows });
        }, 80);
      });
      ro.observe(hostRef.current!);
    })();

    return () => { disposed = true; term.dispose(); };  // session LIVES in pty-host
  }, [sessionId]);

  return <div ref={hostRef} className="h-full w-full" />;
}
```

Key properties delivered: sessions survive renderer reload (attach → replay → live); resize is debounced and flows pty-host-ward; a 10MB `npm install` flood costs Main **zero** work and costs React at most one `term.write` per frame.

### 3.2 The Agent Stream & Tool Execution Engine

**Renderer ingestion — the hot path contract:**

```ts
// src/renderer/bootstrap/ingest.ts
// Module-scope mutable text buffers — NEVER copied into Zustand state.
const textBuf = new Map<string, string>();     // msgId → accumulated markdown
const outputBuf = new Map<string, { stdout: string; stderr: string }>(); // callId → tool output

export function ingestAgentEvent(ev: AgentEvent) {
  const st = useAgentStream.getState();
  switch (ev.type) {
    case 'token.delta':
    case 'reasoning.delta':
      textBuf.set(ev.msgId, (textBuf.get(ev.msgId) ?? '') + ev.text);
      st.markDirty(ev.msgId);                  // bumps version counter once per rAF max
      break;
    case 'tool.output': {
      const b = outputBuf.get(ev.callId) ?? { stdout: '', stderr: '' };
      b[ev.stream] += ev.chunk;
      outputBuf.set(ev.callId, b);
      st.markToolDirty(ev.callId);
      break;
    }
    case 'tool.started':
      st.upsertToolCard(ev.call);              // structural update — fine to touch the store
      useAgentStream.getState().flushNow();    // coalescer boundary already flushed upstream
      break;
    case 'artifact.ready':
      useDiffStore.getState().pushArtifact(ev.artifact);   // → InspectorPane
      break;
    case 'usage.tick':
      useCostStore.getState().apply(ev.spend);
      break;
    // … finalized / completed / failed
  }
}
```

```ts
// src/renderer/stores/agentStreamStore.ts
interface AgentStreamState {
  version: number;                                   // frame commit counter
  runs: Record<string, RunView>;
  order: string[];                                   // msgIds in render order
  dirtyMsgs: Set<string>; dirtyTools: Set<string>;
  markDirty(msgId: string): void;
  markToolDirty(callId: string): void;
  getMsgText(msgId: string): string;                 // reads module-scope ring
  getToolOutput(callId: string): ToolOutputView;
}

let rafScheduled = false;
function commitFrame() {                      // one React-visible mutation per animation frame
  useAgentStream.setState(s => ({ version: s.version + 1, dirtyMsgs: new Set(), dirtyTools: new Set() }));
  rafScheduled = false;
}
function markDirtyImpl(msgId: string) { /* add to dirty set */; if (!rafScheduled) { rafScheduled = true; requestAnimationFrame(commitFrame); } }
```

Components read text imperatively via `getMsgText()` inside `useSyncExternalStore(subscribe, () => getState().version)` — so a 4,000-message stream re-renders **only** the visible virtualized window, once per frame. The message list is virtualized (`@tanstack/react-virtual`, overscan 8). **Finalized blocks are parsed exactly once** (`msg.finalized`) into cached React nodes (shiki-highlighted code, katex, mermaid-by-hash) and never re-parsed. Only the streaming tail block renders incrementally, and code fences inside the tail render unhighlighted until the fence closes.

**Tool cards** (`ToolCard.tsx`): each card subscribes by `callId` — a per-card selector means one tool's 10k-line output stream doesn't re-render its siblings. State machine: `pending-approval → running → streaming-output → completed | failed | denied | timeout`. Behavior: expanded while running, auto-collapse 1.5s after completion unless output < 20 lines; **destructive cards stay pinned open** until resolved. Card header: risk-colored left border (safe=cyan, elevated=amber, destructive=crimson), tool glyph, `title`, elapsed timer, kaioken symbol chips for index/impact tools (click → `references()` → InspectorPane). kaioken tools get bespoke body renderers — `kaioken.verifycore` renders a live test ledger with per-test pass/fail rows (emerald/crimson) rather than raw stdout.

**Approval broker (agent-host side) — the parked-promise pattern:**

```ts
// src/agent-host/tools/approvalBroker.ts
export class ApprovalBroker {
  private pending = new Map<string, Deferred<ApprovalDecision>>();
  constructor(private send: (ch: 'approval', payload: unknown) => void) {}

  async gate(call: ToolCallEnvelope, preview: Partial<ApprovalRequest>): Promise<ApprovalDecision> {
    const req: ApprovalRequest = {
      requestId: ulid(), runId: call.runId, callId: call.callId, tool: call.tool,
      risk: call.risk as 'elevated' | 'destructive',
      summary: call.title, timeoutMs: 300_000, expiresAt: Date.now() + 300_000, ...preview,
    };
    const d = createDeferred<ApprovalDecision>();
    this.pending.set(req.requestId, d);
    this.send('approval', { op: 'approval.requested', payload: req });  // → Main (control plane)
    const t = setTimeout(() => this.resolve(req.requestId, { verdict: 'timeout' }), req.timeoutMs + 250);
    try { return await d.promise; }
    finally { clearTimeout(t); this.pending.delete(req.requestId); }
  }
  resolve(requestId: string, decision: ApprovalDecision) { this.pending.get(requestId)?.resolve(decision); }
}
```

**Main is the authority** (`main/services/approvalService.ts`): consumes request, checks **session-scope grants** (`scopeKey` → if granted, resolves `approved` without ever bothering the renderer), forwards to renderer otherwise, enforces the timeout server-side (renderer countdown is cosmetic — Main synthesizes `{verdict:'timeout'}` at `expiresAt`, dismisses the modal, informs agent-host), and marks every `requestId` **single-use** — a replayed ID returns `APPROVAL_DENIED` and is logged. The **red-line list** (`rm -rf /`, `git push --force`, `curl | sh`, writes resolving outside workspace realpath) is checked in `riskEngine.ts` and can *never* be satisfied by a session-scope grant.

Handshake sequence (wire-exact):

```
agent-host                      Main                            Renderer
  approval.requested ──────────► scope-grant check
                                   ├─ granted ─► resolve(approved) ──► (back to host, no UI)
                                   └─ not granted ──────────────► approvalStore.enqueue(req)
                                                                    ApprovalModal: focus = Deny,
                                                                    countdown from expiresAt
  ◄── approval.resolved ──────── single-use ID check ◄────────── resolve(id, decision)
  parked promise resolves → tool executes / aborts
```

Focus trap implementation: `<ApprovalModal>` renders with `initialFocus` on the **Deny** button (Radix `DialogContent` or hand-rolled focus trap); the diff body is focusable (scroll-reviewable); **Enter can never approve** because focus never lands on Approve; `Esc` = Deny; clicking outside = Deny (destructive modal is non-dismissible otherwise).

### 3.3 The Diff Review System

**Model first, UI second.** A diff artifact is `base` + `proposed` text. `shared/diff/chunks.ts` produces an ordered `DiffChunk[]` (grouped, zero-gap hunks) and a **pure `applyChunks`** function — this is the testable core:

```ts
// src/shared/diff/chunks.ts
export interface DiffChunk {
  id: string;
  fromA: number; toA: number;      // base doc range (offsets)
  fromB: number; toB: number;      // proposed doc range
  kind: 'insert' | 'delete' | 'modify';
}

/** Accept = adopt proposed side for that hunk. Reject = keep base side. Pure + golden-tested. */
export function applyChunks(base: string, chunks: DiffChunk[], proposedText: (c: DiffChunk) => string,
                            decisions: Map<string, 'accept' | 'reject'>): string {
  let out = ''; let cursor = 0;
  for (const c of chunks) {                       // chunks are non-overlapping, doc-ordered
    out += base.slice(cursor, c.fromA);           // unchanged context between hunks
    out += decisions.get(c.id) === 'reject' ? base.slice(c.fromA, c.toA)
                                            : proposedText(c);
    cursor = c.toA;
  }
  return out + base.slice(cursor);
}
```

**UI:** `DiffReview.tsx` renders a `MergeView` from `@codemirror/merge` (side A = base, side B = proposed) — plus per-chunk gutter buttons driven by the exported chunk list. Accept/reject edits a `Map<chunkId, decision>` in `diffStore`; the "result preview" pane live-recomputes via `applyChunks` (cheap — string splices on typical artifacts). Gutter markers are `GutterMarker` subclasses placed at each chunk's start line (emerald ✓ / crimson ✕ / hollow = undecided); keyboard flow: `Tab` cycles chunks, `a` accepts, `r` rejects (scoped keymap via `Prec.highest`). Shiki (`react-shiki`) is deliberately **not** used here — it's for read-only virtualized diff previews inside stream cards; CM6 owns the interactive review surface (selection, search, editing semantics, decorations). Diff background decoration: `Decoration.mark` with `--kai-pass`/`--kai-danger` tokens per chunk kind.

Final action: **"Apply N of M hunks"** → writes the composed result through the approval gate as `write_to_file` with the diff preview pre-filled in the modal (the modal's DiffPreview reuses the same chunk model) — the human reviewed it, so this is typically a one-click confirm, but it still passes through the same single-use handshake. Everything a hunk decision touches is reconstructible: `{baseRev, proposedRev, decisions}` is persisted in `diffStore`'s persisted slice, so a crash mid-review restores the exact review state.

---

## Part 4 — Phased Implementation Roadmap

### Phase 1 — Foundation, Window Shell & IPC Skeleton
**Files:** `electron.vite.config.ts` (multi-entry §2.2), `src/shared/protocol/*`, `src/main/index.ts`, `src/app/window.ts`, `src/app/security.ts`, `src/app/shortcuts.ts`, `src/main/ipc/router.ts`, `src/main/supervisors/base.ts` (+ no-op stubs), `src/preload/index.ts`, renderer `App.tsx`/`chrome/*`/`surfaceStore` + 7 stub surfaces, `styles/tokens.css`.

**Acceptance:**
- [ ] `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` asserted by an automated config test.
- [ ] `window.api.sys.ping()` RTT < 5ms p99 (1,000-call bench); console is clean (no isolation warnings, no CSP violations).
- [ ] Frameless drag, maximize/restore events, vibrancy active on Win11 acrylic + macOS.
- [ ] `Ctrl+K` opens omnibox; `Ctrl+1..9` switches all 7 surfaces; hidden surfaces keep state (React Profiler: zero renders on hidden surfaces).
- [ ] Full pipeline boots and exits cleanly with the two utility hosts stubbed (`sys.hello` handshake verified in logs).

### Phase 2 — Kaiopi Engine Runtime & Streaming Pipeline
**Files:** `src/agent-host/**` (`bus.ts`, `runtime/kaiopiAdapter.ts`, `sessionManager.ts`, `coalescers/token.ts`, `heartbeat.ts`, `indexers/pool.ts`), `main/supervisors/agentSupervisor.ts`, `main/ipc/agent.ts` + `ports.ts`, `preload/agent.ts`, renderer `bootstrap/ipcClient.ts` + `ingest.ts`, `stores/agentStreamStore` + `costStore`, `agent/AgentStream.tsx`, `MessageBlock.tsx`, `Markdown.tsx`, `MultiplierDial.tsx`, `StatusBar.tsx`.

**Acceptance:**
- [ ] Prompt → streamed response renders coalesced; Performance trace during a 3,000 tok/s stream shows **< 8ms scripting per frame** and zero layout thrash.
- [ ] `taskkill /F` on the agent-host PID → app shows degraded HUD, **auto-recovers ≤ 15s**, journal-resumed session intact.
- [ ] Multiplier dial ×1→×10 updates `modelport` projections in StatusBar and the run params (verified in `usage.tick` payloads).
- [ ] Kill app mid-stream → journal on disk contains all finalized messages; relaunch → resume offered.

### Phase 3 — Terminal PTY Subsystem
**Files:** `src/pty-host/**`, `main/supervisors/ptySupervisor.ts`, `main/ipc/pty.ts`, `preload/pty.ts`, `stores/terminalStore.ts`, `terminal/TerminalDrawer.tsx`, `TerminalTabs.tsx`, `TerminalPane.tsx`, `lib/xterm/setup.ts`.

**Acceptance:**
- [ ] Interactive `node`/`python` REPL with correct cursor addressing; ConPTY confirmed on Windows (bracketed paste, colors).
- [ ] Reload renderer (`Ctrl+R`) → sessions persist, scrollback replays, live stream resumes seamlessly.
- [ ] 10MB flood (`type huge.log`) → UI holds ≥ 45fps; pty-host RSS stable; Main process CPU ≈ 0.
- [ ] Resize latency < 80ms perceived; `Ctrl+\`` toggles drawer; drawer resize refits all panes via `ResizeObserver`.

### Phase 4 — Tool Execution, Destructive Gate & Workspace Intelligence
**Files:** `shared/riskTable.ts`, `agent-host/tools/riskEngine.ts` + `approvalBroker.ts` + `pathGuard.ts`, `main/services/approvalService.ts` + `pathPolicy.ts`, `main/ipc/approval.ts`, `preload/tools.ts`, `stores/approvalStore.ts` + `explorerStore.ts`, `approval/ApprovalModal.tsx`, `agent/ToolCard.tsx`, `inspector/FileTree.tsx`, `main/services/fsWatch.ts`, workspace IPC (`scan`/`watch`/`search`/`symbols`).

**Acceptance:**
- [ ] Playwright e2e: destructive bash on a temp fixture blocked; **Enter cannot approve** (focus starts on Deny); 5s test-timeout auto-denies; replayed `requestId` returns `APPROVAL_DENIED` (unit test).
- [ ] Session-scope grant auto-approves the *second* identical `npm test`; red-line pattern (`git push --force`) is denied even with a live session grant.
- [ ] Path policy unit tests: `..\\..\\escape`, symlink-into-`C:\Windows` attempts → `PATH_ESCAPES_WORKSPACE`.
- [ ] 10k-file repo: scan + index cold-start budget met (target < 20s on pool, UI never stalls); watcher events batched ≤ 100ms; Profiler shows chat stream re-renders **zero** FileTree components during tool output bursts.

### Phase 5 — Diff Review, Verify Gate & Knowledge Surfaces
**Files:** `shared/diff/chunks.ts` + golden fixtures, `stores/diffStore.ts`, `lib/cm/diffSetup.ts` + `cm/theme.ts`, `inspector/DiffReview.tsx`, `GraphView.tsx`, `CardsView.tsx`, `LedgerSurface.tsx`, `WikiSurface.tsx`, `agent-host/serve/wikiServer.ts`, verifycore card renderer in `ToolCard`.

**Acceptance:**
- [ ] Golden test: accept 3 of 5 hunks → `applyChunks` output byte-identical to fixture; decisions persist across app restart.
- [ ] CM6 side-by-side renders a 5k-line diff with no frame > 24ms (shiki handles the in-stream preview variant).
- [ ] `kaioken.verifycore` failure blocks run completion; HUD flips amber→crimson; failed tests expand inline.
- [ ] `kaioken/serve` graph opens in a sandboxed viewer window restricted (CSP `connect-src`) to `http://127.0.0.1:<ephemeral>`; daemon dies with agent-host.

### Phase 6 — Hardening & Production Packaging
**Files:** `electron-builder.yml`, `src/app/updater.ts`, crash/`renderProcessGone` handlers, Playwright `_electron` e2e suite, security audit checklist runbook.

**Acceptance:**
- [ ] `asarUnpack: ['**/node_modules/node-pty/**', '**/node_modules/{kaiopi,@earendil-works}/**', '**/node_modules/kaioken-*/**']`; installer installs and launches on clean Win11 + macOS (signed, notarized).
- [ ] Auto-update (staged rollout) verified end-to-end with a version bump.
- [ ] Security audit: no `webSecurity` disables, `setWindowOpenHandler` → external browser only, `will-navigate` blocked, `session.setPermissionRequestHandler` deny-all, secrets only via SafeStorage (never in localStorage), all data-plane ports pinned per-session.
- [ ] Budgets: cold start → interactive < 2.5s; idle RSS < 400MB with one agent session + one terminal; e2e suite (20 scenarios) green in CI.

---

## Closing Engineering Notes

Three things I'd flag as the highest-risk items to de-risk **first**, in order: (1) the electron-vite multi-entry utility-host build (§2.2) — it's a one-day blocker if discovered late; (2) `kaiopiAdapter.ts` — bind kaiopi's real API surface behind our narrow `AgentRuntime` port immediately so upstream package drift is quarantined to one file; (3) the approval handshake's timeout/scope semantics — write the Main-side unit tests before the modal UI, because the gate is a security boundary and the UI is downstream of its correctness.

Everything else here is deliberately structured so phases 2–5 can proceed in parallel across engineers once the Phase 1 contracts freeze: the protocol module *is* the team's contract, and the control/data-plane split means terminal, agent, and workspace workstreams share zero mutable state.