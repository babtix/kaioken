import { useEffect, useState } from "react"
import { Outlet, useNavigate } from "react-router-dom"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { GitBranch, Maximize2, Minus, Search, Sparkles, Terminal, TriangleAlert, X } from "lucide-react"
import NavRail from "./NavRail"
import StatusBar from "./StatusBar"
import WorkspaceSwitcher from "./WorkspaceSwitcher"
import ExplorerSidebar from "@/components/explorer/ExplorerSidebar"
import QuickSwitcher from "@/components/explorer/QuickSwitcher"
import Toaster from "@/components/Toaster"
import CommandPalette from "@/components/CommandPalette"
import ShortcutHelp from "@/components/ShortcutHelp"
import ErrorBoundary from "@/components/ErrorBoundary"
import { Badge, Button, Kbd } from "@/components/ui"
import { useWorkspaceStore } from "@/store/workspace"
import { useExplorerStore } from "@/store/explorer"
import { cn } from "@/lib/utils"

const NAV_ROUTES = ["/chat", "/wiki", "/activity", "/cards", "/settings"]

export default function AppShell() {
  const active = useWorkspaceStore((s) => s.active)
  const initWorkspace = useWorkspaceStore((s) => s.initWorkspace)
  const toggleExplorer = useExplorerStore((s) => s.toggleOpen)
  const navigate = useNavigate()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [initialising, setInitialising] = useState(false)
  const [maximized, setMaximized] = useState(false)

  // Track maximized state so the icon updates correctly.
  useEffect(() => {
    const win = getCurrentWindow()
    win.isMaximized().then(setMaximized).catch(() => {})
    let cleanup: (() => void) | undefined
    win.onResized(() => {
      win.isMaximized().then(setMaximized).catch(() => {})
    }).then((fn) => { cleanup = fn })
    return () => cleanup?.()
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === "k") { e.preventDefault(); setPaletteOpen((o) => !o); return }
      if (mod && e.key === "p") { e.preventDefault(); setQuickOpen(true); return }
      if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); toggleExplorer(); return }
      if (mod && e.key >= "1" && e.key <= "5") { e.preventDefault(); navigate(NAV_ROUTES[Number(e.key) - 1]); return }
      if (mod && e.key === ",") { e.preventDefault(); navigate("/settings"); return }
      if (e.key === "?" && !isInputFocused()) { e.preventDefault(); setHelpOpen((o) => !o) }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [navigate, toggleExplorer])

  const win = getCurrentWindow()

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
    {/* Full-width titlebar across the top */}
    <header className="titlebar-drag flex h-11 shrink-0 items-center gap-2 border-b border-border px-3 select-none">
      {/* Logo */}
      <button
        onClick={() => navigate("/")}
        className="titlebar-no-drag group flex shrink-0 items-center gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-kai-orange/50"
      >
        <Terminal size={13} className="text-kai-orange transition-colors group-hover:text-kai-amber" />
        <span className="font-mono text-xs font-bold tracking-tight text-foreground">kaioken</span>
        <span className="font-mono text-[11px] text-kai-dim" aria-hidden>▎</span>
      </button>

      {active && (
        <span className="titlebar-no-drag flex shrink-0 items-center gap-2">
          <WorkspaceSwitcher />
          {active.git.is_repo && (
            <span className="hidden items-center gap-1 font-mono text-[10px] text-kai-dim sm:flex">
              <GitBranch size={9} />
              {active.git.branch}
              {active.git.dirty_count > 0 && (
                <span className="text-kai-amber">·{active.git.dirty_count}</span>
              )}
            </span>
          )}
        </span>
      )}

      {/* Command palette — pushed to the right */}
      <button
        onClick={() => setPaletteOpen(true)}
        className={cn(
          "titlebar-no-drag ml-auto flex shrink-0 items-center gap-2 rounded-md border border-border bg-card px-2 py-1",
          "font-mono text-[10px] text-kai-dim transition-colors outline-none",
          "hover:border-kai-line hover:text-kai-text focus-visible:ring-2 focus-visible:ring-kai-orange/50"
        )}
      >
        <Search size={11} />
        <span className="hidden sm:inline">Search…</span>
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </button>

      {active?.model && (
        <span className="titlebar-no-drag hidden shrink-0 lg:block">
          <Badge tone="orange">{active.model}</Badge>
        </span>
      )}

      {/* Window controls */}
      <div className="titlebar-no-drag ml-2 flex shrink-0 items-center gap-0.5">
        <WinBtn label="Minimize" onClick={() => win.minimize()} hoverClass="hover:bg-kai-line/40">
          <Minus size={11} />
        </WinBtn>
        <WinBtn label={maximized ? "Restore" : "Maximize"} onClick={() => win.toggleMaximize()} hoverClass="hover:bg-kai-line/40">
          <Maximize2 size={10} />
        </WinBtn>
        <WinBtn label="Close" onClick={() => win.close()} hoverClass="hover:bg-red-700 hover:text-white">
          <X size={11} />
        </WinBtn>
      </div>
    </header>

    {/* Body row: NavRail | main content | optional explorer */}
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <NavRail />

      <div className="flex min-w-0 flex-1 flex-col">
        {active && !active.has_config && (
          <div className="animate-slide-up flex flex-wrap items-center gap-3 border-b border-kai-amber/25 bg-kai-amber/[0.06] px-4 py-2.5">
            <TriangleAlert size={14} className="shrink-0 text-kai-amber" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs text-kai-text">Not initialised for Kaioken</p>
              <p className="font-mono text-[10px] text-kai-dim">
                Creating <code className="text-kai-amber">.kaioken/config.yaml</code> unlocks scanning, wikis and the agent.
              </p>
            </div>
            <Button variant="primary" size="sm" loading={initialising} onClick={async () => {
              setInitialising(true)
              try { await initWorkspace(active.id) } finally { setInitialising(false) }
            }}>
              <Sparkles size={11} />
              Initialize
            </Button>
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-auto">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>

        <StatusBar />
      </div>

      {active && <ExplorerSidebar />}
    </div>

    <Toaster />
    <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    <QuickSwitcher open={quickOpen} onClose={() => setQuickOpen(false)} />
    <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}

function WinBtn({
  label,
  onClick,
  hoverClass,
  children,
}: {
  label: string
  onClick: () => void
  hoverClass: string
  children: React.ReactNode
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded text-kai-dim transition-colors",
        "outline-none focus-visible:ring-1 focus-visible:ring-kai-orange/50",
        hoverClass
      )}
    >
      {children}
    </button>
  )
}

function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  return tag === "input" || tag === "textarea" || tag === "select" || (el as HTMLElement).isContentEditable
}
