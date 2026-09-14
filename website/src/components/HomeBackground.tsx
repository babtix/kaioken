import React from 'react';
import homeBg from '../assets/home-bg.jpg';

export const HomeBackground: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none"
    >
      {/* Blurred wallpaper background image */}
      <div
        className="home-bg-layer absolute -inset-[40px] bg-cover bg-center bg-no-repeat transition-all duration-700"
        style={{
          backgroundImage: `url(${homeBg})`,
          filter: 'blur(14px)',
          transform: 'scale(1.06)',
          opacity: 0.94,
        }}
      />

      {/* Dark contrast scrim to keep code and text crisp */}
      <div className="home-bg-overlay absolute inset-0 bg-black/35" />

      {/* Subtle depth vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(130% 90% at 50% 30%, transparent 30%, rgba(8, 8, 10, 0.5) 70%, rgba(8, 8, 10, 0.88) 100%)',
        }}
      />

      {/* Hairline technical grid overlay */}
      <div className="tech-grid-bg absolute inset-0 opacity-20" />

      {/* Light theme adaptation */}
      <div className="home-bg-light-scrim pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300" />
    </div>
  );
};

export default HomeBackground;
