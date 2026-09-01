# Kaioken Studio v0.1 — Build Plan

**Status: STARTED 2026-09-01**, at the user's explicit instruction, ahead of the
prerequisite below. What exists now, and the decisions the build forced, are recorded in
`studio-v0.1-build-notes.md` — read that alongside this plan.

**Prerequisite that was knowingly skipped:** `apps/tui` is not finished. The risk that
motivated the prerequisite — churning the shared `@kaioken/*` packages while the TUI is
unstable — has been mitigated rather than accepted: Studio consumes the engine by
*runtime path resolution*, declares no dependency on it, and has not modified a single
file under `kaioken_v2/packages`. See build notes section 3.

Companion documents:
- `theia-studio-research.md` — why Theia, how it plugs in, build costs, risks
- `studio-design-brief.md` — the visual specification (its CRT/glow treatment for the
  shell is superseded; see build notes section 7)
- `studio-v0.1-build-notes.md` — what was actually built, and why it differs
- `../../DESIGN.md` — the design system of record

---

## 1. What v0.1 is

The smallest build that proves the thesis: **a branded Theia desktop app where Kaioken's
existing TypeScript packages run in-process, and an agent run can be driven end to end
from a GUI.**

It is not the twelve-pane studio in `DESIGN.md`. It is two Kaioken panes bolted onto an
IDE that already supplies the editor, terminal, file tree and command palette for free.

Success looks like: open a repository, watch it index, ask the agent to change
something, approve the diff in a GUI dialog, see the file change in the editor — without
touching a terminal.

---

## 2. In scope

**Shell**
- Fork `eclipse-theia/theia-ide` (Blueprint template).
- Rebrand: application name, icons for all three platforms, welcome page, About dialog,
  user config directory renamed from `.theia-blueprint` to `.kaioken`.
- Kaioken colour tokens applied through Theia's own theming system — a Kaioken dark
  theme, ANSI-derived, per §3 of the design brief.
- Switch the bundler from webpack to esbuild early.
- Electron target only.

**Kaioken integration**
- One extension at `theia-extensions/kaioken/`.
- Backend services wrapping the existing packages in-process: `@kaioken/index`,
  `@kaioken/scan`, `@kaioken/search`, `@kaioken/agent`, `@kaioken/wiki`.
- Frontend↔backend over Theia's standard RPC (`RpcConnectionHandler` + InversifyJS).
- `kaioken_v2` and the Studio product share one npm workspace.

**Panes — two only**
- **Chat / agent runs.** Transcript with collapsible tool call cards, streaming
  assistant output, and inline diff approval. The surface that has to feel good.
- **Wiki browser.** `TreeWidget` navigator over generated docs plus a markdown reader.
  Cheapest real value in the app — it reuses a base class rather than building one.

**Chrome contributions**
- Status bar: connection state, active run count, session token accumulator.
- Multiplier control (×1–×10) in the chat composer, with its cost preview.
- Approval dialog honouring the full safety protocol: focus never on Approve, `Y`/`N`/
  `A`/`Esc`, five-minute auto-deny.

**Inherited free from Theia — build nothing**
Editor and diffs (Monaco), terminal (run `apps/tui` inside it), file explorer, command
palette, settings UI, keybindings, themes engine, Git/SCM.

---

## 3. Explicitly out of scope for v0.1

Deferred panes: Research, Graph, Cards, Browser, Activity, Extensions, Cost, Workspaces
picker, custom Settings.

Deferred chrome: custom 44px frameless titlebar, the 68px nav rail (use Theia's stock
activity bar), glassmorphism across the shell, WebGL CRT backdrop, ambient shaders.

Deferred distribution: code signing, macOS notarisation, auto-update, the browser
target, public release of any kind. v0.1 runs unpackaged via `yarn electron start`.

The graph explorer is the single largest custom build in the whole product and belongs
in its own version, not here.

---

## 4. Order of work

1. **Spike, and stop.** Fork Blueprint, rebrand it, boot it, expose one `@kaioken/*`
   package as a backend service, call it from a trivial widget. This is the only step
   that tests the document's central assumption. If in-process consumption fights the
   Theia build, everything downstream changes — find out before building panes.
2. Answer the open strategy question from `theia-studio-research.md` §4: does Kaioken
   replace Theia's shipped Coder/Architect agents, or expose itself as MCP tools inside
   them? Compare `packages/agent/src/skills.ts` against Theia's Agent Capabilities
   before deciding.
3. Kaioken dark theme and status bar contributions — small, and they make every
   subsequent screenshot look right.
4. Chat pane, including the approval dialog.
5. Wiki pane on `TreeWidget`.
6. Package once, unsigned, to learn what packaging costs before it matters.

---

## 5. Done criteria

- The app launches branded, with no "Theia" or "Blueprint" string visible to a user.
- Opening a repository indexes it, with progress shown.
- An agent run streams into the chat pane, tool calls render as cards, and a file edit
  is gated by the approval dialog.
- Approving an edit changes the file, and the change is visible in the Monaco editor.
- Generated wiki documents are browsable in the tree and readable in the reader.
- The multiplier changes run depth and its cost preview is shown before execution.
- `apps/tui` still builds and its tests still pass — the shared packages were not broken
  in service of the GUI.

---

## 6. Standing risks to re-check at start

- Theia's version has moved; verify current release and whether Theia AI's shipped
  agents now overlap Kaioken more than they did at research time (2026-08-30).
- Native module rebuilds when switching browser↔electron targets. v0.1 avoids this by
  building electron only.
- Merging the workspaces affects Kaioken's own build, test and release story. Decide
  monorepo versus published packages at step 1, not later.
