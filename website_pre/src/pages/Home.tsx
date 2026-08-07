import { Monitor } from "lucide-react"
import { ArrowRight } from "lucide-react"
import Hero from "@/components/sections/Hero"
import StatsBar from "@/components/sections/StatsBar"
import Features from "@/components/sections/Features"
import Pipeline from "@/components/sections/Pipeline"
import Research from "@/components/sections/Research"
import Multiplier from "@/components/sections/Multiplier"
import Quality from "@/components/sections/Quality"
import OutputTree from "@/components/sections/OutputTree"
import Commands from "@/components/sections/Commands"
import QuickStart from "@/components/sections/QuickStart"
import LinkButton from "@/components/LinkButton"
import AppWindow from "@/components/desktop/AppWindow"
import PageBackground from "@/components/PageBackground"
import SectionHeading from "@/components/SectionHeading"
import Reveal from "@/components/Reveal"
import { DESIGN_DECISIONS, ROADMAP } from "@/data/content"

export default function Home() {
  return (
    <>
      {/* the page-wide backdrop; the hero's WebGL shader layers on top of it
          inside its own isolated stacking context */}
      <PageBackground />
      <Hero />

      {/* Stats strip — quick social proof before features */}
      <StatsBar />

      <Features />
      <Pipeline />
      <Research />
      <Multiplier />
      <Quality />
      <Commands />
      <OutputTree />
      <QuickStart />

      {/* desktop app teaser */}
      <section className="border-t border-border py-20 sm:py-24 section-alt">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <SectionHeading
              index="09"
              eyebrow="desktop"
              title={
                <>
                  Same engine,{" "}
                  <span className="text-kai-orange glow-orange">new surface</span>
                </>
              }
              description="Everything the TUI does — chat, research, wiki, knowledge cards — in a window with diff approval you can read and runs you can watch concurrently."
              align="center"
            />
          </Reveal>

          <div className="mx-auto mt-10 max-w-3xl">
            <div className="rounded-md border border-border/60 bg-kai-panel/20 p-px panel-glow">
              <AppWindow size="sm" start="chat" />
            </div>
          </div>

          <div className="mt-8 flex justify-center">
            <LinkButton to="/desktop" size="lg" className="rounded-md">
              <Monitor className="size-4" data-icon="inline-start" />
              Explore the desktop app
              <ArrowRight data-icon="inline-end" />
            </LinkButton>
          </div>
        </div>
      </section>

      {/* design decisions + roadmap */}
      <section className="border-t border-border py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-kai-panel/60 px-3 py-1">
                  <span className="text-kai-orange text-[10px]" aria-hidden>▎</span>
                  <span className="font-mono text-[11px] font-bold text-kai-amber">10</span>
                  <span className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">design decisions</span>
                </div>
                <dl className="mt-7 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                  {DESIGN_DECISIONS.map((d) => (
                    <div key={d.title}>
                      <dt className="font-mono text-[13px] font-bold text-foreground">{d.title}</dt>
                      <dd className="mt-1 font-sans text-[13.5px] leading-relaxed text-muted-foreground">
                        {d.body}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-kai-panel/60 px-3 py-1">
                  <span className="text-kai-dim text-[10px]" aria-hidden>▎</span>
                  <span className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">roadmap · not yet built</span>
                </div>
                <ul className="mt-7 space-y-3">
                  {ROADMAP.map((item) => (
                    <li key={item} className="flex gap-2.5 font-mono text-[12.5px] leading-relaxed">
                      <span className="mt-px shrink-0 text-kai-dim" aria-hidden>
                        ☐
                      </span>
                      <span className="text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}
