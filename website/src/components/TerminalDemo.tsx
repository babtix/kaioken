import * as React from "react"
import TerminalWindow from "./TerminalWindow"

type LineKind =
  | "user"
  | "assistant"
  | "tool"
  | "toolres"
  | "add"
  | "del"
  | "approve"
  | "ok"
  | "dim"
  | "blank"

interface Line {
  kind: LineKind
  text: string
  /** extra pause after this line, ms */
  hold?: number
}

/** Mirrors the TUI's lipgloss styles one-for-one. */
const STYLE: Record<LineKind, string> = {
  user: "text-kai-blue font-semibold",
  assistant: "text-foreground",
  tool: "text-kai-tan",
  toolres: "text-kai-sage",
  add: "text-kai-green",
  del: "text-kai-rose",
  approve: "text-kai-amber font-semibold",
  ok: "text-kai-green",
  dim: "text-kai-dim",
  blank: "",
}

const SCRIPT: Line[] = [
  { kind: "user", text: "› wrap the validate error in handler.go", hold: 450 },
  { kind: "blank", text: "" },
  { kind: "tool", text: "● read_knowledge  skills/add-an-api-endpoint" },
  { kind: "toolres", text: "  ↳ 1 skill matched — following it" },
  { kind: "tool", text: "● read_file  internal/api/handler.go" },
  { kind: "toolres", text: "  ↳ 148 lines", hold: 350 },
  { kind: "blank", text: "" },
  {
    kind: "assistant",
    text: "The bare return drops the cause. Wrapping it keeps errors.Is working upstream.",
    hold: 300,
  },
  { kind: "blank", text: "" },
  { kind: "tool", text: "● proposed edit: internal/api/handler.go" },
  { kind: "del", text: "-       return nil" },
  { kind: "add", text: '+       return fmt.Errorf("validate: %w", err)', hold: 400 },
  { kind: "blank", text: "" },
  { kind: "approve", text: "apply edit → internal/api/handler.go ?   [y] yes   [n] no", hold: 900 },
  { kind: "ok", text: "✓ applied · 1 file changed", hold: 600 },
  { kind: "blank", text: "" },
  { kind: "dim", text: "  ↑↓ history · / commands · ctrl+c cancel" },
]

const LINE_DELAY = 340

export default function TerminalDemo() {
  const [shown, setShown] = React.useState(0)
  const [done, setDone] = React.useState(false)

  React.useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches

    if (reduced) {
      setShown(SCRIPT.length)
      setDone(true)
      return
    }

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

    timer = setTimeout(() => advance(0), 500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  return (
    <TerminalWindow
      title="kaioken — tui"
      meta="repo: ai_now_know"
      scanlines
      className="panel-glow"
      bodyClassName="min-h-[22rem] text-[12.5px] sm:text-[13px]"
    >
      {/* The animation is decoration; screen readers get the finished transcript. */}
      <div aria-live="off">
        {SCRIPT.slice(0, shown).map((line, i) => (
          <div
            key={i}
            className={`animate-rise whitespace-pre ${STYLE[line.kind]} ${
              line.kind === "blank" ? "h-[0.8em]" : ""
            }`}
          >
            {line.text}
          </div>
        ))}
        {done ? (
          <div className="mt-1 flex items-center gap-2 whitespace-pre">
            <span className="text-kai-orange">❯</span>
            <span className="inline-block h-[1.1em] w-[0.6ch] bg-kai-orange animate-caret" />
          </div>
        ) : null}
      </div>
    </TerminalWindow>
  )
}
