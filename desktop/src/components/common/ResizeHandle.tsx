import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

/**
 * A drag handle for resizing a panel, sized and positioned to sit on one of its
 * vertical edges.
 *
 * `side` names the edge the handle lives on, which also decides how a pointer
 * position becomes a width: a panel anchored left grows toward the cursor, one
 * anchored right grows away from it.
 *
 * Keyboard-resizable too — a mouse-only affordance is unreachable for anyone
 * navigating by keyboard, and this is the only way to change the width.
 */
export default function ResizeHandle({
  side,
  width,
  onWidth,
  min,
  max,
  defaultWidth,
  label = "Resize panel",
}: {
  /** Which edge of the panel the handle sits on. */
  side: "left" | "right"
  width: number
  onWidth: (w: number) => void
  min: number
  max: number
  /** Width restored on double-click. */
  defaultWidth: number
  label?: string
}) {
  const dragging = useRef(false)
  // Held in a ref so the window listeners never need re-binding mid-drag.
  const geom = useRef({ side, min, max })
  geom.current = { side, min, max }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return
      const { side, min, max } = geom.current
      const raw = side === "right" ? e.clientX : window.innerWidth - e.clientX
      onWidth(Math.max(min, Math.min(max, Math.round(raw))))
    }
    function onUp() {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [onWidth])

  const nudge = (delta: number) => onWidth(Math.max(min, Math.min(max, width + delta)))

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onMouseDown={(e) => {
        e.preventDefault()
        dragging.current = true
        document.body.style.cursor = "col-resize"
        document.body.style.userSelect = "none"
      }}
      onDoubleClick={() => onWidth(defaultWidth)}
      onKeyDown={(e) => {
        // Arrows follow the visual direction: left shrinks a left-anchored
        // panel but grows a right-anchored one.
        const grow = side === "right" ? 16 : -16
        if (e.key === "ArrowLeft") {
          e.preventDefault()
          nudge(-grow)
        } else if (e.key === "ArrowRight") {
          e.preventDefault()
          nudge(grow)
        }
      }}
      className={cn(
        "absolute inset-y-0 z-10 w-1 cursor-col-resize transition-colors",
        "hover:bg-kai-orange/40 focus-visible:bg-kai-orange/60 focus-visible:outline-none",
        side === "right" ? "-right-0.5" : "-left-0.5"
      )}
    />
  )
}

/** Reads a persisted panel width, clamped, falling back to `fallback`. */
export function readWidth(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
  } catch {
    return fallback
  }
}

/** Persists a panel width. Safe to call on every change — callers debounce. */
export function writeWidth(key: string, w: number) {
  try {
    localStorage.setItem(key, String(w))
  } catch {
    // localStorage may be unavailable (private mode, full quota) — non-fatal.
  }
}
