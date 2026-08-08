import { ArrowRight } from "lucide-react"
import * as React from "react"
import GithubMark from "@/components/GithubMark"
import TerminalDemo from "@/components/TerminalDemo"
import LinkButton from "@/components/LinkButton"
import { GITHUB_URL } from "@/data/content"

// The shader pulls in the whole ogl WebGL library — load it after the first
// paint so phones parse the landing page itself before the effect starts.
const FaultyTerminal = React.lazy(() => import("@/bits/FaultyTerminal"))

// The WebGL shader is too heavy for phone GPUs (it thermally throttles and
// janks the whole page). Only run it on tablet/desktop widths; phones get a
// cheap CSS scanline overlay instead.
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return isDesktop
}

export default function Hero() {
  const isDesktop = useIsDesktop()
  return (
    <section className="relative isolate overflow-hidden pt-14">
      {isDesktop ? (
        // React Bits FaultyTerminal, tinted to the TUI's orange (ANSI 208).
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.55]">
          <React.Suspense fallback={null}>
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
              fps={30}
              resolutionScale={0.5}
            />
          </React.Suspense>
        </div>
      ) : (
        // Mobile: a static, GPU-free CRT scanline tint for texture.
        <div
          aria-hidden
          className="crt-scanlines pointer-events-none absolute inset-0 -z-10 opacity-30"
        />
      )}
      {/* Keep the type readable over the shader. Stops short of fully opaque at
          the bottom so the page backdrop carries on through the seam. */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-background/50 via-background/70 to-background/90" />

      <div className="mx-auto max-w-6xl px-4 pt-14 pb-20 sm:px-6 sm:pt-20">
        <div className="animate-rise text-center">
          {/* Colored KAIOKEN logo — from KAIOKEN-logo.html */}
          <div
            className="mx-auto inline-block max-w-full overflow-hidden text-center"
            aria-label="kaioken"
            dangerouslySetInnerHTML={{ __html: `<div style="font-family:'JetBrains Mono','Courier New',monospace;font-size:clamp(6px,1.6vw,20px);line-height:1.25;font-weight:800;white-space:pre;display:inline-block"><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span><span style="color:#ff8700"> </span><span style="color:#ff8700"> </span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span>  <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span>  <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span>  <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span><span style="color:#663600"> </span> <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span><span style="color:#ff8700"> </span><span style="color:#ff8700"> </span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span> <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span> <span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span><span style="color:#ff8700"> </span><span style="color:#ff8700"> </span><span style="color:#ff8700"> </span><span style="color:#ff8700">█</span><span style="color:#ff8700">█</span><span style="color:#663600">╗</span>\n<span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">║</span><span style="color:#ff6c00"> </span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">╝</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╗</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">║</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╗</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">║</span><span style="color:#ff6c00"> </span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">╝</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╔</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">═</span><span style="color:#662b00">╝</span> <span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">╗</span><span style="color:#ff6c00"> </span><span style="color:#ff6c00"> </span><span style="color:#ff6c00">█</span><span style="color:#ff6c00">█</span><span style="color:#662b00">║</span>\n<span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╔</span><span style="color:#662000">╝</span><span style="color:#662000"> </span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span><span style="color:#ff5100"> </span><span style="color:#ff5100"> </span><span style="color:#ff5100"> </span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╔</span><span style="color:#662000">╝</span><span style="color:#662000"> </span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╗</span><span style="color:#662000"> </span><span style="color:#662000"> </span> <span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╔</span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">╗</span><span style="color:#ff5100"> </span><span style="color:#ff5100">█</span><span style="color:#ff5100">█</span><span style="color:#662000">║</span>\n<span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╔</span><span style="color:#661600">═</span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╗</span><span style="color:#661600"> </span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╔</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span><span style="color:#ff3600"> </span><span style="color:#ff3600"> </span><span style="color:#ff3600"> </span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╔</span><span style="color:#661600">═</span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╗</span><span style="color:#661600"> </span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╔</span><span style="color:#661600">═</span><span style="color:#661600">═</span><span style="color:#661600">╝</span><span style="color:#661600"> </span><span style="color:#661600"> </span> <span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span><span style="color:#661600">╚</span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">╗</span><span style="color:#ff3600">█</span><span style="color:#ff3600">█</span><span style="color:#661600">║</span>\n<span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span><span style="color:#ff1b00"> </span><span style="color:#ff1b00"> </span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">╗</span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span><span style="color:#ff1b00"> </span><span style="color:#ff1b00"> </span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span> <span style="color:#660b00">╚</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">╔</span><span style="color:#660b00">╝</span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span><span style="color:#ff1b00"> </span><span style="color:#ff1b00"> </span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">╗</span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">╗</span> <span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span><span style="color:#660b00"> </span><span style="color:#660b00">╚</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#ff1b00">█</span><span style="color:#660b00">║</span>\n<span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span> <span style="color:#660000"> </span><span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">╝</span> <span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">╝</span><span style="color:#660000"> </span><span style="color:#660000"> </span><span style="color:#660000">╚</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">═</span><span style="color:#660000">╝</span></div>` }}
          />
        </div>

        <div className="animate-rise mx-auto mt-10 max-w-4xl text-center" style={{ animationDelay: "0.1s" }}>
          {/* Feature pill */}
          <div className="inline-flex items-center gap-2 rounded-full border border-kai-orange/30 bg-kai-orange/8 px-4 py-1.5 font-mono text-[11px] text-kai-amber">
            <span className="size-1.5 rounded-full bg-kai-green animate-pulse inline-block" aria-hidden />
            Autonomous repo indexing & deep knowledge engine
          </div>

          {/* Main heading — much larger */}
          <h1 className="mt-6 text-balance font-mono font-bold tracking-tight text-foreground"
            style={{ fontSize: "clamp(32px, 5.5vw, 62px)", lineHeight: 1.1 }}
          >
            A terminal AI coding assistant
            <br />
            <span className="text-kai-orange glow-orange">+</span>
            <br />
            <span className="text-kai-orange glow-orange">knowledge engine</span>
          </h1>

          {/* Description */}
          <p className="mx-auto mt-6 max-w-2xl font-sans text-[16px] leading-relaxed text-muted-foreground sm:text-[17px]">
            One binary, two faces. A chat agent that edits your repo behind diff approval — and an
            engine that turns the codebase into deep wikis, knowledge cards and skills your agent
            actually loads before it starts working.
          </p>
        </div>

        {/* CTAs */}
        <div
          className="animate-rise mt-10 flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "0.2s" }}
        >
          <LinkButton to="/docs/install" size="lg" className="btn-glow rounded-md px-7 text-[15px]">
            Get started
            <ArrowRight data-icon="inline-end" />
          </LinkButton>
          <LinkButton href={GITHUB_URL} variant="outline" size="lg" className="rounded-md px-7 text-[15px] transition-all hover:border-kai-orange/40 hover:bg-kai-orange/5">
            <GithubMark data-icon="inline-start" />
            View source
          </LinkButton>
        </div>


        {/* Terminal demo with glowing frame */}
        <div
          className="animate-rise mx-auto mt-14 max-w-3xl"
          style={{ animationDelay: "0.3s" }}
        >
          <div className="rounded-md border border-kai-orange/20 p-px panel-glow">
            <TerminalDemo />
          </div>
        </div>

        {/* Scroll hint */}
        <div className="animate-rise mt-10 flex justify-center" style={{ animationDelay: "0.5s" }}>
          <span className="animate-float flex flex-col items-center gap-1 font-mono text-[10px] tracking-widest text-kai-dim uppercase">
            scroll
            <svg width="12" height="16" viewBox="0 0 12 16" fill="none" aria-hidden>
              <path d="M6 1v14M1 10l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </div>
    </section>
  )
}
