import React from 'react';
import { useGsapContext } from '../hooks/useGsapContext.ts';
import { splitIntoChars } from '../lib/splitText.ts';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowDown, ArrowUpRight } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

export const Closer: React.FC = () => {
  const containerRef = useGsapContext<HTMLElement>((_, target) => {
    const headline = target.querySelector<HTMLElement>('.k-closer-headline');
    if (!headline) return;

    const chars = splitIntoChars(headline);

    // Per-character scrub skew / rotate driven by ScrollTrigger
    gsap.fromTo(
      chars,
      {
        y: 40,
        skewX: (i) => ((i % 2 === 0 ? 1 : -1) * 18),
        rotate: (i) => ((i % 2 === 0 ? 1 : -1) * 6),
      },
      {
        y: 0,
        skewX: 0,
        rotate: 0,
        stagger: 0.03,
        scrollTrigger: {
          trigger: headline,
          start: 'top 85%',
          end: 'bottom 45%',
          scrub: 1,
        },
      }
    );
  });

  return (
    <section ref={containerRef} className="k-closer-section k-section--paper" id="closer">
      <p className="k-label k-label--dim">// ELIMINATE DRIFT FOREVER</p>

      <h2 className="k-closer-headline">GROUND YOUR CODE</h2>

      <p className="k-label k-label--dim" style={{ maxWidth: 640, margin: '0 auto 36px', fontSize: 16, lineHeight: 1.4 }}>
        Deterministic AST indexing, verifiable wikis, and high-velocity agentic workflows.
      </p>

      <div className="k-closer-actions">
        <a href="#downloads" className="k-pill k-pill--accent">
          <span>INSTALL KAIOKEN</span>
          <ArrowDown size={14} />
        </a>

        <a
          href="https://github.com/babtix/kaioken"
          target="_blank"
          rel="noopener noreferrer"
          className="k-pill k-pill--ghost-paper"
        >
          <span>VIEW GITHUB REPO</span>
          <ArrowUpRight size={14} />
        </a>
      </div>
    </section>
  );
};
