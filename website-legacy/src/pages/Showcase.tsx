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

interface ResearchCardProps {
  title: string
  summary: string
  words: number
  slug: string
  depth?: string
}

function ResearchCard({ title, summary, words, slug, depth }: ResearchCardProps) {
  return (
    <Link
      to={`/preview/research/${slug}`}
      className="group block rounded-md border border-border bg-card p-5 transition-colors hover:border-kai-orange/45 hover:bg-kai-panel"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-[13.5px] font-bold text-foreground transition-colors group-hover:text-kai-orange">
          {title}
        </h3>
        {depth ? (
          <span className="rounded-sm border border-kai-orange/40 bg-kai-orange/10 px-1.5 py-0.5 font-mono text-[10px] text-kai-amber">
            {depth}
          </span>
        ) : null}
      </div>
      <p className="mt-3 font-sans text-[13px] leading-relaxed text-muted-foreground">{summary}</p>
      <div className="mt-4 flex items-center justify-between">
        <span className="font-mono text-[11px] text-kai-dim">
          {words.toLocaleString()} words
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-kai-orange transition-colors group-hover:gap-2">
          Read report
          <ArrowRight className="size-3" />
        </span>
      </div>
    </Link>
  )
}

function Shot({
  src,
  alt,
  caption,
  points,
  width,
  height,
}: {
  src: string
  alt: string
  caption: string
  points: string[]
  width: number
  height: number
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
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          className="h-auto w-full transition-transform duration-500 group-hover:scale-[1.015]"
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
            width={1500}
            height={949}
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
            width={1920}
            height={889}
            points={[
              "Mermaid is rendered, not shown as code. Invalid diagrams are demoted to plain code blocks rather than shipping as an error box.",
              "Headings name real files, because every claim is checked against the code index.",
              "×2 and above adds subsection documents and diagrams like this sequence.",
            ]}
          />
        </div>
      </section>

      {/* research showcase */}
      <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="deep research"
          title="Kaioken's research engine in action"
          description="The /research command (or TUI /research) searches the open web, reads sources, reasons through gaps, and writes cited reports to .kaioken/research/. These three reports shipped with this site are unedited outputs from real runs."
        />
        <div className="mt-10 grid gap-8 lg:grid-cols-3">
          <ResearchCard
            title="SGLT2 vs GLP-1 in T2D with CKD"
            summary="No head-to-head RCTs exist — all evidence is indirect via placebo-controlled trials. CREDENCE (n=4,401, P=0.00001), DAPA-CKD (n=4,304, P<0.001), EMPA-KIDNEY (n=6,609, P<0.001) show SGLT2 inhibitors reduce composite renal outcomes vs placebo. Network meta-analyses favor SGLT2i for renal composites (HR 0.76) and heart failure hospitalization (HR 0.75), with no MACE difference (HR 1.03). GLP-1RAs have more GI events (12% vs 0%); SGLT2i have 3.5× higher genital mycotic infection risk."
            words={30818}
            slug="compare-the-efficacy-and-adverse-event-profiles-of-sglt2-inh"
            depth="×10"
          />
          <ResearchCard
            title="Solar vs Nuclear LCOE in Europe"
            summary="Utility-scale solar LCOE in 2026: Spain ~$0.03/kWh, Italy ~$0.035/kWh, Germany ~$0.04/kWh, UK ~$0.05/kWh. Nuclear retains advantage at low discount rates (~3.8% WACC) due to capital-intensive structure; advantage erodes as discount rates rise (nuclear LCOE increases ~3× from 0% to 10% vs ~2.25× for solar). System integration costs for solar intermittency not reflected in basic LCOE. Externalities (carbon, health) favor nuclear's low-carbon profile."
            words={1438}
            slug="is-solar-cheaper-than-nuclear-in-europe"
            depth="×3"
          />
          <ResearchCard
            title="Cloud LLMs at Ollama"
            summary="Survey of cloud LLM availability through Ollama as of July 2025. Covers OpenAI, Anthropic, Google, and other providers accessible via Ollama's OpenAI-compatible endpoints. Includes model catalogs, pricing tiers, and integration notes for local development workflows."
            words={1283}
            slug="last-cloud-llm-at-ollama"
            depth="×3"
          />
        </div>
      </section>

      {/* Kaioken vs Gemini Deep Search Benchmark Section */}
      <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="head-to-head benchmark"
          title={
            <>
              Kaioken Research <span className="text-kai-orange">vs</span> Gemini Deep Search
            </>
          }
          description="We submitted the exact same clinical prompt to both research engines: compare SGLT2 inhibitors vs GLP-1 receptor agonists in T2D with CKD and extract RCT sample sizes and p-values. Here is how their unedited outputs compare."
        />

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {/* Kaioken Research */}
          <div className="relative overflow-hidden rounded-md border border-kai-orange/45 bg-card p-6 shadow-md transition-colors hover:border-kai-orange/70 hover:bg-kai-panel/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-kai-orange animate-pulse" />
                <span className="font-mono text-[12px] font-bold text-kai-orange uppercase tracking-wider">
                  Kaioken Research
                </span>
              </div>
              <span className="rounded-sm border border-kai-orange/40 bg-kai-orange/10 px-2 py-0.5 font-mono text-[11px] text-kai-amber">
                ×10 Depth · 30,818 Words
              </span>
            </div>

            <h3 className="mt-4 font-mono text-[16px] font-bold text-foreground">
              Deep Epistemic Rigor & Premise Deconstruction
            </h3>

            <p className="mt-2.5 font-sans text-[13.5px] leading-relaxed text-muted-foreground">
              Kaioken immediately recognized that <strong className="text-foreground font-semibold">no head-to-head RCTs exist</strong> in clinical literature comparing SGLT2i vs GLP-1RA directly in CKD. Instead of forcing a flawed comparison, it deconstructed the prompt flaw, mapped the star-network geometry of indirect meta-analyses, evaluated transitivity assumptions, and cited 117+ references.
            </p>

            <ul className="mt-4 space-y-2 font-sans text-[13px] text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 font-bold text-kai-orange">✓</span>
                <span><strong className="text-foreground">Deconstructed Prompt Flaw:</strong> Identified structural absence of direct RCTs.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 font-bold text-kai-orange">✓</span>
                <span><strong className="text-foreground">Statistical Depth:</strong> Full transitivity analysis, NMA network geometry, & subgroup P-values.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 font-bold text-kai-orange">✓</span>
                <span><strong className="text-foreground">Safety Auditing:</strong> Exact Risk Ratios for GMI (3.49), DKA (2.36), & GI intolerance (12% vs 0%).</span>
              </li>
            </ul>

            <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
              <span className="font-mono text-[11px] text-kai-dim">
                1,190 lines · 235 KB · 117+ Citations
              </span>
              <Link
                to="/preview/research/compare-the-efficacy-and-adverse-event-profiles-of-sglt2-inh"
                className="inline-flex items-center gap-1.5 font-mono text-[12px] font-bold text-kai-orange transition-colors hover:underline"
              >
                Read Kaioken Report
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>

          {/* Gemini Deep Search */}
          <div className="relative overflow-hidden rounded-md border border-border bg-card p-6 transition-colors hover:border-kai-dim/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-blue-400" />
                <span className="font-mono text-[12px] font-bold text-blue-400 uppercase tracking-wider">
                  Gemini Deep Search
                </span>
              </div>
              <span className="rounded-sm border border-border bg-muted/30 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                Standard · 5,967 Words
              </span>
            </div>

            <h3 className="mt-4 font-mono text-[16px] font-bold text-foreground">
              High-Level Synthesis & Direct Summarization
            </h3>

            <p className="mt-2.5 font-sans text-[13.5px] leading-relaxed text-muted-foreground">
              Gemini accepted the prompt at face value and generated a structured overview in French. It produced a 3-RCT comparison table including FLOW (a GLP-1RA placebo trial) alongside CREDENCE and DAPA-CKD, treating indirect evidence as a direct comparison without evaluating network transitivity.
            </p>

            <ul className="mt-4 space-y-2 font-sans text-[13px] text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 font-bold text-kai-dim">–</span>
                <span><strong className="text-foreground">Accepted Prompt Premise:</strong> Took premise at face value and forced 3 placebo RCTs into table.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 font-bold text-kai-dim">–</span>
                <span><strong className="text-foreground">High-Level Overview:</strong> Summarized clinical trials & mechanisms in 5.9k words (French).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 font-bold text-kai-dim">–</span>
                <span><strong className="text-foreground">Citations:</strong> Light inline reference brackets without comprehensive bibliography.</span>
              </li>
            </ul>

            <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
              <span className="font-mono text-[11px] text-kai-dim">
                182 lines · 52 KB · Inline References
              </span>
              <Link
                to="/preview/research/gemini-sglt2-vs-glp-1-in-ckd"
                className="inline-flex items-center gap-1.5 font-mono text-[12px] font-bold text-blue-400 transition-colors hover:underline"
              >
                Read Gemini Report
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="mt-8 overflow-hidden rounded-md border border-border bg-card">
          <div className="border-b border-border bg-kai-panel/60 px-5 py-3.5">
            <h4 className="font-mono text-[13px] font-bold text-foreground">
              Feature-by-Feature Benchmark Breakdown
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/20 font-mono text-[11px] text-kai-dim uppercase tracking-wider">
                  <th className="px-5 py-3">Metric / Feature</th>
                  <th className="px-5 py-3 font-bold text-kai-orange">Kaioken Research</th>
                  <th className="px-5 py-3 font-bold text-blue-400">Gemini Deep Search</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                <tr>
                  <td className="px-5 py-3.5 font-mono font-semibold text-foreground">Report Depth</td>
                  <td className="px-5 py-3.5 font-mono font-bold text-kai-amber">30,818 words (1,190 lines)</td>
                  <td className="px-5 py-3.5 font-mono text-muted-foreground">5,967 words (182 lines)</td>
                </tr>
                <tr>
                  <td className="px-5 py-3.5 font-mono font-semibold text-foreground">Premise Rigor</td>
                  <td className="px-5 py-3.5 text-foreground">
                    <span className="mr-2 rounded bg-kai-orange/15 px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-kai-orange">PASSED</span>
                    Identified 0 head-to-head RCTs exist & deconstructed prompt flaw
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">
                    <span className="mr-2 rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px]">ACCEPTED</span>
                    Accepted prompt & forced 3 placebo RCTs into comparison table
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3.5 font-mono font-semibold text-foreground">Statistical Geometry</td>
                  <td className="px-5 py-3.5 text-foreground">Star-network NMA geometry, transitivity checks, NNT & subgroup P-values</td>
                  <td className="px-5 py-3.5 text-muted-foreground">Direct trial outcome summaries & qualitative HR listings</td>
                </tr>
                <tr>
                  <td className="px-5 py-3.5 font-mono font-semibold text-foreground">Sample Size Auditing</td>
                  <td className="px-5 py-3.5 text-foreground">Flagged active-arm (2,202) vs total cohort (4,401) reporting errors in secondary lit</td>
                  <td className="px-5 py-3.5 text-muted-foreground">Standard reported RCT total numbers (n=4,401; n=4,304; n=3,533)</td>
                </tr>
                <tr>
                  <td className="px-5 py-3.5 font-mono font-semibold text-foreground">Safety Quantification</td>
                  <td className="px-5 py-3.5 text-foreground">Exact Risk Ratios: GMI RR 3.49, DKA RR 2.36, GI 12% vs 0%, AKI protection</td>
                  <td className="px-5 py-3.5 text-muted-foreground">Qualitative safety summary (mycotic risk, GI intolerance, retinopathy)</td>
                </tr>
                <tr>
                  <td className="px-5 py-3.5 font-mono font-semibold text-foreground">Citation Grounding</td>
                  <td className="px-5 py-3.5 text-foreground">117+ fully indexed references with primary care generalizability metrics</td>
                  <td className="px-5 py-3.5 text-muted-foreground">Inline citation numbers without comprehensive bibliography</td>
                </tr>
              </tbody>
            </table>
          </div>
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
