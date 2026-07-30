import { ArrowRight, Monitor } from "lucide-react"
import AppWindow from "@/components/desktop/AppWindow"
import Icon from "@/components/Icon"
import SectionHeading from "@/components/SectionHeading"
import LinkButton from "@/components/LinkButton"
import CodeBlock from "@/components/CodeBlock"
import { cn } from "@/lib/utils"
import {
  SURFACES,
  LAYERS,
  COMPARISON,
  PRINCIPLES,
  SHORTCUT_GROUPS,
  PLATFORMS,
  DESKTOP_STATS,
  DESKTOP_REPO_PATH,
  BUILD_STEPS,
  CURL_PROOF,
} from "@/data/desktop"

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

export default function Desktop() {
  return (
    <>
      {/* ── hero ──────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden pt-14">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-kai-orange/[0.04] via-background to-background" />

        <div className="mx-auto max-w-6xl px-4 pt-14 pb-12 sm:px-6 sm:pt-20 sm:pb-16">
          <div className="animate-rise text-center">
            {/* Colored ASCII logo — exact HTML from DESKTOP APP-logo.html */}
            <div
              className="mx-auto inline-block max-w-full overflow-hidden text-center"
              aria-label="DESKTOP APP"
              dangerouslySetInnerHTML={{ __html: `<div style="font-family:'JetBrains Mono','Courier New',monospace;font-size:clamp(5px,1.1vw,14px);line-height:1.25;font-weight:800;white-space:pre;display:inline-block"><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span><span style="color:#663600"> </span> <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span> <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span> <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span><span style="color:#ff8700"> </span><span style="color:#ff8700"> </span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span> <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span>  <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span><span style="color:#663600"> </span> <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span><span style="color:#663600"> </span>      <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span>  <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span><span style="color:#663600"> </span> <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span><span style="color:#663600"> </span>\n<span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╗</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">╝</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">╝</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">║</span><span style="color:#ff6c00"> </span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">╝</span> <span style="color:#662b00">╚</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">╝</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╗</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╗</span>     <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╗</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╗</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╗</span>\n<span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span><span style="color:#ff5100"> </span><span style="color:#ff5100"> </span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╗</span><span style="color:#662000"> </span><span style="color:#662000"> </span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╗</span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╔</span><span style="color:#662000">╝</span><span style="color:#662000"> </span> <span style="color:#ff5100"> </span><span style="color:#ff5100"> </span><span style="color:#ff5100"> </span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span><span style="color:#662000"> </span><span style="color:#662000"> </span><span style="color:#662000"> </span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span><span style="color:#ff5100"> </span><span style="color:#ff5100"> </span><span style="color:#ff5100"> </span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╔</span><span style="color:#662000">╝</span>     <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╔</span><span style="color:#662000">╝</span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╔</span><span style="color:#662000">╝</span>\n<span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span><span style="color:#ff3600"> </span><span style="color:#ff3600"> </span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╔</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">╝</span><span style="color:#661600"> </span><span style="color:#661600"> </span> <span style="color:#661600">╚</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╔</span><span style="color:#661600">═</span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╗</span><span style="color:#661600"> </span> <span style="color:#ff3600"> </span><span style="color:#ff3600"> </span><span style="color:#ff3600"> </span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span><span style="color:#661600"> </span><span style="color:#661600"> </span><span style="color:#661600"> </span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span><span style="color:#ff3600"> </span><span style="color:#ff3600"> </span><span style="color:#ff3600"> </span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╔</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">╝</span><span style="color:#661600"> </span>     <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╔</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╔</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">╝</span><span style="color:#661600"> </span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╔</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">╝</span><span style="color:#661600"> </span>\n<span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">╔</span><span style="color:#660b00">╝</span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">╗</span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span><span style="color:#ff1b00"> </span><span style="color:#ff1b00"> </span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">╗</span> <span style="color:#ff1b00"> </span><span style="color:#ff1b00"> </span><span style="color:#ff1b00"> </span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span> <span style="color:#660b00">╚</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">╔</span><span style="color:#660b00">╝</span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span>     <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span><span style="color:#ff1b00"> </span><span style="color:#ff1b00"> </span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span>\n<span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">╝</span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">╝</span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span> <span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span> <span style="color:#660000"> </span><span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span>     <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span></div><div style="font-family:'JetBrains Mono','Courier New',monospace;font-size:clamp(5px,1.1vw,14px);white-space:pre;opacity:0.4;color:#ff4400">═════════════════════════════════════════════════════════════════════════════════════════════</div>` }}
            />

            <p className="mx-auto mt-6 max-w-lg font-sans text-[15px] leading-relaxed text-muted-foreground">
              The CLI in a window. Diffs you can read, a wiki you can browse, runs you can watch.
            </p>

            {/* stats row */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-8">
              {DESKTOP_STATS.map((s) => (
                <div key={s.label} className="text-center">
                  <span className="block font-mono text-3xl font-bold text-kai-orange">{s.value}</span>
                  <span className="font-mono text-[11px] text-kai-dim">{s.label}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <LinkButton href={DESKTOP_REPO_PATH} size="lg">
                <Monitor className="size-4" data-icon="inline-start" />
                View source
              </LinkButton>
              <LinkButton to="/docs/install" variant="outline" size="lg">
                Get the CLI first
                <ArrowRight data-icon="inline-end" />
              </LinkButton>
            </div>
          </div>

          {/* interactive window */}
          <div className="animate-rise mx-auto mt-14 max-w-4xl" style={{ animationDelay: "0.2s" }}>
            <AppWindow size="lg" start="chat" />
          </div>
        </div>
      </section>

      {/* ── surfaces — compact cards ──────────────────────────────────────── */}
      <section className="border-t border-border py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            index="01"
            eyebrow="surfaces"
            title={<>Twelve screens, <span className="text-kai-orange glow-orange">one rail</span></>}
          />

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SURFACES.map((s) => (
              <div
                key={s.label}
                className={cn(
                  "rounded-md border p-4 transition-colors hover:bg-accent/40",
                  toneBg[s.tone]
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon name={s.icon} className={cn("size-4", toneText[s.tone])} />
                  <h3 className="font-mono text-[13px] font-bold text-foreground">{s.label}</h3>
                  {s.key ? (
                    <kbd className="ml-auto rounded-sm border border-border px-1 py-px text-[9px] text-kai-dim">{s.key}</kbd>
                  ) : null}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{s.headline}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── architecture — horizontal stack ───────────────────────────────── */}
      <section className="border-t border-border py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            index="02"
            eyebrow="architecture"
            title={<>Four layers, <span className="text-kai-orange glow-orange">no rewrite</span></>}
          />

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {LAYERS.map((layer, i) => (
              <div key={layer.id} className={cn("rounded-md border p-4", toneBg[layer.tone])}>
                <span className={cn("font-mono text-2xl font-bold", toneText[layer.tone])}>{i + 1}</span>
                <h3 className="mt-1 font-mono text-[13px] font-bold text-foreground">{layer.title}</h3>
                <p className="mt-0.5 font-mono text-[10px] text-kai-dim">{layer.subtitle}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {layer.parts.map((p) => (
                    <span key={p} className={cn("rounded-sm border px-1 py-px font-mono text-[9px]", toneBg[layer.tone], toneText[layer.tone])}>{p}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── comparison table ───────────────────────────────────────────────── */}
      <section className="border-t border-border py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            index="03"
            eyebrow="honestly"
            title={<>GUI wins — <span className="text-kai-orange glow-orange">and when it doesn't</span></>}
          />

          <div className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[580px] border-collapse text-sm">
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
                  <tr key={row.job} className="border-b border-border/50">
                    <td className="py-2.5 pr-3 font-mono text-[11px] font-semibold text-foreground">{row.job}</td>
                    <td className="px-3 py-2.5 text-[12px] text-muted-foreground">{row.tui}</td>
                    <td className="px-3 py-2.5 text-[12px] text-muted-foreground">{row.desktop}</td>
                    <td className="py-2.5 pl-3 text-right">
                      <span className={cn("rounded-sm border px-1.5 py-px font-mono text-[9px]", row.winner === "desktop" ? "border-kai-orange/40 text-kai-orange" : row.winner === "tui" ? "border-kai-green/40 text-kai-green" : "border-border text-kai-dim")}>{row.winner}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── principles + shortcuts side by side ───────────────────────────── */}
      <section className="border-t border-border py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
            {/* principles */}
            <div>
              <SectionHeading index="04" eyebrow="principles" title={<>Built <span className="text-kai-orange glow-orange">this way</span></>} />
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {PRINCIPLES.map((p) => (
                  <div key={p.title} className="rounded-md border border-border bg-card/60 p-4 transition-colors hover:border-kai-orange/30">
                    <div className="flex items-center gap-2">
                      <Icon name={p.icon} className="size-4 text-kai-orange" />
                      <h3 className="font-mono text-[12px] font-bold text-foreground">{p.title}</h3>
                    </div>
                    <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{p.body}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* shortcuts */}
            <div>
              <SectionHeading index="05" eyebrow="shortcuts" title={<><span className="text-kai-orange glow-orange">Keyboard-first</span></>} />
              <div className="mt-8 space-y-3">
                {SHORTCUT_GROUPS.map((g) => (
                  <div key={g.group} className="rounded-md border border-border bg-card/60 p-3">
                    <h4 className="font-mono text-[10px] tracking-wider text-kai-amber uppercase">{g.group}</h4>
                    <div className="mt-2 divide-y divide-border/50">
                      {g.items.map((item) => (
                        <div key={item.keys} className="flex items-center justify-between py-1">
                          <span className="text-[11px] text-muted-foreground">{item.label}</span>
                          <kbd className="rounded-sm border border-border bg-background px-1 py-px font-mono text-[9px] text-kai-dim">{item.keys}</kbd>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── platforms + build ──────────────────────────────────────────────── */}
      <section className="border-t border-border py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            index="06"
            eyebrow="platforms"
            title={<><span className="text-kai-orange glow-orange">Three platforms</span>, three commands</>}
          />

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {PLATFORMS.map((p) => (
              <div key={p.id} className="rounded-md border border-border bg-card/60 p-4">
                <h3 className="font-mono text-sm font-bold text-foreground">{p.label}</h3>
                <p className="mt-1 font-mono text-[11px] text-kai-amber">{p.artifacts}</p>
                <p className="mt-2 text-[12px] text-muted-foreground">{p.note}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 font-mono text-[10px] tracking-wider text-kai-dim uppercase">build it yourself</p>
              <CodeBlock code={BUILD_STEPS} title="build" prompt />
            </div>
            <div>
              <p className="mb-2 font-mono text-[10px] tracking-wider text-kai-dim uppercase">proof it's just HTTP</p>
              <CodeBlock code={CURL_PROOF} title="curl" prompt />
            </div>
          </div>
        </div>
      </section>

      {/* ── closing CTA ───────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-border">
        <div className="rule-sweep absolute inset-x-0 top-0 h-px" aria-hidden />
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <h2 className="font-mono text-2xl font-bold text-foreground sm:text-3xl">
            A surface worth <span className="text-kai-orange glow-orange">looking at</span>
          </h2>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <LinkButton href={DESKTOP_REPO_PATH} size="lg">
              <Monitor className="size-4" data-icon="inline-start" />
              Source on GitHub
            </LinkButton>
            <LinkButton to="/docs/install" variant="outline" size="lg">
              Install the CLI
              <ArrowRight data-icon="inline-end" />
            </LinkButton>
          </div>
        </div>
      </section>
    </>
  )
}
