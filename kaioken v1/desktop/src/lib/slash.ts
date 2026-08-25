// The composer's slash vocabulary, mirroring internal/tui/commands.go so
// muscle memory transfers from the terminal. Every TUI command is present:
// most map onto a run, an API call or a screen; the handful that only make
// sense inside a terminal (queue, fork, tree, …) surface an explanatory
// note instead of failing silently.

export type SlashAction =
  | { kind: "run"; runKind: string; params?: Record<string, unknown>; goto?: string }
  | { kind: "session"; op: "new" | "compact" }
  | { kind: "undo" }
  | { kind: "toggle"; which: "yolo" | "shell" }
  | { kind: "navigate"; to: string }
  | { kind: "help" }
  | { kind: "stop" }
  | { kind: "clear" }
  | { kind: "copy" }
  | { kind: "theme"; to?: "dark" | "light" }
  | { kind: "init" }
  | { kind: "hook"; op: "install" | "remove" | "status" }
  | { kind: "repo"; path: string }
  | { kind: "version" }
  | { kind: "sessioninfo" }
  | { kind: "quit" }
  | { kind: "note"; title: string; body?: string }
  | { kind: "aside"; text: string }

export type SlashCommand = {
  name: string
  aliases?: string[]
  /** Argument hint shown beside the name, as in the TUI palette. */
  args?: string
  summary: string
  group: string
  /** Built from the typed argument string (everything after the name). */
  action: (arg: string) => SlashAction
}

/** The marker /btw puts in front of an aside so the model reads it as context
 *  rather than a request. Must match agent.AsidePrefix in
 *  cli/internal/agent/aside.go — the daemon writes it, this file reads it. */
export const ASIDE_PREFIX = "[aside: context only, no reply needed now]\n"

/** The user's own words from a framed aside, or null for any other message. */
export function asideBody(content: string): string | null {
  return content.startsWith(ASIDE_PREFIX) ? content.slice(ASIDE_PREFIX.length) : null
}

/** Parse an `xN` multiplier argument, as `/wiki x3` in the TUI. */
function multiplierOf(arg: string, fallback = 3): number {
  const m = /x\s*(\d+)/i.exec(arg)
  if (!m) return fallback
  return Math.min(10, Math.max(1, Number(m[1])))
}

/** A canned note for TUI commands whose mechanics only exist in the terminal. */
function tuiOnly(what: string): SlashAction {
  return { kind: "note", title: `${what} is a terminal feature`, body: "Run kaioken in a terminal to use it — everything else works here." }
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // ---- pipelines ----
  {
    name: "wiki",
    args: "[xN] [force|retry]",
    summary: "generate the deep multi-pass wiki",
    group: "Pipelines",
    action: (arg) => ({
      kind: "run",
      runKind: /retry/i.test(arg) ? "wiki_retry" : "wiki",
      params: { multiplier: multiplierOf(arg), force: /force/i.test(arg) },
    }),
  },
  {
    name: "update",
    args: "[base-rev]",
    summary: "refresh only the documents the diff invalidates",
    group: "Pipelines",
    action: (arg) => ({
      kind: "run",
      runKind: "update",
      params: arg.trim() ? { base: arg.trim() } : {},
    }),
  },
  {
    name: "cards",
    aliases: ["generate", "gen"],
    args: "[force]",
    summary: "generate knowledge cards per module",
    group: "Pipelines",
    action: (arg) => ({ kind: "run", runKind: "generate", params: { force: /force/i.test(arg) } }),
  },
  {
    name: "skills",
    aliases: ["skill"],
    args: "[force]",
    summary: "build task-oriented agent skills",
    group: "Pipelines",
    action: (arg) => ({ kind: "run", runKind: "skills", params: { force: /force/i.test(arg) } }),
  },
  { name: "plan", summary: "propose a module tree with the LLM", group: "Pipelines", action: () => ({ kind: "run", runKind: "plan" }) },
  { name: "scan", summary: "re-inventory the repository", group: "Pipelines", action: () => ({ kind: "run", runKind: "scan" }) },
  {
    name: "research",
    aliases: ["deep"],
    args: "[xN] <question>",
    summary: "deep web research with cited sources",
    group: "Pipelines",
    action: (arg) => {
      const question = arg.replace(/^x\s*\d+\s*/i, "").trim()
      if (!question) return { kind: "navigate", to: "/research" }
      return { kind: "run", runKind: "research", params: { question, multiplier: multiplierOf(arg) }, goto: "/research" }
    },
  },

  // ---- getting started ----
  { name: "init", summary: "first-run setup: config, scan, AGENTS.md", group: "Getting started", action: () => ({ kind: "init" }) },
  { name: "key", args: "[value]", summary: "set the API key (Settings → Providers)", group: "Getting started", action: () => ({ kind: "navigate", to: "/settings" }) },
  {
    name: "tutorial",
    args: "[chapter|command]",
    summary: "guided walkthrough of every command",
    group: "Getting started",
    action: () => ({ kind: "note", title: "Every terminal command works here", body: "Type / to browse them; the full guided tutorial lives in the terminal TUI." }),
  },
  {
    name: "explain",
    args: "[command]",
    summary: "in-depth reference for every command",
    group: "Getting started",
    action: () => ({ kind: "note", title: "Command reference", body: "Type / to browse every command with its summary; /explain's full pages live in the terminal TUI." }),
  },

  // ---- conversation ----
  { name: "new", aliases: ["reset"], summary: "start a fresh session", group: "Conversation", action: () => ({ kind: "session", op: "new" }) },
  { name: "compact", summary: "summarise the transcript to free context", group: "Conversation", action: () => ({ kind: "session", op: "compact" }) },
  { name: "undo", summary: "revert the agent's last file change", group: "Conversation", action: () => ({ kind: "undo" }) },
  { name: "yolo", summary: "toggle auto-approve for this turn", group: "Conversation", action: () => ({ kind: "toggle", which: "yolo" }) },
  { name: "shell", summary: "toggle whether run_command is offered", group: "Conversation", action: () => ({ kind: "toggle", which: "shell" }) },
  { name: "stop", summary: "stop the running task", group: "Conversation", action: () => ({ kind: "stop" }) },
  { name: "clear", aliases: ["cls"], summary: "clear the transcript from view", group: "Conversation", action: () => ({ kind: "clear" }) },
  { name: "copy", summary: "copy the last reply to the clipboard", group: "Conversation", action: () => ({ kind: "copy" }) },
  {
    name: "mode",
    args: "[build|plan|general|explore|review|prism]",
    summary: "agent permission modes (terminal)",
    group: "Conversation",
    action: () => ({ kind: "note", title: "No permission modes here", body: "The desktop agent asks before every change — the yolo and shell toggles are the dials." }),
  },
  {
    name: "btw",
    args: "<text>",
    summary: "tell the agent something without asking for a reply",
    group: "Conversation",
    action: (arg) => ({ kind: "aside", text: arg }),
  },
  { name: "queue", args: "[clear]", summary: "queued steering messages (terminal)", group: "Conversation", action: () => tuiOnly("Steering queue") },
  { name: "fork", args: "[turns]", summary: "rewind the conversation (terminal)", group: "Conversation", action: () => tuiOnly("/fork") },
  { name: "tree", args: "[n]", summary: "conversation branches (terminal)", group: "Conversation", action: () => tuiOnly("/tree") },
  { name: "learn", summary: "distill this session into a skill (terminal)", group: "Conversation", action: () => tuiOnly("/learn") },

  // ---- sessions ----
  { name: "sessions", summary: "list saved conversations (sidebar)", group: "Sessions", action: () => ({ kind: "navigate", to: "/chat" }) },
  { name: "resume", args: "[id]", summary: "reopen a saved conversation (sidebar)", group: "Sessions", action: () => ({ kind: "navigate", to: "/chat" }) },
  { name: "switch", args: "[id]", summary: "save this session and open another (sidebar)", group: "Sessions", action: () => ({ kind: "navigate", to: "/chat" }) },
  { name: "import", args: "<path>", summary: "import an external transcript (terminal)", group: "Sessions", action: () => tuiOnly("/import") },
  { name: "session", summary: "stats for the current session", group: "Sessions", action: () => ({ kind: "sessioninfo" }) },

  // ---- model & config ----
  { name: "model", summary: "pick a model", group: "Config", action: () => ({ kind: "navigate", to: "/settings" }) },
  { name: "models", args: "[filter]", summary: "list the provider's models", group: "Config", action: () => ({ kind: "navigate", to: "/settings" }) },
  { name: "provider", args: "[name]", summary: "switch API provider", group: "Config", action: () => ({ kind: "navigate", to: "/settings" }) },
  { name: "thinking", args: "[off|low|medium|high]", summary: "set the model's reasoning depth", group: "Config", action: () => ({ kind: "navigate", to: "/settings" }) },
  { name: "config", summary: "show the active configuration", group: "Config", action: () => ({ kind: "navigate", to: "/settings" }) },
  { name: "notes", args: "[add <text>|clear]", summary: "steering notes injected into prompts", group: "Config", action: () => ({ kind: "navigate", to: "/settings" }) },
  {
    name: "theme",
    args: "[dark|light]",
    summary: "switch the colour palette",
    group: "Config",
    action: (arg) => {
      const to = /light/i.test(arg) ? "light" : /dark/i.test(arg) ? "dark" : undefined
      return { kind: "theme", to }
    },
  },
  {
    name: "repo",
    args: "<path>",
    summary: "point at a different repository",
    group: "Config",
    action: (arg) => ({ kind: "repo", path: arg.trim() }),
  },

  // ---- knowledge tools ----
  {
    name: "hook",
    args: "[install|remove]",
    summary: "auto-update the wiki after each commit",
    group: "Knowledge",
    action: (arg) => ({
      kind: "hook",
      op: /install/i.test(arg) ? "install" : /remove/i.test(arg) ? "remove" : "status",
    }),
  },
  { name: "serve", summary: "browse the wiki (built into the app)", group: "Knowledge", action: () => ({ kind: "navigate", to: "/wiki" }) },
  { name: "impact", aliases: ["imp"], args: "<change>", summary: "predict a change's blast radius (terminal)", group: "Knowledge", action: () => tuiOnly("/impact") },
  { name: "templates", aliases: ["template"], summary: "prompt templates (terminal)", group: "Knowledge", action: () => tuiOnly("/templates") },
  { name: "ext", aliases: ["extension", "extensions"], summary: "manage community extensions", group: "Knowledge", action: () => ({ kind: "navigate", to: "/extensions" }) },
  { name: "x", args: "[ext command]", summary: "extension commands (Extensions screen)", group: "Knowledge", action: () => ({ kind: "navigate", to: "/extensions" }) },

  // ---- navigation ----
  // Named "read", not "wiki", so it cannot be confused with the /wiki
  // command that *generates* one.
  { name: "read", aliases: ["docs", "wikiread"], summary: "open the wiki reader", group: "Go to", action: () => ({ kind: "navigate", to: "/wiki" }) },
  { name: "activity", aliases: ["runs"], summary: "open the run console", group: "Go to", action: () => ({ kind: "navigate", to: "/activity" }) },
  { name: "status", summary: "module freshness and knowledge cards", group: "Go to", action: () => ({ kind: "navigate", to: "/cards" }) },
  { name: "diff", summary: "review the working tree (Editor → Git)", group: "Go to", action: () => ({ kind: "navigate", to: "/editor" }) },
  { name: "cost", aliases: ["usage"], summary: "token usage and spend", group: "Go to", action: () => ({ kind: "navigate", to: "/cost" }) },
  { name: "help", aliases: ["h", "?"], summary: "keyboard shortcuts", group: "Go to", action: () => ({ kind: "help" }) },

  // ---- app ----
  { name: "version", aliases: ["v"], summary: "print the Kaioken version", group: "App", action: () => ({ kind: "version" }) },
  { name: "quit", aliases: ["exit", "q"], summary: "exit Kaioken", group: "App", action: () => ({ kind: "quit" }) },
]

/** How much the user must type before a mid-name match counts — without it
 *  a single letter drags in noise, exactly as in the TUI palette. */
const MIN_SUBSTRING_MATCH = 3

/** Rank a command against the typed prefix: 2 = name prefix, 1 = alias
 *  prefix or a mid-name hit, 0 = no match. */
function rank(cmd: SlashCommand, prefix: string): number {
  if (prefix === "") return 2
  if (cmd.name.startsWith(prefix)) return 2
  if (cmd.aliases?.some((a) => a.startsWith(prefix))) return 1
  if (prefix.length >= MIN_SUBSTRING_MATCH && cmd.name.includes(prefix)) return 1
  return 0
}

export function filterCommands(prefix: string): SlashCommand[] {
  const p = prefix.toLowerCase()
  return SLASH_COMMANDS.map((cmd) => ({ cmd, r: rank(cmd, p) }))
    .filter((x) => x.r > 0)
    .sort((a, b) => b.r - a.r || a.cmd.name.localeCompare(b.cmd.name))
    .map((x) => x.cmd)
}

/** Find the command a fully-typed line names, plus its argument text. */
export function resolveCommand(line: string): { cmd: SlashCommand; arg: string } | null {
  if (!line.startsWith("/")) return null
  const body = line.slice(1)
  const spaceAt = body.search(/\s/)
  const name = (spaceAt === -1 ? body : body.slice(0, spaceAt)).toLowerCase()
  const arg = spaceAt === -1 ? "" : body.slice(spaceAt + 1)
  const cmd = SLASH_COMMANDS.find((c) => c.name === name || c.aliases?.includes(name))
  return cmd ? { cmd, arg } : null
}
