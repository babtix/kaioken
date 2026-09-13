import React from 'react';

const PILLARS = [
  {
    num: '01',
    title: 'Compiler-Grade AST Indexing',
    desc: 'Parses your codebase into Tree-sitter abstract syntax graphs. Functions, structs, and calls are resolved with 100% compiler precision in 12 milliseconds.',
    detailLeft: 'TREE-SITTER GRAPH',
    detailRight: '0% VECTOR GUESSWORK',
  },
  {
    num: '02',
    title: 'Cryptographic Hash Lattice',
    desc: 'Every symbol reference is linked into an immutable SHA-256 dependency DAG. When files change, only affected nodes re-index. Complete immunity to documentation rot.',
    detailLeft: 'SHA-256 PROVENANCE',
    detailRight: 'INSTANT INVALIDATION',
  },
  {
    num: '03',
    title: 'Bounded Subagent Swarms',
    desc: 'Autonomous subagents are constrained by compiler type signatures and native test suites. If an LLM hallucinates an invalid import, the Grounding Gate rejects it immediately.',
    detailLeft: 'PARALLEL RAYON RUNTIME',
    detailRight: '100% TEST PASS GATE',
  },
];

export const Pillars: React.FC = () => {
  return (
    <section className="k-section" id="pillars">
      <div className="k-container">
        <div className="k-section-header">
          <div className="k-kicker">// ARCHITECTURAL PILLARS</div>
          <h2 className="k-title">Engineered for absolute certainty.</h2>
          <p className="k-desc">
            Production codebases cannot tolerate fuzzy semantic hallucinations.
            Kaioken establishes a deterministic bridge between LLMs and compiler invariants.
          </p>
        </div>

        <div className="k-pillars-grid">
          {PILLARS.map((p) => (
            <div key={p.num} className="k-pillar-card">
              <div>
                <div className="k-pillar-num">{p.num}</div>
                <h3 className="k-pillar-title">{p.title}</h3>
                <p className="k-pillar-desc">{p.desc}</p>
              </div>

              <div className="k-pillar-detail">
                <span>{p.detailLeft}</span>
                <span>{p.detailRight}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
