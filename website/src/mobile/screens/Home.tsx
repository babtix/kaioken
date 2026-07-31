import * as React from "react"
import { ArrowRight, Monitor, Terminal } from "lucide-react"
import AsciiArt from "@/components/AsciiArt"
import GithubMark from "@/components/GithubMark"
import Icon from "@/components/Icon"
import Accordion, { Points } from "@/mobile/components/Accordion"
import Code from "@/mobile/components/Code"
import TerminalPeek from "@/mobile/components/TerminalPeek"
import {
  Action,
  Card,
  Eyebrow,
  Lead,
  Note,
  Rail,
  Section,
  SectionHead,
  Tag,
} from "@/mobile/components/primitives"
import { tone, toneSurface, toneText } from "@/mobile/lib/tone"
import {
  ASCII_LOGO,
  COMMAND_GROUPS,
  DESIGN_DECISIONS,
  FEATURES,
  GITHUB_URL,
  MULTIPLIER,
  OUTPUT_TREE,
  PIPELINE,
  PROVIDERS,
  QUALITY,
  QUICK_START,
  ROADMAP,
} from "@/data/content"
import { cn } from "@/lib/utils"

export default function Home() {
  return (
    <>
      <Hero />
      <Features />
      <Pipeline />
      <MultiplierDial />
      <Quality />
      <Commands />
      <OutputTree />
      <QuickStart />
      <DesktopTeaser />
      <Decisions />
      <Closing />
    </>
  )
}

/* ── hero ─────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="px-4 pt-6 pb-9">
      <div className="animate-rise text-center">
        {/* the logo, sized to fill the phone's gutter exactly */}
        <AsciiArt
          art={ASCII_LOGO}
          label="kaioken"
          className="text-[clamp(5px,2.45vw,10px)] leading-[1.3]"
        />
        <div
          className="mx-auto mt-1 h-px w-full max-w-[22rem] opacity-40"
          style={{ background: "linear-gradient(90deg, var(--kai-red), var(--kai-orange))" }}
          aria-hidden
        />

        <p className="mt-6 inline-block rounded-sm border border-kai-orange/35 bg-kai-orange/10 px-2.5 py-1 font-mono text-[10.5px] text-kai-amber">
          single Go binary · TUI · provider-agnostic
        </p>

        <h1 className="mt-5 font-mono text-[27px] leading-[1.2] font-bold tracking-tight text-balance text-foreground">
          A terminal AI
          <br />
          coding assistant
          <br />
          <span className="text-kai-orange glow-orange">+ knowledge engine</span>
        </h1>

        <Lead className="mt-4">
          One binary, two faces. A chat agent that edits your repo behind diff approval — and an
          engine that turns the codebase into deep wikis, knowledge cards and skills your agent
          loads before it starts working.
        </Lead>
      </div>

      <div className="animate-rise mt-7 space-y-2.5" style={{ animationDelay: "0.1s" }}>
        <Action to="/docs/install">
          Get started
          <ArrowRight className="size-4" aria-hidden />
        </Action>
        <Action href={GITHUB_URL} variant="outline">
          <GithubMark className="size-4" />
          View source
        </Action>
      </div>

      <TerminalPeek className="animate-rise mt-8" />

      <p className="mt-4 text-center font-mono text-[10.5px] leading-[1.9] text-balance text-kai-dim">
        {PROVIDERS.join(" · ")} · ~20 providers
      </p>
    </section>
  )
}

/* ── features ─────────────────────────────────────────────────────────────── */

function Features() {
  return (
    <Section id="features">
      <SectionHead
        index="01"
        eyebrow="what it does"
        title={
          <>
            Two faces,{" "}
            <span className="text-kai-orange glow-orange">one binary</span>
          </>
        }
        lead="Swipe through the six things it ships with."
      />

      <Rail className="mt-6">
        {FEATURES.map((f) => {
          const t = tone(f.tone)
          return (
            <article
              key={f.title}
              className={cn(
                "flex w-[82vw] max-w-[20rem] flex-col rounded-md border p-4",
                toneSurface[t]
              )}
            >
              <div className="flex items-center gap-2">
                <Icon name={f.icon} className={cn("size-4 shrink-0", toneText[t])} aria-hidden />
                <h3 className="font-mono text-[14px] font-bold text-foreground">{f.title}</h3>
              </div>
              <p className="mt-2.5 font-sans text-[12.5px] leading-[1.6] text-muted-foreground">
                {f.description}
              </p>
              <div className="mt-3.5 border-t border-border/70 pt-3.5">
                <Points items={f.highlights} tone={toneText[t]} />
              </div>
            </article>
          )
        })}
      </Rail>

      <p className="mt-3 font-mono text-[10.5px] text-kai-dim">
        ← swipe · {FEATURES.length} cards
      </p>
    </Section>
  )
}

/* ── pipeline ─────────────────────────────────────────────────────────────── */

function Pipeline() {
  return (
    <Section id="pipeline">
      <SectionHead
        index="02"
        eyebrow="the pipeline"
        title={
          <>
            Six commands,{" "}
            <span className="text-kai-orange glow-orange">one of them yours</span>
          </>
        }
        lead="Nothing expensive runs before you have seen what it plans to do."
      />

      <ol className="mt-6">
        {PIPELINE.map((step, i) => (
          <li key={step.cmd} className="relative flex gap-3.5 pb-5 last:pb-0">
            {/* the rail that joins the steps */}
            {i < PIPELINE.length - 1 ? (
              <span
                className="absolute top-7 bottom-0 left-[13px] w-px bg-border"
                aria-hidden
              />
            ) : null}

            <span
              className={cn(
                "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-sm border font-mono text-[11px] font-bold",
                step.human
                  ? "border-kai-amber/50 bg-kai-amber/15 text-kai-amber"
                  : "border-border bg-card text-kai-dim"
              )}
            >
              {String(i + 1).padStart(2, "0")}
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-[12.5px] font-bold text-kai-orange">
                  {step.cmd}
                </code>
                {step.human ? (
                  <Tag className="border-kai-amber/40 text-kai-amber">your call</Tag>
                ) : null}
              </div>
              <p className="mt-0.5 font-mono text-[12px] text-foreground">{step.title}</p>
              <p className="mt-1.5 font-sans text-[12.5px] leading-[1.6] text-muted-foreground">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  )
}

/* ── multiplier ───────────────────────────────────────────────────────────── */

function MultiplierDial() {
  const defaultIndex = Math.max(
    0,
    MULTIPLIER.findIndex((m) => m.isDefault)
  )
  const [active, setActive] = React.useState(defaultIndex)
  const level = MULTIPLIER[active]

  return (
    <Section id="multiplier">
      <SectionHead
        index="03"
        eyebrow="the multiplier"
        title="×N buys passes, not padding"
        lead="Each level roughly doubles the calls per document — which is what a power-multiplier metaphor ought to mean."
      />

      {/* a segmented control: five levels is exactly what fits across a phone */}
      <div
        role="tablist"
        aria-label="Wiki depth"
        className="mt-6 flex gap-px overflow-hidden rounded-md border border-border bg-border"
      >
        {MULTIPLIER.map((m, i) => (
          <button
            key={m.level}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={cn(
              "h-11 flex-1 font-mono text-[13px] font-bold transition-colors",
              i === active
                ? "bg-kai-orange text-[#180c00]"
                : "bg-card text-kai-dim"
            )}
          >
            {m.level}
          </button>
        ))}
      </div>

      <Card className="mt-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[17px] font-bold text-kai-orange">{level.level}</span>
          {level.isDefault ? (
            <Tag className="border-kai-orange/40 text-kai-orange">default</Tag>
          ) : null}
        </div>
        <p className="mt-2 font-sans text-[13.5px] leading-[1.6] text-muted-foreground">
          {level.behavior}
        </p>
      </Card>

      <p className="mt-3 font-mono text-[11px] leading-relaxed text-kai-dim">
        <span className="text-kai-green">✓</span> the estimate names the passes before the run
        starts, and asks for confirmation past a threshold
      </p>
    </Section>
  )
}

/* ── engineering notes ────────────────────────────────────────────────────── */

function Quality() {
  return (
    <Section id="quality">
      <SectionHead
        index="04"
        eyebrow="why it holds up"
        title={
          <>
            Six things that make the output{" "}
            <span className="text-kai-orange glow-orange">trustworthy</span>
          </>
        }
      />

      <Accordion
        className="mt-6"
        defaultOpen={QUALITY[0].claim}
        items={QUALITY.map((q) => ({
          id: q.claim,
          title: q.claim,
          glyph: <Icon name={q.icon} className="size-4 text-kai-orange" aria-hidden />,
          body: (
            <p className="font-sans text-[12.5px] leading-[1.65] text-muted-foreground">{q.body}</p>
          ),
        }))}
      />
    </Section>
  )
}

/* ── commands ─────────────────────────────────────────────────────────────── */

function Commands() {
  const total = COMMAND_GROUPS.reduce((n, g) => n + g.commands.length, 0)

  return (
    <Section id="commands">
      <SectionHead
        index="05"
        eyebrow="slash commands"
        title={<>{total} commands, four groups</>}
        lead="Everything the TUI answers to. Tap a group to open it."
      />

      <Accordion
        className="mt-6"
        items={COMMAND_GROUPS.map((g) => ({
          id: g.id,
          title: g.label,
          glyph: <Icon name={g.icon} className="size-4 text-kai-orange" aria-hidden />,
          meta: <Tag>{g.commands.length}</Tag>,
          body: (
            <>
              <p className="font-sans text-[12.5px] leading-[1.6] text-muted-foreground">
                {g.blurb}
              </p>
              <ul className="mt-3 divide-y divide-border/70 border-t border-border/70">
                {g.commands.map((c) => (
                  <li key={c.name} className="py-2.5">
                    <p className="font-mono text-[12.5px]">
                      <span className="font-bold text-kai-orange">{c.name}</span>
                      {c.args ? <span className="ml-1.5 text-kai-dim">{c.args}</span> : null}
                    </p>
                    <p className="mt-1 font-sans text-[12px] leading-[1.55] text-muted-foreground">
                      {c.summary}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          ),
        }))}
      />

      <Action to="/docs/commands" variant="outline" className="mt-4">
        Full command reference
        <ArrowRight className="size-4" aria-hidden />
      </Action>
    </Section>
  )
}

/* ── output tree ──────────────────────────────────────────────────────────── */

const KIND_COLOR: Record<string, string> = {
  dir: "text-kai-orange",
  edit: "text-kai-amber",
  file: "text-muted-foreground",
}

function OutputTree() {
  return (
    <Section id="output">
      <SectionHead
        index="06"
        eyebrow="what lands on disk"
        title={
          <>
            One folder,{" "}
            <span className="text-kai-orange glow-orange">plain files</span>
          </>
        }
        lead="No database, no lock-in — markdown and YAML you can read, diff and commit."
      />

      <div className="mt-6 overflow-hidden rounded-md border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border bg-kai-panel px-3 py-2">
          <span className="size-2 rounded-[1px] bg-kai-orange/60" aria-hidden />
          <span className="font-mono text-[10.5px] tracking-[0.15em] text-kai-dim uppercase">
            .kaioken/
          </span>
        </div>
        <div className="m-no-scrollbar overflow-x-auto px-3 py-3">
          <ul className="min-w-max font-mono text-[11.5px] leading-[1.9]">
            {OUTPUT_TREE.map((node, i) => (
              <li
                key={`${node.name}-${i}`}
                className="whitespace-pre"
                style={{ paddingLeft: `${node.depth * 1.1}rem` }}
              >
                <span className={KIND_COLOR[node.kind] ?? "text-muted-foreground"}>
                  {node.kind === "dir" ? "▸ " : "  "}
                  {node.name}
                </span>
                {node.note ? (
                  <span className="text-kai-dim">
                    {"  · "}
                    {node.note}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Note tone="amber" glyph="!">
        The two files marked in amber are meant to be edited between passes — module boundaries and
        the wiki outline are judgment calls the maintainer should own.
      </Note>
    </Section>
  )
}

/* ── quick start ──────────────────────────────────────────────────────────── */

function QuickStart() {
  return (
    <Section id="quickstart">
      <SectionHead
        index="07"
        eyebrow="quick start"
        title="From clone to wiki"
        lead="The scan is free, the plan is a file you can edit, and the cost estimate prints before anything expensive runs."
      />
      <Code className="mt-6" title="powershell" code={QUICK_START} />
    </Section>
  )
}

/* ── desktop teaser ───────────────────────────────────────────────────────── */

function DesktopTeaser() {
  return (
    <Section id="desktop">
      <SectionHead
        index="08"
        eyebrow="desktop"
        title={
          <>
            Same engine,{" "}
            <span className="text-kai-orange glow-orange">new surface</span>
          </>
        }
        lead="Everything the TUI does, in a window — with diff approval you can read and runs you can watch concurrently."
      />

      <div className="mt-6 grid grid-cols-2 gap-2">
        {[
          { v: "12", l: "surfaces" },
          { v: "1", l: "extra process" },
          { v: "0", l: "telemetry" },
          { v: "3", l: "platforms" },
        ].map((s) => (
          <div key={s.l} className="rounded-md border border-border bg-card px-3 py-3.5">
            <p className="font-mono text-[20px] leading-none font-bold text-kai-orange">{s.v}</p>
            <p className="mt-1.5 font-mono text-[10px] tracking-[0.12em] text-kai-dim uppercase">
              {s.l}
            </p>
          </div>
        ))}
      </div>

      <Action to="/desktop" variant="outline" className="mt-4">
        <Monitor className="size-4" aria-hidden />
        Explore the desktop app
        <ArrowRight className="size-4" aria-hidden />
      </Action>
    </Section>
  )
}

/* ── design decisions + roadmap ───────────────────────────────────────────── */

function Decisions() {
  return (
    <Section id="decisions">
      <SectionHead index="09" eyebrow="design decisions" title="Choices worth stating" />

      <dl className="mt-6 space-y-4">
        {DESIGN_DECISIONS.map((d) => (
          <div key={d.title} className="border-l-2 border-kai-orange/40 pl-3.5">
            <dt className="font-mono text-[12.5px] font-bold text-foreground">{d.title}</dt>
            <dd className="mt-1 font-sans text-[12.5px] leading-[1.6] text-muted-foreground">
              {d.body}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-8">
        <Eyebrow tone="dim">roadmap · not yet built</Eyebrow>
        <ul className="mt-3.5 space-y-2.5">
          {ROADMAP.map((item) => (
            <li key={item} className="flex gap-2.5">
              <span className="mt-px shrink-0 font-mono text-[12px] text-kai-dim" aria-hidden>
                ☐
              </span>
              <span className="font-mono text-[12px] leading-[1.55] text-muted-foreground">
                {item}
              </span>
            </li>
          ))}
        </ul>
        <Action to="/next" variant="outline" className="mt-5">
          The full roadmap
          <ArrowRight className="size-4" aria-hidden />
        </Action>
      </div>
    </Section>
  )
}

/* ── closing ──────────────────────────────────────────────────────────────── */

function Closing() {
  return (
    <section className="relative overflow-hidden border-t border-border px-4 py-12 text-center">
      <div className="rule-sweep absolute inset-x-0 top-0 h-px" aria-hidden />
      <p className="font-mono text-[10.5px] tracking-[0.3em] text-kai-dim uppercase">
        ready when you are
      </p>
      <h2 className="mt-3.5 font-mono text-[20px] leading-[1.3] font-bold text-balance text-foreground">
        Point it at a repo and{" "}
        <span className="text-kai-orange glow-orange">read what comes back</span>
      </h2>
      <Lead className="mt-3">
        The scan is free, the plan is a file you can edit, and the cost estimate prints before
        anything expensive runs.
      </Lead>
      <div className="mt-6 space-y-2.5">
        <Action to="/docs/install">
          <Terminal className="size-4" aria-hidden />
          Start here
        </Action>
        <Action to="/preview" variant="outline">
          Read what it generated
          <ArrowRight className="size-4" aria-hidden />
        </Action>
      </div>
    </section>
  )
}
