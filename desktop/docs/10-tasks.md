# 10 — Task breakdown

Topologically ordered. Each task names the files it touches and a **check** that
must actually be run. A task is done when every check line passes.

Conventions used below:
- `$AUTH` = `-H "Authorization: Bearer devtoken"`
- `$D` = `http://127.0.0.1:7788/v1`
- Dev daemon: `cd cli && go run ./cmd/kaioken daemon -port 7788 -token devtoken`
- Windows: prefix Go commands with `$env:Path += ";C:\Program Files\Go\bin"`

---

# M0 — Skeleton and handshake

### T001 · Scaffold the front-end project
**Files:** `desktop/package.json`, `index.html`, `vite.config.ts`, `tsconfig*.json`, `src/main.tsx`, `src/App.tsx`, `src/index.css`
Copy the dependency set from `05-frontend.md` §5.1. Vite server port **1420**,
`strictPort: true`, `@` alias to `./src`. Copy `website/src/index.css` and delete
the hero-only classes (`crt-scanlines`, `rule-sweep`, `term-grid`), keeping the
whole palette and `@theme inline` block.
**Check:** `npm install && npm run dev` serves a page on :1420 showing the
Kaioken wordmark in `--kai-orange` on `--kai-black`.

### T002 · Scaffold the Rust shell
**Files:** `desktop/src-tauri/{Cargo.toml,build.rs,tauri.conf.json,src/main.rs,src/lib.rs}`, `capabilities/default.json`, `icons/`
Use the exact `tauri.conf.json` and capability set from `04-rust-shell.md`,
including the CSP. Generate icons with `npm run tauri icon` from the Kaioken mark.
**Check:** `npm run tauri dev` opens a window rendering the T001 page.
`cargo clippy -- -D warnings` clean.

### T003 · Sidecar build script
**Files:** `desktop/scripts/build-sidecar.mjs`, `package.json` (predev/prebuild/sidecar scripts)
Implement all six requirements in `07-build-release.md` §7.2 — Go discovery,
triple mapping, temp-name-then-rename, version ldflags, freshness skip.
**Check:** `node scripts/build-sidecar.mjs` produces
`src-tauri/binaries/kaioken-daemon-<triple>[.exe]`; running it again prints
`sidecar up to date`; renaming Go off `PATH` still works.

### T004 · `internal/daemon` package skeleton + `/v1/health`
**Files:** `cli/internal/daemon/{daemon.go,mux.go,jsonx.go,handlers_system.go}`
`Options`, `Run`, listener on `:0`, the handshake line, the middleware chain
(auth, origin, recover, log), `GET /v1/health`, `POST /v1/shutdown`.
**Check:**
```
go run ./cmd/kaioken daemon -port 7788 -token devtoken
curl -s $AUTH $D/health | jq .status              # "ok"
curl -s -o /dev/null -w '%{http_code}' $D/health  # 401
curl -s -o /dev/null -w '%{http_code}' $AUTH -H "Origin: http://evil.example" $D/health  # 403
```

### T005 · `daemon` subcommand wiring
**Files:** `cli/cmd/kaioken/main.go`
Add the `daemon` case, `-token` / `-token-stdin` flags, and the usage line.
`-token-stdin` reads the first stdin line, then leaves stdin open as the
death-watch.
**Check:** `go vet ./...` clean; `kaioken help` lists `daemon`;
`printf 'tok\n' | go run ./cmd/kaioken daemon -port 7788 -token-stdin` serves and
authenticates with `tok`.

### T006 · Auth, origin, and error-envelope tests
**Files:** `cli/internal/daemon/daemon_test.go`
The table from `08-testing.md` §8.1 plus envelope-shape assertions.
**Check:** `go test ./internal/daemon -run TestAuth -v` passes.

### T007 · Event hub
**Files:** `cli/internal/daemon/hub.go`, `hub_test.go`
Ring buffer of 512, `Publish`/`Subscribe`/`Replay`, non-blocking fan-out,
typed publisher methods for every §2.3 event.
**Check:** `go test ./internal/daemon -run TestHub` covers ordering, replay, and
the slow-subscriber drop.

### T008 · SSE endpoint
**Files:** `cli/internal/daemon/sse.go`, `sse_test.go`
Headers per §2.2, immediate flush, `?since` replay, 20 s heartbeat.
**Check:** `curl -sN $AUTH "$D/events"` prints a `ready` frame immediately, then
`: ping` every 20 s. Test asserts replay and `stream.reset`.

### T009 · Spawn the sidecar from Rust
**Files:** `desktop/src-tauri/src/daemon.rs`, `src/lib.rs`
Token generation, `--token-stdin` write, 10 s handshake timeout, stdout/stderr
drain loop, `DaemonState`, kill on `ExitRequested`, `daemon://up|down|dead`.
**Check:** `npm run tauri dev`; the Tauri log shows the parsed port. Close the
window → no `kaioken-daemon` in Task Manager / `ps`.

### T010 · `daemon_info` and the other three commands
**Files:** `desktop/src-tauri/src/commands.rs`
`daemon_info`, `pick_folder`, `reveal_path`, `open_external` (scheme allow-list).
**Check:** `cargo test` covers the scheme rejection; the front-end can `invoke`.

### T011 · Front-end bootstrap and API client core
**Files:** `desktop/src/lib/{daemon.ts,api.ts,types.ts,format.ts}`, `src/main.tsx`
`bootstrap()` before render, `ApiError.from`, `api.health()`. Types for `Health`
and the error envelope only — grow `types.ts` per feature, never speculatively.
**Check:** the window renders `daemon ok · v0.4.0 · port 54312` from a real
`/v1/health` call. **This proves CSP (R4) and the whole chain.**

### T012 · SSE client + status pill
**Files:** `desktop/src/lib/{sse.ts,events.ts}`, `src/components/layout/StatusBar.tsx`, `src/lib/__tests__/sse.test.ts`
Frame parser, reconnect loop with `since`, connection status. Vitest cases from
§8.3.
**Check:** `npm test` passes; killing the daemon turns the pill amber then green
on restart, with no duplicated events after reconnect.

> **M0 acceptance:** run every check in `PLAN.md` §4 M0 before continuing.

---

# M1 — Workspaces

### T013 · Workspace manager
**Files:** `cli/internal/daemon/workspace.go`, `workspace_test.go`
`Manager`, `Workspace`, deterministic `ws_` ids, recents in
`~/.kaioken/recents.json` honouring `KAIOKEN_HOME`, lazy client construction
reusing the CLI's resolution order (`cmd/kaioken/main.go:339`).
**Check:** `go test ./internal/daemon -run TestWorkspace`; recents survive a
restart; the same path always yields the same id.

### T014 · Workspace endpoints
**Files:** `cli/internal/daemon/handlers_workspace.go`, `handlers_workspace_test.go`
`GET/POST /workspaces`, `GET/DELETE /workspaces/{id}`, `POST /init`.
Build the `knowledge` sub-object from `plan.Load`, `state.Load`,
`wiki.LoadStamp`, `skills.List`.
**Check:** `curl -s $AUTH -XPOST $D/workspaces -d '{"path":"D:/project/ai_now_know"}' | jq`
returns the full §2.4 shape with `knowledge.wiki_docs: 71`.

### T015 · Scan, status, git, hook
**Files:** same handler file; `cli/internal/scan/scan.go` (add `Languages()`)
`GET /scan` (60 s cache + `?refresh`), `GET /status` (four states matching
`cmdStatus`), `GET /git`, `POST /hook`.
**Check:** `/status` output matches `kaioken status` run in the same repo,
module for module.

### T016 · Config endpoints
**Files:** `cli/internal/daemon/handlers_workspace.go`
`GET/PUT /config` with validation, `effective_concurrency`, YAML round-trip
through `config.Config.Save`, client rebuild on model/provider change.
**Check:** PUT then `cat .kaioken/config.yaml` — values applied, comment header
intact, `config.Load` accepts it.

### T017 · Workspace store and shell layout
**Files:** `desktop/src/store/workspace.ts`, `src/components/layout/{AppShell,NavRail,StatusBar}.tsx`, `src/App.tsx`
HashRouter, nav rail, top bar, single event dispatcher wired to the stores.
**Check:** navigation between five empty routes works; the dispatcher warns on
unknown event types.

### T018 · Welcome screen and folder picker
**Files:** `desktop/src/routes/Welcome.tsx`
Recents with missing-path handling, `pick_folder`, drag-and-drop.
**Check:** open this repo from the picker → workspace opens, appears in recents,
survives an app restart.

### T019 · Workspace switcher and init banner
**Files:** `desktop/src/components/layout/AppShell.tsx`
Top-bar dropdown; a banner offering *Initialize* when `has_config` is false.
**Check:** open a folder with no `.kaioken/` → banner → Initialize → the file
exists on disk with the default model.

### T020 · Scan summary panel
**Files:** `desktop/src/routes/Welcome.tsx` (or a Workspace panel)
File count, size, language breakdown, tree preview, refresh.
**Check:** counts match `kaioken scan` for the same repo.

> **M1 acceptance:** `PLAN.md` §4 M1.

---

# M2 — Chat

### T021 · Export `DiffHunks`
**Files:** `cli/internal/agent/diff.go`, `diff_test.go`
Add `Hunk`, `DiffLine`, `DiffHunks(old, new)` with 3 lines of context and the
400-line cap. **Do not change the existing preview functions** — the TUI uses them.
**Check:** `go test ./internal/agent -run TestDiffHunks` covers all eight cases
in §8.1.

### T022 · Run registry
**Files:** `cli/internal/daemon/runs.go`, `runs_test.go`
`Run`, `Runs.Start/Cancel/ActiveKind`, cancelled-vs-failed, panic safety, the
`wiki.Progress` and `generate.Options` adapters, 50-run retention.
**Check:** the cancel and panic tests from §8.1 pass.

### T023 · Approval registry
**Files:** `cli/internal/daemon/approvals.go`, `approvals_test.go`
Register / Resolve / Expire / CancelRun, buffered channels, 5-minute timeout.
**Check:** blocking, resolution, timeout-denies, and unknown-id-404 all tested.

### T024 · `agent.UI` bridge
**Files:** `cli/internal/daemon/chatui.go`; promote `compactArgs` into `internal/agent`
Implement all seven `agent.UI` methods against the hub. **Do not import
`internal/tui`.**
**Check:** `go build ./...`; `go list -deps ./internal/daemon | grep bubbletea`
returns nothing.

### T025 · Session endpoints
**Files:** `cli/internal/daemon/handlers_chat.go`, `handlers_chat_test.go`
List / create / get / delete sessions over `internal/session`, unchanged on-disk
format.
**Check:** a session created via the API is listed by `/sessions` and readable by
the TUI's `/resume`.

### T026 · Send message → agent run
**Files:** `cli/internal/daemon/handlers_chat.go`
`POST /messages` → `202 {run_id}`; build history with `agent.SystemPrompt`; run
the agent inside `Runs.Start`; save the session after the turn (including on
failure); emit `session.updated`.
**Check:** with a fake provider (`base_url` → httptest), a message produces
`chat.delta`… → `chat.message` → `run.finished{done}` on the event stream.

### T027 · Approval endpoint
**Files:** `cli/internal/daemon/handlers_chat.go`
`POST /approvals/{id}`; attach the structured `diff` to `approval.request`.
**Check:** a fake provider that requests `write_file` emits `approval.request`
with populated `diff.hunks`; POSTing `deny` leaves the file absent.

### T028 · Undo and usage
**Files:** `cli/internal/daemon/handlers_chat.go`
`POST /undo` over `agent.Restore`, `GET /usage` from `llm.Client.Usage()`.
**Check:** approve a write, undo it, `git status` is clean.

### T029 · Chat store
**Files:** `desktop/src/store/chat.ts`, `src/store/__tests__/chat.test.ts`
Transcript, live buffer, tool-call map, approval slot, send/cancel/resolve.
**Check:** the delta-then-message test (§8.3) proves no duplicated prose.

### T030 · Transcript and message rendering
**Files:** `desktop/src/components/chat/{Transcript,Message,StreamingText}.tsx`, `components/common/{Markdown,Mermaid,CodeBlock}.tsx`
Copy the three common components from `website/`; rewire links per §5.7.
Apply the §5.6 streaming strategy.
**Check:** a 400-line reply streams with no visible stutter; committed messages
do not re-render (verify with React DevTools' highlight-updates).

### T031 · Tool-call cards
**Files:** `desktop/src/components/chat/ToolCallCard.tsx`
TUI glyph vocabulary, collapsed by default, error styling.
**Check:** a turn using `read_file` + `search` shows two cards with correct
glyphs and one-line summaries.

### T032 · Approval dialog + diff view
**Files:** `desktop/src/components/chat/{ApprovalDialog,DiffView}.tsx`
The §6.3 spec: focus trap, `Y`/`N`/`A`, new-file and `run_command` variants,
expiry bar, queued-approval counter, **no auto-focus on approve**.
**Check:** propose an edit → deny → `git status` shows no change; approve →
change on disk; the run-command variant has no *apply all*.

### T033 · Composer, slash menu, per-turn toggles
**Files:** `desktop/src/components/chat/{Composer,SlashMenu}.tsx`
`Enter` sends, `Alt+Enter`/`Ctrl+J` newline, `/` menu mirroring
`internal/tui/palette.go`, auto-approve and shell toggles.
**Check:** `/wiki x3` in the composer starts a wiki run instead of sending a
message; `Alt+Enter` inserts a newline.

### T034 · Session sidebar, cancel, cost meter
**Files:** `desktop/src/components/chat/{SessionList,CostMeter}.tsx`
**Check:** restart the app, reopen a session, transcript restored from disk;
`Esc` cancels a streaming turn within 500 ms.

> **M2 acceptance:** `PLAN.md` §4 M2.

---

# M3 — Pipeline runs

### T035 · Run endpoints
**Files:** `cli/internal/daemon/handlers_runs.go`, `handlers_runs_test.go`
`POST/GET /runs`, `GET /runs/{id}`, `POST /cancel`, `409 run_conflict`,
`409 no_api_key`.
**Check:** two concurrent `wiki` runs on one workspace → second returns 409.

### T036 · Wire `scan`, `plan`, `generate`
**Files:** `cli/internal/daemon/handlers_runs.go`
Map to `scan.Repo`, `plan.Generate`+`Save`, `generate.Run` with its own progress
adapter. Emit the §2.7 summaries.
**Check:** a `generate` run writes the same card files `kaioken generate` does.

### T037 · Wire `wiki`, `wiki_retry`, `update`, `skills`
**Files:** same
Multiplier clamped 1–10; `total` from the outline's section count once available.
**Check:** a ×1 wiki run on a small fixture repo completes and writes documents;
`update` after a commit rewrites only affected documents.

### T038 · Estimate endpoint
**Files:** `cli/internal/daemon/handlers_runs.go`
`GET /estimate` returning `wiki.EstimateRun` fields plus `text` verbatim.
**Check:** `text` matches the CLI's printed estimate for the same repo/multiplier,
character for character.

### T039 · Runs store
**Files:** `desktop/src/store/runs.ts`
Mirror of the registry driven by `run.*` events, with log and artifact buffers.
**Check:** events replayed after a reconnect do not duplicate log lines.

### T040 · Activity screen
**Files:** `desktop/src/routes/Activity.tsx`, `src/components/wiki/RunConsole.tsx`
§6.7: rows, expandable logs, clickable artifacts, cancel, retry, auto-follow.
**Check:** a live wiki run shows progress lines as documents are written; cancel
marks it `cancelled` and not `failed`.

### T041 · Multiplier dial + estimate card
**Files:** `desktop/src/components/wiki/{MultiplierDial,EstimateCard}.tsx`
Captions from the README's multiplier table; amber when `heavy`.
**Check:** changing the dial refetches the estimate; ×10 shows the correction pass.

### T042 · Wiki run panel
**Files:** `desktop/src/routes/Wiki.tsx` (no-wiki mode)
§6.4a, including the force checkbox.
**Check:** starting a run navigates to Activity and streams progress.

### T043 · Quit-with-active-runs guard
**Files:** `desktop/src-tauri/src/lib.rs`, `desktop/src/App.tsx`
Confirm dialog naming active runs; quitting cancels them.
**Check:** close the window mid-run → dialog → confirm → no orphan process.

> **M3 acceptance:** `PLAN.md` §4 M3.

---

# M4 — Wiki reader and editors

### T044 · Wiki tree and document endpoints
**Files:** `cli/internal/daemon/handlers_docs.go`, `handlers_docs_test.go`; `cli/internal/wiki/provenance.go` (export `ReadProvenance`)
`GET /wiki/tree`, `GET /wiki/doc` with `toc` + `provenance`, `GET /wiki/changelog`.
Ordering matches `internal/serve`.
**Check:** the tree lists 11 sections / 71 documents for this repo; a document
returns non-empty `provenance`.

### T045 · `safeJoin` and the traversal test suite
**Files:** `cli/internal/daemon/handlers_docs.go`, `handlers_docs_test.go`
One helper used by every path-taking handler; the hostile-input table from §8.1
including a symlink case.
**Check:** every hostile path returns `403 path_escape`. **Do not proceed until
all of them do** (R9).

### T046 · Wiki search
**Files:** `cli/internal/daemon/handlers_docs.go`
Case-insensitive, scored, snippets with the match highlighted by offset.
**Check:** searching `provenance` in this repo returns hits in the expected
chapters.

### T047 · Source file endpoint
**Files:** `cli/internal/daemon/handlers_docs.go`
`GET /file` with line range, language detection via `codemap.Lang`, 1 MB cap.
**Check:** a range request returns exactly the requested lines.

### T048 · Docs store + wiki tree UI
**Files:** `desktop/src/store/docs.ts`, `src/components/wiki/WikiTree.tsx`
**Check:** every section expands; the active document is highlighted.

### T049 · Document reader
**Files:** `desktop/src/components/wiki/{DocReader,DocToc}.tsx`
Markdown, mermaid (lazy, fail-soft), scroll-spy TOC, referenced-files rail,
header actions.
**Check:** every one of this repo's 71 documents renders; mermaid diagrams draw;
an invalid diagram degrades to a code block rather than an error box.

### T050 · In-app search UI
**Files:** `desktop/src/components/wiki/WikiSearch.tsx`
`⌘F`, live results, jump-to-hit with highlight.
**Check:** selecting a hit opens the document scrolled to that line.

### T051 · Stale-wiki banner
**Files:** `desktop/src/routes/Wiki.tsx`
Compare `wiki_state.yaml`'s base against HEAD; offer *Update*.
**Check:** after a commit, the banner appears with the correct commit count.

### T052 · Plan and brief endpoints
**Files:** `cli/internal/daemon/handlers_docs.go`
`GET/PUT /wiki/plan` (dual outline+yaml), `GET/PUT /wiki/brief`,
`422 invalid_yaml` with `problems[]`, file untouched on failure.
**Check:** an invalid PUT returns line numbers; the file's bytes are unchanged.

### T053 · Plan editor UI
**Files:** `desktop/src/components/wiki/{PlanEditor,BriefEditor}.tsx`, `src/components/common/YamlEditor.tsx`
Form + YAML views, validation gutter, save disabled while invalid.
**Check:** edit a section goal, save, re-run the wiki → the run log says
*reusing existing wiki_plan.yaml* and the edit is honoured.

> **M4 acceptance:** `PLAN.md` §4 M4.

---

# M5 — Cards and skills

### T054 · Cards endpoints
**Files:** `cli/internal/daemon/handlers_docs.go`
`GET /cards`, `GET /cards/{module}/{card}`.
**Check:** module list matches `.kaioken/knowledge/` on disk.

### T055 · Modules endpoints
**Files:** `cli/internal/daemon/handlers_docs.go`
`GET/PUT /modules` with `plan.Validate` warnings and coverage percentage.
**Check:** coverage matches what `kaioken plan` reports.

### T056 · Skills endpoints
**Files:** `cli/internal/daemon/handlers_docs.go`
`GET /skills` with `stale` computation, `GET/PUT /skills/{name}` validated
through `skills.Parse`.
**Check:** touching a source file flips that skill's `stale` to true.

### T057 · Cards screen
**Files:** `desktop/src/routes/Cards.tsx`, `src/components/cards/{ModuleTable,CardViewer}.tsx`
§6.5 state glyphs matching the CLI; per-module regenerate.
**Check:** regenerating one module writes only that module's files.

### T058 · Modules editor
**Files:** `desktop/src/components/cards/ModulesEditor.tsx`
Coverage bar, validation warnings.
**Check:** an invalid module tree is rejected with the offending line.

### T059 · Skills screen
**Files:** `desktop/src/routes/Skills.tsx`, `src/components/skills/{SkillList,SkillViewer}.tsx`
**Check:** front-matter renders as fields; the body renders as markdown; the
empty state explains what a skill is.

### T060 · Skills build actions
**Files:** `desktop/src/routes/Skills.tsx`
*Build*, *Rebuild all (force)*, per-skill regenerate.
**Check:** a build run writes `SKILL.md` files and refreshes the list live.

> **M5 acceptance:** `PLAN.md` §4 M5.

---

# M6 — Settings and parity

### T061 · Settings endpoints
**Files:** `cli/internal/daemon/handlers_settings.go`, `handlers_settings_test.go`
`GET/PUT /settings`, key write/delete/test, `key_source`, masked hints.
**Check:** the key-redaction substring assertion (§8.1) passes for every settings
response.

### T062 · Models endpoint
**Files:** `cli/internal/daemon/handlers_settings.go`
`GET /models` with a 10-minute per-provider cache and `?refresh`.
**Check:** two calls hit the provider once; `?refresh=true` hits it again.

### T063 · Settings store and screen
**Files:** `desktop/src/store/settings.ts`, `src/routes/Settings.tsx`, `src/components/settings/*`
All six sections from §6.8.
**Check:** a key entered here is usable by `kaioken models` in a fresh terminal.

### T064 · Model picker and free-model badges
**Files:** `desktop/src/components/settings/ModelPicker.tsx`, top-bar picker
`:free` badge plus the concurrency-clamp note.
**Check:** selecting a `:free` model shows the clamp; the workspace config
records the new model.

### T065 · Notes and scope editors
**Files:** `desktop/src/components/settings/{NotesEditor,ScopeEditor}.tsx`
Notes get real space and a worked example; scope shows a live matched-file count.
**Check:** a note added here appears in `.kaioken/config.yaml` and affects the
next generation prompt.

### T066 · Parity sign-off
**Files:** `desktop/docs/06-screens.md` (tick the §6.10 table)
Walk every row; anything unticked is either implemented or explicitly deferred
with a reason written into the table.
**Check:** the table has no blank rows.

> **M6 acceptance:** `PLAN.md` §4 M6.

---

# M7 — Ship

### T067 · Command palette
**Files:** `desktop/src/components/layout/CommandPalette.tsx`
Fuzzy over navigation, slash commands, recents, documents, skills, settings.
**Check:** `⌘K` → typing a document title opens it.

### T068 · Keyboard map and shortcut help
**Files:** `desktop/src/lib/keys.ts`, help panel
The full §5.8 table, discoverable from the palette.
**Check:** every listed shortcut works on Windows and one other platform.

### T069 · Toasts, empty states, error copy
**Files:** `desktop/src/components/layout/Toaster.tsx`, various
Every `ApiError.code` from §2.1 maps to a human sentence and an action. `:free`
tool-calling failures get the R11 copy.
**Check:** trigger `no_api_key`, `run_conflict`, and `provider_error` — each
shows a useful message with a next step.

### T070 · Contract-version guard
**Files:** `cli/internal/daemon/handlers_system.go`, `desktop/src/lib/daemon.ts`
Add `contract` to `/v1/health`; the front-end blocks on mismatch (R1/R15).
**Check:** hand-edit the constant, restart, confirm the blocking banner appears.

### T071 · Installers
**Files:** `desktop/src-tauri/tauri.conf.json`, release notes
Build on each platform; verify launch on a machine without Go or Rust.
**Check:** **install 0.1.0, then 0.1.1, and confirm `/v1/health` reports 0.1.1**
— the R1 sidecar-replacement check. Do not skip it.

### T072 · CI and repository housekeeping
**Files:** `.github/workflows/desktop.yml`, root `.gitignore`, root `README.md`
The §7.7 workflow; ignore desktop build outputs; update the layout section and
replace the Wails roadmap line.
**Check:** CI green on a PR; `git status` clean after a full local build.

> **M7 acceptance:** `PLAN.md` §4 M7, then the whole-project definition of done in
> `PLAN.md` §5.

---

## Summary

| Milestone | Tasks | New Go | New Rust | New TS |
| --- | --- | --- | --- | --- |
| M0 skeleton | T001–T012 | ~600 | ~400 | ~400 |
| M1 workspaces | T013–T020 | ~500 | — | ~600 |
| M2 chat | T021–T034 | ~700 | — | ~1400 |
| M3 runs | T035–T043 | ~400 | ~30 | ~700 |
| M4 wiki | T044–T053 | ~500 | — | ~1100 |
| M5 cards/skills | T054–T060 | ~250 | — | ~700 |
| M6 settings | T061–T066 | ~250 | — | ~600 |
| M7 ship | T067–T072 | ~50 | — | ~500 |
| **total** | **72** | **~3,250** | **~430** | **~6,000** |

Plus ~900 lines of Go tests and ~400 of front-end tests. Engine modifications:
under 60 lines, all additive (`agent.DiffHunks`, `wiki.ReadProvenance`,
`scan.Languages`, promoting `compactArgs`).
