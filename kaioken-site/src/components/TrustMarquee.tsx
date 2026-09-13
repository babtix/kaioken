import React, { useRef } from 'react';
import { MARQUEE_ITEMS } from '../data/content.ts';
import { useGsapContext } from '../hooks/useGsapContext.ts';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export const TrustMarquee: React.FC = () => {
  const trackRef = useRef<HTMLDivElement | null>(null);

  const containerRef = useGsapContext<HTMLElement>(() => {
    if (!trackRef.current) return;

    let xPos = 0;
    const speed = 0.8;
    let direction = -1;

    // Track scroll velocity using ScrollTrigger
    ScrollTrigger.create({
      onUpdate: (self) => {
        if (self.getVelocity() < -50) {
          direction = 1; // Scroll up -> flip right
        } else if (self.getVelocity() > 50) {
          direction = -1; // Scroll down -> move left
        }
      },
    });

    const ticker = () => {
      if (!trackRef.current) return;
      xPos += speed * direction;
      const totalWidth = trackRef.current.scrollWidth / 2;

      if (xPos <= -totalWidth) {
        xPos = 0;
      } else if (xPos >= 0) {
        xPos = -totalWidth;
      }

      gsap.set(trackRef.current, { x: xPos });
    };

    gsap.ticker.add(ticker);

    return () => {
      gsap.ticker.remove(ticker);
    };
  });

  // Duplicate items for continuous seamless loop
  const displayItems = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS, ...MARQUEE_ITEMS];

  return (
    <section ref={containerRef} className="k-marquee-section k-section--ink" aria-label="Supported Technologies">
      <div className="k-marquee-caption">
        <p className="k-label k-label--dim">// DETERMINISTIC AST &amp; PROVENANCE PRIMITIVES</p>
      </div>

      <div className="k-marquee-track" ref={trackRef}>
        {displayItems.map((item, idx) => (
          <span key={idx} className="k-marquee-item">
            <span>{item}</span>
            <span className="k-marquee-bullet">✦</span>
          </span>
        ))}
      </div>
    </section>
  );
};
