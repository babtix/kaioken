import * as React from "react"
import { ArrowRight, ChevronDown, Construction, Terminal } from "lucide-react"
import BackToTop from "@/components/BackToTop"
import Icon from "@/components/Icon"
import DesktopBodyBackground from "@/components/DesktopBodyBackground"
import Reveal from "@/components/Reveal"
import { StickySectionHeader } from "@/components/SectionHeading"
import SectionNav from "@/components/SectionNav"
import LinkButton from "@/components/LinkButton"
import CodeBlock from "@/components/CodeBlock"
import GithubMark from "@/components/GithubMark"
import { scrollToAnchor } from "@/lib/scroll"
import { cn } from "@/lib/utils"
import {
  SURFACES,
  LAYERS,
  COMPARISON,
  PRINCIPLES,
  SHORTCUT_GROUPS,
  PLATFORMS,
  DESKTOP_REPO_PATH,
  DISTRIBUTION_NOTE,
  BUILD_STEPS,
  CURL_PROOF,
} from "@/data/desktop"
import FaultyTerminal from "@/bits/FaultyTerminal"

function DesktopHeroBackground() {
  const [isLight, setIsLight] = React.useState(() => {
    return typeof document !== "undefined" && document.documentElement.dataset.theme === "light"
  })

  React.useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => {
      setIsLight(root.dataset.theme === "light")
    })
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] })
    return () => observer.disconnect()
  }, [])

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-background">
      {/* Underlying hairline grid */}
      <div className="tech-grid-bg absolute inset-0 opacity-40" />

      {/* WebGL FaultyTerminal Cyber Terminal Matrix */}
      <div className="absolute inset-0 opacity-50 transition-opacity duration-300">
        <FaultyTerminal
          scale={1.5}
          gridMul={[2, 1]}
          digitSize={1.2}
          timeScale={0.7}
          pause={false}
          scanlineIntensity={0.6}
          glitchAmount={1}
          flickerAmount={0.7}
          noiseAmp={1}
          chromaticAberration={0}
          dither={0}
          curvature={0.06}
          tint="#ff7a00"
          mouseReact={true}
          mouseStrength={0.45}
          pageLoadAnimation={false}
          brightness={0.75}
          lightMode={isLight}
          fps={30}
          resolutionScale={0.7}
        />
      </div>

      {/* Vignette & contrast gradations to keep content crisp and legible */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-background/90" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.55)_0%,transparent_65%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.65)_0%,transparent_65%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.85)_100%)] dark:bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.92)_100%)]" />
    </div>
  )
}

/* ── tone color mapping ──────────────────────────────────────────────────── */

const toneBg: Record<string, string> = {
  orange: "bg-kai-orange/10 border-kai-orange/30",
  amber: "bg-kai-amber/10 border-kai-amber/30",
  blue: "bg-kai-blue/10 border-kai-blue/30",
  green: "bg-kai-green/10 border-kai-green/30",
  sage: "bg-kai-sage/10 border-kai-sage/30",
}

const toneText: Record<string, string> = {
  orange: "text-kai-orange",
  amber: "text-kai-amber",
  blue: "text-kai-blue",
  green: "text-kai-green",
  sage: "text-kai-sage",
}

/** The ring a selected card wears — brighter than its resting border. */
const toneRing: Record<string, string> = {
  orange: "border-kai-orange/70 ring-1 ring-kai-orange/40",
  amber: "border-kai-amber/70 ring-1 ring-kai-amber/40",
  blue: "border-kai-blue/70 ring-1 ring-kai-blue/40",
  green: "border-kai-green/70 ring-1 ring-kai-green/40",
  sage: "border-kai-sage/70 ring-1 ring-kai-sage/40",
}

const SECTIONS = [
  { id: "surfaces", label: "surfaces" },
  { id: "architecture", label: "architecture" },
  { id: "comparison", label: "honestly" },
  { id: "principles", label: "principles" },
  { id: "shortcuts", label: "shortcuts" },
  { id: "platforms", label: "platforms" },
  { id: "build", label: "build" },
]

/** Every section shares the same rhythm, so it lives in one place.
 *  scroll-mt is deliberately small: html already carries scroll-padding-top,
 *  and the two add up — this is just the extra the sticky section nav needs. */
const SECTION = "scroll-mt-24 border-t border-[var(--rule)] pb-16 sm:pb-24"

export default function Desktop() {
  // Clicking a surface card opens its detail below the grid — twelve screens
  // is too many to describe in place, and a tooltip is not readable on touch.
  const [surfaceLabel, setSurfaceLabel] = React.useState(SURFACES[0].label)
  const surface = SURFACES.find((s) => s.label === surfaceLabel) ?? SURFACES[0]

  return (
    <>
      {/* ── hero — full screen takeover on landing with CRT background ───── */}
      <section className="relative isolate z-10 flex min-h-[100dvh] flex-col justify-between overflow-hidden pt-14 bg-background">
        <DesktopHeroBackground />

        {/* Subtle background overlay */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-background/40 via-transparent to-background/70"
        />

        {/* Vertically centered main hero content */}
        <div className="mx-auto flex flex-1 w-full max-w-7xl items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
          <div className="animate-rise flex w-full flex-col items-center text-center">
            {/* DESKTOP APP Logo */}
            <div className="mx-auto flex w-full max-w-full items-center justify-center px-2 select-none">
              <img
                src="/desktop-app-logo.png"
                alt="DESKTOP APP"
                className="h-auto w-full max-w-[1040px] sm:max-w-[1120px] lg:max-w-[1220px] object-contain"
                loading="eager"
              />
            </div>

            {/* Still Under Reconstruction Status Notice */}
            <div className="mt-4 flex items-center justify-center">
              <div className="inline-flex items-center gap-2 rounded-sm border border-kai-amber/40 bg-kai-amber/10 px-3.5 py-1.5 font-mono text-[11px] sm:text-[12px] tracking-[0.16em] text-kai-amber uppercase backdrop-blur-sm shadow-sm">
                <Construction className="size-4 shrink-0 text-kai-amber animate-pulse" />
                <span className="font-semibold">Still under re-construction</span>
                <span className="hidden sm:inline text-kai-amber/60">▎</span>
                <span className="hidden sm:inline font-normal text-kai-amber/80 text-[10.5px]">v2.0 Active Rewrite</span>
              </div>
            </div>

            <p className="mx-auto mt-6 max-w-xl font-sans text-[15px] font-medium leading-relaxed text-balance text-foreground/90 sm:text-[16px]">
              The CLI in a window. Diffs you can read, a wiki you can browse, runs you can watch.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
              <LinkButton
                href={DESKTOP_REPO_PATH}
                size="lg"
                className="shadow-sm"
              >
                <GithubMark data-icon="inline-start" />
                View source
              </LinkButton>
              <LinkButton
                to="/docs/install"
                variant="outline"
                size="lg"
                className="border-border/80 bg-background/50 backdrop-blur-sm hover:border-kai-orange/40 hover:bg-card/60"
              >
                <Terminal className="size-4" data-icon="inline-start" />
                Get the CLI first
                <ArrowRight data-icon="inline-end" />
              </LinkButton>
            </div>
          </div>
        </div>

        {/* Bottom anchor — Sleek explore cue taking you to surfaces */}
        <div className="pb-6 pt-2 text-center">
          <a
            href="#surfaces"
            onClick={(e) => scrollToAnchor(e, "surfaces")}
            className="group inline-flex flex-col items-center gap-1.5 font-mono text-[10px] tracking-widest text-kai-dim uppercase transition-colors hover:text-kai-orange"
          >
            <span className="opacity-80 transition-opacity group-hover:opacity-100">Explore Surfaces</span>
            <ChevronDown className="size-4 animate-bounce text-kai-orange" />
          </a>
        </div>
      </section>

      {/* ── rest of the page — backed by blurred wallpaper (same as home) ── */}
      <div className="relative isolate z-0">
        <DesktopBodyBackground />
        <div className="relative z-10">
          <SectionNav items={SECTIONS} />

          {/* ── surfaces — pick one, read it ──────────────────────────────────── */}
          <section id="surfaces" className={SECTION}>
        <StickySectionHeader
          index="01"
          eyebrow="surfaces"
          title={<>Twelve screens, <span className="serif">one rail.</span></>}
          description="Pick one to read what it actually does."
        />

        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-8">
          <Reveal delay={0.05}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SURFACES.map((s) => {
                const isActive = s.label === surface.label
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setSurfaceLabel(s.label)}
                    aria-pressed={isActive}
                    aria-controls="surface-detail"
                    className={cn(
                      "lift glass rounded-md p-4 text-left",
                      "focus-visible:ring-1 focus-visible:ring-kai-orange/60 focus-visible:outline-none",
                      isActive ? toneRing[s.tone] : "hover:bg-accent/40"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Icon name={s.icon} className={cn("size-4 shrink-0", toneText[s.tone])} />
                      <h3 className="font-mono text-[13px] font-bold text-foreground">{s.label}</h3>
                      {s.key ? (
                        <kbd className="ml-auto rounded-sm border border-border px-1 py-px text-[9px] whitespace-nowrap text-kai-dim">
                          {s.key}
                        </kbd>
                      ) : null}
                    </div>
                    <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                      {s.headline}
                    </p>
                  </button>
                )
              })}
            </div>
          </Reveal>

          {/* the detail for whichever card is selected — keyed so it replays */}
          <div
            id="surface-detail"
            key={surface.label}
            aria-live="polite"
            className={cn(
              "animate-rise mt-4 grid gap-6 rounded-md border bg-card/60 p-5 backdrop-blur-sm lg:grid-cols-[1.4fr_1fr]",
              toneBg[surface.tone]
            )}
          >
            <div>
              <div className="flex items-center gap-2">
                <Icon name={surface.icon} className={cn("size-4", toneText[surface.tone])} />
                <h3 className={cn("font-mono text-sm font-bold", toneText[surface.tone])}>
                  {surface.label}
                </h3>
                {surface.key ? (
                  <kbd className="rounded-sm border border-border bg-background px-1.5 py-px font-mono text-[10px] text-kai-dim">
                    {surface.key}
                  </kbd>
                ) : null}
              </div>
              <p className="mt-2 font-mono text-[13px] font-semibold text-foreground">
                {surface.headline}
              </p>
              <p className="mt-3 font-sans text-sm leading-relaxed text-muted-foreground">
                {surface.body}
              </p>
            </div>
            <ul className="space-y-2 border-t border-border/60 pt-4 font-sans text-[13px] leading-relaxed text-muted-foreground lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
              {surface.points.map((p) => (
                <li key={p} className="flex gap-2">
                  <span className="font-mono text-kai-orange select-none" aria-hidden>
                    ▸
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── architecture — the stack, top to bottom ───────────────────────── */}
      <section id="architecture" className={SECTION}>
        <StickySectionHeader
          index="02"
          eyebrow="architecture"
          title={<>Four layers, <span className="serif">no rewrite.</span></>}
          description="Top is what you look at, bottom is what everything agrees on."
        />

        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {LAYERS.map((layer, i) => (
              <Reveal key={layer.id} delay={i * 0.06}>
                <div
                  className={cn(
                    "lift flex h-full flex-col rounded-md border p-4 backdrop-blur-sm",
                    toneBg[layer.tone]
                  )}
                >
                  <div className="flex items-baseline gap-2">
                    <span className={cn("font-mono text-2xl font-bold", toneText[layer.tone])}>
                      {i + 1}
                    </span>
                    {i < LAYERS.length - 1 ? (
                      <span className="ml-auto font-mono text-[10px] text-kai-dim" aria-hidden>
                        ↓
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-1 font-mono text-[13px] font-bold text-foreground">
                    {layer.title}
                  </h3>
                  <p className="mt-0.5 font-mono text-[10px] text-kai-dim">{layer.subtitle}</p>
                  <p className="mt-3 font-sans text-[12px] leading-relaxed text-muted-foreground">
                    {layer.detail}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-1 pt-4">
                    {layer.parts.map((p) => (
                      <span
                        key={p}
                        className={cn(
                          "rounded-sm border px-1 py-px font-mono text-[9px]",
                          toneBg[layer.tone],
                          toneText[layer.tone]
                        )}
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── comparison — table on desktop, stacked cards on phones ────────── */}
      <section id="comparison" className={SECTION}>
        <StickySectionHeader
          index="03"
          eyebrow="honestly"
          title={<>GUI wins — <span className="serif">and when it doesn't.</span></>}
          description="Two rows go to the terminal, and they are the two that matter on a server."
        />

        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-8">
          <Reveal delay={0.05}>
            {/* ≥sm: the full table */}
            <table className="hidden w-full border-collapse text-sm sm:table">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2.5 pr-3 text-left font-mono text-[10px] tracking-wider text-kai-dim uppercase">Job</th>
                  <th className="px-3 py-2.5 text-left font-mono text-[10px] tracking-wider text-kai-dim uppercase">TUI</th>
                  <th className="px-3 py-2.5 text-left font-mono text-[10px] tracking-wider text-kai-dim uppercase">Desktop</th>
                  <th className="py-2.5 pl-3 text-right font-mono text-[10px] tracking-wider text-kai-dim uppercase">Wins</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.job} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-3.5 pr-3 font-mono text-[12px] font-medium text-foreground">
                      {row.job}
                    </td>
                    <td className="px-3 py-3.5 font-mono text-[11px] text-muted-foreground">
                      {row.tui}
                    </td>
                    <td className="px-3 py-3.5 font-mono text-[11px] text-muted-foreground">
                      {row.desktop}
                    </td>
                    <td className="py-3.5 pl-3 text-right">
                      <WinnerBadge winner={row.winner} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* <sm: stacked cards */}
            <div className="space-y-3 sm:hidden">
              {COMPARISON.map((row) => (
                <div key={row.job} className="rounded-md border border-border bg-card/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[12px] font-semibold text-foreground">
                      {row.job}
                    </span>
                    <WinnerBadge winner={row.winner} />
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 font-mono text-[11px]">
                    <div>
                      <dt className="text-[9px] text-kai-dim uppercase">TUI</dt>
                      <dd className="text-muted-foreground">{row.tui}</dd>
                    </div>
                    <div>
                      <dt className="text-[9px] text-kai-dim uppercase">Desktop</dt>
                      <dd className="text-muted-foreground">{row.desktop}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── principles ────────────────────────────────────────────────────── */}
      <section id="principles" className={SECTION}>
        <StickySectionHeader
          index="04"
          eyebrow="principles"
          title={<>Built <span className="serif">this way.</span></>}
          description="Four commitments the app is allowed to be judged against."
        />

        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.title} delay={i * 0.05}>
                <div className="lift h-full rounded-md border border-border bg-card/60 p-4 backdrop-blur-sm hover:border-kai-orange/40">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-sm border border-kai-orange/25 bg-kai-orange/10">
                      <Icon name={p.icon} className="size-3.5 text-kai-orange" />
                    </span>
                    <h3 className="font-mono text-[12px] font-bold text-foreground">{p.title}</h3>
                  </div>
                  <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">{p.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── shortcuts ─────────────────────────────────────────────────────── */}
      <section id="shortcuts" className={SECTION}>
        <StickySectionHeader
          index="05"
          eyebrow="shortcuts"
          title={<><span className="serif">Keyboard-first.</span></>}
          description="Every surface, every dialog and the terminal, without reaching for the mouse."
        />

        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SHORTCUT_GROUPS.map((g, i) => (
              <Reveal key={g.group} delay={i * 0.05}>
                <div className="h-full rounded-md glass p-3.5 transition-all duration-300 hover:border-kai-amber/40 shadow-sm dark:shadow-none">
                  <h4 className="font-mono text-[10px] tracking-wider text-kai-amber uppercase">{g.group}</h4>
                  <div className="mt-2 divide-y divide-border/50">
                    {g.items.map((item) => (
                      <div
                        key={item.keys}
                        className="group flex items-center justify-between gap-3 py-1.5"
                      >
                        <span className="text-[11px] text-muted-foreground transition-colors group-hover:text-kai-text">
                          {item.label}
                        </span>
                        <kbd className="shrink-0 rounded-sm border border-border bg-background px-1.5 py-px font-mono text-[9.5px] whitespace-nowrap text-kai-dim transition-colors group-hover:border-kai-amber/40 group-hover:text-kai-amber">
                          {item.keys}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── platforms ──────────────────────────────────────────────────────── */}
      <section id="platforms" className={SECTION}>
        <StickySectionHeader
          index="06"
          eyebrow="platforms"
          title={<><span className="serif">Three platforms,</span> three commands</>}
          description="Native feel and system integration on macOS, Linux, and Windows."
        />

        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-8">
          <div className="grid gap-3 sm:grid-cols-3">
            {PLATFORMS.map((p, i) => (
              <Reveal key={p.id} delay={i * 0.06}>
                <div className="lift h-full rounded-md border border-border bg-card/60 p-4 backdrop-blur-sm hover:border-kai-orange/40">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[13px] text-kai-dim" aria-hidden>
                      {PLATFORM_GLYPH[p.id]}
                    </span>
                    <h3 className="font-mono text-sm font-bold text-foreground">{p.label}</h3>
                  </div>
                  <p className="mt-2 font-mono text-[11px] text-kai-amber">{p.artifacts}</p>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{p.note}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.05}>
            <p className="mt-6 rounded-md border border-kai-amber/25 bg-kai-amber/[0.06] p-3 font-sans text-[12px] leading-relaxed text-muted-foreground">
              <span className="mr-1.5 font-mono text-kai-amber" aria-hidden>!</span>
              {DISTRIBUTION_NOTE}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── build ──────────────────────────────────────────────────────────── */}
      <section id="build" className={SECTION}>
        <StickySectionHeader
          index="07"
          eyebrow="build"
          title={<>Compile from source in <span className="serif">two commands.</span></>}
          description="Standard Rust and Cargo toolchain, no surprise native toolchain requirements."
        />

        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-8">
          <div className="grid gap-4 lg:grid-cols-2">
            <Reveal>
              <p className="mb-2 font-mono text-[10px] tracking-wider text-kai-dim uppercase">build it yourself</p>
              <CodeBlock code={BUILD_STEPS} title="build" prompt />
            </Reveal>
            <Reveal delay={0.06}>
              <p className="mb-2 font-mono text-[10px] tracking-wider text-kai-dim uppercase">proof it's just HTTP</p>
              <CodeBlock code={CURL_PROOF} title="curl" prompt />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── closing CTA ───────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-border">
        <div className="rule-sweep absolute inset-x-0 top-0 h-px" aria-hidden />
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <Reveal>
            <h2 className="text-balance font-sans text-2xl font-bold tracking-[-0.03em] text-foreground sm:text-3xl">
              A surface worth <span className="serif">looking at.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-md font-sans text-[14px] leading-relaxed text-muted-foreground">
              The desktop app is a second window onto the same repository. Start with the binary —
              the window comes with it.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <LinkButton to="/docs/install" size="lg">
                <Terminal className="size-4" data-icon="inline-start" />
                Install the CLI
                <ArrowRight data-icon="inline-end" />
              </LinkButton>
              <LinkButton href={DESKTOP_REPO_PATH} variant="outline" size="lg">
                <GithubMark data-icon="inline-start" />
                Source on GitHub
              </LinkButton>
            </div>
          </Reveal>
        </div>
      </section>
        </div>
      </div>

      <BackToTop />
    </>
  )
}

/* ── small pieces ────────────────────────────────────────────────────────── */

/** Terminals have no vendor logos, so the platforms get glyphs instead. */
const PLATFORM_GLYPH: Record<string, string> = {
  windows: "▤",
  macos: "◍",
  linux: "◆",
}

function WinnerBadge({ winner }: { winner: "tui" | "desktop" | "tie" }) {
  return (
    <span
      className={cn(
        "inline-block rounded-sm border px-1.5 py-px font-mono text-[9px] whitespace-nowrap",
        winner === "desktop"
          ? "border-kai-orange/40 bg-kai-orange/10 text-kai-orange"
          : winner === "tui"
            ? "border-kai-green/40 bg-kai-green/10 text-kai-green"
            : "border-border text-kai-dim"
      )}
    >
      {winner}
    </span>
  )
}
