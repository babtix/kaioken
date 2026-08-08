import CodeBlock from "@/components/CodeBlock"
import Icon from "@/components/Icon"
import { C, Callout, DocPage, H2, P } from "@/components/docs/parts"
import { COMMAND_GROUPS } from "@/data/content"

interface CliGroup {
  heading: string
  rows: { cmd: string; args: string; summary: string }[]
}

const CLI: CliGroup[] = [
  {
    heading: "run it",
    rows: [
      { cmd: "kaioken", args: "", summary: "Launch the interactive TUI." },
      { cmd: "kaioken tui", args: "-repo <path>", summary: "Launch the TUI against a specific repo." },
      {
        cmd: "kaioken run",
        args: `-p "..." [-mode] [-approve] [-json]`,
        summary:
          "Headless: one prompt, then exit. -mode picks the permission preset, -approve sets the policy for state-changing actions (never | edits | all), -json emits typed events as JSON lines.",
      },
      {
        cmd: "kaioken rpc",
        args: "",
        summary:
          "Drive the agent over JSON-RPC 2.0 on stdio — agent.prompt/steer/approve/cancel, events as notifications. For editors and embedding processes.",
      },
      { cmd: "kaioken daemon", args: "[-port <n>]", summary: "Serve the engine over a loopback HTTP API — what Kaioken Desktop talks to." },
      { cmd: "kaioken upgrade", args: "[check]", summary: "Update kaioken itself from the latest GitHub release; check only reports." },
    ],
  },
  {
    heading: "the pipeline",
    rows: [
      { cmd: "kaioken init", args: "[-force]", summary: "Full first-run setup: config.yaml, a scan, and AGENTS.md." },
      { cmd: "kaioken scan", args: "", summary: "Scan the repo and print an inventory." },
      { cmd: "kaioken plan", args: "", summary: "LLM proposes modules.yaml — edit before generating." },
      { cmd: "kaioken generate", args: "[-module <id>]", summary: "Parallel knowledge-card generation; unchanged modules are skipped." },
      { cmd: "kaioken wiki", args: "[xN] [-force]", summary: "Deep multi-pass wiki; records the commit it documents." },
      { cmd: "kaioken update", args: "[-base <rev>]", summary: "git-diff-driven refresh of the wiki, the skills, and the cards of changed modules." },
      { cmd: "kaioken skills", args: "[list|<name>] [-force]", summary: "Plan and build the task-guide set." },
      { cmd: "kaioken status", args: "[-check] [-json]", summary: "Per-module freshness. -check is the CI drift gate: exit 0 fresh, 1 stale, 2 error." },
      { cmd: "kaioken models", args: "[filter]", summary: "Discover model ids from the provider." },
    ],
  },
  {
    heading: "research & analysis",
    rows: [
      {
        cmd: "kaioken research",
        args: "[xN] <question> [-mode] [-resume]",
        summary:
          "Answer from the open web: a router picks the fast single-loop or deep multi-agent path, grounds the claims, and writes a cited report. -mode auto|fast|deep pins the path, -resume continues an interrupted run, -verify cross-checks load-bearing claims. x10 (or -deep) produces the full dossier plus a signed PDF.",
      },
      {
        cmd: "kaioken impact",
        args: "<change> [-format] [-compare]",
        summary:
          "Predict the blast radius before editing: symbols, files, modules, wiki docs, skills and tests. -compare scores the newest prediction against what actually changed.",
      },
      {
        cmd: "kaioken review",
        args: "[-base <rev>] [-format] [-severity]",
        summary:
          "Review a diff against the repo's own documented conventions and skills. Exit code is the CI contract; -format json|sarif feeds a dashboard.",
      },
      { cmd: "kaioken verify", args: "", summary: "Run the repo's build/test commands green — an agent fixes failures, then Go re-runs every command as the gate." },
      { cmd: "kaioken watch", args: "[-interval <s>]", summary: "Poll the working tree and print a line when new changed paths appear." },
      { cmd: "kaioken usage", args: "[7d|refresh|prune]", summary: "What Kaioken has spent — by operation, model and workspace." },
      { cmd: "kaioken gitdraft", args: "[base]", summary: "LLM-drafted commit message + PR description grounded in the diff." },
      { cmd: "kaioken handoff", args: "[session-id] [-out]", summary: "Write a continuation briefing from a saved session." },
    ],
  },
  {
    heading: "publish & integrate",
    rows: [
      { cmd: "kaioken serve", args: "[-port <n>]", summary: "Browse the generated wiki at 127.0.0.1:7777." },
      { cmd: "kaioken publish", args: "[-out <dir>]", summary: "Render the wiki as static HTML — no server needed." },
      { cmd: "kaioken pack", args: "[-extract <file>]", summary: "Bundle or unpack the knowledge as a portable .tar.gz." },
      { cmd: "kaioken onboard", args: "[-force]", summary: "Write ONBOARDING.md assembled from wiki, cards and skills." },
      { cmd: "kaioken export", args: "<target> [-full]", summary: "Flatten the knowledge into claude-md | agents-md | cursor-rules | context-md. No model calls." },
      { cmd: "kaioken mcp", args: "[serve|manifest|validate]", summary: "Serve this repo's knowledge to any MCP client — Claude Desktop, Claude Code, Cursor." },
      { cmd: "kaioken index", args: "[-force]", summary: "Build the search index over the wiki, cards and skills — embeddings when configured." },
      { cmd: "kaioken search", args: "<query>", summary: "Query that index from the terminal." },
      { cmd: "kaioken ext", args: "[install|dev|trust|update|…]", summary: "Manage community extensions installed from GitHub releases." },
      { cmd: "kaioken hub", args: "[list|add|remove|status]", summary: "Cross-repo registry — track and check freshness across multiple repos." },
      { cmd: "kaioken hook", args: "[install|remove|status]", summary: "Post-commit hook that refreshes the wiki." },
    ],
  },
]

export default function CommandsDoc() {
  return (
    <DocPage
      title="Command reference"
      lead="Everything Kaioken does is reachable two ways: a slash command inside the TUI, or a subcommand for CI and automation."
    >
      <H2 id="slash">Slash commands</H2>
      <P>
        Type <C>/</C> in the TUI to filter these live. Arrows move, tab completes, enter runs. The
        manual travels with the binary too: <C>/tutorial</C> walks you through a chapter at a time,
        and <C>/explain &lt;command&gt;</C> prints one command&apos;s full reference page.
      </P>

      {COMMAND_GROUPS.map((group) => (
        <section key={group.id} className="pt-8">
          <div className="flex items-center gap-2">
            <Icon name={group.icon} className="size-4 text-kai-orange" />
            <h3 className="font-mono text-[14px] font-bold text-kai-amber">{group.label}</h3>
          </div>
          <p className="mt-1.5 font-sans text-[14px] text-muted-foreground">{group.blurb}</p>
          <div className="mt-3 overflow-hidden rounded-sm border border-border">
            {group.commands.map((c) => (
              <div
                key={c.name}
                className="grid gap-1 border-b border-border bg-card px-4 py-3 last:border-b-0 sm:grid-cols-[15rem_1fr] sm:items-baseline sm:gap-4"
              >
                <div className="flex min-w-0 items-baseline gap-2 font-mono text-[13px]">
                  <span className="font-semibold text-kai-blue">{c.name}</span>
                  {c.args ? <span className="truncate text-kai-dim">{c.args}</span> : null}
                </div>
                <p className="font-sans text-[13.5px] leading-relaxed text-muted-foreground">
                  {c.summary}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}

      <H2 id="cli">CLI subcommands</H2>
      <P>
        The same engine, scriptable. Useful in CI, when you want the wiki rebuilt by a job rather
        than by hand, or when another process is driving the agent. <C>kaioken help</C> prints this
        list from the binary itself.
      </P>
      {CLI.map((group) => (
        <section key={group.heading} className="pt-6">
          <h3 className="font-mono text-[11px] tracking-[0.25em] text-kai-amber uppercase">
            {group.heading}
          </h3>
          <div className="mt-3 overflow-hidden rounded-sm border border-border">
            {group.rows.map((c) => (
              <div
                key={c.cmd + c.args}
                className="grid gap-1 border-b border-border bg-card px-4 py-3 last:border-b-0 sm:grid-cols-[17rem_1fr] sm:items-baseline sm:gap-4"
              >
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 font-mono text-[13px]">
                  <span className="font-semibold text-kai-orange">{c.cmd}</span>
                  {c.args ? <span className="text-kai-dim">{c.args}</span> : null}
                </div>
                <p className="font-sans text-[13.5px] leading-relaxed text-muted-foreground">
                  {c.summary}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}

      <H2 id="flags">Common flags</H2>
      <div className="pt-4">
        <CodeBlock
          title="flags (after the command)"
          code={`-repo <path>     target repository (default: the current directory)
-model <id>      override the model from config.yaml
-module <id>     restrict generate to one module id (comma list repeats it)
-base <rev>      baseline commit for update (default: the recorded baseline)
-port <n>        port for serve and daemon (serve: 7777; daemon: ephemeral)
-force           regenerate even when sources are unchanged
-out <path>      override where a command writes its output`}
        />
      </div>

      <H2 id="pipeline">The usual order</H2>
      <div className="pt-4">
        <CodeBlock
          title="powershell"
          prompt
          code={`kaioken init            # config.yaml + a scan + AGENTS.md
kaioken plan            # then edit modules.yaml
kaioken generate

kaioken wiki            # first full run — records the commit it documents
kaioken skills          # task guides built on top of it
kaioken index           # make all of it searchable

kaioken update          # later — git-diffs against that commit`}
        />
      </div>

      <Callout kind="tip" title="Cancelling">
        <C>ctrl+c</C> cancels an in-flight run in the TUI without exiting the app. Failed wiki
        sections are recorded, so <C>/wiki retry</C> regenerates only those.
      </Callout>
    </DocPage>
  )
}
