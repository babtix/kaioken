import React from 'react';

const METRICS = [
  {
    val: '12ms',
    title: 'Symbol Graph Lookup',
    desc: 'Instant in-memory traversal across tens of thousands of AST nodes. Zero vector embedding latency.',
  },
  {
    val: '0.00%',
    title: 'Grounded Hallucination Rate',
    desc: 'The Grounding Gate cryptographically validates every external token against your compiler registry.',
  },
  {
    val: '100k+',
    title: 'Lines of Code / Second',
    desc: 'High-throughput parallel parsing powered by native Tree-sitter and multi-threaded Rayon workers.',
  },
];

export const Metrics: React.FC = () => {
  return (
    <section className="k-section" id="metrics">
      <div className="k-container">
        <div className="k-section-header">
          <div className="k-kicker">// PERFORMANCE & GUARANTEES</div>
          <h2 className="k-title">Engineered without compromise.</h2>
          <p className="k-desc">
            Raw speed, verified accuracy, and zero network dependency. Built for developers who value precision.
          </p>
        </div>

        <div className="k-metrics-grid">
          {METRICS.map((m, idx) => (
            <div key={idx} className="k-metric-card">
              <div className="k-metric-val">{m.val}</div>
              <h3 className="k-metric-title">{m.title}</h3>
              <p className="k-metric-desc">{m.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
