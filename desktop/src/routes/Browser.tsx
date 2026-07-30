import { useEffect, useMemo, useRef, useState } from "react"
import { openUrl } from "@tauri-apps/plugin-opener"
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe,
  History,
  Plus,
  RotateCw,
  Search,
  ShieldAlert,
  Star,
  X,
  Zap,
} from "lucide-react"
import {
  ENGINES,
  NEW_TAB,
  prettyHost,
  topSites,
  useBrowserStore,
} from "@/store/browser"
import { proxyUrl } from "@/lib/daemon"
import { Button } from "@/components/ui"
import { cn } from "@/lib/utils"

// The project's own destinations, always offered on the new-tab page so the
// three places worth returning to are one click away.
const PROJECT_LINKS = [
  { url: "https://kaioken.vercel.app", title: "Main website" },
  { url: "https://kaioken-news.vercel.app", title: "News" },
  { url: "https://github.com/babtix/kaioken", title: "Source · GitHub" },
]

// Browser is an in-app web navigator with Chrome's shape: a tab strip, an
// omnibox that takes either a URL or a search, and back/forward/reload.
//
// Pages render in a sandboxed iframe, which is the only way to show third-party
// content inside the WebView without spawning a second OS window. The cost is
// that a site sending X-Frame-Options: DENY (Google, GitHub, X) cannot be
// framed at all — that is the site's choice, not something the app can override
// — so those get an explicit "open in system browser" escape hatch instead of a
// blank pane.
export default function Browser() {
  const tabs = useBrowserStore((s) => s.tabs)
  const activeId = useBrowserStore((s) => s.activeId)
  const history = useBrowserStore((s) => s.history)
  const bookmarks = useBrowserStore((s) => s.bookmarks)
  const engine = useBrowserStore((s) => s.engine)
  const newTab = useBrowserStore((s) => s.newTab)
  const closeTab = useBrowserStore((s) => s.closeTab)
  const selectTab = useBrowserStore((s) => s.selectTab)
  const navigate = useBrowserStore((s) => s.navigate)
  const back = useBrowserStore((s) => s.back)
  const forward = useBrowserStore((s) => s.forward)
  const reload = useBrowserStore((s) => s.reload)
  const setLoading = useBrowserStore((s) => s.setLoading)
  const setBlocked = useBrowserStore((s) => s.setBlocked)
  const toggleBookmark = useBrowserStore((s) => s.toggleBookmark)

  const tab = tabs.find((t) => t.id === activeId) ?? tabs[0]
  const url = tab.stack[tab.index]
  const isNewTab = url === NEW_TAB

  const [omnibox, setOmnibox] = useState(isNewTab ? "" : url)
  const [reloadKey, setReloadKey] = useState(0)
  const omniRef = useRef<HTMLInputElement>(null)

  // The omnibox mirrors the active tab, except while it is being edited — that
  // is why it is state rather than a controlled read of the store.
  useEffect(() => {
    setOmnibox(isNewTab ? "" : url)
  }, [url, isNewTab, activeId])

  // Ctrl+L focuses the address bar, Ctrl+T opens a tab, Ctrl+W closes one —
  // the three shortcuts people reach for without thinking in a browser.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const k = e.key.toLowerCase()
      if (k === "l") {
        e.preventDefault()
        omniRef.current?.focus()
        omniRef.current?.select()
      } else if (k === "t") {
        e.preventDefault()
        newTab()
      } else if (k === "w") {
        e.preventDefault()
        closeTab(activeId)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [newTab, closeTab, activeId])

  // Pages load through the daemon's proxy, which strips the framing headers a
  // site would otherwise use to refuse being embedded. The proxy can still fail
  // outright (offline, DNS, a 5xx), so a timeout remains the backstop for a
  // frame that never finishes.
  useEffect(() => {
    if (isNewTab || !tab.loading) return
    const id = setTimeout(() => setBlocked(tab.id, true), 20000)
    return () => clearTimeout(id)
  }, [tab.id, tab.loading, isNewTab, url, reloadKey, setBlocked])

  // The proxy injects a script that catches link clicks inside the iframe and
  // sends them here via postMessage. Re-navigating through the store keeps the
  // new page proxied, with back/forward intact.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type !== "kai:navigate" || typeof e.data.url !== "string") return
      navigate(e.data.url)
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [navigate])

  // Falls back to loading the URL directly if the daemon is not up yet, so the
  // pane degrades to plain-iframe behaviour rather than rendering nothing.
  const frameSrc = useMemo(() => {
    if (isNewTab) return ""
    try {
      return proxyUrl(url)
    } catch {
      return url
    }
  }, [url, isNewTab])

  const bookmarked = bookmarks.some((b) => b.url === url)
  const sites = useMemo(() => topSites(history), [history])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!omnibox.trim()) return
    navigate(omnibox)
    omniRef.current?.blur()
  }

  const openExternally = () => {
    if (!isNewTab) void openUrl(url).catch(() => {})
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Tab strip */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border bg-card px-2 py-1">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <Tab
              key={t.id}
              title={t.title}
              active={t.id === activeId}
              loading={t.loading}
              onSelect={() => selectTab(t.id)}
              onClose={() => closeTab(t.id)}
            />
          ))}
          <button
            type="button"
            title="New tab (Ctrl+T)"
            aria-label="New tab"
            onClick={() => newTab()}
            className="flex size-6 shrink-0 items-center justify-center rounded text-kai-dim outline-none transition-colors hover:bg-panel hover:text-kai-text focus-visible:ring-2 focus-visible:ring-kai-orange/50"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* Toolbar — flat icons, then a wide address field with the URL centred,
          matching the browser pane this is modelled on. */}
      <div className="flex shrink-0 items-center gap-0.5 border-b border-border bg-card px-2 py-1">
        <NavBtn label="Back" onClick={back} disabled={tab.index === 0} icon={ArrowLeft} />
        <NavBtn
          label="Forward"
          onClick={forward}
          disabled={tab.index >= tab.stack.length - 1}
          icon={ArrowRight}
        />
        <NavBtn
          label="Reload"
          onClick={() => {
            reload()
            setReloadKey((k) => k + 1)
          }}
          disabled={isNewTab}
          icon={RotateCw}
          spinning={tab.loading}
        />

        <form onSubmit={submit} className="mx-1.5 flex min-w-0 flex-1">
          <div className="group/omni flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-panel/60 focus-within:bg-panel">
            <input
              ref={omniRef}
              value={omnibox}
              onChange={(e) => setOmnibox(e.target.value)}
              onFocus={(e) => e.target.select()}
              // Enter is handled outright rather than left to the form's
              // implicit submission: this field is the whole point of the
              // toolbar, and implicit submission is conditional on the form's
              // shape in ways that are easy to break by adding a control.
              onKeyDown={(e) => {
                if (e.key === "Enter") submit(e)
              }}
              placeholder={`Search ${ENGINES[engine].label} or type a URL`}
              aria-label="Address and search bar"
              // Centred at rest like the pane this mirrors, but left-aligned
              // while focused — you cannot sanely edit a long URL that keeps
              // recentring under the caret.
              className={cn(
                "min-w-0 flex-1 bg-transparent font-mono text-[11px] text-kai-text",
                "placeholder:text-kai-dim focus:outline-none",
                "text-center focus:text-left"
              )}
            />
            {!isNewTab && (
              <>
                <button
                  type="button"
                  title={bookmarked ? "Remove bookmark" : "Bookmark this page"}
                  aria-label={bookmarked ? "Remove bookmark" : "Bookmark this page"}
                  onClick={() => toggleBookmark(url, prettyHost(url))}
                  className="shrink-0 text-kai-dim outline-none transition-colors hover:text-kai-amber focus-visible:text-kai-amber"
                >
                  <Star size={11} className={bookmarked ? "fill-kai-amber text-kai-amber" : ""} />
                </button>
                <button
                  type="button"
                  title="Open in system browser"
                  aria-label="Open in system browser"
                  onClick={openExternally}
                  className="shrink-0 text-kai-dim outline-none transition-colors hover:text-kai-text focus-visible:text-kai-text"
                >
                  <ExternalLink size={11} />
                </button>
              </>
            )}
          </div>
        </form>
      </div>

      {/* Content */}
      <div className="relative min-h-0 flex-1">
        {isNewTab ? (
          <NewTabPage
            sites={sites}
            bookmarks={bookmarks}
            engine={engine}
            onOpen={(u) => navigate(u)}
            onFocusOmnibox={() => omniRef.current?.focus()}
          />
        ) : tab.blocked ? (
          <BlockedNotice url={url} onOpenExternal={openExternally} />
        ) : (
          <>
            {tab.loading && (
              <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-panel">
                <div className="animate-indeterminate h-full w-1/3 bg-kai-orange" />
              </div>
            )}
            <iframe
              key={`${tab.id}:${url}:${reloadKey}`}
              src={frameSrc}
              title={tab.title}
              onLoad={() => setLoading(tab.id, false)}
              className="h-full w-full border-0 bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
            />
          </>
        )}
      </div>
    </div>
  )
}

function Tab({
  title,
  active,
  loading,
  onSelect,
  onClose,
}: {
  title: string
  active: boolean
  loading: boolean
  onSelect: () => void
  onClose: () => void
}) {
  return (
    <div
      className={cn(
        "group flex h-6 min-w-0 max-w-[200px] shrink-0 cursor-default items-center gap-1.5",
        "rounded-md px-2 transition-colors",
        active ? "bg-panel text-kai-text" : "text-kai-dim hover:bg-panel/50 hover:text-kai-muted"
      )}
      onClick={onSelect}
    >
      {loading ? (
        <RotateCw size={10} className="shrink-0 animate-spin text-kai-orange" />
      ) : (
        <Globe size={10} className="shrink-0 text-kai-dim" />
      )}
      <span className="min-w-0 flex-1 truncate font-mono text-[10.5px]">{title}</span>
      <button
        type="button"
        aria-label={`Close ${title}`}
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="shrink-0 rounded text-kai-dim opacity-0 outline-none transition-opacity hover:text-kai-rose focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X size={10} />
      </button>
    </div>
  )
}

function NavBtn({
  label,
  onClick,
  disabled,
  icon: Icon,
  spinning,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  icon: typeof ArrowLeft
  spinning?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-6 shrink-0 items-center justify-center rounded text-kai-dim outline-none transition-colors hover:bg-panel hover:text-kai-text focus-visible:ring-2 focus-visible:ring-kai-orange/50 disabled:opacity-25 disabled:hover:bg-transparent"
    >
      <Icon size={13} className={spinning ? "animate-spin" : ""} />
    </button>
  )
}

// NewTabPage is the landing surface: a big search field and the places worth
// getting back to. Top sites are ranked by visit count, so it becomes useful
// only once there is something to rank — before that it says so plainly rather
// than showing an empty grid.
function NewTabPage({
  sites,
  bookmarks,
  engine,
  onOpen,
  onFocusOmnibox,
}: {
  sites: { url: string; title: string; count: number }[]
  bookmarks: { url: string; title: string }[]
  engine: keyof typeof ENGINES
  onOpen: (url: string) => void
  onFocusOmnibox: () => void
}) {
  const [q, setQ] = useState("")
  return (
    <div className="flex h-full flex-col items-center overflow-auto px-6 py-16">
      <Globe size={28} className="text-kai-orange" />
      <h1 className="mt-3 font-mono text-sm font-bold tracking-tight text-kai-text">
        Where to?
      </h1>
      <p className="mt-1 font-mono text-[10px] text-kai-dim">
        Search {ENGINES[engine].label} or type a URL · Ctrl+L
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (q.trim()) onOpen(q)
        }}
        className="mt-5 w-full max-w-lg"
      >
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 transition-colors focus-within:border-kai-orange/50">
          <Search size={13} className="shrink-0 text-kai-dim" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                if (q.trim()) onOpen(q)
              }
            }}
            placeholder="Type a URL"
            aria-label="Search or type a URL"
            className="min-w-0 flex-1 bg-transparent font-mono text-xs text-kai-text placeholder:text-kai-dim focus:outline-none"
          />
        </div>
      </form>

      <LinkGroup
        icon={Zap}
        label="Project"
        items={PROJECT_LINKS}
        onOpen={onOpen}
      />

      {bookmarks.length > 0 && (
        <LinkGroup
          icon={Star}
          label="Bookmarks"
          items={bookmarks.map((b) => ({ url: b.url, title: b.title }))}
          onOpen={onOpen}
        />
      )}

      {sites.length > 0 ? (
        <LinkGroup
          icon={History}
          label="Most visited"
          items={sites.map((s) => ({ url: s.url, title: s.title, meta: `${s.count}×` }))}
          onOpen={onOpen}
        />
      ) : (
        bookmarks.length === 0 && (
          <button
            type="button"
            onClick={onFocusOmnibox}
            className="mt-8 font-mono text-[10px] text-kai-dim underline-offset-2 outline-none hover:text-kai-muted hover:underline focus-visible:underline"
          >
            Nowhere yet — visit a page and it will show up here.
          </button>
        )
      )}
    </div>
  )
}

function LinkGroup({
  icon: Icon,
  label,
  items,
  onOpen,
}: {
  icon: typeof Star
  label: string
  items: { url: string; title: string; meta?: string }[]
  onOpen: (url: string) => void
}) {
  return (
    <div className="mt-8 w-full max-w-lg">
      <div className="mb-1.5 flex items-center gap-1.5 px-1">
        <Icon size={10} className="text-kai-dim" />
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-kai-dim">
          {label}
        </span>
      </div>
      {/* overflow-hidden is load-bearing: each row's hover fill would bleed
          past the rounded corners without it. That rules out hud-corners
          here, whose brackets sit 1px outside the box and would be clipped. */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {items.map((it, i) => (
          <button
            key={it.url}
            type="button"
            onClick={() => onOpen(it.url)}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-left outline-none transition-colors",
              "hover:bg-panel/60 focus-visible:bg-panel",
              i > 0 && "border-t border-border"
            )}
          >
            <Globe size={11} className="shrink-0 text-kai-dim" />
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-kai-text">
              {it.title}
            </span>
            <span className="shrink-0 truncate font-mono text-[9px] text-kai-dim">
              {it.meta ?? prettyHost(it.url)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// BlockedNotice covers what the proxy cannot rescue: a page that never
// finishes, or one so dependent on its own origin that the copy is unusable.
// The system browser is always the way out.
function BlockedNotice({ url, onOpenExternal }: { url: string; onOpenExternal: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <ShieldAlert size={26} className="text-kai-amber" />
      <p className="font-mono text-sm text-kai-text">This page didn't finish loading</p>
      <p className="max-w-md font-mono text-[11px] leading-relaxed text-kai-dim">
        <span className="text-kai-muted">{prettyHost(url)}</span> either took too long or depends on
        scripts and cookies that only work on its own origin. Heavy web apps often need a real
        browser tab.
      </p>
      <Button variant="primary" size="sm" onClick={onOpenExternal}>
        <ExternalLink size={11} />
        Open in system browser
      </Button>
    </div>
  )
}
