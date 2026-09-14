import React, { useState } from 'react';
import { COMMANDS } from '../data/content.ts';
import { useGsapContext } from '../hooks/useGsapContext.ts';
import { splitIntoWords } from '../lib/splitText.ts';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export const WhatItIs: React.FC = () => {
  const [activeCmdIndex, setActiveCmdIndex] = useState(0);

  const containerRef = useGsapContext<HTMLElement>((_, target) => {
    const headline = target.querySelector<HTMLElement>('.k-what-scrub-text');
    if (!headline) return;

    // Tokenize words
    const words = splitIntoWords(headline);

    // Word-by-word scrub highlight from --on-ink-dim to --on-ink
    gsap.fromTo(
      words,
      { color: 'rgba(255, 255, 255, 0.22)' },
      {
        color: '#ffffff',
        stagger: 0.08,
        scrollTrigger: {
          trigger: headline,
          start: 'top 78%',
          end: 'bottom 45%',
          scrub: true,
        },
      }
    );
  });

  return (
    <section ref={containerRef} className="k-what k-section--ink" id="what-it-is">
      {/* Header */}
      <div className="k-what-header">
        <p className="k-label k-label--dim">• WHAT IT ACTUALLY DOES</p>
      </div>

      {/* Scrub Highlight Headline */}
      <h2 className="k-what-scrub-text">
        A deterministic repository intelligence engine that indexes your syntax trees, grounds AI
        agents in real code, and never guesses.
      </h2>

      <p className="k-what-desc">
        Traditional code agents hallucinate declarations and drift as files change. Kaioken
        maintains an AST symbol lattice across your entire repo with cryptographic provenance and
        strict test suite execution gates.
      </p>

      {/* Interactive TUI Mockup (Native Terminal Interface) */}
      <div className="k-tui-frame" aria-label="Kaioken Interactive Terminal Showcase">
        {/* Terminal Chrome Bar */}
        <div className="k-tui-titlebar">
          <div className="k-tui-dots">
            <span className="k-tui-dot k-tui-dot--red" />
            <span className="k-tui-dot k-tui-dot--orange" />
            <span className="k-tui-dot k-tui-dot--white" />
            <span className="k-tui-title">kaioken@kaioken_v2 — 2.0.0</span>
          </div>

          <div className="k-tui-tabs" role="tablist">
            {COMMANDS.map((item, i) => (
              <button
                key={item.label}
                type="button"
                role="tab"
                aria-selected={activeCmdIndex === i}
                onClick={() => setActiveCmdIndex(i)}
                className={`k-tui-tab ${activeCmdIndex === i ? 'is-active' : ''}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Terminal Body */}
        <div className="k-tui-body">
          {/* TUI Banner */}
          <div className="k-tui-banner">
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '22px',
                  fontWeight: 900,
                  letterSpacing: '0.08em',
                  color: 'var(--on-ink)',
                  marginBottom: 12,
                }}
              >
                KAIOKEN<span style={{ color: 'var(--accent)' }}>_V2</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--on-ink-dim)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div><span style={{ color: 'var(--kai-orange)' }}>enter</span> send · <span style={{ color: 'var(--kai-orange)' }}>/</span> commands · <span style={{ color: 'var(--kai-orange)' }}>tab</span> complete</div>
                <div><span style={{ color: 'var(--kai-orange)' }}>ctrl+shift+f</span> search · <span style={{ color: 'var(--kai-orange)' }}>ctrl+c</span> exit</div>
              </div>
            </div>

            <div style={{ fontSize: '11px', display: 'grid', gridTemplateColumns: '80px 1fr', gap: '2px 8px' }}>
              <span style={{ color: 'var(--kai-orange)' }}>Version:</span>
              <span style={{ color: '#ffffff' }}>2.0.0</span>
              <span style={{ color: 'var(--kai-orange)' }}>Repo:</span>
              <span style={{ color: '#ffffff' }}>~/workspace/kaioken-core</span>
              <span style={{ color: 'var(--kai-orange)' }}>Index:</span>
              <span style={{ color: '#10b981' }}>267 files · 100% fresh</span>
            </div>
          </div>

          {/* Active Command Execution Display */}
          <div className="k-tui-exec">
            <div className="k-tui-cmd">› {COMMANDS[activeCmdIndex].cmd}</div>
            {COMMANDS[activeCmdIndex].output.map((line, idx) => (
              <div
                key={idx}
                className={
                  line.startsWith('✔')
                    ? 'k-tui-line--success'
                    : line.startsWith('KAIOKEN') || line.startsWith('Parallel')
                    ? 'k-tui-line--warn'
                    : 'k-tui-line--dim'
                }
              >
                {line}
              </div>
            ))}
          </div>

          {/* Prompt input line */}
          <div style={{ display: 'flex', alignItems: 'center', color: '#38bdf8', fontSize: '12px' }}>
            <span style={{ marginRight: 6 }}>›</span>
            <span style={{ color: 'var(--on-ink-dim)' }}>chat with model, or type /help for commands</span>
            <span style={{ display: 'inline-block', width: 7, height: 14, backgroundColor: 'var(--kai-orange)', marginLeft: 6 }} />
          </div>
        </div>
      </div>

      {/* AST Grounding vs Standard RAG Matrix */}
      <div className="k-comparison-matrix">
        <div className="k-matrix-header">
          <span className="k-label k-label--dim">// THE ARCHITECTURAL ADVANTAGE</span>
          <h3 className="k-matrix-title">DETERMINISTIC AST VS. VECTOR FUZZY SEARCH</h3>
        </div>

        <div className="k-matrix-grid">
          <div className="k-matrix-col k-matrix-col--rag">
            <div className="k-col-head">
              <span className="k-col-tag">STANDARD VECTOR RAG</span>
              <span className="k-col-sub">COPILOT &amp; GENERIC AI AGENTS</span>
            </div>
            <ul className="k-matrix-list">
              <li><span className="k-list-icon">❌</span> <span>Fuzzy vector distance searches guess at relevant source chunks</span></li>
              <li><span className="k-list-icon">❌</span> <span>Hallucinates parameters, types, and non-existent functions</span></li>
              <li><span className="k-list-icon">❌</span> <span>Silent documentation rot: documentation drifts while code evolves</span></li>
              <li><span className="k-list-icon">❌</span> <span>Claims are unchecked without compiler or test execution</span></li>
            </ul>
          </div>

          <div className="k-matrix-col k-matrix-col--kaio">
            <div className="k-col-head">
              <span className="k-col-tag" style={{ color: 'var(--accent)' }}>KAIOKEN AST RUNTIME</span>
              <span className="k-col-sub">DETERMINISTIC KNOWLEDGE ENGINE</span>
            </div>
            <ul className="k-matrix-list">
              <li><span className="k-list-icon" style={{ color: '#10b981' }}>✔</span> <span>Tree-sitter builds an explicit symbol lattice across all languages</span></li>
              <li><span className="k-list-icon" style={{ color: '#10b981' }}>✔</span> <span>Zero hallucinated symbols: verified declarations anchored at exact lines</span></li>
              <li><span className="k-list-icon" style={{ color: '#10b981' }}>✔</span> <span>SHA-256 provenance tracks drift and invalidates caches automatically</span></li>
              <li><span className="k-list-icon" style={{ color: '#10b981' }}>✔</span> <span>Native test suite gate: subagents run unit tests to verify before output</span></li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};
