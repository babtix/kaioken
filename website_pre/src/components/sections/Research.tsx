import SectionHeading from "@/components/SectionHeading"
import CodeBlock from "@/components/CodeBlock"
import { RESEARCH, RESEARCH_EXAMPLE, RESEARCH_NOTES } from "@/data/content"
import { cn } from "@/lib/utils"

export default function Research() {
  return (
    <section id="research" className="relative border-t border-border py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          index="03"
          eyebrow="deep research"
          title={
            <>
              Ask the open web,{" "}
              <span className="text-kai-orange glow-orange">get a cited answer</span>
            </>
          }
          description="One question goes in, a sourced report comes out. A cheap router decides whether the question needs a quick search loop or a team of parallel research agents — and every claim in the report traces back to a page that was actually read."
        />

        <div className="mt-12 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
          <ol className="relative">
            {/* the spine connecting the steps */}
            <span
              className="absolute top-2 bottom-6 left-[15px] w-px bg-gradient-to-b from-kai-orange/60 via-border to-transparent"
              aria-hidden
            />
            {RESEARCH.map((step, i) => (
              <li key={step.title} className="relative flex gap-4 pb-8 last:pb-0">
                <span
                  className={cn(
                    "relative z-10 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm border font-mono text-[11px] font-bold",
                    step.tone === "amber"
                      ? "border-kai-amber/50 bg-kai-amber/10 text-kai-amber"
                      : "border-border bg-kai-panel text-kai-orange"
                  )}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 pt-1">
                  <span className="font-mono text-[13px] font-semibold text-foreground">
                    {step.title}
                  </span>
                  <p className="mt-1.5 font-sans text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="lg:sticky lg:top-24 lg:self-start">
            <CodeBlock title="powershell" prompt code={RESEARCH_EXAMPLE} />
            <ul className="mt-5 space-y-2.5">
              {RESEARCH_NOTES.map((note) => (
                <li key={note} className="flex gap-2.5 font-sans text-[13px] leading-relaxed">
                  <span className="mt-px shrink-0 font-mono text-kai-green" aria-hidden>
                    ✓
                  </span>
                  <span className="text-muted-foreground">{note}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
