import React from 'react';
import { FEATURES } from '../data/content.ts';
import { useGsapContext } from '../hooks/useGsapContext.ts';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export const FeatureCards: React.FC = () => {
  const containerRef = useGsapContext<HTMLElement>((_, target) => {
    const cards = target.querySelectorAll('.k-feature-card');
    cards.forEach((card) => {
      gsap.fromTo(
        card,
        { y: 50, opacity: 0, clipPath: 'inset(10% 0% 0% 0%)' },
        {
          y: 0,
          opacity: 1,
          clipPath: 'inset(0% 0% 0% 0%)',
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: card,
            start: 'top 88%',
          },
        }
      );
    });
  });

  return (
    <section ref={containerRef} className="k-features-section k-section--ink" id="features">
      {/* Eyebrow & Section Title */}
      <div>
        <p className="k-label k-label--dim">// SYSTEM ARCHITECTURE</p>
        <h2 className="k-h2" style={{ marginTop: 8 }}>
          CORE FEATURES
        </h2>
      </div>

      {/* 2-Column Grid */}
      <div className="k-features-grid">
        {FEATURES.map((feature) => (
          <article key={feature.id} className="k-feature-card">
            <div className="k-feature-meta">
              <span className="k-label" style={{ color: 'var(--accent)' }}>
                {feature.num}
              </span>
              <span className="k-label k-label--dim">AST GROUNDED</span>
            </div>

            <div style={{ margin: '16px 0 12px' }}>
              <h3 className="k-feature-title">{feature.title}</h3>
            </div>

            <p className="k-feature-desc">{feature.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
};
