import React, { useEffect } from 'react';
import { HomeBackground } from '@/components/HomeBackground.tsx';
import { Header } from '@/components/Header.tsx';
import { Hero } from '@/components/Hero.tsx';
import { WhyBuilt } from '@/components/WhyBuilt.tsx';
import { Pillars } from '@/components/Pillars.tsx';
import { BuiltBy } from '@/components/BuiltBy.tsx';
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
    <div className="site-root relative min-h-screen isolate">
      <HomeBackground />
      <Header />
      <main className="relative z-10">
        <Hero />
        <WhyBuilt />
        <Pillars />
        <BuiltBy />
        <Install />
      </main>
      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
};

export default Home;
