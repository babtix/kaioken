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

function apply(theme: Theme) {
  document.documentElement.classList.toggle("light", theme === "light")
  document.querySelector('meta[name="color-scheme"]')?.setAttribute(
    "content",
    theme === "light" ? "light" : "dark"
  )
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    theme === "light" ? "#f7f7f7" : "#080808"
  )
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
