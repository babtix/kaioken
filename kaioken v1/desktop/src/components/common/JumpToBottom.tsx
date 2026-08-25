import { useEffect, useState, type RefObject } from "react"
import { ArrowDown, ArrowUp } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The jump pair a long surface earns: a trip back to the top and one down
 * to the end, stacked at the right edge of the content column itself —
 * not the window edge, so the explorer sidebar opening on the right never
 * buries them. They appear only when the surface is genuinely long and the
 * reader is genuinely away from that end; otherwise they stay out of the
 * way entirely.
 */
export function JumpToBottom({
  anchor,
  scroller,
  className,
}: {
  /** Any element inside the scroll surface; used to locate it when no
   *  explicit scroller ref is handed over (routes scroll in the shell's
   *  <main>, which they do not own). */
  anchor?: RefObject<HTMLElement | null>
  /** The scrolling element itself, when the component owns it. */
  scroller?: RefObject<HTMLElement | null>
  /** Bottom-offset override — the pair is fixed to the viewport, with its
   *  right edge computed from the scroll surface, not passed in. */
  className?: string
}) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [showBottom, setShowBottom] = useState(false)
  const [showTop, setShowTop] = useState(false)
  // Distance between the surface's right edge and the window's; the pair
  // hangs just inside the content column with it.
  const [inset, setInset] = useState(16)

  // Resolve the scroll container once, after mount: refs are populated by
  // then, and neither surface swaps the element itself later.
  useEffect(() => {
    setEl(scroller?.current ?? anchor?.current?.closest("main") ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!el) return
    const update = () => {
      const away = el.scrollHeight - el.scrollTop - el.clientHeight
      setShowBottom(el.scrollHeight > el.clientHeight + 240 && away > 240)
      setShowTop(el.scrollTop > 240)
      // The sidebar on the right opens and closes; re-derive the edge from
      // the surface itself rather than guessing a viewport offset.
      setInset(Math.max(8, window.innerWidth - el.getBoundingClientRect().right) + 16)
    }
    update()
    el.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    // Growing content (a streaming answer, a loading report) can push the
    // bottom away from a reader who has not scrolled — watch for it.
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
      ro.disconnect()
    }
  }, [el])

  if (!showBottom && !showTop) return null
  return (
    <div
      className={cn("animate-slide-up fixed z-40 flex flex-col gap-1.5", className ?? "bottom-12")}
      style={{ right: inset }}
    >
      {showTop && (
        <button
          type="button"
          aria-label="Jump to the top"
          title="Jump to the top"
          onClick={() => el?.scrollTo({ top: 0, behavior: "smooth" })}
          className={btnClass}
        >
          <ArrowUp size={14} />
        </button>
      )}
      {showBottom && (
        <button
          type="button"
          aria-label="Jump to the bottom"
          title="Jump to the bottom"
          onClick={() => el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" })}
          className={btnClass}
        >
          <ArrowDown size={14} />
        </button>
      )}
    </div>
  )
}

const btnClass =
  "flex size-8 items-center justify-center rounded-full border border-border bg-card " +
  "text-kai-dim shadow-lg transition-colors hover:border-kai-orange/50 hover:text-kai-orange " +
  "outline-none focus-visible:ring-2 focus-visible:ring-kai-orange/50"
