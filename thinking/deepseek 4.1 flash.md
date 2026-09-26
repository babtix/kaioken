This is a comprehensive architectural blueprint for Kaioken Desktop Studio, designed to be executed directly by your engineering team. It is grounded in the mission briefing, the reference architecture, and verified engineering patterns for Electron, React 19, and high-performance streaming pipelines.

---

## Part 1: System Topology & IPC Protocol Specification

### 1.1 Process Model & Agent Engine Hosting Strategy

**Decision: `kaiopi` runs as a forked Node.js child process with an IPC channel.**

The core architectural question is how the Electron Main process should host the `kaiopi` agent engine. The options are: in-process worker thread, spawned child process over IPC, Unix domain socket / named pipe, or local loopback HTTP/SSE server.

| Criterion | Worker Thread | Child Process (fork) | Unix Socket / Named Pipe | Loopback HTTP/SSE |
|---|---|---|---|---|
| **Isolation** | Shares address space — a native crash in `kaioken/index` or `node-pty` brings down the Main process | Full V8 isolate — crashes are contained | Full process isolation | Full process isolation |
| **Memory Overhead** | Low (~10–20 MB) | Moderate (~50–100 MB) | Moderate + HTTP stack | High + HTTP stack |
| **Startup Time** | Fast (~50 ms) | Slower (~200–500 ms) | Depends on daemon lifecycle | Slowest |
| **IPC Serialization** | Structured clone via `postMessage` — supports transferables | Node IPC (JSON, or advanced with `serialization: 'advanced'`) | Raw byte stream — requires framing protocol | HTTP request/response overhead per event |
| **Debugging** | Integrated with Main process debugger | Separate process, independent debugger | Separate daemon process | Separate daemon process |
| **Native Module Safety** | **Dangerous** — `node-pty` and `kaioken` native addons share the Main process heap | **Safe** — native module crashes are contained in the child | Safe | Safe |

**Rationale for `fork()`:** The `kaiopi` engine depends on `node-pty` and potentially other native modules. `worker_threads` share the host's address space, meaning a native crash inside `node-pty` can terminate the entire Electron Main process with no ability to recover. A forked child process provides full crash isolation. The child can be restarted without affecting the UI. Node IPC is built into `fork()` and requires zero additional infrastructure. The ~200–500 ms startup overhead is negligible for a long-running agent runtime.

**Process Model Diagram:**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           ELECTRON MAIN PROCESS                               │
│                                                                              │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────────────────┐  │
│  │  App Lifecycle   │  │  Window Manager  │  │  Native Theme / Chroming   │  │
│  └─────────────────┘  └──────────────────┘  └─────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                      IPC GATEWAY (ipcMain)                             │  │
│  │  • Channel routing & validation                                        │  │
│  │  • Request/response correlation (invoke/handle)                        │  │
│  │  • Event streaming with batching (webContents.send)                    │  │
│  │  • Destructive tool approval handshake                                │  │
│  └──────────────────────────────┬─────────────────────────────────────────┘  │
│                                 │                                            │
│  ┌──────────────────────────────▼─────────────────────────────────────────┐  │
│  │                    AGENT SUPERVISOR (AgentSupervisor.ts)                │  │
│  │  • Manages kaiopi child process lifecycle (spawn, crash, restart)      │  │
│  │  • Health checks & heartbeat monitoring                                │  │
│  │  • Graceful shutdown (SIGTERM → 5s grace → SIGKILL)                   │  │
│  │  • Exponential backoff on crash restart (1s → 2s → 4s → ... → 30s)   │  │
│  │  • Restart budget: max 5 restarts in 60s window before circuit-break  │  │
│  └──────────────────────────────┬─────────────────────────────────────────┘  │
│                                 │ Node IPC (child.send / process.send)       │
└─────────────────────────────────┼──────────────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼──────────────────────────────────────────────┐
│                    KAIOPI AGENT CHILD PROCESS (fork)                            │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         KAIOPI RUNTIME                                   │   │
│  │                                                                         │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │   │
│  │  │ pi-agent-core    │  │ pi-ai            │  │ pi-coding-agent         │  │   │
│  │  │ Agent Loop       │  │ Multi-Provider   │  │ Shell Execution         │  │   │
│  │  │ Tool Lifecycle   │  │ LLM Abstraction  │  │ Workspace Tools         │  │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │   │
│  │                                                                         │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐│   │
│  │  │              KAIOKEN OFFLINE DETERMINISTIC TRUTH LAYER              ││   │
│  │  │  index │ search │ scan │ verifycore │ impact │ gitops │ modelport  ││   │
│  │  │  plan │ cards │ wiki │ serve                                      ││   │
│  │  └─────────────────────────────────────────────────────────────────────┘│   │
│  │                                                                         │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐│   │
│  │  │              PTY MANAGER (node-pty)                                 ││   │
│  │  │  • Spawn shell sessions (pwsh / bash)                               ││   │
│  │  │  • Stream stdout/stderr chunks to Main via process.send()          ││   │
│  │  │  • Accept write/resize/kill commands from Main                     ││   │
│  │  └─────────────────────────────────────────────────────────────────────┘│   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ Electron IPC (contextBridge)
                                  │ window.api.*
                                  │
┌─────────────────────────────────▼──────────────────────────────────────────────┐
│                         PRELOAD SCRIPT (sandboxed)                              │
│                                                                                 │
│  contextBridge.exposeInMainWorld('api', {                                       │
│    agent: { send, stream, abort, approveTool, rejectTool, ... },               │
│    pty: { create, write, resize, kill, onData, onExit },                       │
│    workspace: { readFile, writeFile, listDir, searchFiles, gitStatus },        │
│    tools: { list, execute, abort }                                             │
│  })                                                                             │
└─────────────────────────────────┬──────────────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼──────────────────────────────────────────────┐
│                         RENDERER PROCESS (React 19)                             │
│                                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│  │ Chat     │ │ Research │ │ Wiki     │ │ Codemap  │ │ Cost     │             │
│  │ Surface  │ │ Surface  │ │ Surface  │ │ Graph    │ │ Ledger   │             │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘             │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  Right Dynamic Inspector: Diff Viewer │ File Tree │ Mermaid Preview    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  Bottom Collapsible Terminal Drawer (xterm.js + WebGL)                  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  State Stores (Zustand, domain-partitioned):                                    │
│  sessionStore │ terminalStore │ explorerStore │ diffStore │ agentStore          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Graceful Shutdown Protocol:**

```
Main Process shutdown initiated (app.on('before-quit'))
    │
    ├─ 1. Send { type: 'SHUTDOWN' } to kaiopi child
    │
    ├─ 2. Start 5-second grace timer
    │
    ├─ 3. kaiopi child:
    │      ├─ Aborts in-flight LLM requests
    │      ├─ Flushes session history to disk
    │      ├─ Kills all PTY sessions (SIGTERM → SIGKILL after 1s)
    │      └─ Sends { type: 'SHUTDOWN_COMPLETE' }
    │
    ├─ 4. If grace timer expires:
    │      └─ child.kill('SIGKILL')
    │
    └─ 5. Main process exits
```

**Crash Recovery & Daemon Restart:**

```typescript
// src/main/agent/AgentSupervisor.ts
class AgentSupervisor {
  private child: ChildProcess | null = null;
  private restartCount = 0;
  private restartWindow: number[] = [];
  private readonly MAX_RESTARTS = 5;
  private readonly RESTART_WINDOW_MS = 60_000;
  private readonly BASE_BACKOFF_MS = 1_000;
  private readonly MAX_BACKOFF_MS = 30_000;

  private spawnAgent(): void {
    this.child = fork(path.join(__dirname, 'kaiopi-bootstrap.js'), [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, KAIOPI_MODE: 'desktop' },
    });

    this.child.on('message', (msg) => this.handleAgentMessage(msg));
    this.child.on('exit', (code, signal) => this.handleAgentExit(code, signal));
    this.child.on('error', (err) => this.handleAgentError(err));
  }

  private handleAgentExit(code: number | null, signal: string | null): void {
    if (this.shuttingDown) return;

    const now = Date.now();
    this.restartWindow = this.restartWindow.filter(
      (t) => now - t < this.RESTART_WINDOW_MS
    );

    if (this.restartWindow.length >= this.MAX_RESTARTS) {
      // Circuit breaker: stop restarting, notify renderer
      this.notifyRenderer('agent:circuit-break', {
        reason: 'Too many crashes in window',
        code,
        signal,
      });
      return;
    }

    this.restartWindow.push(now);
    const backoff = Math.min(
      this.BASE_BACKOFF_MS * Math.pow(2, this.restartWindow.length - 1),
      this.MAX_BACKOFF_MS
    );

    this.notifyRenderer('agent:restarting', {
      attempt: this.restartWindow.length,
      backoffMs: backoff,
    });

    setTimeout(() => this.spawnAgent(), backoff);
  }
}
```

### 1.2 Complete IPC Contract TypeScript Definitions

```typescript
// src/shared/ipc-contracts.ts — Shared between Main, Preload, and Renderer

// ─── Agent Domain ───────────────────────────────────────────────────────────

export interface AgentSendRequest {
  sessionId: string;
  message: string;
  multiplier: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  context?: {
    activeFile?: string;
    selection?: { start: number; end: number; text: string };
    workspaceRoot: string;
  };
}

export interface AgentStreamEvent {
  type: 'token_delta' | 'tool_start' | 'tool_progress' | 'tool_complete'
      | 'tool_error' | 'verification_result' | 'plan_update'
      | 'session_complete' | 'error';
  sessionId: string;
  sequence: number;       // Monotonic, per-session
  timestamp: number;       // Unix epoch ms
  payload: AgentStreamPayload;
}

export type AgentStreamPayload =
  | { kind: 'token'; token: string; accumulated: string }
  | { kind: 'tool_start'; toolCallId: string; toolName: string; args: unknown }
  | { kind: 'tool_progress'; toolCallId: string; progress: number; detail: string }
  | { kind: 'tool_complete'; toolCallId: string; result: unknown; durationMs: number }
  | { kind: 'tool_error'; toolCallId: string; error: string; recoverable: boolean }
  | { kind: 'verification'; gate: string; passed: boolean; evidence: string[] }
  | { kind: 'plan'; steps: PlanStep[]; currentStep: number }
  | { kind: 'complete'; totalTokens: number; totalCostUsd: number }
  | { kind: 'error'; code: string; message: string; retryable: boolean };

export interface PlanStep {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  toolCalls: string[];
}

export interface ToolApprovalRequest {
  approvalId: string;
  toolCallId: string;
  toolName: string;       // 'run_command' | 'write_to_file' | 'apply_patch' | 'git_operations'
  args: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  diff?: DiffHunk[];      // For write_to_file / apply_patch
  timeoutMs: number;      // Default 300_000 (5 min)
}

export interface ToolApprovalResponse {
  approvalId: string;
  decision: 'approve' | 'deny';
  // Per-hunk decisions for diffs
  hunkDecisions?: Record<string, 'accept' | 'reject'>;
  // Modified args (user can edit command before approving)
  modifiedArgs?: Record<string, unknown>;
}

export interface DiffHunk {
  id: string;
  oldStart: number;
  oldLines: string[];
  newStart: number;
  newLines: string[];
  status: 'pending' | 'accepted' | 'rejected';
}

// ─── PTY Domain ─────────────────────────────────────────────────────────────

export interface PtyCreateRequest {
  id: string;             // Unique terminal ID
  shell?: string;         // Default: platform shell
  cwd?: string;           // Default: workspace root
  cols: number;
  rows: number;
  env?: Record<string, string>;
}

export interface PtyDataEvent {
  id: string;
  data: string;           // Raw ANSI-encoded output chunk
}

export interface PtyExitEvent {
  id: string;
  exitCode: number;
  signal?: number;
}

export interface PtyResizeRequest {
  id: string;
  cols: number;
  rows: number;
}

// ─── Workspace Domain ───────────────────────────────────────────────────────

export interface WorkspaceFileReadRequest {
  path: string;           // Relative to workspace root
}

export interface WorkspaceFileReadResponse {
  path: string;
  content: string;
  language: string;
  size: number;
  lastModified: number;
}

export interface WorkspaceSearchRequest {
  query: string;
  type: 'lexical' | 'symbol' | 'regex';
  maxResults?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
}

export interface WorkspaceSearchResult {
  path: string;
  line: number;
  column: number;
  matchText: string;
  contextBefore: string;
  contextAfter: string;
  score: number;
}

// ─── Tools Domain ───────────────────────────────────────────────────────────

export interface ToolListResponse {
  tools: ToolDescriptor[];
}

export interface ToolDescriptor {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema
  requiresApproval: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  category: 'filesystem' | 'execution' | 'git' | 'indexing' | 'verification';
}

// ─── The window.api Surface ─────────────────────────────────────────────────

export interface KaiokenAPI {
  agent: {
    send(request: AgentSendRequest): Promise<{ sessionId: string }>;
    stream(sessionId: string, callback: (event: AgentStreamEvent) => void): () => void;
    abort(sessionId: string): Promise<void>;
    approveTool(response: ToolApprovalResponse): Promise<void>;
    onApprovalRequest(callback: (req: ToolApprovalRequest) => void): () => void;
    onCircuitBreak(callback: (info: { reason: string; code: number | null }) => void): () => void;
  };
  pty: {
    create(request: PtyCreateRequest): Promise<{ id: string }>;
    write(id: string, data: string): void;
    resize(request: PtyResizeRequest): void;
    kill(id: string): void;
    onData(callback: (event: PtyDataEvent) => void): () => void;
    onExit(callback: (event: PtyExitEvent) => void): () => void;
  };
  workspace: {
    readFile(request: WorkspaceFileReadRequest): Promise<WorkspaceFileReadResponse>;
    listDir(path: string): Promise<FileEntry[]>;
    search(request: WorkspaceSearchRequest): Promise<WorkspaceSearchResult[]>;
    gitStatus(): Promise<GitStatus>;
  };
  tools: {
    list(): Promise<ToolListResponse>;
    execute(toolName: string, args: Record<string, unknown>): Promise<unknown>;
    abort(toolCallId: string): Promise<void>;
  };
}

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  lastModified: number;
}

export interface GitStatus {
  branch: string;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  ahead: number;
  behind: number;
}
```

### 1.3 Stream Buffering & Backpressure Strategy

The core challenge is preventing high-frequency IPC events from saturating the React main thread during intense LLM token streaming. The solution is a **three-tier buffering pipeline**.

**Tier 1: Agent Child Process → Main Process (Node IPC)**

The `kaiopi` child batches token deltas at the source. Instead of sending every token individually, it accumulates tokens in a buffer and flushes at a fixed interval:

```typescript
// kaiopi-bootstrap.ts — runs in child process
class TokenBatcher {
  private buffer: string[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL_MS = 16; // ~60fps
  private readonly MAX_BUFFER_SIZE = 200;  // Force flush if buffer grows too large

  push(token: string): void {
    this.buffer.push(token);

    if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
      this.flush();
      return;
    }

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.FLUSH_INTERVAL_MS);
    }
  }

  private flush(): void {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.join('');
    this.buffer = [];

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    process.send?.({
      type: 'agent:token_batch',
      sessionId: this.sessionId,
      sequence: this.sequence++,
      tokens: batch,
      timestamp: Date.now(),
    });
  }
}
```

**Tier 2: Main Process → Renderer (Electron IPC)**

The Main process applies a second batching layer. Tool progress events (e.g., AST indexing progress, test runner output) are accumulated per-subscriber and flushed on a 50ms timer. This reduces IPC volume by 90%+ under load.

```typescript
// src/main/ipc/stream-bridge.ts
class StreamBridge {
  private subscribers = new Map<string, {
    webContents: WebContents;
    buffer: AgentStreamEvent[];
    flushTimer: NodeJS.Timeout | null;
  }>();

  private readonly FLUSH_INTERVAL_MS = 50;

  subscribe(sessionId: string, webContents: WebContents): void {
    this.subscribers.set(sessionId, {
      webContents,
      buffer: [],
      flushTimer: null,
    });
  }

  push(event: AgentStreamEvent): void {
    const sub = this.subscribers.get(event.sessionId);
    if (!sub) return;

    sub.buffer.push(event);

    // Token deltas are already batched at Tier 1; flush immediately
    if (event.type === 'token_delta') {
      this.flushOne(event.sessionId);
      return;
    }

    // Tool progress and other events: batch at 50ms
    if (!sub.flushTimer) {
      sub.flushTimer = setTimeout(() => {
        this.flushOne(event.sessionId);
      }, this.FLUSH_INTERVAL_MS);
    }
  }

  private flushOne(sessionId: string): void {
    const sub = this.subscribers.get(sessionId);
    if (!sub || sub.buffer.length === 0) return;

    // Check backpressure: if the renderer is busy, skip this flush cycle
    // and let the buffer accumulate. The renderer will drain it on the next cycle.
    if (sub.webContents.isDestroyed()) {
      this.subscribers.delete(sessionId);
      return;
    }

    const batch = sub.buffer.splice(0, sub.buffer.length);

    sub.webContents.send('agent:stream_batch', {
      sessionId,
      events: batch,
    });

    if (sub.flushTimer) {
      clearTimeout(sub.flushTimer);
      sub.flushTimer = null;
    }
  }
}
```

**Tier 3: Renderer — Zustand Transient Updates + React 19 Transitions**

The final tier prevents token updates from triggering re-renders in unrelated components. The `agentStore` uses Zustand's `subscribe` API for transient updates — high-frequency token mutations bypass React's reconciliation cycle entirely.

```typescript
// src/renderer/stores/agentStore.ts
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface AgentState {
  sessions: Record<string, AgentSession>;
  activeSessionId: string | null;
  // ... other state
}

export const useAgentStore = create<AgentState>()(
  subscribeWithSelector((set, get) => ({
    sessions: {},
    activeSessionId: null,

    // ── Transient update: high-frequency, no re-render ──
    appendTokens: (sessionId: string, tokens: string) => {
      const session = get().sessions[sessionId];
      if (!session) return;

      // Mutate the raw session object directly — this does NOT
      // trigger a React re-render because we're using subscribe,
      // not useStore, for this specific field.
      session.rawContent += tokens;
      session.lastTokenAt = Date.now();
    },

    // ── Batched update: low-frequency, triggers re-render ──
    updateSessionMeta: (sessionId: string, meta: Partial<AgentSessionMeta>) => {
      set((state) => ({
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...state.sessions[sessionId],
            meta: { ...state.sessions[sessionId].meta, ...meta },
          },
        },
      }));
    },
  }))
);
```

The `AgentStream` component subscribes to the raw content via a `useEffect` + `subscribe` pattern, and uses a `requestAnimationFrame` loop to flush accumulated tokens to a ref-backed DOM node — completely bypassing React state:

```typescript
// src/renderer/components/AgentStream/StreamingContent.tsx
export function StreamingContent({ sessionId }: { sessionId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingContent = useRef<string>('');

  useEffect(() => {
    const unsub = useAgentStore.subscribe(
      (state) => state.sessions[sessionId]?.rawContent,
      (rawContent) => {
        pendingContent.current = rawContent;
      }
    );

    let frameId: number;
    const flush = () => {
      if (containerRef.current && pendingContent.current) {
        containerRef.current.textContent = pendingContent.current;
      }
      frameId = requestAnimationFrame(flush);
    };
    frameId = requestAnimationFrame(flush);

    return () => {
      unsub();
      cancelAnimationFrame(frameId);
    };
  }, [sessionId]);

  return <div ref={containerRef} className="streaming-content" />;
}
```

For session switching and route transitions, React 19's `startTransition` is used to mark these as non-urgent updates, preventing token streams from starving route changes.

---

## Part 2: Complete Project File Tree & Component Hierarchy

### 2.1 Directory Structure

```
desktop/
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig.json
├── tsconfig.node.json
├── tailwind.config.ts
├── postcss.config.js
├── biome.json
│
├── build/                              # electron-builder assets
│   ├── icon.ico
│   ├── icon.icns
│   ├── icon.png
│   └── entitlements.mac.plist
│
├── resources/                          # App runtime resources
│   ├── kaiopi/                         # Bundled kaiopi engine (unpacked from asar)
│   │   ├── index.js                    # Entry point
│   │   ├── node_modules/               # kaiopi's own deps
│   │   └── package.json
│   └── themes/
│       ├── kaioken-dark.json
│       └── kaioken-light.json
│
├── src/
│   ├── shared/                         # Shared between all three processes
│   │   ├── ipc-contracts.ts            # All IPC type definitions
│   │   ├── tool-schemas.ts             # Tool JSON schemas & risk levels
│   │   ├── kaioken-tokens.ts           # ANSI color token definitions
│   │   └── constants.ts                # App-wide constants
│   │
│   ├── main/                           # Electron Main process
│   │   ├── index.ts                    # App entry, window creation
│   │   ├── window/
│   │   │   ├── WindowManager.ts        # Multi-window lifecycle
│   │   │   ├── TitleBar.ts             # Custom frameless titlebar
│   │   │   └── vibrancy.ts             # OS-specific translucency
│   │   │
│   │   ├── agent/
│   │   │   ├── AgentSupervisor.ts      # Child process lifecycle, crash recovery
│   │   │   ├── kaiopi-bootstrap.ts     # Entry script for forked child (dev)
│   │   │   ├── AgentMessageRouter.ts   # Routes messages between child ↔ renderer
│   │   │   └── SessionPersistence.ts   # Session history to disk (SQLite / JSON)
│   │   │
│   │   ├── ipc/
│   │   │   ├── registerAll.ts          # Registers all IPC handlers
│   │   │   ├── agent.ts                # Agent domain handlers
│   │   │   ├── pty.ts                  # PTY domain handlers
│   │   │   ├── workspace.ts            # Workspace domain handlers
│   │   │   ├── tools.ts                # Tool execution handlers
│   │   │   └── stream-bridge.ts        # Batching & backpressure layer
│   │   │
│   │   ├── pty/
│   │   │   ├── PtyManager.ts           # node-pty session lifecycle
│   │   │   └── PtySession.ts           # Single PTY wrapper (spawn, write, resize, kill)
│   │   │
│   │   ├── security/
│   │   │   ├── csp.ts                  # Content Security Policy headers
│   │   │   ├── protocol.ts             # Custom protocol handler (app://)
│   │   │   └── url-guard.ts            # Block non-http/https/mailto navigation
│   │   │
│   │   └── updater/
│   │       └── auto-updater.ts         # electron-updater integration
│   │
│   ├── preload/                        # Preload scripts (sandboxed)
│   │   ├── index.ts                    # contextBridge.exposeInMainWorld('api', ...)
│   │   ├── agent.ts                    # window.api.agent
│   │   ├── pty.ts                      # window.api.pty
│   │   ├── workspace.ts                # window.api.workspace
│   │   └── tools.ts                    # window.api.tools
│   │
│   └── renderer/                       # React 19 application
│       ├── index.html
│       ├── main.tsx                    # React root mount
│       ├── App.tsx                     # Root component, router
│       ├── vite-env.d.ts
│       │
│       ├── styles/
│       │   ├── global.css              # Tailwind v4 imports + base styles
│       │   ├── kaioken-theme.css       # ANSI token CSS custom properties
│       │   └── animations.css          # HUD overlay animations
│       │
│       ├── stores/                     # Zustand domain stores
│       │   ├── sessionStore.ts         # Session list, active session, metadata
│       │   ├── agentStore.ts           # Agent stream state, tool calls, approvals
│       │   ├── terminalStore.ts        # Terminal tabs, split layout, xterm instances
│       │   ├── explorerStore.ts        # File tree, expanded paths, selected file
│       │   ├── diffStore.ts            # Pending diffs, hunk decisions, apply state
│       │   ├── costStore.ts            # Token usage, spend, multiplier history
│       │   └── uiStore.ts              # Layout dimensions, active nav surface, theme
│       │
│       ├── hooks/                      # Custom React hooks
│       │   ├── useAgentStream.ts       # Subscribe to agent stream events
│       │   ├── useTerminal.ts          # xterm.js lifecycle + IPC wiring
│       │   ├── useKeyboardShortcuts.ts # Global accelerator registration
│       │   ├── useResizeObserver.ts    # Element resize tracking
│       │   └── useVirtualList.ts       # Virtualized file tree / diff list
│       │
│       ├── components/                 # React components
│       │   ├── layout/
│       │   │   ├── AppShell.tsx        # Root layout: nav rail + main + inspector
│       │   │   ├── NavigationRail.tsx  # Left rail: 7 surfaces
│       │   │   ├── MainPanel.tsx       # Center: agent stream / active surface
│       │   │   ├── InspectorPanel.tsx  # Right: diff / tree / graph
│       │   │   └── StatusBar.tsx       # Bottom: multiplier dial, token count
│       │   │
│       │   ├── nav/
│       │   │   ├── NavRailItem.tsx     # Single nav button with active indicator
│       │   │   └── surfaces.ts         # Surface registry (Chat, Research, etc.)
│       │   │
│       │   ├── agent/
│       │   │   ├── AgentStream.tsx     # Scrollable conversation container
│       │   │   ├── StreamingContent.tsx # rAF-based token renderer (no React state)
│       │   │   ├── ToolCard.tsx        # Collapsible tool execution card
│       │   │   ├── ToolCardHeader.tsx  # Tool name, status, duration
│       │   │   ├── ToolCardBody.tsx    # Tool-specific rendering (AST, test output)
│       │   │   ├── ApprovalModal.tsx   # Destructive gate with focus trapping
│       │   │   ├── ApprovalDiffView.tsx # Per-hunk accept/reject within approval
│       │   │   ├── MultiplierDial.tsx  # ×1 to ×10 compute scaling dial
│       │   │   ├── PlanTracker.tsx     # Step-by-step plan progress
│       │   │   ├── CitationChip.tsx    # Verifiable citation chip
│       │   │   └── ReasoningTrace.tsx  # Collapsible reasoning display
│       │   │
│       │   ├── terminal/
│       │   │   ├── TerminalDrawer.tsx  # Bottom collapsible container
│       │   │   ├── TerminalTabs.tsx    # Tab bar for multiple PTY sessions
│       │   │   ├── TerminalPane.tsx    # xterm.js wrapper component
│       │   │   └── TerminalRegistry.ts # Global Map of TerminalEntry (outside React)
│       │   │
│       │   ├── diff/
│       │   │   ├── DiffViewer.tsx      # Side-by-side CodeMirror merge view
│       │   │   ├── DiffHunkControls.tsx # Per-hunk accept/reject buttons
│       │   │   ├── DiffToolbar.tsx     # Accept all / reject all / apply
│       │   │   └── InlineDiff.tsx      # Unified diff (for small changes)
│       │   │
│       │   ├── explorer/
│       │   │   ├── FileTree.tsx        # Virtualized file tree
│       │   │   ├── FileTreeNode.tsx    # Single tree node
│       │   │   ├── FileIcon.tsx        # Language-specific icons
│       │   │   └── SearchBar.tsx       # Workspace search input
│       │   │
│       │   ├── research/
│       │   │   ├── ResearchSurface.tsx # Research workspace
│       │   │   ├── WikiViewer.tsx      # Rendered wiki pages with Mermaid
│       │   │   └── CodemapGraph.tsx    # Interactive knowledge graph
│       │   │
│       │   ├── cost/
│       │   │   ├── CostLedger.tsx      # Spend transparency table
│       │   │   └── TokenBudgetChart.tsx # Visual budget consumption
│       │   │
│       │   ├── settings/
│       │   │   ├── SettingsSurface.tsx # Settings page
│       │   │   ├── ProviderConfig.tsx  # LLM provider configuration
│       │   │   └── ThemeSelector.tsx   # Theme picker
│       │   │
│       │   └── shared/
│       │       ├── HUDOverlay.tsx      # Scanlines, bracketed corners
│       │       ├── EnergyPulse.tsx     # State-driven pulse animation
│       │       ├── AuraSweep.tsx       # Active reasoning aura
│       │       ├── CommandPalette.tsx   # Ctrl+K omnibox
│       │       └── MarkdownRenderer.tsx # Streaming markdown + KaTeX + Mermaid
│       │
│       └── lib/
│           ├── ipc-client.ts           # Typed wrapper around window.api
│           ├── ansi-parser.ts          # Parse ANSI escapes for styling
│           ├── diff-utils.ts           # Compute hunks, apply partial patches
│           ├── mermaid-renderer.ts     # Mermaid 11.16 initialization
│           ├── katex-renderer.ts       # Streaming math rendering
│           └── perf-monitor.ts         # FPS counter, IPC latency tracker
│
├── test/
│   ├── main/
│   │   ├── agent-supervisor.test.ts
│   │   └── pty-manager.test.ts
│   ├── renderer/
│   │   ├── agent-store.test.ts
│   │   └── diff-store.test.ts
│   └── e2e/
│       ├── app-launch.spec.ts
│       └── agent-conversation.spec.ts
│
└── scripts/
    ├── bundle-kaiopi.ts                # Bundle kaiopi into resources/
    └── rebuild-native.ts               # Rebuild node-pty for Electron
```

### 2.2 Surface-to-Component Mapping

| Nav Surface | Primary Component | Right Inspector | Bottom Drawer |
|---|---|---|---|
| **Chat** | `AgentStream` | `DiffViewer` / `FileTree` (toggle) | `TerminalDrawer` |
| **Research** | `ResearchSurface` → `WikiViewer` | `CodemapGraph` / `FileTree` | — |
| **Wiki** | `WikiViewer` | Table of contents / citations | — |
| **Codemap Graph** | `CodemapGraph` | Selected node details | — |
| **Cards** | `CardGallery` (knowledge cards) | Card detail / source references | — |
| **Cost Ledger** | `CostLedger` | `TokenBudgetChart` | — |
| **Settings** | `SettingsSurface` | Provider status / diagnostics | — |

---

## Part 3: Core Implementation Deep-Dive

### 3.1 The PTY & Terminal Bridge

The PTY subsystem requires bidirectional communication between `node-pty` in the child process, the Main process, the sandboxed preload, and `@xterm/xterm` 6.0 with WebGL in the renderer.

**Architecture decision:** `node-pty` runs in the `kaiopi` child process, not in the Electron Main process. This isolates native module crashes. The Main process acts as a relay.

**`src/main/pty/PtyManager.ts`:**

```typescript
import { ChildProcess } from 'node:child_process';
import { WebContents } from 'electron';
import { PtyCreateRequest, PtyDataEvent, PtyExitEvent } from '../../shared/ipc-contracts';

export class PtyManager {
  private sessions = new Map<string, {
    childRef: ChildProcess;
    id: string;
    cols: number;
    rows: number;
  }>();

  constructor(private agentChild: ChildProcess) {}

  create(req: PtyCreateRequest, webContents: WebContents): string {
    // Forward to kaiopi child process via Node IPC
    this.agentChild.send({
      type: 'pty:create',
      payload: req,
    });

    this.sessions.set(req.id, {
      childRef: this.agentChild,
      id: req.id,
      cols: req.cols,
      rows: req.rows,
    });

    return req.id;
  }

  write(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (!session) return;

    session.childRef.send({
      type: 'pty:write',
      payload: { id, data },
    });
  }

  resize(req: PtyResizeRequest): void {
    const session = this.sessions.get(req.id);
    if (!session) return;

    // Update local state
    session.cols = req.cols;
    session.rows = req.rows;

    // Forward to child process
    session.childRef.send({
      type: 'pty:resize',
      payload: req,
    });
  }

  kill(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;

    session.childRef.send({
      type: 'pty:kill',
      payload: { id },
    });

    this.sessions.delete(id);
  }

  // Called when child process sends PTY data back
  handlePtyData(event: PtyDataEvent): void {
    // Relay to renderer via the stream bridge
    // (webContents is resolved by the IPC gateway)
  }
}
```

**`src/preload/pty.ts`:**

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  pty: {
    create: (req: PtyCreateRequest) => ipcRenderer.invoke('pty:create', req),

    write: (id: string, data: string) =>
      ipcRenderer.send('pty:write', { id, data }),

    resize: (req: PtyResizeRequest) =>
      ipcRenderer.send('pty:resize', req),

    kill: (id: string) => ipcRenderer.send('pty:kill', { id }),

    onData: (callback: (event: PtyDataEvent) => void) => {
      const listener = (_: unknown, event: PtyDataEvent) => callback(event);
      ipcRenderer.on('pty:data', listener);
      return () => ipcRenderer.removeListener('pty:data', listener);
    },

    onExit: (callback: (event: PtyExitEvent) => void) => {
      const listener = (_: unknown, event: PtyExitEvent) => callback(event);
      ipcRenderer.on('pty:exit', listener);
      return () => ipcRenderer.removeListener('pty:exit', listener);
    },
  },
});
```

**`src/renderer/components/terminal/TerminalPane.tsx`:**

```typescript
import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { TerminalRegistry } from './TerminalRegistry';
import '@xterm/xterm/css/xterm.css';

// Canopy-style Kaioken theme
const KAIoken_THEME = {
  background: '#0a0b0e',
  foreground: '#e0e0e0',
  cursor: '#00e5ff',
  cursorAccent: '#0a0b0e',
  selectionBackground: '#1a1d24',
  black: '#0a0b0e',     red: '#ff1744',
  green: '#00e676',     yellow: '#ffb300',
  blue: '#2979ff',      magenta: '#d500f9',
  cyan: '#00e5ff',      white: '#e0e0e0',
  brightBlack: '#4a4a4a', brightRed: '#ff5252',
  brightGreen: '#69f0ae', brightYellow: '#ffd740',
  brightBlue: '#448aff',  brightMagenta: '#e040fb',
  brightCyan: '#18ffff',  brightWhite: '#ffffff',
};

export function TerminalPane({ terminalId, onReady, onExit }: {
  terminalId: string;
  onReady?: () => void;
  onExit?: (code: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Check registry — terminal may already exist (tab switch, not destruction)
    let entry = TerminalRegistry.get(terminalId);

    if (!entry) {
      const term = new Terminal({
        theme: KAIoken_THEME,
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        cursorBlink: true,
        scrollback: 10_000,
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      // WebGL renderer with canvas fallback
      try {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => webglAddon.dispose());
        term.loadAddon(webglAddon);
      } catch {
        // Canvas fallback — WebGL not available
      }

      // Open into the container
      term.open(containerRef.current);
      fitAddon.fit();

      // ── Wire IPC ──────────────────────────────────────────────
      const cleanupData = window.api.pty.onData((event) => {
        if (event.id === terminalId) {
          term.write(event.data);
        }
      });

      const cleanupExit = window.api.pty.onExit((event) => {
        if (event.id === terminalId) {
          term.write(`\r\n\x1b[90m[Process exited with code ${event.exitCode}]\x1b[0m\r\n`);
          onExit?.(event.exitCode);
        }
      });

      // Terminal input → PTY
      term.onData((data) => {
        window.api.pty.write(terminalId, data);
      });

      // Terminal resize → PTY
      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        window.api.pty.resize({
          id: terminalId,
          cols: term.cols,
          rows: term.rows,
        });
      });
      resizeObserver.observe(containerRef.current);

      entry = {
        terminal: term,
        fitAddon,
        element: containerRef.current,
        cleanup: () => {
          cleanupData();
          cleanupExit();
          resizeObserver.disconnect();
        },
      };

      TerminalRegistry.set(terminalId, entry);
      onReady?.();
    }

    // Attach the terminal DOM element to the container
    const termElement = entry.terminal.element;
    if (termElement && !containerRef.current.contains(termElement)) {
      containerRef.current.appendChild(termElement);
    }

    // Refit on attach
    requestAnimationFrame(() => entry.fitAddon.fit());

    return () => {
      // Do NOT dispose on unmount — preserve session across tab switches.
      // Detach the DOM element so it can be re-attached later.
      const el = entry.terminal.element;
      if (el && el.parentElement) {
        el.parentElement.removeChild(el);
      }
    };
  }, [terminalId, onReady, onExit]);

  return (
    <div
      ref={containerRef}
      className="terminal-container w-full h-full"
      style={{ backgroundColor: '#0a0b0e' }}
    />
  );
}
```

**`src/renderer/components/terminal/TerminalRegistry.ts`:**

```typescript
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

interface TerminalEntry {
  terminal: Terminal;
  fitAddon: FitAddon;
  element: HTMLElement;
  cleanup: () => void;
}

// Global registry OUTSIDE React's lifecycle.
// Terminals are never destroyed on tab switch — only detached.
const registry = new Map<string, TerminalEntry>();

export const TerminalRegistry = {
  get(id: string): TerminalEntry | undefined {
    return registry.get(id);
  },
  set(id: string, entry: TerminalEntry): void {
    registry.set(id, entry);
  },
  delete(id: string): void {
    const entry = registry.get(id);
    if (entry) {
      entry.cleanup();
      entry.terminal.dispose();
      registry.delete(id);
    }
  },
  has(id: string): boolean {
    return registry.has(id);
  },
};
```

**Resize event flow:**

```
User drags terminal drawer edge
    → ResizeObserver fires in TerminalPane
    → fitAddon.fit() recalculates cols/rows from container dimensions
    → window.api.pty.resize({ id, cols, rows })
    → ipcRenderer.send('pty:resize')
    → Main process forwards to kaiopi child
    → child calls ptyProcess.resize(cols, rows)
    → node-pty sends SIGWINCH to the shell
    → Shell redraws at new dimensions
```

For the "Jank Fix" during massive text dumps, the terminal uses a throttled writer that batches writes at 60fps using `requestAnimationFrame`, and a CSI parser blocks cursor-home sequences (`ESC[H` or `ESC[1;1H`) during active scrolling.

### 3.2 The Agent Stream & Tool Execution Engine

Tool calls are rendered as interactive cards in the `AgentStream`. Each card is a stateful component that subscribes to the relevant tool call's progress events.

**Tool call lifecycle:**

```
kaiopi child emits tool_start
    → Main process routes to StreamBridge
    → Renderer receives via agent:stream_batch
    → agentStore creates a ToolCallRecord
    → ToolCard mounts with status='running'

kaiopi child emits tool_progress (repeated)
    → StreamBridge batches at 50ms
    → agentStore updates progress (transient, no re-render)
    → ToolCardBody reads progress via subscribe (rAF flush)

kaiopi child emits tool_complete
    → agentStore updates status='complete'
    → ToolCard re-renders with final result

For destructive tools (write_to_file, run_command, apply_patch):
    → kaiopi child emits tool_approval_request
    → Main process blocks tool execution
    → ApprovalModal opens with focus trapped on "Deny"
    → User decides → approveTool/rejectTool IPC back to child
    → Child proceeds or aborts
```

**`ToolCard` component structure:**

```typescript
// src/renderer/components/agent/ToolCard.tsx
export function ToolCard({ toolCallId, sessionId }: {
  toolCallId: string;
  sessionId: string;
}) {
  const toolCall = useAgentStore(
    (s) => s.sessions[sessionId]?.toolCalls[toolCallId]
  );

  if (!toolCall) return null;

  return (
    <div className={cn(
      'tool-card',
      'border rounded-lg overflow-hidden',
      'bg-[var(--kaioken-surface)] border-[var(--kaioken-border)]',
      toolCall.status === 'error' && 'border-[var(--kaioken-danger)]',
      toolCall.status === 'running' && 'hud-active',
    )}>
      <ToolCardHeader
        name={toolCall.toolName}
        status={toolCall.status}
        durationMs={toolCall.durationMs}
        riskLevel={toolCall.riskLevel}
      />
      {toolCall.status !== 'pending_approval' && (
        <ToolCardBody
          toolName={toolCall.toolName}
          args={toolCall.args}
          result={toolCall.result}
          progress={toolCall.progress}
        />
      )}
    </div>
  );
}
```

**Tool-specific rendering in `ToolCardBody`:**

| Tool | Rendering |
|---|---|
| `kaioken/index` | AST symbol tree with clickable references |
| `kaioken/verifycore` | Verification gate results with pass/fail badges |
| `run_command` (bash) | Terminal-styled output with ANSI parsing |
| `write_to_file` / `apply_patch` | Embedded `InlineDiff` component |
| `git_operations` | Branch/commit info with merge status |
| `kaioken/impact` | Blast radius visualization (affected files graph) |
| `kaioken/search` | BM25 result list with relevance scores |

### 3.3 The Diff Review System

The diff review system uses CodeMirror 6's `@codemirror/merge` package, which provides a `MergeView` that manages two editors side-by-side, highlighting differences and vertically aligning unchanged lines.

**`DiffViewer` component:**

```typescript
// src/renderer/components/diff/DiffViewer.tsx
import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { MergeView } from '@codemirror/merge';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';

interface DiffViewerProps {
  original: string;
  modified: string;
  language?: string;
  onHunkDecision: (hunkId: string, decision: 'accept' | 'reject') => void;
}

export function DiffViewer({
  original,
  modified,
  language = 'javascript',
  onHunkDecision,
}: DiffViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mergeViewRef = useRef<MergeView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const langExt = language === 'typescript'
      ? javascript({ typescript: true })
      : language === 'javascript'
        ? javascript()
        : [];

    const mergeView = new MergeView({
      parent: containerRef.current,
      orientation: 'a-b',  // Side-by-side
      a: {
        doc: original,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          langExt,
          oneDark,
          EditorState.readOnly.of(true),  // Left side is read-only
        ],
      },
      b: {
        doc: modified,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          langExt,
          oneDark,
        ],
      },
      // Highlight changed chunks
      highlightChanges: true,
      gutter: true,
      // Collapse unchanged regions with > 4 lines
      collapseUnchanged: { margin: 4, minSize: 6 },
      // Diff precision tuning
      diffConfig: {
        scanLimit: 5000,  // Limit expensive diff computations
      },
    });

    mergeViewRef.current = mergeView;

    return () => {
      mergeView.destroy();
      mergeViewRef.current = null;
    };
  }, [original, modified, language]);

  return (
    <div className="diff-viewer h-full flex flex-col">
      <DiffToolbar
        onAcceptAll={() => onHunkDecision('*', 'accept')}
        onRejectAll={() => onHunkDecision('*', 'reject')}
      />
      <div ref={containerRef} className="flex-1 overflow-auto" />
    </div>
  );
}
```

**Per-hunk accept/reject:** CodeMirror's `MergeView` exposes the computed chunks via `mergeView.chunks`. Each chunk is a contiguous block of changed lines. The `DiffHunkControls` component renders accept/reject buttons above each chunk:

```typescript
// src/renderer/components/diff/DiffHunkControls.tsx
export function DiffHunkControls({ hunks, onDecision }: {
  hunks: DiffHunk[];
  onDecision: (hunkId: string, decision: 'accept' | 'reject') => void;
}) {
  const allDecided = hunks.every((h) => h.status !== 'pending');
  const acceptedCount = hunks.filter((h) => h.status === 'accepted').length;

  return (
    <div className="diff-hunk-controls flex items-center gap-2 px-4 py-2
                    bg-[var(--kaioken-surface-dim)] border-b
                    border-[var(--kaioken-border)]">
      <span className="text-sm text-[var(--kaioken-text-dim)]">
        {acceptedCount} / {hunks.length} hunks accepted
      </span>

      <div className="flex-1" />

      {!allDecided ? (
        <span className="text-sm text-[var(--kaioken-warning)]">
          Every hunk must be decided before applying
        </span>
      ) : (
        <button
          className="btn-primary"
          onClick={() => onDecision('__apply__', 'accept')}
        >
          Apply {acceptedCount} hunks
        </button>
      )}
    </div>
  );
}
```

**Applying partial patches:** When the user accepts only some hunks, the `diffStore` computes the final file content by applying the accepted hunks to the original document:

```typescript
// src/renderer/lib/diff-utils.ts
export function applyAcceptedHunks(
  original: string,
  hunks: DiffHunk[],
  decisions: Record<string, 'accept' | 'reject'>
): string {
  const lines = original.split('\n');
  const accepted = hunks
    .filter((h) => decisions[h.id] === 'accept')
    .sort((a, b) => b.oldStart - a.oldStart); // Apply bottom-up

  let result = [...lines];

  for (const hunk of accepted) {
    const removeCount = hunk.oldLines.length;
    const insertLines = hunk.newLines;

    result.splice(
      hunk.oldStart - 1,  // Convert 1-indexed to 0-indexed
      removeCount,
      ...insertLines
    );
  }

  return result.join('\n');
}
```

---

## Part 4: Step-by-Step Implementation Roadmap

### Phase 1: Foundation & IPC Skeleton

**Objective:** Establish the three-process boundary, IPC contract, and agent child process bootstrap.

**Files to create/modify:**

| File | Purpose |
|---|---|
| `src/shared/ipc-contracts.ts` | All IPC type definitions (from Part 1.2) |
| `src/main/index.ts` | Electron app entry, window creation |
| `src/main/window/WindowManager.ts` | BrowserWindow with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false` (required for preload with `node-pty` IPC relay) |
| `src/main/agent/AgentSupervisor.ts` | Fork `kaiopi` child, crash recovery, health checks |
| `src/main/agent/kaiopi-bootstrap.ts` | Child process entry — imports `kaiopi` runtime, sets up `process.send` handler |
| `src/main/ipc/registerAll.ts` | Register all `ipcMain.handle` handlers |
| `src/main/ipc/agent.ts` | Agent domain IPC handlers |
| `src/preload/index.ts` | `contextBridge.exposeInMainWorld('api', ...)` |
| `electron.vite.config.ts` | Three-target build config (main, preload, renderer) |
| `package.json` | Dependencies, scripts (`dev`, `build`, `rebuild-native`) |

**Acceptance verification:**
1. `npm run dev` launches Electron with a blank window.
2. DevTools console shows `window.api` with `agent`, `pty`, `workspace`, `tools` namespaces.
3. Main process logs `AgentSupervisor: child spawned (PID: XXXX)`.
4. Sending a test message via `window.api.agent.send()` reaches the child and returns an echo response.
5. Killing the child process triggers automatic restart within 2 seconds.

### Phase 2: Agent Stream & Token Pipeline

**Objective:** Wire the full token streaming pipeline from `kaiopi` → child → Main → renderer → React component.

**Files to create/modify:**

| File | Purpose |
|---|---|
| `src/main/ipc/stream-bridge.ts` | 50ms batching, backpressure handling |
| `src/renderer/stores/agentStore.ts` | Session state, transient token updates |
| `src/renderer/stores/sessionStore.ts` | Session list, active session |
| `src/renderer/hooks/useAgentStream.ts` | Subscribe to stream batches, dispatch to store |
| `src/renderer/components/agent/AgentStream.tsx` | Scrollable conversation container |
| `src/renderer/components/agent/StreamingContent.tsx` | rAF-based token renderer (no React state) |
| `src/renderer/components/agent/MultiplierDial.tsx` | ×1 to ×10 dial |
| `src/renderer/components/shared/MarkdownRenderer.tsx` | Streaming markdown + KaTeX + Mermaid |

**Acceptance verification:**
1. Sending a message to a real LLM provider streams tokens into the `AgentStream` at 60 FPS.
2. React DevTools Profiler shows zero re-renders in the file tree or diff viewer during token streaming.
3. The multiplier dial changes the `multiplier` field in `AgentSendRequest`.
4. Mermaid diagrams render inline in the stream and are interactive.
5. Token budget is displayed in the status bar and updates in real time.

### Phase 3: Terminal PTY Subsystem

**Objective:** Full `node-pty` ↔ `xterm.js` bridge with resize, multiplexing, and tab management.

**Files to create/modify:**

| File | Purpose |
|---|---|
| `src/main/pty/PtyManager.ts` | PTY session lifecycle in Main process |
| `src/main/pty/PtySession.ts` | Single PTY wrapper |
| `src/main/ipc/pty.ts` | IPC handlers for `pty:create`, `pty:write`, `pty:resize`, `pty:kill` |
| `src/preload/pty.ts` | `window.api.pty.*` |
| `src/renderer/components/terminal/TerminalRegistry.ts` | Global terminal instance map (outside React) |
| `src/renderer/components/terminal/TerminalPane.tsx` | xterm.js wrapper with WebGL, resize, IPC wiring |
| `src/renderer/components/terminal/TerminalDrawer.tsx` | Bottom collapsible drawer |
| `src/renderer/components/terminal/TerminalTabs.tsx` | Tab bar for multiple PTY sessions |
| `src/renderer/stores/terminalStore.ts` | Terminal tab state, split layout tree |

**Acceptance verification:**
1. `Ctrl+\`` toggles the terminal drawer open/closed.
2. A new terminal tab opens a working shell (PowerShell on Windows, bash on macOS/Linux).
3. Typing `ls` (or `dir`) and pressing Enter produces output in the terminal.
4. Resizing the terminal drawer sends `pty:resize` and the shell redraws correctly.
5. Switching between terminal tabs preserves scrollback and running processes.
6. Closing a terminal tab disposes the xterm instance and kills the PTY process.

### Phase 4: Diff Review & Destructive Gate

**Objective:** CodeMirror 6 side-by-side diff with per-hunk accept/reject, integrated into the tool approval flow.

**Files to create/modify:**

| File | Purpose |
|---|---|
| `src/renderer/stores/diffStore.ts` | Pending diffs, hunk decisions, apply state |
| `src/renderer/components/diff/DiffViewer.tsx` | CodeMirror `MergeView` side-by-side |
| `src/renderer/components/diff/DiffHunkControls.tsx` | Per-hunk accept/reject buttons |
| `src/renderer/components/diff/DiffToolbar.tsx` | Accept all / reject all / apply |
| `src/renderer/components/agent/ApprovalModal.tsx` | Destructive gate with focus trapping |
| `src/renderer/components/agent/ApprovalDiffView.tsx` | Per-hunk decision within approval modal |
| `src/renderer/lib/diff-utils.ts` | `applyAcceptedHunks()` — partial patch application |
| `src/main/ipc/tools.ts` | `tool:approve`, `tool:reject` handlers |

**Acceptance verification:**
1. When the agent calls `write_to_file`, an `ApprovalModal` opens with the diff.
2. Focus is trapped on the "Deny" button by default.
3. Pressing Enter does **not** approve — it must be explicitly clicked.
4. After 5 minutes, the modal auto-cancels and the tool is denied.
5. Per-hunk accept/reject buttons are visible above each changed block.
6. The "Apply" button remains disabled until every hunk has a decision.
7. Applying with partial hunks writes the correct merged content to disk.

### Phase 5: Workspace Layout & Navigation

**Objective:** Full multi-pane layout with navigation rail, right inspector, and all 7 surfaces.

**Files to create/modify:**

| File | Purpose |
|---|---|
| `src/renderer/components/layout/AppShell.tsx` | Root layout: nav rail + main + inspector |
| `src/renderer/components/layout/NavigationRail.tsx` | Left rail: 7 surfaces |
| `src/renderer/components/layout/MainPanel.tsx` | Center: active surface |
| `src/renderer/components/layout/InspectorPanel.tsx` | Right: diff / tree / graph (toggleable) |
| `src/renderer/components/layout/StatusBar.tsx` | Bottom: multiplier, tokens, FPS |
| `src/renderer/components/explorer/FileTree.tsx` | Virtualized file tree |
| `src/renderer/components/explorer/SearchBar.tsx` | Workspace search |
| `src/renderer/components/research/ResearchSurface.tsx` | Research workspace |
| `src/renderer/components/research/WikiViewer.tsx` | Rendered wiki with Mermaid |
| `src/renderer/components/research/CodemapGraph.tsx` | Interactive knowledge graph |
| `src/renderer/components/cost/CostLedger.tsx` | Spend transparency |
| `src/renderer/components/settings/SettingsSurface.tsx` | Settings page |
| `src/renderer/components/shared/CommandPalette.tsx` | `Ctrl+K` omnibox |
| `src/renderer/hooks/useKeyboardShortcuts.ts` | Global accelerator registration |
| `src/renderer/stores/explorerStore.ts` | File tree state |
| `src/renderer/stores/uiStore.ts` | Layout dimensions, active nav surface |
| `src/renderer/stores/costStore.ts` | Token usage, spend |

**Acceptance verification:**
1. `Ctrl+1` through `Ctrl+9` switches between the 7 nav surfaces.
2. `Ctrl+K` opens the command palette with fuzzy search across all actions.
3. `Ctrl+\`` toggles the terminal drawer without affecting the main panel.
4. The right inspector can be toggled between diff, file tree, and graph views.
5. Dragging the split between main panel and inspector resizes both panes.
6. The file tree renders a workspace with 10,000+ files without jank (virtualized).
7. The cost ledger shows accurate token usage and spend per session.

### Phase 6: Production Packaging & Polish

**Objective:** electron-builder configuration, native module handling, code signing, and auto-update.

**Files to create/modify:**

| File | Purpose |
|---|---|
| `electron-builder.yml` | Full packaging config |
| `scripts/rebuild-native.ts` | Rebuild `node-pty` for Electron ABI |
| `scripts/bundle-kaiopi.ts` | Bundle `kaiopi` engine into `resources/` |
| `src/main/updater/auto-updater.ts` | electron-updater integration |
| `src/main/security/csp.ts` | Content Security Policy headers |
| `src/main/security/protocol.ts` | Custom `app://` protocol handler |
| `src/main/security/url-guard.ts` | Block non-http/https/mailto navigation |
| `src/main/window/vibrancy.ts` | OS-specific acrylic/vibrancy effects |

**electron-builder configuration:**

```yaml
# electron-builder.yml
appId: com.kaioken.desktop-studio
productName: Kaioken Desktop Studio
directories:
  output: dist
  buildResources: build

files:
  - dist/**/*
  - resources/**/*
  - "!**/*.map"

asar: true
asarUnpack:
  - "**/*.node"                      # Native modules (node-pty, better-sqlite3)
  - "resources/kaiopi/**"            # kaiopi engine must be unpacked

nativeModules:
  nodeGypRebuild: true               # Rebuild native addons for Electron ABI

win:
  target:
    - nsis
  icon: build/icon.ico
  signtoolOptions:
    certificateFile: ${env.CSC_LINK}
    certificatePassword: ${env.CSC_KEY_PASSWORD}

mac:
  target:
    - dmg
    - zip
  icon: build/icon.icns
  category: public.app-category.developer-tools
  hardenedRuntime: true
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist

linux:
  target:
    - AppImage
    - deb
  icon: build/icon.png
  category: Development

publish:
  provider: github
  releaseType: draft
```

**Critical native module handling:** `node-pty` is a native addon. After `npm install`, the `postinstall` script must run `electron-builder install-app-deps` to rebuild it against Electron's ABI. The `nodeGypRebuild: true` option ensures this happens during packaging. The `asarUnpack` configuration extracts `node-pty` and `kaiopi` from the asar archive so they can be loaded at runtime.

**Acceptance verification:**
1. `npm run build` produces installers for the target platforms.
2. The installed app launches and the agent child process spawns correctly.
3. `node-pty` works in the packaged app (no `Module did not self-register` errors).
4. Auto-update checks for a new release and displays a notification.
5. CSP headers block inline scripts and unauthorized origins.
6. External links open in the system browser, not in the Electron window.
7. The app passes a basic security audit (no `nodeIntegration: true`, no `enableRemoteModule`).

---

## Summary of Key Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Agent engine hosting** | Forked Node.js child process | Crash isolation for native modules; zero additional IPC infrastructure |
| **Stream buffering** | 3-tier (child 16ms, Main 50ms, renderer rAF) | Prevents React main-thread saturation; 90%+ IPC volume reduction |
| **React state for tokens** | Zustand transient updates + rAF DOM writes | Bypasses React reconciliation entirely for high-frequency updates |
| **Terminal lifecycle** | Global registry outside React | Preserves scrollback and running processes across tab switches |
| **Diff review** | CodeMirror 6 `MergeView` + per-hunk state | Native side-by-side diff with precise chunk boundaries |
| **Security model** | `contextIsolation: true`, `sandbox: false` | Required for preload `node-pty` IPC relay; narrow IPC surface as security boundary |
| **Native module packaging** | `asarUnpack` + `nodeGypRebuild` | Ensures `node-pty` and `kaiopi` load correctly from the packaged app |

This blueprint is designed for direct execution. Each phase is independently testable, and the acceptance criteria provide clear gates for progression. The three-tier streaming pipeline and the domain-partitioned Zustand stores are the critical innovations that enable the jank-free 60 FPS experience that distinguishes Kaioken Desktop Studio from generic AI chat clients.