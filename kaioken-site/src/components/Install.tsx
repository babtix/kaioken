import React, { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

const REPO_URL = 'https://github.com/babtix/kaioken';

export const Install: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(REPO_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="install" className="section">
      <div className="wrap">
        <div className="head">
          <span className="head-num">§05</span>
          <h2 className="head-title">Install</h2>
          <span className="head-note">source & releases</span>
        </div>

        <p className="lead prose mx-lead">
          Kaioken is open-source software built with TypeScript and Node.js.
          Clone the repository, inspect the code, or follow the setup instructions on GitHub.
        </p>

        <div className="caption caption--left">
          <span className="caption-text">lnk. 01 — repository</span>
        </div>

        <div className="ins">
          <div className="ins-bar">
            <span className="label">repository</span>
            <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--fg-mute)' }}>
              github.com/babtix/kaioken
            </span>
          </div>

          <div
            className="pane"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--s-4)',
              flexWrap: 'wrap',
            }}
          >
            <div className="lines">
              <span className="line" style={{ color: 'var(--accent)', fontWeight: 500 }}>
                {REPO_URL}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
              <button
                type="button"
                className={`btn btn--sm ${copied ? 'btn--primary' : ''}`}
                onClick={handleCopy}
                aria-label="Copy repository link"
                style={{ gap: '6px' }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                <span>{copied ? 'Copied' : 'Copy link'}</span>
              </button>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--sm btn--primary"
                style={{ gap: '6px' }}
              >
                <span>View on GitHub</span>
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>

        <p className="ins-foot mono">
          Requires Node.js 22+. Documentation, issues, and releases at{' '}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            github.com/babtix/kaioken
          </a>
          .
        </p>
      </div>
    </section>
  );
};
