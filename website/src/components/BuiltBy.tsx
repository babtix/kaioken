import {
  ExternalLink,
  Globe,
  Mail,
  Terminal,
  ShieldCheck,
  Cpu,
  GitBranch,
} from 'lucide-react';
import SectionHeading from './SectionHeading.tsx';
import AsciiArt from './AsciiArt.tsx';
import GithubMark from './GithubMark.tsx';
import { BUILDER_ART, BUILDER_NAME, GITHUB_URL, PORTFOLIO_URL } from '../data/content.ts';

const LinkedinIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

const InstagramIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

interface ContactItem {
  label: string;
  value: string;
  href: string;
  icon: React.ReactNode;
  external?: boolean;
}

const CONTACTS: ContactItem[] = [
  {
    label: 'Portfolio',
    value: 'babtich.vercel.app',
    href: PORTFOLIO_URL,
    icon: <Globe className="size-4" />,
    external: true,
  },
  {
    label: 'GitHub',
    value: 'github.com/babtix',
    href: GITHUB_URL,
    icon: <GithubMark className="size-4" />,
    external: true,
  },
  {
    label: 'Email',
    value: 'babtichelhabib@gmail.com',
    href: 'mailto:babtichelhabib@gmail.com',
    icon: <Mail className="size-4" />,
  },
  {
    label: 'LinkedIn',
    value: 'Babtich El Habib',
    href: 'https://eh.linkedin.com/in/babtich-el-habib-890a47362',
    icon: <LinkedinIcon className="size-4" />,
    external: true,
  },
  {
    label: 'Instagram',
    value: '@pap1tx0',
    href: 'https://www.instagram.com/pap1tx0/',
    icon: <InstagramIcon className="size-4" />,
    external: true,
  },
];

const HIGHLIGHTS = [
  {
    icon: <Cpu className="size-4 text-[var(--accent)]" />,
    title: 'Go → TypeScript (v1.3.4 → v2.0.0)',
    desc: 'Originally single-binary Go, rewritten to modular TypeScript. Compact enough to run coding agents on a Raspberry Pi.',
  },
  {
    icon: <ShieldCheck className="size-4 text-[var(--ember)]" />,
    title: 'Auto-Test & Git Worktrees',
    desc: 'Local-first terminal agent with native test gates (verify) and parallel sub-agent worktree isolation (delegate).',
  },
  {
    icon: <GitBranch className="size-4 text-[var(--accent)]" />,
    title: 'Knowledge Engine & L0-NC License',
    desc: 'Built by Babtich El Habib. Multi-repo staleness tracking (hub) and static wiki export (publish) under License Zero Noncommercial (L0-NC).',
  },
];

export const BuiltBy: React.FC = () => {
  return (
    <section id="builder" className="section border-t border-[var(--rule)] py-20 sm:py-28">
      <div className="wrap">
        <SectionHeading
          index="03"
          eyebrow="built by"
          title={
            <>
              Babtich El Habib <span className="serif text-[var(--fg-mute)]">(@babtix)</span>
            </>
          }
          description="Creator, architect, and solo maintainer of Kaioken. Built out of conviction that software development requires exact mathematical certainty, not fuzzy statistical guesses."
        />

        {/* Builder ASCII Art Banner */}
        <div className="mt-10 overflow-hidden rounded-lg border border-[var(--rule-strong)] bg-[var(--surface-1)]">
          <div className="flex items-center justify-between border-b border-[var(--rule)] bg-[var(--bg-raise)] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Terminal className="size-3.5 text-[var(--accent)]" />
              <span className="font-mono text-[11px] tracking-wider text-[var(--fg-mute)] uppercase">
                author_signature.sh
              </span>
            </div>
            <span className="font-mono text-[11px] text-[var(--fg-mute)]">
              SHA-256 // VERIFIED
            </span>
          </div>
          <div className="overflow-x-auto p-4 sm:p-6 text-center">
            <AsciiArt
              art={BUILDER_ART}
              label={BUILDER_NAME}
              className="text-[5px] leading-[1.2] sm:text-[7px] md:text-[9px]"
            />
          </div>
        </div>

        {/* Creator Story & Quote */}
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Manifesto / Quote */}
          <div className="rounded-lg border border-[var(--rule)] bg-[var(--surface-base)] p-6 sm:p-8 lg:col-span-7">
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-[var(--accent)]" />
              <span className="font-mono text-[11px] tracking-[0.16em] text-[var(--accent)] uppercase font-semibold">
                Creator's Manifesto
              </span>
            </div>

            <blockquote className="mt-4 font-serif text-[19px] sm:text-[21px] leading-relaxed italic text-[var(--fg)]">
              “I built Kaioken out of pure frustration with AI agents that feel magical until you inspect what they generate and discover invented methods, phantom imports, and fabricated dependencies.
              <br /><br />
              When you have better knowledge, deep docs, and background, it makes developers, engineers, and AI agents gain fast knowledge so they can perform better. That is why I built this: to make it easy for myself first, and AI agents second. I cancelled my Claude subscription because having Kaioken is 30% cheaper for my work + deep knowledge system. And thanks to all supporters!”
            </blockquote>

            <div className="mt-6 flex items-center justify-between border-t border-[var(--rule)] pt-4">
              <div>
                <div className="font-sans text-[15px] font-semibold text-[var(--fg)]">
                  Babtich El Habib
                </div>
                <div className="font-mono text-[12px] text-[var(--fg-mute)]">
                  Founder & Systems Engineer · Kaioken
                </div>
              </div>
              <a
                href={PORTFOLIO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--sm"
              >
                <span>Portfolio</span>
                <ExternalLink className="size-3" />
              </a>
            </div>
          </div>

          {/* Contact / Links Column */}
          <div className="flex flex-col justify-between gap-4 lg:col-span-5">
            <div className="rounded-lg border border-[var(--rule)] bg-[var(--surface-base)] p-5 sm:p-6">
              <h3 className="font-mono text-[11px] tracking-[0.16em] text-[var(--fg-mute)] uppercase font-semibold">
                Direct Channels
              </h3>

              <div className="mt-4 flex flex-col divide-y divide-[var(--rule)]">
                {CONTACTS.map((c) => (
                  <a
                    key={c.label}
                    href={c.href}
                    target={c.external ? '_blank' : undefined}
                    rel={c.external ? 'noopener noreferrer' : undefined}
                    className="group flex items-center justify-between py-3 transition-colors hover:text-[var(--accent)]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[var(--fg-mute)] transition-colors group-hover:text-[var(--accent)]">
                        {c.icon}
                      </span>
                      <span className="font-sans text-[13.5px] font-medium text-[var(--fg)] group-hover:text-[var(--accent)]">
                        {c.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 font-mono text-[12px] text-[var(--fg-mute)] group-hover:text-[var(--fg)]">
                      <span>{c.value}</span>
                      {c.external && <ExternalLink className="size-3 opacity-60" />}
                    </div>
                  </a>
                ))}
              </div>
            </div>

            {/* Core Values */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:grid-cols-1">
              {HIGHLIGHTS.map((h, i) => (
                <div
                  key={i}
                  className="rounded-md border border-[var(--rule)] bg-[var(--surface-1)] p-3"
                >
                  <div className="flex items-center gap-2">
                    {h.icon}
                    <h4 className="font-sans text-[12.5px] font-semibold text-[var(--fg)]">
                      {h.title}
                    </h4>
                  </div>
                  <p className="mt-1 font-sans text-[11.5px] leading-relaxed text-[var(--fg-mute)]">
                    {h.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default BuiltBy;
