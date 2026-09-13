import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

const TABS = [
  {
    id: 'curl',
    label: 'One-liner (curl)',
    cmd: 'curl -fsSL https://get.kaioken.dev/install.sh | sh',
    info: 'Installs the static binary, configures Tree-sitter parsers, and binds to your shell PATH automatically.',
  },
  {
    id: 'cargo',
    label: 'cargo install',
    cmd: 'cargo install kaioken-cli --locked',
    info: 'Builds Kaioken from source using the Rust compiler with native CPU AVX2 SIMD acceleration.',
  },
  {
    id: 'npm',
    label: 'npm / npx',
    cmd: 'npx kaioken-cli init',
    info: 'Zero-install CLI execution for Node.js, TypeScript, and modern web mono-repos.',
  },
  {
    id: 'bin',
    label: 'Direct Binaries',
    cmd: 'curl -LO https://github.com/kaioken-ai/releases/latest/kaioken-universal.tar.gz',
    info: 'Precompiled, standalone executables for macOS (Universal), Linux (x86_64/ARM64), and Windows (x64).',
  },
];

export const InstallMatrix: React.FC = () => {
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(activeTab.cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="k-section" id="install">
      <div className="k-container">
        <div className="k-section-header" style={{ textAlign: 'center', marginLeft: 'auto', marginRight: 'auto' }}>
          <div className="k-kicker">// GET STARTED</div>
          <h2 className="k-title">Deploy in under thirty seconds.</h2>
          <p className="k-desc">
            Kaioken is distributed as a single zero-dependency static binary.
            No Docker daemon, no remote server, no subscription key required.
          </p>
        </div>

        <div className="k-install-box">
          <div className="k-install-tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`k-install-tab ${t.id === activeTab.id ? 'k-install-tab--active' : ''}`}
                onClick={() => setActiveTab(t)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="k-install-body">
            <div className="k-install-cmd">
              <code>{activeTab.cmd}</code>
              <button
                type="button"
                className="k-cli-copy"
                onClick={handleCopy}
                title="Copy command"
              >
                {copied ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <p className="k-install-info">{activeTab.info}</p>
          </div>
        </div>
      </div>
    </section>
  );
};
