import Icon from "@/components/Icon"
import SectionHeading from "@/components/SectionHeading"
import { FEATURES, type Feature } from "@/data/content"
import { cn } from "@/lib/utils"

/** Accent per card — orange and amber carry the page, blue and green are rare. */
const TONE: Record<Feature["tone"], { icon: string; rule: string; hover: string }> = {
  orange: { icon: "text-kai-orange", rule: "bg-kai-orange", hover: "hover:border-kai-orange/45" },
  amber: { icon: "text-kai-amber", rule: "bg-kai-amber", hover: "hover:border-kai-amber/45" },
  blue: { icon: "text-kai-blue", rule: "bg-kai-blue", hover: "hover:border-kai-blue/40" },
  green: { icon: "text-kai-green", rule: "bg-kai-green", hover: "hover:border-kai-green/40" },
}

export default function Features() {
  return (
    <section id="features" className="relative border-t border-border py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          index="01"
          eyebrow="what it does"
          title="Complete AI coding & knowledge engine"
          description="Nothing here is a wrapper around a chat box. Each capability exists because long-form generation and coding agent loops fail in specific ways, and each one addresses them mechanically."
        />

        <div className="mt-12 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => {
            const tone = TONE[f.tone]
            return (
              <article
                key={f.title}
                className={cn(
                  "group relative flex flex-col bg-card p-6 transition-colors duration-200",
                  "hover:bg-kai-panel"
                )}
              >
                {/* the gutter bar the TUI uses to mark an active row */}
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 w-[2px] origin-top scale-y-0 transition-transform duration-300 group-hover:scale-y-100",
                    tone.rule
                  )}
                  aria-hidden
                />
                <Icon name={f.icon} className={cn("size-5", tone.icon)} />
                <h3 className="mt-4 font-mono text-[15px] font-bold text-foreground">{f.title}</h3>
                <p className="mt-2 font-sans text-sm leading-relaxed text-muted-foreground">
                  {f.description}
                </p>
                <ul className="mt-5 space-y-1.5 border-t border-border pt-4">
                  {f.highlights.map((h) => (
                    <li key={h} className="flex gap-2 font-mono text-[11.5px] leading-relaxed">
                      <span className={cn("shrink-0", tone.icon)} aria-hidden>
                        ▸
                      </span>
                      <span className="text-muted-foreground">{h}</span>
                    </li>
                  ))}
                </ul>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
