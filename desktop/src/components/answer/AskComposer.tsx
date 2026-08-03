import { useRef, useState } from "react"
import { ArrowUp, Globe, Layers, Search, SlidersHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { PowerMeter } from "@/components/hud"

/**
 * The ask composer.
 *
 * Perplexity's composer is a single confident target that states what will
 * happen when you press it. The gaming half is the power dial: ×N is the
 * Kaioken multiplier the engine already honours, and it is exposed here rather
 * than buried in settings because it is the one control that changes what a
 * run costs — more subquestions, more queries, more pages, more rounds.
 *
 * The estimate line under the dial is the point. A gauge that only glowed
 * would be decoration; one that says "≈24 queries · ≈16 pages · 2 rounds"
 * turns a game flourish into an honest cost preview.
 *
 * ×1 through ×9 scale smoothly — each step buys a bit more of the same shape
 * of report. ×10 does not: the engine switches to a different pipeline there
 * (internal/research's deep profile), one chapter written at a time against
 * its own retrieved evidence, assembled into a sectioned dossier with a
 * findings register, a search log and a coverage log, and exported to a
 * signed PDF. A slider that steps from 9 to 10 like any other notch hides
 * that discontinuity — the ×N dial reads Normal/Advanced instead, so the
 * jump to a different kind of output is a choice, not a slider position.
 */
export function AskComposer({
  onSubmit,
  busy = false,
  placeholder = "Ask anything — the web will be searched and read",
  autoFocus,
}: {
  onSubmit?: (question: string, power: number, web: boolean) => void
  busy?: boolean
  placeholder?: string
  autoFocus?: boolean
}) {
  const [value, setValue] = useState("")
  const [mode, setMode] = useState<"normal" | "advanced">("normal")
  const [normalPower, setNormalPower] = useState(3)
  const [web, setWeb] = useState(true)
  const ref = useRef<HTMLTextAreaElement>(null)

  // ×10 is a fixed regime, not a slider position — see the module comment.
  const power = mode === "advanced" ? 10 : normalPower

  const submit = () => {
    const q = value.trim()
    if (!q || busy) return
    onSubmit?.(q, power, web)
    setValue("")
  }

  return (
    <div
      className={cn(
        "hud-corners rounded-[var(--radius)] border bg-card transition-shadow",
        busy ? "hud-rim border-kai-orange/40" : "hud-rim-focus border-input"
      )}
    >
      <textarea
        ref={ref}
        rows={2}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends, Shift+Enter breaks the line — the convention every
          // chat surface has trained users into.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
        placeholder={placeholder}
        className="w-full resize-none bg-transparent px-3 pt-2.5 pb-1 font-sans text-[13.5px]
                   text-kai-text placeholder:text-kai-dim outline-none"
      />

      <div className="flex flex-wrap items-center gap-2 px-2.5 pb-2">
        <button
          type="button"
          onClick={() => setWeb((v) => !v)}
          aria-pressed={web}
          title={web ? "Searching the web" : "Repository only"}
          className={cn(
            "flex items-center gap-1.5 rounded-[var(--radius)] border px-2 py-1",
            "font-mono text-[10.5px] transition-colors outline-none",
            "focus-visible:ring-2 focus-visible:ring-kai-orange/50",
            web
              ? "border-kai-orange/40 bg-kai-orange/10 text-kai-orange"
              : "border-border text-kai-dim hover:text-kai-text"
          )}
        >
          {web ? <Globe size={11} /> : <Search size={11} />}
          {web ? "Web" : "Repo"}
        </button>

        <ModeToggle mode={mode} onChange={setMode} />

        <div className="flex min-w-0 flex-1 items-center gap-2">
          {mode === "normal" ? (
            <>
              <PowerMeter value={normalPower} max={9} className="max-w-[170px] flex-1" />
              <input
                type="range"
                min={1}
                max={9}
                value={normalPower}
                onChange={(e) => setNormalPower(Number(e.target.value))}
                aria-label="Research depth multiplier"
                className="h-1 w-16 shrink-0 cursor-pointer accent-[var(--kai-orange)]"
              />
            </>
          ) : (
            <span className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold
                              tracking-wide text-kai-orange">
              <Layers size={12} className="shrink-0" />
              ×10 · MASSIVE DOSSIER
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || busy}
          aria-label="Ask"
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)]",
            "transition-all outline-none focus-visible:ring-2 focus-visible:ring-kai-orange/60",
            value.trim() && !busy
              ? "hud-glow bg-kai-orange text-[var(--primary-foreground)] hover:brightness-110"
              : "cursor-not-allowed bg-muted text-kai-dim"
          )}
        >
          <ArrowUp size={14} />
        </button>
      </div>

      <div className="border-t border-border px-3 py-1.5">
        <p
          className={cn(
            "font-mono text-[10px]",
            mode === "advanced" ? "text-kai-orange/90" : "text-kai-dim"
          )}
        >
          {estimate(mode, power, web)}
        </p>
      </div>
    </div>
  )
}

/**
 * ModeToggle is the Normal/Advanced switch. It is a plain two-button segment
 * rather than a third slider notch, because Normal and Advanced are not two
 * points on one scale — they are two different pipelines (see the module
 * comment) and the control should say so at a glance.
 */
function ModeToggle({
  mode,
  onChange,
}: {
  mode: "normal" | "advanced"
  onChange: (m: "normal" | "advanced") => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Research mode"
      className="flex shrink-0 overflow-hidden rounded-[var(--radius)] border border-border"
    >
      <ModeButton
        active={mode === "normal"}
        onClick={() => onChange("normal")}
        icon={SlidersHorizontal}
        label="Normal"
        title="Normal — the everyday report, depth adjustable ×1 to ×9"
      />
      <ModeButton
        active={mode === "advanced"}
        onClick={() => onChange("advanced")}
        icon={Layers}
        label="Advanced"
        title="Advanced — ×10 deep research: a massive, exhaustively detailed dossier with a signed PDF"
        accent
      />
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
  title,
  accent = false,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Layers
  label: string
  title: string
  accent?: boolean
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      title={title}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-2 py-1 font-mono text-[10.5px] transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-kai-orange/50",
        active
          ? accent
            ? "bg-kai-orange/15 text-kai-orange"
            : "bg-accent text-kai-text"
          : "text-kai-dim hover:text-kai-text"
      )}
    >
      <Icon size={11} />
      {label}
    </button>
  )
}

/**
 * estimate mirrors the ceilings the engine actually applies.
 *
 * Normal mirrors internal/research.Run's shallow-profile clamps: queries 3N
 * capped at 24, pages 4N capped at 40, rounds 1+N/2 capped at 5. Advanced
 * mirrors the deep profile instead (research.planFor at mult>=10): a fixed
 * 8 rounds of up to 32 queries and 60 new pages each — a ceiling of ~480
 * pages, not a formula in N, because ×10 is not a point on the same curve.
 * Keeping both arithmetic paths identical to the engine matters — a preview
 * that drifts from what actually runs is worse than no preview.
 */
function estimate(mode: "normal" | "advanced", power: number, web: boolean): string {
  if (!web) return "Repository only — no web search, no pages fetched"
  if (mode === "advanced") {
    return "Deep dossier: up to 32 queries × 8 rounds · up to 480 pages scanned · " +
      "sectioned report with a findings register, search log and coverage log · " +
      "signed PDF, 12+ pages guaranteed — not token-efficient, for when the answer matters more than the bill"
  }
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi))
  const queries = clamp(3 * power, 3, 24)
  const pages = clamp(4 * power, 4, 40)
  const rounds = clamp(1 + Math.floor(power / 2), 1, 5)
  return `≈${queries} queries · ≈${pages} pages · up to ${rounds} round${rounds === 1 ? "" : "s"}`
}
