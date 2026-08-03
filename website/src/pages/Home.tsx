import { ArrowRight, Monitor } from "lucide-react"
import GithubMark from "@/components/GithubMark"
import Hero from "@/components/sections/Hero"
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
import { DESIGN_DECISIONS, GITHUB_URL, ROADMAP } from "@/data/content"

export default function Home() {
  return (
    <>
      {/* the page-wide backdrop; the hero's WebGL shader layers on top of it
          inside its own isolated stacking context */}
      <PageBackground />
      <Hero />
      <Features />
      <Pipeline />
      <Research />
      <Multiplier />
      <Quality />
      <Commands />
      <OutputTree />
      <QuickStart />

      {/* desktop app teaser */}
      <section className="border-t border-border py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
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

          <div className="mx-auto mt-10 max-w-3xl">
            <AppWindow size="sm" start="chat" />
          </div>

          <div className="mt-8 flex justify-center">
            <LinkButton to="/desktop" size="lg">
              <Monitor className="size-4" data-icon="inline-start" />
              Explore the desktop app
              <ArrowRight data-icon="inline-end" />
            </LinkButton>
          </div>
        </div>
      </section>

      {/* design decisions + roadmap, then the closing call to action */}
      <section className="border-t border-border py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.25em] uppercase">
                <span className="text-kai-orange" aria-hidden>
                  ▎
                </span>
                <span className="text-kai-amber">10</span>
                <span className="text-muted-foreground">design decisions</span>
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
              <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.25em] uppercase">
                <span className="text-kai-dim" aria-hidden>
                  ▎
                </span>
                <span className="text-muted-foreground">roadmap · not yet built</span>
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
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-border">
        <div className="rule-sweep absolute inset-x-0 top-0 h-px" aria-hidden />
        <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-24">
          <p className="font-mono text-[11px] tracking-[0.3em] text-kai-dim uppercase">
            ready when you are
          </p>
          <h2 className="mx-auto mt-4 max-w-2xl text-balance font-mono text-2xl font-bold text-foreground sm:text-3xl">
            Point it at a repo and{" "}
            <span className="text-kai-orange glow-orange">read what comes back</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl font-sans text-[15px] leading-relaxed text-muted-foreground">
            The scan is free, the plan is a file you can edit, and the cost estimate prints before
            anything expensive runs.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <LinkButton to="/docs/install" size="lg">
              Start here
              <ArrowRight data-icon="inline-end" />
            </LinkButton>
            <LinkButton href={GITHUB_URL} variant="outline" size="lg">
              <GithubMark data-icon="inline-start" />
              Read the source
            </LinkButton>
          </div>
        </div>
      </section>
    </>
  )
}
