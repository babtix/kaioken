import React, { useRef } from 'react';
import { MULTIPLIER_TIERS } from '../data/content.ts';
import { useGsapContext } from '../hooks/useGsapContext.ts';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export const MultiplierScroller: React.FC = () => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const outerRef = useRef<HTMLDivElement | null>(null);

  const containerRef = useGsapContext<HTMLElement>((_, target) => {
    // Only pin on desktop/tablets where viewport is wide enough
    if (window.innerWidth < 768) return;

    const track = trackRef.current;
    const outer = outerRef.current;
    if (!track || !outer) return;

    const getScrollDistance = () => {
      return track.scrollWidth - outer.offsetWidth + 60;
    };

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: target,
        pin: true,
        start: 'top top',
        end: () => `+=${getScrollDistance()}`,
        scrub: 1,
        invalidateOnRefresh: true,
        anticipatePin: 1,
      },
    });

    tl.to(track, {
      x: () => -getScrollDistance(),
      ease: 'none',
    });
  });

  return (
    <section ref={containerRef} className="k-multiplier-section k-section--ink" id="multiplier">
      <div className="k-multiplier-pinned-wrapper">
        {/* Top Header */}
        <div className="k-multiplier-header">
          <div>
            <p className="k-label k-label--dim">// COMPUTE INTENSITY</p>
            <h2 className="k-h2" style={{ marginTop: 8 }}>
              KAIOKEN MULTIPLIER
            </h2>
          </div>
          <p className="k-label k-label--dim" style={{ maxWidth: 380, textAlign: 'right' }}>
            DIAL COMPUTE BREADTH, CRAWL DEPTH &amp; TEST SUITE GATES WITH DETERMINISTIC COST TRANSPARENCY
          </p>
        </div>

        {/* Interactive Tier Jump Selector */}
        <div className="k-tier-quick-nav">
          {MULTIPLIER_TIERS.map((tier, idx) => (
            <button
              key={tier.tier}
              type="button"
              className="k-tier-nav-btn"
              onClick={() => {
                const track = trackRef.current;
                const outer = outerRef.current;
                if (!track || !outer) return;
                const card = track.children[idx] as HTMLElement | undefined;
                if (card) {
                  const targetOffset = Math.min(
                    card.offsetLeft,
                    track.scrollWidth - outer.offsetWidth
                  );
                  gsap.to(track, { x: -targetOffset, duration: 0.6, ease: 'power3.out' });
                }
              }}
            >
              <span style={{ color: tier.accent, fontWeight: 700 }}>{tier.multiplier}</span>
              <span>{tier.name}</span>
            </button>
          ))}
        </div>

        {/* Horizontal Track of Tiers */}
        <div ref={outerRef} className="k-multiplier-track-outer">
          <div ref={trackRef} className="k-multiplier-track">
            {MULTIPLIER_TIERS.map((tier) => (
              <div
                key={tier.tier}
                className="k-multiplier-card"
                style={{
                  borderColor: tier.accent,
                  boxShadow: 'none',
                }}
              >
                <div>
                  <div className="k-multiplier-card-top">
                    <span className="k-label" style={{ color: tier.accent }}>
                      TIER {tier.tier}
                    </span>
                    <span
                      className="k-multiplier-giant-num"
                      style={{ color: tier.accent }}
                    >
                      {tier.multiplier}
                    </span>
                  </div>

                  <h3 className="k-multiplier-card-name">{tier.name}</h3>
                  <p className="k-multiplier-card-headline">{tier.headline}</p>

                  <div className="k-multiplier-specs">
                    <div className="k-multiplier-spec-row">
                      <span className="k-multiplier-spec-label">Search Breadth</span>
                      <span>{tier.breadth}</span>
                    </div>
                    <div className="k-multiplier-spec-row">
                      <span className="k-multiplier-spec-label">AST Depth</span>
                      <span>{tier.depth}</span>
                    </div>
                    <div className="k-multiplier-spec-row">
                      <span className="k-multiplier-spec-label">Token Budget</span>
                      <span>{tier.budget}</span>
                    </div>
                    <div className="k-multiplier-spec-row">
                      <span className="k-multiplier-spec-label">Verification Gate</span>
                      <span style={{ color: tier.accent }}>{tier.verification}</span>
                    </div>
                  </div>
                </div>

                <p className="k-multiplier-desc">{tier.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Rail Indicator */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="k-label k-label--dim">×1 BASELINE → ×10 ADVERSARIAL VERIFICATION</span>
          <span className="k-label k-label--dim">SCROLL TO ADVANCE TIERS</span>
        </div>
      </div>
    </section>
  );
};
