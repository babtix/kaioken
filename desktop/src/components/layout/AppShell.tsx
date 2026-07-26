import { useEffect, useState } from "react"
import { Outlet, useNavigate } from "react-router-dom"
import { AlertTriangle } from "lucide-react"
import NavRail from "./NavRail"
import StatusBar from "./StatusBar"
import Toaster from "@/components/Toaster"
import CommandPalette from "@/components/CommandPalette"
import ShortcutHelp from "@/components/ShortcutHelp"
import { useWorkspaceStore } from "@/store/workspace"

const NAV_ROUTES = ["/chat", "/wiki", "/activity", "/cards", "/settings"]

export default function AppShell() {
  const active = useWorkspaceStore((s) => s.active)
  const initWorkspace = useWorkspaceStore((s) => s.initWorkspace)
  const navigate = useNavigate()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  // Global keyboard shortcuts.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === "k") {
        e.preventDefault()
        setPaletteOpen((o) => !o)
        return
      }
      if (mod && e.key >= "1" && e.key <= "5") {
        e.preventDefault()
        navigate(NAV_ROUTES[Number(e.key) - 1])
        return
      }
      // ? shortcut — only when not typing in an input.
      if (e.key === "?" && !isInputFocused()) {
        e.preventDefault()
        setHelpOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [navigate])

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar: workspace name or prompt to open one */}
        <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
          <span className="font-mono text-xs font-bold tracking-tight text-kai-orange">
            kaioken
          </span>
          {active && (
            <>
              <span className="text-kai-dim">/</span>
              <span className="truncate font-mono text-xs text-kai-text">{active.name}</span>
              {active.git.is_repo && (
                <span className="ml-auto font-mono text-[10px] text-kai-dim">
                  {active.git.branch}
                  {active.git.dirty_count > 0 && (
                    <span className="text-kai-amber"> ·{active.git.dirty_count}</span>
                  )}
                </span>
              )}
            </>
          )}
        </header>

        {/* Init banner when workspace has no config */}
        {active && !active.has_config && (
          <div className="flex items-center gap-3 border-b border-kai-amber/30 bg-accent px-4 py-2">
            <AlertTriangle size={14} className="shrink-0 text-kai-amber" />
            <span className="font-mono text-xs text-kai-text">
              This repository has no <code className="text-kai-amber">.kaioken/config.yaml</code>
            </span>
            <button
              onClick={() => initWorkspace(active.id)}
              className="ml-auto rounded border border-kai-orange/40 px-3 py-1 font-mono text-xs text-kai-orange transition-colors hover:bg-accent/80"
            >
              Initialize
            </button>
          </div>
        )}

        {/* Main content */}
        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>

        {/* Status bar */}
        <StatusBar />
      </div>

      {/* Global overlays */}
      <Toaster />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}

function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  return tag === "input" || tag === "textarea" || tag === "select" || (el as HTMLElement).isContentEditable
}
