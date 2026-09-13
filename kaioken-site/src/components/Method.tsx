import React from 'react';

const PIPELINE = [
  {
    step: '01',
    name: 'Parse',
    desc: 'Tree-sitter walks the repository and extracts declarations and symbol skeletons. No embeddings, no chunking, no similarity search.',
    out: 'declarations',
  },
  {
    step: '02',
    name: 'Hash',
    desc: 'Every declaration is fingerprinted with SHA-256 over its own source range, so drift is detected structurally rather than by timestamp.',
    out: 'sha-256',
  },
  {
    step: '03',
    name: 'Index',
    desc: 'Symbols, anchors and hashes are written to a local store. Lookups are exact and deterministic, and cost the model no context.',
    out: '.kaioken/index.db',
  },
  {
    step: '04',
    name: 'Gate',
    desc: 'Before an answer is returned, SymbolOracle resolves every claim against the index. Anything that does not resolve is dropped.',
    out: 'verdict',
  },
];

export const Method: React.FC = () => {
  return (
    <section id="method" className="section">
      <div className="wrap">
        <div className="head">
          <span className="head-num">§02</span>
          <h2 className="head-title">Method</h2>
          <span className="head-note">four stages, no embeddings</span>
        </div>

        <ol className="pipe">
          {PIPELINE.map((stage) => (
            <li key={stage.step} className="stage">
              <div className="stage-h">
                <span className="stage-n mono">{stage.step}</span>
                <span className="stage-rule" />
              </div>
              <h3 className="h3 stage-t">{stage.name}</h3>
              <p className="stage-d">{stage.desc}</p>
              <span className="stage-o mono">→ {stage.out}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};
