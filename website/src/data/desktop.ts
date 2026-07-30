/**
 * Kaioken Desktop — content for /desktop and /docs/desktop.
 *
 * Every claim here is read off the app itself rather than imagined:
 * surfaces from desktop/src/components/layout/NavRail.tsx, shortcuts from
 * desktop/src/lib/shortcuts.ts, window and bundle facts from
 * desktop/src-tauri/tauri.conf.json, architecture from desktop/docs/01..05.
 */

export const DESKTOP_REPO_PATH = "https://github.com/babtix/kaioken/tree/master/desktop"

/* ── the window itself ──────────────────────────────────────────────────── */

export const WINDOW = {
  /** tauri.conf.json → app.windows[0] */
  width: 1440,
  height: 900,
  minWidth: 960,
  minHeight: 640,
  /** decorations:false — the title bar is drawn by the app, not the OS */
  customChrome: true,
  theme: "Dark",
  background: "#080808",
}

/* ── surfaces (the nav rail, in rail order) ─────────────────────────────── */

export interface Surface {
  /** lucide-react icon name, resolved through components/Icon */
  icon: string
  label: string
  /** the keyboard shortcut, empty when the route has none */
  key: string
  headline: string
  body: string
  /** three concrete things the screen actually does */
  points: string[]
  tone: "orange" | "amber" | "blue" | "green" | "sage"
}

export const SURFACES: Surface[] = [
  {
    icon: "MessageSquare",
    label: "Chat",
    key: "Ctrl+1",
    headline: "The agent, with a real diff approver",
    body: "The same tool-using agent as the TUI — read, list, search, write, edit, run — but every proposed change lands in a side-by-side diff with syntax highlighting instead of a y/n prompt over a unified patch.",
    points: [
      "Streams token by token; tool calls collapse into cards you can expand",
      "Sessions live in .kaioken/sessions — the same ones /resume opens",
      "Per-turn auto-approve and shell toggles, off by default",
    ],
    tone: "blue",
  },
  {
    icon: "Radar",
    label: "Research",
    key: "Ctrl+2",
    headline: "Ask the web, get a cited report",
    body: "A Perplexity-shaped surface wired to the daemon's research run: decompose the question, search, read, reason, gap-check, then write a report — with the ×N dial scaling how hard it works.",
    points: [
      "Every step streams as it happens, cancellable mid-run",
      "Answers carry source chips you can open",
      "Reports save to disk and reopen from history",
    ],
    tone: "amber",
  },
  {
    icon: "BookOpen",
    label: "Wiki",
    key: "Ctrl+3",
    headline: "Read the wiki where it was written",
    body: "kaioken serve exists because a two-thousand-line chapter with mermaid diagrams is unreadable in a terminal. The desktop app makes that browser the app: nav tree, search, rendered diagrams, no separate server to start.",
    points: [
      "Section tree mirrors .kaioken/wiki/ exactly",
      "Mermaid rendered inline, code syntax-highlighted",
      "Provenance footers link to the files a document cites",
    ],
    tone: "orange",
  },
  {
    icon: "Waypoints",
    label: "Graph",
    key: "Ctrl+4",
    headline: "See what documents what",
    body: "An Obsidian-style overview of the generated wiki. Orange nodes are pages, sage nodes are the repo files they cite — so a file with no edges is a file no document covers.",
    points: [
      "Click a page to read it, a file to open it in the editor",
      "Ctrl-click focuses a node's neighbourhood at depth N",
      "Filter and search without leaving the canvas",
    ],
    tone: "sage",
  },
  {
    icon: "Layers",
    label: "Cards",
    key: "Ctrl+5",
    headline: "Knowledge cards, per module",
    body: "The fixed five-file schema for every module, browsable — overview, architecture, conventions, tech stack, and setup commands when a module has its own.",
    points: [
      "Freshness per module, straight from state.json hashes",
      "Regenerate one module without re-billing the rest",
      "modules.yaml stays editable — it is still your call",
    ],
    tone: "green",
  },
  {
    icon: "Code2",
    label: "Editor",
    key: "Ctrl+6",
    headline: "Edit the plan without alt-tabbing",
    body: "modules.yaml and wiki_plan.yaml are meant to be edited between passes. A CodeMirror 6 editor with a real terminal panel underneath means you never leave the app to do it.",
    points: [
      "Go, Rust, Python, JS/TS, JSON, YAML, Markdown, HTML, CSS",
      "Ctrl+S saves, Ctrl+F finds, Ctrl+P switches files",
      "Ctrl+` opens a genuine PTY-backed shell, not a log view",
    ],
    tone: "blue",
  },
  {
    icon: "Globe",
    label: "Browser",
    key: "Ctrl+7",
    headline: "Tabs, in the app",
    body: "Docs, the served wiki, and whatever the research run cited — opened in tabs beside your work rather than in a window you lose behind the IDE.",
    points: [
      "Tabs, history, bookmarks, a new-tab page with top sites",
      "Search engine of your choosing from the address bar",
      "Project destinations always one click away",
    ],
    tone: "amber",
  },
  {
    icon: "Zap",
    label: "Activity",
    key: "Ctrl+8",
    headline: "Several pipelines, one console",
    body: "wiki, update, generate, skills and scan runs stream progress over SSE. Watch three at once, read the log of any of them, cancel the one that is going wrong.",
    points: [
      "Live per-run progress, not a spinner",
      "A badge on the rail counts what is still moving",
      "Failed sections are listed so /wiki retry knows where to look",
    ],
    tone: "orange",
  },
  {
    icon: "Puzzle",
    label: "Extensions",
    key: "Ctrl+9",
    headline: "Capabilities you opt into",
    body: "Packages installed from GitHub releases. Declarative ones contribute skills and never execute code; MCP and WASM ones contribute agent tools and stay inert until you trust that exact installed version.",
    points: [
      "The trust dialog names precisely what it would let run",
      "Version-pinned trust — an update asks again",
      "Browse the registry from the rail or the palette",
    ],
    tone: "sage",
  },
  {
    icon: "Wallet",
    label: "Cost",
    key: "",
    headline: "Where the money went",
    body: "The TUI hides spend behind /cost. Here it is a dashboard: 7, 30 or 90 days, broken down by model and by run, scoped to one workspace or across all of them.",
    points: [
      "Breakdowns lead; the grand total is one line",
      "Precision that survives fractions of a cent",
      "Live token counter in the status bar besides",
    ],
    tone: "green",
  },
  {
    icon: "Settings",
    label: "Settings",
    key: "Ctrl+,",
    headline: "One config, both surfaces",
    body: "Provider, model, keys, search backend and steering notes — written to the same ~/.kaioken/config.yaml the CLI reads. Change it here, the terminal sees it.",
    points: [
      "~20 providers, most OpenAI-compatible, plus Anthropic native",
      "Local models discovered from a running Ollama",
      "Light and dark, toggled from the status bar",
    ],
    tone: "blue",
  },
  {
    icon: "FolderOpen",
    label: "Repos",
    key: "Ctrl+O",
    headline: "Open, switch, drop",
    body: "The workspace picker shows recent repos, their scan stats, and how stale each knowledge base is. Drop a folder onto the window or pick from recents.",
    points: [
      "Recent workspaces with module counts and freshness",
      "Repository scan with language breakdown",
      "Drag-and-drop a folder to open it instantly",
    ],
    tone: "sage",
  },
]

/* ── architecture ───────────────────────────────────────────────────────── */

export interface Layer {
  id: string
  title: string
  subtitle: string
  detail: string
  tone: "orange" | "amber" | "blue" | "green"
  /** what the layer is made of, shown as small tags */
  parts: string[]
}

export const LAYERS: Layer[] = [
  {
    id: "webview",
    title: "React front-end",
    subtitle: "the surface",
    detail:
      "React 19, Vite 6 and Tailwind 4 — the same design tokens as this website, which are themselves lifted from the TUI's ANSI palette. Route-level code splitting keeps the editor's language packs off the path of someone who only opens Chat.",
    tone: "blue",
    parts: ["React 19", "Vite 6", "Tailwind 4", "zustand", "CodeMirror 6", "xterm.js"],
  },
  {
    id: "rust",
    title: "Tauri v2 shell",
    subtitle: "thin on purpose",
    detail:
      "Rust does four things: spawn the sidecar, supervise it, kill it on exit, and hand the front-end a port and a token. No engine logic lives here, so nothing about the product depends on rebuilding Rust.",
    tone: "orange",
    parts: ["spawn", "supervise", "PTY", "no business logic"],
  },
  {
    id: "daemon",
    title: "kaioken daemon",
    subtitle: "the existing Go engine",
    detail:
      "A subcommand on the same binary the terminal runs. It exposes agent, wiki, skills, plan, generate, scan, session, config and cost over loopback HTTP, with Server-Sent Events for progress and token deltas. Because it is plain HTTP, every screen in the app is reproducible with curl.",
    tone: "amber",
    parts: ["loopback only", "bearer token", "SSE stream", "curl-testable"],
  },
  {
    id: "disk",
    title: ".kaioken/ on disk",
    subtitle: "one source of truth",
    detail:
      "No app-private database. Run kaioken wiki in a terminal and the result appears in the app; generate from the app and the CLI sees it. The app is a second window onto the same files, not a second system.",
    tone: "green",
    parts: ["config.yaml", "modules.yaml", "wiki/", "knowledge/", "sessions/"],
  },
]

/* ── what the GUI wins, and what it does not ────────────────────────────── */

export interface Comparison {
  job: string
  tui: string
  desktop: string
  /** which surface actually wins this row */
  winner: "tui" | "desktop" | "tie"
}

export const COMPARISON: Comparison[] = [
  {
    job: "Chatting with the agent",
    tui: "Excellent — it is a terminal app in a terminal",
    desktop: "The same agent, with rendered markdown",
    winner: "tie",
  },
  {
    job: "Approving a diff",
    tui: "y/n over a unified patch",
    desktop: "Side-by-side, syntax-highlighted, per-hunk",
    winner: "desktop",
  },
  {
    job: "Reading a wiki chapter",
    tui: "Not possible — serve renders it elsewhere",
    desktop: "Nav tree, search, mermaid, in-app",
    winner: "desktop",
  },
  {
    job: "Editing modules.yaml between passes",
    tui: "Alt-tab to an editor and hope it still parses",
    desktop: "Edit in place, validated, terminal underneath",
    winner: "desktop",
  },
  {
    job: "Watching three runs at once",
    tui: "One foreground pipeline",
    desktop: "A run console with live per-run progress",
    winner: "desktop",
  },
  {
    job: "Knowing what you spent",
    tui: "/cost, when you remember to ask",
    desktop: "Always in the status bar, dashboard behind it",
    winner: "desktop",
  },
  {
    job: "Working over SSH on a box with no GUI",
    tui: "Exactly what it is for",
    desktop: "Wrong tool — use the binary",
    winner: "tui",
  },
  {
    job: "Scripting it in CI",
    tui: "A single binary with subcommands and exit codes",
    desktop: "Not the point",
    winner: "tui",
  },
]

/* ── principles ─────────────────────────────────────────────────────────── */

export const PRINCIPLES: { icon: string; title: string; body: string }[] = [
  {
    icon: "ShieldCheck",
    title: "Local and offline-first",
    body: "No telemetry, no account, no phone-home. The only network traffic the app makes is to the LLM provider you configured — and to whatever you open in the browser tab.",
  },
  {
    icon: "Boxes",
    title: "No engine rewrite",
    body: "Every capability comes from Go packages the CLI already shipped. The new Go code is transport, which is why the desktop app and the terminal cannot drift apart.",
  },
  {
    icon: "GitMerge",
    title: "One directory, two windows",
    body: "The app reads and writes the same .kaioken/ as the CLI. Neither surface owns the state; the repository does.",
  },
  {
    icon: "Plug",
    title: "Loopback and locked down",
    body: "The daemon binds to 127.0.0.1 with a per-session bearer token, and the WebView runs under a CSP that permits connections to nothing else.",
  },
]

/* ── shortcuts (mirrors desktop/src/lib/shortcuts.ts) ───────────────────── */

export const SHORTCUT_GROUPS: { group: string; items: { keys: string; label: string }[] }[] = [
  {
    group: "General",
    items: [
      { keys: "Ctrl+K", label: "Command palette" },
      { keys: "Ctrl+P", label: "Quick file switcher" },
      { keys: "Ctrl+B", label: "Toggle explorer sidebar" },
      { keys: "?", label: "Shortcut help" },
      { keys: "Esc", label: "Close dialog" },
    ],
  },
  {
    group: "Navigation",
    items: [
      { keys: "Ctrl+1…9", label: "Jump to any surface" },
      { keys: "Ctrl+,", label: "Settings" },
    ],
  },
  {
    group: "Chat",
    items: [
      { keys: "Ctrl+N", label: "New chat session" },
      { keys: "Enter", label: "Send message" },
      { keys: "Alt+Enter", label: "New line" },
    ],
  },
  {
    group: "Editor",
    items: [
      { keys: "Ctrl+S", label: "Save file" },
      { keys: "Ctrl+F", label: "Find in file" },
      { keys: "Ctrl+`", label: "Toggle terminal" },
    ],
  },
  {
    group: "Browser",
    items: [
      { keys: "Ctrl+L", label: "Focus address bar" },
      { keys: "Ctrl+T", label: "New tab" },
      { keys: "Ctrl+W", label: "Close tab" },
    ],
  },
]

/* ── platforms and building ─────────────────────────────────────────────── */

export interface Platform {
  id: "windows" | "macos" | "linux"
  label: string
  /** bundle targets from tauri.conf.json → bundle.targets */
  artifacts: string
  note: string
}

export const PLATFORMS: Platform[] = [
  {
    id: "windows",
    label: "Windows",
    artifacts: "NSIS installer (.exe)",
    note: "WebView2 ships with Windows 11; the installer bootstraps it on older builds.",
  },
  {
    id: "macos",
    label: "macOS",
    artifacts: "Disk image (.dmg)",
    note: "Uses the system WebKit — no bundled browser engine.",
  },
  {
    id: "linux",
    label: "Linux",
    artifacts: "Debian package + AppImage",
    note: "Needs webkit2gtk; the .deb declares it.",
  },
]

/** Honest status of distribution — the tagged release pipeline ships the CLI. */
export const DISTRIBUTION_NOTE =
  "Tagged releases currently publish the CLI binary. The desktop bundles are built and tested by CI on every push, and building them yourself is three commands — signed installers are the next step, not a rewrite."

export const BUILD_STEPS = `# prerequisites: Go >= 1.24, Node >= 20, Rust (rustup.rs)
# Windows additionally needs the Visual Studio C++ build tools

git clone https://github.com/babtix/kaioken
cd kaioken/desktop

npm install
npm run tauri dev      # builds the Go sidecar, then opens the app

# or produce an installer for your platform
npm run dist`

export const CURL_PROOF = `# the app is only a client — the daemon answers plain HTTP
kaioken daemon --port 54312

curl -H "Authorization: Bearer $KAIOKEN_TOKEN" \\
  http://127.0.0.1:54312/api/workspace

# and streams progress as Server-Sent Events
curl -N -H "Authorization: Bearer $KAIOKEN_TOKEN" \\
  http://127.0.0.1:54312/api/events`

/* ── numbers worth stating once ─────────────────────────────────────────── */

export const DESKTOP_STATS: { value: string; label: string }[] = [
  { value: "12", label: "surfaces" },
  { value: "1", label: "extra process" },
  { value: "0", label: "telemetry endpoints" },
  { value: "3", label: "platforms" },
]
