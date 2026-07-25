import CodeBlock from "@/components/CodeBlock"
import Icon from "@/components/Icon"
import { C, Callout, DocPage, H2, P } from "@/components/docs/parts"
import { COMMAND_GROUPS } from "@/data/content"

const CLI = [
  { cmd: "kaioken", args: "", summary: "Launch the interactive TUI." },
  { cmd: "kaioken tui", args: "-repo <path>", summary: "Launch the TUI against a specific repo." },
  { cmd: "kaioken init", args: "", summary: "Create .kaioken/config.yaml in the target repo." },
  { cmd: "kaioken scan", args: "", summary: "Scan the repo and print an inventory." },
  { cmd: "kaioken plan", args: "", summary: "LLM proposes modules.yaml — edit before generating." },
  { cmd: "kaioken generate", args: "", summary: "Parallel knowledge-card generation." },
  { cmd: "kaioken status", args: "", summary: "Per-module freshness." },
  { cmd: "kaioken wiki", args: "", summary: "Deep multi-pass wiki; records the commit it documents." },
  { cmd: "kaioken update", args: "[-base <rev>]", summary: "git-diff-driven refresh of wiki and skills." },
  { cmd: "kaioken skills", args: "[list|-force]", summary: "Plan and build the task-guide set." },
  { cmd: "kaioken serve", args: "[-port <n>]", summary: "Browse the generated wiki at 127.0.0.1:7777." },
  { cmd: "kaioken hook", args: "[install|remove]", summary: "Post-commit hook that refreshes the wiki." },
  { cmd: "kaioken models", args: "[filter]", summary: "Discover model ids from the provider." },
]

export default function CommandsDoc() {
  return (
    <DocPage
      title="Command reference"
      lead="Everything Kaioken does is reachable two ways: a slash command inside the TUI, or a subcommand for CI and automation."
    >
      <H2 id="slash">Slash commands</H2>
      <P>
        Type <C>/</C> in the TUI to filter these live. Arrows move, tab completes, enter runs.
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
        The same pipeline, scriptable. Useful in CI, or when you want the wiki rebuilt by a job
        rather than by hand.
      </P>
      <div className="mt-4 overflow-hidden rounded-sm border border-border">
        {CLI.map((c) => (
          <div
            key={c.cmd + c.args}
            className="grid gap-1 border-b border-border bg-card px-4 py-3 last:border-b-0 sm:grid-cols-[17rem_1fr] sm:items-baseline sm:gap-4"
          >
            <div className="flex min-w-0 items-baseline gap-2 font-mono text-[13px]">
              <span className="font-semibold text-kai-orange">{c.cmd}</span>
              {c.args ? <span className="truncate text-kai-dim">{c.args}</span> : null}
            </div>
            <p className="font-sans text-[13.5px] leading-relaxed text-muted-foreground">
              {c.summary}
            </p>
          </div>
        ))}
      </div>

      <H2 id="pipeline">The usual order</H2>
      <div className="pt-4">
        <CodeBlock
          title="powershell"
          prompt
          code={`kaioken init
kaioken scan
kaioken plan            # then edit modules.yaml
kaioken generate

kaioken wiki            # first full run — records the commit it documents
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
