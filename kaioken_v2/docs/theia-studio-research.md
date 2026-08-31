# Kaioken Studio — Theia Research (approach only, no code)

Research date: 2026-08-30. Target: a branded desktop IDE ("Kaioken Studio") in the
Cursor / Windsurf / Antigravity / Qoder mould, built on Eclipse Theia rather than a
Code-OSS fork.

Status: research only. The TUI (`apps/tui`) is unfinished and untested; nothing here
should be built until that stabilises. This document exists so the decision is made
on evidence when the time comes.

---

## 0. The fact that decides everything

**Kaioken v2 is TypeScript, not Go.** `kaioken_v2/` is an npm workspace on Node >= 22,
ESM throughout, with eleven library packages (`agent`, `graph`, `index`, `model`,
`plan`, `provenance`, `research`, `scan`, `search`, `serve`, `wiki`) and two frontends
(`apps/cli`, `apps/tui`). The TUI is built on `@earendil-works/pi-tui`.

Theia's backend is also Node + TypeScript. So the `@kaioken/*` packages become ordinary
workspace dependencies of a Theia backend extension — imported directly, called as
functions, sharing a process.

This removes the biggest cost assumed during the earlier stack discussion: there is
**no sidecar, no subprocess, no JSON-RPC bridge to an external engine**. The
"in-process engine" requirement, which had looked like it forced a Go-hosted webview
(Wails), is satisfied by Theia for free. Theia goes from "reasonable compromise" to
"the option that costs least."

---

## 1. Why Theia over forking Code-OSS

| | Theia fork | Code-OSS fork (Cursor path) |
|---|---|---|
| Branding / layout | Supported use case: config + one extension | Patches maintained by hand forever |
| Upstream tracking | npm version bump | Git rebase onto Microsoft's tree |
| Custom UI | First-class `ReactWidget`s, unrestricted | VS Code webviews (iframe-sandboxed, restricted) |
| Extension ecosystem | Open VSX; VS Code extension API supported | Open VSX (MS Marketplace is ToS-barred to forks) |
| AI scaffolding | Theia AI ships agents, chat UI, MCP, skills | Build it yourself |
| Ecosystem size | Smaller; expect to read Theia's source | Enormous |
| Licence | EPL-2.0 OR GPL-2.0-with-Classpath-exception (platform); Theia IDE template repo is MIT | MIT (Code-OSS only; MS's branded build is proprietary) |

The decisive asymmetries for a solo maintainer are rows 1, 2, 3 and 5. Rebranding and
custom panels are *what Theia is for*; on a Code-OSS fork they are the maintenance tax
that funds Cursor's platform team.

Row 3 matters more than it looks: Theia extensions contribute real widgets into the
shell, not sandboxed webviews. The knowledge-graph explorer and the agent panel both
want that.

---

## 2. Theia's current state (checked, not remembered)

- Latest platform release **1.74.1**. Monthly releases, with quarterly "community
  releases" acting as stable anchors for adopters.
- **AI coding features graduated from beta** in 1.70 (community release 2026-05). The
  underlying Theia AI *framework* left beta roughly a year earlier.
- 1.73 added an **AI Registry** for discovering and installing MCP servers and skills.
- **Agent Capabilities** (2026-05) is a single abstraction over MCP servers, Skills,
  sub-agents and prompt fragments, with a searchable Capabilities panel.
- Already shipping: Theia Coder agent, Architect agent with plan mode as default,
  `@pr-reviewer`, Workspace Trust gating AI features, token-usage indicators, terminal
  command history with output capture (explicitly for AI use), SCM history graph,
  Git blame.

The project is actively developed and aimed squarely at AI-native IDEs. That is a
tailwind, but see the strategy question in §4.

---

## 3. Repo shape to start from

Fork **`eclipse-theia/theia-ide`** (technical name: *Theia Blueprint*), the official
template for desktop products. Layout:

- `applications/browser` — browser target, Docker-packageable
- `applications/electron` — desktop target, electron-builder config, E2E tests
- `theia-extensions/product` — branding: about dialog + welcome page
- `theia-extensions/updater` — auto-update via electron-updater
- `theia-extensions/launcher` — CLI launcher (AppImage)
- `patches/` — patches applied to upstream packages

This repo is MIT. The Theia platform packages it depends on are EPL-2.0 (or GPL-2.0
with Classpath exception); EPL-2.0 is the one that applies for a commercial or closed
product. EPL-2.0 is file-level copyleft: modifications to Theia's own files must be
published, but our own extensions in separate files need not be.

Two locations matter for us: `theia-extensions/` (our code) and
`applications/electron/package.json` (what gets bundled).

---

## 4. How Kaioken plugs in — three layers

### Layer A — Kaioken as backend services (the core, in-process)

A Theia extension at `theia-extensions/kaioken/` declares `@kaioken/agent`,
`@kaioken/wiki`, `@kaioken/graph`, `@kaioken/search`, `@kaioken/index` and friends as
dependencies, and calls them directly in the Theia **backend** process. Frontend widgets
reach those services through Theia's RPC layer (`RpcConnectionHandler` plus InversifyJS
DI, over a WebSocket) — a documented, first-class pattern rather than a workaround.

Practical consequence: `kaioken_v2` and the Theia product must live in one npm
workspace, or Kaioken must be published to a registry. Monorepo is simpler and matches
the current setup.

### Layer B — Kaioken inside Theia AI

Theia AI's documented extension points are `LanguageModel` (model providers),
`ToolProvider` (tool functions), `AIVariableContribution` (context variables), and
`Agent` / `ChatAgent` (registered by DI binding, no forking required). There is **no
clean extension point for "swap in my entire external agent runtime."** The realistic
options:

1. **Register Kaioken's agent as a `ChatAgent`.** Most control, most integration work.
   Kaioken's loop drives; Theia AI supplies chat UI, prompt management, variable
   resolution.
2. **Expose Kaioken's capabilities as `ToolProvider`s or an MCP server**, and let
   Theia's Coder agent orchestrate. Cheapest by a wide margin — Theia already discovers
   MCP servers through the AI Registry, and `packages/agent/src/skills.ts` suggests a
   skills model that may map onto Theia's Agent Capabilities directly. Read both before
   choosing.
3. **Wrap Kaioken as a `LanguageModel`.** Structurally dishonest; avoid.

**Open strategy question, and the most important one in this document:** does Kaioken
Studio *replace* Theia's Coder/Architect agents, or *coexist* with them? Replacing means
suppressing shipped UI and owning the chat surface outright. Coexisting means Kaioken
becomes a capability inside someone else's agent, and the product identity thins. This
decides how much of Layer B gets built.

### Layer C — portability hedge

Because Theia runs VS Code extensions, the Kaioken panels can instead be authored to the
VS Code extension API and shipped on Open VSX. Slower and more restricted (webviews),
but the work is then not stranded if Theia turns out wrong. This is the
"build the extension first" on-ramp — still available, still cheap insurance.

---

## 5. The four surfaces

| Surface | Source | Work required |
|---|---|---|
| Code editor + diffs | Monaco, built in | None |
| Terminal | Theia terminal, built in; 2026-05 adds per-command history with output | None; run `apps/tui` inside it |
| File tree, layout, command palette, themes, keybindings, settings | Built in | None |
| Chat + agent runs | Theia AI chat UI, or a custom `ReactWidget` | Depends on the §4 decision |
| Knowledge-graph explorer | Custom `ReactWidget` | **All of it** |

The graph explorer is the only genuinely novel build. `packages/graph/src/render.ts`
already exists — read it to see what it emits before choosing a renderer. The choice
depends on node count: an interactive, editable graph of hundreds of nodes suits
React Flow; exploratory views of thousands need WebGL (Sigma.js, Cosmograph). Decide
from real wiki sizes, not guesses.

`TreeWidget` (a specialised `ReactWidget`) is the base class for tree views and covers
the wiki/document navigator with no custom rendering work.

---

## 6. Rebranding checklist

Paths relative to the forked `theia-ide` repo:

- Application name — `applications/electron/package.json`, key
  `theia.frontend.config.applicationName`
- Icons — `applications/electron/resources/` (`icons.icns` macOS, `icon.ico` Windows,
  `icons/` Linux)
- Welcome page — the getting-started widget in `theia-extensions/product/src/browser/`
- About dialog — the about-dialog class in the same directory
- User config directory — the variables-server file in the product extension
  (default `.theia-blueprint`; ours should be `.kaioken`)
- Installer — `applications/electron/electron-builder.yml`
- Bundled VS Code extensions — the `theiaPlugins` map in
  `applications/electron/package.json`, each entry an Open VSX download URL, fetched
  at build time

Commands: `yarn` → `yarn electron start` (unpackaged) → `yarn electron package`
(installers land in `applications/electron/dist`) → `yarn electron deploy` (publish).
Plugins are fetched by `yarn download:plugins`; `yarn build:dev` is the faster dev build.

---

## 7. Build and toolchain reality

Known costs, from Theia's own docs and adopter write-ups:

- **Native modules.** A C/C++ toolchain plus Python is required (Windows needs the
  VS build tools). Native modules must be **rebuilt when switching between the browser
  and electron targets** — real day-to-day friction if both targets are maintained.
  Some docs still say Python 2.x; that is almost certainly stale, verify at the time.
- **Build times.** Webpack is the default bundler; deleting `webpack.config.js` causes
  an `esbuild.mjs` to be generated instead, reported as roughly 10× faster. Do this
  early rather than late.
- **Startup and webviews.** Documented adopter complaints: slower startup than VS Code,
  and VS Code-style webviews are heavy because everything is bundled and reloaded
  behind an iframe. Native Theia widgets avoid this — another reason to prefer Layer A
  widgets over Layer C webviews for the graph panel.
- **Packaging for three OSes.** electron-builder handles it, but macOS notarisation
  needs an Apple Developer account (~$99/yr) or users hit "damaged app"; Windows
  without a signing certificate triggers SmartScreen. Unavoidable on any stack.

Size expectation: an Electron-class download (roughly 150–250MB installed), not the
~15MB a Wails build would have produced. That is the price of the VS Code look.

---

## 8. Upstream maintenance

Theia ships monthly, with quarterly community releases as adopter anchors. Recommended
posture: **track community releases, not monthly ones.** Upgrades are npm version bumps
plus repairing whatever our extensions used that moved — materially cheaper than a
Code-OSS rebase, but not free. Theia documents a "consume fixes from master" path for
urgent cases.

The `patches/` directory in the Blueprint template is the escape hatch for upstream
changes we cannot wait for. Every patch there is future upgrade cost; keep the count
near zero.

---

## 9. Risks

1. **Theia AI overlaps Kaioken.** Theia now ships coding agents, plan mode, MCP, skills
   and a chat UI. Parts of Kaioken's `agent` and `plan` packages may be redundant inside
   Studio. Resolve §4's strategy question before writing anything.
2. **Smaller community.** Far fewer answers exist for Theia problems than VS Code ones.
   Budget for reading Theia's source directly.
3. **Electron weight.** Accepted deliberately; note it is exactly what Wails would have
   avoided.
4. **Scope.** Chat + graph + editor + terminal is four products. Editor and terminal are
   free here, which is precisely why Theia wins — but the graph explorer remains a
   project of its own.
5. **Workspace coupling.** Merging `kaioken_v2` and a Theia product into one build
   affects Kaioken's own build, test and release story. Decide monorepo vs published
   packages early.

---

## 10. Suggested order (once the TUI is done)

1. Stabilise and test `apps/tui`. Nothing here starts before that.
2. Answer §4's strategy question: replace Theia's agents, or extend them.
3. Read `packages/agent/src/skills.ts` and `packages/graph/src/render.ts` against
   Theia's Agent Capabilities and widget APIs — that comparison settles Layer B.
4. Spike: fork Blueprint, rebrand, boot it, import one `@kaioken/*` package in a backend
   service, prove the in-process call works. Small, and it de-risks this document's
   central assumption.
5. Chat / agent-run panel — the surface that must feel good or nothing else matters.
6. Wiki and document navigator on `TreeWidget`.
7. Graph explorer, as its own project.

---

## Sources

- https://theia-ide.org/docs/composing_applications/
- https://theia-ide.org/docs/blueprint_documentation/
- https://theia-ide.org/docs/theia_ai/
- https://theia-ide.org/docs/json_rpc/
- https://theia-ide.org/docs/widgets/
- https://theia-ide.org/docs/architecture/
- https://github.com/eclipse-theia/theia-ide
- https://eclipsesource.com/blogs/2026/06/19/the-eclipse-theia-community-release-2026-05/
- https://eclipsesource.com/blogs/2026/07/07/eclipse-theia-1-73-release-news-and-noteworthy/
- https://eclipsesource.com/blogs/2026/07/02/eclipse-theia-in-practice-getting-started-lessons-from-the-field/
- https://eclipsesource.com/blogs/2024/12/19/theia-ide-and-theia-ai-support-mcp/
- https://visualstudiomagazine.com/articles/2026/01/26/what-a-difference-a-vs-code-fork-makes-antigravity-cursor-and-windsurf-compared.aspx
