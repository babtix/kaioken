import * as React from "react"
import { useInView, useReducedMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"

type Kind = "user" | "assistant" | "tool" | "toolres" | "add" | "del" | "approve" | "ok" | "blank"

/** Mirrors the TUI's lipgloss styles one-for-one. */
const STYLE: Record<Kind, string> = {
  user: "text-kai-blue font-semibold",
  assistant: "text-foreground",
  tool: "text-kai-tan",
  toolres: "text-kai-sage",
  add: "text-kai-green",
  del: "text-kai-rose",
  approve: "text-kai-amber font-semibold",
  ok: "text-kai-green",
  blank: "",
}

/**
 * A phone-width transcript. Every line is under 43 characters, which is what
 * fits at 11px on a 360px screen without a horizontal scroll — the desktop
 * demo's lines are written for a 3xl column and wrap into mush here.
 */
const SCRIPT: { kind: Kind; text: string; hold?: number }[] = [
  { kind: "user", text: "› wrap the validate error", hold: 400 },
  { kind: "blank", text: "" },
  { kind: "tool", text: "● read_knowledge" },
  { kind: "toolres", text: "  ↳ 1 skill matched" },
  { kind: "tool", text: "● read_file  api/handler.go" },
  { kind: "toolres", text: "  ↳ 148 lines", hold: 300 },
  { kind: "blank", text: "" },
  { kind: "assistant", text: "The bare return drops the cause.", hold: 250 },
  { kind: "blank", text: "" },
  { kind: "tool", text: "● edit: api/handler.go" },
  { kind: "del", text: "-   return nil" },
  { kind: "add", text: '+   return fmt.Errorf("%w", err)', hold: 400 },
  { kind: "blank", text: "" },
  { kind: "approve", text: "apply edit?  [y] yes  [n] no", hold: 800 },
  { kind: "ok", text: "✓ applied · 1 file changed" },
]

const LINE_DELAY = 320

export default function TerminalPeek({ className }: { className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const inView = useInView(ref, "-20px")
  const reduced = useReducedMotion()
  const [shown, setShown] = React.useState(0)
  const [done, setDone] = React.useState(false)

  React.useEffect(() => {
    if (reduced) {
      setShown(SCRIPT.length)
      setDone(true)
      return
    }
    // Nothing types while the card is off-screen: on a phone that is most of
    // the page, and a timer chain running behind the fold is battery for free.
    if (!inView || done) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    const advance = (i: number) => {
      if (cancelled) return
      if (i >= SCRIPT.length) {
        setDone(true)
        return
      }
      setShown(i + 1)
      timer = setTimeout(() => advance(i + 1), LINE_DELAY + (SCRIPT[i].hold ?? 0))
    }

    timer = setTimeout(() => advance(0), 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [inView, reduced, done])

  return (
    <div
      ref={ref}
      className={cn(
        "overflow-hidden rounded-md border border-border bg-card panel-glow",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-border bg-kai-panel px-3 py-2">
        <span className="size-2 rounded-[1px] bg-kai-red/70" aria-hidden />
        <span className="size-2 rounded-[1px] bg-kai-amber/70" aria-hidden />
        <span className="size-2 rounded-[1px] bg-kai-green/70" aria-hidden />
        <span className="ml-1 truncate font-mono text-[10.5px] text-muted-foreground">
          kaioken — tui
        </span>
      </div>

      <div className="crt-scanlines relative">
        <div
          className="m-no-scrollbar min-h-[15.5rem] overflow-x-auto px-3.5 py-3 font-mono text-[11px] leading-[1.55]"
          aria-live="off"
        >
          {SCRIPT.slice(0, shown).map((line, i) => (
            <div
              key={i}
              className={cn(
                "animate-rise whitespace-pre",
                STYLE[line.kind],
                line.kind === "blank" && "h-[0.75em]"
              )}
            >
              {line.text}
            </div>
          ))}
          {done ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-kai-orange">❯</span>
              <span className="animate-caret inline-block h-[1.1em] w-[0.6ch] bg-kai-orange" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
