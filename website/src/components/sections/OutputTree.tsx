import { ArrowRight, Pencil } from "lucide-react"
import SectionHeading from "@/components/SectionHeading"
import TerminalWindow from "@/components/TerminalWindow"
import LinkButton from "@/components/LinkButton"
import { OUTPUT_TREE } from "@/data/content"
import { cn } from "@/lib/utils"

export default function OutputTree() {
  return (
    <section id="output" className="relative border-t border-border py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          index="05"
          eyebrow="output layout"
          title="Everything lands in .kaioken/"
          description="Plain files in the target repo — YAML you edit, markdown your agent reads. Nothing is locked in a database, and the files marked below are meant to be changed by hand."
        />

        <div className="mt-12 grid gap-8 lg:grid-cols-[1.35fr_1fr]">
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
                  <span className="truncate text-kai-dim">
                    <span className="mr-1">·</span>
                    {node.note}
                  </span>
                ) : null}
              </div>
            ))}
          </TerminalWindow>

          <div className="space-y-5">
            <div className="rounded-sm border border-kai-amber/30 bg-kai-amber/[0.05] p-5">
              <div className="flex items-center gap-2">
                <Pencil className="size-3.5 text-kai-amber" />
                <h3 className="font-mono text-[13px] font-bold text-kai-amber">
                  The steering-notes channel
                </h3>
              </div>
              <p className="mt-2.5 font-sans text-sm leading-relaxed text-muted-foreground">
                The most valuable idea borrowed from Qoder&apos;s <code className="font-mono text-kai-amber">wiki_plan.yaml</code>:{" "}
                <code className="font-mono text-kai-amber">notes</code> in{" "}
                <code className="font-mono text-kai-amber">config.yaml</code> are authoritative
                instructions injected into every prompt — for tribal knowledge the code does not
                state.
              </p>
            </div>

            <div className="rounded-sm border border-border bg-card p-5">
              <h3 className="font-mono text-[13px] font-bold text-foreground">
                Wiring it into your agent
              </h3>
              <p className="mt-2.5 font-sans text-sm leading-relaxed text-muted-foreground">
                Point any agent at the index from <code className="font-mono text-kai-blue">CLAUDE.md</code>{" "}
                or <code className="font-mono text-kai-blue">AGENTS.md</code>. Kaioken&apos;s own chat
                agent does this automatically — skills lead its knowledge catalog and it is
                instructed to open a matching one before starting work.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <LinkButton to="/preview" size="sm">
                  Browse the real output
                  <ArrowRight data-icon="inline-end" />
                </LinkButton>
                <LinkButton to="/docs/output" variant="outline" size="sm">
                  Layout docs
                </LinkButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
