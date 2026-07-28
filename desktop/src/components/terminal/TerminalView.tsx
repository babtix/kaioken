import { useEffect, useRef } from "react"
import { ensureOpen, fitTerm, focusTerm, termElement } from "@/lib/term"
import { cn } from "@/lib/utils"

// One mounted view per session, stacked absolutely so every terminal keeps
// its real size while hidden (`invisible`, not `hidden` — a 0×0 terminal
// cannot be fitted). The xterm instance itself lives in lib/term's registry;
// this component only parents its DOM node.
export default function TerminalView({ id, active }: { id: number; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = ref.current
    const el = termElement(id)
    if (!host || !el) return
    host.appendChild(el)
    ensureOpen(id)
    // Detach, never dispose: the session outlives this mount.
    return () => {
      el.remove()
    }
  }, [id])

  // Track the panel being resized (drag handle, window, splitter).
  useEffect(() => {
    const host = ref.current
    if (!host) return
    let timer: number | undefined
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => fitTerm(id), 50)
    })
    ro.observe(host)
    return () => {
      window.clearTimeout(timer)
      ro.disconnect()
    }
  }, [id])

  useEffect(() => {
    if (active) {
      fitTerm(id)
      focusTerm(id)
    }
  }, [active, id])

  return (
    <div
      ref={ref}
      className={cn("absolute inset-0 px-2 py-1", !active && "invisible")}
      style={{ background: "var(--kai-code)" }}
    />
  )
}
