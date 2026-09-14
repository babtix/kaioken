import Accordion from "@/mobile/components/Accordion"
import {
  Eyebrow,
  Lead,
  ListRow,
  Note,
  Section,
  SectionHead,
  StatGrid,
  Tag,
} from "@/mobile/components/primitives"
import { RUN_COST, WIKI_SECTIONS, WIKI_STATS } from "@/data/wiki"

const STATS = [
  { value: String(WIKI_STATS.sections), label: "sections" },
  { value: String(WIKI_STATS.documents), label: "documents" },
  { value: `${Math.round(WIKI_STATS.words / 1000)}k`, label: "words" },
  { value: RUN_COST.tokens, label: "tokens" },
]

export default function Output() {
  return (
    <>
      <header className="px-4 pt-6">
        <Eyebrow>real output</Eyebrow>
        <h1 className="mt-3 font-mono text-[24px] leading-[1.2] font-bold tracking-tight break-all text-foreground">
          .kaioken/wiki
        </h1>
        <Lead className="mt-3">
          Every document below is the unedited output of{" "}
          <code className="font-mono text-kai-amber">kaioken wiki</code>, run at the default{" "}
          <strong className="font-semibold text-kai-orange">×3</strong> depth against this
          project&apos;s own Go source — copied straight out of the repository and shipped here.
        </Lead>

        <StatGrid className="mt-6" items={STATS} />
      </header>

      <Section className="pt-8">
        <SectionHead index="01" eyebrow="what it cost" title="×3 shipped, ×10 estimated" />

        <div className="mt-5 space-y-2.5">
          <div className="rounded-md border border-kai-orange/30 bg-kai-orange/[0.07] p-4">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[24px] leading-none font-bold text-kai-orange">
                {RUN_COST.level}
              </span>
              <Tag className="border-kai-orange/40 text-kai-orange">{RUN_COST.levelNote}</Tag>
            </div>
            <p className="mt-2.5 font-sans text-[12.5px] leading-[1.6] text-muted-foreground">
              What produced everything on this page — exhaustive coverage of every declaration in
              scope, at <strong className="font-semibold text-foreground">{RUN_COST.tokensLong}</strong>.
            </p>
          </div>

          <div className="rounded-md border border-border bg-card p-4">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[24px] leading-none font-bold text-kai-amber">
                {RUN_COST.deepLevel}
              </span>
              <Tag className="border-kai-amber/40 text-kai-amber">estimated</Tag>
            </div>
            <p className="mt-2.5 font-sans text-[12.5px] leading-[1.6] text-muted-foreground">
              The same repository at maximum depth — critique-and-revise plus grounding correction —
              estimated at{" "}
              <strong className="font-semibold text-foreground">{RUN_COST.deepTokensLong}</strong>.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <Note tone="green" glyph="✓">
            The estimate prints before the run starts, so the jump from {RUN_COST.tokens} to{" "}
            {RUN_COST.deepTokens} is a decision you make up front — not a bill you discover
            afterwards.
          </Note>
        </div>
      </Section>

      <Section className="pt-8">
        <SectionHead
          index="02"
          eyebrow="browse the output"
          title={<>{WIKI_STATS.sections} sections</>}
          lead="Tap a section to list its documents."
        />

        <Accordion
          className="mt-5"
          items={WIKI_SECTIONS.map((section, i) => ({
            id: section.slug,
            title: section.title,
            glyph: (
              <span className="font-mono text-[11px] text-kai-dim">
                {String(i + 1).padStart(2, "0")}
              </span>
            ),
            meta: <Tag>{section.docs.length}</Tag>,
            body: (
              <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
                {section.docs.map((doc) => (
                  <ListRow
                    key={doc.slug}
                    to={`/preview/${section.slug}/${doc.slug}`}
                    title={doc.title}
                    subtitle={
                      <span className="font-mono text-[11px] text-kai-dim">
                        {doc.words.toLocaleString()} words
                        {doc.hasMermaid ? (
                          <span className="text-kai-blue"> · diagrams</span>
                        ) : null}
                      </span>
                    }
                    className="min-h-[52px] py-2.5"
                  />
                ))}
              </div>
            ),
          }))}
        />
      </Section>
    </>
  )
}
