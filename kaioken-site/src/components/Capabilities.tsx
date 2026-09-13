import React from 'react';

const CAPABILITIES = [
  {
    id: 'ast',
    title: 'Structural AST index',
    desc: 'TypeScript, Go, Python and Rust parsed to declarations and symbol skeletons. Exact lookups at zero token cost.',
  },
  {
    id: 'hash',
    title: 'Content-hash memory',
    desc: 'Each declaration carries a SHA-256 of its source. Invalidation follows AST drift, so documentation cannot silently rot.',
  },
  {
    id: 'gate',
    title: 'Hard grounding gate',
    desc: 'SymbolOracle validates existence and line anchors, then runs your real npm, go or cargo test suite before completing.',
  },
  {
    id: 'multiplier',
    title: 'The multiplier',
    desc: 'One number from x1 to x10 controls search breadth, crawl depth, token budget and adversarial verification passes.',
  },
  {
    id: 'research',
    title: 'Deep web research',
    desc: 'Multi-hop agents search, extract and sanitise sources, anchoring every citation to a live cryptographic page hash.',
  },
  {
    id: 'swarm',
    title: 'Subagent swarms',
    desc: 'Isolated subagents get their own terminals and sandbox namespaces, over a pipeline RPC that costs the parent no context.',
  },
];

export const Capabilities: React.FC = () => {
  return (
    <section id="capabilities" className="section">
      <div className="wrap">
        <div className="head">
          <span className="head-num">§03</span>
          <h2 className="head-title">Capabilities</h2>
          <span className="head-note">six, and no more than six</span>
        </div>

        <div className="caps grid-rule">
          {CAPABILITIES.map((cap, i) => (
            <article key={cap.id} className="cap">
              <span className="cap-i mono">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="h3 cap-t">{cap.title}</h3>
              <p className="cap-d">{cap.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
