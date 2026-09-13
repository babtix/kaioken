import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';

export function useGsapContext<T extends HTMLElement>(
  animationCreator: (context: gsap.Context, target: T) => void,
  deps: React.DependencyList = []
) {
  const containerRef = useRef<T | null>(null);

  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const ctx = gsap.context((self) => {
      if (containerRef.current) {
        animationCreator(self, containerRef.current);
      }
    }, containerRef);

    return () => {
      ctx.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return containerRef;
}
