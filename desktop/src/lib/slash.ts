// The composer's slash vocabulary, mirroring internal/tui/commands.go so
// muscle memory transfers from the terminal. Commands the GUI expresses
// better as a screen (serve, diff, quit, tutorial) are deliberately absent —
// this is the set that *does* something from the composer.

export type SlashAction =
  | { kind: "run"; runKind: string; params?: Record<string, unknown> }
  | { kind: "session"; op: "new" | "compact" }
  | { kind: "undo" }
  | { kind: "toggle"; which: "yolo" | "shell" }
  | { kind: "navigate"; to: string }
  | { kind: "help" }

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

/** Parse an `xN` multiplier argument, as `/wiki x3` in the TUI. */
function multiplierOf(arg: string, fallback = 3): number {
  const m = /x\s*(\d+)/i.exec(arg)
  if (!m) return fallback
  return Math.min(10, Math.max(1, Number(m[1])))
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // ---- pipelines ----
  {
    name: "wiki",
    args: "[xN] [force]",
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

  // ---- conversation ----
  { name: "new", aliases: ["reset"], summary: "start a fresh session", group: "Conversation", action: () => ({ kind: "session", op: "new" }) },
  { name: "compact", summary: "summarise the transcript to free context", group: "Conversation", action: () => ({ kind: "session", op: "compact" }) },
  { name: "undo", summary: "revert the agent's last file change", group: "Conversation", action: () => ({ kind: "undo" }) },
  { name: "yolo", summary: "toggle auto-approve for this turn", group: "Conversation", action: () => ({ kind: "toggle", which: "yolo" }) },
  { name: "shell", summary: "toggle whether run_command is offered", group: "Conversation", action: () => ({ kind: "toggle", which: "shell" }) },

  // ---- navigation ----
  // Named "read", not "wiki", so it cannot be confused with the /wiki
  // command that *generates* one.
  { name: "read", aliases: ["docs", "wikiread"], summary: "open the wiki reader", group: "Go to", action: () => ({ kind: "navigate", to: "/wiki" }) },
  { name: "activity", aliases: ["runs"], summary: "open the run console", group: "Go to", action: () => ({ kind: "navigate", to: "/activity" }) },
  { name: "status", summary: "module freshness and knowledge cards", group: "Go to", action: () => ({ kind: "navigate", to: "/cards" }) },
  { name: "cost", aliases: ["usage"], summary: "token usage for this session", group: "Go to", action: () => ({ kind: "navigate", to: "/settings" }) },
  { name: "model", aliases: ["models", "provider", "key", "config", "notes"], summary: "model, provider, keys and config", group: "Go to", action: () => ({ kind: "navigate", to: "/settings" }) },
  { name: "help", aliases: ["?"], summary: "keyboard shortcuts", group: "Go to", action: () => ({ kind: "help" }) },
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
