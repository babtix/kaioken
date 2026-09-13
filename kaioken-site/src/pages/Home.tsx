import React, { useEffect } from 'react';
import { Header } from '@/components/Header.tsx';
import { Hero } from '@/components/Hero.tsx';
import { Problem } from '@/components/Problem.tsx';
import { Method } from '@/components/Method.tsx';
import { Capabilities } from '@/components/Capabilities.tsx';
import { Multiplier } from '@/components/Multiplier.tsx';
import { Install } from '@/components/Install.tsx';
import { Footer } from '@/components/Footer.tsx';
import { initSmoothScroll } from '@/lib/smoothScroll.ts';

export const Home: React.FC = () => {
  useEffect(() => {
    const { destroy } = initSmoothScroll();
    return () => {
      destroy();
    };
  }, []);

  return (
    <div className="site-root">
      <Header />
      <main>
        <Hero />
        <Problem />
        <Method />
        <Capabilities />
        <Multiplier />
        <Install />
      </main>
      <Footer />
    </div>
  );
};

export default Home;
