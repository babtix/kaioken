import { create } from "zustand"

export type Theme = "dark" | "light"

const STORAGE_KEY = "kai-theme"

function stored(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark"
  } catch {
    return "dark"
  }
}

/**
 * Swapping the theme swaps the custom properties every colour derives from —
 * and Chrome does NOT re-run a transition when the variable behind it changes.
 * An element with `transition: color` keeps the OLD theme's computed colour
 * indefinitely, until some unrelated recalc happens to unstick it. In practice
 * that means citation chips and power-meter segments stay dark-orange after
 * switching to light, while everything without a transition flips correctly.
 *
 * Suppressing transitions across the swap sidesteps it entirely. Nothing is
 * lost: a theme change should be instantaneous, never a 150ms crossfade.
 */
function apply(theme: Theme) {
  const root = document.documentElement
  root.classList.add("theme-switching")

  root.classList.toggle("light", theme === "light")
  document.querySelector('meta[name="color-scheme"]')?.setAttribute(
    "content",
    theme === "light" ? "light" : "dark"
  )
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    theme === "light" ? "#f7f7f7" : "#080808"
  )

  // Two frames: one for the swapped values to paint, one to re-arm
  // transitions. Re-enabling in the same frame reintroduces the stale paint.
  //
  // The timer is not a fallback for a missing rAF, it is a fallback for rAF
  // never firing: a hidden, minimised or backgrounded window stops
  // compositing, and a theme applied in that state would leave
  // `theme-switching` latched on — silently killing every transition in the
  // app until the next swap. Whichever path runs first wins; remove() is
  // idempotent.
  const rearm = () => root.classList.remove("theme-switching")
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => requestAnimationFrame(rearm))
  }
  setTimeout(rearm, 120)
}

type ThemeState = {
  theme: Theme
  toggle: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: stored(),

  toggle: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark"
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {}
    apply(next)
    set({ theme: next })
  },
}))

// Sync the DOM class on module load so the store state and the class applied
// by the inline script in index.html stay consistent.
apply(useThemeStore.getState().theme)
