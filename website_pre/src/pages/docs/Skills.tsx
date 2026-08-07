import CodeBlock from "@/components/CodeBlock"
import { C, Callout, DocPage, H2, LI, P, UL } from "@/components/docs/parts"

const SKILL_MD = `---
name: add-a-tui-command
description: How to add a slash command to the Kaioken TUI. Use when adding,
  renaming or removing TUI commands.
sources:
  - internal/tui/tui.go
generated_at: 2026-07-24T19:02:36Z
---

# Add a TUI command

## Steps
1. Add a case to \`dispatch\` …`

export default function Skills() {
  return (
    <DocPage
      title="Skills"
      lead="The wiki explains what a codebase contains. A skill explains how to do a task in it — which files to touch, in what order, following which local conventions."
    >
      <H2 id="why">Why skills</H2>
      <P>
        A description of the architecture is not what an agent needs at the moment it starts
        working. It needs the procedure: the files, the order, the local rules — exactly what a
        general model cannot know about your project.
      </P>
      <P>
        Kaioken plans the recurring tasks in your repo — <C>add-an-api-endpoint</C>,{" "}
        <C>add-a-cli-command</C>, <C>write-a-test</C>, <C>run-a-migration</C>, whatever fits your
        stack — then writes one grounded guide per task.
      </P>

      <H2 id="layout">Layout</H2>
      <div className="pt-4">
        <CodeBlock
          title=".kaioken/skills/"
          code={`.kaioken/skills/
├─ README.md                     the catalog an agent reads first
└─ add-a-tui-command/
   └─ SKILL.md`}
        />
      </div>

      <H2 id="format">The Agent Skills format</H2>
      <P>
        Each <C>SKILL.md</C> carries frontmatter so runtimes that understand the format can load
        skills on demand by matching the <C>description</C>.
      </P>
      <div className="pt-4">
        <CodeBlock title="SKILL.md" code={SKILL_MD} />
      </div>
      <P>
        The body is procedural, not descriptive: prerequisites, numbered steps naming real files,
        the conventions that are not obvious from the code, how to verify the change, and the
        mistakes people actually make in this codebase.
      </P>

      <H2 id="current">They stay current</H2>
      <P>
        The <C>sources</C> list is what makes skills incremental. <C>kaioken update</C> diffs the
        repo and refreshes only the skills whose sources the change touched — the same mechanism
        that keeps the wiki current.
      </P>
      <div className="pt-4">
        <CodeBlock
          title="powershell"
          prompt
          code={`kaioken skills            # plan and build the set
kaioken skills list       # see what exists
kaioken skills -force     # rewrite them all
kaioken update            # refreshes wiki AND the affected skills`}
        />
      </div>

      <Callout kind="tip" title="When to run it">
        The TUI suggests <C>/skills</C> once a wiki or card run finishes, since that is when there
        is something to build on.
      </Callout>

      <H2 id="agents">How agents pick them up</H2>
      <UL>
        <LI>
          Kaioken&apos;s own chat agent lists skills first in its knowledge catalog, and is told to
          open a matching one <em>before</em> starting a task.
        </LI>
        <LI>
          For other agents, point at the catalog from <C>CLAUDE.md</C> or <C>AGENTS.md</C>.
        </LI>
      </UL>
      <div className="pt-4">
        <CodeBlock
          title="CLAUDE.md"
          code={`## Project knowledge
Before starting a task, check .kaioken/skills/README.md — if a skill matches
what you are doing, follow it. For unfamiliar areas, read
.kaioken/KNOWLEDGE.md and the cards for the modules you touch, or the
relevant chapter in .kaioken/wiki/.`}
        />
      </div>
    </DocPage>
  )
}
