import SectionHeading from "@/components/SectionHeading"
import CodeBlock from "@/components/CodeBlock"
import { RESEARCH, RESEARCH_EXAMPLE, RESEARCH_NOTES } from "@/data/content"
import { cn } from "@/lib/utils"

export default function Research() {
  return (
    <section id="research" className="relative border-t border-border py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          index="06"
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

        {/* Real research reports generated in .kaioken/research/ */}
        <div className="mt-12 rounded-sm border border-border/80 bg-kai-panel/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-[1px] bg-kai-orange" aria-hidden />
              <span className="font-mono text-[11px] tracking-[0.15em] text-kai-dim uppercase">
                generated artifacts in .kaioken/research/
              </span>
            </div>
            <span className="font-mono text-[11px] text-kai-amber">
              3 unedited live runs shipped
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <a
              href="/preview/research/is-solar-cheaper-than-nuclear-in-europe"
              className="group rounded-sm border border-border bg-card p-3.5 transition-colors hover:border-kai-orange/60"
            >
              <span className="font-mono text-[10px] text-kai-dim">REPORT · 1,438 WORDS</span>
              <h4 className="mt-1 font-mono text-[12.5px] font-bold text-foreground group-hover:text-kai-orange">
                Solar vs Nuclear LCOE in Europe
              </h4>
              <p className="mt-1 font-sans text-[11.5px] text-muted-foreground line-clamp-2">
                Utility-scale solar LCOE comparison across Spain, Italy, Germany and UK.
              </p>
            </a>
            <a
              href="/preview/research/compare-the-efficacy-and-adverse-event-profiles-of-sglt2-inh"
              className="group rounded-sm border border-border bg-card p-3.5 transition-colors hover:border-kai-orange/60"
            >
              <span className="font-mono text-[10px] text-kai-dim">REPORT · 30,818 WORDS</span>
              <h4 className="mt-1 font-mono text-[12.5px] font-bold text-foreground group-hover:text-kai-orange">
                SGLT2 vs GLP-1 in T2D with CKD
              </h4>
              <p className="mt-1 font-sans text-[11.5px] text-muted-foreground line-clamp-2">
                No head-to-head RCTs exist — all evidence is indirect via placebo-controlled trials. CREDENCE, DAPA-CKD, EMPA-KIDNEY analysis.
              </p>
            </a>
            <a
              href="/preview/research/last-cloud-llm-at-ollama"
              className="group rounded-sm border border-border bg-card p-3.5 transition-colors hover:border-kai-orange/60"
            >
              <span className="font-mono text-[10px] text-kai-dim">REPORT · 1,283 WORDS</span>
              <h4 className="mt-1 font-mono text-[12.5px] font-bold text-foreground group-hover:text-kai-orange">
                Cloud LLMs at Ollama
              </h4>
              <p className="mt-1 font-sans text-[11.5px] text-muted-foreground line-clamp-2">
                Integration patterns, host configuration & remote provider endpoints.
              </p>
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
