import React from 'react';
import { ArrowDown, ExternalLink } from 'lucide-react';
import kaiokenLogo from '../assets/kaioken-logo.png';
import { KAIOKEN_LOGO_DATA_URI } from '../assets/kaiokenLogoDataUri';
import kaioPet from '../assets/kaio_pet.png';

export const Hero: React.FC = () => {
  return (
    <section className="hero bg">
      <div className="wrap hero-content-wrapper">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Left Column: Logo + Headline + Details */}
          <div className="hero-top mb-0 lg:col-span-8">
            <div className="mb-3">
              <img
                src={kaiokenLogo || KAIOKEN_LOGO_DATA_URI}
                alt="KAIOKEN"
                className="h-12 sm:h-16 md:h-20 w-auto object-contain select-none"
                style={{ imageRendering: 'pixelated' }}
                loading="eager"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src !== KAIOKEN_LOGO_DATA_URI) {
                    target.src = KAIOKEN_LOGO_DATA_URI;
                  }
                }}
              />
            </div>

            <p className="label label--accent hero-eyebrow">
              <span className="size-2 rounded-full bg-[var(--accent)] select-none" />
              <span>Terminal AI Coding Agent + Knowledge Engine · L0-NC</span>
            </p>

            <h1 className="h1 hero-h1">
              Your agent should not be able to <span className="serif">guess.</span>
            </h1>

            <p className="lead hero-sub">
              An AI coding agent that runs locally in your terminal. Auto-test+fix with native test gates (<code className="text-[var(--accent)]">verify</code>), isolated sub-agents on git worktrees (<code className="text-[var(--accent)]">delegate</code>), and an AST-grounded knowledge engine for cited answers.
            </p>

            <div className="hero-act">
              <a href="#install" className="btn btn--primary">
                Install
              </a>
              <a
                href="https://github.com/babtix/kaioken#readme"
                className="btn"
                target="_blank"
                rel="noopener noreferrer"
              >
                Read the docs
              </a>
              <a
                className="hero-repo mono flex items-center gap-1.5"
                href="https://github.com/babtix/kaioken"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>github.com/babtix/kaioken</span>
                <ExternalLink className="size-3.5 opacity-60" />
              </a>
            </div>
          </div>

          {/* Right Column: Kaio Pet Mascot */}
          <div className="flex flex-col items-center justify-center lg:col-span-4">
            <div className="relative flex flex-col items-center">
              <img
                src={kaioPet}
                alt="Kaio Pet Companion"
                className="size-52 sm:size-64 md:size-72 object-contain select-none drop-shadow-2xl"
                style={{ imageRendering: 'pixelated' }}
                loading="eager"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src !== window.location.origin + '/kaio_pet.png') {
                    target.src = '/kaio_pet.png';
                  }
                }}
              />

              <div className="mt-4 flex items-center gap-2 rounded-full border border-[var(--rule-strong)] bg-[var(--surface-1)] px-3.5 py-1.5 font-mono text-[11px] text-[var(--fg-mute)] shadow-sm backdrop-blur-md">
                <span className="size-2 rounded-full bg-[var(--accent)]" />
                <span className="tracking-wider text-[var(--fg-1)] uppercase">
                  KAIO // REPO GUARDIAN
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="hero-footer-bar">
        <div className="wrap flex items-center justify-between font-mono text-[11px] text-[var(--fg-mute)]">
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-[var(--ember)]" />
            <span className="tracking-wider uppercase">Local Agent // Go (v1.3.4) → TypeScript (v2.0.0) // L0-NC</span>
          </div>

          <a
            href="#why"
            className="flex items-center gap-1.5 transition-colors hover:text-[var(--accent)]"
          >
            <span>Scroll to explore §01 Motivation</span>
            <ArrowDown className="size-3 text-[var(--accent)]" />
          </a>
        </div>
      </div>
    </section>
  );
};

export default Hero;
