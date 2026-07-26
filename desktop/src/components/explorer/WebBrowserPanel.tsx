import { useState } from "react"
import { ArrowLeft, ArrowRight, Home, RefreshCw } from "lucide-react"

// WebBrowserPanel is a simple in-sidebar web browser. Uses an iframe to render
// pages. Many sites block iframe embedding (X-Frame-Options), so this works
// best for docs, wikis, and sites that allow embedding.
export default function WebBrowserPanel() {
  const [url, setUrl] = useState("https://duckduckgo.com")
  const [inputValue, setInputValue] = useState("https://duckduckgo.com")
  const [history, setHistory] = useState<string[]>(["https://duckduckgo.com"])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [loading, setLoading] = useState(false)

  const navigate = (newUrl: string) => {
    setLoading(true)
    setUrl(newUrl)
    setInputValue(newUrl)
    const newHistory = [...history.slice(0, historyIndex + 1), newUrl]
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
  }

  const goBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      setUrl(history[newIndex])
      setInputValue(history[newIndex])
      setLoading(true)
    }
  }

  const goForward = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      setUrl(history[newIndex])
      setInputValue(history[newIndex])
      setLoading(true)
    }
  }

  const goHome = () => navigate("https://duckduckgo.com")

  const refresh = () => {
    setLoading(true)
    setUrl((u) => u + "#refresh-" + Date.now())
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    let finalUrl = inputValue.trim()
    if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
      finalUrl = "https://" + finalUrl
    }
    navigate(finalUrl)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* URL bar */}
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <button
          type="button"
          title="Back"
          onClick={goBack}
          disabled={historyIndex === 0}
          className="flex size-6 items-center justify-center rounded text-kai-dim outline-none transition-colors hover:bg-panel hover:text-kai-text focus-visible:ring-2 focus-visible:ring-kai-orange/50 disabled:opacity-30"
        >
          <ArrowLeft size={13} />
        </button>
        <button
          type="button"
          title="Forward"
          onClick={goForward}
          disabled={historyIndex >= history.length - 1}
          className="flex size-6 items-center justify-center rounded text-kai-dim outline-none transition-colors hover:bg-panel hover:text-kai-text focus-visible:ring-2 focus-visible:ring-kai-orange/50 disabled:opacity-30"
        >
          <ArrowRight size={13} />
        </button>
        <button
          type="button"
          title="Refresh"
          onClick={refresh}
          className="flex size-6 items-center justify-center rounded text-kai-dim outline-none transition-colors hover:bg-panel hover:text-kai-text focus-visible:ring-2 focus-visible:ring-kai-orange/50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
        <button
          type="button"
          title="Home"
          onClick={goHome}
          className="flex size-6 items-center justify-center rounded text-kai-dim outline-none transition-colors hover:bg-panel hover:text-kai-text focus-visible:ring-2 focus-visible:ring-kai-orange/50"
        >
          <Home size={13} />
        </button>
        <form onSubmit={onSubmit} className="ml-2 flex flex-1">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Enter URL…"
            className="w-full rounded border border-border bg-panel px-2 py-1 font-mono text-[11px] text-kai-text outline-none focus:border-kai-orange/50"
          />
        </form>
      </div>

      {/* Browser content */}
      <div className="relative min-h-0 flex-1">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/80">
            <div className="font-mono text-[10px] text-kai-dim">Loading…</div>
          </div>
        )}
        <iframe
          src={url}
          className="h-full w-full border-0"
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          title="Web Browser"
        />
      </div>
    </div>
  )
}