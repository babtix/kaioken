import React from 'react';

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

interface FooterGroup {
  heading: string;
  links: FooterLink[];
}

const FOOTER_GROUPS: FooterGroup[] = [
  {
    heading: 'Product',
    links: [
      { label: 'The problem', href: '/#problem' },
      { label: 'Method', href: '/#method' },
      { label: 'Capabilities', href: '/#capabilities' },
      { label: 'Multiplier', href: '/#multiplier' },
      { label: 'Quick install', href: '/#install' },
    ],
  },
  {
    heading: 'Pages',
    links: [
      { label: 'Desktop App', href: '/desktop' },
      { label: 'Documentation', href: '/docs' },
      { label: 'Output Preview', href: '/preview' },
      { label: 'Showcase', href: '/showcase' },
      { label: 'Roadmap (Next)', href: '/next' },
    ],
  },
  {
    heading: 'Project',
    links: [
      { label: 'GitHub Repository', href: 'https://github.com/babtix/kaioken', external: true },
      { label: 'Babtix Profile', href: 'https://github.com/babtix', external: true },
      { label: 'Apache-2.0 License', href: 'https://github.com/babtix/kaioken/blob/master/LICENSE', external: true },
      { label: 'Security Policy', href: 'https://github.com/babtix/kaioken/security', external: true },
    ],
  },
];

export const Footer: React.FC = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="ftr">
      <div className="wrap">
        {/* Big Closing CTA Block */}
        <div className="ftr-hero">
          <div className="ftr-hero-left">
            <p className="label label--accent ftr-eyebrow">
              Deterministic Runtime · Zero Vector Hallucination
            </p>
            <h2 className="h2 ftr-hero-h">
              Build with certainty. <span className="serif">Without guesswork.</span>
            </h2>
            <p className="lead ftr-hero-sub">
              Kaioken grounds your autonomous coding agents in immutable compiler syntax trees.
              Runs completely locally on your hardware.
            </p>
          </div>
          <div className="ftr-hero-act">
            <a href="/#install" className="btn btn--primary ftr-btn-lg">
              Install Kaioken →
            </a>
            <a
              href="https://github.com/babtix/kaioken"
              className="btn ftr-btn-lg"
              target="_blank"
              rel="noopener noreferrer"
            >
              Star on GitHub ↗
            </a>
          </div>
        </div>

        {/* Main Footer 4-Column Grid */}
        <div className="ftr-grid">
          <div className="ftr-brand">
            <a href="/" className="fb" aria-label="Kaioken home">
              <img
                src="/kaioken-logo.png"
                alt="KAIOKEN"
                className="k-pixel-logo ftr-logo-img"
              />
              <span className="brand-ver mono">v2.0.0</span>
            </a>
            <p className="fb-tagline mono">REPOSITORY KNOWLEDGE ENGINE</p>
            <p className="fb-say">
              Parses your codebase into a structural AST index, hashes every declaration with
              SHA-256, and refuses to let an agent claim anything it cannot point at.
            </p>
            <div className="fb-badges">
              <span className="label fb-badge">v2.0.0</span>
              <span className="label fb-badge">Apache-2.0</span>
              <span className="label fb-badge">100% Local</span>
            </div>
          </div>

          {FOOTER_GROUPS.map((col) => (
            <nav key={col.heading} className="ftr-col" aria-label={col.heading}>
              <h3 className="label ftr-h">{col.heading}</h3>
              <ul className="ftr-ul">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="ftr-a"
                      target={l.external ? '_blank' : undefined}
                      rel={l.external ? 'noopener noreferrer' : undefined}
                    >
                      {l.label}
                      {l.external && <span className="ftr-ext"> ↗</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Bottom Legal & Telemetry Line */}
        <div className="ftr-end">
          <div className="ftr-end-left mono">
            <span>© {year} Babtix. All rights reserved.</span>
            <span className="ftr-dot">·</span>
            <span>Apache-2.0 Open Source</span>
          </div>
          <div className="ftr-end-right mono">
            <span className="ftr-status">
              <i className="status-dot" />
              All systems nominal
            </span>
            <span className="ftr-dot">·</span>
            <span>Built to be checked.</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
