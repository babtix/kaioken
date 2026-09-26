# Kaioken Desktop Studio — Architectural Blueprint

## 1. Process Topology

| Layer | Role | Runtime |
|---|---|---|
| Electron Main | Owns `kaiopi` engine lifecycle, PTY, filesystem, IPC hub | Node.js |
| Preload | `contextBridge` API surface, zero logic | Isolated context |
| Renderer | React 19 UI | Sandboxed, no Node access |
| kaiopi Engine | Agent loop, tools, indexing | Spawned child process (own process, not worker thread) |

**Decision: spawned child process over local loopback HTTP/SSE, not stdio, not worker thread.**

| Option | Verdict | Why |
|---|---|---|
| Worker thread | ❌ | Shares main's event loop/GC; a heavy AST index blocks Electron UI thread indirectly via IPC serialization |
| stdio pipe | ❌ | No native resumability, hard to debug, fragile framing for large payloads (diffs, wiki HTML) |
| Unix socket / named pipe | ⚠️ | Good perf, but harder cross-platform parity (Windows named pipes differ enough to double-maintain) |
| **Loopback HTTP + SSE** | ✅ | `kaioken serve` already exists as a daemon pattern; reuse it. One transport, debuggable with curl/devtools, restartable independently of Electron |

Main spawns `kaiopi serve --port 0` (OS-assigned port), reads the port from stdout on boot, stores it in a `daemonRegistry`. Renderer never talks to the daemon directly — always through Main → preload IPC → fetch. This keeps the destructive-tool approval gate enforceable in one place.

**Crash/restart handling**

| Event | Action |
|---|---|
| kaiopi exits unexpectedly | Main detects via `child.on('exit')`, exponential backoff restart (3 attempts), broadcasts `daemon:status` to renderer |
| kaiopi hangs (no heartbeat 10s) | Main sends SIGTERM → SIGKILL after 3s grace, restarts |
| Electron quits | Main sends `/shutdown` to daemon, waits 2s, then SIGKILL as fallback |

## 2. IPC Contract (Preload → Renderer)

```ts
// src/preload/index.d.ts
interface KaiokenAPI {
  agent: {
    sendMessage(sessionId: string, content: string): Promise<void>;
    onStreamDelta(cb: (chunk: AgentStreamChunk) => void): () => void;
    onToolCall(cb: (call: ToolCallEvent) => void): () => void;
    approveDestructive(callId: string, approved: boolean): void;
    setMultiplier(dial: 1|2|3|4|5|6|7|8|9|10): void;
  };
  pty: {
    create(cols: number, rows: number): Promise<string>; // returns ptyId
    write(ptyId: string, data: string): void;
    resize(ptyId: string, cols: number, rows: number): void;
    onData(ptyId: string, cb: (data: string) => void): () => void;
    kill(ptyId: string): void;
  };
  workspace: {
    getTree(path: string): Promise<FileNode[]>;
    readFile(path: string): Promise<string>;
    watch(path: string, cb: (evt: FSEvent) => void): () => void;
  };
  tools: {
    getDiff(callId: string): Promise<DiffHunk[]>;
    acceptHunk(callId: string, hunkId: string): void;
    rejectHunk(callId: string, hunkId: string): void;
  };
}
```

Every method that streams uses the **subscribe-returns-unsubscribe** pattern above — prevents leak accumulation when panes unmount.

## 3. Streaming Pipeline (60fps under load)

| Problem | Solution |
|---|---|
| Token deltas fire at LLM speed (can exceed 100/sec) | Main-process ring buffer, flushed to renderer via `requestAnimationFrame`-aligned batches (~16ms) over a single `agent:batch` IPC channel |
| Renderer re-renders whole tree on each token | Zustand slice per session; components subscribe with selectors (`useAgentStore(s => s.sessions[id].streamText)`) so only the active bubble re-renders |
| Tool call cards spam updates during `verifycore` runs | Debounce tool-status updates at source (250ms) — humans don't need sub-250ms granularity on "running tests" |

```ts
// src/main/ipc/streamBatcher.ts
class StreamBatcher {
  private buffer: Map<string, string[]> = new Map();
  private scheduled = false;
  push(sessionId: string, delta: string) {
    this.buffer.get(sessionId)?.push(delta) ?? this.buffer.set(sessionId, [delta]);
    if (!this.scheduled) { this.scheduled = true; setTimeout(() => this.flush(), 16); }
  }
  flush() {
    for (const [id, chunks] of this.buffer) {
      mainWindow.webContents.send('agent:batch', { sessionId: id, text: chunks.join('') });
    }
    this.buffer.clear();
    this.scheduled = false;
  }
}
```

## 4. PTY Bridge

| File | Responsibility |
|---|---|
| `src/main/ipc/pty.ts` | `node-pty.spawn`, holds `Map<ptyId, IPty>`, pipes `onData` to `webContents.send('pty:data:{id}')` |
| `src/preload/pty.ts` | Exposes `create/write/resize/onData/kill`, no logic |
| `src/renderer/components/TerminalPane.tsx` | Mounts `@xterm/xterm` + `webgl` addon, `ResizeObserver` → `pty.resize`, `terminal.onData` → `pty.write` |

Resize is debounced 100ms at the renderer to avoid PTY thrash during window drag-resize.

## 5. Layout / Component Hierarchy

```
src/renderer/
  layout/
    AppShell.tsx          (nav rail + center + inspector + terminal drawer)
    NavRail.tsx            Chat|Research|Wiki|Codemap|Cards|Ledger|Settings
  surfaces/
    ChatSurface/
    ResearchSurface/
    WikiSurface/
    CodemapSurface/        (Mermaid graph, kaioken/wiki output)
    CardsSurface/
    LedgerSurface/         (modelport spend, multiplier dial)
    SettingsSurface/
  inspector/
    DiffViewer.tsx          CodeMirror 6 side-by-side, per-hunk accept/reject
    FileTree.tsx
    GraphPreview.tsx
  terminal/
    TerminalDrawer.tsx
  stores/
    sessionStore.ts  terminalStore.ts  explorerStore.ts  diffStore.ts  agentStore.ts
```

Store partition rule: **no store subscribes across domains.** Diff acceptance writes to `diffStore` only; `agentStore` reads a snapshot count, never the hunk array itself — kills the "typing in chat re-renders file tree" class of bug.

## 6. Destructive Gate Handshake

| Step | Actor | Payload |
|---|---|---|
| 1 | kaiopi requests `write_to_file` | `{callId, tool, args, riskLevel}` sent over SSE |
| 2 | Main receives, does NOT auto-forward if `riskLevel >= write` | Buffers, sends `tool:pending-approval` to renderer |
| 3 | Renderer shows modal, focus trapped on **Deny** | 5-min auto-cancel timer starts |
| 4 | User approves/denies | `agent.approveDestructive(callId, bool)` |
| 5 | Main POSTs decision to daemon `/tools/{callId}/decision` | kaiopi resumes or aborts the tool call |

Auto-cancel on timeout sends `approved: false` — fail closed.

## 7. Implementation Roadmap

| Phase | Scope | Files touched | Acceptance |
|---|---|---|---|
| 1. Foundation & IPC | Spawn kaiopi daemon, health check, `window.api` skeleton | `main/kaiopi.ts`, `preload/index.ts` | Daemon boots, renderer shows connection status |
| 2. Chat + Streaming | Agent stream, StreamBatcher, ChatSurface | `main/ipc/streamBatcher.ts`, `stores/agentStore.ts`, `surfaces/ChatSurface` | Send message, see token stream at steady 60fps |
| 3. Terminal | PTY bridge, TerminalDrawer | `main/ipc/pty.ts`, `renderer/terminal/*` | Interactive shell, resize works, multiplexed tabs |
| 4. Tools & Destructive Gate | Approval modal, diff viewer | `inspector/DiffViewer.tsx`, `stores/diffStore.ts` | write_to_file blocks until approved, per-hunk accept works |
| 5. Remaining Surfaces | Research, Wiki, Codemap, Cards, Ledger | `surfaces/*` | Each surface renders live data from its kaioken package |
| 6. Packaging | electron-builder, code signing, auto-update | `electron-builder.yml` | Signed installers for macOS/Windows/Linux, auto-update channel live |

## 8. Key Risk Flags

| Risk | Mitigation |
|---|---|
| kaiopi (Pi-based) still mid-rewrite — API surface may shift | Version-pin the daemon's HTTP contract; treat it as a service boundary, not a library import |
| `@xterm/addon-webgl` context loss on GPU sleep/wake | Fallback to canvas renderer on `webglcontextlost` |
| Electron 44 sandbox + node-pty native module | Must rebuild node-pty against Electron's ABI (`electron-rebuild`) in CI for all 3 platforms |