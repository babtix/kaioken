/**
 * Standalone design-system harness.
 *
 * The app proper cannot render outside Tauri — main.tsx blocks on bootstrap()
 * because there is no meaningful UI without a daemon. That is the right call
 * for the product and the wrong one for reviewing visuals, so this second
 * Vite entry mounts the new surfaces against fixed data with no daemon, no
 * router and no stores.
 *
 * Open it with:  vite  →  http://localhost:1420/showcase.html
 */
import { StrictMode, useState } from "react"
import { createRoot } from "react-dom/client"
import { Moon, Sun } from "lucide-react"
import { useThemeStore } from "@/store/theme"
import { GlowButton, HudPanel, LiveDot, PowerMeter, SectionLabel } from "@/components/hud"
import { AnswerCard } from "@/components/answer/AnswerCard"
import { AskComposer } from "@/components/answer/AskComposer"
import { SourceCard, SourceRow } from "@/components/answer/SourceChip"
import { ResearchSteps } from "@/components/answer/ResearchSteps"
import type { Answer } from "@/components/answer/types"
import "./index.css"

const SAMPLE: Answer = {
  question: "Is solar cheaper than nuclear in Europe?",
  body: `Utility-scale solar is now the cheaper source per megawatt-hour across most of Europe, but the comparison turns on what you are buying [1]. Southern European solar fell below EUR 40/MWh during 2024, while European nuclear ranges roughly EUR 70–140/MWh once financing is included [2][4].

The gap narrows once dispatchability is priced in. Nuclear runs at an 80 percent capacity factor against roughly 15 percent for solar in Northern Europe, so a megawatt of nuclear delivers far more energy per installed unit [3]. Storage and grid reinforcement costs are carried by the solar figure only in some methodologies [5].

Sources disagree mainly on financing assumptions. Studies using a 3 percent discount rate put nuclear near the bottom of its range; those assuming merchant financing put it near the top [4].`,
  sources: [
    { n: 1, url: "https://www.iea.org/reports/electricity-2025", title: "Electricity 2025 — Analysis and forecast to 2027" },
    { n: 2, url: "https://ember-energy.org/latest-insights/european-electricity-review", title: "European Electricity Review: solar overtakes coal" },
    { n: 3, url: "https://world-nuclear.org/information-library/economics", title: "Economics of Nuclear Power" },
    { n: 4, url: "https://www.lazard.com/research-insights/levelized-cost-of-energyplus", title: "Lazard's Levelized Cost of Energy+ (LCOE 17.0)" },
    { n: 5, url: "https://www.irena.org/publications/renewable-power-generation-costs", title: "Renewable Power Generation Costs in 2024" },
  ],
  steps: [
    {
      label: "Planning the research",
      detail: "6 subquestions",
      details: [
        "6 subquestions",
        "What is the levelised cost of utility-scale solar in Europe?",
        "What is the levelised cost of new nuclear in Europe?",
        "How do capacity factors differ between the two?",
        "Are storage and grid costs included in either figure?",
        "Which financing assumptions drive the spread between studies?",
        "Do 2025 construction cost updates change the comparison?",
      ],
      state: "done",
    },
    { label: "Searching the web", detail: "solar cost europe · nuclear cost europe · capacity factor", state: "done" },
    { label: "Reading 14 pages", detail: "3 unreadable, skipped", state: "done" },
    { label: "Checking for gaps", detail: "missing 2025 construction costs", state: "done" },
    { label: "Searching again", detail: "hinkley point c cost 2025 · flamanville 3 cost", state: "done" },
    { label: "Writing the report", state: "running" },
  ],
  followUps: [
    "What are the 2025 nuclear construction costs?",
    "How do storage costs change the comparison?",
    "Which countries subsidise solar most heavily?",
    "What is the capacity factor gap by region?",
  ],
  incomplete: true,
}

function Showcase() {
  // Deliberately the real store, not a local copy: the theme swap has a
  // subtle stale-paint failure mode, and a harness with its own toggle would
  // not exercise the fix that matters.
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const dark = theme === "dark"
  const [power, setPower] = useState(3)

  return (
    <div className="hud-grid min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <header className="mb-8 flex items-center gap-4">
          <div className="flex-1">
            <h1 className="font-mono text-xl font-bold tracking-tight text-kai-orange">
              KAIOKEN
              <span className="ml-2 text-kai-dim">design system</span>
            </h1>
            <p className="mt-1 font-mono text-[11px] text-kai-dim">
              HUD chrome + research-report answer surface
            </p>
          </div>
          <LiveDot label="daemon connected" />
          <button
            type="button"
            onClick={toggleTheme}
            className="hud-corners flex items-center gap-1.5 rounded-[var(--radius)] border border-border
                       bg-card px-2.5 py-1.5 font-mono text-[11px] text-kai-text
                       transition-colors hover:border-kai-orange/40 hover:bg-accent"
          >
            {dark ? <Moon size={12} /> : <Sun size={12} />}
            {dark ? "Dark" : "Light"}
          </button>
        </header>

        <div className="space-y-8">
          <section className="space-y-3">
            <SectionLabel>Ask composer</SectionLabel>
            <AskComposer autoFocus={false} />
          </section>

          <section className="space-y-3">
            <SectionLabel>Answer — a report, not a bubble</SectionLabel>
            <AnswerCard answer={SAMPLE} searched={18} rounds={2} busy />
          </section>

          <section className="space-y-3">
            <SectionLabel>HUD primitives</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <HudPanel className="space-y-3 p-4">
                <div className="font-mono text-[11px] text-kai-dim">Power level ×{power}</div>
                <PowerMeter value={power} max={10} />
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={power}
                  onChange={(e) => setPower(Number(e.target.value))}
                  className="w-full accent-[var(--kai-orange)]"
                  aria-label="Power level"
                />
                <p className="font-mono text-[10px] text-kai-dim">
                  Segments turn red past ×7 — the run gets genuinely expensive there.
                </p>
              </HudPanel>

              <HudPanel live scanlines className="space-y-3 p-4">
                <div className="font-mono text-[11px] text-kai-text">Live panel (rim + scanlines)</div>
                <LiveDot label="round 2 of 3" />
                <div className="flex gap-2">
                  <GlowButton busy>Researching</GlowButton>
                  <GlowButton>Ask</GlowButton>
                </div>
                <GlowButton disabled>Disabled</GlowButton>
              </HudPanel>
            </div>
          </section>

          <section className="space-y-3">
            <SectionLabel>Provenance</SectionLabel>
            <div className="flex flex-wrap items-center gap-3">
              <SourceRow sources={SAMPLE.sources} />
              <span className="font-mono text-[10px] text-kai-dim">
                ← collapsed row · full cards below
              </span>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {SAMPLE.sources.slice(0, 4).map((s) => (
                <SourceCard key={s.n} source={s} />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <SectionLabel>Research trail</SectionLabel>
            <ResearchSteps
              steps={SAMPLE.steps}
              searched={18}
              rounds={2}
              sourceCount={5}
              defaultOpen
            />
          </section>
        </div>
      </div>
    </div>
  )
}

// Same guard as main.tsx: Vite re-evaluates this module on HMR, and calling
// createRoot twice on the same container is a hard React error, so the root
// is cached on the container itself.
type RootHost = HTMLElement & { __kaiRoot?: ReturnType<typeof createRoot> }

const host = document.getElementById("root") as RootHost
if (!host.__kaiRoot) host.__kaiRoot = createRoot(host)
host.__kaiRoot.render(
  <StrictMode>
    <Showcase />
  </StrictMode>
)
