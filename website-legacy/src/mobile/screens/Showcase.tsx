import { ArrowRight, Maximize2 } from "lucide-react"
import Code from "@/mobile/components/Code"
import {
  Action,
  Eyebrow,
  Lead,
  ListRow,
  RowGroup,
  Section,
  SectionHead,
  StatGrid,
} from "@/mobile/components/primitives"
import { GITHUB_URL } from "@/data/content"
import { RUN_COST, WIKI_SECTIONS, WIKI_STATS } from "@/data/wiki"
import GithubMark from "@/components/GithubMark"

const STATS = [
  { value: String(WIKI_STATS.sections), label: "sections" },
  { value: String(WIKI_STATS.documents), label: "documents" },
  { value: `${Math.round(WIKI_STATS.words / 1000)}k`, label: "words" },
  { value: RUN_COST.tokens, label: "tokens" },
]

const MAX_DOCS = Math.max(...WIKI_SECTIONS.map((s) => s.docs.length))

const SHOTS = [
  {
    src: "/shots/wiki_index.png",
    width: 1500,
    height: 949,
    caption: "Table of contents",
    note: "Every planned section with its document count, an outline built from the headings, and full-text search across all chapters.",
  },
  {
    src: "/shots/wiki_doc.png",
    width: 1920,
    height: 889,
    caption: "A chapter, with diagrams",
    note: "Mermaid is rendered rather than shown as code, and invalid diagrams are demoted to plain code blocks instead of shipping as an error box.",
  },
]

export default function Showcase() {
  return (
    <>
      <header className="px-4 pt-6">
        <Eyebrow>showcase</Eyebrow>
        <h1 className="mt-3 font-mono text-[25px] leading-[1.2] font-bold tracking-tight text-balance text-foreground">
          The wiki Kaioken wrote{" "}
          <span className="text-kai-orange glow-orange">about itself</span>
        </h1>
        <Lead className="mt-3">
          Kaioken was pointed at its own Go source and left to run. The result ships with this site
          — you can read every document it produced, unedited.
        </Lead>

        <StatGrid className="mt-6" items={STATS} />

        <Action to="/preview" className="mt-4">
          Read the generated output
          <ArrowRight className="size-4" aria-hidden />
        </Action>
      </header>

      <Section className="pt-8">
        <SectionHead
          index="01"
          eyebrow="kaioken serve"
          title="Browsing it locally"
          lead="One command renders the same folder as a local site. Tap a shot to open it full size."
        />

        <div className="mt-5 space-y-6">
          {SHOTS.map((shot) => (
            <figure key={shot.src}>
              <a
                href={shot.src}
                target="_blank"
                rel="noopener noreferrer"
                className="relative block overflow-hidden rounded-md border border-border bg-card"
              >
                <img
                  src={shot.src}
                  alt={shot.caption}
                  width={shot.width}
                  height={shot.height}
                  loading="lazy"
                  decoding="async"
                  className="h-auto w-full"
                />
                <span className="absolute top-2 right-2 flex items-center gap-1.5 rounded-sm border border-border bg-background/85 px-2 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur">
                  <Maximize2 className="size-3" aria-hidden />
                  full size
                </span>
              </a>
              <figcaption className="mt-2.5">
                <p className="font-mono text-[12.5px] font-bold text-kai-amber">{shot.caption}</p>
                <p className="mt-1.5 font-sans text-[12.5px] leading-[1.6] text-muted-foreground">
                  {shot.note}
                </p>
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <Section className="pt-8">
        <SectionHead
          index="02"
          eyebrow="head-to-head"
          title="Kaioken vs Gemini Deep Search"
          lead="Same clinical prompt submitted to both research engines. Unedited head-to-head comparison."
        />

        <div className="mt-5 space-y-4">
          {/* Kaioken Mobile Card */}
          <div className="rounded-md border border-kai-orange/45 bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-bold text-kai-orange uppercase">
                Kaioken Research
              </span>
              <span className="rounded bg-kai-orange/10 px-1.5 py-0.5 font-mono text-[10px] text-kai-amber">
                30,818 words
              </span>
            </div>
            <h4 className="mt-2 font-mono text-[13.5px] font-bold text-foreground">
              Deep Rigor & Premise Deconstruction
            </h4>
            <p className="mt-1.5 font-sans text-[12.5px] leading-relaxed text-muted-foreground">
              Identified 0 head-to-head RCTs exist in CKD literature, deconstructed prompt flaw, mapped star-network NMA geometry, and cited 117+ references.
            </p>
            <Action to="/preview/research/compare-the-efficacy-and-adverse-event-profiles-of-sglt2-inh" className="mt-3">
              Read Kaioken Report (30.8k w)
              <ArrowRight className="size-3.5" aria-hidden />
            </Action>
          </div>

          {/* Gemini Mobile Card */}
          <div className="rounded-md border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-bold text-blue-400 uppercase">
                Gemini Deep Search
              </span>
              <span className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                5,967 words
              </span>
            </div>
            <h4 className="mt-2 font-mono text-[13.5px] font-bold text-foreground">
              High-Level Overview (French)
            </h4>
            <p className="mt-1.5 font-sans text-[12.5px] leading-relaxed text-muted-foreground">
              Accepted prompt at face value, forcing 3 placebo-controlled RCTs into a comparison table without analyzing indirect network transitivity.
            </p>
            <Action to="/preview/research/gemini-sglt2-vs-glp-1-in-ckd" variant="outline" className="mt-3">
              Read Gemini Report (5.9k w)
              <ArrowRight className="size-3.5" aria-hidden />
            </Action>
          </div>
        </div>
      </Section>

      <Section className="pt-8">
        <SectionHead
          index="03"
          eyebrow="the plan it produced"
          title={<>{WIKI_STATS.sections} sections, planned then verified</>}
          lead="The outline came from wiki_plan.yaml — proposed by the model, editable by hand before a single chapter was generated."
        />

        <RowGroup className="mt-5">
          {WIKI_SECTIONS.map((s, i) => (
            <ListRow
              key={s.slug}
              to={`/preview/${s.slug}/${s.docs[0].slug}`}
              title={s.title}
              glyph={
                <span className="mt-1 font-mono text-[11px] text-kai-dim">
                  {String(i + 1).padStart(2, "0")}
                </span>
              }
              subtitle={
                <span className="mt-1.5 flex items-center gap-2">
                  <span className="h-1 flex-1 overflow-hidden rounded-sm bg-kai-line">
                    <span
                      className="block h-full bg-kai-orange/70"
                      style={{ width: `${(s.docs.length / MAX_DOCS) * 100}%` }}
                    />
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-kai-amber">
                    {s.docs.length} docs
                  </span>
                </span>
              }
            />
          ))}
        </RowGroup>
      </Section>

      <Section className="pt-8">
        <SectionHead
          index="04"
          eyebrow="reproduce it"
          title="Two commands on your own repo"
          lead="The scan is free and the plan is a file you can edit. The cost estimate prints before anything expensive runs."
        />
        <Code
          className="mt-5"
          title="powershell"
          prompt
          code={`cd path\\to\\your\\repo
kaioken init
kaioken wiki          # ×3 by default
kaioken serve         # http://127.0.0.1:7777`}
        />
        <div className="mt-4 space-y-2.5">
          <Action to="/docs/wiki">
            Deep wiki docs
            <ArrowRight className="size-4" aria-hidden />
          </Action>
          <Action href={GITHUB_URL} variant="outline">
            <GithubMark className="size-4" />
            Source
          </Action>
        </div>
      </Section>
    </>
  )
}
