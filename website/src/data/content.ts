/**
 * Every string here is drawn from the project README so the site cannot drift
 * from what the binary actually does.
 */

export const GITHUB_URL = "https://github.com/babtix/kaioken"

export const ASCII_LOGO = `██╗  ██╗  █████╗  ██╗  ██████╗  ██╗  ██╗ ███████╗ ███╗   ██╗
██║ ██╔╝ ██╔══██╗ ██║ ██╔═══██╗ ██║ ██╔╝ ██╔════╝ ████╗  ██║
█████╔╝  ███████║ ██║ ██║   ██║ █████╔╝  █████╗   ██╔██╗ ██║
██╔═██╗  ██╔══██║ ██║ ██║   ██║ ██╔═██╗  ██╔══╝   ██║╚██╗██║
██║  ██╗ ██║  ██║ ██║ ╚██████╔╝ ██║  ██╗ ███████╗ ██║ ╚████║
╚═╝  ╚═╝ ╚═╝  ╚═╝ ╚═╝  ╚═════╝  ╚═╝  ╚═╝ ╚══════╝ ╚═╝  ╚═══╝`

export const TAGLINE = "A G E N T I C   B U I L D E R S   C O L L E C T I V E"

/* The footer credit — the builder's name in the same ANSI Shadow art as the
   logo, rendered smaller by the AsciiArt component. */
export const BUILDER_ART = `██████╗  █████╗ ██████╗ ████████╗██╗ ██████╗██╗  ██╗    ███████╗██╗         ██╗  ██╗ █████╗ ██████╗ ██╗██████╗
██╔══██╗██╔══██╗██╔══██╗╚══██╔══╝██║██╔════╝██║  ██║    ██╔════╝██║         ██║  ██║██╔══██╗██╔══██╗██║██╔══██╗
██████╔╝███████║██████╔╝   ██║   ██║██║     ███████║    █████╗  ██║         ███████║███████║██████╔╝██║██████╔╝
██╔══██╗██╔══██║██╔══██╗   ██║   ██║██║     ██╔══██║    ██╔══╝  ██║         ██╔══██║██╔══██║██╔══██╗██║██╔══██╗
██████╔╝██║  ██║██████╔╝   ██║   ██║╚██████╗██║  ██║    ███████╗███████╗    ██║  ██║██║  ██║██████╔╝██║██████╔╝
╚═════╝ ╚═╝  ╚═╝╚═════╝    ╚═╝   ╚═╝ ╚═════╝╚═╝  ╚═╝    ╚══════╝╚══════╝    ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═════╝`

export const BUILDER_NAME = "BABTICH EL HABIB"

export const PROVIDERS = [
  "OpenRouter",
  "OpenAI",
  "Groq",
  "Together",
  "DeepSeek",
  "Mistral",
  "Ollama",
]

/* ── features ───────────────────────────────────────────────────────────── */

export interface Feature {
  /** lucide-react icon name, resolved in the component */
  icon: string
  title: string
  description: string
  highlights: string[]
  /** which accent the card leans on */
  tone: "orange" | "amber" | "blue" | "green"
}

export const FEATURES: Feature[] = [
  {
    icon: "MessageSquareCode",
    title: "Chat agent",
    description:
      "Talk to any model in your provider's live catalog. It can read, list, search, write and edit files, and run commands — all confined to the target repo.",
    highlights: [
      "Streams token by token, rendered as markdown",
      "Every change lands as a diff you approve",
      "/yolo auto-approves when you trust the run",
    ],
    tone: "blue",
  },
  {
    icon: "BrainCircuit",
    title: "Knowledge engine",
    description:
      "Scan a repo, split it into modules with an LLM, then generate dense knowledge cards per module — with a human-in-the-loop planning step you actually own.",
    highlights: [
      "Fixed five-file card schema per module",
      "modules.yaml is meant to be edited",
      "Content-hash incrementality — unchanged modules are never re-billed",
    ],
    tone: "orange",
  },
  {
    icon: "BookOpenText",
    title: "Deep wiki",
    description:
      "Multi-pass generation: a global plan, per-section plans, then long-form documents — verified against the code index rather than trusted.",
    highlights: [
      "×3 exhaustive coverage by default",
      "×4+ adds critique-and-revise",
      "×10 corrects every grounding failure found",
    ],
    tone: "amber",
  },
  {
    icon: "Wrench",
    title: "Skills",
    description:
      "The wiki explains what a codebase contains. A skill explains how to do a task in it — which files to touch, in what order, following which local conventions.",
    highlights: [
      "Agent Skills format, loaded on description match",
      "Procedural, not descriptive",
      "A catalog README the agent reads first",
    ],
    tone: "green",
  },
  {
    icon: "Zap",
    title: "Incremental updates",
    description:
      "A full wiki run is expensive. Once one completes, update git-diffs the repo against the recorded commit and revises only the documents the diff invalidates.",
    highlights: [
      "Revisions, not rewrites",
      "Provenance footer records real sources",
      "Post-commit hook refreshes automatically",
    ],
    tone: "orange",
  },
  {
    icon: "Globe",
    title: "Wiki server",
    description:
      "Reading a two-thousand-line chapter in an editor is rough. serve renders the generated wiki as a local site you can actually navigate.",
    highlights: [
      "Sidebar, working links, full-text search",
      "Mermaid diagrams rendered",
      "/serve runs it in the background from the TUI",
    ],
    tone: "amber",
  },
]

/* ── pipeline ───────────────────────────────────────────────────────────── */

export interface Step {
  cmd: string
  title: string
  body: string
  /** true when the step hands control back to you */
  human?: boolean
}

export const PIPELINE: Step[] = [
  {
    cmd: "kaioken init",
    title: "Configure",
    body: "Creates .kaioken/config.yaml — review the model, scope excludes, and steering notes.",
  },
  {
    cmd: "kaioken scan",
    title: "Inventory",
    body: "Sanity-check exactly what will be analyzed before a single token is spent.",
  },
  {
    cmd: "kaioken plan",
    title: "Propose modules",
    body: "The LLM proposes modules.yaml. Module boundaries are a judgment call the maintainer should own — so edit it.",
    human: true,
  },
  {
    cmd: "kaioken generate",
    title: "Generate cards",
    body: "Parallel card generation across modules, on the fixed five-file schema.",
  },
  {
    cmd: "kaioken wiki",
    title: "Deep wiki",
    body: "Global plan → per-section plans → long-form docs, at ×3 depth by default. Records the commit it documents.",
  },
  {
    cmd: "kaioken update",
    title: "Stay current",
    body: "git-diffs against that baseline and revises only what the change actually invalidated.",
  },
]

/* ── slash commands ─────────────────────────────────────────────────────── */

export interface Command {
  name: string
  args?: string
  summary: string
}

export interface CommandGroup {
  id: string
  label: string
  icon: string
  blurb: string
  commands: Command[]
}

export const COMMAND_GROUPS: CommandGroup[] = [
  {
    id: "knowledge",
    label: "Knowledge",
    icon: "BookOpenText",
    blurb: "Build and refresh everything the engine generates.",
    commands: [
      {
        name: "/wiki",
        args: "[xN] [force]",
        summary:
          "DEEP wiki: global plan → per-section plans → long docs. ×3 is the default depth.",
      },
      { name: "/wiki retry", summary: "Regenerate only the sections that failed last run." },
      { name: "/skills", args: "[force|name]", summary: "Build task guides an AI loads while working here." },
      { name: "/skills list", summary: "Show the generated skills." },
      {
        name: "/update",
        args: "[<base-rev>]",
        summary:
          "Incremental: git-diff against the commit the wiki was built from, and revise only the invalidated documents.",
      },
      { name: "/plan", summary: "LLM proposes modules.yaml — edit it, then generate." },
      { name: "/cards", args: "[force|id]", summary: "Generate knowledge cards — all, one module, or force a rebuild." },
      { name: "/scan", summary: "Scan the repo, print an inventory." },
      { name: "/status", summary: "Per-module freshness." },
    ],
  },
  {
    id: "repo",
    label: "Repo & session",
    icon: "FolderGit2",
    blurb: "Point at code, browse output, keep conversations.",
    commands: [
      { name: "/serve", args: "[port]", summary: "Browse the generated wiki in a browser · /serve stop." },
      { name: "/hook", args: "[install|remove]", summary: "Refresh the wiki automatically after every commit." },
      { name: "/repo", args: "<path>", summary: "Point at a different repository." },
      { name: "/sessions", summary: "List saved conversations." },
      { name: "/resume", args: "[id]", summary: "Reopen a saved conversation." },
      { name: "/new", summary: "Start a fresh session — the current one is saved." },
      { name: "/notes", args: "[add <t>|clear]", summary: "View or edit steering notes injected into prompts." },
      { name: "/init", summary: "Create .kaioken/config.yaml in the target repo." },
    ],
  },
  {
    id: "model",
    label: "Provider & model",
    icon: "Cpu",
    blurb: "Provider-agnostic over any OpenAI-compatible endpoint.",
    commands: [
      { name: "/models", args: "[filter]", summary: "List the provider's models." },
      { name: "/model", args: "<id>", summary: "Set the generation model." },
      { name: "/provider", args: "<name>", summary: "Switch API provider (openrouter, openai, groq, deepseek, …)." },
      { name: "/key", args: "[value]", summary: "Set API key in-memory — blank opens a hidden prompt." },
      { name: "/cost", summary: "What the session has spent." },
      { name: "/config", summary: "Show the active configuration." },
    ],
  },
  {
    id: "session",
    label: "Editing & utility",
    icon: "Terminal",
    blurb: "The small commands you reach for mid-run.",
    commands: [
      { name: "/diff", summary: "Review the changes the agent has proposed or applied." },
      { name: "/undo", summary: "Roll back the last applied change." },
      { name: "/yolo", summary: "Auto-approve file changes and commands for this session." },
      { name: "/compact", summary: "Summarize the conversation to reclaim context." },
      { name: "/copy", summary: "Copy the last reply to the clipboard." },
      { name: "/clear", summary: "Clear the transcript." },
      { name: "/help", summary: "List every command." },
      { name: "/quit", summary: "Exit the TUI." },
    ],
  },
]

/* ── multiplier ─────────────────────────────────────────────────────────── */

export interface MultiplierLevel {
  level: string
  behavior: string
  isDefault?: boolean
}

export const MULTIPLIER: MultiplierLevel[] = [
  { level: "×1", behavior: "Public surface and main flow, section docs only." },
  { level: "×2", behavior: "Adds subsection documents and diagrams." },
  { level: "×3", behavior: "Exhaustive coverage of every declaration in scope.", isDefault: true },
  {
    level: "×4+",
    behavior:
      "Adds a critique-and-revise cycle: score the draft against a rubric, fix the gaps, cut the padding.",
  },
  { level: "×10", behavior: "Additionally corrects every grounding failure verification found." },
]

/* ── engineering notes ──────────────────────────────────────────────────── */

export interface QualityPoint {
  icon: string
  claim: string
  body: string
}

export const QUALITY: QualityPoint[] = [
  {
    icon: "ScanText",
    claim: "The model sees whole files, not their edges",
    body: "internal/codemap parses every source file into a skeleton — package, imports, and every declaration with its line range. Prompts get every declaration in scope for a few hundred tokens per file, plus full bodies of the most relevant code. Files too large to include whole contribute complete functions, never arbitrary byte slices.",
  },
  {
    icon: "GitMerge",
    claim: "Chapters agree with each other",
    body: "Sections generate in parallel and can only see sibling titles, which produces the same concept explained three times in three vocabularies. A prior pass writes an authoritative brief — architecture, key flows, a glossary of canonical terms — to .kaioken/architecture.md, injected verbatim into every later prompt.",
  },
  {
    icon: "ShieldCheck",
    claim: "Claims are checked, not trusted",
    body: "Every file path, symbol, line anchor and quoted excerpt a document asserts is checked against the code index. Excerpts must actually appear at the lines they cite. A prompt asking for no hallucinations is a request; checking every claim is a guarantee.",
  },
  {
    icon: "Ruler",
    claim: "Length follows substance",
    body: "Line-count targets make models pad, so the prompt specifies coverage instead: every exported declaration, endpoint, config key and model in scope must be documented. A shorter chapter that covers everything beats a longer one that repeats itself.",
  },
  {
    icon: "Boxes",
    claim: "Framework facts are extracted, not guessed",
    body: "Real routes, models, CLI commands and environment variables are pulled from the source — Express, FastAPI, Flask, Spring, Gin, Rails and friends — so an API reference lists actual endpoints.",
  },
  {
    icon: "ClipboardCheck",
    claim: "The plan is validated",
    body: "Planning sees a structural skeleton of the repo, not just a directory listing. Kaioken then reports what percentage of scanned files the plan claims, and which directories the misses cluster in — a plan that ignores a third of the codebase is visible before generation spends tokens on it.",
  },
]

export const DESIGN_DECISIONS: { title: string; body: string }[] = [
  {
    title: "Human-in-the-loop plan",
    body: "modules.yaml is meant to be edited — module boundaries are a judgment call the maintainer should own.",
  },
  {
    title: "Fixed card schema",
    body: "Agents can rely on the same five files existing for every module.",
  },
  {
    title: "Content-hash incrementality",
    body: "state.json stores a sha256 over each module's scoped files; unchanged modules are never re-billed.",
  },
  {
    title: "Structure before text",
    body: "A file's skeleton always fits the budget, so nothing in scope is ever invisible to the model — detail is what gets rationed, never coverage.",
  },
  {
    title: "Provenance over prose",
    body: "Documents record their sources in a machine-readable footer, so incremental updates do not depend on the model writing a tidy Referenced Files section.",
  },
  {
    title: "Low temperature (0.2)",
    body: "Cards should be factual, not creative.",
  },
  {
    title: "Free-tier aware",
    body: "A model id ending in :free caps parallelism at 2, because those tiers rate-limit hard and four parallel calls mostly buys 429s.",
  },
  {
    title: "Cost up front",
    body: "A wiki run prints its estimated calls and tokens before starting, and asks for confirmation past a threshold.",
  },
]

/* ── output layout ──────────────────────────────────────────────────────── */

export interface TreeNode {
  name: string
  note?: string
  depth: number
  kind: "dir" | "file" | "edit"
}

export const OUTPUT_TREE: TreeNode[] = [
  { name: ".kaioken/", depth: 0, kind: "dir" },
  { name: "config.yaml", note: "model, scope excludes, steering notes", depth: 1, kind: "edit" },
  { name: "modules.yaml", note: "LLM-proposed module tree — EDIT before generating", depth: 1, kind: "edit" },
  { name: "wiki_plan.yaml", note: "LLM-proposed wiki outline — EDIT before generating", depth: 1, kind: "edit" },
  { name: "architecture.md", note: "shared brief + glossary injected into every chapter", depth: 1, kind: "edit" },
  { name: "wiki_state.yaml", note: "the commit the wiki reflects (+ failed sections)", depth: 1, kind: "file" },
  { name: "state.json", note: "per-module source hashes → incremental updates", depth: 1, kind: "file" },
  { name: "sessions/", note: "saved chat conversations → /resume", depth: 1, kind: "dir" },
  { name: "skills/", note: "task guides an agent loads while working", depth: 1, kind: "dir" },
  { name: "wiki/", note: "the deep wiki: one folder per section, plus CHANGELOG.md", depth: 1, kind: "dir" },
  { name: "KNOWLEDGE.md", note: "index an agent reads first", depth: 1, kind: "file" },
  { name: "knowledge/<module>/", depth: 1, kind: "dir" },
  { name: "_module.yaml", note: "metadata (scope, model, generated_at)", depth: 2, kind: "file" },
  { name: "overview.md", depth: 2, kind: "file" },
  { name: "architecture.md", depth: 2, kind: "file" },
  { name: "conventions.md", depth: 2, kind: "file" },
  { name: "tech_stack.md", depth: 2, kind: "file" },
  { name: "setup_commands.md", note: "only when the module has unique commands", depth: 2, kind: "file" },
]

/* ── quick start ────────────────────────────────────────────────────────── */

export const QUICK_START = `# build (Go >= 1.24)
cd cli
go build -o kaioken.exe ./cmd/kaioken

# set your OpenRouter key (get one at openrouter.ai/keys)
$env:OPENROUTER_API_KEY = "sk-or-..."

cd path\\to\\your\\repo
kaioken init                 # creates .kaioken/config.yaml
kaioken scan                 # sanity-check what will be analyzed
kaioken plan                 # LLM proposes modules.yaml — edit it if you like
kaioken generate             # parallel card generation
kaioken wiki                 # deep multi-pass wiki (×3 by default)
kaioken update               # after code changes: git-diff-driven refresh`

export const ROADMAP = [
  "Desktop version (Wails wrapper around the same engine — serve is the seed)",
  "Conversation-memory extraction and card self-iteration",
  "Diff-driven updates for knowledge cards (today update covers the wiki)",
  "Export targets (--export qoder, --export claude-md)",
]
