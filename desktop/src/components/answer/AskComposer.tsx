import { useRef, useState } from "react"
import { ArrowUp, Globe, Search } from "lucide-react"
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
  const [power, setPower] = useState(3)
  const [web, setWeb] = useState(true)
  const ref = useRef<HTMLTextAreaElement>(null)

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

      <div className="flex items-center gap-2 px-2.5 pb-2">
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

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <PowerMeter value={power} max={10} className="max-w-[190px] flex-1" />
          <input
            type="range"
            min={1}
            max={10}
            value={power}
            onChange={(e) => setPower(Number(e.target.value))}
            aria-label="Research depth multiplier"
            className="h-1 w-20 shrink-0 cursor-pointer accent-[var(--kai-orange)]"
          />
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
        <p className="font-mono text-[10px] text-kai-dim">{estimate(power, web)}</p>
      </div>
    </div>
  )
}

/**
 * estimate mirrors the ceilings the engine actually applies (internal/
 * research.Run clamps): queries 3N capped at 24, pages 4N capped at 40,
 * rounds 1+N/2 capped at 5. Keeping the arithmetic identical matters — a
 * preview that drifts from the engine is worse than no preview.
 */
function estimate(power: number, web: boolean): string {
  if (!web) return "Repository only — no web search, no pages fetched"
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi))
  const queries = clamp(3 * power, 3, 24)
  const pages = clamp(4 * power, 4, 40)
  const rounds = clamp(1 + Math.floor(power / 2), 1, 5)
  return `≈${queries} queries · ≈${pages} pages · up to ${rounds} round${rounds === 1 ? "" : "s"}`
}
