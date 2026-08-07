import TerminalWindow from "@/components/TerminalWindow"
import CodeBlock from "@/components/CodeBlock"
import { C, Callout, DocPage, H2, LI, P, UL } from "@/components/docs/parts"
import { OUTPUT_TREE } from "@/data/content"
import { cn } from "@/lib/utils"

export default function OutputDoc() {
  return (
    <DocPage
      title="Output layout"
      lead="Everything Kaioken produces lands in .kaioken/ inside the target repo — plain YAML you edit and markdown your agent reads."
    >
      <H2 id="tree">The tree</H2>
      <div className="pt-4">
        <TerminalWindow title=".kaioken/" meta="tree" bodyClassName="text-[12px] sm:text-[12.5px]">
          {OUTPUT_TREE.map((node) => (
            <div
              key={`${node.depth}-${node.name}`}
              className="flex items-baseline gap-2 whitespace-pre py-[1px]"
            >
              <span className="text-kai-dim select-none" aria-hidden>
                {node.depth === 0 ? "" : "│  ".repeat(node.depth - 1) + "├─ "}
              </span>
              <span
                className={cn(
                  "shrink-0",
                  node.kind === "dir" && "font-semibold text-kai-orange",
                  node.kind === "edit" && "font-semibold text-kai-amber",
                  node.kind === "file" && "text-foreground"
                )}
              >
                {node.name}
              </span>
              {node.note ? (
                <span className="truncate text-kai-dim">· {node.note}</span>
              ) : null}
            </div>
          ))}
        </TerminalWindow>
      </div>
      <p className="pt-3 font-mono text-[11.5px] text-kai-dim">
        <span className="text-kai-amber">▉</span> edit by hand ·{" "}
        <span className="text-kai-orange">▉</span> directory · generated files are safe to delete
        and rebuild
      </p>

      <H2 id="state">State files</H2>
      <UL>
        <LI>
          <C>wiki_state.yaml</C> — the commit the wiki reflects, plus any sections that failed so{" "}
          <C>/wiki retry</C> can target them.
        </LI>
        <LI>
          <C>state.json</C> — a sha256 per module over its scoped files. Unchanged modules are never
          re-billed.
        </LI>
        <LI>
          <C>sessions/</C> — saved chat conversations, reopened with <C>/resume</C>.
        </LI>
      </UL>

      <H2 id="provenance">The provenance footer</H2>
      <P>
        Every generated document ends with a machine-readable record of the sources it was written
        from. That footer — not a prose <em>Referenced Files</em> section — is what makes{" "}
        <C>kaioken update</C> able to decide which documents a diff invalidates.
      </P>
      <div className="pt-4">
        <CodeBlock
          title="wiki/section/document.md"
          code={`<!-- kaioken:files internal/tui/tui.go internal/tui/commands.go -->`}
        />
      </div>

      <H2 id="wiring">Wiring it into an agent</H2>
      <P>
        Point your agent at the index from <C>CLAUDE.md</C> or <C>AGENTS.md</C>.
      </P>
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
      <Callout kind="tip" title="Kaioken does this for itself">
        Its own chat agent loads the catalog automatically — skills lead it, and the agent is
        instructed to open a matching one before starting work.
      </Callout>

      <H2 id="vcs">Committing it</H2>
      <P>
        The output is text, so it diffs and reviews like anything else. Commit it if you want the
        knowledge to travel with the repo; the incremental machinery only needs{" "}
        <C>wiki_state.yaml</C> and <C>state.json</C> to be present to avoid a full rebuild.
      </P>
    </DocPage>
  )
}
