import CodeBlock from "@/components/CodeBlock"
import { C, Callout, DocPage, H2, LI, P, Steps, UL } from "@/components/docs/parts"
import { MULTIPLIER, QUALITY } from "@/data/content"
import { cn } from "@/lib/utils"

export default function Wiki() {
  return (
    <DocPage
      title="Deep wiki"
      lead="A global plan, then per-section plans, then long-form documents — each verified against the code index rather than trusted."
    >
      <H2 id="run">Running it</H2>
      <div className="pt-4">
        <CodeBlock
          title="tui"
          code={`/wiki                # ×3, the default depth
/wiki x10 force      # every pass, rebuilt from scratch
/wiki retry          # only the sections that failed last run`}
        />
      </div>
      <P>
        The first full run records the commit it documents in <C>.kaioken/wiki_state.yaml</C>. From
        then on, <C>kaioken update</C> works from the diff instead of regenerating everything.
      </P>

      <H2 id="multiplier">What the multiplier buys</H2>
      <P>
        Above ×3 the multiplier used to mean “ask for more lines”. It now buys passes — each level
        roughly doubles the calls per document, which is what a power-multiplier metaphor ought to
        mean. The estimate names the passes before the run starts.
      </P>
      <div className="mt-4 overflow-hidden rounded-sm border border-border">
        {MULTIPLIER.map((row) => (
          <div
            key={row.level}
            className={cn(
              "grid gap-1 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[6rem_1fr] sm:gap-4",
              row.isDefault ? "bg-kai-orange/[0.06]" : "bg-card"
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "font-mono text-[15px] font-bold",
                  row.isDefault ? "text-kai-orange" : "text-kai-amber"
                )}
              >
                {row.level}
              </span>
              {row.isDefault ? (
                <span className="font-mono text-[9.5px] tracking-wider text-kai-orange uppercase">
                  default
                </span>
              ) : null}
            </div>
            <p className="font-sans text-[13.5px] leading-relaxed text-muted-foreground">
              {row.behavior}
            </p>
          </div>
        ))}
      </div>

      <H2 id="quality">How quality is engineered</H2>
      <P>
        Long-form generation fails in predictable ways. Each one is addressed mechanically rather
        than by asking the model nicely.
      </P>
      <div className="mt-5 space-y-5">
        {QUALITY.map((q) => (
          <div key={q.claim} className="border-l-2 border-kai-orange/40 pl-4">
            <h3 className="font-mono text-[14px] font-bold text-kai-amber">{q.claim}</h3>
            <p className="mt-1.5 font-sans text-[14px] leading-[1.7] text-muted-foreground">
              {q.body}
            </p>
          </div>
        ))}
      </div>

      <Callout kind="note" title="Post-passes with no model call">
        Invalid mermaid is demoted to a plain code block rather than shipping as an error box in
        the browser, and mentions of other chapters become relative links instead of duplicated
        explanations.
      </Callout>

      <H2 id="architecture">The shared brief</H2>
      <P>
        Sections generate in parallel and can only see sibling titles, which produces the same
        concept explained three times in three vocabularies. A prior pass writes an authoritative
        brief — real architecture, key flows, and a glossary of canonical terms — to{" "}
        <C>.kaioken/architecture.md</C>, injected verbatim into every later prompt.
      </P>
      <Callout kind="tip" title="It is a file you can edit">
        Edit <C>.kaioken/architecture.md</C> and every chapter inherits the correction on the next
        run. Same for <C>wiki_plan.yaml</C>, the proposed outline.
      </Callout>

      <H2 id="verification">Verification</H2>
      <Steps
        items={[
          <>
            Every file path, symbol, line anchor and quoted excerpt a document asserts is checked
            against the code index.
          </>,
          <>Excerpts must actually appear at the lines they cite.</>,
          <>
            Failures are reported — and at ×10 they are fed back to the model for correction.
          </>,
        ]}
      />
      <P>
        The plan itself is validated too. Kaioken reports what percentage of scanned files the plan
        actually claims, and which directories the misses cluster in, so a plan that silently
        ignores a third of the codebase is visible before generation spends tokens on it.
      </P>

      <H2 id="browse">Browsing the result</H2>
      <P>
        Reading a two-thousand-line chapter in an editor is rough. <C>serve</C> renders{" "}
        <C>.kaioken/wiki/</C> as a local site.
      </P>
      <div className="pt-4">
        <CodeBlock
          title="powershell"
          prompt
          code={`kaioken serve                  # http://127.0.0.1:7777
kaioken serve -port 8080`}
        />
      </div>
      <UL>
        <LI>Sidebar navigation and working cross-links.</LI>
        <LI>Full-text search across every chapter.</LI>
        <LI>Mermaid diagrams rendered rather than shown as code.</LI>
        <LI>
          From the TUI, <C>/serve</C> runs it in the background so chat stays usable.
        </LI>
      </UL>
    </DocPage>
  )
}
