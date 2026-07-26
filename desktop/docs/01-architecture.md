# 01 — Architecture

## 1.1 The constraint that decides everything

The engine is 12,832 lines of Go across sixteen packages. It is the product.
Anything that requires rewriting it is wrong by definition, so the only real
question is: **how does a WebView reach Go code?**

Four options were considered.

| Option | Verdict |
| --- | --- |
| **A. Rewrite the engine in Rust** | Rejected. Months of work to reach parity, and the CLI would then need to be maintained twice or abandoned. |
| **B. Go compiled to a C archive, called over FFI from Rust** | Rejected. `go build -buildmode=c-archive` on Windows/MSVC is fragile, cgo must be enabled (the project is currently pure Go and cross-compiles trivially), and every streaming callback becomes a C function pointer crossing a runtime boundary. Debuggability collapses. |
| **C. Wails instead of Tauri** | Rejected for this project, though it is the natural fit: Wails *is* Go, so bindings would be free. Rejected because (a) the user asked for Tauri, (b) Tauri's updater/installer story and capability model are stronger, and (c) the daemon design below makes the front-end framework swappable anyway. Recorded as decision D1. |
| **D. Go as a local daemon behind HTTP + SSE** | **Chosen.** |

## 1.2 Why the daemon wins

**The engine already is a server.** `cli/internal/serve/serve.go` is 823 lines of
`net/http` that renders the generated wiki with a sidebar, search, and mermaid.
`kaioken serve` exists because the terminal cannot display a wiki. The desktop
app is that idea finished: keep the HTTP surface, replace the hand-rolled HTML
with a real front-end, and extend the API to cover everything else the engine does.

**Streaming is the dominant traffic pattern.** Assistant tokens
(`llm.ChatWithToolsStream` → `onDelta`), wiki progress (`wiki.Progress` with four
callbacks), skills progress, tool calls, and tool results are all push. SSE maps
onto them with no impedance mismatch — `wiki.Progress{Info, Started, Wrote,
Failed}` becomes four event types and nothing else changes.

**Approvals need a request/response over the push channel.** `agent.UI.Approve`
*blocks* the agent goroutine until the user answers; the TUI implements this with
`approvals chan bool` (see `uiAdapter.Approve` at `cli/internal/tui/tui.go:2243`).
The daemon does the same thing with a map of channels keyed by an approval id:
the SSE stream carries `approval.request`, the front-end POSTs the decision, the
handler sends on the channel, the blocked goroutine wakes. Identical mechanism,
different transport.

**It is testable without a GUI.** Every endpoint can be exercised with `curl` and
asserted with `httptest`. For an AI agent implementing this, that is the single
most valuable property in the design: when a screen misbehaves, the seam is one
command away from being isolated.

**It keeps Rust small.** ~400 lines total: spawn, parse one handshake line,
supervise, kill. There is no serialisation layer to maintain in Rust, no
`#[tauri::command]` per feature, and no risk of the Rust layer drifting from the
Go layer.

**The daemon outlives the shell.** If Tauri is ever replaced — by a web app, a
VS Code extension, a second front-end — the API is already the product boundary.

### The cost, stated honestly

Two processes instead of one. That means: an orphan-process risk on crash
(mitigated by a parent-PID watchdog, §1.6), a port and token to manage, and a
sidecar to package and upgrade correctly (risk R1). These are real and each has a
named mitigation. They are cheaper than any of options A–C.

## 1.3 Process model

```
launch
  │
  ├─ Rust: generate 32-byte hex token
  ├─ Rust: spawn sidecar
  │       kaioken-daemon daemon --port 0 --token <hex> --parent-pid <pid>
  │
  ├─ Go:   bind 127.0.0.1:0, learn the real port
  ├─ Go:   print ONE line to stdout and flush:
  │       {"kaioken_daemon":1,"port":54312,"pid":9184,"version":"0.4.0"}
  │
  ├─ Rust: parse that line (timeout 10 s), store {port, token} in managed state
  ├─ Rust: keep reading stdout/stderr → forward to the Tauri log plugin
  │
  ├─ WebView: invoke("daemon_info") → { port, token }
  ├─ WebView: GET /v1/health, then open GET /v1/events (SSE)
  │
  └─ steady state
       WebView ──HTTP──► Go daemon ──► engine ──► .kaioken/
       WebView ◄──SSE─── Go daemon

quit
  ├─ Rust RunEvent::ExitRequested → POST /v1/shutdown (grace 2 s)
  ├─ Rust: child.kill() if still alive
  └─ Go watchdog: if parent PID disappears, exit within 5 s regardless
```

**The token never appears on stdout.** Rust generates it and passes it as an
argument; only the port comes back. Process listings can show arguments on some
systems, so the daemon additionally accepts `--token-fd`/stdin delivery — see
`docs/03-go-daemon.md` §3.2 for the chosen form.

## 1.4 Transport decisions

**HTTP/1.1 + JSON for commands, SSE for events.** Not WebSockets: the traffic is
overwhelmingly server→client push plus ordinary request/response, `net/http`
gives SSE for free with a `Flusher`, and there is no framing library to add on
either side.

**The WebView talks to the daemon directly**, not through Rust. Proxying every
call through `invoke` would mean writing the whole API twice (once in Rust, once
in TypeScript) and re-emitting SSE as Tauri events. The only thing that buys is
keeping the token out of the renderer — and the renderer only ever loads our own
bundled assets, so that is a threat model without a threat. Decision D3.

**Consequences to handle:**

- The app's CSP must permit `connect-src http://127.0.0.1:*` (`docs/04-rust-shell.md` §4.3).
- The event stream cannot use `EventSource`, because `EventSource` cannot send an
  `Authorization` header and a token in a query string leaks into logs. The
  front-end uses `fetch` + `ReadableStream` with a ~60-line SSE frame parser
  (`docs/05-frontend.md` §5.4). This is a small, well-understood piece of code
  and it is unit-tested.

## 1.5 Concurrency model inside the daemon

```
Manager                       one process
 ├─ recents  (~/.kaioken/recents.json)
 └─ map[workspaceID]*Workspace
       ├─ Path        absolute, slash-normalised for the API
       ├─ cfg         *config.Config          (repo .kaioken/config.yaml)
       ├─ global      *config.Global          (~/.kaioken/config.yaml)
       ├─ client      *llm.Client             (rebuilt on model/provider change)
       ├─ scanCache   *scan.Result + mtime    (invalidated on demand)
       ├─ sessions    map[sessionID]*session.Session
       ├─ undo        []agent.UndoEntry
       └─ mu          sync.RWMutex

Hub                            one per process
 ├─ seq        atomic uint64
 ├─ ring       [512]Event      replay buffer for reconnects
 └─ subs       map[subID]chan Event   (buffered 256; slow subscriber is dropped)

Runs                           one registry per process
 └─ map[runID]*Run{ Kind, WorkspaceID, State, Started, Ended, Cancel, Err }
```

Rules:

- **One goroutine per run.** `Runs.Start` takes a `func(ctx, *Run) error`, gives
  it a cancellable context, and publishes `run.started` / `run.finished` around it.
- **Engine calls are already concurrency-limited internally** (`config.EffectiveConcurrency`
  clamps free-tier models to 2). The daemon does not add its own limiter; it does
  refuse a second run of the same kind on the same workspace with `409 Conflict`.
- **`Workspace.mu` guards config/client/session mutation only.** Long engine calls
  happen outside the lock, against values captured while holding it.
- **A slow SSE subscriber is dropped, never blocked.** The front-end reconnects
  with `?since=<lastSeq>` and the ring buffer replays what it missed.

## 1.6 Failure and lifecycle handling

| Failure | Behaviour |
| --- | --- |
| Sidecar fails to start | Rust surfaces the stderr tail in a blocking error screen with a *Retry* button. No silent white window. |
| Sidecar crashes while running | Rust restarts it up to 3 times with backoff (1 s, 3 s, 9 s); the front-end sees the SSE stream close, shows a *reconnecting* status pill, and re-subscribes. In-flight runs are lost — the UI marks them `interrupted`, it does not claim they succeeded. |
| App is killed (Task Manager, crash) | The daemon's watchdog polls the parent PID every 2 s and exits when it disappears. |
| The window closes with runs active | A confirm dialog: *2 runs in progress — quit anyway?* Quitting cancels them; the wiki's `wiki_state.yaml` failed-section list means `wiki retry` can resume. |
| An approval is pending when the stream drops | The approval times out after 5 minutes and auto-denies. A denied write never touches disk, so the failure mode is safe. |
| Port already in use | Impossible by construction: the daemon binds `:0`. |

## 1.7 Security posture

- Bind **127.0.0.1 only**, never `0.0.0.0`.
- **Bearer token** on every request including the SSE stream. Constant-time compare.
- **Origin allow-list**: requests carrying an `Origin` header are rejected unless
  it is `tauri://localhost`, `http://tauri.localhost`, `https://tauri.localhost`,
  or the dev origin `http://localhost:1420`. This is the DNS-rebinding defence —
  a hostile page in the user's browser cannot reach the daemon even if it guesses
  the port, because it cannot forge `Origin` and does not have the token.
- **No CORS `Access-Control-Allow-Origin: *`.** Ever.
- **Path confinement is the engine's job and it already does it** —
  `agent.resolve` refuses any path outside the repo root
  (`cli/internal/agent/tools.go:170`). The daemon adds the same check to its own
  file-reading endpoints rather than trusting the caller.
- **API keys are never returned.** `GET /v1/settings` reports
  `{provider, has_key, hint:"sk-or-…3f2a"}`. Writes are one-way.
- **`run_command` is opt-in per workspace**, defaulting to off, and surfaced in
  the UI as a toggle with a plain-language warning. The engine's `AllowRun` flag
  already gates whether the tool is even offered to the model.

## 1.8 Decision log

Each decision records what was chosen, why, and what would make it wrong.

**D1 — Tauri, not Wails.**
Wails would give free Go bindings; Tauri was chosen for the updater, the
capability/permission model, smaller installers, and because the front-end can
share `website/`'s React + Tailwind design system verbatim. The daemon boundary
makes this reversible: a Wails front-end could consume the same API.
*Revisit if:* sidecar packaging (R1) proves unworkable across platforms.

**D2 — Loopback HTTP daemon, not FFI.**
See §1.2. *Revisit if:* process-spawn restrictions (locked-down enterprise
machines, macOS sandboxing for the App Store) make sidecars impractical.

**D3 — The WebView calls the daemon directly.**
Rust is not a proxy. Saves writing the API twice. *Revisit if:* a platform's
WebView refuses `connect-src` to a loopback port, in which case Rust becomes a
proxy and the front-end's `lib/api.ts` swaps its transport — one file changes.

**D4 — SSE, not WebSockets.**
Traffic is push-dominated and request/response otherwise. *Revisit if:* a feature
needs high-rate client→server streaming (voice input, live cursors).

**D5 — The front-end renders markdown, not the Go `serve` package.**
`internal/serve` keeps working for `kaioken serve`; the desktop app fetches raw
markdown and renders it with `react-markdown` + `remark-gfm` + `mermaid`, reusing
`website/src/components/{Markdown,Mermaid,CodeBlock}.tsx`. This gives in-app
navigation, a live TOC, and search highlighting that server-rendered HTML cannot.
*Cost:* two renderers exist. Accepted — they serve different surfaces.

**D6 — No app-private database.**
`.kaioken/` on disk is the state. Sessions are already JSON files, config is
already YAML, the wiki is already markdown. Adding SQLite would create a second
source of truth and break goal G4. The only app-owned file is
`~/.kaioken/recents.json` (a list of paths), which is disposable.

**D7 — API keys stay in `~/.kaioken/config.yaml` (mode 0600), not the OS keychain.**
The CLI reads keys from there (`config.LoadGlobal().Keys[provider]`,
`cmd/kaioken/main.go:349`). Moving the GUI to a keychain would split the source of
truth and break "set it in the app, use it in the terminal". A keychain option is
v2: read keychain first, fall back to the file, and offer a migration that keeps
the file as a fallback for the CLI.
*Revisit if:* a user reports the plaintext file as a blocker.

**D8 — One active workspace at a time.**
The engine's state (`scan.Result`, `llm.Client`, undo stack) is per-repo and
memory-hungry; the recents list makes switching cheap. Multi-workspace tabs are
a v2 feature, and the `Manager` map already permits it — only the UI assumes one.

**D9 — Zustand for state, no data-fetching library.**
Most state arrives via SSE push, which fights TanStack Query's cache-invalidation
model. A thin `lib/api.ts` plus zustand stores that SSE events write into is
smaller and has one mental model instead of two. *Revisit if:* the number of
request-response screens grows past what hand-written loading states can carry.

**D10 — The contract document is normative.**
`docs/02-api-contract.md` is not documentation of the code; the code is an
implementation of it. Drift is a bug in the code, and amendments are made in the
same commit as the handler that requires them.
