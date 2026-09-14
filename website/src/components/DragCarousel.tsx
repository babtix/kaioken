import React, { useRef, useState, useEffect, useCallback } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { animate } from 'animejs';
import { InteractiveSlideArt } from './InteractiveSlideArt.tsx';

gsap.registerPlugin(ScrollTrigger);

export interface DragSlideItem {
  id: string;
  num: string;
  title: string;
  description: string;
  image: string;
  webp1200?: string;
  webp600?: string;
  chips?: string[];
  href?: string;
  buttonText?: string;
}

interface DragCarouselProps {
  slides: DragSlideItem[];
  variant?: 'hero' | 'chips';
  loop?: boolean;
}

export const DragCarousel: React.FC<DragCarouselProps> = ({
  slides,
  variant = 'hero',
  loop = true,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrubberBarRef = useRef<HTMLDivElement | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  // Position state & physics
  const xRef = useRef(0);
  const targetXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startTargetXRef = useRef(0);
  const lastXRef = useRef(0);
  const velocityRef = useRef(0);
  const lastTimeRef = useRef(0);
  const quickToRef = useRef<gsap.QuickToFunc | null>(null);

  const slideWidthRef = useRef(520);
  const gapRef = useRef(30);

  const totalSlides = slides.length;
  // Duplicate slides 3x for continuous seamless wrapping if looping
  const displaySlides = loop ? [...slides, ...slides, ...slides] : slides;
  const offsetMultiplier = loop ? 1 : 0;

  const activeSlide = slides[activeIndex % totalSlides];

  // Measure sizes
  const updateMetrics = useCallback(() => {
    if (!trackRef.current || !viewportRef.current) return;
    const firstSlide = trackRef.current.querySelector<HTMLElement>('.kc-slide');
    if (firstSlide) {
      slideWidthRef.current = firstSlide.offsetWidth;
    }
    const computedGap = window.getComputedStyle(trackRef.current).gap;
    gapRef.current = parseFloat(computedGap) || 30;
  }, []);

  // Wrap / Modulo helper for infinite loop
  const checkWrap = useCallback(
    (x: number) => {
      if (!loop) return x;
      const step = slideWidthRef.current + gapRef.current;
      const singleSetWidth = totalSlides * step;
      const vpWidth = viewportRef.current?.offsetWidth || window.innerWidth;
      const centerBase = vpWidth / 2 - slideWidthRef.current / 2;

      const minX = centerBase - 2 * singleSetWidth;
      const maxX = centerBase;

      let newX = x;
      if (newX < minX) {
        newX += singleSetWidth;
        if (trackRef.current) {
          xRef.current += singleSetWidth;
          gsap.set(trackRef.current, { x: xRef.current });
        }
      } else if (newX > maxX) {
        newX -= singleSetWidth;
        if (trackRef.current) {
          xRef.current -= singleSetWidth;
          gsap.set(trackRef.current, { x: xRef.current });
        }
      }
      return newX;
    },
    [loop, totalSlides]
  );

  // Update active slide based on current track position
  const updateActiveIndex = useCallback(
    (currentX: number) => {
      if (!viewportRef.current) return;
      const vpWidth = viewportRef.current.offsetWidth;
      const step = slideWidthRef.current + gapRef.current;
      if (step <= 0) return;

      const centerTarget = vpWidth / 2 - slideWidthRef.current / 2 - currentX;
      let rawIndex = Math.round(centerTarget / step);

      let modIndex = rawIndex % totalSlides;
      if (modIndex < 0) modIndex += totalSlides;

      setActiveIndex((prev) => {
        if (prev !== modIndex) {
          // Anime.js HUD pulse animation on active transition
          if (scrubberBarRef.current) {
            animate(scrubberBarRef.current, {
              scale: [0.95, 1.05, 1],
              duration: 350,
              ease: 'outQuad',
            });
          }
          return modIndex;
        }
        return prev;
      });
    },
    [totalSlides]
  );

  // 1. Initialize GSAP positioning, physics, and Scroll-Driven translation
  useEffect(() => {
    updateMetrics();
    window.addEventListener('resize', updateMetrics);

    if (trackRef.current && viewportRef.current) {
      quickToRef.current = gsap.quickTo(trackRef.current, 'x', {
        duration: 0.55,
        ease: 'power3.out',
      });

      const vpWidth = viewportRef.current.offsetWidth || window.innerWidth;
      const step = slideWidthRef.current + gapRef.current;
      const initialOffset = loop ? totalSlides * step : 0;
      const centeredX = vpWidth / 2 - slideWidthRef.current / 2 - initialOffset;

      xRef.current = centeredX;
      targetXRef.current = centeredX;
      gsap.set(trackRef.current, { x: centeredX });
    }

    // SCROLL-DRIVEN ANIMATION:
    // Vertical page scroll automatically drives horizontal carousel translation!
    // User does not have to drag by hand manually.
    let lastScrollY = window.scrollY;
    const handleWindowScroll = () => {
      if (isDraggingRef.current) return;
      const currentScrollY = window.scrollY;
      const deltaY = currentScrollY - lastScrollY;
      lastScrollY = currentScrollY;

      // Translate track horizontally with vertical scroll
      if (Math.abs(deltaY) > 0.5) {
        let nextX = targetXRef.current - deltaY * 1.8;
        nextX = checkWrap(nextX);
        targetXRef.current = nextX;
        quickToRef.current?.(nextX);
        updateActiveIndex(nextX);
      }
    };

    window.addEventListener('scroll', handleWindowScroll, { passive: true });

    // 2. Ambient continuous auto-glide (idle motion when not hovered or dragged)
    let rAFId: number;
    const ambientGlide = () => {
      if (!isDraggingRef.current && !isHovered && loop) {
        let nextX = targetXRef.current - 0.45; // Gentle continuous forward drift
        nextX = checkWrap(nextX);
        targetXRef.current = nextX;
        quickToRef.current?.(nextX);
        updateActiveIndex(nextX);
      }
      rAFId = requestAnimationFrame(ambientGlide);
    };

    rAFId = requestAnimationFrame(ambientGlide);

    return () => {
      window.removeEventListener('resize', updateMetrics);
      window.removeEventListener('scroll', handleWindowScroll);
      cancelAnimationFrame(rAFId);
    };
  }, [checkWrap, isHovered, loop, totalSlides, updateActiveIndex, updateMetrics]);

  // Step carousel manually by index delta (e.g. arrow keys)
  const stepSlide = useCallback(
    (delta: number) => {
      const step = slideWidthRef.current + gapRef.current;
      let newTarget = targetXRef.current - delta * step;
      newTarget = checkWrap(newTarget);
      targetXRef.current = newTarget;

      quickToRef.current?.(newTarget);
      updateActiveIndex(newTarget);
    },
    [checkWrap, updateActiveIndex]
  );

  // Pointer Drag Handlers (Optional manual drag override)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startTargetXRef.current = targetXRef.current;
    lastXRef.current = e.clientX;
    velocityRef.current = 0;
    lastTimeRef.current = performance.now();

    viewportRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;

    const deltaX = e.clientX - startXRef.current;
    const now = performance.now();
    const dt = Math.max(1, now - lastTimeRef.current);
    const dx = e.clientX - lastXRef.current;

    velocityRef.current = (dx / dt) * 1000;
    lastXRef.current = e.clientX;
    lastTimeRef.current = now;

    let nextX = startTargetXRef.current + deltaX;
    nextX = checkWrap(nextX);
    targetXRef.current = nextX;

    quickToRef.current?.(nextX);
    updateActiveIndex(nextX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    try {
      viewportRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if released
    }

    const step = slideWidthRef.current + gapRef.current;
    const vpWidth = viewportRef.current?.offsetWidth || window.innerWidth;
    const centerBase = vpWidth / 2 - slideWidthRef.current / 2;

    let momentumX = targetXRef.current + velocityRef.current * 0.16;
    momentumX = checkWrap(momentumX);

    const relativeToCenter = centerBase - momentumX;
    const nearestIndex = Math.round(relativeToCenter / step);
    const snappedX = centerBase - nearestIndex * step;

    targetXRef.current = snappedX;
    quickToRef.current?.(snappedX);
    updateActiveIndex(snappedX);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stepSlide(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      stepSlide(1);
    }
  };

  // Anime.js HUD Scrubber ticks
  const scrubberTicksCount = 18;
  const currentTickIndex = Math.round((activeIndex / (totalSlides - 1 || 1)) * (scrubberTicksCount - 1));

  return (
    <div
      ref={containerRef}
      className="kc-carousel"
      aria-roledescription="carousel"
      aria-label="Interactive Showcase Carousel"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Top Meta Line: Anime.js HUD Scrubber & Active Readout */}
      <div className="kc-header-meta">
        <div className="kc-hud-scrubber" ref={scrubberBarRef}>
          <span className="k-label k-label--dim" style={{ fontSize: 10 }}>SCROLL / AUTO-GLIDE</span>
          <div className="kc-ticks">
            {Array.from({ length: scrubberTicksCount }).map((_, i) => (
              <span
                key={i}
                className={`kc-tick ${i === currentTickIndex ? 'is-active-tick' : ''}`}
              >
                {i === currentTickIndex ? '■' : '|'}
              </span>
            ))}
          </div>
        </div>

        <div className="k-label kc-num-current">
          #{String(activeIndex + 1).padStart(2, '0')} <span style={{ color: 'var(--on-ink-dim)', fontWeight: 400 }}>/ {String(totalSlides).padStart(2, '0')}</span>
        </div>
      </div>

      {/* Live Active Rail: Number left · Title and Description right */}
      <div className="kc-rail">
        <div className="kc-rail-left">
          <span className="k-label kc-rail-num">{activeSlide.num}</span>
        </div>
        <div className="kc-rail-center">
          <span className="k-label kc-rail-title">{activeSlide.title}</span>
          <span className="k-label kc-rail-desc">— {activeSlide.description}</span>
        </div>
        <div className="kc-rail-controls">
          <button
            type="button"
            className="kc-rail-arrow"
            onClick={() => stepSlide(-1)}
            aria-label="Previous Slide"
          >
            ←
          </button>
          <button
            type="button"
            className="kc-rail-arrow"
            onClick={() => stepSlide(1)}
            aria-label="Next Slide"
          >
            →
          </button>
        </div>
      </div>

      {/* Viewport and Track */}
      <div
        ref={viewportRef}
        className="kc-viewport"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        role="region"
        aria-label="Scroll-Driven Carousel Track"
      >
        <div ref={trackRef} className="kc-track">
          {displaySlides.map((slide, idx) => {
            const rawIndex = idx;
            const originalIndex = idx % totalSlides;
            const isActive = originalIndex === activeIndex;

            const normalizedActive = loop ? activeIndex + totalSlides * offsetMultiplier : activeIndex;
            const dist = Math.abs(rawIndex - normalizedActive);
            const isNeighbor = dist === 1;

            return (
              <div
                key={`${slide.id}-${idx}`}
                className={`kc-slide ${isActive ? 'is-active' : ''} ${isNeighbor ? 'is-neighbor' : ''}`}
                data-num={slide.num}
                data-title={slide.title}
                onClick={() => {
                  const delta = rawIndex - normalizedActive;
                  if (delta !== 0) stepSlide(delta);
                }}
              >
                <div className="kc-slide-content">
                  <InteractiveSlideArt slideId={slide.id} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chips Row variant for Download carousel */}
      {variant === 'chips' && activeSlide.chips && (
        <div className="kc-chips-row">
          {activeSlide.chips.map((chip, i) => (
            <span key={i} className="kc-chip">
              {chip}
            </span>
          ))}
          {activeSlide.href && (
            <a
              href={activeSlide.href}
              className="kc-chip kc-chip--action"
              target={activeSlide.href.startsWith('http') ? '_blank' : '_self'}
              rel="noopener noreferrer"
            >
              {activeSlide.buttonText || 'DOWNLOAD ▾'}
            </a>
          )}
        </div>
      )}
    </div>
  );
};
