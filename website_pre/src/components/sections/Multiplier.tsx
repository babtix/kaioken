import SectionHeading from "@/components/SectionHeading"
import { MULTIPLIER } from "@/data/content"
import { cn } from "@/lib/utils"

export default function Multiplier() {
  return (
    <section id="multiplier" className="relative border-t border-border py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          index="04"
          eyebrow="the multiplier"
          title="×N buys passes, not padding"
          description="Above ×3 the multiplier used to mean “ask for more lines”. It now buys passes. Each level roughly doubles the calls per document — which is what a power-multiplier metaphor ought to mean."
        />

        <div className="mt-12 overflow-hidden rounded-sm border border-border">
          <div className="hidden border-b border-border bg-kai-panel px-5 py-2.5 font-mono text-[11px] tracking-[0.2em] text-kai-dim uppercase sm:grid sm:grid-cols-[7rem_1fr]">
            <span>level</span>
            <span>behavior</span>
          </div>
          {MULTIPLIER.map((row) => (
            <div
              key={row.level}
              className={cn(
                "grid gap-1 border-b border-border px-5 py-4 last:border-b-0 sm:grid-cols-[7rem_1fr] sm:gap-4",
                row.isDefault ? "bg-kai-orange/[0.06]" : "bg-card"
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "font-mono text-base font-bold",
                    row.isDefault ? "text-kai-orange" : "text-kai-amber"
                  )}
                >
                  {row.level}
                </span>
                {row.isDefault ? (
                  <span className="rounded-sm border border-kai-orange/40 px-1.5 py-px font-mono text-[9.5px] tracking-wider text-kai-orange uppercase">
                    default
                  </span>
                ) : null}
              </div>
              <p className="font-sans text-sm leading-relaxed text-muted-foreground">
                {row.behavior}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-5 font-mono text-[12px] text-kai-dim">
          <span className="text-kai-green">✓</span> the estimate names the passes before the run
          starts, and asks for confirmation past a threshold
        </p>
      </div>
    </section>
  )
}
