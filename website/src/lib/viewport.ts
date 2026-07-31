import * as React from "react"

/**
 * Which of the two sites a visitor gets.
 *
 * The phone site (src/mobile) is not the desktop site reflowed — it is its own
 * layout, its own navigation and its own compositions, sharing only the data in
 * src/data and the palette. The cut is at Tailwind's md breakpoint: 767px and
 * below is a phone; tablets and up keep the desktop site, which is what they
 * were designed for.
 */
export const PHONE_QUERY = "(max-width: 767px)"

export type Layout = "mobile" | "desktop"

const KEY = "kaioken:layout"
const EVENT = "kaioken:layout-change"

function readOverride(): Layout | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === "mobile" || v === "desktop" ? v : null
  } catch {
    // storage blocked (private mode, embedded webview) — no override, no crash
    return null
  }
}

function subscribeOverride(onChange: () => void) {
  window.addEventListener(EVENT, onChange)
  // another tab flipping the switch counts too
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener("storage", onChange)
  }
}

/**
 * Pin the site to one layout, or pass null to hand the decision back to the
 * viewport. The escape hatch lives at the bottom of the phone site's More
 * screen — someone on a phone who wants the wide tables should be able to say so.
 */
export function setLayoutOverride(layout: Layout | null) {
  try {
    if (layout) localStorage.setItem(KEY, layout)
    else localStorage.removeItem(KEY)
  } catch {
    /* the choice just will not survive a reload */
  }
  window.dispatchEvent(new Event(EVENT))
}

export function useLayoutOverride(): Layout | null {
  return React.useSyncExternalStore(subscribeOverride, readOverride, () => null)
}

/**
 * A media query as a subscription rather than an effect, so the very first
 * render already knows the answer — an effect-based check paints the wrong
 * site for a frame, and on a phone that frame is the desktop one.
 */
export function useMediaQuery(query: string): boolean {
  const [subscribe, getSnapshot] = React.useMemo(() => {
    const mq = window.matchMedia(query)
    return [
      (onChange: () => void) => {
        mq.addEventListener("change", onChange)
        return () => mq.removeEventListener("change", onChange)
      },
      () => mq.matches,
    ] as const
  }, [query])

  return React.useSyncExternalStore(subscribe, getSnapshot, () => false)
}

export function useLayout(): Layout {
  const override = useLayoutOverride()
  const isPhone = useMediaQuery(PHONE_QUERY)
  return override ?? (isPhone ? "mobile" : "desktop")
}
