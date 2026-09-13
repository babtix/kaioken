import React, { useState } from 'react';
import { ShieldCheck, CheckCircle2, Play } from 'lucide-react';

interface SessionScenario {
  id: string;
  title: string;
  status: 'Running' | 'Verified' | 'Merged';
  timeAgo: string;
  badgeColor: string;
  goal: string;
  workedDuration: string;
  hallucinationRate: string;
  memoryUsage: string;
  tools: {
    icon: string;
    label: string;
    detail: string;
    status: 'done' | 'active' | 'pending';
  }[];
  diff: {
    filename: string;
    additions: number;
    deletions: number;
    sha: string;
    beforeCode: string[];
    afterCode: string[];
  };
}

const SCENARIOS: SessionScenario[] = [
  {
    id: 'rayon-ast',
    title: 'Migrate AST Walker to Rayon',
    status: 'Running',
    timeAgo: 'Now · Swarm ×3',
    badgeColor: 'var(--kai-orange)',
    goal: 'Migrate single-threaded AST walker to parallel Rayon iterator without breaking symbol references',
    workedDuration: '1.4s',
    hallucinationRate: '0.0%',
    memoryUsage: '38 MB',
    tools: [
      {
        icon: '⚡',
        label: 'Skill("kaioken-tree-sitter-ast")',
        detail: 'Loaded parser grammar for Rust 1.82 edition',
        status: 'done',
      },
      {
        icon: '🔍',
        label: 'ast_oracle / query_symbol_graph',
        detail: 'Resolved 1,420 function nodes and 84 method receivers in 12ms',
        status: 'done',
      },
      {
        icon: '🛡️',
        label: 'provenance / verify_hash_lattice',
        detail: 'SHA-256 lattice matched against commit 8f92a1. 0 untracked references.',
        status: 'done',
      },
      {
        icon: '✏️',
        label: 'edit / src/core/ast_walker.rs',
        detail: 'Replaced Walker::iter() with par_iter() and added Sync trait bounds',
        status: 'done',
      },
      {
        icon: '🧪',
        label: 'test_oracle / cargo test --test ast_parallel',
        detail: '18 passed; 0 failed; finished in 0.038s',
        status: 'active',
      },
    ],
    diff: {
      filename: 'src/core/ast_walker.rs',
      additions: 24,
      deletions: 8,
      sha: 'e83f1092a7b4c810df92a7e4b9c1d0f8',
      beforeCode: [
        'pub fn traverse_symbols(&self) -> Vec<SymbolId> {',
        '    self.nodes.iter().filter_map(|node| {',
        '        if node.is_exported() {',
        '            Some(node.id)',
        '        } else {',
        '            None',
        '        }',
        '    }).collect()',
        '}',
      ],
      afterCode: [
        'pub fn traverse_symbols(&self) -> Vec<SymbolId> {',
        '    use rayon::prelude::*;',
        '    self.nodes.par_iter().filter_map(|node| {',
        '        if node.is_grounded() && node.is_exported() {',
        '            Some(node.id)',
        '        } else {',
        '            None',
        '        }',
        '    }).collect()',
        '}',
      ],
    },
  },
  {
    id: 'grounding-pr',
    title: 'Grounding Gate: PR #412',
    status: 'Verified',
    timeAgo: '2m ago',
    badgeColor: '#10b981',
    goal: 'Audit incoming PR diff for unverified LLM hallucinations and phantom library imports',
    workedDuration: '0.8s',
    hallucinationRate: '0.0%',
    memoryUsage: '26 MB',
    tools: [
      {
        icon: '⚡',
        label: 'Skill("kaioken-grounding-gate")',
        detail: 'Intercepted git diff on branch feat/redis-cache',
        status: 'done',
      },
      {
        icon: '🔍',
        label: 'import_oracle / verify_external_crates',
        detail: 'All 4 external crates found in Cargo.lock index (no typosquatting)',
        status: 'done',
      },
      {
        icon: '🛡️',
        label: 'type_oracle / check_signature_integrity',
        detail: 'Matched CacheKey trait signature against central AST symbol registry',
        status: 'done',
      },
      {
        icon: '✓',
        label: 'gate / sign_provenance_attestation',
        detail: 'Attestation cryptographic token generated: KAIO-ATTEST-9482-OK',
        status: 'done',
      },
    ],
    diff: {
      filename: 'src/cache/redis_store.rs',
      additions: 19,
      deletions: 4,
      sha: '4a7b92c810df92a7e4b9c1d0f8e83f10',
      beforeCode: [
        'pub async fn get_entry(&self, key: &str) -> Result<Option<Value>> {',
        '    let raw = self.conn.get(key).await?;',
        '    serde_json::from_slice(&raw)',
        '}',
      ],
      afterCode: [
        'pub async fn get_entry<K: CacheKey>(&self, key: &K) -> Result<Option<Value>> {',
        '    let hash = key.grounded_hash();',
        '    let raw = self.conn.get(hash).await?;',
        '    serde_json::from_slice(&raw)',
        '}',
      ],
    },
  },
  {
    id: 'wiki-sync',
    title: 'Sync 38,490 Symbols to Wiki',
    status: 'Merged',
    timeAgo: '14m ago',
    badgeColor: 'var(--kai-red)',
    goal: 'Re-index entire repository AST symbols and update architectural markdown specs without rot',
    workedDuration: '2.1s',
    hallucinationRate: '0.0%',
    memoryUsage: '44 MB',
    tools: [
      {
        icon: '⚡',
        label: 'Skill("kaioken-wiki-sync")',
        detail: 'Scanning 842 source files across 12 packages',
        status: 'done',
      },
      {
        icon: '🔍',
        label: 'tree_sitter / batch_parse_workspace',
        detail: 'Parsed 38,490 symbols with full type-hierarchy and callers',
        status: 'done',
      },
      {
        icon: '📝',
        label: 'doc_generator / update_provenance_blocks',
        detail: 'Regenerated architecture specs with inline line-range citations',
        status: 'done',
      },
      {
        icon: '✓',
        label: 'git / commit_signed_docs',
        detail: 'Committed: "docs(wiki): sync 38,490 symbols [skip ci]"',
        status: 'done',
      },
    ],
    diff: {
      filename: 'docs/architecture/SYMBOL_GRAPH.md',
      additions: 42,
      deletions: 11,
      sha: '10df92a7e4b9c1d0f8e83f1092a7b4c8',
      beforeCode: [
        '<!-- KAI:START_AST_SYMBOLS hash="old_7a2b" -->',
        '## Engine Modules (Total: 12)',
        '- `kaioken::core`: 8,920 symbols',
        '- `kaioken::ast`: 14,200 symbols',
        '<!-- KAI:END_AST_SYMBOLS -->',
      ],
      afterCode: [
        '<!-- KAI:START_AST_SYMBOLS hash="new_8f9c" -->',
        '## Engine Modules (Total: 14)',
        '- `kaioken::core`: 9,140 symbols (+220)',
        '- `kaioken::ast`: 14,850 symbols (+650)',
        '- `kaioken::swarm`: 2,100 symbols (NEW)',
        '<!-- KAI:END_AST_SYMBOLS -->',
      ],
    },
  },
];

export const AgentWorkbench: React.FC = () => {
  const [activeSession, setActiveSession] = useState<SessionScenario>(SCENARIOS[0]);

  return (
    <section className="k-section k-section--ink k-workbench-section" id="workbench">
      <div className="k-container">
        {/* Section Kicker & Editorial Header */}
        <div className="k-workbench-header">
          <div className="k-workbench-badge">
            <span className="k-chip-dot" />
            <span className="k-label">// LIVE AGENT WORKSPACE · DETERMINISTIC EXECUTION</span>
          </div>

          <h2 className="k-workbench-title">
            The Agent that <span className="k-serif-italic">proves</span> every diff.
          </h2>

          <p className="k-workbench-desc">
            Inspired by industrial autonomy stacks and high-rigor engineering environments, Kaioken runs inside your local hardware. No fuzzy hallucinations. No blind file rewrites. Every change is verified against the Tree-sitter AST before a line is committed.
          </p>

          <div className="k-workbench-pills">
            <span className="k-telemetry-chip">
              <span style={{ color: 'var(--kai-orange)' }}>⚡</span>
              <span>PARALLEL SUBAGENT SWARMS</span>
            </span>
            <span className="k-telemetry-chip">
              <span style={{ color: '#10b981' }}>✔</span>
              <span>SHA-256 PROVENANCE LATTICE</span>
            </span>
            <span className="k-telemetry-chip">
              <span>ZERO VECTOR RAG ROT</span>
            </span>
          </div>
        </div>

        {/* 3-Column Interactive Agent Workbench */}
        <div className="k-workbench-shell">
          {/* Top Window Chrome Bar */}
          <div className="k-workbench-chrome">
            <div className="k-chrome-controls">
              <span className="k-chrome-dot k-chrome-dot--red" />
              <span className="k-chrome-dot k-chrome-dot--yellow" />
              <span className="k-chrome-dot k-chrome-dot--green" />
            </div>
            <div className="k-chrome-title">
              <span>kaioken-agent-runtime</span>
              <span className="k-chrome-sep">/</span>
              <span className="k-chrome-active-session">{activeSession.id}.session</span>
            </div>
            <div className="k-chrome-telemetry">
              <span className="k-mono-tag">PID: 9482</span>
              <span className="k-mono-tag">MEM: {activeSession.memoryUsage}</span>
              <span className="k-mono-tag k-mono-tag--accent">LATENCY: {activeSession.workedDuration}</span>
            </div>
          </div>

          {/* Workbench Body */}
          <div className="k-workbench-grid">
            {/* Column 1: Active Sessions & Automations */}
            <div className="k-workbench-col k-workbench-col--sessions">
              <div className="k-col-header">
                <span className="k-col-title">AUTOMATIONS</span>
                <span className="k-mono-tag">3 ACTIVE</span>
              </div>
              <div className="k-session-list">
                {SCENARIOS.map((session) => {
                  const isSelected = session.id === activeSession.id;
                  return (
                    <button
                      key={session.id}
                      type="button"
                      className={`k-session-item ${isSelected ? 'k-session-item--active' : ''}`}
                      onClick={() => setActiveSession(session)}
                    >
                      <div className="k-session-item-top">
                        <span
                          className="k-session-indicator"
                          style={{ backgroundColor: session.badgeColor }}
                        />
                        <span className="k-session-name">{session.title}</span>
                      </div>
                      <div className="k-session-item-meta">
                        <span className="k-session-time">{session.timeAgo}</span>
                        <span
                          className="k-session-status-badge"
                          style={{ borderColor: session.badgeColor, color: session.badgeColor }}
                        >
                          {session.status}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="k-session-footer-card">
                <div className="k-session-footer-row">
                  <span className="k-label-dim">AST SYMBOLS GROUNDED</span>
                  <span className="k-label-val">38,490</span>
                </div>
                <div className="k-session-footer-row">
                  <span className="k-label-dim">HALLUCINATION RATE</span>
                  <span className="k-label-val" style={{ color: '#10b981' }}>0.00%</span>
                </div>
                <div className="k-session-footer-row">
                  <span className="k-label-dim">EXECUTION CONTEXT</span>
                  <span className="k-label-val">LOCAL ISOLATED</span>
                </div>
              </div>
            </div>

            {/* Column 2: Live Tool-Invocation Tree (Factory.ai inspired) */}
            <div className="k-workbench-col k-workbench-col--trace">
              <div className="k-col-header">
                <div className="k-col-title-group">
                  <span className="k-col-title">EXECUTION TRACE</span>
                  <span className="k-mono-tag">NESTED TOOL GRAPH</span>
                </div>
                <span className="k-mono-tag k-mono-tag--accent">
                  WORKED FOR {activeSession.workedDuration}
                </span>
              </div>

              {/* Goal banner */}
              <div className="k-trace-goal">
                <div className="k-trace-goal-label">
                  <Play size={12} fill="var(--kai-orange)" color="var(--kai-orange)" />
                  <span>OBJECTIVE</span>
                </div>
                <p className="k-trace-goal-text">{activeSession.goal}</p>
              </div>

              {/* Nested Step List */}
              <div className="k-trace-steps">
                {activeSession.tools.map((tool, idx) => (
                  <div
                    key={idx}
                    className={`k-trace-step k-trace-step--${tool.status}`}
                  >
                    <div className="k-trace-step-indicator">
                      {tool.status === 'done' ? (
                        <CheckCircle2 size={13} color="#10b981" />
                      ) : tool.status === 'active' ? (
                        <span className="k-step-pulse" />
                      ) : (
                        <span className="k-step-hollow" />
                      )}
                    </div>
                    <div className="k-trace-step-content">
                      <div className="k-trace-step-header">
                        <span className="k-trace-icon">{tool.icon}</span>
                        <span className="k-trace-label">{tool.label}</span>
                      </div>
                      <p className="k-trace-detail">{tool.detail}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Live Status Bar */}
              <div className="k-trace-status-bar">
                <span className="k-chip-dot" />
                <span>Agent ready. Deterministic AST verification pass passed.</span>
              </div>
            </div>

            {/* Column 3: Provenance Diff & Verification Gate (Devin inspired) */}
            <div className="k-workbench-col k-workbench-col--diff">
              <div className="k-col-header">
                <div className="k-col-title-group">
                  <span className="k-col-title">PROVENANCE DIFF</span>
                  <span className="k-mono-tag">{activeSession.diff.filename}</span>
                </div>
                <div className="k-diff-stats">
                  <span className="k-stat-add">+{activeSession.diff.additions}</span>
                  <span className="k-stat-del">-{activeSession.diff.deletions}</span>
                </div>
              </div>

              {/* Verification Stamp */}
              <div className="k-provenance-badge-bar">
                <div className="k-provenance-pill">
                  <ShieldCheck size={14} color="#10b981" />
                  <span>GROUNDING GATE: VERIFIED</span>
                </div>
                <span className="k-provenance-sha">
                  SHA: {activeSession.diff.sha.slice(0, 12)}...
                </span>
              </div>

              {/* Code Diff Display */}
              <div className="k-diff-code-panel">
                <div className="k-diff-subhead">BEFORE // SINGLE-THREADED</div>
                <div className="k-code-block k-code-block--del">
                  {activeSession.diff.beforeCode.map((line, i) => (
                    <div key={i} className="k-code-line k-code-line--del">
                      <span className="k-line-num">{i + 1}</span>
                      <span className="k-line-sign">-</span>
                      <span className="k-line-text">{line}</span>
                    </div>
                  ))}
                </div>

                <div className="k-diff-subhead k-diff-subhead--add">AFTER // DETERMINISTIC PARALLEL</div>
                <div className="k-code-block k-code-block--add">
                  {activeSession.diff.afterCode.map((line, i) => (
                    <div key={i} className="k-code-line k-code-line--add">
                      <span className="k-line-num">{i + 1}</span>
                      <span className="k-line-sign">+</span>
                      <span className="k-line-text">{line}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Proof Footer */}
              <div className="k-diff-footer">
                <div className="k-diff-proof-item">
                  <span className="k-proof-label">AST VALIDATION:</span>
                  <span className="k-proof-value" style={{ color: '#10b981' }}>PASSED (0 errors)</span>
                </div>
                <div className="k-diff-proof-item">
                  <span className="k-proof-label">UNTRACKED TOKENS:</span>
                  <span className="k-proof-value">NONE (100% Grounded)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
