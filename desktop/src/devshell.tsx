/**
 * Dev entry that runs real routes against a manually-started daemon.
 *
 * main.tsx blocks on the Tauri bridge, which is right for the product and
 * useless for checking a route in a browser. This entry reuses the production
 * bootstrap path with the `?port=&token=` dev override, so stores and API
 * calls are the real ones — only the daemon's location differs, and AppShell
 * is skipped because its window controls need Tauri.
 *
 *   kaioken daemon -port 7788 -token dev
 *   vite  →  http://localhost:1420/devshell.html?port=7788&token=dev#cost
 */
import { StrictMode, Suspense, lazy, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import { bootstrap } from "./lib/daemon"
import Toaster from "./components/Toaster"
import "./index.css"

const Cost = lazy(() => import("./routes/Cost"))
const Settings = lazy(() => import("./routes/Settings"))

const ROUTES = {
  cost: Cost,
  settings: Settings,
} as const

function DevShell() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [route, setRoute] = useState(() => window.location.hash.replace("#", "") || "cost")

  useEffect(() => {
    bootstrap()
      .then(() => setReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.replace("#", "") || "cost")
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  if (error) {
    return (
      <div className="p-8 font-mono text-[12px] text-kai-rose">
        {error}
        <p className="mt-2 text-kai-dim">Pass ?port= and &amp;token= for a running daemon.</p>
      </div>
    )
  }
  if (!ready) return <div className="p-8 font-mono text-[12px] text-kai-dim">connecting…</div>

  const View = ROUTES[route as keyof typeof ROUTES] ?? Cost

  return (
    // MemoryRouter because the routes use NavLink/useNavigate but this shell
    // drives navigation from the hash itself.
    <MemoryRouter>
      <div className="h-screen bg-background text-kai-text">
        <nav className="flex gap-3 border-b border-border px-4 py-2">
          {Object.keys(ROUTES).map((r) => (
            <a
              key={r}
              href={`#${r}`}
              className={r === route ? "font-mono text-[11px] text-kai-orange" : "font-mono text-[11px] text-kai-dim"}
            >
              {r}
            </a>
          ))}
        </nav>
        <div className="h-[calc(100vh-37px)] overflow-hidden">
          <Suspense fallback={<div className="p-8 font-mono text-[12px] text-kai-dim">loading…</div>}>
            <View />
          </Suspense>
        </div>
        <Toaster />
      </div>
    </MemoryRouter>
  )
}

type RootHost = HTMLElement & { __kaiRoot?: ReturnType<typeof createRoot> }
const host = document.getElementById("root") as RootHost
if (!host.__kaiRoot) host.__kaiRoot = createRoot(host)
host.__kaiRoot.render(
  <StrictMode>
    <DevShell />
  </StrictMode>
)
