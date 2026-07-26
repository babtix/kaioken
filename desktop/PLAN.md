# Kaioken Desktop — Master Plan

**Status:** proposed, not started · **Target:** Tauri v2 desktop app for Windows,
macOS, Linux · **Owner of execution:** an AI coding agent working from
[`docs/10-tasks.md`](docs/10-tasks.md)

---

## 1. Why this exists

Kaioken today is a terminal binary: a Bubble Tea TUI plus a scriptable CLI, ~12.8k
lines of Go across `cli/internal/*`. It is very good at what it does, and the
terminal is the wrong surface for three of its jobs:

| Job | Why the terminal loses |
| --- | --- |
| **Reading generated wikis** | 2000-line markdown chapters with mermaid diagrams. `kaioken serve` already exists precisely because the terminal cannot show them — it renders them in a browser. That browser should be the app. |
| **Approving diffs** | A y/n prompt with a unified-diff preview is a downgrade from a real side-by-side diff with syntax highlighting and per-hunk context. |
| **Steering the pipeline** | `wiki_plan.yaml` and `modules.yaml` are meant to be edited by a human between passes. Today that means alt-tabbing to an editor and hoping the YAML still parses. |

The chat agent is *fine* in a terminal. Everything downstream of it is not. The
desktop app's thesis: **keep the engine, replace the surface, and make the
human-in-the-loop steps first-class.**

The existing roadmap entry in `README.md` says *"Desktop version (Wails wrapper
around the same engine — `serve` is the seed)"*. This plan supersedes it with
Tauri; see the decision log in [`docs/01-architecture.md`](docs/01-architecture.md).

## 2. Product goals

**G1 — Zero engine rewrite.** Every capability comes from the existing Go
packages (`agent`, `wiki`, `skills`, `plan`, `generate`, `scan`, `session`,
`config`, `gitx`, `codemap`, `llm`). New Go code is transport only.

**G2 — Feature parity with the TUI on day one of M6.** Everything reachable from
a slash command is reachable from the GUI: chat, model/provider/key, repo,
scan/plan/generate/cards, wiki (+multiplier, +retry, +force), update, skills,
sessions/resume, undo, diff, cost, notes, hook, status, models.

**G3 — Beat the TUI where the GUI can.** Rendered wiki reading with a nav tree
and search; a structured diff approver; YAML plan editors with validation; a run
console that shows several concurrent pipelines; a cost meter that is always
visible instead of behind `/cost`.

**G4 — One source of truth with the CLI.** The app reads and writes the same
`.kaioken/` directory and the same `~/.kaioken/config.yaml`. A user must be able
to run `kaioken wiki` in a terminal and see the result appear in the app, and
vice versa. No app-private database.

**G5 — Local and offline-first.** No telemetry, no cloud account, no phone-home.
The only network traffic is to the user's chosen LLM provider.

### Non-goals for v1

- No embedded code editor (open in the user's editor instead).
- No multi-repo simultaneous chat (one active workspace at a time; recents list).
- No plugin system, no theming beyond light/dark.
- No mobile, no web build.
- No OS-keychain key storage (v2 — see decision D7).

## 3. Architecture in one diagram

```
┌───────────────────────────────────────────────────────────────┐
│  Kaioken.exe  (Tauri v2 shell, Rust)                          │
│                                                               │
│   WebView2 / WKWebView / webkit2gtk                           │
│   └── React 19 · Vite 6 · Tailwind 4 · same tokens as website │
│         │                                                     │
│         │  invoke("daemon_info") ──► { port, token }          │
│         │                                                     │
│   Rust core (~400 lines total)                                │
│   └── spawn sidecar · read handshake · supervise · kill       │
└───────────┬───────────────────────────────────────────────────┘
            │  stdout: {"kaioken_daemon":1,"port":54312,…}
            ▼
┌───────────────────────────────────────────────────────────────┐
│  kaioken-daemon  (the existing Go binary, new subcommand)     │
│  127.0.0.1:<ephemeral>   Authorization: Bearer <token>        │
│                                                               │
│   GET  /v1/events         ── SSE: deltas, progress, approvals │
│   POST /v1/…              ── JSON commands                    │
│                                                               │
│   internal/daemon  ──►  agent · wiki · skills · plan ·        │
│                         generate · scan · session · config    │
└───────────────────────────────────────────────────────────────┘
                            │
                            ▼
                    the user's repository
                    .kaioken/  ·  ~/.kaioken/config.yaml
```

The front-end talks HTTP **directly** to the daemon. Rust is not a proxy — it
hands over a port and a token and otherwise stays out of the data path. Full
rationale and the rejected alternatives are in
[`docs/01-architecture.md`](docs/01-architecture.md).

## 4. Milestones

Each milestone is a shippable increment with a hard acceptance test. The agent
must not start milestone N+1 until N's acceptance passes.

### M0 — Skeleton and handshake  *(≈ tasks T001–T012)*

Scaffold `desktop/`, add `kaioken daemon` with `/v1/health` and `/v1/events`,
spawn it from Rust, prove the round trip.

**Acceptance**
- `cd cli && go build ./...` and `go vet ./...` clean.
- `kaioken daemon -port 0` prints one JSON handshake line to stdout, then serves.
- `curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:$PORT/v1/health` → `{"status":"ok",…}`.
- An unauthenticated request returns `401`; a request with `Origin: http://evil.example` returns `403`.
- `npm run tauri dev` opens a window showing a green status bar: `daemon ok · v0.x · port 54312`.
- Closing the window leaves no orphaned `kaioken-daemon` process (check Task Manager / `ps`).

### M1 — Workspaces  *(T013–T020)*

Repo picker, recents, open/close, scan summary, git status, config read/write,
`init`.

**Acceptance**
- Picking a folder with no `.kaioken/` offers *Initialize*, which writes `config.yaml`.
- The sidebar lists the last 10 repos with branch and dirty-count.
- Editing concurrency/notes in the GUI and running `kaioken scan` in a terminal
  shows the same values — verified by opening `.kaioken/config.yaml`.

### M2 — Chat  *(T021–T034)*

Sessions, streaming replies, tool-call cards, the approval dialog with a real
diff, undo, cost meter, cancel.

**Acceptance**
- A reply streams token by token with no visible stutter on a 400-line answer.
- `write_file` opens a modal showing an added/removed line diff; **Deny** leaves
  the file byte-identical (verify with `git status`).
- `/undo` equivalent restores the previous content, and deletes a file the agent
  created.
- Cancel mid-stream stops within 500 ms and leaves the transcript coherent.
- Quitting and reopening the app, then choosing the session, restores the transcript
  from `.kaioken/sessions/*.json`.

### M3 — Pipeline runs  *(T035–T043)*

Wiki (multiplier 1–10, force, retry), update, plan, generate/cards, skills, scan —
all as cancellable background runs with live progress.

**Acceptance**
- The pre-flight estimate (`wiki.EstimateRun`) is shown before the run and matches
  the CLI's printed estimate for the same repo and multiplier.
- Progress lines appear in the run console as documents are written; each finished
  document is clickable and opens in the reader.
- Cancelling a wiki run stops within one in-flight LLM call and marks the run
  `cancelled`, not `failed`.
- Two runs (e.g. skills + update) can be queued and tracked independently.

### M4 — Wiki reader and plan editors  *(T044–T053)*

Section tree, document reader with TOC and mermaid, full-text search,
`wiki_plan.yaml` and `architecture.md` editors.

**Acceptance**
- Every document under `.kaioken/wiki/` renders, including mermaid blocks, with
  cross-document links working.
- Search finds a phrase in a chapter and jumps to it with the surrounding snippet.
- Editing the plan in the GUI, saving, and re-running the wiki honours the edit
  (the run log says *reusing existing wiki_plan.yaml*).
- A YAML edit that breaks the schema is rejected in the GUI with a line number,
  and the file on disk is unchanged.

### M5 — Cards and skills  *(T054–T060)*

Module table with freshness, `modules.yaml` editor, card viewer, skills list and
`SKILL.md` viewer/editor.

**Acceptance**
- Module freshness in the GUI matches `kaioken status` for the same repo.
- Generating one module from the GUI writes only that module's card files.
- Skills list shows `name` + `description` parsed from front-matter and opens the
  body rendered.

### M6 — Settings and parity  *(T061–T066)*

Providers, keys, live model catalogue, defaults, scope, notes, max tokens,
`run_command` toggle, hook install/remove. Parity checklist signed off.

**Acceptance**
- Every TUI slash command in `README.md` has a GUI equivalent, ticked off in a
  table in `docs/06-screens.md`.
- A key entered in the GUI is usable by the CLI in a new terminal, and the key is
  never returned by any API response (only a masked hint).

### M7 — Ship  *(T067–T072)*

Command palette, keyboard map, toasts, empty states, updater, installers, CI.

**Acceptance**
- `npm run tauri build` produces an NSIS installer on Windows, a `.dmg` on macOS,
  and `.deb` + `.AppImage` on Linux, each launching to a working window on a
  machine without a Go or Rust toolchain.
- The installed app upgrades cleanly over a previous version **including the
  sidecar** (see risk R1 — this needs an explicit check).

## 5. Definition of done for the whole project

- [ ] All seven milestones' acceptance tests pass on Windows 11 and one of macOS/Linux.
- [ ] `go test ./...` in `cli/` passes, including new `internal/daemon` tests.
- [ ] `cargo clippy -- -D warnings` clean in `src-tauri/`.
- [ ] `npm run build` clean with `tsc -b` (no `any` in `lib/types.ts`).
- [ ] No feature regression: the TUI and CLI still work unchanged (`kaioken tui`,
      `kaioken wiki`, `kaioken serve` all behave as before).
- [ ] `docs/02-api-contract.md` matches the implementation exactly; drift is a bug.
- [ ] The root `README.md` roadmap line about a Wails desktop version is replaced
      with a pointer to `desktop/`.
- [ ] `.gitignore` covers `desktop/node_modules/`, `desktop/dist/`,
      `desktop/src-tauri/target/`, `desktop/src-tauri/binaries/`.

## 6. How to work this plan

- **Order matters.** `docs/10-tasks.md` is topologically sorted. Dependencies are
  called out where they are not obvious.
- **The contract is frozen first.** Implement `docs/02-api-contract.md` in Go
  before writing any front-end code that consumes it. Every endpoint gets a Go
  test using `httptest` before a React component touches it.
- **Verify at the seam, not through the GUI.** A failing screen is three layers
  deep. `curl` the endpoint first; if the JSON is right, the bug is in React.
- **Do not invent endpoints.** If a screen needs data the contract does not
  expose, amend `docs/02-api-contract.md` in the same commit that adds the
  handler, and say so in the commit message.
- **Windows build gotchas are real** — see [`docs/09-risks.md`](docs/09-risks.md)
  R2 and R3 before the first `go build`.
