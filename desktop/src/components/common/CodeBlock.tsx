import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"

/** A fenced code block with a language tag and a copy button. */
export default function CodeBlock({
  code,
  lang,
  className,
}: {
  code: string
  lang?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard can be unavailable; failing silently is better than a
      // thrown error in the middle of a rendered document.
    }
  }

  return (
    <div
      className={cn(
        "group relative my-3 overflow-hidden rounded-md border border-border bg-kai-code",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-kai-dim">
          {lang || "text"}
        </span>
        <button
          onClick={copy}
          className={cn(
            "ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px]",
            "text-kai-dim opacity-0 transition-all hover:text-kai-text",
            "focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-kai-orange/60",
            "group-hover:opacity-100",
            copied && "text-kai-green opacity-100"
          )}
          aria-label="Copy code"
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3">
        <code className="font-mono text-[12px] leading-relaxed text-kai-text">{code}</code>
      </pre>
    </div>
  )
}
