import * as React from "react"

/**
 * True when the visitor has asked the OS for less animation. Components use it
 * to render the *finished* state rather than a slower version of the effect —
 * a typewriter that types slowly is still a typewriter.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return reduced
}

/**
 * True once the element has been scrolled into view, and false again when it
 * leaves. Animated mockups are expensive enough that running them off-screen
 * is worth avoiding.
 */
export function useInView<T extends Element>(
  ref: React.RefObject<T | null>,
  rootMargin = "0px"
): boolean {
  const [inView, setInView] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin, threshold: 0.15 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [ref, rootMargin])
  return inView
}

/**
 * Reveals `text` a few characters at a time while `run` holds. Restarts from
 * the beginning each time `run` goes high, so a mockup that scrolls away and
 * comes back replays instead of sitting on a finished string.
 */
export function useTypewriter(text: string, run: boolean, speed = 26): string {
  const reduced = useReducedMotion()
  const [shown, setShown] = React.useState(reduced ? text : "")

  React.useEffect(() => {
    if (reduced || !run) {
      setShown(reduced ? text : "")
      return
    }
    setShown("")
    let i = 0
    const id = window.setInterval(() => {
      i += 2
      setShown(text.slice(0, i))
      if (i >= text.length) window.clearInterval(id)
    }, speed)
    return () => window.clearInterval(id)
  }, [text, run, speed, reduced])

  return shown
}
