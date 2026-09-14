import * as React from "react"
import { ArrowUp } from "lucide-react"
import { useReducedMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"

/** Appears once the page is a couple of screens deep, and gets out of the way
 *  again on the way back up. */
export default function BackToTop() {
  const [shown, setShown] = React.useState(false)
  const reduced = useReducedMotion()

  React.useEffect(() => {
    const onScroll = () => setShown(window.scrollY > window.innerHeight * 1.5)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <button
      type="button"
      aria-label="Back to top"
      tabIndex={shown ? 0 : -1}
      onClick={() =>
        window.scrollTo({ top: 0, behavior: reduced ? "instant" : "smooth" })
      }
      className={cn(
        "fixed right-4 bottom-4 z-40 flex size-9 items-center justify-center rounded-sm",
        "border border-border bg-card/90 text-kai-dim backdrop-blur-md transition-all duration-200",
        "hover:border-kai-orange/40 hover:text-kai-orange",
        "focus-visible:ring-1 focus-visible:ring-kai-orange/60 focus-visible:outline-none",
        shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      )}
    >
      <ArrowUp className="size-4" />
    </button>
  )
}
