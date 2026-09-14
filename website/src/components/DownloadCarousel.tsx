import React from 'react';
import { OS_DOWNLOADS } from '../data/content.ts';
import { DragCarousel, DragSlideItem } from './DragCarousel.tsx';

export const DownloadCarousel: React.FC = () => {
  const downloadSlides: DragSlideItem[] = OS_DOWNLOADS.map((item) => ({
    id: item.os.toLowerCase(),
    num: item.os.toUpperCase(),
    title: item.os,
    description: item.version,
    image: item.art,
    webp1200: item.webp1200,
    webp600: item.webp600,
    chips: item.chips,
    href: item.href,
    buttonText: item.buttonText,
  }));

  return (
    <section className="k-downloads-section k-section--paper" id="downloads">
      <div>
        <p className="k-label k-label--dim">// CROSS-PLATFORM RUNTIME</p>
        <h2 className="k-downloads-headline">
          <span>BUILT FOR </span>
          <span className="dim-text">EVERY MACHINE</span>
        </h2>
      </div>

      {/* Drag Carousel with chips row */}
      <DragCarousel slides={downloadSlides} variant="chips" loop={false} />
    </section>
  );
};
