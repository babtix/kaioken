import React from 'react';
import SectionHeading from './SectionHeading.tsx';
import { Binary, GitGraph, ShieldCheck } from 'lucide-react';

interface Pillar {
  num: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  badgeLeft: string;
  badgeRight: string;
}

const PILLARS: Pillar[] = [
  {
    num: '01',
    icon: <ShieldCheck className="size-5 text-[var(--accent)]" />,
    title: 'Auto-Test + Fix Gate (verify)',
    desc: 'An AI coding agent that runs locally in your terminal. Discovers native test suites (npm test, go test, cargo test) and auto-repairs code iteratively until every test passes.',
    badgeLeft: 'NATIVE TEST GATE',
    badgeRight: 'AUTO-FIX // VERIFY',
  },
  {
    num: '02',
    icon: <GitGraph className="size-5 text-[var(--accent)]" />,
    title: 'Isolated Sub-Agents on Worktrees (delegate)',
    desc: 'Spawns autonomous sub-agents on dedicated Git worktrees. Run complex multi-file tasks in parallel without dirtying your active working directory or causing git collisions.',
    badgeLeft: 'GIT WORKTREES',
    badgeRight: 'ISOLATION // DELEGATE',
  },
  {
    num: '03',
    icon: <Binary className="size-5 text-[var(--ember)]" />,
    title: 'Knowledge Engine & Cited Research (hub & publish)',
    desc: 'Tracks multi-repo documentation staleness with hub, exports static wikis with publish, and synthesizes deep research with cited answers grounded in immutable AST declarations.',
    badgeLeft: 'MULTI-REPO HUB',
    badgeRight: 'CITED // PUBLISH',
  },
];

export const Pillars: React.FC = () => {
  return (
    <section id="pillars" className="section border-t border-[var(--rule)] py-20 sm:py-28">
      <div className="wrap">
        <SectionHeading
          index="02"
          eyebrow="architectural pillars"
          title={
            <>
              Engineered for <span className="serif">absolute certainty.</span>
            </>
          }
          description="Production codebases cannot tolerate fuzzy semantic hallucinations. Kaioken establishes an uncompromising bridge between LLMs and compiler invariants."
        />

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div
              key={p.num}
              className="group flex flex-col justify-between rounded-lg border border-[var(--rule)] bg-[var(--surface-base)] p-6 transition-all hover:border-[var(--rule-strong)] hover:bg-[var(--surface-1)]"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[12px] font-bold text-[var(--accent)]">
                    §{p.num}
                  </span>
                  <div className="rounded-md border border-[var(--rule)] bg-[var(--surface-1)] p-2">
                    {p.icon}
                  </div>
                </div>

                <h3 className="mt-5 font-sans text-[17px] font-semibold tracking-tight text-[var(--fg)]">
                  {p.title}
                </h3>

                <p className="mt-3 font-sans text-[13.5px] leading-relaxed text-[var(--fg-2)]">
                  {p.desc}
                </p>
              </div>

              <div className="mt-8 flex items-center justify-between border-t border-[var(--rule)] pt-4 font-mono text-[10.5px] tracking-wider text-[var(--fg-mute)] uppercase">
                <span className="text-[var(--fg-1)]">{p.badgeLeft}</span>
                <span className="text-[var(--accent)]">{p.badgeRight}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Pillars;
