import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Scales its child to exactly fill the available width, measured at runtime
 * rather than guessed from a viewport-width formula.
 *
 * The ASCII wordmarks were previously sized with clamp(min, N vw, max), tuned
 * by hand against one font's character-advance ratio at one test viewport.
 * That guess broke on real devices — a real phone measured the box-drawing
 * glyphs a bit wider than the desktop dev browser did, and the untransformed
 * `vw` formula had no way to know, so the wordmark ran past the right edge
 * and blew out the whole page's width. Measuring the box's actual scrollWidth
 * against its container and scaling to fit is correct for any font metrics,
 * any viewport, and any font-loading timing — there is nothing left to guess.
 */
export default function FitText({
  children,
  className,
  maxScale = 1,
}: {
  children: React.ReactNode
  className?: string
  /** never scale up past this — a wide box shouldn't blow the mark up huge */
  maxScale?: number
}) {
  const outerRef = React.useRef<HTMLDivElement>(null)
  const innerRef = React.useRef<HTMLDivElement>(null)
  const [box, setBox] = React.useState<{ scale: number; height: number } | null>(null)

  React.useEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return

    const fit = () => {
      const available = outer.clientWidth
      const naturalW = inner.scrollWidth
      const naturalH = inner.scrollHeight
      if (!available || !naturalW) return
      const scale = Math.min(maxScale, available / naturalW)
      setBox({ scale, height: naturalH * scale })
    }

    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(outer)
    // A web font finishing after first paint changes scrollWidth — refit once it lands.
    document.fonts?.ready.then(fit).catch(() => {})

    return () => ro.disconnect()
  }, [maxScale])

  return (
    <div
      ref={outerRef}
      className={cn("flex justify-center overflow-hidden", className)}
      style={{ height: box?.height, opacity: box ? 1 : 0 }}
    >
      <div
        ref={innerRef}
        style={{
          display: "inline-block",
          transform: `scale(${box?.scale ?? 1})`,
          transformOrigin: "top center",
        }}
      >
        {children}
      </div>
    </div>
  )
}
