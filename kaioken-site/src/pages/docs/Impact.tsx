import CodeBlock from "@/components/CodeBlock"
import TerminalWindow from "@/components/TerminalWindow"
import { C, Callout, DocPage, H2, H3, LI, P, UL } from "@/components/docs/parts"

const SEVERITIES = [
  { name: "blocker", body: "A defect: wrong behaviour, a broken invariant, a security hole. Should not merge." },
  { name: "concern", body: "A real problem a reasonable reviewer could decide to accept." },
  { name: "note", body: "Worth saying once, not worth arguing about." },
]

export default function Impact() {
  return (
    <DocPage
      title="Impact & review"
      lead="Three checks that use the generated knowledge rather than generic intuition: what a change would touch, whether a diff honours the repo's own rules, and whether the build actually passes."
    >
      <H2 id="impact">Impact — before you edit</H2>
      <P>
        Describe a refactor in plain words and Kaioken maps its blast radius: the symbols and files
        involved, the modules they belong to, the wiki documents and skills that would go stale, and
        the tests to re-run.
      </P>
      <div className="pt-4">
        <CodeBlock
          title="tui"
          code={`/impact rename parseArgs to parseCLIArgs
/impact change the return type of Load to (*Plan, error)`}
        />
      </div>
      <P>
        Every claim is verified against the symbol index; anything the index cannot confirm is
        listed separately as <em>unverified</em> rather than mixed in with the rest. The report opens
        as a navigable tree — arrows move, enter folds a group, <C>f</C> cycles the kind filter,{" "}
        <C>q</C> closes it into the transcript.
      </P>
      <UL>
        <LI>
          Name the symbols you intend to touch. The more precisely the intent names real
          identifiers, the sharper the prediction.
        </LI>
        <LI>
          Results are richest after <C>/plan</C>, <C>/wiki</C> and <C>/skills</C> have run, but only
          the intent is required.
        </LI>
        <LI>
          Each run is saved under <C>.kaioken/impact/</C>. <C>-format json</C> and <C>-out</C> make
          it scriptable.
        </LI>
      </UL>
      <Callout kind="tip" title="It keeps score">
        <C>kaioken impact -compare [rev]</C> scores the newest saved prediction against what
        actually changed, and records the accuracy line in the report — so the tool carries a track
        record instead of a reputation.
      </Callout>

      <H2 id="review">Review — grounded in your own docs</H2>
      <P>
        A generic reviewer flags generic things: missing error handling, a long function, a name it
        dislikes. <C>kaioken review</C> reads the diff against what this repository has already
        written down about itself — wiki chapters, knowledge cards, skills, and the steering notes
        in <C>config.yaml</C> — so it can say <em>&ldquo;this bypasses the retry budget the
        networking chapter describes&rdquo;</em>, which is a finding worth having.
      </P>
      <div className="mt-4 overflow-hidden rounded-sm border border-border">
        {SEVERITIES.map((s) => (
          <div
            key={s.name}
            className="grid gap-1 border-b border-border bg-card px-4 py-3 last:border-b-0 sm:grid-cols-[8rem_1fr] sm:items-baseline sm:gap-4"
          >
            <span className="font-mono text-[13px] font-semibold text-kai-orange">{s.name}</span>
            <p className="font-sans text-[13.5px] leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>
      <P>
        Three levels, deliberately — a reviewer with ten severities spends its judgement on grading
        rather than on finding things.
      </P>
      <div className="pt-4">
        <CodeBlock
          title="powershell"
          prompt
          code={`kaioken review                          # the uncommitted diff
kaioken review -base origin/main        # everything since the branch point
kaioken review -format sarif -out review.sarif
kaioken review -severity blocker -fail-on-findings   # CI gate`}
        />
      </div>
      <P>
        The exit code is the CI contract: non-zero when the review found a blocker, so a pipeline
        step gates on it without parsing the output. <C>-format json|sarif</C> feeds a code-scanning
        dashboard; <C>-only</C> narrows the run to specific paths.
      </P>

      <H2 id="verify">Verify — the model does not get the last word</H2>
      <P>
        <C>/verify</C> is the trust layer under &ldquo;I fixed it&rdquo;. Kaioken detects the repo&apos;s own
        build and test commands, lets a background agent diagnose and fix what fails, then re-runs
        every command in plain Go as the final gate. The model&apos;s word is never taken at face value —
        the gate&apos;s exit is what counts.
      </P>
      <H3>How commands are detected</H3>
      <UL>
        <LI>
          A <C>check:</C> target in a <C>Makefile</C> wins outright — a repo that defined one has
          told you how it wants to be checked.
        </LI>
        <LI>
          Otherwise the markers combine: <C>go.mod</C> contributes <C>go build ./...</C> and{" "}
          <C>go test ./... -count=1</C>, a <C>package.json</C> contributes its own, and a repo with
          both gets both.
        </LI>
        <LI>No markers at all is an error, not an empty pass.</LI>
      </UL>
      <div className="pt-4">
        <TerminalWindow title="kaioken — verify" bodyClassName="text-[12.5px]">
          <div className="text-kai-dim">  → detected: go build ./... · go test ./... -count=1</div>
          <div className="text-kai-tan">  → agent pass 1/3 — 2 failures diagnosed</div>
          <div className="text-kai-green">  ✓ go build ./...</div>
          <div className="text-kai-green">  ✓ go test ./... -count=1</div>
          <div className="mt-1 text-kai-green">gate passed</div>
        </TerminalWindow>
      </div>
      <P>
        <C>-approve</C> defaults to <C>all</C> here, since the point is an unattended run, and the
        command exits 1 if the gate fails.
      </P>

      <H2 id="drift">Staying honest between runs</H2>
      <UL>
        <LI>
          <C>kaioken status -check</C> is the CI drift gate: exit 0 fresh, 1 stale, 2 error.{" "}
          <C>-json</C> emits a machine-readable staleness summary.
        </LI>
        <LI>
          <C>kaioken watch</C> polls the working tree and prints a line whenever new changed paths
          appear since the watch started (<C>-interval</C>, default 5s).
        </LI>
        <LI>
          <C>kaioken hub status</C> runs the same freshness check across every repo in the
          cross-repo registry, and exits 1 when any of them is stale.
        </LI>
      </UL>
    </DocPage>
  )
}
