import Icon from "@/components/Icon"
import Reveal from "@/components/Reveal"
import SectionHeading from "@/components/SectionHeading"
import { FEATURES, type Feature } from "@/data/content"
import { cn } from "@/lib/utils"

/** Accent per card — orange and amber carry the page, blue and green are rare. */
const TONE: Record<Feature["tone"], { icon: string; glow: string; border: string; top: string }> = {
  orange: {
    icon: "text-kai-orange",
    glow: "hover:shadow-[0_16px_40px_-12px_rgba(255,135,0,0.35),0_0_0_1px_rgba(255,135,0,0.15)]",
    border: "hover:border-kai-orange/30",
    top: "bg-kai-orange",
  },
  amber: {
    icon: "text-kai-amber",
    glow: "hover:shadow-[0_16px_40px_-12px_rgba(255,175,0,0.35),0_0_0_1px_rgba(255,175,0,0.15)]",
    border: "hover:border-kai-amber/30",
    top: "bg-kai-amber",
  },
  blue: {
    icon: "text-kai-blue",
    glow: "hover:shadow-[0_16px_40px_-12px_rgba(135,215,255,0.3),0_0_0_1px_rgba(135,215,255,0.12)]",
    border: "hover:border-kai-blue/30",
    top: "bg-kai-blue",
  },
  green: {
    icon: "text-kai-green",
    glow: "hover:shadow-[0_16px_40px_-12px_rgba(0,215,135,0.3),0_0_0_1px_rgba(0,215,135,0.12)]",
    border: "hover:border-kai-green/30",
    top: "bg-kai-green",
  },
}

export default function Features() {
  return (
    <section id="features" className="relative border-t border-border py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <SectionHeading
            index="01"
            eyebrow="what it does"
            title="Complete AI coding & knowledge engine"
            description="Nothing here is a wrapper around a chat box. Each capability exists because long-form generation and coding agent loops fail in specific ways, and each one addresses them mechanically."
          />
        </Reveal>

        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const tone = TONE[f.tone]
            return (
              <Reveal key={f.title} className="h-full" style={{ transitionDelay: `${i * 60}ms` }}>
                <article
                  className={cn(
                    "group relative flex h-full flex-col rounded-md border border-border/70",
                    "glass p-6 transition-all duration-250",
                    tone.glow,
                    tone.border
                  )}
                >
                  {/* Tone-colored top accent line */}
                  <span
                    className={cn(
                      "absolute inset-x-0 top-0 h-[2px] rounded-t-md opacity-0 transition-opacity duration-300 group-hover:opacity-100",
                      tone.top
                    )}
                    aria-hidden
                  />
                  {/* Left gutter bar */}
                  <span
                    className={cn(
                      "absolute inset-y-4 left-0 w-[2px] origin-top scale-y-0 rounded-full transition-transform duration-300 group-hover:scale-y-100",
                      tone.top
                    )}
                    aria-hidden
                  />

                  {/* Icon with hover scale */}
                  <div className={cn("size-9 rounded-md border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-sm flex items-center justify-center transition-transform duration-200 group-hover:scale-110", tone.icon)}>
                    <Icon name={f.icon} className="size-4" />
                  </div>

                  <h3 className="mt-4 font-mono text-[15px] font-bold text-foreground">{f.title}</h3>
                  <p className="mt-2 font-sans text-sm leading-relaxed text-muted-foreground flex-1">
                    {f.description}
                  </p>
                  <ul className="mt-5 space-y-1.5 border-t border-border/60 pt-4">
                    {f.highlights.map((h) => (
                      <li key={h} className="flex gap-2 font-mono text-[11.5px] leading-relaxed">
                        <span className={cn("shrink-0 mt-px", tone.icon)} aria-hidden>
                          ▸
                        </span>
                        <span className="text-muted-foreground">{h}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
