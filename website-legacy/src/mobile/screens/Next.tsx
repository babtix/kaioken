import Icon from "@/components/Icon"
import Accordion from "@/mobile/components/Accordion"
import {
  Eyebrow,
  Lead,
  Note,
  Section,
  SectionHead,
  StatGrid,
  Tag,
} from "@/mobile/components/primitives"
import { tone, toneText } from "@/mobile/lib/tone"
import { ARCH_ENABLERS, ROADMAP_CATEGORIES } from "@/data/roadmap"
import { cn } from "@/lib/utils"

const TOTAL_FEATURES = ROADMAP_CATEGORIES.reduce((n, c) => n + c.items.length, 0)

const STATS = [
  { value: String(ROADMAP_CATEGORIES.length), label: "categories" },
  { value: String(TOTAL_FEATURES), label: "features" },
  { value: String(ARCH_ENABLERS.length), label: "enablers" },
  { value: "1", label: "binary" },
]

/** Shipped items carry a check; the rest are still ideas. */
function Done() {
  return (
    <span className="ml-1.5 inline-flex size-4 shrink-0 translate-y-px items-center justify-center rounded-full bg-kai-green/15 text-kai-green">
      <Icon name="Check" className="size-2.5" strokeWidth={3} aria-hidden />
    </span>
  )
}

export default function Next() {
  return (
    <>
      <header className="px-4 pt-6">
        <Eyebrow>next</Eyebrow>
        <h1 className="mt-3 font-mono text-[26px] leading-[1.2] font-bold tracking-tight text-foreground">
          What comes <span className="text-kai-orange glow-orange">next</span>
        </h1>
        <Lead className="mt-3">
          Advanced agents, richer search, a GUI shell, deeper integrations and extended language
          support. Every item builds on what already exists — the agent loop, the tool framework,
          the codemap index, the wiki engine and the serve layer.
        </Lead>

        <StatGrid className="mt-6" items={STATS} />

        <div className="mt-4">
          <Note tone="orange" glyph="▎">
            These enhancements extend the current architecture — the{" "}
            <span className="font-mono text-foreground">Agent.Run()</span> tool loop,{" "}
            <span className="font-mono text-foreground">codemap.Index</span> symbol extraction,{" "}
            <span className="font-mono text-foreground">wiki.Run()</span> multi-pass pipeline,{" "}
            <span className="font-mono text-foreground">serve.Server</span> HTTP layer and the{" "}
            <span className="font-mono text-foreground">skills</span> system — rather than replacing
            it.
          </Note>
        </div>
      </header>

      <Section className="pt-8">
        <SectionHead
          index="01"
          eyebrow="the plan"
          title={<>{ROADMAP_CATEGORIES.length} categories</>}
          lead="Tap a category to read its features."
        />

        <Accordion
          className="mt-5"
          items={ROADMAP_CATEGORIES.map((cat) => {
            const t = tone(cat.tone)
            return {
              id: cat.id,
              title: cat.title,
              glyph: <Icon name={cat.icon} className={cn("size-4", toneText[t])} aria-hidden />,
              meta: <Tag>{cat.items.length}</Tag>,
              body: (
                <>
                  <p className="font-sans text-[12.5px] leading-[1.6] text-muted-foreground">
                    {cat.blurb}
                  </p>
                  {cat.status ? (
                    <p className="mt-2">
                      <Tag className={toneText[t]}>{cat.status}</Tag>
                    </p>
                  ) : null}
                  <ul className="mt-3 divide-y divide-border/70 border-t border-border/70">
                    {cat.items.map((item) => (
                      <li key={item.title} className="py-2.5">
                        <p className="font-mono text-[12.5px] font-bold text-foreground">
                          {item.title}
                          {item.done ? <Done /> : null}
                        </p>
                        <p className="mt-1 font-sans text-[12px] leading-[1.55] text-muted-foreground">
                          {item.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              ),
            }
          })}
        />
      </Section>

      <Section className="pt-8">
        <SectionHead
          index="02"
          eyebrow="foundation"
          title={
            <>
              Architectural <span className="text-kai-amber">enablers</span>
            </>
          }
          lead="Cross-cutting changes that underpin several categories above. Each one extends an existing structure rather than introducing a new system."
        />

        <ol className="mt-5 divide-y divide-border overflow-hidden rounded-md border border-border">
          {ARCH_ENABLERS.map((item, i) => (
            <li key={item.title} className="flex gap-3 bg-card px-4 py-3.5">
              <span className="mt-px shrink-0 font-mono text-[11px] text-kai-dim">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p className="font-mono text-[12.5px] font-bold text-foreground">
                  {item.title}
                  {item.done ? <Done /> : null}
                </p>
                <p className="mt-1 font-sans text-[12px] leading-[1.55] text-muted-foreground">
                  {item.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <section className="relative overflow-hidden border-t border-border px-4 py-12 text-center">
        <div className="rule-sweep absolute inset-x-0 top-0 h-px" aria-hidden />
        <p className="font-mono text-[10.5px] tracking-[0.3em] text-kai-dim uppercase">
          the roadmap is the repo
        </p>
        <h2 className="mt-3.5 font-mono text-[19px] leading-[1.3] font-bold text-balance text-foreground">
          Every feature here maps to an{" "}
          <span className="text-kai-orange glow-orange">existing interface</span>
        </h2>
        <Lead className="mt-3">
          The agent&apos;s UI interface, the tool schema, the Progress callbacks, the serve routes
          and the codemap Index — these are the extension points each enhancement plugs into.
        </Lead>
      </section>
    </>
  )
}
