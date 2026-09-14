import React from 'react';
import { GUARANTEES } from '../data/content.ts';
import { useGsapContext } from '../hooks/useGsapContext.ts';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export const Guarantees: React.FC = () => {
  const containerRef = useGsapContext<HTMLElement>((_, target) => {
    const cards = target.querySelectorAll('.k-guarantee-card');
    cards.forEach((card, i) => {
      gsap.fromTo(
        card,
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.7,
          delay: (i % 3) * 0.1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: card,
            start: 'top 90%',
          },
        }
      );
    });
  });

  return (
    <section ref={containerRef} className="k-guarantees-section k-section--paper" id="guarantees">
      <div>
        <p className="k-label k-label--dim">// VERIFIABLE CONTRACTS</p>
        <h2 className="k-h2" style={{ marginTop: 8 }}>
          FACTUAL GUARANTEES
        </h2>
      </div>

      <div className="k-guarantees-grid">
        {GUARANTEES.map((item) => (
          <div key={item.num} className="k-guarantee-card">
            <div>
              <div className="k-guarantee-top">
                <span className="k-label" style={{ color: 'var(--accent)' }}>
                  GUARANTEE #{item.num}
                </span>
                <span className="k-label k-label--dim">AUDITED</span>
              </div>

              <h3 className="k-guarantee-title">{item.title}</h3>
              <p className="k-guarantee-claim">{item.claim}</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 14, borderTop: '1px solid var(--line-paper)' }}>
              <span className="k-guarantee-metric">{item.metric}</span>
              <span className="k-label k-label--dim" style={{ fontSize: 11 }}>{item.verification}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
