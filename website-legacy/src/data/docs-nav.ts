export interface DocLink {
  to: string
  label: string
  /** short line shown on the docs index */
  blurb: string
  icon: string
}

export interface DocSection {
  heading: string
  links: DocLink[]
}

export const DOCS_NAV: DocSection[] = [
  {
    heading: "getting started",
    links: [
      {
        to: "/docs/install",
        label: "Install",
        blurb: "Build the binary, set a key, point it at a repo.",
        icon: "Terminal",
      },
      {
        to: "/docs/tui",
        label: "The TUI",
        blurb: "Chat, diff approval, streaming, sessions.",
        icon: "MessageSquareCode",
      },
      {
        to: "/docs/commands",
        label: "Command reference",
        blurb: "Every slash command and CLI subcommand.",
        icon: "Cpu",
      },
    ],
  },
  {
    heading: "the agent",
    links: [
      {
        to: "/docs/agent",
        label: "Modes & memory",
        blurb: "Permission modes, steering, branching, what it remembers.",
        icon: "Waypoints",
      },
      {
        to: "/docs/research",
        label: "Deep research",
        blurb: "The router, the fast path, the deep path, the dossier.",
        icon: "Globe",
      },
      {
        to: "/docs/impact",
        label: "Impact & review",
        blurb: "Predict a change, review a diff, run the build gate.",
        icon: "Radar",
      },
    ],
  },
  {
    heading: "the engine",
    links: [
      {
        to: "/docs/wiki",
        label: "Deep wiki",
        blurb: "Multi-pass generation and what ×N buys.",
        icon: "BookOpenText",
      },
      {
        to: "/docs/cards",
        label: "Knowledge cards",
        blurb: "The fixed five-file schema, per module.",
        icon: "BrainCircuit",
      },
      {
        to: "/docs/skills",
        label: "Skills",
        blurb: "Procedural task guides an agent loads.",
        icon: "Wrench",
      },
      {
        to: "/docs/update",
        label: "Incremental updates",
        blurb: "git-diff-driven revisions and the commit hook.",
        icon: "Zap",
      },
    ],
  },
  {
    heading: "reference",
    links: [
      {
        to: "/docs/config",
        label: "Configuration",
        blurb: "config.yaml, providers, model roles, budgets.",
        icon: "FolderGit2",
      },
      {
        to: "/docs/integrations",
        label: "Integrations",
        blurb: "MCP, search index, export, extensions, headless.",
        icon: "Plug",
      },
      {
        to: "/docs/output",
        label: "Output layout",
        blurb: "What .kaioken/ contains and what to edit.",
        icon: "Boxes",
      },
    ],
  },
]

/** Flattened, in reading order — powers the prev/next footer. */
export const DOC_ORDER: DocLink[] = DOCS_NAV.flatMap((s) => s.links)
