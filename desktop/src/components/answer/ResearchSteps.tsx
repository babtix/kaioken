import { useState } from "react"
import { Check, ChevronRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ResearchStep } from "./types"

/**
 * "Completed N steps" — the collapsed research trail.
 *
 * Showing that retrieval happened is, for a research tool, as load-bearing as
 * the prose: it justifies the wait and it earns the claims that follow.
 * Collapsed by default so the answer stays primary.
 *
 * The teardown's fair criticism of this pattern is that collapsed steps are
 * easy to miss entirely on a fast scroll, which matters most on exactly the
 * high-stakes questions where a reader should check. So the header carries the
 * evidence count inline — "searched 24 · read 11 sources" is visible without
 * expanding anything, and only the step-by-step detail is hidden.
 */
export function ResearchSteps({
  steps,
  searched,
  sourceCount,
  rounds,
  defaultOpen = false,
}: {
  steps: ResearchStep[]
  /** Queries issued. Shown inline so the effort is legible while collapsed. */
  searched?: number
  sourceCount?: number
  rounds?: number
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (steps.length === 0) return null

  const done = steps.filter((s) => s.state === "done").length
  const running = steps.some((s) => s.state === "running")

  return (
    <div className="rounded-[var(--radius)] border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left outline-none
                   transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-kai-orange/50"
      >
        <ChevronRight
          size={12}
          className={cn("shrink-0 text-kai-dim transition-transform", open && "rotate-90")}
        />
        {running ? (
          <Loader2 size={12} className="shrink-0 animate-spin text-kai-amber" />
        ) : (
          <Check size={12} className="shrink-0 text-kai-green" />
        )}
        <span className="font-mono text-[11px] text-kai-text">
          {running ? `Researching — step ${done + 1} of ${steps.length}` : `Completed ${done} steps`}
        </span>

        {/* The inline evidence cue: visible without expanding. */}
        <span className="ml-auto truncate font-mono text-[10px] text-kai-dim">
          {[
            rounds ? `${rounds} round${rounds === 1 ? "" : "s"}` : null,
            searched ? `${searched} queries` : null,
            sourceCount ? `${sourceCount} sources` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </button>

      {open && (
        <ol className="animate-slide-up border-t border-border px-2.5 py-2">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 py-1">
              <StepMark state={step.state} />
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "font-mono text-[11px]",
                    step.state === "pending" ? "text-kai-dim" : "text-kai-text"
                  )}
                >
                  {step.label}
                </div>
                {step.detail && (
                  <div className="truncate font-mono text-[10px] text-kai-dim">{step.detail}</div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function StepMark({ state }: { state: ResearchStep["state"] }) {
  if (state === "running") {
    return <Loader2 size={11} className="mt-0.5 shrink-0 animate-spin text-kai-amber" />
  }
  if (state === "done") {
    return <Check size={11} className="mt-0.5 shrink-0 text-kai-green" />
  }
  return (
    <span
      aria-hidden
      className="mt-[5px] size-1.5 shrink-0 rounded-full border border-kai-dim"
    />
  )
}
