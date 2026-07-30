import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The theme swap suppresses transitions for a beat (see store/theme.ts).
 * Getting the re-arm wrong is quiet and nasty: a latched `theme-switching`
 * class disables every transition in the app with no visible error, so the
 * class removal is worth pinning down — including the path where
 * requestAnimationFrame never fires.
 */
describe("theme store", () => {
  beforeEach(() => {
    vi.resetModules()
    document.documentElement.className = ""
    try {
      localStorage.clear()
    } catch {}
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("applies the light class and clears the transition guard", async () => {
    vi.useFakeTimers()
    const { useThemeStore } = await import("../theme")

    useThemeStore.getState().toggle()
    const root = document.documentElement

    expect(root.classList.contains("light")).toBe(true)
    // Guard is on immediately — that is the whole point of it.
    expect(root.classList.contains("theme-switching")).toBe(true)

    vi.advanceTimersByTime(200)
    expect(root.classList.contains("theme-switching")).toBe(false)
  })

  it("clears the guard even when requestAnimationFrame never fires", async () => {
    // A hidden, minimised or backgrounded window stops compositing and rAF
    // callbacks simply do not run. Without the timer fallback the guard would
    // latch on forever.
    vi.useFakeTimers()
    vi.stubGlobal(
      "requestAnimationFrame",
      (() => 0) as unknown as typeof requestAnimationFrame
    )
    const { useThemeStore } = await import("../theme")

    useThemeStore.getState().toggle()
    expect(document.documentElement.classList.contains("theme-switching")).toBe(true)

    vi.advanceTimersByTime(200)
    expect(document.documentElement.classList.contains("theme-switching")).toBe(false)
  })

  it("round-trips back to dark", async () => {
    vi.useFakeTimers()
    const { useThemeStore } = await import("../theme")

    useThemeStore.getState().toggle()
    expect(useThemeStore.getState().theme).toBe("light")

    useThemeStore.getState().toggle()
    expect(useThemeStore.getState().theme).toBe("dark")
    expect(document.documentElement.classList.contains("light")).toBe(false)

    vi.advanceTimersByTime(200)
    expect(document.documentElement.classList.contains("theme-switching")).toBe(false)
  })
})
