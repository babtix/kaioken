import React from 'react';
import { Terminal } from './Terminal.tsx';
import type { Row } from '../lib/term.ts';

const ROWS: Row[] = [
  { t: 'cmd', text: 'kaioken index .' },
  { t: 'gap' },
  { t: 'kv', k: 'parsed', v: '1,284 files', n: 'tree-sitter' },
  { t: 'kv', k: 'declared', v: '8,412 symbols' },
  { t: 'kv', k: 'hashed', v: '8,412 / 8,412', n: 'sha-256' },
  { t: 'index' as any, k: 'index', v: '.kaioken/index.db', n: '14.2 MB' },
  { t: 'gap' },
  { t: 'cmd', text: 'kaioken ask "how does auth refresh tokens?" --x5' },
  { t: 'gap' },
  { t: 'accent', text: 'multiplier x5   ·   repo + web   ·   4 subagents' },
  { t: 'gap' },
  { t: 'ok', k: 'resolved', v: 'refreshSession', n: 'src/http/auth.ts:118' },
  { t: 'ok', k: 'resolved', v: 'requireAuth', n: 'src/http/auth.ts:42' },
  { t: 'ok', k: 'resolved', v: 'TokenStore.rotate', n: 'src/store/token.ts:76' },
  { t: 'bad', k: 'rejected', v: 'AuthCache.evict', n: 'no such symbol' },
  { t: 'note', text: 'claim dropped before it reached you' },
  { t: 'gap' },
  { t: 'done', k: 'verified', v: '3 / 4 claims', n: 'npm test — passed in 6.4s' },
];

const STATS = [
  { value: '4', unit: 'languages parsed' },
  { value: '0', unit: 'tokens per lookup' },
  { value: 'SHA-256', unit: 'per declaration' },
];

export const Hero: React.FC = () => {
  return (
    <section className="hero">
      <div className="wrap">
        <div className="hero-top">
          <p className="label label--accent hero-eyebrow">
            Open source · Runs on your machine
          </p>

          <h1 className="h1 hero-h1">
            Your agent should not be able to <span className="serif">guess.</span>
          </h1>

          <p className="lead hero-sub">
            Kaioken parses your repository into a structural AST index, hashes every declaration,
            and rejects any claim that does not resolve to a symbol that exists.
          </p>

          <div className="hero-act">
            <a href="#install" className="btn btn--primary">
              Install
            </a>
            <a
              href="https://github.com/babtix/kaioken#readme"
              className="btn"
              target="_blank"
              rel="noopener noreferrer"
            >
              Read the docs
            </a>
            <a
              className="hero-repo mono"
              href="https://github.com/babtix/kaioken"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/babtix/kaioken ↗
            </a>
          </div>
        </div>
      </div>

      <div className="wrap">
        <div className="caption">
          <span className="caption-text">fig. 01 — parse, verify, respond</span>
        </div>

        <Terminal rows={ROWS} />

        <dl className="hero-stats">
          {STATS.map((s, idx) => (
            <div key={idx} className="stat">
              <dt className="stat-v mono">{s.value}</dt>
              <dd className="stat-u label">{s.unit}</dd>
            </div>
          ))}
          <div className="stat stat--langs">
            <dt className="stat-v mono">TypeScript · Go · Python · Rust</dt>
            <dd className="stat-u label">parsers</dd>
          </div>
        </dl>
      </div>
    </section>
  );
};
