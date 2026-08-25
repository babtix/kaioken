import { useState, useEffect, type RefObject } from "react"

/**
 * True when the visitor has asked the OS for less animation.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return reduced
}

/**
 * True once the element has been scrolled into view.
 */
export function useInView<T extends Element>(
  ref: RefObject<T | null>,
  rootMargin = "0px"
): boolean {
  const [inView, setInView] = useState(false)
  useEffect(() => {
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
 * Reveals `text` a few characters at a time while `run` holds.
 */
export function useTypewriter(text: string, run: boolean, speed = 26): string {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(reduced ? text : "")

  useEffect(() => {
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
