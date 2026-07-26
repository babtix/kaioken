import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { api } from "@/lib/api"
import { info } from "@/lib/daemon"
import { useConnStore } from "@/store/conn"
import { useRunsStore } from "@/store/runs"
import { useThemeStore } from "@/store/theme"
import { useWorkspaceStore } from "@/store/workspace"
import type { ConnStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

const DOT: Record<ConnStatus, { className: string; label: string }> = {
  open: { className: "bg-kai-green", label: "connected" },
  connecting: { className: "bg-kai-amber animate-pulse", label: "connecting" },
  reconnecting: { className: "bg-kai-amber animate-pulse", label: "reconnecting" },
}

export default function StatusBar() {
  const status = useConnStore((s) => s.status)
  const ws = useWorkspaceStore((s) => s.active)
  const runs = useRunsStore((s) => s.runs)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const [version, setVersion] = useState<string | null>(null)

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

  return (
    <footer className="flex h-6 shrink-0 items-center gap-2 border-t border-border bg-card px-3 font-mono text-[10px] text-kai-dim">
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
          <span className="size-1 rounded-full bg-kai-orange" />
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

      <button
        onClick={toggleTheme}
        title="Toggle theme"
        aria-label="Toggle theme"
        className={cn(
          "flex size-4.5 shrink-0 items-center justify-center rounded text-kai-dim transition-colors hover:text-kai-orange",
          !ws && "ml-auto"
        )}
      >
        {theme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
      </button>
    </footer>
  )
}
