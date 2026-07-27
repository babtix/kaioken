import { create } from "zustand"

// A tab owns its own history stack, exactly as a browser tab does: going back
// in one tab must not disturb another. `index` is the position within `stack`,
// so forward stays available until a new navigation truncates it.
export type BrowserTab = {
  id: string
  stack: string[]
  index: number
  title: string
  loading: boolean
  /** Set when a page refuses to be framed, so the UI can offer a way out. */
  blocked: boolean
}

export type Visit = { url: string; title: string; count: number; last: number }
export type Bookmark = { url: string; title: string }

export const NEW_TAB = "about:newtab"

const HISTORY_CAP = 300
const STORAGE_KEY = "kaioken.browser.v1"

type BrowserState = {
  tabs: BrowserTab[]
  activeId: string
  history: Visit[]
  bookmarks: Bookmark[]
  /** Search engine used when the omnibox input is not a URL. */
  engine: keyof typeof ENGINES

  active: () => BrowserTab
  urlOf: (tab: BrowserTab) => string

  newTab: (url?: string) => void
  closeTab: (id: string) => void
  selectTab: (id: string) => void
  navigate: (input: string) => void
  back: () => void
  forward: () => void
  reload: () => void
  setLoading: (id: string, loading: boolean) => void
  setBlocked: (id: string, blocked: boolean) => void
  setTitle: (id: string, title: string) => void
  toggleBookmark: (url: string, title: string) => void
  clearHistory: () => void
  setEngine: (e: keyof typeof ENGINES) => void
}

// DuckDuckGo's HTML endpoint is the default because it is one of the few search
// engines that does not refuse to be framed; Google and Bing both send
// X-Frame-Options: DENY and would render an empty pane.
export const ENGINES = {
  duckduckgo: { label: "DuckDuckGo", url: (q: string) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
  google: { label: "Google", url: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  bing: { label: "Bing", url: (q: string) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
} as const

/**
 * Decides whether omnibox text is a place to go or a thing to look up — the one
 * piece of behaviour that makes an address bar feel like Chrome's.
 *
 * Anything with a scheme, a leading localhost/IP, or a bare `host.tld` shape is
 * treated as a URL. Everything else, including anything containing a space, is
 * a search.
 */
export function resolveOmnibox(input: string, engine: keyof typeof ENGINES = "duckduckgo"): string {
  const raw = input.trim()
  if (!raw) return NEW_TAB
  if (/^(https?|file):\/\//i.test(raw)) return raw
  if (raw.startsWith("about:")) return raw
  // A space can never appear in a bare hostname, so it settles the question.
  if (/\s/.test(raw)) return ENGINES[engine].url(raw)
  // localhost, localhost:1420, 127.0.0.1:8080
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(raw)) return `http://${raw}`
  // host.tld, sub.host.tld/path — require a dot and a plausible TLD so that a
  // one-word search like "react" is not mistaken for a hostname.
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/|\?|#|$)/.test(raw) && /\.[a-z]{2,}/i.test(raw.split(/[/?#]/)[0])) {
    return `https://${raw}`
  }
  return ENGINES[engine].url(raw)
}

/** Host without the www., for compact display in tabs and top sites. */
export function prettyHost(url: string): string {
  if (url === NEW_TAB) return "New tab"
  try {
    return new URL(url).host.replace(/^www\./, "")
  } catch {
    return url
  }
}

function makeTab(url = NEW_TAB): BrowserTab {
  return {
    id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    stack: [url],
    index: 0,
    title: prettyHost(url),
    loading: url !== NEW_TAB,
    blocked: false,
  }
}

type Persisted = { history: Visit[]; bookmarks: Bookmark[]; engine: keyof typeof ENGINES }

function load(): Persisted {
  const empty: Persisted = { history: [], bookmarks: [], engine: "duckduckgo" }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty
    const v = JSON.parse(raw) as Partial<Persisted>
    return {
      history: Array.isArray(v.history) ? v.history : [],
      bookmarks: Array.isArray(v.bookmarks) ? v.bookmarks : [],
      engine: v.engine && v.engine in ENGINES ? v.engine : "duckduckgo",
    }
  } catch {
    return empty
  }
}

function save(s: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // localStorage may be unavailable (private mode, full quota) — non-fatal.
  }
}

const initial = load()
const firstTab = makeTab()

export const useBrowserStore = create<BrowserState>((set, get) => ({
  tabs: [firstTab],
  activeId: firstTab.id,
  history: initial.history,
  bookmarks: initial.bookmarks,
  engine: initial.engine,

  active: () => {
    const s = get()
    return s.tabs.find((t) => t.id === s.activeId) ?? s.tabs[0]
  },
  urlOf: (tab) => tab.stack[tab.index],

  newTab: (url) =>
    set((s) => {
      const tab = makeTab(url)
      return { tabs: [...s.tabs, tab], activeId: tab.id }
    }),

  closeTab: (id) =>
    set((s) => {
      const remaining = s.tabs.filter((t) => t.id !== id)
      // Closing the last tab leaves a fresh one rather than an empty window.
      if (remaining.length === 0) {
        const tab = makeTab()
        return { tabs: [tab], activeId: tab.id }
      }
      if (id !== s.activeId) return { tabs: remaining }
      // Focus the neighbour on the right, as browsers do, falling back to left.
      const closedAt = s.tabs.findIndex((t) => t.id === id)
      const next = remaining[Math.min(closedAt, remaining.length - 1)]
      return { tabs: remaining, activeId: next.id }
    }),

  selectTab: (id) => set({ activeId: id }),

  navigate: (input) =>
    set((s) => {
      const url = resolveOmnibox(input, s.engine)
      const history = url === NEW_TAB ? s.history : recordVisit(s.history, url)
      if (url !== NEW_TAB) save({ history, bookmarks: s.bookmarks, engine: s.engine })
      return {
        history,
        tabs: s.tabs.map((t) => {
          if (t.id !== s.activeId) return t
          // Navigating discards anything that was ahead in this tab.
          const stack = [...t.stack.slice(0, t.index + 1), url]
          return {
            ...t,
            stack,
            index: stack.length - 1,
            title: prettyHost(url),
            loading: url !== NEW_TAB,
            blocked: false,
          }
        }),
      }
    }),

  back: () =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === s.activeId && t.index > 0
          ? { ...t, index: t.index - 1, title: prettyHost(t.stack[t.index - 1]), loading: true, blocked: false }
          : t
      ),
    })),

  forward: () =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === s.activeId && t.index < t.stack.length - 1
          ? { ...t, index: t.index + 1, title: prettyHost(t.stack[t.index + 1]), loading: true, blocked: false }
          : t
      ),
    })),

  // Re-navigating to the same URL does not reload an iframe, so the component
  // keys off a counter instead; here we only reset the loading indicator.
  reload: () =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === s.activeId && t.stack[t.index] !== NEW_TAB
          ? { ...t, loading: true, blocked: false }
          : t
      ),
    })),

  setLoading: (id, loading) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, loading } : t)) })),

  setBlocked: (id, blocked) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, blocked, loading: false } : t)) })),

  setTitle: (id, title) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)) })),

  toggleBookmark: (url, title) =>
    set((s) => {
      const exists = s.bookmarks.some((b) => b.url === url)
      const bookmarks = exists
        ? s.bookmarks.filter((b) => b.url !== url)
        : [{ url, title }, ...s.bookmarks]
      save({ history: s.history, bookmarks, engine: s.engine })
      return { bookmarks }
    }),

  clearHistory: () =>
    set((s) => {
      save({ history: [], bookmarks: s.bookmarks, engine: s.engine })
      return { history: [] }
    }),

  setEngine: (engine) =>
    set((s) => {
      save({ history: s.history, bookmarks: s.bookmarks, engine })
      return { engine }
    }),
}))

// recordVisit bumps a URL's visit count so the new-tab page can rank by how
// often somewhere is actually used, not just how recently.
function recordVisit(history: Visit[], url: string): Visit[] {
  const now = Date.now()
  const existing = history.find((v) => v.url === url)
  if (existing) {
    return history.map((v) => (v.url === url ? { ...v, count: v.count + 1, last: now } : v))
  }
  return [{ url, title: prettyHost(url), count: 1, last: now }, ...history].slice(0, HISTORY_CAP)
}

/** History ranked for the new-tab page: most-visited first, recency breaking ties. */
export function topSites(history: Visit[], limit = 8): Visit[] {
  return [...history].sort((a, b) => b.count - a.count || b.last - a.last).slice(0, limit)
}
