import React from 'react';

interface ClaimLine {
  text: string;
  state: 'plain' | 'good' | 'bad';
  note?: string;
}

const UNGROUNDED: ClaimLine[] = [
  { text: 'The session is refreshed by AuthCache.evict()', state: 'bad', note: 'does not exist' },
  { text: 'which is called from middleware/session.ts:88', state: 'bad', note: 'file does not exist' },
  { text: 'It reads the TTL from config.auth.ttlSeconds', state: 'bad', note: 'key does not exist' },
  { text: 'and falls back to a 30 minute default.', state: 'bad', note: 'unverifiable' },
];

const GROUNDED: ClaimLine[] = [
  { text: 'The session is refreshed by refreshSession()', state: 'good', note: 'src/http/auth.ts:118' },
  { text: 'which is called from requireAuth()', state: 'good', note: 'src/http/auth.ts:42' },
  { text: 'It rotates through TokenStore.rotate()', state: 'good', note: 'src/store/token.ts:76' },
  { text: '1 further claim was dropped before you saw it.', state: 'plain' },
];

export const Problem: React.FC = () => {
  return (
    <section id="problem" className="section">
      <div className="wrap">
        <div className="head">
          <span className="head-num">§01</span>
          <h2 className="head-title">The problem</h2>
          <span className="head-note">same question, two answers</span>
        </div>

        <p className="lead prose q">
          “How does the auth middleware refresh tokens?”
        </p>

        <div className="cmp">
          {/* Ungrounded Panel */}
          <article className="pnl pnl--bad">
            <header className="pnl-h">
              <span className="pnl-dot pnl-dot--bad" />
              <span className="pnl-l">Without an index</span>
              <span className="pnl-s">Fluent, plausible, unverifiable.</span>
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
              <span className="pnl-l">With Kaioken</span>
              <span className="pnl-s">Every claim resolves, or it is dropped.</span>
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

        <p className="foot mono">
          Both answers read the same. Only one of them can be checked.
        </p>
      </div>
    </section>
  );
};
