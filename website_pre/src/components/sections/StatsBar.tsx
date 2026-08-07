import Reveal from "@/components/Reveal"
import { cn } from "@/lib/utils"

const STATS = [
  { value: "1", label: "Go binary", sub: "single executable", accent: "text-kai-orange" },
  { value: "9+", label: "LLM providers", sub: "OpenAI · Anthropic · Gemini · more", accent: "text-kai-amber" },
  { value: "∞", label: "context depth", sub: "deep wiki + knowledge cards", accent: "text-kai-green" },
  { value: "MIT", label: "open source", sub: "no cloud lock-in", accent: "text-kai-blue" },
  { value: "0", label: "dependencies", sub: "for the binary itself", accent: "text-kai-tan" },
]

export default function StatsBar() {
  return (
    <section className="relative border-t border-border section-alt py-10 sm:py-12">
      {/* Ambient sweep line at top */}
      <div className="rule-sweep absolute inset-x-0 top-0 h-px" aria-hidden />

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {STATS.map((s, i) => (
              <div
                key={s.label}
                className={cn(
                  "group flex flex-col items-center gap-1 rounded-md px-4 py-5 text-center glass",
                  "lift cursor-default",
                )}
                style={{ transitionDelay: `${i * 50}ms` }}
              >
                <span
                  className={cn(
                    "font-mono text-3xl font-bold tracking-tight",
                    s.accent
                  )}
                >
                  {s.value}
                </span>
                <span className="font-mono text-[13px] font-semibold text-foreground">
                  {s.label}
                </span>
                <span className="font-sans text-[11px] leading-snug text-muted-foreground">
                  {s.sub}
                </span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
