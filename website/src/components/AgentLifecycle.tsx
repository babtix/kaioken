import React, { useState } from 'react';

interface Stage {
  num: string;
  name: string;
  subtitle: string;
  latency: string;
  description: string;
  metric: string;
  metricLabel: string;
  asciiDiagram: string[];
}

const STAGES: Stage[] = [
  {
    num: '01',
    name: 'TREE-SITTER INGEST',
    subtitle: 'Zero-latency full AST tokenization',
    latency: '12ms / 100k LoC',
    description:
      'Replaces fuzzy text embeddings with exact compiler-grade syntax trees. Every function, struct, interface, and import is indexed deterministically into an in-memory symbol registry.',
    metric: '38,490',
    metricLabel: 'SYMBOLS INDEXED',
    asciiDiagram: [
      '┌───────────────────────────────┐',
      '│ Source Code (.rs, .ts, .py)   │',
      '└──────────────┬────────────────┘',
      '               ▼                 ',
      '┌───────────────────────────────┐',
      '│ Tree-sitter AST Tokenizer     │',
      '└──────────────┬────────────────┘',
      '               ▼                 ',
      '   Exact Syntax Graph Trees      ',
    ],
  },
  {
    num: '02',
    name: 'PROVENANCE LATTICE',
    subtitle: 'SHA-256 cryptographic dependency graph',
    latency: '8ms traversal',
    description:
      'Every symbol reference is linked to an exact line range and cryptographic hash. If code changes, only affected lattice nodes are invalidated. No stale vector embeddings.',
    metric: '0.00%',
    metricLabel: 'ROT TOLERANCE',
    asciiDiagram: [
      '┌───────────────────────────────┐',
      '│ SHA-256 Node Hash Generation  │',
      '└──────────────┬────────────────┘',
      '               ▼                 ',
      '┌──────────────┴────────────────┐',
      '│ Directed Acyclic Graph (DAG)  │',
      '│ Caller ──► Callee Lattice     │',
      '└───────────────────────────────┘',
    ],
  },
  {
    num: '03',
    name: 'SANDBOXED SWARM',
    subtitle: 'Subagents bounded by strict AST contracts',
    latency: 'Parallel Rayon',
    description:
      'Subagents receive exact symbol scopes rather than random prompt dumps. They cannot fabricate non-existent functions or import unverified third-party libraries.',
    metric: '×10',
    metricLabel: 'MAX SWARM MULTIPLIER',
    asciiDiagram: [
      '    ┌───────────────┐            ',
      '    │ Central Agent │            ',
      '    └───┬───────┬───┘            ',
      '   ┌────┴───┐ ┌─┴──────┐         ',
      '   ▼ Worker1▼ ▼ Worker2▼         ',
      '   [AST-Gate] [AST-Gate]         ',
    ],
  },
  {
    num: '04',
    name: 'NATIVE ORACLE',
    subtitle: 'Compilers and test suites as truth engines',
    latency: 'Native speed',
    description:
      'Before a generated patch is considered valid, Kaioken executes the repository’s native compiler, typechecker, and test runners in isolated sandboxes. No un-compilable code leaves the agent.',
    metric: '100%',
    metricLabel: 'TEST PASS GATE',
    asciiDiagram: [
      '┌───────────────────────────────┐',
      '│ Isolated Test Sandbox         │',
      '│ cargo test / tsc --noEmit     │',
      '└──────────────┬────────────────┘',
      '               ▼                 ',
      '       0 Errors Detected         ',
    ],
  },
  {
    num: '05',
    name: 'GROUNDING GATE',
    subtitle: 'Verified cryptographic attestation & ship',
    latency: '0.2s check',
    description:
      'Every commit is stamped with an AST Grounding Attestation. If an LLM hallucinated even one phantom identifier, the gate halts execution and instructs the agent to self-correct.',
    metric: '0.00%',
    metricLabel: 'HALLUCINATION RATE',
    asciiDiagram: [
      '┌───────────────────────────────┐',
      '│ AST Grounding Verification    │',
      '└──────────────┬────────────────┘',
      '               ▼                 ',
      '┌───────────────────────────────┐',
      '│ KAIO-ATTEST-PASS // Commit    │',
      '└───────────────────────────────┘',
    ],
  },
];

export const AgentLifecycle: React.FC = () => {
  const [activeStage, setActiveStage] = useState<number>(0);
  const current = STAGES[activeStage];

  return (
    <section className="k-section k-section--paper k-lifecycle-section" id="architecture">
      <div className="k-container">
        {/* Header */}
        <div className="k-lifecycle-header">
          <div className="k-hero-eyebrow">
            <span className="k-label k-label--ink">// RECURSIVE DETERMINISTIC LOOP</span>
            <span className="k-label k-label--ink">·</span>
            <span className="k-label k-label--ink">THE AUTONOMOUS PIPELINE</span>
          </div>

          <h2 className="k-section-title k-text-ink">
            How Kaioken guarantees <span className="k-serif-italic">absolute</span> certainty.
          </h2>

          <p className="k-section-desc k-text-ink">
            Chatbots guess. Kaioken verifies. Our five-stage deterministic loop replaces probabilistic vector hallucinations with compiler-grade AST invariants.
          </p>
        </div>

        {/* 5-Step Stage Selector Tabs */}
        <div className="k-lifecycle-steps-rail">
          {STAGES.map((stage, idx) => {
            const isSelected = idx === activeStage;
            return (
              <button
                key={stage.num}
                type="button"
                className={`k-lifecycle-tab ${isSelected ? 'k-lifecycle-tab--active' : ''}`}
                onClick={() => setActiveStage(idx)}
              >
                <div className="k-lifecycle-tab-top">
                  <span className="k-tab-num">{stage.num}</span>
                  <span className="k-tab-latency">{stage.latency}</span>
                </div>
                <div className="k-tab-name">{stage.name}</div>
              </button>
            );
          })}
        </div>

        {/* Selected Stage Inspection Card */}
        <div className="k-lifecycle-stage-card">
          <div className="k-stage-card-left">
            <div className="k-stage-number-watermark">{current.num}</div>
            <div className="k-stage-meta-bar">
              <span className="k-stage-badge">STAGE {current.num} // 05</span>
              <span className="k-stage-latency-tag">{current.latency}</span>
            </div>

            <h3 className="k-stage-title">{current.name}</h3>
            <p className="k-stage-subtitle">{current.subtitle}</p>

            <p className="k-stage-description">{current.description}</p>

            <div className="k-stage-kpis">
              <div className="k-stage-kpi">
                <span className="k-kpi-val">{current.metric}</span>
                <span className="k-kpi-lbl">{current.metricLabel}</span>
              </div>
              <div className="k-stage-kpi">
                <span className="k-kpi-val" style={{ color: 'var(--kai-orange)' }}>
                  DETERMINISTIC
                </span>
                <span className="k-kpi-lbl">ACCURACY GUARANTEE</span>
              </div>
            </div>
          </div>

          <div className="k-stage-card-right">
            <div className="k-stage-ascii-box">
              <div className="k-stage-ascii-header">
                <span className="k-chip-dot" />
                <span>PIPELINE SCHEMATIC // STAGE_{current.num}</span>
              </div>
              <pre className="k-stage-ascii-code">
                {current.asciiDiagram.join('\n')}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
