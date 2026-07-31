import { ArrowRight, Terminal } from "lucide-react"
import AsciiArt from "@/components/AsciiArt"
import GithubMark from "@/components/GithubMark"
import Icon from "@/components/Icon"
import Accordion, { Points } from "@/mobile/components/Accordion"
import Code from "@/mobile/components/Code"
import {
  Action,
  Card,
  Lead,
  Note,
  Section,
  SectionHead,
  StatGrid,
  Tag,
} from "@/mobile/components/primitives"
import { tone, toneSurface, toneText } from "@/mobile/lib/tone"
import {
  BUILD_STEPS,
  COMPARISON,
  CURL_PROOF,
  DESKTOP_ART,
  DESKTOP_REPO_PATH,
  DESKTOP_STATS,
  DISTRIBUTION_NOTE,
  LAYERS,
  PLATFORMS,
  PRINCIPLES,
  SHORTCUT_GROUPS,
  SURFACES,
} from "@/data/desktop"
import { cn } from "@/lib/utils"

export default function DesktopScreen() {
  return (
    <>
      <Hero />
      <Surfaces />
      <Architecture />
      <Honestly />
      <Principles />
      <Shortcuts />
      <Platforms />
      <Closing />
    </>
  )
}

/* ── hero ─────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="px-4 pt-6 pb-9">
      <div className="animate-rise">
        <span className="inline-flex items-center gap-2 rounded-sm border border-kai-orange/30 bg-kai-orange/10 px-2.5 py-1 font-mono text-[10.5px] text-kai-amber">
          <span
            className="size-1.5 rounded-full bg-kai-green shadow-[0_0_6px_-1px_var(--kai-green)]"
            aria-hidden
          />
          Tauri v2 · same binary, same .kaioken/
        </span>

        {/* the same wordmark the desktop /desktop page opens with, stacked so
            it reads at phone width */}
        <h1 className="mt-5">
          <AsciiArt
            art={DESKTOP_ART}
            label="Desktop app"
            className="text-[clamp(4px,2.36vw,9px)] leading-[1.3]"
          />
        </h1>
        <div
          className="mt-2 h-px w-full max-w-[21rem] opacity-40"
          style={{ background: "linear-gradient(90deg, var(--kai-red), var(--kai-orange))" }}
          aria-hidden
        />

        <Lead className="mt-4">
          The CLI in a window. Diffs you can read, a wiki you can browse, runs you can watch — all
          against the same <code className="font-mono text-kai-amber">.kaioken/</code> folder the
          terminal writes.
        </Lead>
      </div>

      <StatGrid
        className="mt-7"
        items={DESKTOP_STATS.map((s) => ({ value: s.value, label: s.label }))}
      />

      <div className="mt-4 space-y-2.5">
        <Action href={DESKTOP_REPO_PATH}>
          <GithubMark className="size-4" />
          View source
        </Action>
        <Action to="/docs/install" variant="outline">
          <Terminal className="size-4" aria-hidden />
          Get the CLI first
          <ArrowRight className="size-4" aria-hidden />
        </Action>
      </div>
    </section>
  )
}

/* ── surfaces ─────────────────────────────────────────────────────────────── */

function Surfaces() {
  return (
    <Section id="surfaces">
      <SectionHead
        index="01"
        eyebrow="surfaces"
        title={
          <>
            Twelve screens,{" "}
            <span className="text-kai-orange glow-orange">one rail</span>
          </>
        }
        lead="Tap one to read what it actually does."
      />

      <Accordion
        className="mt-6"
        defaultOpen={SURFACES[0].label}
        items={SURFACES.map((s) => {
          const t = tone(s.tone)
          return {
            id: s.label,
            title: s.label,
            glyph: <Icon name={s.icon} className={cn("size-4", toneText[t])} aria-hidden />,
            meta: s.key ? <Tag>{s.key}</Tag> : null,
            body: (
              <>
                <p className={cn("font-mono text-[12.5px] font-semibold", toneText[t])}>
                  {s.headline}
                </p>
                <p className="mt-2 font-sans text-[12.5px] leading-[1.6] text-muted-foreground">
                  {s.body}
                </p>
                <div className="mt-3 border-t border-border/70 pt-3">
                  <Points items={s.points} tone={toneText[t]} />
                </div>
              </>
            ),
          }
        })}
      />
    </Section>
  )
}

/* ── architecture ─────────────────────────────────────────────────────────── */

function Architecture() {
  return (
    <Section id="architecture">
      <SectionHead
        index="02"
        eyebrow="architecture"
        title={
          <>
            Four layers,{" "}
            <span className="text-kai-orange glow-orange">no rewrite</span>
          </>
        }
        lead="Top is what you look at, bottom is what everything agrees on."
      />

      <div className="mt-6">
        {LAYERS.map((layer, i) => {
          const t = tone(layer.tone)
          return (
            <div key={layer.id}>
              <div className={cn("rounded-md border p-4", toneSurface[t])}>
                <div className="flex items-baseline gap-2.5">
                  <span className={cn("font-mono text-[22px] leading-none font-bold", toneText[t])}>
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-mono text-[13.5px] font-bold text-foreground">
                      {layer.title}
                    </h3>
                    <p className="font-mono text-[10px] text-kai-dim">{layer.subtitle}</p>
                  </div>
                </div>
                <p className="mt-3 font-sans text-[12.5px] leading-[1.6] text-muted-foreground">
                  {layer.detail}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {layer.parts.map((p) => (
                    <span
                      key={p}
                      className={cn(
                        "rounded-sm border px-1.5 py-px font-mono text-[9.5px]",
                        toneSurface[t],
                        toneText[t]
                      )}
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
              {i < LAYERS.length - 1 ? (
                <p className="py-1.5 text-center font-mono text-[12px] text-kai-dim" aria-hidden>
                  ↓
                </p>
              ) : null}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

/* ── the honest comparison ────────────────────────────────────────────────── */

function WinnerBadge({ winner }: { winner: "tui" | "desktop" | "tie" }) {
  return (
    <span
      className={cn(
        "inline-block rounded-sm border px-1.5 py-px font-mono text-[9.5px] whitespace-nowrap",
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

function Honestly() {
  return (
    <Section id="comparison">
      <SectionHead
        index="03"
        eyebrow="honestly"
        title={
          <>
            GUI wins —{" "}
            <span className="text-kai-orange glow-orange">and when it doesn&apos;t</span>
          </>
        }
        lead="Two rows go to the terminal, and they are the two that matter on a server."
      />

      <div className="mt-6 space-y-2.5">
        {COMPARISON.map((row) => (
          <Card key={row.job} className="p-3.5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-mono text-[12.5px] leading-snug font-bold text-foreground">
                {row.job}
              </h3>
              <WinnerBadge winner={row.winner} />
            </div>
            <dl className="mt-2.5 space-y-1.5">
              <div className="flex gap-2.5">
                <dt className="w-14 shrink-0 font-mono text-[9.5px] tracking-[0.12em] text-kai-dim uppercase">
                  tui
                </dt>
                <dd
                  className={cn(
                    "font-sans text-[12px] leading-[1.55]",
                    row.winner === "tui" ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {row.tui}
                </dd>
              </div>
              <div className="flex gap-2.5">
                <dt className="w-14 shrink-0 font-mono text-[9.5px] tracking-[0.12em] text-kai-dim uppercase">
                  desktop
                </dt>
                <dd
                  className={cn(
                    "font-sans text-[12px] leading-[1.55]",
                    row.winner === "desktop" ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {row.desktop}
                </dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>
    </Section>
  )
}

/* ── principles ───────────────────────────────────────────────────────────── */

function Principles() {
  return (
    <Section id="principles">
      <SectionHead index="04" eyebrow="principles" title="Built this way" />

      <div className="mt-6 space-y-2.5">
        {PRINCIPLES.map((p) => (
          <Card key={p.title} className="p-3.5">
            <div className="flex items-center gap-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-sm border border-kai-orange/25 bg-kai-orange/10">
                <Icon name={p.icon} className="size-3.5 text-kai-orange" aria-hidden />
              </span>
              <h3 className="font-mono text-[12.5px] font-bold text-foreground">{p.title}</h3>
            </div>
            <p className="mt-2.5 font-sans text-[12.5px] leading-[1.6] text-muted-foreground">
              {p.body}
            </p>
          </Card>
        ))}
      </div>
    </Section>
  )
}

/* ── shortcuts ────────────────────────────────────────────────────────────── */

function Shortcuts() {
  return (
    <Section id="shortcuts">
      <SectionHead
        index="05"
        eyebrow="shortcuts"
        title="Keyboard-first"
        lead="Worth knowing before you open it on a machine with a keyboard."
      />

      <Accordion
        className="mt-6"
        items={SHORTCUT_GROUPS.map((g) => ({
          id: g.group,
          title: g.group,
          meta: <Tag>{g.items.length}</Tag>,
          body: (
            <div className="divide-y divide-border/70 border-t border-border/70">
              {g.items.map((item) => (
                <div key={item.keys} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="font-sans text-[12.5px] text-muted-foreground">
                    {item.label}
                  </span>
                  <kbd className="shrink-0 rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap text-kai-amber">
                    {item.keys}
                  </kbd>
                </div>
              ))}
            </div>
          ),
        }))}
      />
    </Section>
  )
}

/* ── platforms and build ──────────────────────────────────────────────────── */

const PLATFORM_GLYPH: Record<string, string> = {
  windows: "▤",
  macos: "◍",
  linux: "◆",
}

function Platforms() {
  return (
    <Section id="platforms">
      <SectionHead
        index="06"
        eyebrow="platforms"
        title={
          <>
            <span className="text-kai-orange glow-orange">Three platforms</span>, three commands
          </>
        }
      />

      <div className="mt-6 space-y-2.5">
        {PLATFORMS.map((p) => (
          <Card key={p.id} className="p-3.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px] text-kai-dim" aria-hidden>
                {PLATFORM_GLYPH[p.id]}
              </span>
              <h3 className="font-mono text-[13px] font-bold text-foreground">{p.label}</h3>
            </div>
            <p className="mt-1.5 font-mono text-[11px] text-kai-amber">{p.artifacts}</p>
            <p className="mt-1.5 font-sans text-[12px] leading-[1.55] text-muted-foreground">
              {p.note}
            </p>
          </Card>
        ))}
      </div>

      <div className="mt-4">
        <Note tone="amber">{DISTRIBUTION_NOTE}</Note>
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <p className="mb-2 font-mono text-[10px] tracking-[0.15em] text-kai-dim uppercase">
            build it yourself
          </p>
          <Code code={BUILD_STEPS} title="build" prompt />
        </div>
        <div>
          <p className="mb-2 font-mono text-[10px] tracking-[0.15em] text-kai-dim uppercase">
            proof it&apos;s just HTTP
          </p>
          <Code code={CURL_PROOF} title="curl" prompt />
        </div>
      </div>
    </Section>
  )
}

/* ── closing ──────────────────────────────────────────────────────────────── */

function Closing() {
  return (
    <section className="relative overflow-hidden border-t border-border px-4 py-12 text-center">
      <div className="rule-sweep absolute inset-x-0 top-0 h-px" aria-hidden />
      <h2 className="font-mono text-[20px] leading-[1.3] font-bold text-balance text-foreground">
        A surface worth <span className="text-kai-orange glow-orange">looking at</span>
      </h2>
      <Lead className="mt-3">
        The desktop app is a second window onto the same repository. Start with the binary — the
        window comes with it.
      </Lead>
      <div className="mt-6 space-y-2.5">
        <Action to="/docs/install">
          <Terminal className="size-4" aria-hidden />
          Install the CLI
          <ArrowRight className="size-4" aria-hidden />
        </Action>
        <Action href={DESKTOP_REPO_PATH} variant="outline">
          <GithubMark className="size-4" />
          Source on GitHub
        </Action>
      </div>
    </section>
  )
}
