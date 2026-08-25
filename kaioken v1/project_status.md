# Kaioken Desktop — What to Add Next

## Current State

The desktop app is **already well past its original M0–M1 plan** and has organically grown a rich feature set. Here's what exists today:

### ✅ What's Built

| Area | Status | Key files |
|------|--------|-----------|
| **Tauri shell** | ✅ Sidecar spawn, handshake, kill-on-exit | [daemon.rs](file:///d:/project/ai_now_know/desktop/src-tauri/src/daemon.rs), [lib.rs](file:///d:/project/ai_now_know/desktop/src-tauri/src/lib.rs) |
| **Go daemon** | ✅ 32 files — health, SSE, workspace, chat, runs, docs, editor, explorer, browser, research, extensions, settings, usage | [cli/internal/daemon/](file:///d:/project/ai_now_know/cli/internal/daemon) |
| **Workspace picker** | ✅ Recents, folder picker, init, scan | [Welcome.tsx](file:///d:/project/ai_now_know/desktop/src/routes/Welcome.tsx) |
| **Chat** | ✅ Sessions, streaming, tool cards, approval dialog, diff view, slash commands, autocomplete | [Chat.tsx](file:///d:/project/ai_now_know/desktop/src/routes/Chat.tsx) |
| **Wiki reader** | ✅ Tree, document reader | [Wiki.tsx](file:///d:/project/ai_now_know/desktop/src/routes/Wiki.tsx) |
| **Editor** | ✅ File viewer/editor | [Editor.tsx](file:///d:/project/ai_now_know/desktop/src/routes/Editor.tsx) |
| **File explorer** | ✅ Tree explorer | [explorer/](file:///d:/project/ai_now_know/desktop/src/components/explorer) |
| **Embedded terminal** | ✅ PTY-based terminal via Rust | [term.rs](file:///d:/project/ai_now_know/desktop/src-tauri/src/term.rs), [TerminalPanel.tsx](file:///d:/project/ai_now_know/desktop/src/components/terminal/TerminalPanel.tsx) |
| **Browser** | ✅ In-app web browser | [Browser.tsx](file:///d:/project/ai_now_know/desktop/src/routes/Browser.tsx) |
| **Graph** | ✅ Knowledge graph visualization | [Graph.tsx](file:///d:/project/ai_now_know/desktop/src/routes/Graph.tsx) |
| **Activity / runs** | ✅ Pipeline run console | [Activity.tsx](file:///d:/project/ai_now_know/desktop/src/routes/Activity.tsx) |
| **Cards** | ✅ Module table, card viewer | [Cards.tsx](file:///d:/project/ai_now_know/desktop/src/routes/Cards.tsx) |
| **Extensions** | ✅ Extension/plugin management | [Extensions.tsx](file:///d:/project/ai_now_know/desktop/src/routes/Extensions.tsx) |
| **Research** | ✅ Web research features | [Research.tsx](file:///d:/project/ai_now_know/desktop/src/routes/Research.tsx) |
| **Settings** | ✅ Full settings with providers, keys, model picker | [Settings.tsx](file:///d:/project/ai_now_know/desktop/src/routes/Settings.tsx) |
| **Command palette** | ✅ Fuzzy search | [CommandPalette.tsx](file:///d:/project/ai_now_know/desktop/src/components/CommandPalette.tsx) |
| **Toasts** | ✅ Notification system | [Toaster.tsx](file:///d:/project/ai_now_know/desktop/src/components/Toaster.tsx) |
| **Keyboard shortcuts** | ✅ Shortcut help panel | [ShortcutHelp.tsx](file:///d:/project/ai_now_know/desktop/src/components/ShortcutHelp.tsx) |

---

## 🎯 Recommended Additions (by priority)

### 1. **Gap Areas from the Plan** (High Priority)

These are spec'd in [PLAN.md](file:///d:/project/ai_now_know/desktop/PLAN.md) but may not be fully wired:

| What | Why | Spec reference |
|------|-----|----------------|
| **Structured diff in approval dialog** | The plan calls for a real side-by-side diff with syntax highlighting and per-hunk context — the #1 reason the desktop exists. Verify the [DiffView.tsx](file:///d:/project/ai_now_know/desktop/src/components/chat/DiffView.tsx) (2.5 KB) matches the §6.3 spec. | T027, T032 |
| **Wiki plan/brief editors** | YAML editors with validation and schema-error rejection. Is `PlanEditor` built? | T052–T053 |
| **Skills viewer/editor** | List skills with parsed front-matter, rendered body, stale detection | T059–T060 |
| **Multiplier dial + estimate card** | The pre-flight wiki estimate before runs, matching the CLI's output | T041 |
| **Stale-wiki banner** | Compare wiki state against HEAD, offer "Update" | T051 |
| **Contract-version guard** | Block UI if sidecar version mismatches (partially built in [main.tsx](file:///d:/project/ai_now_know/desktop/src/main.tsx)) | T070 |
| **Quit-with-active-runs guard** | Confirm dialog naming active runs on window close | T043 |

### 2. **Polish & Quality of Life** (Medium Priority)

| What | Why |
|------|-----|
| **Undo with visual feedback** | `POST /undo` exists but the UI should show what was restored with a toast + diff |
| **Cost meter (always-visible)** | The StatusBar should show cumulative usage — the plan says this replaces `/cost` |
| **Session export/share** | Export a chat transcript as markdown |
| **In-wiki search** (`⌘F`) | Full-text search with jump-to-hit and highlight (T050) |
| **Mermaid diagram rendering** | The wiki reader should render mermaid blocks — verify this works in [DocReader](file:///d:/project/ai_now_know/desktop/src/components/wiki) |
| **Empty states for every route** | Every screen should have a helpful empty state, not just a blank panel |
| **Error copy for all `ApiError.code`s** | Map every error to a human sentence + next action (T069) |

### 3. **New Features Beyond the Plan** (Lower Priority, High Impact)

Since the app has grown beyond the original plan with features like embedded terminal, browser, research, extensions, and graph view, consider:

| What | Why |
|------|-----|
| **Split-pane / multi-tab editing** | The editor shows "no files open" — support multiple tabs with a split view |
| **Terminal ↔ Chat integration** | Let the agent's `run_command` tool show output inline in the terminal panel |
| **Drag-and-drop files into chat** | Drop a file from the explorer into the composer to reference it |
| **Workspace dashboard** | A home view after workspace opens showing: git status, stale wiki, recent sessions, active runs — instead of going straight to "No files open" |
| **Theming** | The plan says "no theming beyond light/dark" for v1, but a few accent-color options would be cheap and delightful |
| **Notifications** | OS-native notifications when a long-running pipeline finishes |
| **Auto-updater** | Tauri's built-in updater for seamless sidecar + app updates (T071) |

### 4. **Testing & CI** (Ship-blocking)

| What | Spec |
|------|------|
| `cargo clippy -- -D warnings` clean | PLAN.md §5 |
| `npm run build` with `tsc -b` — no `any` | PLAN.md §5 |
| `go test ./...` passes including daemon tests | PLAN.md §5 |
| CI workflow (`.github/workflows/desktop.yml`) | T072 |
| Installer builds (NSIS/Windows, .dmg/macOS, .deb+AppImage/Linux) | T071 |

---

## 🔥 My Recommendation: Start Here

> [!IMPORTANT]
> The app already has impressive breadth. The biggest gaps are **depth and wiring** — making sure every screen that exists is fully functional end-to-end, not just scaffolded. I'd focus on:

1. **Audit each route against its spec** — open every screen and verify it actually does what §6 says
2. **Wire the approval dialog's structured diff** — this is the killer feature of the desktop vs. the TUI
3. **Add the cost meter to the status bar** — always-visible usage is a key differentiator
4. **Run `tsc -b` and fix all type errors** — zero `any`s, clean build
5. **Add the quit-with-active-runs guard** — losing work on close is a trust-destroyer

Want me to dive deep into any of these? I can audit a specific route, implement a feature, or run the build checks.
