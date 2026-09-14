import React from 'react';
import SectionHeading from './SectionHeading.tsx';

interface ClaimLine {
  text: string;
  state: 'plain' | 'good' | 'bad';
  note?: string;
}

const UNGROUNDED: ClaimLine[] = [
  { text: 'The session is refreshed by AuthCache.evict()', state: 'bad', note: 'symbol does not exist' },
  { text: 'which is called from middleware/session.ts:88', state: 'bad', note: 'file does not exist' },
  { text: 'It reads the TTL from config.auth.ttlSeconds', state: 'bad', note: 'key does not exist' },
  { text: 'and falls back to a 30-minute default value.', state: 'bad', note: 'hallucinated logic' },
];

const GROUNDED: ClaimLine[] = [
  { text: 'The session is refreshed by refreshSession()', state: 'good', note: 'src/http/auth.ts:118' },
  { text: 'which is called from requireAuth()', state: 'good', note: 'src/http/auth.ts:42' },
  { text: 'It rotates through TokenStore.rotate()', state: 'good', note: 'src/store/token.ts:76' },
  { text: '1 unverifiable claim dropped before reaching you.', state: 'plain' },
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
            When you ask an agent a technical question about your repository, it generates answers that{' '}
            <em>read flawlessly</em>, but contain non-existent files, hallucinated method names, and fabricated parameters.
          </p>
          <div className="mt-4 flex items-center gap-2 font-mono text-[12px] text-[var(--fg-mute)]">
            <span className="text-[var(--accent)]">❯</span>
            <span>Example prompt:</span>
            <code className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-[var(--fg-1)]">
              “How does the auth middleware refresh tokens?”
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
              <span className="pnl-s">Fluent, persuasive, completely unverifiable.</span>
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
              <span className="pnl-l">With Kaioken (AST Grounding)</span>
              <span className="pnl-s">Every claim verified against syntax declarations.</span>
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
            Both answers look identical at first glance. <strong className="text-[var(--fg)]">Only one corresponds to code on disk.</strong>
          </p>
        </div>
      </div>
    </section>
  );
};

export default WhyBuilt;
