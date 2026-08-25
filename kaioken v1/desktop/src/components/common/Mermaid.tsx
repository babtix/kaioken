import { useEffect, useRef, useState } from "react"
import CodeBlock from "./CodeBlock"
import { useThemeStore } from "@/store/theme"
import type { Theme } from "@/store/theme"

type MermaidAPI = typeof import("mermaid").default

let mermaidLoader: Promise<MermaidAPI> | null = null

/** Load mermaid once, lazily — it is a large dependency and a wiki with no
 * diagrams should never pay for it. */
function loadMermaid(): Promise<MermaidAPI> {
  if (!mermaidLoader) {
    mermaidLoader = import("mermaid").then((m) => m.default)
  }
  return mermaidLoader
}

/** (Re-)configure mermaid for the given theme. Safe to call before every
 * render — initialize() is idempotent. */
function configureMermaid(mermaid: MermaidAPI, theme: Theme) {
  mermaid.initialize(
    theme === "dark"
      ? {
          startOnLoad: false,
          suppressErrorRendering: true,
          securityLevel: "strict",
          theme: "dark",
          fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace',
          themeVariables: {
            background: "#080808",
            primaryColor: "#1c1c1c",
            primaryTextColor: "#d0d0d0",
            primaryBorderColor: "#ff8700",
            lineColor: "#585858",
            secondaryColor: "#241708",
            tertiaryColor: "#121212",
          },
        }
      : {
          startOnLoad: false,
          suppressErrorRendering: true,
          securityLevel: "strict",
          theme: "neutral",
          fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace',
          themeVariables: {
            background: "#ffffff",
            primaryColor: "#eeeeee",
            primaryTextColor: "#2e2e2e",
            primaryBorderColor: "#d96e00",
            lineColor: "#8a8a8a",
            secondaryColor: "#fff3e0",
            tertiaryColor: "#f7f7f7",
          },
        }
  )
}

let idCounter = 0

/** Renders a mermaid diagram, failing soft: an invalid diagram degrades to
 *  its source as a plain code block rather than an error box, matching what
 *  the Go pipeline already does in wiki/polish.go. Rendering is deferred
 *  until the block scrolls into view — a 71-document wiki with diagrams in
 *  every chapter would otherwise stall the main thread. */
export default function Mermaid({ chart }: { chart: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [visible, setVisible] = useState(false)
  const theme = useThemeStore((s) => s.theme)

  useEffect(() => {
    const el = hostRef.current
    if (!el || visible) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: "200px" }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    const id = `mmd-${++idCounter}`
    loadMermaid()
      .then(async (mermaid) => {
        configureMermaid(mermaid, theme)
        const valid = await mermaid.parse(chart, { suppressErrors: true }).catch(() => false)
        if (!valid) throw new Error("Invalid mermaid syntax")
        return mermaid.render(id, chart)
      })
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
        document.querySelectorAll(`#${id}, #d${id}, [id^="dmmd"]`).forEach((el) => {
          if (el.parentNode === document.body) el.remove()
        })
      })
    return () => {
      cancelled = true
      document.querySelectorAll(`#${id}, #d${id}`).forEach((el) => {
        if (el.parentNode === document.body) el.remove()
      })
    }
  }, [visible, chart, theme])

  if (failed) return <CodeBlock code={chart} lang="mermaid" />

  return (
    <div
      ref={hostRef}
      className="my-4 overflow-x-auto rounded-md border border-border bg-kai-code p-4"
    >
      {svg ? (
        <div className="flex justify-center [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <p className="text-center font-mono text-[11px] text-kai-dim">rendering diagram…</p>
      )}
    </div>
  )
}
