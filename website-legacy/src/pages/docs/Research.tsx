import CodeBlock from "@/components/CodeBlock"
import TerminalWindow from "@/components/TerminalWindow"
import { C, Callout, DocPage, H2, H3, LI, P, Steps, UL } from "@/components/docs/parts"
import { RESEARCH_EXAMPLE } from "@/data/content"

/** ×N → what the run actually buys. Numbers come from research.planFor. */
const PRESETS = [
  { dial: "×1–×2", preset: "quick", body: "A look, not a study. One or two rounds, a handful of pages." },
  {
    dial: "×3",
    preset: "standard",
    body: "The default. Enough rounds to close the obvious gaps, and the answer still lands in minutes.",
    isDefault: true,
  },
  { dial: "×4–×5", preset: "standard", body: "More subquestions, more queries per subquestion, more pages per round." },
  { dial: "×6–×9", preset: "deep", body: "Up to five rounds, twelve subquestions, forty new pages a round." },
  {
    dial: "×10",
    preset: "dossier",
    body: "A different product, not an extrapolation: eight rounds, up to ~480 pages read, a sectioned document with registers and appendices, and a signed PDF.",
  },
]

export default function Research() {
  return (
    <DocPage
      title="Deep research"
      lead="One question in, one cited report out. A cheap router decides whether it needs a single search loop or a supervisor with a team of workers — you never have to."
    >
      <H2 id="run">Running one</H2>
      <P>
        <C>kaioken research</C> from a shell, <C>/research</C> from the TUI. Research never reads
        your repository: it is for the questions the code cannot answer — library comparisons,
        release notes, current practice, prior art.
      </P>
      <div className="pt-4">
        <CodeBlock title="powershell" code={RESEARCH_EXAMPLE} />
      </div>
      <Callout kind="warn" title="It needs a search key too">
        On top of the LLM key, research wants a web-search API key —{" "}
        <C>tavily</C>, <C>firecrawl</C>, <C>brave</C> or <C>exa</C> — under <C>keys:</C> in{" "}
        <C>~/.kaioken/config.yaml</C>. With Firecrawl in the set, its scrape API reads the pages too
        and the built-in fetcher becomes the fallback.
      </Callout>

      <H2 id="router">The triage router</H2>
      <P>
        Before anything expensive, one cheap model call sizes the question up. It enumerates the
        independent strands it can see, then picks a path — so the verdict rests on a decomposition
        rather than a guess.
      </P>
      <UL>
        <LI>
          <em>&ldquo;What changed in library X between versions&rdquo;</em> — one continuous chain of
          reasoning. Fast path.
        </LI>
        <LI>
          <em>&ldquo;How should we architect auth, and what do three comparable projects do
          differently&rdquo;</em> — genuinely parallel strands. Deep path.
        </LI>
      </UL>
      <P>
        Keyword scoring survives only as the fallback for when no router model is reachable. Both
        the prompt and the fallback lean fast on a toss-up, because a fast run that turns out too
        thin gets promoted mid-run, while a needless deep run just costs deep-run money. Pin the
        decision yourself with <C>-mode fast</C> or <C>-mode deep</C>.
      </P>

      <H2 id="paths">Two paths</H2>
      <H3>Fast path — one tight loop</H3>
      <P>
        A single agent that interleaves search and reasoning directly: search, read, reason, search
        again for whatever is still missing. No supervisor, no workers, no branching — which is
        exactly why its cost is knowable before it starts.
      </P>

      <H3>Deep path — a supervisor and isolated workers</H3>
      <P>
        A supervisor splits the question into subquestions and hands each to a worker with its own
        context. Workers search, fetch, read and gap-check, then return a compressed finding — never
        raw documents. That is what keeps a twenty-minute run from rotting its own context.
      </P>
      <div className="pt-4">
        <TerminalWindow title="kaioken — research" bodyClassName="text-[12.5px]">
          <div className="text-kai-dim">
            kaioken ×3 research (standard preset) with claude-sonnet-4.5 via tavily (concurrency 4) …
          </div>
          <div className="text-kai-tan">  → routing</div>
          <div className="text-kai-dim">    3 independent strands → deep path</div>
          <div className="text-kai-tan">  round 1/2</div>
          <div className="text-kai-dim">    12 queries · 27 results · 18 new pages read</div>
          <div className="text-kai-tan">  → grounding claims against sources</div>
          <div className="mt-1 text-kai-green">
            wrote .kaioken/research/compare-oss-auth-designs.md
          </div>
        </TerminalWindow>
      </div>

      <H3>Escalation is a promotion, not a restart</H3>
      <P>
        A fast run that comes back thin — too few independent sources for a central claim, a failed
        grounding check, a subtopic that turns out to be genuinely independent — hands everything it
        already fetched to a freshly spawned supervisor. Content-hash dedup means nothing is
        re-fetched. You experience it as the run getting more thorough, not as starting over.
      </P>

      <H2 id="multiplier">What ×N buys</H2>
      <P>
        The same dial as <C>/wiki</C>. Below ×10 the budgets grow smoothly; at ×10 the run steps up
        into a different shape.
      </P>
      <div className="mt-4 overflow-hidden rounded-sm border border-border">
        {PRESETS.map((p) => (
          <div
            key={p.dial}
            className="grid gap-1 border-b border-border bg-card px-4 py-3 last:border-b-0 sm:grid-cols-[9rem_1fr] sm:items-baseline sm:gap-4"
          >
            <div className="flex items-baseline gap-2 font-mono text-[13px]">
              <span className="font-bold text-kai-orange">{p.dial}</span>
              <span className="text-kai-dim">{p.preset}</span>
              {p.isDefault ? (
                <span className="rounded-sm bg-kai-green/12 px-1.5 py-px text-[10.5px] text-kai-green">
                  default
                </span>
              ) : null}
            </div>
            <p className="font-sans text-[13.5px] leading-relaxed text-muted-foreground">{p.body}</p>
          </div>
        ))}
      </div>
      <P>
        <C>-deep</C> turns the dossier profile on below ×10. Before a deep run starts, Kaioken
        prints the page ceiling it is prepared to read and says plainly that this is the most
        expensive thing it can do — cheaper than a surprised cancellation ten minutes in.
      </P>

      <H2 id="grounding">Grounded before it ships</H2>
      <Steps
        items={[
          <>
            Every claim cites a numbered source that was <em>actually read</em>, not one the model
            remembers reading.
          </>,
          <>
            A separate pass checks the draft against the raw source text — its own model call, run
            after the draft exists.
          </>,
          <>
            A claim that cannot be grounded is flagged in the report rather than quietly dressed in
            a fabricated citation.
          </>,
          <>
            <C>-verify</C> re-runs load-bearing claims down an independent path and diffs the
            results. Agreement raises confidence; disagreement is surfaced as a contradiction rather
            than silently resolved.
          </>,
        ]}
      />
      <Callout kind="note" title="Fetched pages are data, never instructions">
        Every page is sanitised before it reaches a prompt, so a web page telling the agent to
        ignore its instructions is just text in a document.
      </Callout>

      <H2 id="state">Interrupted runs resume</H2>
      <P>
        Run state checkpoints to disk at every phase transition, so a closed terminal or a crashed
        process is not a lost run — and the sources already fetched stay fetched.
      </P>
      <div className="pt-4">
        <CodeBlock
          title="powershell"
          prompt
          code={`kaioken research -resume <run id>   # continue where it stopped`}
        />
      </div>

      <H2 id="cost">One honest number</H2>
      <P>
        Cost is line-itemised the way a search API bills rather than as one opaque token count:
        searches, pages fetched after dedup, reasoning tokens, input and output tokens, and the
        resulting spend. It reads the same whichever path executed, and an escalation adds to the
        running total instead of resetting it. <C>kaioken usage</C> aggregates it by operation,
        model and workspace; <C>research.max_cost_usd</C> in the global config caps it.
      </P>

      <H2 id="output">Where reports land</H2>
      <UL>
        <LI>
          <C>.kaioken/research/&lt;slug&gt;.md</C> — the cited report. Re-asking the same question
          overwrites its predecessor.
        </LI>
        <LI>
          <C>.kaioken/research/&lt;slug&gt;.json</C> — the structured record: findings, sources,
          route taken, cost.
        </LI>
        <LI>
          <C>.kaioken/research/&lt;slug&gt;.pdf</C> — the rendered, signed dossier, for deep runs.
        </LI>
      </UL>
      <P>
        <C>-out</C> overrides the path. The same runs back the Deep Search history in Kaioken
        Desktop.
      </P>
    </DocPage>
  )
}
