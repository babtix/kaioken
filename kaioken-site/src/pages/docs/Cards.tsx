import CodeBlock from "@/components/CodeBlock"
import TerminalWindow from "@/components/TerminalWindow"
import { C, Callout, DocPage, H2, LI, P, UL } from "@/components/docs/parts"

const SCHEMA = [
  { file: "_module.yaml", note: "metadata — scope, model, generated_at" },
  { file: "overview.md", note: "what this module is and why it exists" },
  { file: "architecture.md", note: "how it is put together internally" },
  { file: "conventions.md", note: "the local rules a newcomer would violate" },
  { file: "tech_stack.md", note: "what it depends on and why" },
  { file: "setup_commands.md", note: "only when the module has unique commands" },
]

export default function Cards() {
  return (
    <DocPage
      title="Knowledge cards"
      lead="Dense per-module documents on a fixed schema — inspired by Qoder's repowiki knowledge folder, with a planning step you control."
    >
      <H2 id="plan">Plan first</H2>
      <P>
        <C>kaioken plan</C> has the LLM propose <C>modules.yaml</C>: a module tree with a file
        scope for each entry. It is meant to be edited. Module boundaries are a judgment call the
        maintainer should own, and the file is plain YAML precisely so you can argue with it.
      </P>
      <div className="pt-4">
        <CodeBlock
          title="powershell"
          prompt
          code={`kaioken scan            # what will be analyzed
kaioken plan            # propose modules.yaml
# edit modules.yaml
kaioken generate        # parallel card generation`}
        />
      </div>
      <Callout kind="warn" title="Coverage is reported">
        After planning, Kaioken reports what percentage of scanned files the plan claims and which
        directories the misses cluster in. Files no module claims are reported rather than silently
        ignored.
      </Callout>

      <H2 id="schema">The fixed schema</H2>
      <P>
        Every module produces the same files, so an agent can rely on them existing without
        probing.
      </P>
      <div className="pt-4">
        <TerminalWindow title=".kaioken/knowledge/&lt;module&gt;/" bodyClassName="text-[12.5px]">
          {SCHEMA.map((s, i) => (
            <div key={s.file} className="flex items-baseline gap-2 whitespace-pre py-[1px]">
              <span className="text-kai-dim select-none" aria-hidden>
                {i === SCHEMA.length - 1 ? "└─ " : "├─ "}
              </span>
              <span className="shrink-0 text-foreground">{s.file}</span>
              <span className="truncate text-kai-dim">· {s.note}</span>
            </div>
          ))}
        </TerminalWindow>
      </div>

      <H2 id="incremental">Incrementality</H2>
      <P>
        <C>.kaioken/state.json</C> stores a sha256 over each module&apos;s scoped files. Unchanged
        modules are never re-billed — running <C>generate</C> twice in a row costs nothing the
        second time.
      </P>
      <div className="pt-4">
        <CodeBlock
          title="tui"
          code={`/status              # per-module freshness
/cards               # only the stale ones
/cards force         # rebuild everything
/cards <module-id>   # just one`}
        />
      </div>
      <Callout kind="note" title="Cards vs. the wiki">
        Cards are compact, per-module, and agent-facing. The deep wiki is long-form, narrative, and
        human-facing. Today <C>update</C> covers the wiki; diff-driven updates for cards are on the
        roadmap.
      </Callout>

      <H2 id="index">The index</H2>
      <P>
        <C>.kaioken/KNOWLEDGE.md</C> is the file an agent reads first — a catalog of what exists and
        where. Kaioken&apos;s own chat agent loads it automatically and opens individual cards on
        demand through its <C>read_knowledge</C> tool.
      </P>
      <UL>
        <LI>Low temperature (0.2) — cards should be factual, not creative.</LI>
        <LI>
          Bundling heuristics put manifests and entry points first, tests last; long files keep head
          and tail.
        </LI>
        <LI>
          A file&apos;s skeleton always fits the budget, so nothing in scope is invisible to the
          model — detail is rationed, never coverage.
        </LI>
      </UL>
    </DocPage>
  )
}
