import React from 'react';
import { ArrowUpRight } from 'lucide-react';

export const SiteNav: React.FC = () => {
  return (
    <header className="k-nav-wrap">
      <nav className="k-nav-bar" aria-label="Main Navigation">
        <a href="#hero" className="k-nav-logo">
          KAIOKEN
        </a>

        <div className="k-nav-links">
          <a href="#pillars" className="k-nav-link">
            Pillars
          </a>
          <a href="#comparison" className="k-nav-link">
            Comparison
          </a>
          <a href="#metrics" className="k-nav-link">
            Metrics
          </a>
          <a href="#install" className="k-nav-link">
            Install
          </a>
        </div>

        <a href="#install" className="k-btn k-btn--primary">
          <span>Get Started</span>
          <ArrowUpRight size={13} />
        </a>
      </nav>
    </header>
  );
};
