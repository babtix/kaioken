import Icon from "@/components/Icon"
import SectionHeading from "@/components/SectionHeading"
import { ROADMAP_CATEGORIES, ARCH_ENABLERS, type RoadmapCategory } from "@/data/roadmap"
import { cn } from "@/lib/utils"

/* ── tone styles ─────────────────────────────────────────────────────────── */

const TONE: Record<
  RoadmapCategory["tone"],
  { icon: string; rule: string; badge: string; hover: string }
> = {
  orange: {
    icon: "text-kai-orange",
    rule: "bg-kai-orange",
    badge: "border-kai-orange/40 text-kai-orange",
    hover: "hover:border-kai-orange/45",
  },
  amber: {
    icon: "text-kai-amber",
    rule: "bg-kai-amber",
    badge: "border-kai-amber/40 text-kai-amber",
    hover: "hover:border-kai-amber/45",
  },
  blue: {
    icon: "text-kai-blue",
    rule: "bg-kai-blue",
    badge: "border-kai-blue/40 text-kai-blue",
    hover: "hover:border-kai-blue/40",
  },
  green: {
    icon: "text-kai-green",
    rule: "bg-kai-green",
    badge: "border-kai-green/40 text-kai-green",
    hover: "hover:border-kai-green/40",
  },
}

/* ── category section ────────────────────────────────────────────────────── */

function CategorySection({ cat }: { cat: RoadmapCategory }) {
  const tone = TONE[cat.tone]
  return (
    <section className="border-t border-border py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* header row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="mt-0.5 font-mono text-[11px] tracking-[0.25em] text-kai-dim">
              {cat.index}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <Icon name={cat.icon} className={cn("size-4.5", tone.icon)} />
                <h3 className="font-mono text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  {cat.title}
                </h3>
                {cat.status && (
                  <span
                    className={cn(
                      "rounded-sm border px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase",
                      tone.badge
                    )}
                  >
                    {cat.status}
                  </span>
                )}
              </div>
              <p className="mt-2 max-w-2xl font-sans text-[13.5px] leading-relaxed text-muted-foreground">
                {cat.blurb}
              </p>
            </div>
          </div>
          <span
            className={cn(
              "hidden shrink-0 rounded-sm border px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase sm:block",
              tone.badge
            )}
          >
            {cat.items.length} features
          </span>
        </div>

        {/* feature cards */}
        <div className="mt-8 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {cat.items.map((item) => (
            <article
              key={item.title}
              className="group relative bg-card p-5 transition-colors duration-200 hover:bg-kai-panel"
            >
              {/* gutter bar on hover */}
              <span
                className={cn(
                  "absolute inset-y-0 left-0 w-[2px] origin-top scale-y-0 transition-transform duration-300 group-hover:scale-y-100",
                  tone.rule
                )}
                aria-hidden
              />
              <h4 className="font-mono text-[13.5px] font-bold text-foreground">{item.title}</h4>
              <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── page ────────────────────────────────────────────────────────────────── */

const TOTAL_FEATURES = ROADMAP_CATEGORIES.reduce((n, c) => n + c.items.length, 0)

const SUMMARY_STATS = [
  { value: String(ROADMAP_CATEGORIES.length), label: "categories" },
  { value: String(TOTAL_FEATURES), label: "features" },
  { value: String(ARCH_ENABLERS.length), label: "enablers" },
  { value: "1", label: "binary" },
]

export default function Next() {
  return (
    <div className="pt-24">
      {/* hero */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="next"
          title={
            <>
              What comes <span className="text-kai-orange glow-orange">next</span>
            </>
          }
          description="A next-generation interface for Kaioken — advanced agents, richer search, a GUI shell, deeper integrations, and extended language support. Every item builds on the existing architecture: the agent loop, tool framework, codemap index, wiki engine, and serve layer."
        />

        {/* stats bar */}
        <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-4">
          {SUMMARY_STATS.map((s) => (
            <div key={s.label} className="bg-card px-5 py-5">
              <dt className="font-mono text-[10.5px] tracking-[0.2em] text-kai-dim uppercase">
                {s.label}
              </dt>
              <dd className="mt-1 font-mono text-2xl font-bold text-kai-orange">{s.value}</dd>
            </div>
          ))}
        </dl>

        {/* context note */}
        <div className="mt-6 rounded-sm border border-border bg-card p-5">
          <p className="font-mono text-[12.5px] leading-relaxed text-kai-dim">
            <span className="text-kai-orange">▎</span> These enhancements extend the current
            architecture — the{" "}
            <span className="text-foreground">Agent.Run()</span> tool loop,{" "}
            <span className="text-foreground">codemap.Index</span> symbol extraction,{" "}
            <span className="text-foreground">wiki.Run()</span> multi-pass pipeline,{" "}
            <span className="text-foreground">serve.Server</span> HTTP layer, and the{" "}
            <span className="text-foreground">skills</span> system — rather than replacing it.
          </p>
        </div>
      </section>

      {/* category sections */}
      <div className="mt-16">
        {ROADMAP_CATEGORIES.map((cat) => (
          <CategorySection key={cat.id} cat={cat} />
        ))}
      </div>

      {/* architectural enablers */}
      <section className="border-t border-border py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="foundation"
            title={
              <>
                Architectural <span className="text-kai-amber">enablers</span>
              </>
            }
            description="Cross-cutting changes that underpin multiple categories above. Each one extends an existing structure rather than introducing a new system."
          />
          <ul className="mt-8 space-y-0 overflow-hidden rounded-sm border border-border">
            {ARCH_ENABLERS.map((item, i) => (
              <li
                key={item.title}
                className="group flex gap-4 border-b border-border bg-card px-5 py-4 transition-colors last:border-b-0 hover:bg-kai-panel"
              >
                <span className="mt-px shrink-0 font-mono text-[11px] text-kai-dim">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="font-mono text-[13.5px] font-bold text-foreground">{item.title}</p>
                  <p className="mt-1 font-sans text-[13px] leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* closing */}
      <section className="relative overflow-hidden border-t border-border">
        <div className="rule-sweep absolute inset-x-0 top-0 h-px" aria-hidden />
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <p className="font-mono text-[11px] tracking-[0.3em] text-kai-dim uppercase">
            the roadmap is the repo
          </p>
          <h2 className="mx-auto mt-4 max-w-2xl text-balance font-mono text-xl font-bold text-foreground sm:text-2xl">
            Every feature here maps to an{" "}
            <span className="text-kai-orange glow-orange">existing interface</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl font-sans text-[14px] leading-relaxed text-muted-foreground">
            The agent's UI interface, the tool schema, the Progress callbacks, the serve routes, and
            the codemap Index — these are the extension points each enhancement plugs into.
          </p>
        </div>
      </section>
    </div>
  )
}
