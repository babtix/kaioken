import React, { useState } from 'react';
import { Copy, Check, ExternalLink, Monitor, Terminal } from 'lucide-react';
import { Link } from 'react-router-dom';
import SectionHeading from './SectionHeading.tsx';

const REPO_URL = 'https://github.com/babtix/kaioken';

export const Install: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText('git clone https://github.com/babtix/kaioken.git');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="install" className="section border-t border-[var(--rule)] py-20 sm:py-28">
      <div className="wrap">
        <SectionHeading
          index="05"
          eyebrow="get started"
          title={
            <>
              Clone the engine. <span className="serif">Inspect the code.</span>
            </>
          }
          description="Kaioken is open-source software built with TypeScript and Node.js. Run it locally, connect your preferred LLM provider, and index your repos in seconds."
        />

        {/* Clone / Repository Pane */}
        <div className="mt-10 overflow-hidden rounded-lg border border-[var(--rule-strong)] bg-[var(--surface-1)]">
          <div className="flex items-center justify-between border-b border-[var(--rule)] bg-[var(--bg-raise)] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Terminal className="size-3.5 text-[var(--accent)]" />
              <span className="font-mono text-[11px] tracking-wider text-[var(--fg-mute)] uppercase">
                quick_setup.sh
              </span>
            </div>
            <span className="font-mono text-[11px] text-[var(--fg-mute)]">
              NODE 22+ REQUIRED
            </span>
          </div>

          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="font-mono text-[13.5px] text-[var(--fg)]">
              <span className="text-[var(--accent)] select-none mr-2">$</span>
              <span className="text-[var(--fg-1)]">git clone </span>
              <span className="text-[var(--accent)]">https://github.com/babtix/kaioken.git</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`btn btn--sm ${copied ? 'btn--primary' : ''}`}
                onClick={handleCopy}
                aria-label="Copy clone command"
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                <span>{copied ? 'Copied' : 'Copy command'}</span>
              </button>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--sm btn--primary"
              >
                <span>View on GitHub</span>
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
        </div>

        {/* Discrete Desktop App Mention (Link, not full presentation) */}
        <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-lg border border-[var(--rule)] bg-[var(--surface-base)] p-4 sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-3">
            <div className="rounded border border-[var(--rule)] bg-[var(--surface-1)] p-2">
              <Monitor className="size-4 text-[var(--accent)]" />
            </div>
            <div>
              <p className="font-sans text-[13.5px] font-medium text-[var(--fg)]">
                Prefer a graphical desktop workspace?
              </p>
              <p className="font-sans text-[12px] text-[var(--fg-mute)]">
                Kaioken also includes a dedicated 12-surface Desktop GUI for deep repo exploration.
              </p>
            </div>
          </div>

          <Link
            to="/desktop"
            className="btn btn--sm font-mono text-[12px] whitespace-nowrap"
          >
            <span>Explore Desktop App</span>
            <span className="text-[var(--accent)]">→</span>
          </Link>
        </div>

        <p className="mt-6 font-mono text-[11.5px] text-[var(--fg-mute)] text-center">
          Licensed under License Zero Noncommercial (L0-NC) · Single-binary Go (v1.3.4) → TypeScript (v2.0.0) · Docs, issues, and releases at{' '}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--fg-1)] underline hover:text-[var(--accent)]"
          >
            github.com/babtix/kaioken
          </a>
        </p>
      </div>
    </section>
  );
};

export default Install;
