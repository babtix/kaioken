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

/* ── page ────────────────────────────────────────────────────────────────── */

export default function Desktop() {
  return (
    <>
      {/* ── hero with the interactive app window ──────────────────────────── */}
      <section className="relative isolate overflow-hidden pt-14">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-kai-orange/[0.03] via-background to-background" />

        <div className="mx-auto max-w-6xl px-4 pt-14 pb-12 sm:px-6 sm:pt-20 sm:pb-16">
          <div className="animate-rise text-center">
            <p className="font-mono text-[11px] tracking-[0.3em] text-kai-dim uppercase">
              same engine · new surface
            </p>
            <h1 className="mx-auto mt-4 max-w-3xl text-balance font-mono text-[26px] leading-tight font-bold tracking-tight text-foreground sm:text-4xl md:text-[42px]">
              The <span className="text-kai-orange glow-orange">desktop app</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl font-sans text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              Everything the CLI does — chat, research, wiki, knowledge cards, skills — in a window
              with diff approval you can read, a wiki you can browse, and runs you can watch
              concurrently.
            </p>

            {/* stats row */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
              {DESKTOP_STATS.map((s) => (
                <div key={s.label} className="text-center">
                  <span className="block font-mono text-2xl font-bold text-kai-orange">{s.value}</span>
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

          {/* The centrepiece: a working recreation of the window */}
          <div className="animate-rise mx-auto mt-12 max-w-4xl" style={{ animationDelay: "0.2s" }}>
            <AppWindow size="lg" start="chat" />
          </div>
        </div>
      </section>

      {/* ── surfaces grid ─────────────────────────────────────────────────── */}
      <section className="border-t border-border py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            index="01"
            eyebrow="surfaces"
            title={
              <>
                Twelve screens,{" "}
                <span className="text-kai-orange glow-orange">one rail click away</span>
              </>
            }
            description="Every capability the TUI has, re-surfaced for a screen where you can actually see what's happening."
          />

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SURFACES.map((s) => (
              <div
                key={s.label}
                className={cn(
                  "group relative overflow-hidden rounded-md border p-5 transition-colors hover:bg-accent/40",
                  toneBg[s.tone]
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn("mt-0.5 shrink-0", toneText[s.tone])}>
                    <Icon name={s.icon} className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <h3 className="font-mono text-sm font-bold text-foreground">{s.label}</h3>
                      {s.key ? (
                        <span className="shrink-0 rounded-sm border border-border px-1 py-px text-[10px] text-kai-dim">
                          {s.key}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 font-mono text-[12px] font-semibold text-kai-amber">
                      {s.headline}
                    </p>
                    <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{s.body}</p>
                    <ul className="mt-3 space-y-1.5">
                      {s.points.map((pt) => (
                        <li
                          key={pt}
                          className="flex items-start gap-1.5 font-mono text-[11px] leading-relaxed text-kai-muted"
                        >
                          <span className={cn("mt-px shrink-0", toneText[s.tone])} aria-hidden>
                            ▸
                          </span>
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── architecture layers ───────────────────────────────────────────── */}
      <section className="border-t border-border py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            index="02"
            eyebrow="architecture"
            title={
              <>
                Four layers,{" "}
                <span className="text-kai-orange glow-orange">no engine rewrite</span>
              </>
            }
            description="The desktop app is a new surface on the existing Go engine — not a rewrite. The Rust shell is thin on purpose."
          />

          <div className="mt-12 space-y-4">
            {LAYERS.map((layer, i) => (
              <div
                key={layer.id}
                className={cn(
                  "rounded-md border p-5 transition-colors",
                  toneBg[layer.tone]
                )}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-sm border border-border bg-card font-mono text-sm font-bold text-kai-amber">
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="font-mono text-sm font-bold text-foreground">{layer.title}</h3>
                      <p className="font-mono text-[11px] text-kai-dim">{layer.subtitle}</p>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-relaxed text-muted-foreground">{layer.detail}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {layer.parts.map((p) => (
                        <span
                          key={p}
                          className={cn(
                            "rounded-sm border px-1.5 py-0.5 font-mono text-[10px]",
                            toneBg[layer.tone],
                            toneText[layer.tone]
                          )}
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TUI vs Desktop comparison ─────────────────────────────────────── */}
      <section className="border-t border-border py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            index="03"
            eyebrow="honestly"
            title={
              <>
                When the GUI wins —{" "}
                <span className="text-kai-orange glow-orange">and when it doesn't</span>
              </>
            }
            description="The TUI is not deprecated. Some jobs are better in a terminal. Here's the honest split."
          />

          <div className="mt-12 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-3 pr-4 text-left font-mono text-[11px] tracking-[0.18em] text-kai-dim uppercase">
                    Job
                  </th>
                  <th className="px-4 py-3 text-left font-mono text-[11px] tracking-[0.18em] text-kai-dim uppercase">
                    TUI
                  </th>
                  <th className="px-4 py-3 text-left font-mono text-[11px] tracking-[0.18em] text-kai-dim uppercase">
                    Desktop
                  </th>
                  <th className="py-3 pl-4 text-right font-mono text-[11px] tracking-[0.18em] text-kai-dim uppercase">
                    Winner
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.job} className="border-b border-border/60">
                    <td className="py-3 pr-4 font-mono text-[12px] font-semibold text-foreground">
                      {row.job}
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-muted-foreground">{row.tui}</td>
                    <td className="px-4 py-3 text-[12.5px] text-muted-foreground">{row.desktop}</td>
                    <td className="py-3 pl-4 text-right">
                      <span
                        className={cn(
                          "inline-block rounded-sm border px-1.5 py-0.5 font-mono text-[10px]",
                          row.winner === "desktop" && "border-kai-orange/40 text-kai-orange",
                          row.winner === "tui" && "border-kai-green/40 text-kai-green",
                          row.winner === "tie" && "border-border text-kai-dim"
                        )}
                      >
                        {row.winner}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── principles ────────────────────────────────────────────────────── */}
      <section className="border-t border-border py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            index="04"
            eyebrow="principles"
            title={
              <>
                Built <span className="text-kai-orange glow-orange">this way</span> on purpose
              </>
            }
          />

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <div
                key={p.title}
                className="group rounded-md border border-border bg-card/60 p-5 transition-colors hover:border-kai-orange/30"
              >
                <div className="flex items-start gap-3">
                  <Icon name={p.icon} className="mt-0.5 size-5 shrink-0 text-kai-orange" />
                  <div>
                    <h3 className="font-mono text-sm font-bold text-foreground">{p.title}</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{p.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── keyboard shortcuts ─────────────────────────────────────────────── */}
      <section className="border-t border-border py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            index="05"
            eyebrow="shortcuts"
            title={
              <>
                <span className="text-kai-orange glow-orange">Keyboard-first</span>, always
              </>
            }
            description="Everything reachable by mouse is also reachable without one. The bindings mirror VS Code where they can."
          />

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {SHORTCUT_GROUPS.map((g) => (
              <div key={g.group} className="rounded-md border border-border bg-card/60 p-4">
                <h4 className="font-mono text-[11px] tracking-[0.2em] text-kai-amber uppercase">
                  {g.group}
                </h4>
                <div className="mt-3 divide-y divide-border/60">
                  {g.items.map((item) => (
                    <div key={item.keys} className="flex items-center justify-between py-1.5">
                      <span className="text-[12.5px] text-muted-foreground">{item.label}</span>
                      <kbd className="shrink-0 rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-kai-dim">
                        {item.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── platforms + build ──────────────────────────────────────────────── */}
      <section className="border-t border-border py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            index="06"
            eyebrow="platforms"
            title={
              <>
                <span className="text-kai-orange glow-orange">Three platforms</span>, three
                commands
              </>
            }
            description={DISTRIBUTION_NOTE}
          />

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {PLATFORMS.map((p) => (
              <div key={p.id} className="rounded-md border border-border bg-card/60 p-5">
                <h3 className="font-mono text-sm font-bold text-foreground">{p.label}</h3>
                <p className="mt-1 font-mono text-[11px] text-kai-amber">{p.artifacts}</p>
                <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">{p.note}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 font-mono text-[11px] tracking-[0.18em] text-kai-dim uppercase">
                build it yourself
              </p>
              <CodeBlock code={BUILD_STEPS} title="build" prompt />
            </div>
            <div>
              <p className="mb-2 font-mono text-[11px] tracking-[0.18em] text-kai-dim uppercase">
                proof it's just HTTP
              </p>
              <CodeBlock code={CURL_PROOF} title="curl" prompt />
            </div>
          </div>
        </div>
      </section>

      {/* ── closing CTA ───────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-border">
        <div className="rule-sweep absolute inset-x-0 top-0 h-px" aria-hidden />
        <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-24">
          <p className="font-mono text-[11px] tracking-[0.3em] text-kai-dim uppercase">
            same binary · new window
          </p>
          <h2 className="mx-auto mt-4 max-w-2xl text-balance font-mono text-2xl font-bold text-foreground sm:text-3xl">
            A surface worth{" "}
            <span className="text-kai-orange glow-orange">looking at</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl font-sans text-[15px] leading-relaxed text-muted-foreground">
            The TUI stays the first citizen — it is the engine. The desktop app is the lens that
            makes the wiki readable, the diffs reviewable, and the cost visible without asking.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
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
