# Kaioken Studio — Desktop App Design Brief

A description of the desktop studio, written to be handed to a design tool.
Derived from `DESIGN.md` (Kaioken Design System v2) — this brief restates the desktop
surface in visual terms and names the screens to draw. Where this and `DESIGN.md`
disagree, `DESIGN.md` wins.

---

## 1. What the product is

**Kaioken Studio** is a desktop IDE for an AI coding agent and knowledge engine. It
scans a repository, builds a searchable index and a symbol graph, generates a deep
technical wiki about the codebase, runs deep research with cited sources, and drives a
tool-using agent that edits files under explicit human approval.

It is named after the Dragon Ball power-multiplier technique. A **multiplier dial, ×1
to ×10**, is the product's central control: it sets search query counts, crawl depth,
recursion limits and verification passes. Higher multiplier means deeper work, more
tokens, more money, more time — and the UI says so out loud, before you commit.

The user is a developer who lives in a terminal and is trading up to a GUI without
giving up keyboard velocity or information density.

---

## 2. The aesthetic in one line

**Cyberpunk CRT instrumentation with terminal DNA** — a monospace HUD that looks like
a power gauge, not a chat app.

Five rules that define the look, all from `DESIGN.md`:

1. **Terminal parity.** Every colour maps 1:1 to the 16-colour ANSI palette the CLI
   uses. Nothing is a "modern approximation." Switching from terminal to GUI should
   feel like the same tool.
2. **Glow means state, never decoration.** Scanlines, bracketed HUD corners, glowing
   borders, pulse dots and aura sweeps are reserved for *in-flight run, armed approval,
   dangerous power level, active selection*. **If everything glows, nothing
   communicates.**
3. **Radical cost transparency.** Token counts, dollar estimates and time estimates are
   always visible, never buried. The multiplier shows its price before it runs.
4. **Dossiers, not chat bubbles.** Agent output is structured and persistent —
   collapsible tool cards, numbered citation chips, side-by-side diffs, Mermaid
   diagrams. Not a stream of speech balloons.
5. **Terminal square contract.** Corner radii stay ≤ 4px. Terminals do not have
   rounded corners. Pills are reserved for badges only.

Mood words: instrumentation, telemetry, power gauge, phosphor, dense, armed, deliberate.
Anti-mood: friendly, rounded, pastel, airy, consumer-chat.

---

## 3. Visual foundations (copy-ready)

### Palette — dark is the primary mode

| Role | Token | Dark | Light | ANSI |
|---|---|---|---|---|
| Primary accent, active selection, section gutters, primary CTA | `--kai-orange` | `#ff8700` | `#d96e00` | 208 |
| Warnings, approval prompts, keycaps, pending steps | `--kai-amber` | `#ffaf00` | `#9a6700` | 214 |
| Logo anchor, critical danger, high power (≥ ×7) | `--kai-red` | `#ff0000` | `#cc0000` | 196 |
| Tool invocations, inline code, emphasis | `--kai-tan` | `#d7af87` | `#8a6d3b` | 180 |
| User input, shell commands, links, query paths | `--kai-blue` | `#87d7ff` | `#0072b5` | 117 |
| Success, diff additions (+), live process, fresh modules | `--kai-green` | `#00d787` | `#00875a` | 42 |
| Tool results, source file refs, secondary badges | `--kai-sage` | `#87af87` | `#4d7a4d` | 108 |
| Errors, diff deletions (−), timeouts, missing resources | `--kai-rose` | `#ff5f5f` | `#d33636` | 203 |

Surfaces are near-black panels (`--kai-ink`, `--kai-panel`) with hairline borders at
about 8% white. Glass surfaces use `blur(20px) saturate(180%)` over a 55–60% panel mix,
with an inset 1px top highlight and a deep drop shadow. Orange glass (an 8%→2% orange
gradient) marks hero and active-focus elements.

### Typography — strict dual font

- **JetBrains Mono Variable** for ~90% of the UI: chrome, code, terminals, status bars,
  buttons, badges, tables, tabs, **and chat messages**.
- **Geist Variable** only for long-form human prose: generated wiki documentation and
  research report narrative.

Key sizes: pane headers 16px/600 · sub-items and tool names 14px/600 · chat 13px/400 at
1.65 · UI labels 12px/500 · tool-call args and citations 11px/400 · badges 10px/600 at
+0.05em tracking · nav rail labels 8.5px. Section eyebrows are 10.5px/700 uppercase at
**+0.28em** tracking, rendered as `▎ 01 · FEATURES`. Wiki prose is 15px sans at 1.75.

### Density and geometry

4px base grid. Three density profiles: **dense** (2–6px) for HUD, status bar, explorer
and tool cards; **standard** (8–16px) for form fields, buttons and modals; **structural**
(24–80px) for section gaps. Radii: 4px base, 2.4/3.2/5.6px variants, 9999px for badges
only.

---

## 4. Shell anatomy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Custom titlebar (44px) — drag zone · workspace · git branch · Ctrl+K search  │
│                          · model pill · window controls                      │
├────────┬────────────────────────────────────────────────┬───────────────────┤
│        │                                                │                   │
│ Nav    │              Main route pane                   │  File explorer    │
│ rail   │      (chat / research / wiki / graph /         │  (collapsible)    │
│ 68px   │       cards / editor / browser / activity)     │  130px            │
│        │                                                │                   │
├────────┴────────────────────────────────────────────────┴───────────────────┤
│ Status bar (24px) — ● connected · 1 run · Σ tokens · theme · terminal toggle │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Titlebar, 44px.** Frameless window, custom chrome. Left: drag region and workspace
  indicator with a git branch badge. Centre: `Ctrl+K` search affordance. Right: model
  pill, window controls.
- **Nav rail, 68px.** Twelve surface buttons, each an icon over an 8.5px mono label.
  The active item carries a **glowing left indicator bracket** and a route badge.
  Accelerators `Ctrl+1`–`Ctrl+9` shown on hover as keycaps.
- **Main pane.** One of the twelve panes below.
- **File explorer, 130px, collapsible.** Tree with expansion chevrons, file-type icons,
  and per-file line counts.
- **Status bar, 24px.** Persistent telemetry only: daemon connection dot (`● connected`),
  active run count (`1 run`), session token accumulator (`Σ tokens`), theme toggle,
  terminal drawer toggle (`Ctrl+\``).

Terminal drawer slides up over the main pane, not beside it.

---

## 5. Screens to draw

Twelve panes. Each is a full artboard at the shell dimensions above.

1. **Workspaces** (`Ctrl+O`) — recent repository picker, scan statistics, module
   freshness indicators, drag-and-drop loader for a new workspace.
2. **Chat** (`Ctrl+1`) — the hero screen. Tool-using agent transcript: user turns in
   blue, collapsible **tool call cards** (glyph, name, collapsible argument JSON,
   running/success/error status) in tan, tool results in sage, streaming assistant text
   with a live cursor tail, and inline diff approval cards. Composer at the bottom with
   the multiplier dial and model pill adjacent.
3. **Research** (`Ctrl+2`) — step-by-step query decomposition as a vertical pipeline,
   multi-source search with domain favicons, and a cited report where every claim
   carries a numbered `[1]` citation chip that reveals the source on hover.
4. **Wiki** (`Ctrl+3`) — generated documentation browser. Left: table-of-contents tree.
   Centre: rendered long-form doc in Geist with mono headings, code blocks, and Mermaid
   diagrams. This is the one place prose breathes.
5. **Graph** (`Ctrl+4`) — interactive node-link canvas mapping wiki pages (orange) to
   source files (green), 297+ edges. Needs zoom, pan, node hover cards, a filter rail,
   and a legend. Dense, dark, phosphor-lit.
6. **Cards** (`Ctrl+5`) — per-module knowledge card browser, a fixed five-file set
   (`overview.md`, `architecture.md`, `conventions.md`, `tech_stack.md`).
7. **Editor** (`Ctrl+6`) — multi-language code editor with side-by-side syntax
   highlighted diffs, paired with the PTY terminal drawer (`Ctrl+\``).
8. **Browser** (`Ctrl+7`) — in-app web browser: tabs, history, URL bar, project
   quick-links.
9. **Activity** (`Ctrl+8`) — live multi-pipeline console. Concurrent background runs,
   each with a progress bar, elapsed timer and cancel hook. The most "mission control"
   screen in the app.
10. **Extensions** (`Ctrl+9`) — plugin and skill marketplace, pinned version trust
    dialogs, capability permission lists.
11. **Cost** — token and dollar expenditure dashboard, broken down by model and
    filterable by workspace. Charts allowed here, in palette.
12. **Settings** (`Ctrl+,`) — provider API keys, local model discovery, search engine
    setup, theme toggle.

### Modals and overlays to draw separately

- **Approval dialog.** The safety centrepiece. Shows the pending file write, command or
  edit with a full diff body. Keycaps `Y` approve · `N` deny · `A` approve all this turn
  · `Esc` deny. **Focus never lands on Approve** — it rests on Deny or the diff body.
  Auto-denies after five minutes, with the notice *"Denying leaves the file
  byte-identical."* Armed state gets amber glow; nothing else on screen does.
- **Command palette** (`Ctrl+K`) — fuzzy, mono, dense.
- **Multiplier dial with cost preview** — the ×1–×10 control showing a deterministic
  estimate of queries, depth, tokens, time and dollars before execution. At ×7 and
  above it turns red and demands explicit confirmation.

---

## 6. Signature states worth drawing

These are where the design earns its keep. Draw at least the first three.

- **Idle** — no glow anywhere. Status bar connected, zero runs.
- **In flight** — a run is streaming: pulse dot in the status bar, progress in Activity,
  live text tail in Chat, that pane's border faintly lit. Exactly one focus of light.
- **Armed for approval** — the agent is blocked awaiting a human. Amber. The rest of the
  UI reads as paused.
- **High power (≥ ×7)** — the multiplier is red, the cost preview is prominent, and the
  run button demands a second confirmation.
- **Indexing / scanning** — first-run state on a fresh repository; progress over file
  counts, no content yet.
- **Error** — rose. Timeouts, missing resources, failed tool calls. Errors stay in
  place as cards in the transcript rather than vanishing into a toast.
- **Empty** — no workspace loaded. This is where the ASCII wordmark lives.

---

## 7. Hard constraints for the designer

- Monospace almost everywhere. Sans only inside wiki and research prose bodies.
- Radii ≤ 4px. No rounded cards.
- Dark mode is the primary design target; light mode is a contrast-tuned secondary.
- Colours come from the ANSI table above. No new hues.
- One glowing element per screen state. Glow is a signal, not a texture.
- Dense by default — this is a tool for someone who wants more on screen, not less.
- WCAG AA contrast is a requirement, including on glass surfaces.
- Reduced-motion and low-power variants exist: scanlines and shaders must degrade to
  static.

---

## 8. Known tension with the chosen platform

`DESIGN.md` specifies the desktop app as **Tauri v2 + React 19 + CodeMirror 6**. The
platform decision in `theia-studio-research.md` is an **Eclipse Theia fork (Electron)**.
Design the ideal now — but be aware which parts Theia will resist, so the design isn't
invalidated later:

| Design element | Theia reality |
|---|---|
| xterm.js terminal | Already Theia's terminal. No conflict. |
| Custom 44px frameless titlebar | Possible in Electron, but Theia ships its own title/menu area — this is shell work. |
| 68px nav rail, 12 panes | Theia's activity bar is ~48px and icon-only. Restyling and widening is real work. |
| CodeMirror 6 editor | Theia is **Monaco**. The editor pane should be drawn as Monaco with Kaioken theming. |
| Glassmorphism across the shell | Backdrop-filter over a full IDE surface is a performance risk in Electron. Consider reserving glass for overlays and cards. |
| WebGL CRT backdrop behind everything | Fine inside a single widget; expensive behind the whole shell. |
| Graph, chat, wiki, cards, cost, activity panes | Native Theia React widgets, unrestricted. These are the panes to go hardest on. |

The panes in that last row are where the design system can be expressed at full
strength. The shell chrome is where it will have to negotiate.
