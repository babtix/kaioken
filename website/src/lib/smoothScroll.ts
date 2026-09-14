import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

let lenisInstance: Lenis | null = null;

export function initSmoothScroll(): { lenis: Lenis | null; destroy: () => void } {
  // Opt-out on prefers-reduced-motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    return {
      lenis: null,
      destroy: () => {},
    };
  }

  if (lenisInstance) {
    return {
      lenis: lenisInstance,
      destroy: () => {
        lenisInstance?.destroy();
        lenisInstance = null;
      },
    };
  }

  const lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    orientation: 'vertical',
    gestureOrientation: 'vertical',
    smoothWheel: true,
    wheelMultiplier: 1.0,
    touchMultiplier: 1.5,
  });

  lenisInstance = lenis;

  // Bridge Lenis scroll events to GSAP ScrollTrigger
  lenis.on('scroll', ScrollTrigger.update);

  // Drive Lenis RAF inside GSAP ticker
  const tickerCallback = (time: number) => {
    lenis.raf(time * 1000);
  };

  gsap.ticker.add(tickerCallback);
  gsap.ticker.lagSmoothing(0);

  const destroy = () => {
    gsap.ticker.remove(tickerCallback);
    lenis.destroy();
    lenisInstance = null;
  };

  return { lenis, destroy };
}

export function getLenis(): Lenis | null {
  return lenisInstance;
}
