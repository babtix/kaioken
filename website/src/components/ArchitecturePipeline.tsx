import React from 'react';
import SectionHeading from './SectionHeading.tsx';
import { ExternalLink, Terminal, ShieldCheck, Cpu, GitBranch, Layers, Maximize2 } from 'lucide-react';

interface StageSummary {
  step: string;
  name: string;
  badge: string;
  desc: string;
  icon: React.ReactNode;
}

const PIPELINE_STAGES: StageSummary[] = [
  {
    step: '01',
    name: 'Offline Ingestion',
    badge: 'TREE-SITTER AST',
    desc: 'Extracts declarations, parameters, and byte spans across TS, JS, Python, Go, and Rust with zero network calls.',
    icon: <Cpu className="size-4 text-[var(--accent)]" />,
  },
  {
    step: '02',
    name: 'Grounded Generation',
    badge: 'VERIFYCORE GATE',
    desc: 'SymbolOracle provides binary existence checks. Quoted excerpts must match source bytes, blocking hallucinations.',
    icon: <ShieldCheck className="size-4 text-[var(--ember)]" />,
  },
  {
    step: '03',
    name: 'Cryptographic Provenance',
    badge: '0-TOKEN DRIFT',
    desc: 'Pins artifacts to source SHA-256 hashes. Detects codebase changes in milliseconds without spending model tokens.',
    icon: <GitBranch className="size-4 text-[var(--accent)]" />,
  },
  {
    step: '04',
    name: 'Pi Agent Bridge',
    badge: '7 TOOLS · 18 CMDS',
    desc: 'Connects directly to the Pi agentic coding harness via public seams with interactive TUI telemetry and hard test gates.',
    icon: <Terminal className="size-4 text-[var(--ember)]" />,
  },
  {
    step: '05',
    name: '5 Developer Surfaces',
    badge: 'DESIGN SYSTEM V2',
    desc: 'Powers Terminal TUI, Standalone CLI (22 cmds), Local Preview (127.0.0.1:4173), Desktop Studio, and Web Portals.',
    icon: <Layers className="size-4 text-[var(--accent)]" />,
  },
];

export const ArchitecturePipeline: React.FC = () => {
  return (
    <section id="architecture" className="section border-t border-[var(--rule)] py-20 sm:py-28">
      <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <SectionHeading
          index="02"
          eyebrow="system architecture"
          title={
            <>
              Deterministic pipeline. <span className="serif">From AST to Agent.</span>
            </>
          }
          description="Every stage operates offline with cryptographic verification. Tree-Sitter syntax indexing feeds the definitive Symbol Oracle, permanently eliminating generative hallucination before reaching the Pi Agent harness."
        />

        {/* Architecture Pipeline Canvas Frame — Always Full View */}
        <div className="mt-12 overflow-hidden rounded-lg border border-[var(--rule-strong)] bg-[var(--surface-1)]">
          {/* Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule)] bg-[var(--bg-raise)] px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5" aria-hidden="true">
                <span className="size-2.5 rounded-full bg-[var(--accent)] opacity-80" />
                <span className="size-2.5 rounded-full bg-[var(--ember)] opacity-80" />
                <span className="size-2.5 rounded-full bg-[var(--fg-mute)] opacity-50" />
              </div>
              <span className="font-mono text-[12px] font-bold tracking-wider text-[var(--fg)] uppercase">
                kaioken_pipeline.svg
              </span>
              <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--accent)]">
                FULL ARCHITECTURE VIEW
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--fg-mute)]">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>ZERO DRIFT // 0 TOKENS</span>
              </div>
              <a
                href="/assets/kaioken-pipeline.svg"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded border border-[var(--rule)] bg-[var(--surface-base)] px-2.5 py-1 font-mono text-[11px] text-[var(--fg-1)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                title="Open raw vector in new tab"
              >
                <ExternalLink className="size-3" />
                <span>Raw Vector</span>
              </a>
            </div>
          </div>

          {/* Diagram Canvas — Always Full Width */}
          <div className="relative overflow-x-auto bg-[#08080a] p-3 sm:p-6 lg:p-8">
            <div className="w-full">
              <a
                href="/assets/kaioken-pipeline.svg"
                target="_blank"
                rel="noopener noreferrer"
                title="Click to open raw high-definition SVG in new tab"
                className="group relative block w-full"
              >
                <img
                  src="/assets/kaioken-pipeline.svg"
                  alt="Kaioken Knowledge Engine Architecture: Offline Ingestion, Grounded Generation, Provenance Gates, and Agent Seams"
                  className="w-full h-auto select-none border border-[#232327] transition-all group-hover:border-[var(--accent)]"
                  loading="lazy"
                />
                <span className="absolute top-3 right-3 hidden items-center gap-1.5 rounded border border-[#33333a] bg-[#0a0a0b]/90 px-2 py-1 font-mono text-[10.5px] text-[#8e8e93] opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 sm:flex">
                  <Maximize2 className="size-3 text-[var(--accent)]" />
                  open raw vector
                </span>
              </a>
            </div>
          </div>

          {/* Architectural Stage Cards */}
          <div className="grid grid-cols-1 divide-y divide-[var(--rule)] border-t border-[var(--rule)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-5">
            {PIPELINE_STAGES.map((s) => (
              <div key={s.step} className="flex flex-col justify-between p-4 sm:p-5 bg-[var(--surface-base)]">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-bold text-[var(--accent)]">
                      §{s.step}
                    </span>
                    <div className="rounded p-1 bg-[var(--surface-1)] border border-[var(--rule)]">
                      {s.icon}
                    </div>
                  </div>
                  <h4 className="mt-3 font-sans text-[14px] font-semibold text-[var(--fg)]">
                    {s.name}
                  </h4>
                  <p className="mt-1.5 font-sans text-[12px] leading-relaxed text-[var(--fg-2)]">
                    {s.desc}
                  </p>
                </div>
                <div className="mt-4 border-t border-[var(--rule)] pt-2.5">
                  <span className="font-mono text-[9.5px] tracking-wider text-[var(--fg-mute)] uppercase">
                    {s.badge}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ArchitecturePipeline;
