import { Pencil } from "lucide-react"
import SectionHeading from "@/components/SectionHeading"
import CodeBlock from "@/components/CodeBlock"
import { PIPELINE } from "@/data/content"
import { cn } from "@/lib/utils"

export default function Pipeline() {
  return (
    <section id="pipeline" className="relative border-t border-border py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          index="02"
          eyebrow="how it works"
          title="A pipeline you can interrupt"
          description="Every expensive step is preceded by a cheap one you can read. The plan is a file on disk before it is a bill — module boundaries are a judgment call the maintainer should own."
        />

        <div className="mt-12 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
          <ol className="relative">
            {/* the spine connecting the steps */}
            <span
              className="absolute top-2 bottom-6 left-[15px] w-px bg-gradient-to-b from-kai-orange/60 via-border to-transparent"
              aria-hidden
            />
            {PIPELINE.map((step, i) => (
              <li key={step.cmd} className="relative flex gap-4 pb-8 last:pb-0">
                <span
                  className={cn(
                    "relative z-10 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm border font-mono text-[11px] font-bold",
                    step.human
                      ? "border-kai-amber/50 bg-kai-amber/10 text-kai-amber"
                      : "border-border bg-kai-panel text-kai-orange"
                  )}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded-sm bg-kai-panel px-1.5 py-0.5 font-mono text-[12.5px] text-kai-orange">
                      {step.cmd}
                    </code>
                    <span className="font-mono text-[13px] font-semibold text-foreground">
                      {step.title}
                    </span>
                    {step.human ? (
                      <span className="inline-flex items-center gap-1 rounded-sm border border-kai-amber/40 px-1.5 py-px font-mono text-[10px] tracking-wider text-kai-amber uppercase">
                        <Pencil className="size-2.5" />
                        your turn
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 font-sans text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="lg:sticky lg:top-24 lg:self-start">
            <CodeBlock
              title="powershell"
              prompt
              code={`kaioken init
kaioken scan
kaioken plan

# modules.yaml is yours now — edit the boundaries
kaioken generate
kaioken status

kaioken wiki                 # records the commit it documents
kaioken update               # later: only what the diff invalidated`}
            />
            <p className="mt-4 font-sans text-[13px] leading-relaxed text-muted-foreground">
              Files no section claims are reported rather than silently ignored — that usually
              means the plan needs a{" "}
              <code className="font-mono text-kai-amber">-force</code> re-plan to cover a new area.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
