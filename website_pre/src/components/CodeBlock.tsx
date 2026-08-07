import * as React from "react"
import { Check, Copy } from "lucide-react"
import { useDocChrome } from "@/lib/doc-chrome"
import { ShellLine } from "@/lib/shell"
import { cn } from "@/lib/utils"
import TerminalWindow from "./TerminalWindow"

interface CodeBlockProps {
  code: string
  title?: string
  /** render a $ gutter in front of each non-comment, non-blank line */
  prompt?: boolean
  className?: string
}

export default function CodeBlock({ code, title = "bash", prompt = false, className }: CodeBlockProps) {
  // Inside the phone site's doc screen: smaller type, and a copy control a
  // thumb can actually land on.
  const { bare } = useDocChrome()
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
      bodyClassName={bare ? "m-no-scrollbar px-3.5 py-3.5 text-[12px]" : undefined}
      meta={
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy to clipboard"}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-sm text-[11px] text-kai-dim transition-colors hover:bg-accent hover:text-kai-amber focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            bare ? "-my-2 h-11 px-3" : "px-1.5 py-0.5"
          )}
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
