import { ArrowRight } from "lucide-react"
import GithubMark from "@/components/GithubMark"
import AsciiArt from "@/components/AsciiArt"
import FaultyTerminal from "@/bits/FaultyTerminal"
import TerminalDemo from "@/components/TerminalDemo"
import { Badge } from "@/components/ui/badge"
import LinkButton from "@/components/LinkButton"
import { ASCII_LOGO, GITHUB_URL, PROVIDERS } from "@/data/content"

export default function Hero() {
  return (
    <section className="relative isolate overflow-hidden pt-14">
      {/* React Bits FaultyTerminal, tinted to the TUI's orange (ANSI 208). */}
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.55]">
        <FaultyTerminal
          scale={1.6}
          gridMul={[2, 1]}
          digitSize={1.4}
          timeScale={0.35}
          scanlineIntensity={0.55}
          glitchAmount={1}
          flickerAmount={0.7}
          noiseAmp={1}
          chromaticAberration={0}
          curvature={0.08}
          tint="#ff8700"
          mouseReact
          mouseStrength={0.35}
          dpr={1}
          pageLoadAnimation
          brightness={0.7}
        />
      </div>
      {/* Keep the type readable over the shader. */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-background/50 via-background/75 to-background" />

      <div className="mx-auto max-w-6xl px-4 pt-14 pb-20 sm:px-6 sm:pt-20">
        <div className="animate-rise text-center">
          {/* 60 columns wide — the per-breakpoint sizes are chosen so the
              block always clears the container without needing to scroll. */}
          <AsciiArt
            art={ASCII_LOGO}
            label="kaioken"
            className="text-[8px] sm:text-[13px] md:text-[18px] lg:text-[23px]"
          />
        </div>

        <div className="animate-rise mx-auto mt-10 max-w-3xl text-center" style={{ animationDelay: "0.1s" }}>
          <Badge
            variant="outline"
            className="rounded-sm border-kai-orange/35 bg-kai-orange/10 font-mono text-[11px] text-kai-amber"
          >
            single Go binary · TUI · provider-agnostic
          </Badge>
          <h1 className="mt-5 text-balance font-mono text-[26px] leading-tight font-bold tracking-tight text-foreground sm:text-4xl md:text-[42px]">
            A terminal AI coding assistant
            <br className="hidden sm:block" />{" "}
            <span className="text-kai-orange glow-orange">+ knowledge engine</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl font-sans text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            One binary, two faces. A chat agent that edits your repo behind diff approval — and an
            engine that turns the codebase into deep wikis, knowledge cards and skills your agent
            actually loads before it starts working.
          </p>
        </div>

        <div
          className="animate-rise mt-9 flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "0.2s" }}
        >
          <LinkButton to="/docs/install" size="lg">
            Get started
            <ArrowRight data-icon="inline-end" />
          </LinkButton>
          <LinkButton href={GITHUB_URL} variant="outline" size="lg">
            <GithubMark data-icon="inline-start" />
            View source
          </LinkButton>
        </div>

        <p
          className="animate-rise mt-7 text-center font-mono text-[11px] text-kai-dim"
          style={{ animationDelay: "0.3s" }}
        >
          {PROVIDERS.join("  ·  ")}
        </p>

        <div
          className="animate-rise mx-auto mt-14 max-w-3xl"
          style={{ animationDelay: "0.4s" }}
        >
          <TerminalDemo />
        </div>
      </div>
    </section>
  )
}
