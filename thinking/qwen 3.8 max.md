# Kaioken Desktop Studio — Definitive Architecture Blueprint & Phased Implementation Plan

This document is the **authoritative engineering plan** for building **Kaioken Desktop Studio** on top of:

- **Electron 44**
- **electron-vite**
- **React 19**
- **TypeScript strict**
- **Tailwind CSS v4**
- **CodeMirror 6**
- **@xterm/xterm 6 + WebGL**
- **node-pty**
- **kaiopi** agent runtime
- **Kaioken offline deterministic truth layer**

The plan is optimized for:

1. **Process isolation and crash containment**
2. **60 FPS token/tool streaming under heavy IPC load**
3. **Strict Electron security boundaries**
4. **Keyboard-first developer velocity**
5. **Destructive-operation safety**
6. **Persistent knowledge artifacts instead of ephemeral chat**
7. **Enterprise-grade maintainability**

---

# Executive Architecture Decisions

## Decision 1 — Kaiopi must not run inside the Electron main process

Kaiopi is an autonomous agent harness with:

- LLM streaming
- tool orchestration
- AST indexing
- BM25 search
- verification/test execution
- git operations
- dependency impact analysis
- cost budgeting
- long-running sessions

Running that directly inside the Electron main process would:

- block window lifecycle
- destabilize the entire app on engine crash
- make CPU-heavy indexing compete with UI responsiveness
- create unsafe coupling between native desktop concerns and agent runtime concerns

### Recommended runtime model

Use a **dedicated Electron utility process** as the primary host for the Kaiopi engine.

```text
Electron Main Process
  ├── window management
  ├── secure IPC gateway
  ├── node-pty manager
  ├── filesystem guard
  ├── secret vault
  ├── approval policy engine
  └── Kaiopi Engine Supervisor
        └── utility process
              ├── kaiopi session orchestrator
              ├── pi-agent-core loop
              ├── pi-ai provider adapters
              ├── chord RPC/message bus adapter
              ├── kaioken/index workers
              ├── kaioken/search workers
              ├── kaioken/verify workers
              └── child processes for shell/git/test runners
```

This gives:

- crash isolation from Electron main
- clean restart semantics
- controlled resource governance
- direct structured-cloning IPC via MessagePort
- future ability to swap embedded engine for external daemon without changing renderer contracts

## Decision 2 — Use a split control plane / data plane IPC model

Not all IPC traffic should be treated equally.

### Control plane

Low-frequency, security-critical operations:

- create session
- stop session
- set multiplier
- approve/deny destructive tool execution
- open workspace
- read file
- update policies

These go through **Electron main IPC handlers** with validation.

### Data plane

High-frequency streaming traffic:

- LLM token deltas
- tool progress logs
- terminal output
- verification progress
- cost updates

These should use **batched envelopes**, and for the agent stream, preferably a **direct MessagePort** between the renderer preload and the Kaiopi utility process after main brokers the initial handshake.

This avoids saturating the main process with thousands of token deltas per second.

## Decision 3 — Terminal output stays in the main process, but is heavily batched

`node-pty` must run in a Node-capable process. The correct place is the **Electron main process**, not renderer and not preload.

Terminal I/O is bridged through:

```text
node-pty -> main PTY manager -> batched IPC -> preload -> xterm.js
```

Terminal output is **not stored in React state**. It is written directly to xterm.js.

## Decision 4 — React state must be partitioned by update frequency

Rapid LLM token deltas must not invalidate:

- file tree
- terminal
- diff inspector
- codemap
- settings
- navigation

Therefore state is split into isolated stores:

- `uiStore`
- `sessionStore`
- `agentStreamStore`
- `toolStore`
- `approvalStore`
- `terminalStore`
- `explorerStore`
- `diffStore`
- `graphStore`
- `wikiStore`
- `cardsStore`
- `costStore`
- `settingsStore`

High-frequency streaming text should live in an **external mutable cache** exposed to React through `useSyncExternalStore`, not as a giant Zustand object that invalidates broad component trees.

## Decision 5 — Destructive tools are blocked by a main-process approval gateway

The agent engine does **not** directly execute:

- `write_to_file`
- `apply_patch`
- `run_command`
- `git_operations`
- dangerous `kaioken/verify` side-effect runners

without first passing through a **desktop approval gateway** in Electron main.

This gateway:

- assigns request IDs
- verifies workspace path containment
- redacts secrets
- applies policy rules
- enforces timeout auto-deny
- records audit logs
- returns a cryptographically correlated decision to the engine

---

# Part 1 — System Topology & IPC Protocol Specification

---

## 1.1 Process Model

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Renderer Process (React 19)                                                  │
│                                                                              │
│  ┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────┐ │
│  │ Navigation Surfaces  │   │ Agent Stream Surface │   │ Inspector Panels │ │
│  │ Chat / Research /    │   │ Message rows         │   │ Diff Viewer      │ │
│  │ Wiki / Codemap /     │   │ Tool cards           │   │ File Tree        │ │
│  │ Cards / Cost /       │   │ Multiplier Dial      │   │ Mermaid Preview  │ │
│  │ Settings             │   │ Approval Modal       │   │ Symbol Panel     │ │
│  └──────────────────────┘   └──────────────────────┘   └──────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Terminal Drawer                                                        │ │
│  │ xterm.js + WebGL renderer                                              │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Preload contextBridge API: window.api                                  │ │
│  │ window.api.agent / pty / workspace / tools / window                    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ contextBridge + sandboxed ipcRenderer
                                       │ MessagePort for streaming data plane
┌──────────────────────────────────────▼───────────────────────────────────────┐
│ Electron Main Process                                                        │
│                                                                              │
│  ┌────────────────────────────┐   ┌──────────────────────────────────────┐  │
│  │ IPC Controllers            │   │ Security Gate                        │  │
│  │ agent / pty / workspace /  │   │ sender validation                    │  │
│  │ tools / window             │   │ schema validation                    │  │
│  └─────────────┬──────────────┘   │ workspace path sandbox               │  │
│                │                  │ secret redaction                     │  │
│                │                  └──────────────────────────────────────┘  │
│                │                                                             │
│  ┌─────────────▼──────────────┐   ┌──────────────────────────────────────┐  │
│  │ PTY Manager                │   │ Tool Approval Gateway                │  │
│  │ node-pty sessions          │   │ pending request registry             │  │
│  │ batching + flow control    │   │ timeout auto-deny                    │  │
│  │ resize / multiplexing      │   │ audit log                            │  │
│  └────────────────────────────┘   └──────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Kaiopi Engine Supervisor                                               │ │
│  │ spawns and monitors utility process                                    │ │
│  │ heartbeat / restart / graceful shutdown                                │ │
│  └─────────────┬──────────────────────────────────────────────────────────┘ │
└────────────────┼─────────────────────────────────────────────────────────────┘
                 │ MessagePort / structured clone / JSON-RPC-like messages
┌────────────────▼─────────────────────────────────────────────────────────────┐
│ Kaiopi Utility Process                                                       │
│                                                                              │
│  ┌────────────────────────────┐   ┌──────────────────────────────────────┐  │
│  │ Session Orchestrator       │   │ Tool Runtime                         │  │
│  │ pi-agent-core loop         │   │ read-only tools                      │  │
│  │ pi-ai provider streaming   │   │ mutating tools gated by desktop      │  │
│  │ session history            │   │ verification hooks                   │  │
│  └────────────────────────────┘   └──────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────┐   ┌──────────────────────────────────────┐  │
│  │ Kaioken Workers            │   │ Child Processes                      │  │
│  │ index / search / scan /    │   │ shell commands                       │  │
│  │ verify / impact / gitops / │   │ test runners                         │  │
│  │ wiki / cards / modelport   │   │ git worktree operations              │  │
│  └────────────────────────────┘   └──────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 1.2 Hosting Options Compared

| Option | Verdict | Reason |
|---|---:|---|
| Kaiopi in Electron main | Reject | Blocks app lifecycle, crash coupling, poor CPU isolation |
| Kaiopi in worker thread inside main | Reject for primary engine | Better CPU separation but still same process lifetime and crash domain |
| Kaiopi in Electron `utilityProcess` | **Recommended** | Managed by Electron, Node-capable, isolated, MessagePort-friendly, restartable |
| Kaiopi as spawned Node child over stdio | Fallback | Good if utility process is insufficient for native deps or debugging |
| Kaiopi over Unix socket / Windows named pipe | Optional advanced mode | Useful for external CLI/desktop coexistence |
| Local loopback HTTP/SSE via `kaioken/serve` | Optional interop mode | Good for browser devtools, graph visualization, external CLI, not primary trusted desktop IPC |

### Final recommendation

Use:

```text
Primary embedded runtime:
  Electron utility process hosting KaiopiSupervisor

Optional sidecar:
  kaioken/serve loopback HTTP/SSE for graph visualization and CLI interop
```

The renderer never talks directly to `kaioken/serve` unless main has issued a short-lived localhost bearer token.

---

## 1.3 IPC Design Principles

1. **No raw `ipcRenderer` exposure**
   - Renderer only sees `window.api`.

2. **No Node.js primitives in renderer**
   - No `fs`
   - no `child_process`
   - no `path`
   - no direct `node-pty`

3. **All payloads validated**
   - Main validates every invoke payload with Zod or similar.

4. **All paths sandboxed**
   - File access only under approved workspace root.

5. **High-frequency events are batched**
   - No per-token IPC invoke calls.

6. **Events are resumable**
   - Every session stream has monotonically increasing sequence numbers and cursor.

7. **Destructive operations require explicit correlated approval**
   - Request ID
   - session ID
   - tool call ID
   - checksum
   - timeout

---

## 1.4 IPC Contract Surface

The renderer API is exposed as:

```ts
window.api.agent
window.api.pty
window.api.workspace
window.api.tools
window.api.window
```

---

## 1.5 Shared TypeScript IPC Contracts

Create:

```text
desktop/src/shared/types/ipc.ts
desktop/src/shared/types/agent.ts
desktop/src/shared/types/pty.ts
desktop/src/shared/types/workspace.ts
desktop/src/shared/types/tools.ts
```

Below is the canonical contract set.

```ts
// src/shared/types/ipc.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export type Unsubscribe = () => void;

export interface IpcError {
  code:
    | "INVALID_ARGUMENT"
    | "UNAUTHORIZED"
    | "NOT_FOUND"
    | "TIMEOUT"
    | "ENGINE_DOWN"
    | "WORKSPACE_NOT_OPEN"
    | "PATH_DENIED"
    | "TOOL_DENIED"
    | "PTY_ERROR"
    | "INTERNAL";
  message: string;
  retryable?: boolean;
  details?: Json;
}

export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: IpcError };

export type MultiplierLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface EventAck {
  sessionId: string;
  lastSeq: number;
  receivedBytes: number;
  busyLevel: 0 | 1 | 2;
}

export interface AgentConnectionInfo {
  sessionId: string;
  eventTransport: "messageport" | "main-brokered";
  capabilities: {
    streamingMarkdown: boolean;
    mermaid: boolean;
    diffs: boolean;
    codemap: boolean;
    terminal: boolean;
  };
}

export interface AgentEventEnvelope {
  sessionId: string;
  seq: number;
  cursor: string;
  emittedAt: number;
  events: AgentEvent[];
  final?: boolean;
}

export type AgentEvent =
  | SessionStatusEvent
  | MessageCreatedEvent
  | MessageDeltaEvent
  | MessageCompletedEvent
  | ToolProposedEvent
  | ToolStateEvent
  | VerificationReportEvent
  | ImpactReportEvent
  | CitationEvent
  | BudgetUpdateEvent
  | MultiplierUpdateEvent;

export interface SessionStatusEvent {
  type: "session.status";
  status: "starting" | "ready" | "running" | "waiting_approval" | "stopped" | "error";
  reason?: string;
}

export interface MessageCreatedEvent {
  type: "message.created";
  messageId: string;
  role: "user" | "assistant" | "system" | "tool";
  createdAt: number;
  metadata?: Json;
}

export interface MessageDeltaEvent {
  type: "message.delta";
  messageId: string;
  deltaText: string;
  deltaTokens?: number;
  finishReason?: "stop" | "length" | "tool_calls" | "error";
}

export interface MessageCompletedEvent {
  type: "message.completed";
  messageId: string;
  fullText: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    estimatedUsd?: number;
  };
}

export type ToolCallName =
  | "run_command"
  | "write_to_file"
  | "apply_patch"
  | "git_operation"
  | "read_file"
  | "search_corpus"
  | "ast_index"
  | "symbol_references"
  | "verify_tests"
  | "generate_wiki"
  | "generate_cards"
  | "impact_analysis";

export type ToolRiskLevel = "read" | "mutate" | "destructive";

export type ToolCallState =
  | "proposed"
  | "awaiting_approval"
  | "approved"
  | "denied"
  | "running"
  | "streaming"
  | "verifying"
  | "success"
  | "failure"
  | "cancelled"
  | "timeout";

export interface ToolCallSummary {
  id: string;
  name: ToolCallName;
  risk: ToolRiskLevel;
  title: string;
  summary: string;
  command?: string;
  cwd?: string;
  filePath?: string;
  patchRef?: string;
  gitRef?: string;
  estimatedTokens?: number;
  estimatedUsd?: number;
  impacts?: string[];
  verificationPlan?: string[];
}

export interface ToolProposedEvent {
  type: "tool.proposed";
  call: ToolCallSummary;
}

export interface ToolStateEvent {
  type: "tool.state";
  callId: string;
  state: ToolCallState;
  progress?: {
    phase: string;
    percent?: number;
    message?: string;
  };
  outputDelta?: string;
  result?: Json;
  error?: {
    message: string;
    code?: string;
  };
}

export interface VerificationReportEvent {
  type: "verification.report";
  callId?: string;
  gate: string;
  status: "pass" | "fail" | "warn" | "skipped";
  details: Json;
}

export interface ImpactReportEvent {
  type: "impact.report";
  callId?: string;
  blastRadius: {
    direct: string[];
    indirect: string[];
    confidence: number;
  };
}

export interface CitationEvent {
  type: "citation.report";
  messageId: string;
  citations: Array<{
    id: string;
    label: string;
    path?: string;
    symbol?: string;
    lineStart?: number;
    lineEnd?: number;
    url?: string;
  }>;
}

export interface BudgetUpdateEvent {
  type: "budget.update";
  tokensUsed: number;
  tokensBudget: number;
  estimatedUsd: number;
  usdBudget?: number;
  multiplier: MultiplierLevel;
}

export interface MultiplierUpdateEvent {
  type: "multiplier.update";
  multiplier: MultiplierLevel;
  reason?: string;
}

export interface DesktopApi {
  agent: AgentApi;
  pty: PtyApi;
  workspace: WorkspaceApi;
  tools: ToolsApi;
  window: WindowApi;
}

export interface AgentApi {
  connect(sessionId: string): Promise<IpcResult<AgentConnectionInfo>>;
  createSession(input: CreateAgentSessionInput): Promise<IpcResult<AgentSessionInfo>>;
  listSessions(): Promise<IpcResult<AgentSessionSummary[]>>;
  restoreSession(sessionId: string): Promise<IpcResult<AgentSessionInfo>>;
  sendMessage(input: AgentMessageInput): Promise<IpcResult<{ messageId: string }>>;
  stop(sessionId: string, reason?: string): Promise<IpcResult<void>>;
  setMultiplier(sessionId: string, multiplier: MultiplierLevel): Promise<IpcResult<void>>;
  setProvider(sessionId: string, provider: ProviderSelection): Promise<IpcResult<void>>;

  /**
   * Event subscription is backed by a MessagePort where possible.
   * The renderer receives batched envelopes, not one callback per token.
   */
  onEvent(cb: (envelope: AgentEventEnvelope) => void): Unsubscribe;

  /**
   * Flow control from renderer to engine.
   */
  ackEvents(ack: EventAck): void;
}

export interface CreateAgentSessionInput {
  workspaceRoot: string;
  providerId: string;
  modelId: string;
  multiplier: MultiplierLevel;
  budget?: {
    maxTokens?: number;
    maxUsd?: number;
  };
  policies?: {
    autoApproveReadOnlyTools: boolean;
    autoApproveSearchTools: boolean;
    requireApprovalForMutations: boolean;
  };
}

export interface AgentSessionInfo {
  sessionId: string;
  workspaceRoot: string;
  providerId: string;
  modelId: string;
  multiplier: MultiplierLevel;
  status: "starting" | "ready" | "error";
}

export interface AgentSessionSummary {
  sessionId: string;
  title?: string;
  updatedAt: number;
  workspaceRoot: string;
}

export interface AgentMessageInput {
  sessionId: string;
  text: string;
  attachments?: Array<{
    kind: "file" | "symbol" | "card" | "diff";
    ref: string;
  }>;
}

export interface ProviderSelection {
  providerId: string;
  modelId: string;
  baseUrl?: string;
}

export interface PtyApi {
  create(opts: PtyCreateOptions): Promise<IpcResult<PtyCreateResult>>;
  write(sessionId: string, data: string): void;
  resize(sessionId: string, cols: number, rows: number): Promise<IpcResult<void>>;
  close(sessionId: string): Promise<IpcResult<void>>;
  onOutput(cb: (output: PtyOutput) => void): Unsubscribe;
  onExit(cb: (info: PtyExit) => void): Unsubscribe;
  ack(sessionId: string, seq: number, bytes: number): void;
}

export interface PtyCreateOptions {
  cols: number;
  rows: number;
  cwd?: string;
  shell?: string;
  profile?: "default" | "build" | "test" | "git";
}

export interface PtyCreateResult {
  sessionId: string;
  pid: number;
  shell: string;
  cwd: string;
}

export interface PtyOutput {
  sessionId: string;
  seq: number;
  data: string;
  bytes: number;
}

export interface PtyExit {
  sessionId: string;
  exitCode: number;
  signal?: string;
}

export interface WorkspaceApi {
  openDialog(): Promise<IpcResult<WorkspaceMeta>>;
  current(): Promise<IpcResult<WorkspaceMeta | null>>;
  tree(path: string, depth?: number): Promise<IpcResult<WorkspaceTreeNode[]>>;
  readFile(path: string): Promise<IpcResult<WorkspaceFileContent>>;
  stat(path: string): Promise<IpcResult<WorkspaceStat>>;
  search(query: string, opts?: WorkspaceSearchOptions): Promise<IpcResult<WorkspaceSearchResult[]>>;
  watch(path: string, cb: (event: WorkspaceWatchEvent) => void): Unsubscribe;
}

export interface WorkspaceMeta {
  root: string;
  name: string;
  trusted: boolean;
}

export interface WorkspaceTreeNode {
  path: string;
  name: string;
  type: "file" | "directory";
  children?: WorkspaceTreeNode[];
  ignored?: boolean;
  risk?: "none" | "low" | "high";
}

export interface WorkspaceFileContent {
  path: string;
  content: string;
  encoding: "utf8";
  size: number;
  mtime: number;
}

export interface WorkspaceStat {
  path: string;
  type: "file" | "directory";
  size: number;
  mtime: number;
}

export interface WorkspaceSearchOptions {
  limit?: number;
  includeIgnored?: boolean;
}

export interface WorkspaceSearchResult {
  path: string;
  score: number;
  excerpt?: string;
}

export interface WorkspaceWatchEvent {
  path: string;
  kind: "created" | "changed" | "deleted";
}

export interface ToolsApi {
  onApprovalRequest(cb: (request: DestructiveApprovalRequest) => void): Unsubscribe;
  resolveApproval(resolution: ApprovalResolution): Promise<IpcResult<void>>;
  getPolicies(): Promise<IpcResult<ToolPolicy[]>>;
  setPolicy(policy: ToolPolicy): Promise<IpcResult<void>>;
  getAuditLog(limit?: number): Promise<IpcResult<AuditEntry[]>>;
}

export type DestructiveToolKind =
  | "run_command"
  | "write_to_file"
  | "apply_patch"
  | "git_operation";

export interface DestructiveApprovalRequest {
  requestId: string;
  sessionId: string;
  toolCallId: string;
  kind: DestructiveToolKind;
  risk: ToolRiskLevel;
  title: string;
  description: string;
  command?: string;
  cwd?: string;
  filePath?: string;
  diffRef?: string;
  patchChecksum?: string;
  timeoutMs: number;
  createdAt: number;
  focus: "deny" | "diff";
}

export interface ApprovalResolution {
  requestId: string;
  decision: "allow_once" | "allow_session" | "deny" | "modify";
  reason?: string;
  modifications?: {
    acceptedHunkIds?: string[];
    rejectedHunkIds?: string[];
    finalPatch?: string;
  };
}

export interface ToolPolicy {
  id: string;
  tool: ToolCallName | "*";
  risk: ToolRiskLevel | "*";
  action: "ask" | "allow_session" | "deny";
  match?: {
    commandPrefix?: string;
    pathPrefix?: string;
  };
}

export interface AuditEntry {
  id: string;
  at: number;
  sessionId?: string;
  toolCallId?: string;
  kind: DestructiveToolKind | "policy_change";
  decision: "allow_once" | "allow_session" | "deny" | "modify" | "timeout";
  summary: string;
}

export interface WindowApi {
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  onMaximizeChange(cb: (maximized: boolean) => void): Unsubscribe;
}

declare global {
  interface Window {
    api: DesktopApi;
  }
}
```

---

## 1.6 IPC Channels

Use explicit namespaced channels.

### Control-plane invoke channels

```text
window:minimize
window:maximize
window:close
window:isMaximized

workspace:openDialog
workspace:current
workspace:tree
workspace:readFile
workspace:stat
workspace:search

agent:createSession
agent:listSessions
agent:restoreSession
agent:sendMessage
agent:stop
agent:setMultiplier
agent:setProvider
agent:connect

pty:create
pty:resize
pty:close

tools:approval:resolve
tools:policies:get
tools:policies:set
tools:audit:get
```

### Fire-and-forget high-frequency channels

```text
pty:write
pty:ack
agent:ackEvents
```

### Main-to-renderer event channels

```text
agent:event
pty:output
pty:exit
tools:approval:request
workspace:watch
window:maximizeChanged
engine:state
```

When using direct MessagePort data plane, `agent:event` becomes a port message rather than a `webContents.send` channel, but the renderer-facing API remains identical.

---

## 1.7 Streaming Buffering & Backpressure Strategy

This is the critical 60 FPS architecture.

### A. Engine-side coalescing

Kaiopi should not emit every token as an individual IPC message.

Use an event coalescer in the utility process.

Batching rules:

| Event class | batching behavior |
|---|---|
| token deltas | coalesce aggressively |
| tool output logs | coalesce, cap, tail-sample |
| session status | immediate |
| tool state transitions | immediate |
| approval requests | immediate |
| budget/multiplier changes | immediate |
| verification gates | immediate |
| citations | immediate or batched with message completion |

Recommended batch envelope limits:

```ts
const AGENT_BATCH_WINDOW_MS = 16;
const AGENT_BATCH_MAX_EVENTS = 256;
const AGENT_BATCH_MAX_BYTES = 256 * 1024;
```

Token deltas are merged:

```ts
// pseudo
if (lastEvent.type === "message.delta" && nextEvent.type === "message.delta" && lastEvent.messageId === nextEvent.messageId) {
  lastEvent.deltaText += nextEvent.deltaText;
} else {
  batch.push(nextEvent);
}
```

### B. Sequence numbers and resume

Each session stream has:

```ts
seq: number;
cursor: string;
```

If renderer reloads or disconnects:

1. renderer calls `agent.connect(sessionId)`
2. main/engine returns last cursor
3. renderer may request replay after cursor
4. engine replays persisted session events or compacted state snapshot

This makes reloads resilient.

### C. Flow control

Renderer sends:

```ts
window.api.agent.ackEvents({
  sessionId,
  lastSeq,
  receivedBytes,
  busyLevel
});
```

`busyLevel` meanings:

| busyLevel | condition | engine response |
|---:|---|---|
| 0 | healthy | normal batching |
| 1 | frame time > 24ms sustained | increase batch window to 32ms, drop verbose progress |
| 2 | frame time > 48ms sustained | increase batch window to 64ms, collapse tool logs, pause non-critical indexing |

Engine watermarks:

```ts
const OUTSTANDING_HIGH_WATER_BYTES = 2 * 1024 * 1024;
const OUTSTANDING_LOW_WATER_BYTES = 512 * 1024;
```

If outstanding unacknowledged bytes exceed high water:

- pause LLM stream reader if provider supports backpressure
- pause tool output producers
- continue state transitions

Resume below low water.

### D. Renderer-side batching

The renderer must not apply each envelope synchronously if multiple arrive in the same frame.

Use a `requestAnimationFrame` queue:

```ts
let pending: AgentEvent[] = [];
let scheduled = false;

export function ingestAgentEnvelope(envelope: AgentEventEnvelope) {
  pending.push(...envelope.events);

  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(flushAgentEvents);
  }
}

function flushAgentEvents() {
  scheduled = false;
  const events = pending;
  pending = [];
  applyAgentEvents(events);
}
```

### E. React render isolation

For active assistant message:

- store streaming text in external cache
- increment per-message version counter
- only the active message row subscribes to that version
- markdown parsing is deferred or workerized
- completed messages are immutable and memoized

This prevents token streaming from invalidating:

- session list
- file tree
- terminal
- diff inspector
- navigation rail

### F. Terminal backpressure

Terminal output uses independent limits:

```ts
const PTY_FLUSH_MS = 16;
const PTY_FLUSH_BYTES = 128 * 1024;
const PTY_HIGH_WATER_BYTES = 1024 * 1024;
const PTY_LOW_WATER_BYTES = 256 * 1024;
```

Main process:

- buffers node-pty output
- flushes every 16ms or at byte threshold
- pauses PTY if outstanding bytes exceed high water
- resumes after renderer acknowledges xterm write

Renderer:

```ts
term.write(chunk, () => {
  window.api.pty.ack(sessionId, seq, bytes);
});
```

This keeps terminal I/O smooth even during `cat largefile`, test runs, or verbose builds.

---

## 1.8 Security Sandbox Requirements

### BrowserWindow configuration

```ts
new BrowserWindow({
  show: false,
  frame: false,
  titleBarStyle: "hidden",
  backgroundColor: "#0a0b0e",
  webPreferences: {
    preload: join(__dirname, "../preload/index.js"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    spellcheck: false,
    devTools: !app.isPackaged
  }
});
```

### Navigation lockdown

```ts
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
});
```

### IPC sender validation

Every IPC handler should verify the sender frame.

```ts
function assertTrustedSender(event: Electron.IpcMainInvokeEvent) {
  const url = event.senderFrame?.url;
  if (!url) throw new Error("Unauthorized IPC sender");

  const parsed = new URL(url);

  const isDevLocalhost =
    !app.isPackaged &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");

  const isAppProtocol = parsed.protocol === "kaioken:";

  if (!isDevLocalhost && !isAppProtocol) {
    throw new Error("Unauthorized IPC origin");
  }
}
```

### Path sandbox

All workspace paths must be resolved and contained:

```ts
function assertInsideWorkspace(root: string, target: string) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(resolvedRoot, target);

  if (!resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    throw new Error("PATH_DENIED");
  }

  return resolvedTarget;
}
```

### Secrets

Provider keys:

- stored in Electron `safeStorage`
- decrypted only in main
- injected into engine runtime
- never sent to renderer
- redacted from logs and approval payloads

---

# Part 2 — Complete Project File Tree & Component Hierarchy

---

## 2.1 Recommended Directory Structure

Assuming existing initialized app in:

```text
desktop/
```

Recommended structure:

```text
desktop/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── electron-builder.yml
├── .env.example
├── resources/
│   ├── icons/
│   ├── fonts/
│   └── splash/
├── scripts/
│   ├── rebuild-native.ts
│   ├── generate-ipc-types.ts
│   └── benchmark-ipc.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
├── src/
│   ├── shared/
│   │   ├── constants.ts
│   │   ├── result.ts
│   │   ├── types/
│   │   │   ├── ipc.ts
│   │   │   ├── agent.ts
│   │   │   ├── pty.ts
│   │   │   ├── workspace.ts
│   │   │   ├── tools.ts
│   │   │   ├── diff.ts
│   │   │   ├── graph.ts
│   │   │   └── wiki.ts
│   │   └── schema/
│   │       ├── ipc.zod.ts
│   │       ├── agent.zod.ts
│   │       └── workspace.zod.ts
│   │
│   ├── main/
│   │   ├── index.ts
│   │   ├── app/
│   │   │   ├── lifecycle.ts
│   │   │   ├── window.ts
│   │   │   ├── menu.ts
│   │   │   ├── shortcuts.ts
│   │   │   ├── protocol.ts
│   │   │   ├── security.ts
│   │   │   ├── secrets.ts
│   │   │   └── updater.ts
│   │   ├── ipc/
│   │   │   ├── index.ts
│   │   │   ├── agent.ts
│   │   │   ├── pty.ts
│   │   │   ├── workspace.ts
│   │   │   ├── tools.ts
│   │   │   └── window.ts
│   │   ├── engine/
│   │   │   ├── supervisor.ts
│   │   │   ├── rpc.ts
│   │   │   ├── flow-control.ts
│   │   │   ├── heartbeat.ts
│   │   │   └── port-broker.ts
│   │   ├── pty/
│   │   │   ├── manager.ts
│   │   │   ├── session.ts
│   │   │   ├── shell.ts
│   │   │   └── flow.ts
│   │   ├── workspace/
│   │   │   ├── guard.ts
│   │   │   ├── fs.ts
│   │   │   ├── watcher.ts
│   │   │   ├── search.ts
│   │   │   └── ignore.ts
│   │   ├── tools/
│   │   │   ├── gateway.ts
│   │   │   ├── policy.ts
│   │   │   ├── audit.ts
│   │   │   └── redaction.ts
│   │   └── kaioken/
│   │       ├── serve-bridge.ts
│   │       ├── index-bridge.ts
│   │       ├── verify-bridge.ts
│   │       └── gitops-bridge.ts
│   │
│   ├── preload/
│   │   ├── index.ts
│   │   ├── agent.ts
│   │   ├── pty.ts
│   │   ├── workspace.ts
│   │   ├── tools.ts
│   │   └── window.ts
│   │
│   ├── engine/
│   │   ├── entry.ts
│   │   ├── supervisor.ts
│   │   ├── adapters/
│   │   │   ├── chord-bridge.ts
│   │   │   ├── kaiopi-sessions.ts
│   │   │   ├── tool-gateway-client.ts
│   │   │   └── provider-vault.ts
│   │   ├── services/
│   │   │   ├── agent-service.ts
│   │   │   ├── workspace-service.ts
│   │   │   ├── verification-service.ts
│   │   │   ├── index-service.ts
│   │   │   ├── search-service.ts
│   │   │   ├── graph-service.ts
│   │   │   ├── wiki-service.ts
│   │   │   ├── cards-service.ts
│   │   │   └── modelport-service.ts
│   │   └── workers/
│   │       ├── index.worker.ts
│   │       ├── search.worker.ts
│   │       ├── verify.worker.ts
│   │       └── impact.worker.ts
│   │
│   └── renderer/
│       ├── index.html
│       ├── main.tsx
│       ├── app/
│       │   ├── App.tsx
│       │   ├── router.tsx
│       │   ├── hotkeys.ts
│       │   └── providers.tsx
│       ├── styles/
│       │   ├── tokens.css
│       │   ├── tailwind.css
│       │   ├── hud.css
│       │   ├── terminal.css
│       │   └── codemirror.css
│       ├── components/
│       │   ├── shell/
│       │   │   ├── AppShell.tsx
│       │   │   ├── TitleBar.tsx
│       │   │   ├── NavRail.tsx
│       │   │   ├── SplitViewport.tsx
│       │   │   ├── InspectorPanel.tsx
│       │   │   └── TerminalDrawer.tsx
│       │   ├── chat/
│       │   │   ├── ChatSurface.tsx
│       │   │   ├── SessionList.tsx
│       │   │   ├── AgentStream.tsx
│       │   │   ├── MessageRow.tsx
│       │   │   ├── StreamingMarkdown.tsx
│       │   │   ├── ToolCard.tsx
│       │   │   ├── ToolOutputLog.tsx
│       │   │   ├── CitationChips.tsx
│       │   │   ├── Composer.tsx
│       │   │   └── MultiplierDial.tsx
│       │   ├── approval/
│       │   │   ├── ApprovalModal.tsx
│       │   │   ├── ApprovalCountdown.tsx
│       │   │   └── DestructiveFocusTrap.tsx
│       │   ├── terminal/
│       │   │   ├── TerminalPane.tsx
│       │   │   ├── TerminalTabs.tsx
│       │   │   └── TerminalStatusBar.tsx
│       │   ├── explorer/
│       │   │   ├── FileTree.tsx
│       │   │   ├── FileTreeNode.tsx
│       │   │   └── ExplorerToolbar.tsx
│       │   ├── diff/
│       │   │   ├── DiffInspector.tsx
│       │   │   ├── DiffFileList.tsx
│       │   │   ├── DiffHunkView.tsx
│       │   │   ├── DiffSplitPane.tsx
│       │   │   ├── HunkActionBar.tsx
│       │   │   └── DiffApplyBar.tsx
│       │   ├── graph/
│       │   │   ├── CodemapSurface.tsx
│       │   │   ├── GraphCanvas.tsx
│       │   │   ├── GraphInspector.tsx
│       │   │   └── SymbolRefList.tsx
│       │   ├── wiki/
│       │   │   ├── WikiSurface.tsx
│       │   │   ├── WikiOutline.tsx
│       │   │   └── MermaidBlock.tsx
│       │   ├── cards/
│       │   │   ├── CardsSurface.tsx
│       │   │   ├── CardGrid.tsx
│       │   │   └── CardEditor.tsx
│       │   ├── cost/
│       │   │   ├── CostLedgerSurface.tsx
│       │   │   ├── SpendChart.tsx
│       │   │   └── BudgetGauge.tsx
│       │   ├── settings/
│       │   │   ├── SettingsSurface.tsx
│       │   │   ├── ProviderSettings.tsx
│       │   │   ├── PolicySettings.tsx
│       │   │   └── KeybindingSettings.tsx
│       │   ├── command-palette/
│       │   │   ├── CommandPalette.tsx
│       │   │   └── OmniboxResultList.tsx
│       │   └── hud/
│       │   │   ├── HudCorners.tsx
│       │   │   ├── ScanlineOverlay.tsx
│       │   │   ├── EnergyPulse.tsx
│       │   │   └── AuraSweep.tsx
│       ├── stores/
│       │   ├── ui.ts
│       │   ├── session.ts
│       │   ├── agent-events.ts
│       │   ├── tool.ts
│       │   ├── approval.ts
│       │   ├── terminal.ts
│       │   ├── explorer.ts
│       │   ├── diff.ts
│       │   ├── graph.ts
│       │   ├── wiki.ts
│       │   ├── cards.ts
│       │   ├── cost.ts
│       │   └── settings.ts
│       ├── hooks/
│       │   ├── useAgentSession.ts
│       │   ├── useMessageText.ts
│       │   ├── useTerminalSession.ts
│       │   ├── useHotkeys.ts
│       │   ├── useVirtualList.ts
│       │   └── useDiffReview.ts
│       ├── lib/
│       │   ├── ipc-client.ts
│       │   ├── event-batcher.ts
│       │   ├── flow-control.ts
│       │   ├── markdown.ts
│       │   ├── mermaid.ts
│       │   ├── shiki.ts
│       │   ├── diff.ts
│       │   ├── format.ts
│       │   ├── codemirror/
│       │   │   ├── base.ts
│       │   │   ├── diff-decorations.ts
│       │   │   └── languages.ts
│       │   └── virtualization/
│       │       ├── message-list.ts
│       │       └── tool-log.ts
│       └── workers/
│           ├── markdown.worker.ts
│           ├── diff.worker.ts
│           └── graph-layout.worker.ts
```

---

## 2.2 Primary Navigation Surfaces

Use a left navigation rail with 7 surfaces.

| Shortcut | Surface | Purpose |
|---|---|---|
| `Ctrl+1` | Chat | Agent session stream, composer, tool cards |
| `Ctrl+2` | Research | Search corpus, plan decomposition, evidence dossiers |
| `Ctrl+3` | Wiki | Generated repo documentation, Mermaid diagrams |
| `Ctrl+4` | Codemap Graph | AST symbol graph, dependency graph, impact graph |
| `Ctrl+5` | Cards | Atomic knowledge cards |
| `Ctrl+6` | Cost Ledger | ModelPort spend, budgets, multiplier history |
| `Ctrl+7` | Settings | Providers, policies, keybindings, appearance |

Global accelerators:

```text
Ctrl+K        Omnibox / command palette
Ctrl+`        Toggle terminal drawer
Ctrl+B        Toggle inspector panel
Ctrl+Shift+P  Command palette (alternate)
Ctrl+Tab      Next surface
Ctrl+Shift+Tab Previous surface
Esc           Close modal / palette / drawer
```

---

## 2.3 Component Hierarchy

```tsx
<App>
  <TitleBar />
  <HudStateLayer />

  <AppShell>
    <NavRail />

    <SplitViewport>
      <PrimarySurfaceRouter>
        <ChatSurface>
          <SessionList />
          <AgentStream>
            <MessageRow />
            <ToolCard />
            <CitationChips />
          </AgentStream>
          <Composer />
          <MultiplierDial />
        </ChatSurface>

        <ResearchSurface />
        <WikiSurface />
        <CodemapSurface />
        <CardsSurface />
        <CostLedgerSurface />
        <SettingsSurface />
      </PrimarySurfaceRouter>

      <InspectorPanel>
        <InspectorTabs>
          <DiffInspector />
          <FileTree />
          <GraphPreview />
          <MermaidPreview />
          <SymbolPanel />
        </InspectorTabs>
      </InspectorPanel>
    </SplitViewport>

    <TerminalDrawer>
      <TerminalTabs />
      <TerminalPane />
      <TerminalStatusBar />
    </TerminalDrawer>
  </AppShell>

  <ApprovalModal />
  <CommandPalette />
  <ToastCenter />
</App>
```

---

## 2.4 State Store Partitioning

Recommended store boundaries:

```ts
uiStore
  activeSurface
  inspectorTab
  terminalOpen
  paletteOpen
  layoutPanes
  hudState

sessionStore
  sessions
  activeSessionId
  connectionState
  provider
  model

agentStreamStore
  message metadata
  active streaming message IDs
  tool call index
  event cursor

toolStore
  tool call states
  tool logs ring buffers
  verification reports
  impact reports

approvalStore
  pending approval request
  countdown
  focus target
  decision draft

terminalStore
  terminal sessions metadata
  active terminal ID
  shell profiles
  running state

explorerStore
  workspace root
  expanded nodes
  selected node
  tree cache

diffStore
  active diff review
  files
  hunks
  decisions
  final patch preview

graphStore
  active graph source
  nodes
  edges
  filters
  selected symbol

wikiStore
  pages
  outline
  mermaid render cache

cardsStore
  cards
  filters
  edit state

costStore
  budgets
  ledger entries
  multiplier history

settingsStore
  provider configs
  policies
  keymaps
  appearance
```

Important rule:

> Terminal output and streaming token text are not stored as ordinary React state trees. They are stored in external caches and selectively subscribed.

---

# Part 3 — Core Implementation Deep-Dive

---

# 3.1 The PTY & Terminal Bridge

This is one of the most performance-sensitive subsystems.

The architecture is:

```text
xterm.js input
  -> window.api.pty.write
  -> preload ipcRenderer.send
  -> main PTY manager
  -> node-pty.write

node-pty output
  -> main PTY session buffer
  -> batched flush every 16ms or byte threshold
  -> renderer preload
  -> xterm.write
  -> ack back to main
```

---

## 3.1.1 Main process: `src/main/ipc/pty.ts`

```ts
// src/main/ipc/pty.ts
import { BrowserWindow, ipcMain } from "electron";
import * as pty from "node-pty";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import {
  PtyCreateOptions,
  PtyCreateResult,
  PtyOutput,
  PtyExit,
  IpcResult
} from "../../shared/types/ipc";

const OUTPUT_FLUSH_MS = 16;
const OUTPUT_FLUSH_BYTES = 128 * 1024;
const FLOW_HIGH_WATER_BYTES = 1024 * 1024;
const FLOW_LOW_WATER_BYTES = 256 * 1024;

interface PtySession {
  id: string;
  proc: pty.IPty;
  shell: string;
  cwd: string;
  seq: number;
  buffer: string[];
  bufferBytes: number;
  outstandingBytes: number;
  paused: boolean;
  flushTimer?: NodeJS.Timeout;
}

const sessions = new Map<string, PtySession>();
let mainWindow: BrowserWindow | null = null;

function resolveDefaultShell(): string {
  if (process.platform === "win32") {
    return process.env.COMSPEC || "cmd.exe";
  }
  return process.env.SHELL || "/bin/bash";
}

function sanitizeCwd(inputCwd?: string): string {
  const root = getCurrentWorkspaceRoot(); // implemented by workspace guard
  const cwd = inputCwd ? path.resolve(root, inputCwd) : root;

  if (!cwd.startsWith(path.resolve(root) + path.sep) && cwd !== path.resolve(root)) {
    throw new Error("PATH_DENIED");
  }

  return cwd;
}

function getCurrentWorkspaceRoot(): string {
  // Replace with real workspace state lookup.
  // For first boot, fallback to home directory is possible,
  // but production should require an opened workspace before PTY creation.
  return globalThis.__KAIOKEN_WORKSPACE_ROOT__ || os.homedir();
}

function buildEnv(): Record<string, string> {
  return {
    PATH: process.env.PATH || "",
    HOME: process.env.HOME || os.homedir(),
    USERPROFILE: process.env.USERPROFILE || os.homedir(),
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    KAIKEN_DESKTOP: "1"
  };
}

function scheduleFlush(session: PtySession) {
  if (session.flushTimer) return;

  session.flushTimer = setTimeout(() => {
    flushSessionOutput(session);
  }, OUTPUT_FLUSH_MS);
}

function flushSessionOutput(session: PtySession) {
  if (session.flushTimer) {
    clearTimeout(session.flushTimer);
    session.flushTimer = undefined;
  }

  if (!session.buffer.length || !mainWindow || mainWindow.isDestroyed()) {
    session.buffer = [];
    session.bufferBytes = 0;
    return;
  }

  const data = session.buffer.join("");
  const bytes = session.bufferBytes;

  session.buffer = [];
  session.bufferBytes = 0;
  session.seq += 1;
  session.outstandingBytes += bytes;

  const payload: PtyOutput = {
    sessionId: session.id,
    seq: session.seq,
    data,
    bytes
  };

  mainWindow.webContents.send("pty:output", payload);

  if (session.outstandingBytes > FLOW_HIGH_WATER_BYTES && !session.paused) {
    session.paused = true;
    (session.proc as any).pause?.();
  }
}

function appendOutput(session: PtySession, data: string) {
  session.buffer.push(data);
  session.bufferBytes += Buffer.byteLength(data, "utf8");

  if (session.bufferBytes >= OUTPUT_FLUSH_BYTES) {
    flushSessionOutput(session);
  } else {
    scheduleFlush(session);
  }
}

function onAck(sessionId: string, bytes: number) {
  const session = sessions.get(sessionId);
  if (!session) return;

  session.outstandingBytes = Math.max(0, session.outstandingBytes - bytes);

  if (session.paused && session.outstandingBytes < FLOW_LOW_WATER_BYTES) {
    session.paused = false;
    (session.proc as any).resume?.();
  }
}

export function registerPtyIpc(win: BrowserWindow) {
  mainWindow = win;

  ipcMain.handle(
    "pty:create",
    async (_event, opts: PtyCreateOptions): Promise<IpcResult<PtyCreateResult>> => {
      try {
        const shell = opts.shell || resolveDefaultShell();
        const cwd = sanitizeCwd(opts.cwd);

        const proc = pty.spawn(shell, [], {
          name: "xterm-256color",
          cols: opts.cols || 80,
          rows: opts.rows || 24,
          cwd,
          env: buildEnv(),
          useConpty: process.platform === "win32"
        });

        const id = randomUUID();

        const session: PtySession = {
          id,
          proc,
          shell,
          cwd,
          seq: 0,
          buffer: [],
          bufferBytes: 0,
          outstandingBytes: 0,
          paused: false
        };

        sessions.set(id, session);

        proc.onData((data) => {
          appendOutput(session, data);
        });

        proc.onExit(({ exitCode, signal }) => {
          const payload: PtyExit = {
            sessionId: id,
            exitCode,
            signal: signal ? String(signal) : undefined
          };

          sessions.delete(id);

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("pty:exit", payload);
          }
        });

        return {
          ok: true,
          value: {
            sessionId: id,
            pid: proc.pid,
            shell,
            cwd
          }
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "PTY_ERROR",
            message: error instanceof Error ? error.message : String(error)
          }
        };
      }
    }
  );

  ipcMain.on("pty:write", (_event, sessionId: string, data: string) => {
    const session = sessions.get(sessionId);
    if (!session) return;
    session.proc.write(data);
  });

  ipcMain.handle(
    "pty:resize",
    async (_event, sessionId: string, cols: number, rows: number): Promise<IpcResult<void>> => {
      const session = sessions.get(sessionId);
      if (!session) {
        return {
          ok: false,
          error: { code: "NOT_FOUND", message: "PTY session not found" }
        };
      }

      session.proc.resize(cols, rows);
      return { ok: true, value: undefined };
    }
  );

  ipcMain.handle(
    "pty:close",
    async (_event, sessionId: string): Promise<IpcResult<void>> => {
      const session = sessions.get(sessionId);
      if (!session) {
        return {
          ok: false,
          error: { code: "NOT_FOUND", message: "PTY session not found" }
        };
      }

      session.proc.kill();
      sessions.delete(sessionId);
      return { ok: true, value: undefined };
    }
  );

  ipcMain.on("pty:ack", (_event, sessionId: string, _seq: number, bytes: number) => {
    onAck(sessionId, bytes);
  });
}
```

---

## 3.1.2 Preload: `src/preload/pty.ts`

```ts
// src/preload/pty.ts
import { ipcRenderer } from "electron";
import type {
  PtyApi,
  PtyCreateOptions,
  PtyCreateResult,
  PtyOutput,
  PtyExit,
  IpcResult,
  Unsubscribe
} from "../shared/types/ipc";

const outputListeners = new Set<(output: PtyOutput) => void>();
const exitListeners = new Set<(info: PtyExit) => void>();

ipcRenderer.on("pty:output", (_event, payload: PtyOutput) => {
  for (const listener of outputListeners) {
    listener(payload);
  }
});

ipcRenderer.on("pty:exit", (_event, payload: PtyExit) => {
  for (const listener of exitListeners) {
    listener(payload);
  }
});

export const ptyApi: PtyApi = {
  create(opts: PtyCreateOptions): Promise<IpcResult<PtyCreateResult>> {
    return ipcRenderer.invoke("pty:create", opts);
  },

  write(sessionId: string, data: string): void {
    ipcRenderer.send("pty:write", sessionId, data);
  },

  resize(sessionId: string, cols: number, rows: number): Promise<IpcResult<void>> {
    return ipcRenderer.invoke("pty:resize", sessionId, cols, rows);
  },

  close(sessionId: string): Promise<IpcResult<void>> {
    return ipcRenderer.invoke("pty:close", sessionId);
  },

  onOutput(cb: (output: PtyOutput) => void): Unsubscribe {
    outputListeners.add(cb);
    return () => outputListeners.delete(cb);
  },

  onExit(cb: (info: PtyExit) => void): Unsubscribe {
    exitListeners.add(cb);
    return () => exitListeners.delete(cb);
  },

  ack(sessionId: string, seq: number, bytes: number): void {
    ipcRenderer.send("pty:ack", sessionId, seq, bytes);
  }
};
```

---

## 3.1.3 Renderer: `src/renderer/components/terminal/TerminalPane.tsx`

```tsx
// src/renderer/components/terminal/TerminalPane.tsx
import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";

interface TerminalPaneProps {
  sessionId: string;
}

export function TerminalPane({ sessionId }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
      fontSize: 13,
      theme: {
        background: "#0a0b0e",
        foreground: "#d7dae0",
        cursor: "#00e5ff",
        selectionBackground: "rgba(0, 229, 255, 0.25)"
      },
      allowProposedApi: true,
      scrollback: 10_000
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);

    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        webgl.dispose();
      });
      term.loadAddon(webgl);
    } catch {
      // fallback to canvas renderer
    }

    fitAddon.fit();

    const unsubscribeOutput = window.api.pty.onOutput((output) => {
      if (output.sessionId !== sessionId) return;

      term.write(output.data, () => {
        window.api.pty.ack(sessionId, output.seq, output.bytes);
      });
    });

    const dataDisposable = term.onData((data) => {
      window.api.pty.write(sessionId, data);
    });

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      void window.api.pty.resize(sessionId, cols, rows);
    });

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fitAddon.fit();
      });
    });

    resizeObserver.observe(container);

    return () => {
      unsubscribeOutput();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [sessionId]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-[#0a0b0e] p-2"
      data-testid="terminal-pane"
    />
  );
}
```

### Production refinement

For multiple terminals and drawer toggling, do not destroy terminals every time the drawer hides.

Instead implement:

```text
src/renderer/lib/terminal/session-manager.ts
```

Responsibilities:

- create `Terminal` instances outside React
- attach/detach DOM element when pane mounts/unmounts
- preserve scrollback
- preserve WebGL context where possible
- dispose only when user closes terminal tab

---

# 3.2 Agent Stream & Tool Execution Engine

---

## 3.2.1 Event ingestion architecture

```text
Kaiopi utility process
  -> batched AgentEventEnvelope
  -> MessagePort / main broker
  -> preload
  -> renderer event-batcher
  -> rAF flush
  -> domain stores
  -> selective React subscriptions
```

---

## 3.2.2 Renderer event batcher

```ts
// src/renderer/lib/event-batcher.ts
import type { AgentEvent, AgentEventEnvelope } from "../../shared/types/ipc";
import { applyAgentEvents } from "../stores/agent-events";

let queue: AgentEvent[] = [];
let scheduled = false;

export function ingestAgentEnvelope(envelope: AgentEventEnvelope) {
  queue.push(...envelope.events);

  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(flush);
  }
}

function flush() {
  scheduled = false;

  const events = queue;
  queue = [];

  if (events.length === 0) return;

  applyAgentEvents(events);
}
```

---

## 3.2.3 External streaming text cache

This avoids re-rendering large portions of React tree on every token batch.

```ts
// src/renderer/stores/agent-events.ts
import { useSyncExternalStore } from "react";
import type { AgentEvent } from "../../shared/types/ipc";

const messageText = new Map<string, string>();
const messageVersion = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();

function notify(messageId: string) {
  const set = listeners.get(messageId);
  if (!set) return;
  for (const cb of set) cb();
}

export function appendMessageDelta(messageId: string, delta: string) {
  const current = messageText.get(messageId) ?? "";
  messageText.set(messageId, current + delta);
  messageVersion.set(messageId, (messageVersion.get(messageId) ?? 0) + 1);
  notify(messageId);
}

export function getMessageText(messageId: string): string {
  return messageText.get(messageId) ?? "";
}

function subscribeMessage(messageId: string, cb: () => void) {
  let set = listeners.get(messageId);
  if (!set) {
    set = new Set();
    listeners.set(messageId, set);
  }
  set.add(cb);

  return () => {
    set?.delete(cb);
  };
}

export function useMessageText(messageId: string): string {
  return useSyncExternalStore(
    (cb) => subscribeMessage(messageId, cb),
    () => getMessageText(messageId)
  );
}

export function applyAgentEvents(events: AgentEvent[]) {
  for (const event of events) {
    switch (event.type) {
      case "message.delta":
        appendMessageDelta(event.messageId, event.deltaText);
        break;

      case "tool.state":
        // update toolStore
        break;

      case "verification.report":
        // update toolStore verification panel
        break;

      case "budget.update":
        // update costStore
        break;

      case "multiplier.update":
        // update cost/session HUD
        break;

      default:
        break;
    }
  }
}
```

Then in a message component:

```tsx
function StreamingMessageText({ messageId }: { messageId: string }) {
  const text = useMessageText(messageId);
  return <div className="whitespace-pre-wrap">{text}</div>;
}
```

For markdown:

```tsx
const deferredText = useDeferredValue(text);
const html = useWorkerMarkdown(deferredText);
```

---

## 3.2.4 Tool card state machine

Tool cards are first-class knowledge artifacts.

States:

```text
proposed
awaiting_approval
approved
denied
running
streaming
verifying
success
failure
cancelled
timeout
```

Visual mapping:

| State | HUD treatment |
|---|---|
| proposed | neutral bracket corners |
| awaiting_approval | amber armed pulse |
| running | cyan energy dot |
| verifying | amber sweep |
| success | emerald border |
| failure | crimson border |
| denied | dimmed crimson outline |
| timeout | warning amber |

Card contents by tool type:

### `run_command`

- command line
- cwd
- environment redaction indicator
- live output tail
- exit code
- duration
- risk badge

### `write_to_file`

- target file path
- before/after summary
- mini diff
- open in Diff Inspector button

### `apply_patch`

- patch file list
- hunk count
- accepted/rejected hunk summary
- checksum
- open full diff button

### `git_operation`

- branch/worktree
- operation type
- guardrail status
- merge conflict risk
- affected paths

### `verify_tests`

- gate name
- pass/fail summary
- failing tests
- logs
- anti-hallucination grounding status

### `impact_analysis`

- direct blast radius
- indirect dependencies
- confidence score
- graph link

---

## 3.2.5 Tool card component sketch

```tsx
// src/renderer/components/chat/ToolCard.tsx
import { memo } from "react";
import { useToolCall } from "../../stores/tool";

interface ToolCardProps {
  callId: string;
}

export const ToolCard = memo(function ToolCard({ callId }: ToolCardProps) {
  const call = useToolCall(callId);
  if (!call) return null;

  return (
    <article
      className={`
        border border-cyan-500/20 bg-black/40 rounded-md p-3
        ${call.state === "success" ? "border-emerald-500/40" : ""}
        ${call.state === "failure" ? "border-red-500/40" : ""}
        ${call.state === "awaiting_approval" ? "border-amber-500/60" : ""}
      `}
    >
      <header className="flex items-center justify-between gap-3">
        <h3 className="text-sm text-cyan-300">{call.title}</h3>
        <ToolStateBadge state={call.state} />
      </header>

      <p className="text-xs text-zinc-400 mt-1">{call.summary}</p>

      {call.command && (
        <pre className="mt-2 text-xs text-amber-300 bg-black/60 p-2 rounded overflow-auto">
          {call.command}
        </pre>
      )}

      {call.filePath && (
        <button onClick={() => openDiffInspector(call.filePath)}>
          Inspect diff
        </button>
      )}

      <ToolOutputLog callId={callId} />
    </article>
  );
});
```

Use virtualization for the message stream:

- TanStack Virtual or `react-virtuoso`
- stable message keys
- `content-visibility: auto`
- memoized rows
- overscan 8–12 rows

---

# 3.3 Destructive Gate & Security Sandbox

---

## 3.3.1 Approval handshake

```text
1. Kaiopi tool interceptor detects destructive tool intent.
2. Engine pauses execution and creates ApprovalRequest.
3. Engine sends tools.requestApproval RPC to Electron main.
4. Main policy engine checks:
   - risk level
   - workspace containment
   - command allowlist/denylist
   - secret redaction
   - user session policies
5. If not auto-approved, main stores pending request and emits tools:approval:request.
6. Renderer opens ApprovalModal.
7. Initial focus is Deny or diff body.
8. Countdown starts (default 300000ms).
9. User chooses:
   - Deny
   - Allow Once
   - Allow Session
   - Modify (for diff hunk accept/reject)
10. Renderer invokes tools:approval:resolve.
11. Main validates:
   - request still pending
   - not timed out
   - checksum unchanged
   - modifications valid
12. Main forwards decision to engine.
13. Engine resumes or cancels tool.
14. Main records immutable audit entry.
```

---

## 3.3.2 Approval modal safety rules

The modal must:

- trap focus
- initially focus **Deny**
- prevent Enter from approving
- allow Esc to deny
- show visible countdown
- auto-deny at timeout
- require explicit pointer or modified keypress for approval
- display redacted command and diff preview
- disable approve if patch checksum changed mid-review

Recommended key behavior:

```text
Enter        Deny
Esc          Deny
Ctrl+Enter   Allow Once (only if enabled by policy)
Alt+D        Focus diff body
Alt+A        Focus allow button
```

For extremely destructive operations, optionally require:

- scrolling to bottom of diff
- typing workspace name
- explicit checkbox: “I understand this modifies files”

---

## 3.3.3 Main gateway skeleton

```ts
// src/main/tools/gateway.ts
import { randomUUID } from "node:crypto";
import type {
  DestructiveApprovalRequest,
  ApprovalResolution,
  AuditEntry
} from "../../shared/types/ipc";

const pending = new Map<string, {
  request: DestructiveApprovalRequest;
  timer: NodeJS.Timeout;
  resolve: (resolution: ApprovalResolution) => void;
}>();

export function requestDestructiveApproval(
  request: Omit<DestructiveApprovalRequest, "requestId" | "createdAt" | "timeoutMs" | "focus">,
  timeoutMs = 300_000
): Promise<ApprovalResolution> {
  const requestId = randomUUID();

  const fullRequest: DestructiveApprovalRequest = {
    ...request,
    requestId,
    createdAt: Date.now(),
    timeoutMs,
    focus: request.kind === "apply_patch" ? "diff" : "deny"
  };

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const entry = pending.get(requestId);
      if (!entry) return;

      pending.delete(requestId);
      recordAudit({
        decision: "timeout",
        request: fullRequest
      });

      resolve({
        requestId,
        decision: "deny",
        reason: "timeout"
      });
    }, timeoutMs);

    pending.set(requestId, {
      request: fullRequest,
      timer,
      resolve
    });

    sendToRenderer("tools:approval:request", fullRequest);
  });
}

export function resolveDestructiveApproval(resolution: ApprovalResolution): boolean {
  const entry = pending.get(resolution.requestId);
  if (!entry) return false;

  clearTimeout(entry.timer);
  pending.delete(resolution.requestId);

  recordAudit({
    decision: resolution.decision,
    request: entry.request,
    reason: resolution.reason
  });

  entry.resolve(resolution);
  return true;
}

function sendToRenderer(channel: string, payload: unknown) {
  // main window webContents.send
}

function recordAudit(input: {
  decision: ApprovalResolution["decision"] | "timeout";
  request: DestructiveApprovalRequest;
  reason?: string;
}) {
  const entry: AuditEntry = {
    id: randomUUID(),
    at: Date.now(),
    sessionId: input.request.sessionId,
    toolCallId: input.request.toolCallId,
    kind: input.request.kind,
    decision: input.decision,
    summary: input.request.title
  };

  // persist to audit store
}
```

---

# 3.4 Diff Review System

---

## 3.4.1 Requirements

The diff inspector must support:

- side-by-side diff
- syntax highlighting
- per-hunk accept/reject
- file-level accept/reject
- patch checksum validation
- large-file virtualization
- open from tool card or file tree
- produce a final modified patch for engine execution

---

## 3.4.2 Diff data flow

```text
Engine proposes apply_patch/write_to_file
  -> main stores patch artifact
  -> renderer receives diffRef
  -> diffStore requests diff payload from main
  -> diff worker parses unified patch / computes line diff
  -> diffStore builds hunks
  -> DiffInspector renders virtualized hunk cards
  -> user accepts/rejects hunks
  -> diffStore derives final patch
  -> ApprovalResolution.modifications.finalPatch sent to engine
  -> engine applies only approved patch
```

---

## 3.4.3 Diff store model

```ts
// src/renderer/stores/diff.ts

export type HunkDecision = "pending" | "accepted" | "rejected";

export interface DiffLine {
  id: string;
  type: "context" | "add" | "delete";
  oldLineNumber?: number;
  newLineNumber?: number;
  text: string;
}

export interface DiffHunk {
  id: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
  decision: HunkDecision;
}

export interface DiffFile {
  path: string;
  oldPath?: string;
  newPath?: string;
  hunks: DiffHunk[];
  status: "pending" | "approved" | "rejected" | "modified";
}

export interface DiffReviewState {
  diffRef: string;
  sessionId: string;
  toolCallId: string;
  patchChecksum: string;
  files: Record<string, DiffFile>;
  activeFilePath: string | null;
}
```

Derived selector:

```ts
function computeFinalPatch(state: DiffReviewState): string {
  // Serialize only accepted hunks into unified patch format.
  // Rejected hunks are omitted.
  // Modified hunks can be re-serialized from edited line sets if editing is enabled.
}
```

---

## 3.4.4 CodeMirror 6 implementation strategy

Two viable approaches:

### Approach A — Hunk cards with paired EditorViews

Recommended for per-hunk controls.

Each hunk renders:

```text
┌────────────────────────────────────────────────────────┐
│ Hunk header: @@ -12,7 +12,9 @@        [Accept] [Reject]│
├──────────────────────────┬─────────────────────────────┤
│ Original pane            │ Revised pane                │
│ CodeMirror read-only     │ CodeMirror read-only        │
└──────────────────────────┴─────────────────────────────┘
```

Advantages:

- simple accept/reject semantics
- easy virtualization
- clear visual mapping to agent patch hunks
- less risk than trying to mutate global merge view state

### Approach B — Global @codemirror/merge view

Useful for full-file review, but harder for per-hunk decisions.

Recommended hybrid:

- hunk cards for approval workflow
- optional “full file merge view” for final inspection

---

## 3.4.5 Hunk view sketch

```tsx
// src/renderer/components/diff/DiffHunkView.tsx
import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { basicSetup } from "codemirror";
import type { DiffHunk } from "../../stores/diff";
import { diffDecorations } from "../../lib/codemirror/diff-decorations";

interface DiffHunkViewProps {
  hunk: DiffHunk;
  filePath: string;
  onAccept: () => void;
  onReject: () => void;
}

export function DiffHunkView({ hunk, filePath, onAccept, onReject }: DiffHunkViewProps) {
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!leftRef.current || !rightRef.current) return;

    const leftDoc = hunk.lines
      .filter((line) => line.type !== "add")
      .map((line) => line.text)
      .join("\n");

    const rightDoc = hunk.lines
      .filter((line) => line.type !== "delete")
      .map((line) => line.text)
      .join("\n");

    const leftState = EditorState.create({
      doc: leftDoc,
      extensions: [
        basicSetup,
        lineNumbers(),
        EditorState.readOnly.of(true),
        diffDecorations(hunk, "left")
      ]
    });

    const rightState = EditorState.create({
      doc: rightDoc,
      extensions: [
        basicSetup,
        lineNumbers(),
        EditorState.readOnly.of(true),
        diffDecorations(hunk, "right")
      ]
    });

    const leftView = new EditorView({
      parent: leftRef.current,
      state: leftState
    });

    const rightView = new EditorView({
      parent: rightRef.current,
      state: rightState
    });

    return () => {
      leftView.destroy();
      rightView.destroy();
    };
  }, [hunk]);

  return (
    <section className="border border-zinc-800 rounded-md overflow-hidden">
      <header className="flex items-center justify-between bg-zinc-950 px-3 py-2">
        <code className="text-xs text-cyan-300">
          @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@ {filePath}
        </code>
        <div className="flex gap-2">
          <button onClick={onAccept} className="text-emerald-400">
            Accept
          </button>
          <button onClick={onReject} className="text-red-400">
            Reject
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2">
        <div ref={leftRef} className="border-r border-zinc-900" />
        <div ref={rightRef} />
      </div>
    </section>
  );
}
```

---

## 3.4.6 Accept/reject behavior

When user clicks accept:

```ts
diffStore.setHunkDecision(filePath, hunkId, "accepted");
```

When user clicks reject:

```ts
diffStore.setHunkDecision(filePath, hunkId, "rejected");
```

When approval is submitted:

```ts
await window.api.tools.resolveApproval({
  requestId,
  decision: "modify",
  modifications: {
    acceptedHunkIds,
    rejectedHunkIds,
    finalPatch
  }
});
```

Engine must treat this as:

> apply only the approved patch artifact, not the original proposed patch.

---

# Part 4 — Step-by-Step Implementation Roadmap

---

## Phase 1 — Secure Foundation & IPC Skeleton

### Goal

Establish a hardened Electron shell with strict isolation, frameless window, titlebar, IPC validation, and renderer preload API surface.

### Files to create/modify

```text
desktop/electron.vite.config.ts
desktop/src/main/index.ts
desktop/src/main/app/window.ts
desktop/src/main/app/security.ts
desktop/src/main/app/lifecycle.ts
desktop/src/main/app/protocol.ts
desktop/src/main/ipc/index.ts
desktop/src/main/ipc/window.ts

desktop/src/preload/index.ts
desktop/src/preload/window.ts

desktop/src/shared/types/ipc.ts
desktop/src/shared/schema/ipc.zod.ts

desktop/src/renderer/index.html
desktop/src/renderer/main.tsx
desktop/src/renderer/app/App.tsx
desktop/src/renderer/components/shell/TitleBar.tsx
desktop/src/renderer/styles/tokens.css
desktop/src/renderer/styles/tailwind.css

desktop/tests/e2e/security.spec.ts
desktop/tests/unit/ipc-schema.spec.ts
```

### Implementation tasks

1. Configure electron-vite for:
   - main
   - preload
   - renderer

2. Create frameless `BrowserWindow` with:
   - `contextIsolation: true`
   - `nodeIntegration: false`
   - `sandbox: true`
   - custom titlebar

3. Implement window controls:
   - minimize
   - maximize
   - close

4. Implement IPC sender validation middleware.

5. Implement Zod-validated echo endpoints for testing.

6. Add Tailwind v4 CSS tokens:

```css
:root {
  --color-void: #0a0b0e;
  --color-neon-cyan: #00e5ff;
  --color-amber: #ffb300;
  --color-orange: #ff6d00;
  --color-crimson: #ff1744;
  --color-emerald: #00e676;
}
```

7. Add navigation lockdown and permission denial.

### Acceptance criteria

- Renderer cannot access Node globals.
- `window.api.window.minimize()` works.
- IPC from untrusted origin is rejected.
- Invalid Zod payloads return structured `IpcError`.
- Titlebar buttons work on Windows/macOS/Linux.
- No CSP errors in production build.
- E2E test verifies `contextIsolation` and navigation lockdown.

---

## Phase 2 — Kaiopi Engine Supervisor & Event Pipeline

### Goal

Run Kaiopi in an isolated utility process and establish robust session lifecycle, heartbeat, restart, and batched event streaming.

### Files to create/modify

```text
desktop/src/engine/entry.ts
desktop/src/engine/supervisor.ts
desktop/src/engine/adapters/chord-bridge.ts
desktop/src/engine/adapters/kaiopi-sessions.ts

desktop/src/main/engine/supervisor.ts
desktop/src/main/engine/rpc.ts
desktop/src/main/engine/heartbeat.ts
desktop/src/main/engine/flow-control.ts
desktop/src/main/engine/port-broker.ts
desktop/src/main/ipc/agent.ts

desktop/src/preload/agent.ts

desktop/src/shared/types/agent.ts
desktop/src/shared/schema/agent.zod.ts

desktop/src/renderer/lib/event-batcher.ts
desktop/src/renderer/stores/session.ts
desktop/src/renderer/stores/agent-events.ts
desktop/src/renderer/hooks/useAgentSession.ts

desktop/tests/integration/engine-supervisor.spec.ts
desktop/tests/e2e/agent-stream.spec.ts
```

### Implementation tasks

1. Create engine entrypoint for utility process.

2. Implement `KaiopiEngineSupervisor` in main:
   - spawn utility process
   - heartbeat every 5 seconds
   - restart with exponential backoff
   - graceful shutdown
   - kill timeout after 5 seconds

3. Implement RPC envelope:

```ts
type RpcRequest = {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: unknown;
};

type RpcResponse = {
  jsonrpc: "2.0";
  id: string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
};

type RpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};
```

4. Implement session create/restore/send/stop.

5. Implement batched event envelope emission.

6. Implement sequence/cursor tracking.

7. Implement flow control acks.

8. Renderer subscribes via `window.api.agent.onEvent`.

9. Add synthetic benchmark endpoint for load testing.

### Acceptance criteria

- Engine utility process starts and reports ready.
- Killing engine process triggers automatic restart.
- App quit performs graceful engine shutdown.
- Mock LLM streaming 5,000 token deltas/sec remains smooth.
- Token deltas arrive in batched envelopes.
- No IPC handler throws on malformed events.
- Renderer can ack events and engine respects busyLevel.
- Event seq gaps are detected and recoverable.
- E2E test receives `message.delta` and `message.completed`.

### Performance targets

- Average IPC batch latency <= 20ms.
- No main-process long task > 50ms during synthetic stream.
- Renderer frame drops < 2% during 60-second flood test.

---

## Phase 3 — Workspace, File Tree, and Terminal Subsystem

### Goal

Enable trusted workspace opening, secure filesystem reads, file tree navigation, and a production-grade terminal drawer.

### Files to create/modify

```text
desktop/src/main/workspace/guard.ts
desktop/src/main/workspace/fs.ts
desktop/src/main/workspace/watcher.ts
desktop/src/main/workspace/ignore.ts
desktop/src/main/ipc/workspace.ts

desktop/src/main/pty/manager.ts
desktop/src/main/pty/session.ts
desktop/src/main/pty/shell.ts
desktop/src/main/ipc/pty.ts

desktop/src/preload/workspace.ts
desktop/src/preload/pty.ts

desktop/src/renderer/stores/explorer.ts
desktop/src/renderer/stores/terminal.ts

desktop/src/renderer/components/shell/AppShell.tsx
desktop/src/renderer/components/shell/NavRail.tsx
desktop/src/renderer/components/shell/SplitViewport.tsx
desktop/src/renderer/components/shell/TerminalDrawer.tsx

desktop/src/renderer/components/explorer/FileTree.tsx
desktop/src/renderer/components/explorer/FileTreeNode.tsx

desktop/src/renderer/components/terminal/TerminalPane.tsx
desktop/src/renderer/components/terminal/TerminalTabs.tsx
desktop/src/renderer/lib/terminal/session-manager.ts

desktop/tests/e2e/workspace.spec.ts
desktop/tests/e2e/pty.spec.ts
```

### Implementation tasks

1. Implement workspace open dialog and trust state.

2. Implement path sandbox guard.

3. Implement tree listing with lazy expansion.

4. Integrate `kaioken/scan` ignore/risk shielding later; initially support `.gitignore`.

5. Implement PTY manager with batching and flow control.

6. Implement terminal session metadata store.

7. Implement terminal drawer with `Ctrl+`` toggle.

8. Implement multi-tab terminals.

9. Implement resize synchronization.

10. Add terminal session manager to preserve terminals across hide/show.

### Acceptance criteria

- Opening a folder outside sandbox is impossible.
- File tree expands directories lazily.
- Ignored files are hidden by default.
- Terminal opens in workspace root.
- Resize correctly updates cols/rows.
- Fast output does not freeze UI.
- Multiple terminals can coexist.
- Toggling terminal drawer does not destroy terminal state.
- PTY session exits are reflected in UI.
- Path traversal attempt returns `PATH_DENIED`.

### Performance targets

- Terminal output flush <= 16ms under normal load.
- 10MB rapid terminal output does not crash renderer.
- Terminal input latency < 20ms local shell.

---

## Phase 4 — Agent Conversation UI, Tool Cards, and Destructive Gate

### Goal

Build the core Kaioken agent experience: streaming conversation, tool cards, approval modals, multiplier dial, and audit trail.

### Files to create/modify

```text
desktop/src/main/tools/gateway.ts
desktop/src/main/tools/policy.ts
desktop/src/main/tools/audit.ts
desktop/src/main/tools/redaction.ts
desktop/src/main/ipc/tools.ts

desktop/src/preload/tools.ts

desktop/src/renderer/stores/tool.ts
desktop/src/renderer/stores/approval.ts
desktop/src/renderer/stores/cost.ts

desktop/src/renderer/components/chat/ChatSurface.tsx
desktop/src/renderer/components/chat/SessionList.tsx
desktop/src/renderer/components/chat/AgentStream.tsx
desktop/src/renderer/components/chat/MessageRow.tsx
desktop/src/renderer/components/chat/StreamingMarkdown.tsx
desktop/src/renderer/components/chat/ToolCard.tsx
desktop/src/renderer/components/chat/ToolOutputLog.tsx
desktop/src/renderer/components/chat/CitationChips.tsx
desktop/src/renderer/components/chat/Composer.tsx
desktop/src/renderer/components/chat/MultiplierDial.tsx

desktop/src/renderer/components/approval/ApprovalModal.tsx
desktop/src/renderer/components/approval/ApprovalCountdown.tsx
desktop/src/renderer/components/approval/DestructiveFocusTrap.tsx

desktop/src/renderer/lib/markdown.ts
desktop/src/workers/markdown.worker.ts

desktop/tests/e2e/approval.spec.ts
desktop/tests/e2e/tool-cards.spec.ts
```

### Implementation tasks

1. Implement virtualized agent stream.

2. Implement streaming message cache.

3. Implement markdown worker.

4. Implement tool state store.

5. Implement collapsible tool cards.

6. Implement approval request channel.

7. Implement approval modal with focus trap.

8. Implement timeout auto-deny.

9. Implement audit log persistence.

10. Implement multiplier dial:
   - visual x1..x10
   - sends `agent.setMultiplier`
   - updates cost store

11. Implement citation chips from `citation.report`.

12. Implement HUD state:
   - reasoning pulse
   - armed destructive mode
   - multiplier aura

### Acceptance criteria

- User message appears immediately.
- Assistant tokens stream smoothly.
- Tool cards show full lifecycle.
- Destructive tool request opens modal.
- Initial focus is Deny or diff body.
- Enter denies.
- Esc denies.
- Timeout auto-denies after 5 minutes.
- Allow Once executes tool exactly once.
- Audit log records every decision.
- Token streaming does not re-render file tree or terminal.
- 1,000 message session remains scrollable.

### Performance targets

- Streaming frame time < 16.7ms average.
- Tool card state update < 8ms script cost.
- Markdown parsing deferred so typing remains responsive.

---

## Phase 5 — Inspector Panels, Diff Review, Codemap, Wiki, Cards, Cost, Settings

### Goal

Complete the right-hand dynamic inspector and remaining knowledge surfaces.

### Files to create/modify

```text
desktop/src/renderer/stores/diff.ts
desktop/src/renderer/stores/graph.ts
desktop/src/renderer/stores/wiki.ts
desktop/src/renderer/stores/cards.ts
desktop/src/renderer/stores/settings.ts

desktop/src/renderer/components/shell/InspectorPanel.tsx

desktop/src/renderer/components/diff/DiffInspector.tsx
desktop/src/renderer/components/diff/DiffFileList.tsx
desktop/src/renderer/components/diff/DiffHunkView.tsx
desktop/src/renderer/components/diff/DiffSplitPane.tsx
desktop/src/renderer/components/diff/HunkActionBar.tsx
desktop/src/renderer/components/diff/DiffApplyBar.tsx

desktop/src/renderer/components/graph/CodemapSurface.tsx
desktop/src/renderer/components/graph/GraphCanvas.tsx
desktop/src/renderer/components/graph/GraphInspector.tsx
desktop/src/renderer/components/graph/SymbolRefList.tsx

desktop/src/renderer/components/wiki/WikiSurface.tsx
desktop/src/renderer/components/wiki/MermaidBlock.tsx

desktop/src/renderer/components/cards/CardsSurface.tsx
desktop/src/renderer/components/cards/CardGrid.tsx

desktop/src/renderer/components/cost/CostLedgerSurface.tsx
desktop/src/renderer/components/cost/SpendChart.tsx
desktop/src/renderer/components/cost/BudgetGauge.tsx

desktop/src/renderer/components/settings/SettingsSurface.tsx
desktop/src/renderer/components/settings/ProviderSettings.tsx
desktop/src/renderer/components/settings/PolicySettings.tsx

desktop/src/renderer/lib/diff.ts
desktop/src/renderer/lib/codemirror/diff-decorations.ts
desktop/src/renderer/workers/diff.worker.ts
desktop/src/renderer/workers/graph-layout.worker.ts

desktop/src/main/kaioken/index-bridge.ts
desktop/src/main/kaioken/verify-bridge.ts
desktop/src/main/kaioken/gitops-bridge.ts
desktop/src/main/kaioken/serve-bridge.ts

desktop/tests/e2e/diff-review.spec.ts
desktop/tests/e2e/codemap.spec.ts
```

### Implementation tasks

1. Implement diff parsing worker.

2. Implement hunk state model.

3. Implement CodeMirror hunk views.

4. Implement per-hunk accept/reject.

5. Implement final patch derivation.

6. Integrate diff review into approval flow.

7. Implement codemap graph canvas:
   - WebGL preferred
   - worker layout
   - symbol selection
   - references panel

8. Implement Wiki surface:
   - markdown pages
   - Mermaid rendering
   - outline navigation

9. Implement Cards surface:
   - card grid
   - filters
   - atomic knowledge card editor

10. Implement Cost Ledger:
   - token usage
   - USD estimates
   - multiplier history
   - budget gauges

11. Implement Settings:
   - providers
   - models
   - policies
   - keybindings
   - appearance

### Acceptance criteria

- Diff inspector opens from tool card.
- Hunk accept/reject updates final patch.
- Rejecting all hunks results in no-op patch.
- Final patch checksum matches engine expectation.
- Large diff renders only visible hunks.
- Codemap graph renders symbol graph from `kaioken/index`.
- Selecting symbol shows references.
- Wiki Mermaid diagrams render safely.
- Cost ledger reflects modelport updates.
- Settings persist across restart.
- Provider secrets are not visible in renderer devtools.

---

## Phase 6 — Production Hardening, Packaging, and Release Engineering

### Goal

Ship Kaioken Desktop Studio as a signed, packaged, auto-updatable desktop application.

### Files to create/modify

```text
desktop/electron-builder.yml
desktop/scripts/rebuild-native.ts
desktop/src/main/app/updater.ts
desktop/src/main/app/fuses.ts
desktop/resources/icons/
desktop/build/
desktop/tests/e2e/packaging.spec.ts
desktop/tests/perf/startup.spec.ts
desktop/tests/perf/stream-flood.spec.ts
```

### Implementation tasks

1. Configure electron-builder:
   - Windows NSIS
   - macOS DMG/zip
   - Linux AppImage/deb

2. Configure ASAR.

3. Rebuild native modules:
   - node-pty

4. Configure Electron Fuses if available:
   - disable RunAsNode
   - disable dangerous debugging
   - enable cookie encryption where appropriate
   - only load app bundle

5. Configure code signing:
   - Windows Authenticode
   - macOS notarization

6. Configure auto-update:
   - electron-updater
   - signed release feeds

7. Add crash reporting hooks.

8. Add production logging with redaction.

9. Add performance benchmark suite.

10. Add release checklist.

### Acceptance criteria

- Packaged app boots without dev dependencies.
- `node-pty` native module loads in packaged app.
- No Node integration in renderer.
- ASAR enabled.
- Production CSP active.
- Auto-updater detects and installs update.
- Windows/macOS/Linux installers pass smoke tests.
- Cold start under budget.
- Memory usage under budget.
- Engine crash recovery works in packaged app.

### Production budgets

| Metric | Target |
|---|---:|
| Cold start to interactive | < 2.5s |
| Session restore | < 1.0s |
| Idle memory | < 500MB |
| Active streaming memory growth | bounded |
| Terminal input latency | < 20ms |
| Streaming frame drop rate | < 2% |
| IPC batch size | <= 256KB |
| Long task during streaming | < 50ms |

---

# Cross-Cutting Performance Plan

---

## 1. IPC batching

- Never send one IPC message per token.
- Batch with 16ms window.
- Immediate flush only for state transitions and approvals.

## 2. Renderer scheduling

- Use `requestAnimationFrame` for event flush.
- Use `startTransition` for non-urgent state.
- Use `useDeferredValue` for markdown parsing.
- Use workers for:
  - markdown
  - diff parsing
  - graph layout

## 3. Virtualization

Virtualize:

- message list
- tool logs
- file tree
- diff hunks
- symbol reference lists

## 4. Terminal

- WebGL renderer
- batch output
- ack-based flow control
- preserve terminal instances
- avoid React state for output

## 5. CodeMirror

- read-only diff states
- render only visible hunks
- dispose views on unmount
- avoid full-file decoration for giant files

## 6. Mermaid

- render on demand
- sanitize input
- isolate in sandboxed iframe if necessary
- cache rendered SVG

---

# Cross-Cutting Security Plan

---

## Electron hardening

```ts
contextIsolation: true
nodeIntegration: false
sandbox: true
webSecurity: true
allowRunningInsecureContent: false
```

## IPC hardening

- sender validation
- schema validation
- result envelopes
- no raw error leakage
- no function/object expose beyond API

## Filesystem hardening

- workspace root containment
- symlink resolution
- ignore rules
- deny access to secrets files
- read-only unless approved

## Tool hardening

- approval gateway
- command redaction
- patch checksum
- timeout
- audit log
- policy engine

## Provider secret hardening

- main-only storage
- safeStorage encryption
- no renderer exposure
- no log leakage

---

# Testing Strategy

---

## Unit tests

- IPC schema validation
- diff patch serialization
- approval timeout logic
- flow control watermark logic
- path sandbox guard

## Integration tests

- engine supervisor restart
- RPC handshake
- event batching
- PTY lifecycle
- workspace read sandbox

## E2E tests

Use Playwright with Electron.

Critical scenarios:

1. Boot app.
2. Open workspace.
3. Create agent session.
4. Send message.
5. Receive streamed response.
6. Receive tool proposal.
7. Deny approval.
8. Allow approval.
9. Open terminal.
10. Resize terminal.
11. Open diff inspector.
12. Accept/reject hunks.
13. Verify audit log.
14. Quit gracefully.

## Performance tests

- token flood test
- terminal output flood test
- large file diff test
- 10k message history scroll test
- graph render test with 20k nodes

---

# Risk Register & Mitigations

| Risk | Severity | Mitigation |
|---|---:|---|
| node-pty native rebuild failures | High | electron-builder install-app-deps, CI matrix builds |
| IPC flood causes UI jank | High | batch envelopes, flow control, direct MessagePort |
| Approval bypass | Critical | main-process gateway, engine cannot execute without resolved RPC |
| Large diffs freeze CodeMirror | High | hunk virtualization, read-only states, worker parsing |
| Mermaid XSS | High | sanitize, sandboxed render, CSP |
| Path traversal | Critical | realpath containment, workspace guard |
| Engine crash loop | Medium | exponential backoff, safe mode, user-visible diagnostics |
| Provider key leakage | Critical | safeStorage, main-only injection, redaction |
| Terminal resize desync | Medium | FitAddon + explicit resize RPC |
| React re-render storms | High | external streaming cache, store partitioning, memoization |

---

# Final Recommended Execution Order

1. **Phase 1**: Secure Electron shell and IPC contracts.
2. **Phase 2**: Kaiopi utility process supervisor and streaming pipeline.
3. **Phase 3**: Workspace and terminal subsystem.
4. **Phase 4**: Agent stream, tool cards, destructive approval.
5. **Phase 5**: Diff inspector, codemap, wiki, cards, cost, settings.
6. **Phase 6**: Hardening, packaging, signing, updates, performance certification.

This architecture gives Kaioken Desktop Studio a durable foundation:

- **Engine isolation** through utility process supervision
- **60 FPS streaming** through batching, acks, and external caches
- **Strict security** through sandboxed preload and main-side policy enforcement
- **Serious developer UX** through terminal, diff review, codemap, and knowledge surfaces
- **Enterprise release readiness** through packaging, auditing, and recovery semantics

This plan is directly executable by an engineering team without requiring further architectural discovery.
