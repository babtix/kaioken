import { cn } from "@/lib/utils"
import type { Approval } from "@/lib/types"

type Diff = NonNullable<Approval["diff"]>

const OP_STYLES: Record<string, string> = {
  "+": "bg-kai-green/10 text-kai-green",
  "-": "bg-kai-rose/10 text-kai-rose",
  " ": "text-kai-muted",
}

/** Side-by-side line numbers with a unified body — the structured
 *  replacement for the TUI's plain-text diff preview. Falls back to the
 *  plain preview when the daemon sends no hunks. */
export default function DiffView({
  diff,
  preview,
  className,
}: {
  diff: Diff | null
  preview?: string
  className?: string
}) {
  if (!diff || diff.hunks.length === 0) {
    if (!preview) return null
    return (
      <pre
        className={cn(
          "overflow-auto rounded border border-border bg-kai-code p-3",
          "font-mono text-[11px] leading-relaxed text-kai-muted",
          className
        )}
      >
        {preview}
      </pre>
    )
  }

  return (
    <div
      className={cn(
        "overflow-auto rounded border border-border bg-kai-code font-mono text-[11px] leading-[1.5]",
        className
      )}
    >
      {diff.hunks.map((hunk, hi) => {
        let oldLine = hunk.old_start
        let newLine = hunk.new_start
        return (
          <div key={hi} className={hi > 0 ? "border-t border-border" : undefined}>
            <div className="bg-panel/60 px-3 py-1 text-[10px] text-kai-blue">
              @@ -{hunk.old_start},{hunk.old_lines} +{hunk.new_start},{hunk.new_lines} @@
            </div>
            {hunk.lines.map((line, li) => {
              const shownOld = line.op === "+" ? "" : String(oldLine++)
              const shownNew = line.op === "-" ? "" : String(newLine++)
              return (
                <div key={li} className={cn("flex", OP_STYLES[line.op] ?? OP_STYLES[" "])}>
                  <span className="w-10 shrink-0 select-none px-1 text-right text-kai-dim/70">
                    {shownOld}
                  </span>
                  <span className="w-10 shrink-0 select-none px-1 text-right text-kai-dim/70">
                    {shownNew}
                  </span>
                  <span className="w-4 shrink-0 select-none text-center opacity-70">
                    {line.op === " " ? "" : line.op}
                  </span>
                  <span className="whitespace-pre pr-3">{line.text}</span>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
