import * as React from "react"
import { Check, Copy } from "lucide-react"
import { ShellLine } from "@/lib/shell"
import { cn } from "@/lib/utils"

/**
 * A terminal snippet, sized for a phone.
 *
 * Smaller type than the desktop block (12px, where 13px overflows a 360px
 * screen on the longest line here), a copy control that is a real 44px target
 * rather than a 20px hover affordance, and horizontal scroll confined to the
 * body so a long command never widens the page itself.
 */
export default function Code({
  code,
  title = "bash",
  prompt = false,
  className,
}: {
  code: string
  title?: string
  /** print a $ gutter before each non-comment, non-blank line */
  prompt?: boolean
  className?: string
}) {
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  React.useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable (insecure origin) — the text is selectable anyway */
    }
  }

  const lines = code.split("\n")

  return (
    <div className={cn("overflow-hidden rounded-md border border-border bg-card", className)}>
      <div className="flex items-center gap-2 border-b border-border bg-kai-panel pr-1 pl-3">
        <span className="size-2 rounded-[1px] bg-kai-orange/60" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] tracking-[0.15em] text-kai-dim uppercase">
          {title}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy snippet"}
          className="m-press flex h-11 items-center gap-1.5 px-3 font-mono text-[11px] text-kai-dim"
        >
          {copied ? (
            <Check className="size-3.5 text-kai-green" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
          {copied ? "copied" : "copy"}
        </button>
      </div>

      <pre className="m-no-scrollbar overflow-x-auto px-3.5 py-3.5 font-mono text-[12px] leading-[1.75]">
        <code>
          {lines.map((line, i) => {
            const showPrompt = prompt && line.trim() !== "" && !line.trimStart().startsWith("#")
            return (
              <div key={i} className={cn("whitespace-pre", line.trim() === "" && "h-[1.75em]")}>
                {showPrompt ? <span className="mr-2 select-none text-kai-dim">$</span> : null}
                <ShellLine line={line} />
              </div>
            )
          })}
        </code>
      </pre>
    </div>
  )
}
