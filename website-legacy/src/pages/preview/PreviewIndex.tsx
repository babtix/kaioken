import { Link } from "react-router-dom"
import { ArrowRight, Coins, FileText, Layers, Sigma } from "lucide-react"
import { RUN_COST, WIKI_SECTIONS, WIKI_STATS } from "@/data/wiki"

const STATS = [
  { icon: Layers, value: String(WIKI_STATS.sections), label: "sections" },
  { icon: FileText, value: String(WIKI_STATS.documents), label: "documents" },
  { icon: Sigma, value: `${Math.round(WIKI_STATS.words / 1000)}k`, label: "words" },
  { icon: Coins, value: RUN_COST.tokens, label: "tokens spent" },
]

export default function PreviewIndex() {
  return (
    <article className="min-w-0 pb-20">
      <header className="border-b border-border pb-6">
        <p className="font-mono text-[11px] tracking-[0.25em] text-kai-dim uppercase">
          <span className="text-kai-orange">▎</span> real output
        </p>
        <h1 className="mt-3 font-mono text-3xl font-bold tracking-tight text-foreground">
          .kaioken/wiki
        </h1>
        <p className="mt-3 max-w-2xl font-sans text-[15px] leading-relaxed text-muted-foreground">
          This is a real generation from the tool itself. Every document below is the unedited
          output of <code className="font-mono text-kai-amber">kaioken wiki</code> run at the
          default <strong className="font-semibold text-kai-orange">×3</strong> depth against this
          project&apos;s own Go source — copied straight out of the repository&apos;s{" "}
          <code className="font-mono text-kai-amber">.kaioken/</code> folder, and shipped here for
          demonstration only. Click any entry to read exactly what the tool generated.
        </p>
      </header>

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="bg-card px-5 py-5">
            <dt className="flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.2em] text-kai-dim uppercase">
              <s.icon className="size-3" />
              {s.label}
            </dt>
            <dd className="mt-1.5 font-mono text-2xl font-bold text-kai-orange">{s.value}</dd>
          </div>
        ))}
      </dl>

      {/* what this run cost, and what the next level up would */}
      <section className="mt-8 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2">
        <div className="bg-kai-orange/[0.06] p-5">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-kai-orange">{RUN_COST.level}</span>
            <span className="rounded-sm border border-kai-orange/40 px-1.5 py-px font-mono text-[9.5px] tracking-wider text-kai-orange uppercase">
              {RUN_COST.levelNote}
            </span>
          </div>
          <p className="mt-2.5 font-sans text-[14px] leading-relaxed text-muted-foreground">
            What produced everything on this page. Exhaustive coverage of every declaration in
            scope, at a cost of{" "}
            <strong className="font-semibold text-foreground">{RUN_COST.tokensLong}</strong>.
          </p>
        </div>
        <div className="bg-card p-5">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-kai-amber">
              {RUN_COST.deepLevel}
            </span>
            <span className="rounded-sm border border-kai-amber/40 px-1.5 py-px font-mono text-[9.5px] tracking-wider text-kai-amber uppercase">
              estimated
            </span>
          </div>
          <p className="mt-2.5 font-sans text-[14px] leading-relaxed text-muted-foreground">
            The same repository at maximum depth — critique-and-revise plus grounding correction —
            estimated at{" "}
            <strong className="font-semibold text-foreground">{RUN_COST.deepTokensLong}</strong>.
          </p>
        </div>
      </section>

      <p className="mt-4 font-mono text-[11.5px] leading-relaxed text-kai-dim">
        <span className="text-kai-green">✓</span> the estimate prints before the run starts, so the
        jump from {RUN_COST.tokens} to {RUN_COST.deepTokens} is a decision you make up front — not a
        bill you discover afterwards
      </p>

      <section className="pt-12">
        <h2 className="font-mono text-[11px] tracking-[0.25em] text-kai-amber uppercase">
          browse the output
        </h2>
        <div className="mt-4 space-y-3">
          {WIKI_SECTIONS.map((section, i) => (
            <div key={section.slug} className="overflow-hidden rounded-sm border border-border">
              <div className="flex items-center gap-3 border-b border-border bg-kai-panel px-4 py-2.5">
                <span className="font-mono text-[11px] text-kai-dim">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-bold text-foreground">
                  {section.title}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-kai-amber">
                  {section.docs.length} docs
                </span>
              </div>
              <ul className="divide-y divide-border">
                {section.docs.map((doc) => (
                  <li key={doc.slug}>
                    <Link
                      to={`/preview/${section.slug}/${doc.slug}`}
                      className="group flex items-center gap-3 bg-card px-4 py-2.5 transition-colors hover:bg-kai-panel"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-muted-foreground transition-colors group-hover:text-kai-orange">
                        {doc.title}
                      </span>
                      {doc.hasMermaid ? (
                        <span className="hidden shrink-0 rounded-sm border border-kai-blue/30 px-1.5 py-px font-mono text-[9.5px] tracking-wider text-kai-blue uppercase sm:inline">
                          diagram
                        </span>
                      ) : null}
                      <span className="w-20 shrink-0 text-right font-mono text-[11px] text-kai-dim">
                        {doc.words.toLocaleString()} w
                      </span>
                      <ArrowRight className="size-3 shrink-0 -translate-x-1 text-kai-orange opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </article>
  )
}
