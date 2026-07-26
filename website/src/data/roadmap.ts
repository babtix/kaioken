/**
 * Roadmap data for the /next page. Each category maps to a section of the
 * enhancement plan, grounded in the existing architecture (agent loop, tool
 * framework, codemap index, wiki engine, serve layer, skills system).
 */

export interface RoadmapItem {
  title: string
  body: string
}

export interface RoadmapCategory {
  id: string
  index: string
  icon: string
  title: string
  blurb: string
  tone: "orange" | "amber" | "blue" | "green"
  /** Optional status label rendered next to the title, e.g. "working on it". */
  status?: string
  items: RoadmapItem[]
}

export const ROADMAP_CATEGORIES: RoadmapCategory[] = [
  {
    id: "agents",
    index: "01",
    icon: "Code2",
    title: "Specialized coding agents",
    blurb:
      "Sub-agents with focused system prompts and tool orderings, built on the existing Run() loop and tool dispatch.",
    tone: "blue",
    items: [
      {
        title: "Refactor agent",
        body: "Proposes multi-file refactors using the codemap symbol index to trace all references before editing.",
      },
      {
        title: "Test writer",
        body: "Reads a function via codemap, generates table-driven tests matching existing patterns in the repo.",
      },
      {
        title: "Debug agent",
        body: "Accepts an error or stack trace, locates the fault through search + read, proposes a fix with explanation.",
      },
      {
        title: "Code review agent",
        body: "Takes a git diff, annotates style, bugs, and performance issues as inline comments.",
      },
      {
        title: "Multi-agent orchestrator",
        body: "A planner that decomposes a task, delegates to specialist sub-agents, and merges their outputs.",
      },
      {
        title: "Migration agent",
        body: "Upgrades dependencies, applies codemods, and migrates between framework versions using run_command + edit_file with version-aware prompts.",
      },
    ],
  },
  {
    id: "search",
    index: "02",
    icon: "SearchCode",
    title: "Advanced search",
    blurb:
      "Beyond case-insensitive substring: regex, symbol lookup, semantic embeddings, and change-aware scoping.",
    tone: "orange",
    items: [
      {
        title: "Regex search",
        body: "RE2 patterns over the existing WalkDir scanner — structural queries like func signatures and error returns.",
      },
      {
        title: "Symbol search",
        body: "Query the codemap Index.symbols map directly for O(1) declaration lookups instead of full-text scans.",
      },
      {
        title: "Semantic search",
        body: "Embed knowledge cards and file skeletons into a local vector store; retrieve by meaning, not keywords.",
      },
      {
        title: "Fuzzy file finder",
        body: "Global fzf-style file matching across the scanned tree — saves multiple list_files round-trips.",
      },
      {
        title: "Definition & references",
        body: "go_to_definition and find_references tools backed by LSP or tree-sitter for cross-file navigation.",
      },
      {
        title: "Change-aware search",
        body: "Scopes queries to files modified in the last N commits via gitx — focuses investigation on the active work surface.",
      },
    ],
  },
  {
    id: "gui",
    index: "03",
    icon: "Layout",
    title: "GUI application",
    blurb:
      "A web-based companion and desktop shell that extend the serve layer into a full interactive interface.",
    tone: "amber",
    status: "working on it",
    items: [
      {
        title: "Web IDE companion",
        body: "Split-pane chat + file viewer served by an extended serve.go with WebSocket agent streaming.",
      },
      {
        title: "Desktop app (Tauri)",
        body: "Native window wrapping the web UI with filesystem access, system tray, and global hotkey.",
      },
      {
        title: "Interactive diff viewer",
        body: "Side-by-side Monaco/CodeMirror diff with per-hunk accept/reject instead of whole-file y/n.",
      },
      {
        title: "Codemap visualization",
        body: "Force-directed graph or treemap of modules, files, and symbols rendered from the Index data.",
      },
      {
        title: "Session timeline",
        body: "Visual history of conversations, tool calls, and file changes with branching and undo points.",
      },
      {
        title: "Wiki editor",
        body: "WYSIWYG markdown editor in the serve UI that writes back to .kaioken/wiki/ and triggers incremental update on save.",
      },
    ],
  },
  {
    id: "tools",
    index: "04",
    icon: "Puzzle",
    title: "Agent tool expansion",
    blurb:
      "New tools in the existing function-call schema that give the agent richer capabilities per step.",
    tone: "green",
    items: [
      {
        title: "apply_patch",
        body: "Accepts a unified diff and applies it atomically with rollback — more reliable than sequential edit_file.",
      },
      {
        title: "run_tests",
        body: "Detects the test framework, runs targeted tests, and parses structured pass/fail for iteration.",
      },
      {
        title: "git_operations",
        body: "Stage, commit, branch, stash with safety rails — never force-push, confirm destructive ops.",
      },
      {
        title: "web_search",
        body: "Queries documentation or Stack Overflow for library-specific questions beyond the local repo.",
      },
      {
        title: "Context window manager",
        body: "Proactive conversation pruning that keeps relevant tool results and drops stale ones mid-task.",
      },
      {
        title: "explain_code",
        body: "Takes a file and line range, returns an explanation enriched with codemap context — callers, callees, and type info.",
      },
    ],
  },
  {
    id: "knowledge",
    index: "05",
    icon: "Library",
    title: "Knowledge management",
    blurb:
      "Extending the wiki and card system with graphs, live staleness detection, and retrieval-augmented chat.",
    tone: "orange",
    items: [
      {
        title: "Knowledge graph",
        body: "Cross-referenced graph of modules → symbols → docs with link traversal, stored as a property graph.",
      },
      {
        title: "Live staleness detection",
        body: "File watchers that flag knowledge cards as stale in real-time when their source files change.",
      },
      {
        title: "Versioned wiki with diffs",
        body: "Wiki generations stored as git-trackable snapshots so documentation evolution is comparable.",
      },
      {
        title: "RAG over wiki",
        body: "Automatic retrieval of relevant wiki sections as chat context, with citation links to sources.",
      },
      {
        title: "Custom card schemas",
        body: "User-defined templates (API endpoint card, data model card) beyond the fixed five-file schema.",
      },
      {
        title: "Multi-repo federation",
        body: "A global knowledge index across repositories, so the agent can reference patterns from sibling projects via config.Global.",
      },
    ],
  },
  {
    id: "integrations",
    index: "06",
    icon: "Plug",
    title: "Integrations",
    blurb:
      "Connecting Kaioken's engine to IDEs, platforms, and other agent runtimes through standard protocols.",
    tone: "blue",
    items: [
      {
        title: "VS Code / JetBrains extension",
        body: "Thin extension connecting to a Kaioken daemon over WebSocket for in-editor chat and knowledge.",
      },
      {
        title: "MCP server mode",
        body: "Expose search, read_knowledge, and codemap as MCP tools so other agents can call them.",
      },
      {
        title: "GitHub / GitLab integration",
        body: "Auto-generate PR descriptions from diffs, post wiki summaries, run review on webhooks.",
      },
      {
        title: "CI/CD plugin",
        body: "A GitHub Action that runs kaioken wiki on merge to main and publishes to a docs site.",
      },
      {
        title: "Slack / Discord bot",
        body: "Team questions answered by the knowledge engine — the LLM + read_knowledge pipeline is already a Q&A system.",
      },
      {
        title: "Docker devcontainer",
        body: "Pre-built container with Kaioken and common language runtimes for consistent team environments across machines.",
      },
    ],
  },
  {
    id: "automation",
    index: "07",
    icon: "RefreshCw",
    title: "Automation",
    blurb:
      "Hooks, watchers, and scheduled runs that keep documentation and skills current without manual commands.",
    tone: "amber",
    items: [
      {
        title: "Pre-commit knowledge check",
        body: "Verifies knowledge cards are current before allowing a commit, warning on drift.",
      },
      {
        title: "PR-triggered wiki update",
        body: "A webhook receiver that runs wiki.Update when a pull request is opened or updated.",
      },
      {
        title: "Scheduled deep regeneration",
        body: "Cron integration that runs /wiki x3 nightly on main so deep docs stay fresh.",
      },
      {
        title: "Test-gate on edits",
        body: "After edit_file, automatically run the affected package's tests before the agent continues.",
      },
      {
        title: "Commit message generation",
        body: "Analyze the staged diff and generate a conventional commit message on demand.",
      },
      {
        title: "Dependency update watcher",
        body: "Monitor go.mod / package.json for outdated dependencies and propose upgrades with breaking-change summaries.",
      },
    ],
  },
  {
    id: "collaboration",
    index: "08",
    icon: "Users",
    title: "Collaboration",
    blurb:
      "Multi-user sessions, shared knowledge review, and team coordination built on the existing event architecture.",
    tone: "green",
    items: [
      {
        title: "Shared session server",
        body: "Multi-user WebSocket where team members join a shared chat, seeing prompts and responses live.",
      },
      {
        title: "Knowledge review workflow",
        body: "Wiki changes go through a PR-like approval flow — accept, reject, or comment before committing.",
      },
      {
        title: "Team steering notes",
        body: "Shared /notes stored in the repo and version-controlled so the whole team guides the agent.",
      },
      {
        title: "Role-based permissions",
        body: "Restrict which tools different users can approve — the approve() gate gains identity awareness.",
      },
      {
        title: "Activity feed",
        body: "A persistent log of all agent actions — edits, commands, wiki updates — visible to the team.",
      },
      {
        title: "Pair programming mode",
        body: "Two users in one session — one drives the agent while the other reviews approvals in real-time over the WebSocket.",
      },
    ],
  },
  {
    id: "analysis",
    index: "09",
    icon: "Activity",
    title: "Analysis tools",
    blurb:
      "Code quality metrics, dependency graphs, and architectural visualization derived from the codemap index.",
    tone: "orange",
    items: [
      {
        title: "Dependency graph",
        body: "Parse FileMap.Imports and render an interactive module dependency graph with cycle detection.",
      },
      {
        title: "Complexity metrics",
        body: "Cyclomatic complexity, function length, and nesting depth per symbol from the codemap.",
      },
      {
        title: "Architecture drift detection",
        body: "Compare planned module structure against actual import patterns and flag boundary violations.",
      },
      {
        title: "Dead code detection",
        body: "Use the symbol index to find exported symbols with zero references across the repository.",
      },
      {
        title: "Change impact analysis",
        body: "Given a file or symbol, trace all dependents and estimate the blast radius of a change.",
      },
      {
        title: "Tech debt heatmap",
        body: "Overlay git change frequency with codemap complexity metrics to surface the files that need attention most.",
      },
    ],
  },
  {
    id: "languages",
    index: "10",
    icon: "Languages",
    title: "Extended language support",
    blurb:
      "Tree-sitter parsing, framework detection, and language server integration for polyglot repositories.",
    tone: "amber",
    items: [
      {
        title: "Tree-sitter parsing",
        body: "Replace regex/line-based parsers with tree-sitter grammars for accurate ASTs in 40+ languages.",
      },
      {
        title: "TypeScript / JavaScript",
        body: "Extract interfaces, type aliases, React components, and export maps from TS/JS/TSX sources.",
      },
      {
        title: "Python",
        body: "Classes, decorators, type hints, and virtual environment awareness for the most-requested language.",
      },
      {
        title: "Framework detection",
        body: "Identify Next.js, Django, Spring, Rails from file patterns and inject framework-specific context.",
      },
      {
        title: "Language server integration",
        body: "Connect to gopls, tsserver, pyright for precise go-to-definition and find-references in tools.",
      },
      {
        title: "DSL & config parsing",
        body: "Treat Terraform, Kubernetes YAML, and SQL migrations as first-class code with extractable symbols and structure.",
      },
    ],
  },
]

/** Cross-cutting architectural enablers that underpin multiple categories. */
export const ARCH_ENABLERS: RoadmapItem[] = [
  {
    title: "Plugin / tool registry",
    body: "Make Tools() dynamically extensible so new tools register without modifying core agent code.",
  },
  {
    title: "Event bus",
    body: "Replace the chan tea.Msg pattern with a typed event bus the GUI, CLI, and daemon all subscribe to.",
  },
  {
    title: "Daemon mode",
    body: "A long-running kaioken daemon holding the codemap index, wiki state, and sessions — thin clients connect over HTTP.",
  },
  {
    title: "Streaming tool results",
    body: "Pipe large outputs (test runs, builds) incrementally to the UI instead of buffering the full result.",
  },
  {
    title: "Configuration profiles",
    body: "Named profiles (review, wiki, chat) that preset model, max_tokens, tools, and system prompt per workflow.",
  },
]
