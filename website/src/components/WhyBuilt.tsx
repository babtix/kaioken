import React from 'react';
import SectionHeading from './SectionHeading.tsx';

interface ClaimLine {
  text: string;
  state: 'plain' | 'good' | 'bad';
  note?: string;
}

const UNGROUNDED: ClaimLine[] = [
  { text: 'Greps the repo for "config", reads 41 files', state: 'bad', note: '48,000 tokens burned' },
  { text: 'Follows imports by hand, one read_file at a time', state: 'bad', note: '3,800 lines scanned' },
  { text: 'Re-derives the same call chain every session', state: 'bad', note: 'no memory between runs' },
  { text: 'Still misses the staleness invalidation step.', state: 'bad', note: 'wrong answer, confidently' },
];

const GROUNDED: ClaimLine[] = [
  { text: 'Step 1 — read .kaioken/wiki/ + knowledge cards', state: 'good', note: '.kaioken/cards/config.ts' },
  { text: 'Step 2 — answer, every claim cited file:line', state: 'good', note: '.kaioken/wiki/lifecycle.md' },
  { text: 'Answer not covered? The wiki regenerates first', state: 'plain', note: 'auto-updates, then answers' },
  { text: 'Same question tomorrow: still two steps.', state: 'good', note: 'no re-derivation' },
];

export const WhyBuilt: React.FC = () => {
  return (
    <section id="why" className="section border-t border-[var(--rule)] py-20 sm:py-28">
      <div className="wrap">
        <SectionHeading
          index="01"
          eyebrow="the motivation"
          title={
            <>
              Why we built Kaioken: <span className="serif">code is not prose.</span>
            </>
          }
          description="Standard AI agents treat code like arbitrary prose—hallucinating symbols and editing dirty working trees without running tests. Kaioken gives you a local terminal agent with auto-test+fix (verify), isolated git worktrees (delegate), and cited knowledge."
        />

        <div className="mt-12 rounded-lg border border-[var(--rule-strong)] bg-[var(--surface-1)] p-6 sm:p-8">
          <p className="font-mono text-[11px] tracking-[0.18em] text-[var(--accent)] uppercase">
            The fundamental flaw in AI agents today
          </p>
          <p className="mt-3 font-sans text-[17px] leading-relaxed text-[var(--fg)] sm:text-[19px]">
            Ask an agent a question that spans many modules and it does the expensive thing: browses
            the codebase file by file, burning thousands of tokens to re-derive what your repository{' '}
            <em>already documented</em> about itself.
          </p>
          <div className="mt-4 flex items-center gap-2 font-mono text-[12px] text-[var(--fg-mute)]">
            <span className="text-[var(--accent)]">❯</span>
            <span>Example prompt:</span>
            <code className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-[var(--fg-1)]">
              “Trace how a config change propagates through the system end to end.”
            </code>
          </div>
        </div>

        {/* Side-by-side verification contrast */}
        <div className="cmp mt-8">
          {/* Ungrounded Panel */}
          <article className="pnl pnl--bad">
            <header className="pnl-h">
              <span className="pnl-dot pnl-dot--bad" />
              <span className="pnl-l">Without Kaioken (Standard RAG)</span>
              <span className="pnl-s">Browses the codebase. Burns tokens. Forgets.</span>
            </header>

            <ul className="claims">
              {UNGROUNDED.map((line, idx) => (
                <li key={idx} className={`claim claim--${line.state}`}>
                  <span className="claim-t">{line.text}</span>
                  {line.note && (
                    <span className={`claim-n claim-n--${line.state}`}>{line.note}</span>
                  )}
                </li>
              ))}
            </ul>
          </article>

          {/* Grounded Panel */}
          <article className="pnl pnl--good">
            <header className="pnl-h">
              <span className="pnl-dot pnl-dot--good" />
              <span className="pnl-l">With Kaioken (Deep Internal Docs)</span>
              <span className="pnl-s">Two steps: read the docs, answer.</span>
            </header>

            <ul className="claims">
              {GROUNDED.map((line, idx) => (
                <li key={idx} className={`claim claim--${line.state}`}>
                  <span className="claim-t">{line.text}</span>
                  {line.note && (
                    <span className={`claim-n claim-n--${line.state}`}>{line.note}</span>
                  )}
                </li>
              ))}
            </ul>
          </article>
        </div>

        <div className="mt-8 rounded-md border border-[var(--rule)] bg-[var(--surface-base)] p-4 text-center">
          <p className="font-mono text-[13px] text-[var(--fg-2)]">
            The knowledge lives in <code className="font-mono text-[var(--accent)]">.kaioken/</code> — and{' '}
            <strong className="text-[var(--fg)]">if the docs don't cover it yet, they update themselves first.</strong>
          </p>
        </div>
      </div>
    </section>
  );
};

export default WhyBuilt;
