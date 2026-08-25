/**
 * Standalone overview / demo page.
 *
 * Shows the full interactive AppWindow recreation with all 12 screens
 * populated with demo data — no daemon, no stores, no router needed.
 *
 * Open it:  vite  →  http://localhost:1420/overview.html
 */
import { StrictMode, useState } from "react"
import { createRoot } from "react-dom/client"
import { Moon, Sun } from "lucide-react"
import { useThemeStore } from "@/store/theme"
import AppWindow from "@/components/overview/AppWindow"
import "./index.css"

function Overview() {
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const dark = theme === "dark"
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* header */}
        <header className="mb-8 flex items-center gap-4">
          <div className="flex-1">
            <h1 className="font-mono text-xl font-bold tracking-tight text-kai-orange">
              KAIOKEN
              <span className="ml-2 text-kai-dim">desktop overview</span>
            </h1>
            <p className="mt-1 font-mono text-[11px] text-kai-dim">
              Interactive demo of all 12 surfaces — click the rail or let it tour
            </p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex items-center gap-1.5 rounded-[var(--radius)] border border-border
                       bg-card px-2.5 py-1.5 font-mono text-[11px] text-kai-text
                       transition-colors hover:border-kai-orange/40 hover:bg-accent"
          >
            {dark ? <Moon size={12} /> : <Sun size={12} />}
            {dark ? "Dark" : "Light"}
          </button>
        </header>

        {/* the centrepiece */}
        <section className="space-y-4">
          <AppWindow start="chat" />

          {/* feature highlights */}
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { stat: "12", label: "surfaces", note: "Chat, Research, Wiki, Graph, Cards, Editor, Browser, Activity, Extensions, Cost, Settings, Repos" },
              { stat: "1", label: "extra process", note: "The Go daemon — the same binary the CLI ships" },
              { stat: "0", label: "telemetry endpoints", note: "No account, no phone-home, local only" },
            ].map((s) => (
              <div key={s.label} className="rounded-md border border-border bg-card p-4">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-bold text-kai-orange">{s.stat}</span>
                  <span className="font-mono text-[11px] text-kai-dim">{s.label}</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-kai-muted">{s.note}</p>
              </div>
            ))}
          </div>

          {/* architecture */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-4 py-3 text-left transition-colors hover:border-kai-orange/30"
          >
            <span className="font-mono text-sm font-bold text-foreground">Architecture</span>
            <span className="ml-auto font-mono text-[10px] text-kai-dim">
              {expanded ? "collapse ▲" : "expand ▼"}
            </span>
          </button>

          {expanded && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { title: "React front-end", sub: "the surface", parts: "React 19, Vite 6, Tailwind 4, zustand, CodeMirror 6, xterm.js", tone: "text-kai-blue" },
                { title: "Tauri v2 shell", sub: "thin on purpose", parts: "spawn, supervise, PTY, no business logic", tone: "text-kai-orange" },
                { title: "kaioken daemon", sub: "the existing Go engine", parts: "loopback only, bearer token, SSE stream, curl-testable", tone: "text-kai-amber" },
                { title: ".kaioken/ on disk", sub: "one source of truth", parts: "config.yaml, modules.yaml, wiki/, knowledge/, sessions/", tone: "text-kai-green" },
              ].map((l) => (
                <div key={l.title} className="rounded-md border border-border bg-card/60 p-4">
                  <h3 className={`font-mono text-sm font-bold ${l.tone}`}>{l.title}</h3>
                  <p className="text-[10px] text-kai-dim">{l.sub}</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-kai-muted">{l.parts}</p>
                </div>
              ))}
            </div>
          )}

          {/* keyboard shortcuts preview */}
          <div className="rounded-md border border-border bg-card p-4">
            <h3 className="font-mono text-[11px] tracking-[0.2em] text-kai-amber uppercase">
              keyboard shortcuts
            </h3>
            <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-3">
              {[
                { keys: "Ctrl+1…9", label: "Jump to any surface" },
                { keys: "Ctrl+K", label: "Command palette" },
                { keys: "Ctrl+N", label: "New chat session" },
                { keys: "Ctrl+,", label: "Settings" },
                { keys: "Ctrl+`", label: "Toggle terminal" },
                { keys: "Ctrl+P", label: "Quick file switcher" },
              ].map((s) => (
                <div key={s.keys} className="flex items-center justify-between py-1">
                  <span className="text-[11px] text-kai-muted">{s.label}</span>
                  <kbd className="rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[9px] text-kai-dim">
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* footer */}
        <footer className="mt-8 border-t border-border pt-6 text-center">
          <p className="font-mono text-[10px] text-kai-dim">
            This is a demo rendering — no daemon required. Open the real app with{" "}
            <code className="rounded-sm border border-border px-1 py-px text-kai-muted">npm run tauri dev</code>
          </p>
        </footer>
      </div>
    </div>
  )
}

type RootHost = HTMLElement & { __kaiRoot?: ReturnType<typeof createRoot> }
const host = document.getElementById("root") as RootHost
if (!host.__kaiRoot) host.__kaiRoot = createRoot(host)
host.__kaiRoot.render(
  <StrictMode>
    <Overview />
  </StrictMode>
)
