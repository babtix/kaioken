import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Moon, Sigma, SquareTerminal, Sun } from "lucide-react"
import { api } from "@/lib/api"
import { info } from "@/lib/daemon"
import { formatTokens } from "@/lib/format"
import { useConnStore } from "@/store/conn"
import { useRunsStore } from "@/store/runs"
import { useTerminalStore } from "@/store/terminal"
import { useThemeStore } from "@/store/theme"
import { useWorkspaceStore } from "@/store/workspace"
import type { ConnStatus, Usage } from "@/lib/types"
import { cn } from "@/lib/utils"

// A healthy link gets a steady lit dot; the unhealthy states pulse. Motion
// marks the state that wants attention, never the resting one.
const DOT: Record<ConnStatus, { className: string; label: string }> = {
  open: {
    className: "bg-kai-green shadow-[0_0_6px_-1px_var(--kai-green)]",
    label: "connected",
  },
  connecting: { className: "bg-kai-amber animate-pulse", label: "connecting" },
  reconnecting: { className: "bg-kai-amber animate-pulse", label: "reconnecting" },
}

/** Hairline rule separating readout groups, the way a HUD segments a bar. */
function Sep() {
  return <span aria-hidden className="h-2.5 w-px shrink-0 bg-border" />
}

export default function StatusBar() {
  const status = useConnStore((s) => s.status)
  const ws = useWorkspaceStore((s) => s.active)
  const runs = useRunsStore((s) => s.runs)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const panelOpen = useTerminalStore((s) => s.panelOpen)
  const togglePanel = useTerminalStore((s) => s.togglePanel)
  const navigate = useNavigate()
  const location = useLocation()
  const [version, setVersion] = useState<string | null>(null)

  // The terminal lives on the Editor screen; from anywhere else this button
  // goes there and makes sure the panel is up (spawning a shell if none) —
  // the discoverable counterpart to Ctrl+`.
  const openTerminal = () => {
    if (location.pathname === "/editor") {
      togglePanel()
      return
    }
    navigate("/editor")
    if (!useTerminalStore.getState().panelOpen) togglePanel()
  }

  useEffect(() => {
    let cancelled = false
    api
      .health()
      .then((h) => !cancelled && setVersion(h.version))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [status]) // re-check after a reconnect, which may be a new daemon

  const dot = DOT[status]
  const activeRuns = runs.filter((r) => r.state === "running" || r.state === "queued")
  const usage = useUsage(ws?.id ?? null, activeRuns.length)

  return (
    // Scanlines match the titlebar: the two bars frame the app, so they wear
    // the same texture or the frame reads as lopsided.
    <footer className="hud-scanlines flex h-6 shrink-0 items-center gap-2 border-t border-border bg-card px-3 font-mono text-[10px] text-kai-dim">
      <span
        className={cn("size-2 shrink-0 rounded-full", dot.className)}
        title={dot.label}
        aria-label={dot.label}
      />
      <span>
        {status === "open"
          ? version
            ? `daemon v${version} · :${info().port}`
            : `daemon · :${info().port}`
          : dot.label + "…"}
      </span>

      {activeRuns.length > 0 && (
        <span className="flex items-center gap-1.5 text-kai-orange">
          {/* The pulse marks a run genuinely in flight — the one place in the
              status bar that earns motion under the HUD rules. */}
          <span className="relative flex size-1.5">
            <span className="animate-energy absolute inline-flex size-full rounded-full bg-kai-orange" />
            <span className="relative inline-flex size-1.5 rounded-full bg-kai-orange" />
          </span>
          {activeRuns.length} run{activeRuns.length > 1 ? "s" : ""} active
          {activeRuns[0]?.progress?.message && (
            <span className="max-w-64 truncate text-kai-dim">
              — {activeRuns[0].progress.message}
            </span>
          )}
        </span>
      )}

      {ws && (
        <span className="ml-auto truncate" title={ws.path}>
          {ws.path}
        </span>
      )}

      {ws && usage && usage.calls > 0 && <Sep />}
      {ws && usage && usage.calls > 0 && (
        <span
          className="flex shrink-0 items-center gap-1 text-kai-muted"
          title={`${usage.calls} LLM calls · ${usage.prompt_tokens.toLocaleString()} prompt + ${usage.completion_tokens.toLocaleString()} completion tokens${usage.model ? ` · ${usage.model}` : ""}`}
        >
          <Sigma size={9} />
          {formatTokens(usage.prompt_tokens + usage.completion_tokens)} tok · {usage.calls} calls
        </span>
      )}

      {/* Only when a workspace is open: without one the terminal button takes
          `ml-auto` and a separator here would be left stranded mid-bar. */}
      {ws && <Sep />}

      <button
        onClick={openTerminal}
        title="Terminal (Ctrl+`)"
        aria-label="Toggle terminal panel"
        className={cn(
          "flex size-4.5 shrink-0 items-center justify-center rounded transition-colors outline-none",
          "hover:text-kai-orange focus-visible:ring-2 focus-visible:ring-kai-orange/50",
          panelOpen ? "text-kai-orange" : "text-kai-dim",
          !ws && "ml-auto"
        )}
        disabled={!ws}
      >
        <SquareTerminal size={12} />
      </button>

      <button
        onClick={toggleTheme}
        title="Toggle theme"
        aria-label="Toggle theme"
        className={cn(
          "flex size-4.5 shrink-0 items-center justify-center rounded text-kai-dim transition-colors outline-none",
          "hover:text-kai-orange focus-visible:ring-2 focus-visible:ring-kai-orange/50"
        )}
      >
        {theme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
      </button>
    </footer>
  )
}

/**
 * The always-visible cost meter (PLAN.md G3): workspace-lifetime LLM usage,
 * re-read when a run finishes and on a slow tick so chat turns show up
 * without a dedicated event stream.
 */
function useUsage(wsId: string | null, activeRunCount: number): Usage | null {
  const [usage, setUsage] = useState<Usage | null>(null)

  useEffect(() => {
    if (!wsId) {
      setUsage(null)
      return
    }
    let cancelled = false
    const load = () =>
      api
        .usage(wsId)
        .then((u) => !cancelled && setUsage(u))
        .catch(() => {})
    load()
    const id = setInterval(load, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [wsId, activeRunCount]) // a run starting or ending moves the number

  return usage
}
