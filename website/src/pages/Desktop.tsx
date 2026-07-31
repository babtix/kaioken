import * as React from "react"
import { ArrowRight, MousePointerClick, Terminal } from "lucide-react"
import AppWindow from "@/components/desktop/AppWindow"
import BackToTop from "@/components/BackToTop"
import Icon from "@/components/Icon"
import PageBackground from "@/components/PageBackground"
import Reveal from "@/components/Reveal"
import SectionHeading from "@/components/SectionHeading"
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
  DESKTOP_STATS,
  DESKTOP_REPO_PATH,
  DISTRIBUTION_NOTE,
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
const SECTION = "scroll-mt-3 border-t border-border/70 py-16 sm:py-20"

export default function Desktop() {
  // Clicking a surface card opens its detail below the grid — twelve screens
  // is too many to describe in place, and a tooltip is not readable on touch.
  const [surfaceLabel, setSurfaceLabel] = React.useState(SURFACES[0].label)
  const surface = SURFACES.find((s) => s.label === surfaceLabel) ?? SURFACES[0]

  return (
    <>
      <PageBackground />
      {/* ── hero ──────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden pt-14">
        {/* keeps the logo legible where the backdrop's bloom is brightest */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-background/40 via-transparent to-background/60" />

        <div className="mx-auto max-w-6xl px-4 pt-12 pb-12 sm:px-6 sm:pt-16 sm:pb-16">
          <div className="animate-rise text-center">
            {/* its own block — the ASCII logo below is inline-level and would
                otherwise share a line box with it */}
            <div className="mb-7">
              <a
                href="#surfaces"
                onClick={(e) => scrollToAnchor(e, "surfaces")}
                className="inline-flex items-center gap-2 rounded-sm border border-kai-orange/30 bg-kai-orange/10 px-2.5 py-1 font-mono text-[11px] text-kai-amber transition-colors hover:border-kai-orange/60 hover:bg-kai-orange/15"
              >
                <span className="size-1.5 rounded-full bg-kai-green shadow-[0_0_6px_-1px_var(--kai-green)]" />
                Tauri v2 · same binary, same .kaioken/
              </a>
            </div>

            {/* Colored ASCII logo — exact HTML from DESKTOP APP-logo.html */}
            <div
              className="mx-auto inline-block max-w-full overflow-hidden text-center"
              aria-label="DESKTOP APP"
              dangerouslySetInnerHTML={{ __html: `<div style="font-family:'JetBrains Mono','Courier New',monospace;font-size:clamp(5px,1.1vw,14px);line-height:1.25;font-weight:800;white-space:pre;display:inline-block"><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span><span style="color:#663600"> </span> <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span> <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span> <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span><span style="color:#ff8700"> </span><span style="color:#ff8700"> </span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span> <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span>  <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span><span style="color:#663600"> </span> <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span><span style="color:#663600"> </span>      <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span>  <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span><span style="color:#663600"> </span> <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span><span style="color:#663600"> </span>\n<span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╗</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">╝</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">╝</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">║</span><span style="color:#ff6c00"> </span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">╝</span> <span style="color:#662b00">╚</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">╝</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╗</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╗</span>     <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╗</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╗</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╗</span>\n<span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span><span style="color:#ff5100"> </span><span style="color:#ff5100"> </span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╗</span><span style="color:#662000"> </span><span style="color:#662000"> </span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╗</span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╔</span><span style="color:#662000">╝</span><span style="color:#662000"> </span> <span style="color:#ff5100"> </span><span style="color:#ff5100"> </span><span style="color:#ff5100"> </span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span><span style="color:#662000"> </span><span style="color:#662000"> </span><span style="color:#662000"> </span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span><span style="color:#ff5100"> </span><span style="color:#ff5100"> </span><span style="color:#ff5100"> </span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╔</span><span style="color:#662000">╝</span>     <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╔</span><span style="color:#662000">╝</span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╔</span><span style="color:#662000">╝</span>\n<span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span><span style="color:#ff3600"> </span><span style="color:#ff3600"> </span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╔</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">╝</span><span style="color:#661600"> </span><span style="color:#661600"> </span> <span style="color:#661600">╚</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╔</span><span style="color:#661600">═</span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╗</span><span style="color:#661600"> </span> <span style="color:#ff3600"> </span><span style="color:#ff3600"> </span><span style="color:#ff3600"> </span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span><span style="color:#661600"> </span><span style="color:#661600"> </span><span style="color:#661600"> </span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span><span style="color:#ff3600"> </span><span style="color:#ff3600"> </span><span style="color:#ff3600"> </span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╔</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">╝</span><span style="color:#661600"> </span>     <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╔</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╔</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">╝</span><span style="color:#661600"> </span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╔</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">╝</span><span style="color:#661600"> </span>\n<span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">╔</span><span style="color:#660b00">╝</span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">╗</span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span><span style="color:#ff1b00"> </span><span style="color:#ff1b00"> </span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">╗</span> <span style="color:#ff1b00"> </span><span style="color:#ff1b00"> </span><span style="color:#ff1b00"> </span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span> <span style="color:#660b00">╚</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">╔</span><span style="color:#660b00">╝</span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span>     <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span><span style="color:#ff1b00"> </span><span style="color:#ff1b00"> </span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span><span style="color:#660b00"> </span>\n<span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">╝</span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">╝</span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span> <span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span> <span style="color:#660000"> </span><span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span>     <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000"> </span></div><div style="font-family:'JetBrains Mono','Courier New',monospace;font-size:clamp(5px,1.1vw,14px);white-space:pre;opacity:0.4;color:#ff4400">═════════════════════════════════════════════════════════════════════════════════════════════</div>` }}
            />

            <p className="mx-auto mt-6 max-w-lg font-sans text-[15px] leading-relaxed text-balance text-muted-foreground">
              The CLI in a window. Diffs you can read, a wiki you can browse, runs you can watch.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <LinkButton href={DESKTOP_REPO_PATH} size="lg">
                <GithubMark data-icon="inline-start" />
                View source
              </LinkButton>
              <LinkButton to="/docs/install" variant="outline" size="lg">
                <Terminal className="size-4" data-icon="inline-start" />
                Get the CLI first
                <ArrowRight data-icon="inline-end" />
              </LinkButton>
            </div>

            {/* stats — a bordered strip so they read as one instrument panel */}
            <dl className="mx-auto mt-10 grid max-w-2xl grid-cols-2 divide-x divide-y divide-border rounded-md border border-border bg-card/50 backdrop-blur-sm sm:grid-cols-4 sm:divide-y-0">
              {DESKTOP_STATS.map((s) => (
                <div key={s.label} className="px-3 py-4 text-center">
                  <dt className="sr-only">{s.label}</dt>
                  <dd>
                    <span className="block font-mono text-3xl font-bold text-kai-orange">
                      {s.value}
                    </span>
                    <span className="font-mono text-[11px] tracking-wider text-kai-dim">
                      {s.label}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* interactive window */}
          <div className="animate-rise mx-auto mt-12 max-w-4xl" style={{ animationDelay: "0.2s" }}>
            <AppWindow size="lg" start="chat" />
            <p className="mt-3 flex items-center justify-center gap-1.5 font-mono text-[11px] text-kai-dim">
              <MousePointerClick className="size-3.5 text-kai-orange" aria-hidden />
              Not a screenshot — click the rail to change screens, or leave it and it tours itself.
            </p>
          </div>
        </div>
      </section>

      <SectionNav items={SECTIONS} />

      {/* ── surfaces — pick one, read it ──────────────────────────────────── */}
      <section id="surfaces" className={SECTION}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <SectionHeading
              index="01"
              eyebrow="surfaces"
              title={<>Twelve screens, <span className="text-kai-orange glow-orange">one rail</span></>}
              description="Pick one to read what it actually does."
            />
          </Reveal>

          <Reveal delay={0.05}>
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                      "lift rounded-md border p-4 text-left",
                      "focus-visible:ring-1 focus-visible:ring-kai-orange/60 focus-visible:outline-none",
                      toneBg[s.tone],
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
              <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted-foreground">
                {surface.body}
              </p>
            </div>
            <ul className="space-y-2 lg:border-l lg:border-border lg:pl-6">
              {surface.points.map((p) => (
                <li key={p} className="flex gap-2 text-[12px] leading-relaxed text-muted-foreground">
                  <span className={cn("mt-px shrink-0", toneText[surface.tone])} aria-hidden>
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
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <SectionHeading
              index="02"
              eyebrow="architecture"
              title={<>Four layers, <span className="text-kai-orange glow-orange">no rewrite</span></>}
              description="Top is what you look at, bottom is what everything agrees on."
            />
          </Reveal>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <SectionHeading
              index="03"
              eyebrow="honestly"
              title={<>GUI wins — <span className="text-kai-orange glow-orange">and when it doesn't</span></>}
              description="Two rows go to the terminal, and they are the two that matter on a server."
            />
          </Reveal>

          <Reveal delay={0.05}>
            {/* ≥sm: the full table */}
            <table className="mt-10 hidden w-full border-collapse text-sm sm:table">
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
                  <tr
                    key={row.job}
                    className="border-b border-border/50 transition-colors hover:bg-accent/25"
                  >
                    <td className="py-3 pr-3 font-mono text-[11px] font-semibold text-foreground">
                      {row.job}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-3 text-[12px]",
                        row.winner === "tui" ? "text-kai-text" : "text-muted-foreground"
                      )}
                    >
                      {row.tui}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-3 text-[12px]",
                        row.winner === "desktop" ? "text-kai-text" : "text-muted-foreground"
                      )}
                    >
                      {row.desktop}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <WinnerBadge winner={row.winner} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* <sm: one card per row — a 580px table on a phone is a swipe, not a read */}
            <div className="mt-10 space-y-3 sm:hidden">
              {COMPARISON.map((row) => (
                <div key={row.job} className="rounded-md border border-border bg-card/60 p-3 backdrop-blur-sm">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-mono text-[12px] font-semibold text-foreground">{row.job}</h3>
                    <WinnerBadge winner={row.winner} />
                  </div>
                  <dl className="mt-2 space-y-1.5">
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 font-mono text-[10px] tracking-wider text-kai-dim uppercase">tui</dt>
                      <dd className="text-[12px] leading-relaxed text-muted-foreground">{row.tui}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 font-mono text-[10px] tracking-wider text-kai-dim uppercase">desktop</dt>
                      <dd className="text-[12px] leading-relaxed text-muted-foreground">{row.desktop}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── principles + shortcuts side by side ───────────────────────────── */}
      <section className={SECTION}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
            {/* principles */}
            <div id="principles" className="scroll-mt-3">
              <Reveal>
                <SectionHeading index="04" eyebrow="principles" title={<>Built <span className="text-kai-orange glow-orange">this way</span></>} />
              </Reveal>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
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

            {/* shortcuts */}
            <div id="shortcuts" className="scroll-mt-3">
              <Reveal>
                <SectionHeading index="05" eyebrow="shortcuts" title={<><span className="text-kai-orange glow-orange">Keyboard-first</span></>} />
              </Reveal>
              <Reveal delay={0.05}>
                <div className="mt-8 space-y-3">
                  {SHORTCUT_GROUPS.map((g) => (
                    <div
                      key={g.group}
                      className="rounded-md border border-border bg-card/60 p-3 backdrop-blur-sm transition-colors hover:border-kai-amber/30"
                    >
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
                  ))}
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ── platforms + build ──────────────────────────────────────────────── */}
      <section id="platforms" className={SECTION}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <SectionHeading
              index="06"
              eyebrow="platforms"
              title={<><span className="text-kai-orange glow-orange">Three platforms</span>, three commands</>}
            />
          </Reveal>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
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

          <div id="build" className="mt-8 grid scroll-mt-3 gap-4 lg:grid-cols-2">
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
            <h2 className="font-mono text-2xl font-bold text-balance text-foreground sm:text-3xl">
              A surface worth <span className="text-kai-orange glow-orange">looking at</span>
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
