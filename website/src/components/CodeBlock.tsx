import * as React from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import TerminalWindow from "./TerminalWindow"

/**
 * A deliberately small shell tokenizer. It only needs to recognise the four
 * things that show up in this project's snippets — comments, the binary name,
 * flags, and quoted strings — which is enough to read like a terminal without
 * pulling in a highlighter.
 */
const TOKEN = /(#.*$)|("[^"]*"|'[^']*')|(\$env:[A-Za-z_][\w]*|\$[A-Za-z_][\w]*)|(\B-{1,2}[A-Za-z][\w-]*)|(\bkaioken\b|\bgo\b|\bnpm\b|\bcd\b|\bgit\b)/

function ShellLine({ line }: { line: string }) {
  const out: React.ReactNode[] = []
  let rest = line
  let key = 0

  while (rest.length > 0) {
    const m = TOKEN.exec(rest)
    if (!m || m.index === undefined) {
      out.push(<span key={key++}>{rest}</span>)
      break
    }
    if (m.index > 0) out.push(<span key={key++}>{rest.slice(0, m.index)}</span>)

    const [text] = m
    let cls = ""
    if (m[1]) cls = "text-kai-dim italic"
    else if (m[2]) cls = "text-kai-green"
    else if (m[3]) cls = "text-kai-blue"
    else if (m[4]) cls = "text-kai-amber"
    else if (m[5]) cls = "text-kai-orange font-semibold"

    out.push(
      <span key={key++} className={cls}>
        {text}
      </span>
    )
    rest = rest.slice(m.index + text.length)
  }
  return <>{out}</>
}

interface CodeBlockProps {
  code: string
  title?: string
  /** render a $ gutter in front of each non-comment, non-blank line */
  prompt?: boolean
  className?: string
}

export default function CodeBlock({ code, title = "bash", prompt = false, className }: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // A pending timer would call setState after unmount otherwise.
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
    <TerminalWindow
      title={title}
      className={className}
      meta={
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy to clipboard"}
          className="flex cursor-pointer items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[11px] text-kai-dim transition-colors hover:bg-accent hover:text-kai-amber focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {copied ? <Check className="size-3 text-kai-green" /> : <Copy className="size-3" />}
          {copied ? "copied" : "copy"}
        </button>
      }
    >
      <pre className="min-w-0">
        <code>
          {lines.map((line, i) => {
            const showPrompt = prompt && line.trim() !== "" && !line.trimStart().startsWith("#")
            return (
              <div key={i} className={cn("whitespace-pre", line.trim() === "" && "h-[1.6em]")}>
                {showPrompt && <span className="mr-2 select-none text-kai-dim">$</span>}
                <ShellLine line={line} />
              </div>
            )
          })}
        </code>
      </pre>
    </TerminalWindow>
  )
}
