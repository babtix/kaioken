# 03 — The Go daemon

Everything here lives in `cli/`. The daemon is transport only: it owns no
generation logic and duplicates none of the engine.

## 3.1 New and modified files

```
cli/
├── cmd/kaioken/main.go                 MODIFY  add `daemon` command + flags
└── internal/
    ├── daemon/                         NEW package
    │   ├── daemon.go                   bootstrap, handshake, middleware, shutdown
    │   ├── mux.go                      route table
    │   ├── hub.go                      SSE hub + ring buffer
    │   ├── sse.go                      the SSE handler
    │   ├── workspace.go                Manager, Workspace, recents
    │   ├── runs.go                     run registry and lifecycle
    │   ├── approvals.go                pending-approval registry
    │   ├── chatui.go                   agent.UI → events bridge
    │   ├── handlers_system.go          health, shutdown
    │   ├── handlers_workspace.go       workspaces, scan, status, git, hook, config
    │   ├── handlers_settings.go        settings, keys, models
    │   ├── handlers_chat.go            sessions, messages, approvals, undo, usage
    │   ├── handlers_runs.go            runs, estimate
    │   ├── handlers_docs.go            wiki, modules, cards, skills, file
    │   ├── jsonx.go                    envelope helpers, error codes
    │   └── *_test.go                   one per handler file
    ├── agent/diff.go                   MODIFY  export DiffHunks
    ├── wiki/provenance.go              MODIFY  export ReadProvenance
    └── scan/scan.go                    MODIFY  export Languages() (small addition)
```

Estimated new Go: **~2,600 lines** plus **~900 lines** of tests. Modified engine
code: under 60 lines, additive only.

## 3.2 `daemon.go` — bootstrap

```go
// Package daemon exposes the Kaioken engine over a loopback HTTP API with a
// Server-Sent Events stream, so a desktop front-end can drive the same
// pipelines the TUI drives. It owns no generation logic: every handler is a
// thin adapter over internal/{agent,wiki,skills,plan,generate,scan,session}.
package daemon

type Options struct {
    Addr      string // "127.0.0.1:0" — always loopback
    Token     string // required; constant-time compared on every request
    ParentPID int    // 0 disables the watchdog
    Quiet     bool   // suppress the stdout handshake (tests)
}

// Run serves until ctx is cancelled or the parent process disappears.
func Run(ctx context.Context, opts Options) error
```

Bootstrap order — the sequence matters, an agent must not reorder it:

1. Validate `opts.Token`; empty is a hard error (never serve unauthenticated).
2. `net.Listen("tcp", opts.Addr)` — learn the real port.
3. Build `Hub`, `Manager`, `Runs`, `Approvals`; build the mux.
4. **Print exactly one line to stdout and flush**, then never write to stdout
   again (logs go to stderr — the handshake must be unambiguous):
   ```
   {"kaioken_daemon":1,"port":54312,"pid":9184,"version":"0.4.0"}
   ```
5. Start the parent watchdog: every 2 s, if `opts.ParentPID != 0` and the process
   is gone, cancel the root context. Portable check: on Windows
   `os.FindProcess` always succeeds, so use
   `golang.org/x/sys/windows.OpenProcess` **or** — preferred, to avoid a new
   dependency — have Rust hold the child's **stdin pipe open** and have Go read
   stdin to EOF in a goroutine: EOF means the parent died. Use the stdin-EOF
   watchdog; it is portable, dependency-free, and immediate rather than polled.
6. `srv.Serve(ln)`; on ctx cancellation, cancel all runs, then
   `srv.Shutdown` with a 2 s timeout.

**Token delivery.** Rust passes `--token-stdin`, then writes `<token>\n` on the
child's stdin before anything else. Go reads that first line, then keeps reading
stdin purely as the death-watch. This keeps the token out of process listings
*and* gives the watchdog for free. `--token <hex>` remains supported for manual
testing and is what `curl`-based verification uses.

### Middleware chain

```go
mux = recoverer(originGuard(auth(logRequests(router))))
```

- `auth` — `subtle.ConstantTimeCompare` against the token; `401 unauthorized`.
- `originGuard` — if `Origin` is present and not in the allow-list, `403
  forbidden_origin`. Allow-list: `tauri://localhost`, `http://tauri.localhost`,
  `https://tauri.localhost`, `http://localhost:1420`, `http://127.0.0.1:1420`.
  Requests with no `Origin` (curl, tests) pass.
- `recoverer` — a panic becomes `500 engine_error` and a stderr stack trace; the
  daemon never dies from one bad handler.
- `logRequests` — method, path, status, duration to stderr. Off when `Quiet`.

## 3.3 `hub.go` — the event hub

```go
type Event struct {
    Seq         uint64          `json:"seq"`
    Type        string          `json:"type"`
    TS          time.Time       `json:"ts"`
    WorkspaceID string          `json:"workspace_id,omitempty"`
    RunID       string          `json:"run_id,omitempty"`
    SessionID   string          `json:"session_id,omitempty"`
    Data        map[string]any  `json:"-"` // flattened into the frame
}

type Hub struct {
    mu   sync.RWMutex
    seq  atomic.Uint64
    ring [512]Event   // circular, oldest overwritten
    head int
    subs map[uint64]chan Event
}

func NewHub() *Hub
func (h *Hub) Publish(typ string, fields map[string]any) uint64
func (h *Hub) Subscribe(since uint64) (<-chan Event, func())
func (h *Hub) Replay(since uint64) ([]Event, bool) // bool=false → too old
```

Rules:
- `Publish` assigns `seq` under the lock, writes the ring, then fans out
  **non-blockingly**: `select { case ch <- ev: default: drop subscriber }`.
  A stalled front-end must never stall a wiki run.
- Subscriber channels are buffered at 256.
- The JSON frame is `{seq, ts, type, …fields}` — the event's fields are flattened
  at the top level, exactly as §2.3 specifies.

Convenience publishers keep call sites short and event names typo-free:

```go
func (h *Hub) RunProgress(runID, phase, msg string, done, total int)
func (h *Hub) RunLog(runID, level, text string)
func (h *Hub) RunArtifact(runID, path string, lines int, kind string)
func (h *Hub) ChatDelta(runID, sessionID, text string)
// …one per event type in §2.3. No raw string literals outside this file.
```

## 3.4 `sse.go`

```go
func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request)
```

- Parse `?since`; `Replay` first (or emit `stream.reset` when too old).
- Headers per §2.2, then `Flush()` immediately so the client's `fetch` resolves.
- Loop over the subscription channel; `20 s` ticker writes `: ping\n\n`.
- Exit on `r.Context().Done()`; always call the unsubscribe func.
- **`http.Flusher` is required.** Assert it once and return `500` if absent.

## 3.5 `workspace.go`

```go
type Workspace struct {
    ID      string
    Path    string          // absolute, OS-native on disk; slash-normalised in JSON
    mu      sync.RWMutex
    cfg     *config.Config
    global  *config.Global
    client  *llm.Client
    scan    *scan.Result
    scanAt  time.Time
    sess    map[string]*session.Session
    undo    []agent.UndoEntry
    allowRun bool
}

type Manager struct {
    mu    sync.RWMutex
    byID  map[string]*Workspace
    recents []string
}

func (m *Manager) Open(path string) (*Workspace, error)
func (m *Manager) Get(id string) (*Workspace, bool)
func (m *Manager) Close(id string, forget bool)
func (m *Manager) Recents() []recentEntry
```

- IDs: `"ws_" + first 6 hex of sha256(absolute path)`. Deterministic, so the
  front-end can cache per workspace across restarts.
- `Open` resolves to an absolute path, verifies it is a directory, loads config
  (missing config is not an error — `has_config:false`), loads global config,
  and builds the `llm.Client` lazily (a missing key is only an error at call time,
  so the user can browse an existing wiki without a key).
- **`client()` accessor rebuilds on demand** using the same resolution order as
  the CLI (`cmd/kaioken/main.go:339` `newClient`): repo config model/provider →
  global saved key → provider env var. Reuse that logic; do not re-derive it.
- Recents persist to `~/.kaioken/recents.json` (or `$KAIOKEN_HOME/recents.json`,
  honouring `config.HomeEnv` so tests never touch the real home directory).
- `scanCached(refresh bool)` returns the cached `*scan.Result` unless `refresh`
  or it is older than 60 s.

## 3.6 `runs.go`

```go
type RunState string
const (
    RunQueued  RunState = "queued"
    RunRunning RunState = "running"
    RunDone    RunState = "done"
    RunFailed  RunState = "failed"
    RunCancelled RunState = "cancelled"
)

type Run struct {
    ID, WorkspaceID, Kind string
    Params  map[string]any
    State   RunState
    Started, Ended time.Time
    Progress Progress
    Artifacts []Artifact
    Err      error
    Summary  map[string]any
    cancel   context.CancelFunc
}

type Runs struct { mu sync.RWMutex; byID map[string]*Run; hub *Hub }

// Start registers the run, publishes run.started, and executes fn in a
// goroutine. fn must honour ctx and should call r.Progress*/r.Artifact to
// report; those publish through the hub.
func (rs *Runs) Start(ws *Workspace, kind string, params map[string]any,
    fn func(ctx context.Context, r *Run) error) *Run

func (rs *Runs) Cancel(id string) error
func (rs *Runs) ActiveKind(workspaceID, kind string) bool // for 409 run_conflict
```

`Start` wraps `fn` so that:
- a returned `context.Canceled` becomes state `cancelled`, not `failed`;
- any other error becomes `failed` with `Err` surfaced in `run.finished.error`;
- `run.finished` always fires, including on panic (deferred recover).

Retention: the last 50 finished runs per process stay queryable, then are evicted.

### Bridging `wiki.Progress` and `skills.Progress`

Both engine packages take the same four-callback struct. One adapter serves both:

```go
func (r *Run) wikiProgress() wiki.Progress {
    return wiki.Progress{
        Info:    func(t string) { r.log("info", t) },
        Started: func(w string) { r.phase(w) },
        Wrote:   func(p string, n int) { r.artifact(p, n, "wiki_doc") },
        Failed:  func(w string, err error) { r.log("error", w+": "+err.Error()) },
    }
}
```

`generate.Options` has a different shape (`OnStart func(id)`, `OnDone func(id,
err, skipped)`) — write a second small adapter; do not try to unify them.

**Progress totals.** `wiki.Run` does not report a section count up front, but the
outline does: after `wiki_plan.yaml` exists, `len(outline.Sections)` is the total.
The run reads the outline (or gets it from the estimate) to populate
`progress.total`; until then `total` is `0` and the UI shows an indeterminate bar.

## 3.7 `chatui.go` — the `agent.UI` bridge

This is the direct analogue of `uiAdapter` in `internal/tui/tui.go:2186`. Copy
its shape; change the destination.

```go
type chatUI struct {
    hub       *Hub
    approvals *Approvals
    run       *Run
    ws        *Workspace
    sessionID string
    ctx       context.Context
    autoApprove *atomic.Bool // approve_all flips this mid-run
}

func (u *chatUI) AssistantDelta(text string) { u.hub.ChatDelta(u.run.ID, u.sessionID, text) }
func (u *chatUI) Assistant(text string)      { u.hub.ChatMessage(…, "assistant", text) }
func (u *chatUI) Tool(name, args string)     { u.hub.ChatToolCall(…, compactArgs(args)) }
func (u *chatUI) ToolResult(name, result string, isErr bool) { … }
func (u *chatUI) Info(text string)           { u.hub.RunLog(u.run.ID, "info", text) }
func (u *chatUI) RecordUndo(e agent.UndoEntry) { u.ws.pushUndo(e); u.hub.UndoRecorded(…) }

// Approve BLOCKS the agent goroutine — by design; that is the contract of
// agent.UI. It registers a pending approval, publishes approval.request, and
// waits for the front-end's POST, a timeout, or cancellation.
func (u *chatUI) Approve(req agent.ApprovalRequest) bool {
    if u.autoApprove.Load() { return true }
    id, ch := u.approvals.Register(u.run.ID, req)
    u.hub.ApprovalRequest(id, u.run.ID, u.ws.ID, req, u.diffFor(req))
    select {
    case d := <-ch:
        if d == DecisionApproveAll { u.autoApprove.Store(true); return true }
        return d == DecisionApprove
    case <-time.After(5 * time.Minute):
        u.approvals.Expire(id)
        return false            // a timeout must DENY, never approve
    case <-u.ctx.Done():
        u.approvals.Expire(id)
        return false
    }
}
```

`compactArgs` and the tool glyph map already exist in `internal/tui`. **Do not
import `internal/tui` from `internal/daemon`** — a TUI package pulling in Bubble
Tea has no business in a server. Copy the ~20 lines of `compactArgs` into
`chatui.go` (it is trivial), or better, promote it to a tiny shared helper in
`internal/agent` and have both call it. Prefer promoting.

### Structured diffs

`internal/agent/diff.go` currently produces a text preview. Add, without changing
the existing functions:

```go
// Hunk is one contiguous change region, in unified-diff terms.
type Hunk struct {
    OldStart, OldLines, NewStart, NewLines int
    Lines []DiffLine
}
type DiffLine struct {
    Op   string // " ", "-", "+"
    Text string
}

// DiffHunks computes hunks with three lines of context. Empty old means a new
// file; empty new means deletion.
func DiffHunks(old, new string) []Hunk
```

Implementation: a plain LCS over lines is adequate — these are single-file edits,
not repository diffs. Cap at 400 changed lines; beyond that return one synthetic
hunk with a `"file too large to diff (N lines changed)"` marker line so the UI
still renders something.

## 3.8 `approvals.go`

```go
type Decision string
const (
    DecisionApprove    Decision = "approve"
    DecisionDeny       Decision = "deny"
    DecisionApproveAll Decision = "approve_all"
)

type Approvals struct {
    mu      sync.Mutex
    pending map[string]chan Decision
}

func (a *Approvals) Register(runID string, req agent.ApprovalRequest) (id string, ch chan Decision)
func (a *Approvals) Resolve(id string, d Decision) error // 404 when unknown
func (a *Approvals) Expire(id string)
func (a *Approvals) CancelRun(runID string)              // deny everything pending
```

The channel is buffered (capacity 1) so `Resolve` never blocks even if the waiter
has already timed out.

## 3.9 Handler notes

Only the non-obvious ones. Everything else is a direct call into the engine.

**`handlers_workspace.go`**
- `scan` caches; `status` recomputes hashes with `state.HashFiles` exactly as
  `cmdStatus` does (`cmd/kaioken/main.go:279`) — reuse the same four states.
- `PUT /config` must round-trip through `config.Config` and `Save`, not through
  raw YAML, so the header comment and default filling stay correct.
- `hook` calls `gitx.InstallPostCommit(repo, exe)` where `exe` is
  `os.Executable()` — for the desktop build that is the sidecar path, which is
  correct: the hook should invoke the same binary.

**`handlers_settings.go`**
- Never marshal `Global.Keys` into a response. Build the provider list from
  `llm.Providers` and set `has_key` from `LoadGlobal().Keys[name] != ""` falling
  back to `os.Getenv(p.KeyEnv) != ""` with `key_source:"env"`.
- `hint`: `key[:5] + "…" + key[len(key)-4:]` when `len(key) >= 12`, else omitted.
- Model catalogue cache: `map[provider]cachedModels{at, list}`, 10-minute TTL.

**`handlers_chat.go`**
- `POST /messages` builds the history exactly as the TUI does: system prompt from
  `agent.SystemPrompt(root, allowRun)` when the session is empty, then the saved
  messages, then the new user message.
- The agent runs inside a `Runs.Start` with `kind:"chat"`. `chat` is *not* in the
  §2.7 kind list because it is a chat run, not a pipeline run — it still gets a
  run id so cancel and approvals work uniformly. Return it as `run_id`; the
  front-end never lists it under Activity.
- After the agent returns, `sess.Record(history)` and `sess.Save(repo)`, then
  publish `session.updated`. A failed turn still saves what completed.
- `compact` summarises with a single `client.Chat` call using the same prompt the
  TUI's `/compact` uses; keep the first system message and the summary.

**`handlers_docs.go`**
- All path parameters go through one helper:
  ```go
  func safeJoin(root, rel string) (string, error) // rejects .. and absolute paths
  ```
  Mirror `agent.resolve` (`internal/agent/tools.go:170`) — same rule, same error.
- `wiki/tree` counts lines and words while walking; cache per directory mtime.
- `toc` extraction: scan for ATX headings outside fenced code blocks; slugify the
  same way `rehype-slug` does (lowercase, non-alphanumerics to `-`, collapse) so
  front-end anchors match server-supplied slugs.
- `provenance`: promote the existing parser in `internal/wiki/provenance.go` to an
  exported `ReadProvenance(markdown string) []string`.

## 3.10 `cmd/kaioken/main.go` changes

Add to the command switch and the usage text:

```go
case "daemon":
    err = cmdDaemon(ctx, args)
```

```go
// cmdDaemon serves the engine over a loopback HTTP API for the desktop app.
// It is not intended for direct human use: the port is ephemeral and every
// request needs the bearer token supplied at startup.
func cmdDaemon(ctx context.Context, f flags) error {
    token := f.token
    if f.tokenStdin {
        line, err := bufio.NewReader(os.Stdin).ReadString('\n')
        if err != nil { return fmt.Errorf("reading token from stdin: %w", err) }
        token = strings.TrimSpace(line)
    }
    if token == "" { return errors.New("daemon requires -token or -token-stdin") }
    addr := "127.0.0.1:0"
    if f.port != 0 { addr = fmt.Sprintf("127.0.0.1:%d", f.port) }
    return daemon.Run(ctx, daemon.Options{Addr: addr, Token: token})
}
```

New flags in `parseFlags`: `-token <hex>`, `-token-stdin` (bool). `-port` already
exists. Usage text gains one line under Commands:

```
  daemon     Serve the engine over a loopback HTTP API (used by Kaioken Desktop)
```

## 3.11 Testing the daemon

Every handler file gets a sibling `_test.go` using `httptest.NewServer` over the
real mux with a fixed token and `Quiet: true`.

- **No provider calls in tests.** Point `config.BaseURL` at an `httptest` server
  that returns canned OpenAI-shaped JSON. `llm.Client` is a struct, not an
  interface — overriding `BaseURL` is the least invasive fake and needs no engine
  change.
- **Always set `KAIOKEN_HOME`** to `t.TempDir()`. `config.HomeEnv` exists exactly
  for this; without it a settings test overwrites the developer's real API keys.
- Table-driven auth tests: no token → 401, wrong token → 401, hostile `Origin` →
  403, correct both → 200.
- SSE test: subscribe, publish three events, assert frames parse and `seq`
  increases; then reconnect with `since` and assert replay.
- Approval test: register, assert the channel blocks, resolve, assert the waiter
  returns; separately assert timeout returns `false`.
- Run test: start a run whose `fn` blocks on ctx, cancel it, assert state
  `cancelled` and that `run.finished` was published.
