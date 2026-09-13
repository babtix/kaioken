import React from 'react';
import { KaiokenPowerCore } from './KaiokenPowerCore.tsx';
import { ArrowUpRight } from 'lucide-react';

export const About: React.FC = () => {
  return (
    <section className="k-about-section k-section--ink" id="about">
      <div className="k-about-grid">
        {/* Left: About Text & Stats */}
        <div className="k-about-content">
          <p className="k-label k-label--dim">// THE ECOSYSTEM</p>
          <h2 className="k-about-headline">
            BUILT FOR DEVELOPERS TIRED OF DRIFTING AI AGENTS
          </h2>

          <p className="k-about-p">
            Kaioken was created by Babtix and open-source contributors to solve the fundamental
            flaw in today’s code-assisting LLMs: lack of deterministic ground truth.
          </p>

          <p className="k-about-p">
            By indexing entire repositories into Tree-sitter AST symbol lattices, Kaioken ensures
            that AI models only act on code that exists, never guess signatures, and prove their
            work through native test execution.
          </p>

          <div className="k-about-stats">
            <div className="k-stat-item">
              <span className="k-stat-value">100%</span>
              <span className="k-label k-label--dim">DETERMINISTIC AST</span>
            </div>
            <div className="k-stat-item">
              <span className="k-stat-value">0</span>
              <span className="k-label k-label--dim">REMOTE TOKENS NEEDED FOR CORE</span>
            </div>
            <div className="k-stat-item">
              <span className="k-stat-value">×10</span>
              <span className="k-label k-label--dim">MAXIMUM COMPUTE MULTIPLIER</span>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <a
              href="https://github.com/babtix/kaioken"
              target="_blank"
              rel="noopener noreferrer"
              className="k-pill k-pill--ghost-ink"
            >
              <span>EXPLORE ON GITHUB</span>
              <ArrowUpRight size={16} />
            </a>
          </div>
        </div>

        {/* Right: De-glowed Kaioken Power Core Astrolabe */}
        <div>
          <KaiokenPowerCore />
        </div>
      </div>
    </section>
  );
};
