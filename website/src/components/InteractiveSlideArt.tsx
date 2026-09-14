import React, { useState } from 'react';

interface InteractiveSlideArtProps {
  slideId: string;
}

export const InteractiveSlideArt: React.FC<InteractiveSlideArtProps> = ({ slideId }) => {
  const [activeAstNode, setActiveAstNode] = useState<'fn' | 'params' | 'ret' | 'body'>('fn');
  const [multiplierLevel, setMultiplierLevel] = useState<'x1' | 'x3' | 'x5' | 'x10'>('x10');
  const [activeSubagent, setActiveSubagent] = useState<'worker-1' | 'worker-2' | 'worker-3'>('worker-1');

  switch (slideId) {
    case 'ingest':
      return (
        <div className="k-art-container k-art-ast">
          <div className="k-art-header">
            <span className="k-art-tag">TREE-SITTER AST PARSER</span>
            <span className="k-art-status">● 38,490 SYMBOLS CACHED</span>
          </div>

          <div className="k-art-ast-body">
            {/* Left: Code Snippet */}
            <div className="k-art-code-pane">
              <div className="k-code-line"><span className="c-num">1</span> <span className="c-kwd">export class</span> <span className="c-cls">SymbolOracle</span> {'{'}</div>
              <div className={`k-code-line ${activeAstNode === 'fn' ? 'c-active-line' : ''}`}>
                <span className="c-num">2</span>   <span className="c-fn">resolveDecl</span>(<span className="c-var">sym</span>: <span className="c-typ">string</span>): <span className="c-typ">ASTNode</span> {'{'}
              </div>
              <div className="k-code-line"><span className="c-num">3</span>     <span className="c-kwd">const</span> hash = <span className="c-fn">sha256</span>(sym);</div>
              <div className="k-code-line"><span className="c-num">4</span>     <span className="c-kwd">return</span> <span className="c-this">this</span>.tree.<span className="c-fn">query</span>(hash);</div>
              <div className="k-code-line"><span className="c-num">5</span>   {'}'}</div>
              <div className="k-code-line"><span className="c-num">6</span> {'}'}</div>
            </div>

            {/* Right: Interactive AST Node Tree */}
            <div className="k-art-tree-pane">
              <div className="k-tree-node" onClick={() => setActiveAstNode('fn')}>
                <span className="k-tree-kind">MethodDeclaration</span>
                <span className="k-tree-val">"resolveDecl"</span>
              </div>
              <div className="k-tree-children">
                <div className="k-tree-branch">├── <span className="k-tree-kind">Identifier</span> <span className="c-var">sym: string</span></div>
                <div className="k-tree-branch">├── <span className="k-tree-kind">ReturnType</span> <span className="c-typ">ASTNode</span></div>
                <div className="k-tree-branch">└── <span className="k-tree-kind">BlockStatement</span> (38 symbols)</div>
              </div>
              <div className="k-tree-pill">✔ ZERO-TOKEN DEFINITIVE LOOKUP</div>
            </div>
          </div>
        </div>
      );

    case 'remember':
      return (
        <div className="k-art-container k-art-hash">
          <div className="k-art-header">
            <span className="k-art-tag">SHA-256 PROVENANCE LATTICE</span>
            <span className="k-art-status">● 0% STALE DRIFT</span>
          </div>

          <div className="k-art-hash-grid">
            <div className="k-hash-card">
              <div className="k-hash-label">AST SOURCE BLOCK</div>
              <div className="k-hash-hex">f89e2c41...b7d8</div>
              <div className="k-hash-meta">src/core/grounding.ts:L42-L89</div>
              <div className="k-hash-tag k-hash-tag--green">MATCH ACTIVE CODE</div>
            </div>

            <div className="k-hash-card">
              <div className="k-hash-label">CRYPTOGRAPHIC PROVENANCE</div>
              <div className="k-hash-hex">3a19b840...9f2e</div>
              <div className="k-hash-meta">Lattice Depth: 4 hops</div>
              <div className="k-hash-tag k-hash-tag--orange">DETERMINISTIC CACHE</div>
            </div>
          </div>

          <div className="k-hash-stream">
            <span className="c-fn">watch</span>: AST hash verified across 267 source files · Invalidation strictly on syntax tree drift
          </div>
        </div>
      );

    case 'multiply':
      return (
        <div className="k-art-container k-art-mult">
          <div className="k-art-header">
            <span className="k-art-tag">KAIOKEN COMPUTE GOVERNOR</span>
            <span className="k-art-status">DIAL INTENSITY ×1 → ×10</span>
          </div>

          <div className="k-mult-selector">
            {(['x1', 'x3', 'x5', 'x10'] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                className={`k-mult-btn ${multiplierLevel === lvl ? 'is-active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setMultiplierLevel(lvl);
                }}
              >
                {lvl.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="k-mult-metrics">
            <div className="k-mult-metric">
              <span className="k-mult-k">Search Breadth</span>
              <span className="k-mult-v">{multiplierLevel === 'x1' ? '1 Query' : multiplierLevel === 'x3' ? '4 Queries' : multiplierLevel === 'x5' ? '10 Queries' : '20 Queries'}</span>
            </div>
            <div className="k-mult-metric">
              <span className="k-mult-k">Verification</span>
              <span className="k-mult-v" style={{ color: 'var(--accent)' }}>
                {multiplierLevel === 'x1' ? 'AST Syntax Check' : multiplierLevel === 'x3' ? 'Type Graph Audit' : multiplierLevel === 'x5' ? 'Consensus Gate' : 'Adversarial Proof'}
              </span>
            </div>
            <div className="k-mult-metric">
              <span className="k-mult-k">Token Budget</span>
              <span className="k-mult-v">{multiplierLevel === 'x1' ? '15k tokens' : multiplierLevel === 'x3' ? '45k tokens' : multiplierLevel === 'x5' ? '120k tokens' : '350k tokens'}</span>
            </div>
          </div>
        </div>
      );

    case 'verify':
      return (
        <div className="k-art-container k-art-gate">
          <div className="k-art-header">
            <span className="k-art-tag">HARD GROUNDING GATE</span>
            <span className="k-art-status">EXIT 0 · TESTS PASSING</span>
          </div>

          <div className="k-gate-diff">
            <div className="k-diff-col k-diff-col--fail">
              <div className="k-diff-head">❌ UNGROUNDED LLM</div>
              <div className="k-diff-code">
                <div className="k-diff-line del">- client.getUserDetails(id, true);</div>
                <div className="k-diff-err">TypeError: getUserDetails is not a function</div>
              </div>
            </div>

            <div className="k-diff-col k-diff-col--pass">
              <div className="k-diff-head">✔ KAIOKEN AST GROUNDED</div>
              <div className="k-diff-code">
                <div className="k-diff-line add">+ client.fetchUser({'{'} userId: id {'}'});</div>
                <div className="k-diff-ok">AST Match: src/client.ts:42 · Native Test Pass</div>
              </div>
            </div>
          </div>
        </div>
      );

    case 'research':
      return (
        <div className="k-art-container k-art-web">
          <div className="k-art-header">
            <span className="k-art-tag">MULTI-HOP WEB RESEARCH</span>
            <span className="k-art-status">CRYPTOGRAPHIC CITATIONS</span>
          </div>

          <div className="k-web-hops">
            <div className="k-web-hop">
              <span className="k-web-step">01</span>
              <span className="k-web-query">docs.rs/tree-sitter/latest</span>
              <span className="k-web-badge">200 OK</span>
            </div>
            <div className="k-web-hop">
              <span className="k-web-step">02</span>
              <span className="k-web-query">Extract Node AST Cursor specs</span>
              <span className="k-web-badge">PARSED</span>
            </div>
            <div className="k-web-hop">
              <span className="k-web-step">03</span>
              <span className="k-web-query">Anchor citation to sha256(html)</span>
              <span className="k-web-badge" style={{ color: '#10b981' }}>LOCKED</span>
            </div>
          </div>
        </div>
      );

    case 'delegate':
      return (
        <div className="k-art-container k-art-swarm">
          <div className="k-art-header">
            <span className="k-art-tag">ISOLATED SUBAGENT SWARMS</span>
            <span className="k-art-status">3 WORKERS RUNNING</span>
          </div>

          <div className="k-swarm-tabs">
            {(['worker-1', 'worker-2', 'worker-3'] as const).map((w, idx) => (
              <button
                key={w}
                type="button"
                className={`k-swarm-tab ${activeSubagent === w ? 'is-active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveSubagent(w);
                }}
              >
                SUBAGENT-{idx + 1}
              </button>
            ))}
          </div>

          <div className="k-swarm-terminal">
            {activeSubagent === 'worker-1' && (
              <div>
                <span className="c-fn">[worker-1]</span> Tree-sitter indexing 142 TypeScript files...
                <br /><span className="c-ok">✔ Done in 84ms. Generated 12,410 declaration anchors.</span>
              </div>
            )}
            {activeSubagent === 'worker-2' && (
              <div>
                <span className="c-fn">[worker-2]</span> Running cargo test --workspace in sandbox namespace...
                <br /><span className="c-ok">✔ 412 test suites passed. 0 regressions.</span>
              </div>
            )}
            {activeSubagent === 'worker-3' && (
              <div>
                <span className="c-fn">[worker-3]</span> Synthesizing wiki chapter 04: "AST Lattice Model"...
                <br /><span className="c-ok">✔ Saved to .kaioken/wiki/04-ast-lattice.md</span>
              </div>
            )}
          </div>
        </div>
      );

    case 'macos':
      return (
        <div className="k-art-container k-art-platform">
          <div className="k-art-header">
            <span className="k-art-tag">MACOS UNIVERSAL BINARY</span>
            <span className="k-art-status">APPLE SILICON &amp; INTEL</span>
          </div>
          <div className="k-platform-specs">
            <div className="k-spec-line"><span>Target:</span> <span className="c-typ">macOS 12.0+ (Darwin x86_64 / arm64)</span></div>
            <div className="k-spec-line"><span>Engine:</span> <span className="c-typ">Rust AST Scanner + Node 22 Runtime</span></div>
            <div className="k-spec-line"><span>Terminal:</span> <span className="c-var">curl -fsSL https://kaioken.dev/install.sh | bash</span></div>
          </div>
          <div className="k-platform-chip-bar">
            <span>ARM64 M1/M2/M3/M4 NATIVE</span>
            <span>NOTARIZED BY APPLE</span>
          </div>
        </div>
      );

    case 'windows':
      return (
        <div className="k-art-container k-art-platform">
          <div className="k-art-header">
            <span className="k-art-tag">WINDOWS 10 / 11 NATIVE</span>
            <span className="k-art-status">X64 &amp; ARM64</span>
          </div>
          <div className="k-platform-specs">
            <div className="k-spec-line"><span>Target:</span> <span className="c-typ">Windows 10/11 (Build 19041+)</span></div>
            <div className="k-spec-line"><span>Package:</span> <span className="c-typ">Signed MSIX &amp; Portable Executable</span></div>
            <div className="k-spec-line"><span>PowerShell:</span> <span className="c-var">irm https://kaioken.dev/install.ps1 | iex</span></div>
          </div>
          <div className="k-platform-chip-bar">
            <span>WINDOWS TERMINAL PROFILE</span>
            <span>ZERO DEPENDENCIES</span>
          </div>
        </div>
      );

    case 'linux':
      return (
        <div className="k-art-container k-art-platform">
          <div className="k-art-header">
            <span className="k-art-tag">LINUX APPIMAGE &amp; CLI</span>
            <span className="k-art-status">ANY DISTRO · GLIBC 2.31+</span>
          </div>
          <div className="k-platform-specs">
            <div className="k-spec-line"><span>Architecture:</span> <span className="c-typ">x86_64 / aarch64 Linux</span></div>
            <div className="k-spec-line"><span>Formats:</span> <span className="c-typ">AppImage, Standalone Binary, Tarball</span></div>
            <div className="k-spec-line"><span>Install:</span> <span className="c-var">curl -fsSL https://kaioken.dev/install.sh | bash</span></div>
          </div>
          <div className="k-platform-chip-bar">
            <span>SYSTEMD DAEMON MODE</span>
            <span>HEADLESS CI READY</span>
          </div>
        </div>
      );

    default:
      return null;
  }
};
