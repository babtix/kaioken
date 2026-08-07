import { ArrowRight } from "lucide-react"
import { Link } from "react-router-dom"
import { Smartphone, Terminal } from "lucide-react"
import AsciiArt from "@/components/AsciiArt"
import GithubMark from "@/components/GithubMark"
import LinkButton from "@/components/LinkButton"
import { BUILDER_ART, BUILDER_NAME, GITHUB_URL, NEWS_URL, PROVIDERS } from "@/data/content"
import { setLayoutOverride, useLayoutOverride } from "@/lib/viewport"

const COLUMNS: { heading: string; links: { label: string; to: string; external?: boolean }[] }[] = [
  {
    heading: "docs",
    links: [
      { label: "Install", to: "/docs/install" },
      { label: "The TUI", to: "/docs/tui" },
      { label: "Commands", to: "/docs/commands" },
      { label: "Configuration", to: "/docs/config" },
    ],
  },
  {
    heading: "engine",
    links: [
      { label: "Deep wiki", to: "/docs/wiki" },
      { label: "Knowledge cards", to: "/docs/cards" },
      { label: "Skills", to: "/docs/skills" },
      { label: "Incremental updates", to: "/docs/update" },
    ],
  },
  {
    heading: "project",
    links: [
      { label: "Desktop app", to: "/desktop" },
      { label: "News", to: NEWS_URL, external: true },
      { label: "Generated output", to: "/preview" },
      { label: "Showcase", to: "/showcase" },
      { label: "Output layout", to: "/docs/output" },
      { label: "Source", to: GITHUB_URL, external: true },
    ],
  },
]

export default function SiteFooter() {
  // Only someone who pinned this layout from the phone site sees a way back —
  // otherwise the viewport decides and the control would be noise.
  const override = useLayoutOverride()

  return (
    <footer className="relative border-t border-border">
      {/* ── CTA strip ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-border bg-kai-panel/30 py-16 sm:py-20">
        {/* Ambient bloom */}
        <div
          className="kai-bloom animate-bloom pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-56 w-96 opacity-20"
          style={{ background: "var(--kai-orange)" }}
          aria-hidden
        />
        <div className="rule-sweep absolute inset-x-0 top-0 h-px" aria-hidden />

        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6">
          <p className="font-mono text-[11px] tracking-[0.3em] text-kai-dim uppercase">
            ready when you are
          </p>
          <h2 className="mx-auto mt-4 max-w-2xl text-balance font-mono text-3xl font-bold text-foreground sm:text-4xl">
            Point it at a repo and{" "}
            <span className="text-kai-orange glow-orange">read what comes back</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl font-sans text-[15px] leading-relaxed text-muted-foreground">
            The scan is free, the plan is a file you can edit, and the cost estimate prints before
            anything expensive runs.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <LinkButton to="/docs/install" size="lg" className="btn-glow rounded-md px-8 text-[15px]">
              Start here
              <ArrowRight className="size-4" data-icon="inline-end" />
            </LinkButton>
            <LinkButton
              href={GITHUB_URL}
              variant="outline"
              size="lg"
              className="rounded-md px-8 text-[15px] transition-all hover:border-kai-orange/40 hover:bg-kai-orange/5"
            >
              <GithubMark data-icon="inline-start" />
              Read the source
            </LinkButton>
          </div>
        </div>
      </div>

      {/* ── Main footer ───────────────────────────────────────────────── */}
      <div className="bg-kai-panel/20">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
            <div>
              <div className="flex items-center gap-2">
                <Terminal className="size-4 text-kai-orange" />
                <span className="font-mono text-sm font-bold text-foreground">kaioken</span>
              </div>
              <p className="mt-3 max-w-xs font-sans text-sm leading-relaxed text-muted-foreground">
                A single Go binary with two faces: a chat agent that edits your repo behind diff
                approval, and a knowledge engine that documents it.
              </p>
              <p className="mt-4 font-mono text-[11px] leading-relaxed text-kai-dim">
                {PROVIDERS.join(" · ")}
              </p>
            </div>

            {COLUMNS.map((col) => (
              <div key={col.heading}>
                <h3 className="font-mono text-[11px] tracking-[0.25em] text-kai-amber uppercase">
                  {col.heading}
                </h3>
                <ul className="mt-4 space-y-2">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      {link.external ? (
                        <a
                          href={link.to}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block py-1 font-mono text-[13px] text-muted-foreground transition-colors hover:text-kai-orange"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          to={link.to}
                          className="block py-1 font-mono text-[13px] text-muted-foreground transition-colors hover:text-kai-orange"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* builder credit */}
          <div className="mt-12 rounded-md border border-border/60 bg-kai-panel/40 px-6 py-8 text-center">
            <p className="font-mono text-[10px] tracking-[0.35em] text-kai-dim uppercase">
              built by
            </p>
            <AsciiArt
              art={BUILDER_ART}
              label={BUILDER_NAME}
              className="mt-3 text-[4px] sm:text-[8px] md:text-[10px] lg:text-[13px]"
            />
            {/* contact links */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <a
                href="https://github.com/babtix"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-mono text-[11px] text-kai-dim transition-all hover:border-kai-orange/40 hover:text-kai-orange hover:bg-kai-orange/5"
              >
                <GithubMark className="size-3" />
                GitHub
              </a>
              <a
                href="mailto:babtichelhabib@gmail.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-mono text-[11px] text-kai-dim transition-all hover:border-kai-orange/40 hover:text-kai-orange hover:bg-kai-orange/5"
              >
                ✉ Email
              </a>
              <a
                href="https://eh.linkedin.com/in/babtich-el-habib-890a47362"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-mono text-[11px] text-kai-dim transition-all hover:border-kai-blue/40 hover:text-kai-blue hover:bg-kai-blue/5"
              >
                in LinkedIn
              </a>
              <a
                href="https://www.instagram.com/pap1tx0/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-mono text-[11px] text-kai-dim transition-all hover:border-kai-rose/40 hover:text-kai-rose hover:bg-kai-rose/5"
              >
                ○ Instagram
              </a>
              <span
                className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 font-mono text-[11px] text-kai-dim/50 cursor-default"
                title="Coming soon"
              >
                ○ Portfolio
              </span>
            </div>
            {/* discrete background preview link */}
            <div className="mt-6">
              <Link
                to="/desktop-bg-preview"
                className="font-mono text-[9px] text-kai-dim/30 hover:text-kai-dim transition-colors"
                title="Desktop Background Preview Gallery"
              >
                bg gallery
              </Link>
            </div>
          </div>

          {override === "desktop" ? (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => setLayoutOverride(null)}
                className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 font-mono text-[11.5px] text-muted-foreground transition-colors hover:border-kai-orange/40 hover:text-kai-orange"
              >
                <Smartphone className="size-3.5" />
                Back to the phone site
              </button>
            </div>
          ) : null}

          <div className="mt-8 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[11px] text-kai-dim">
              <span className="text-kai-green">$</span> built for terminals · MIT
            </p>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 font-mono text-[11px] text-kai-dim transition-colors hover:text-kai-orange"
            >
              <GithubMark className="size-3.5" />
              github.com/babtix/kaioken
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
