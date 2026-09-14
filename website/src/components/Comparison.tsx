import React from 'react';

const COMPARISON_ROWS = [
  {
    topic: 'Codebase Knowledge',
    conventional: 'Chunks text into cosine vector DBs. Loses syntax hierarchy and hallucinates missing symbols.',
    kaioken: 'Indexes exact Tree-sitter AST symbol graphs with complete type-hierarchy and callers.',
  },
  {
    topic: 'Documentation Integrity',
    conventional: 'Stale markdown wikis that immediately rot as soon as the next PR is merged.',
    kaioken: 'SHA-256 cryptographic provenance lattice. Nodes invalidate automatically with git commits.',
  },
  {
    topic: 'Hallucination Defense',
    conventional: 'Vague prompt engineering guidelines ("Please do not invent libraries").',
    kaioken: 'Grounding Gate compiler oracle. Automatically rejects any unverified API call or phantom token.',
  },
  {
    topic: 'Patch Validation',
    conventional: 'Blind file modifications without compiling or testing for syntax regressions.',
    kaioken: 'Sandboxed native execution. Compiles code and verifies test suites before accepting diffs.',
  },
  {
    topic: 'Hardware & Privacy',
    conventional: 'Uploads raw codebase files and embeddings to external third-party vector clouds.',
    kaioken: 'Runs 100% locally on your machine. Zero proprietary code leaves your hardware.',
  },
];

export const Comparison: React.FC = () => {
  return (
    <section className="k-section" id="comparison">
      <div className="k-container">
        <div className="k-section-header">
          <div className="k-kicker">// THE ARCHITECTURAL DIFFERENCE</div>
          <h2 className="k-title">Why fuzzy RAG fails on code.</h2>
          <p className="k-desc">
            Natural language models process text by probability. Compilers process code by invariants.
            Kaioken replaces probabilistic guesswork with compiler-grade certainty.
          </p>
        </div>

        <div className="k-comparison-table">
          <div className="k-comp-header">
            <div className="k-comp-col-head k-comp-col-head--dim">
              Conventional AI Coding Tools
            </div>
            <div className="k-comp-col-head k-comp-col-head--accent">
              <span className="k-badge-dot" />
              <span>Kaioken Deterministic Runtime</span>
            </div>
          </div>

          {COMPARISON_ROWS.map((row, idx) => (
            <div key={idx} className="k-comp-row">
              <div className="k-comp-cell k-comp-cell--left">
                <p>{row.conventional}</p>
              </div>
              <div className="k-comp-cell k-comp-cell--right">
                <p>{row.kaioken}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
