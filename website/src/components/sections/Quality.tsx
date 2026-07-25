import Icon from "@/components/Icon"
import SectionHeading from "@/components/SectionHeading"
import { QUALITY } from "@/data/content"

export default function Quality() {
  return (
    <section id="quality" className="relative border-t border-border py-20 sm:py-24">
      {/* faint character grid — the texture a terminal emulator leaves behind */}
      <div className="term-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          index="04"
          eyebrow="engineering"
          title="Failure modes, addressed mechanically"
          description="Long-form generation fails in predictable ways. Kaioken addresses each one with code rather than by asking the model nicely."
        />

        <div className="mt-12 grid gap-x-10 gap-y-8 md:grid-cols-2">
          {QUALITY.map((q, i) => (
            <article key={q.claim} className="group border-l border-border pl-5 transition-colors hover:border-kai-orange/50">
              <div className="flex items-center gap-2.5">
                <Icon name={q.icon} className="size-4 text-kai-orange" />
                <span className="font-mono text-[10.5px] tracking-[0.2em] text-kai-dim">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-2.5 font-mono text-[14.5px] leading-snug font-bold text-kai-amber">
                {q.claim}
              </h3>
              <p className="mt-2 font-sans text-sm leading-relaxed text-muted-foreground">
                {q.body}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-12 rounded-sm border border-border bg-card p-5">
          <p className="font-mono text-[12px] leading-relaxed text-muted-foreground">
            <span className="text-kai-green">▸</span>{" "}
            <span className="text-foreground">Post-passes with no model call:</span> invalid mermaid
            is demoted to a plain code block rather than shipping as an error box in the browser,
            and mentions of other chapters become relative links instead of duplicated explanations.
          </p>
        </div>
      </div>
    </section>
  )
}
