import { ArrowRight, ExternalLink, Maximize2 } from "lucide-react"
import { Link } from "react-router-dom"
import CodeBlock from "@/components/CodeBlock"
import SectionHeading from "@/components/SectionHeading"
import LinkButton from "@/components/LinkButton"
import { GITHUB_URL } from "@/data/content"
import { RUN_COST, WIKI_SECTIONS, WIKI_STATS } from "@/data/wiki"

const STATS = [
  { value: String(WIKI_STATS.sections), label: "sections" },
  { value: String(WIKI_STATS.documents), label: "documents" },
  { value: `${Math.round(WIKI_STATS.words / 1000)}k`, label: "words" },
  { value: RUN_COST.tokens, label: "tokens" },
]

const MAX_DOCS = Math.max(...WIKI_SECTIONS.map((s) => s.docs.length))

function Shot({
  src,
  alt,
  caption,
  points,
}: {
  src: string
  alt: string
  caption: string
  points: string[]
}) {
  return (
    <figure className="group">
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block overflow-hidden rounded-sm border border-border bg-card transition-colors hover:border-kai-orange/45"
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="w-full transition-transform duration-500 group-hover:scale-[1.015]"
        />
        <span className="absolute top-3 right-3 flex items-center gap-1.5 rounded-sm border border-border bg-background/85 px-2 py-1 font-mono text-[10.5px] text-muted-foreground opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
          <Maximize2 className="size-3" />
          full size
        </span>
      </a>
      <figcaption className="mt-4">
        <p className="font-mono text-[13px] font-bold text-kai-amber">{caption}</p>
        <ul className="mt-2.5 space-y-1.5">
          {points.map((p) => (
            <li
              key={p}
              className="flex gap-2 font-sans text-[13.5px] leading-relaxed text-muted-foreground"
            >
              <span className="mt-[7px] size-1 shrink-0 rounded-full bg-kai-orange" aria-hidden />
              {p}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  )
}

export default function Showcase() {
  return (
    <div className="pt-24">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="showcase"
          title={
            <>
              The wiki Kaioken wrote{" "}
              <span className="text-kai-orange glow-orange">about itself</span>
            </>
          }
          description="Kaioken was pointed at its own Go source and left to run. The result ships with this site — you can read every document it produced, unedited."
        />

        <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="bg-card px-5 py-6">
              <dt className="font-mono text-[10.5px] tracking-[0.2em] text-kai-dim uppercase">
                {s.label}
              </dt>
              <dd className="mt-1 font-mono text-3xl font-bold text-kai-orange">{s.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6">
          <LinkButton to="/preview" size="lg">
            Read the generated output
            <ArrowRight data-icon="inline-end" />
          </LinkButton>
        </div>
      </section>

      {/* what the run cost, and what the next level up would */}
      <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="what it cost"
          title="×3 by default, ×10 if you want every pass"
          description="The multiplier buys passes, and passes cost tokens. Kaioken prints the estimate before the run starts, so the difference below is a decision rather than a surprise."
        />
        <div className="mt-8 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2">
          <div className="bg-kai-orange/[0.06] p-6">
            <div className="flex items-baseline gap-2.5">
              <span className="font-mono text-4xl font-bold text-kai-orange">{RUN_COST.level}</span>
              <span className="rounded-sm border border-kai-orange/40 px-1.5 py-px font-mono text-[10px] tracking-wider text-kai-orange uppercase">
                {RUN_COST.levelNote}
              </span>
            </div>
            <p className="mt-1.5 font-mono text-[13px] text-kai-amber">{RUN_COST.tokensLong}</p>
            <p className="mt-3 font-sans text-[14px] leading-relaxed text-muted-foreground">
              What actually produced the {WIKI_STATS.documents} documents on this site — exhaustive
              coverage of every declaration in scope.
            </p>
          </div>
          <div className="bg-card p-6">
            <div className="flex items-baseline gap-2.5">
              <span className="font-mono text-4xl font-bold text-kai-amber">
                {RUN_COST.deepLevel}
              </span>
              <span className="rounded-sm border border-kai-amber/40 px-1.5 py-px font-mono text-[10px] tracking-wider text-kai-amber uppercase">
                estimated
              </span>
            </div>
            <p className="mt-1.5 font-mono text-[13px] text-kai-amber">{RUN_COST.deepTokensLong}</p>
            <p className="mt-3 font-sans text-[14px] leading-relaxed text-muted-foreground">
              The same repository at maximum depth: critique-and-revise on every draft, plus
              correction of every grounding failure verification found.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="kaioken serve"
          title="Browsing it locally"
          description="One command renders the same folder as a local site. These screenshots come from an earlier run against this repository — the plan differs from the output shipped above, but the interface is the one you get."
        />
        <div className="mt-10 grid gap-12 lg:grid-cols-2 lg:gap-10">
          <Shot
            src="/shots/wiki_index.png"
            alt="The generated wiki's table of contents, with a section sidebar and an on-this-page outline"
            caption="Table of contents"
            points={[
              "Left: every planned section with its document count. Right: an on-this-page outline generated from the headings.",
              "Search is full-text across all chapters — press / to focus it.",
              "Cross-chapter mentions become relative links in a post-pass, with no model call.",
            ]}
          />
          <Shot
            src="/shots/wiki_doc.png"
            alt="A generated architecture chapter showing a rendered mermaid sequence diagram"
            caption="A chapter, with diagrams"
            points={[
              "Mermaid is rendered, not shown as code. Invalid diagrams are demoted to plain code blocks rather than shipping as an error box.",
              "Headings name real files, because every claim is checked against the code index.",
              "×2 and above adds subsection documents and diagrams like this sequence.",
            ]}
          />
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="the plan it produced"
          title={`${WIKI_STATS.sections} sections, planned then verified`}
          description="The outline came from wiki_plan.yaml — proposed by the model, editable by hand before a single chapter was generated. Every row opens the real documents."
        />
        <div className="mt-8 overflow-hidden rounded-sm border border-border">
          {WIKI_SECTIONS.map((s, i) => (
            <Link
              key={s.slug}
              to={`/preview/${s.slug}/${s.docs[0].slug}`}
              className="group flex items-center gap-4 border-b border-border bg-card px-4 py-3 transition-colors last:border-b-0 hover:bg-kai-panel"
            >
              <span className="w-6 shrink-0 font-mono text-[11px] text-kai-dim">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[13.5px] text-foreground transition-colors group-hover:text-kai-orange">
                {s.title}
              </span>
              <span className="hidden h-1.5 w-40 overflow-hidden rounded-sm bg-kai-line sm:block">
                <span
                  className="block h-full bg-kai-orange/70 transition-colors group-hover:bg-kai-orange"
                  style={{ width: `${(s.docs.length / MAX_DOCS) * 100}%` }}
                />
              </span>
              <span className="w-16 shrink-0 text-right font-mono text-[12px] text-kai-amber">
                {s.docs.length} docs
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-4 pb-24 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <SectionHeading
              eyebrow="reproduce it"
              title="Two commands on your own repo"
              description="The scan is free and the plan is a file you can edit. The cost estimate prints before anything expensive runs."
            />
            <div className="mt-7 flex flex-wrap gap-3">
              <LinkButton to="/docs/wiki">
                Deep wiki docs
                <ArrowRight data-icon="inline-end" />
              </LinkButton>
              <LinkButton href={GITHUB_URL} variant="outline">
                <ExternalLink data-icon="inline-start" />
                Source
              </LinkButton>
            </div>
          </div>
          <CodeBlock
            title="powershell"
            prompt
            code={`cd path\\to\\your\\repo
kaioken init
kaioken wiki          # ×3 by default
kaioken serve         # http://127.0.0.1:7777`}
          />
        </div>
      </section>
    </div>
  )
}
