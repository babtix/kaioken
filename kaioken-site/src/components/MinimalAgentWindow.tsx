import React, { useState } from 'react';
import { ShieldCheck, Terminal } from 'lucide-react';

interface CodeScenario {
  id: string;
  name: string;
  file: string;
  statusBadge: string;
  lines: { num: number; text: string; type?: 'kw' | 'fn' | 'type' | 'str' | 'add' | 'del' }[];
  footerInfo: string;
}

const SCENARIOS: CodeScenario[] = [
  {
    id: 'ast',
    name: '01 / AST Symbol Graph',
    file: 'kaioken::engine::symbol_graph.rs',
    statusBadge: '12ms · 38,490 Grounded Nodes',
    lines: [
      { num: 1, text: '// Compiler-grade Tree-sitter symbol resolution', type: 'str' },
      { num: 2, text: "pub struct SymbolRegistry<'a> {", type: 'kw' },
      { num: 3, text: "    pub arena: &'a AstArena,", type: 'type' },
      { num: 4, text: '    pub provenance_map: BTreeMap<SymbolId, Sha256Hash>,', type: 'type' },
      { num: 5, text: '}', type: 'kw' },
      { num: 6, text: '' },
      { num: 7, text: 'impl SymbolRegistry {', type: 'kw' },
      { num: 8, text: '    pub fn resolve_references(&self, query: &Query) -> GroundedScope {', type: 'fn' },
      { num: 9, text: '        // Deterministic lookup: 0 fuzzy probability, 100% compiler precision', type: 'str' },
      { num: 10, text: '        self.arena.traverse_exact(query.root_token())', type: 'fn' },
      { num: 11, text: '    }', type: 'kw' },
      { num: 12, text: '}', type: 'kw' },
    ],
    footerInfo: 'Tree-sitter v0.24 · Rust / TypeScript / Go / Python indexed in memory',
  },
  {
    id: 'gate',
    name: '02 / Grounding Gate',
    file: 'kaioken::gate::provenance_audit.rs',
    statusBadge: '0% Hallucination · Attested',
    lines: [
      { num: 1, text: '// Evaluates proposed LLM diff against compiler symbols', type: 'str' },
      { num: 2, text: 'pub async fn audit_patch(diff: &ProposedDiff) -> Result<Attestation> {', type: 'fn' },
      { num: 3, text: '    let ast = tree_sitter::parse_virtual(&diff.after)?;', type: 'type' },
      { num: 4, text: '    for token in ast.external_tokens() {', type: 'kw' },
      { num: 5, text: '        if !registry.contains_symbol(&token) {', type: 'kw' },
      { num: 6, text: '            return Err(HallucinationDetected::phantom_symbol(token));', type: 'type' },
      { num: 7, text: '        }', type: 'kw' },
      { num: 8, text: '    }', type: 'kw' },
      { num: 9, text: '    Ok(Attestation::verified_and_signed(diff.sha256()))', type: 'fn' },
      { num: 10, text: '}', type: 'kw' },
    ],
    footerInfo: 'Grounding Gate verified 0 ungrounded symbols across commit patch',
  },
  {
    id: 'patch',
    name: '03 / Verified Diff Patch',
    file: 'src/core/ast_walker.rs',
    statusBadge: 'All 18 Tests Passing',
    lines: [
      { num: 1, text: '@@ -14,6 +14,8 @@ pub fn traverse(&self) -> Vec<SymbolId>' },
      { num: 2, text: '-    self.nodes.iter().filter_map(|n| n.as_symbol()).collect()', type: 'del' },
      { num: 3, text: '+    use rayon::prelude::*;', type: 'add' },
      { num: 4, text: '+    self.nodes.par_iter().filter_map(|n| n.as_grounded_symbol()).collect()', type: 'add' },
      { num: 5, text: ' }' },
      { num: 6, text: '' },
      { num: 7, text: '// Native test suite runner output:' },
      { num: 8, text: '// cargo test --test ast_parallel ... ok (18 passed, 0 failed in 0.04s)', type: 'str' },
    ],
    footerInfo: 'Autonomous subagent swarm completed edit with zero human correction',
  },
];

export const MinimalAgentWindow: React.FC = () => {
  const [activeId, setActiveId] = useState('ast');
  const scenario = SCENARIOS.find((s) => s.id === activeId) || SCENARIOS[0];

  return (
    <div className="k-window-wrap">
      <div className="k-window">
        {/* Top bar with tabs and status */}
        <div className="k-window-bar">
          <div className="k-window-tabs">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`k-window-tab ${s.id === activeId ? 'k-window-tab--active' : ''}`}
                onClick={() => setActiveId(s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>

          <div className="k-window-badge">
            <ShieldCheck size={12} />
            <span>{scenario.statusBadge}</span>
          </div>
        </div>

        {/* Code body */}
        <div className="k-window-body">
          {scenario.lines.map((line) => (
            <div key={line.num} className="k-code-line">
              <span className="k-num">{line.num}</span>
              <span className={`k-text ${line.type ? `k-text--${line.type}` : ''}`}>
                {line.text}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="k-window-footer">
          <div className="k-footer-tag">
            <Terminal size={12} />
            <span>{scenario.file}</span>
          </div>
          <span>{scenario.footerInfo}</span>
        </div>
      </div>
    </div>
  );
};
