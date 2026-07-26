import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { invoke } from "@tauri-apps/api/core"
import { FolderOpen, Clock, AlertTriangle, RefreshCw } from "lucide-react"
import { useWorkspaceStore } from "@/store/workspace"
import { cn } from "@/lib/utils"
import type { ScanResult } from "@/lib/types"

export default function Welcome() {
  const active = useWorkspaceStore((s) => s.active)

  // When a workspace is active, show its overview; otherwise the picker.
  if (active) return <WorkspaceOverview />
  return <RepoPicker />
}

// --- Workspace overview with scan summary (T020) ---

function WorkspaceOverview() {
  const active = useWorkspaceStore((s) => s.active)!
  const scan = useWorkspaceStore((s) => s.scan)
  const refreshScan = useWorkspaceStore((s) => s.refreshScan)

  useEffect(() => {
    refreshScan()
  }, [active.id, refreshScan])

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="font-mono text-lg font-bold text-kai-text">{active.name}</h1>
      <p className="mt-1 font-mono text-xs text-kai-dim">{active.path}</p>

      {/* Knowledge summary */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Modules" value={active.knowledge.module_count} />
        <Stat label="Wiki docs" value={active.knowledge.wiki_docs} />
        <Stat label="Skills" value={active.knowledge.skill_count} />
      </div>

      {/* Scan panel */}
      <div className="mt-6">
        <div className="flex items-center gap-2">
          <h2 className="font-mono text-xs font-bold text-kai-dim">SCAN</h2>
          <button
            onClick={() => refreshScan(true)}
            className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] text-kai-dim transition-colors hover:text-kai-text"
            title="Refresh scan"
          >
            <RefreshCw size={10} />
            refresh
          </button>
        </div>

        {scan ? (
          <ScanPanel scan={scan} />
        ) : (
          <p className="mt-2 font-mono text-xs text-kai-dim">Loading scan…</p>
        )}
      </div>
    </div>
  )
}

function ScanPanel({ scan }: { scan: ScanResult }) {
  return (
    <div className="mt-2 space-y-3">
      <p className="font-mono text-xs text-kai-text">{scan.stats}</p>

      {/* Language breakdown */}
      {scan.languages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {scan.languages.slice(0, 8).map((l) => (
            <span
              key={l.lang}
              className="rounded bg-panel px-2 py-0.5 font-mono text-[10px] text-kai-muted"
            >
              {l.lang} ×{l.files}
            </span>
          ))}
        </div>
      )}

      {/* Tree preview */}
      <pre className="max-h-64 overflow-auto rounded border border-border bg-card p-3 font-mono text-[10px] leading-relaxed text-kai-muted">
        {scan.tree}
      </pre>

      <p className="font-mono text-[10px] text-kai-dim">
        scanned {new Date(scan.scanned_at).toLocaleTimeString()}
        {scan.cached && " (cached)"}
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border bg-card px-3 py-2 text-center">
      <p className="font-mono text-lg font-bold text-kai-orange">{value}</p>
      <p className="font-mono text-[10px] text-kai-dim">{label}</p>
    </div>
  )
}

// --- Repo picker (no workspace active) ---

function RepoPicker() {
  const navigate = useNavigate()
  const { list, recents, loading, open, refresh } = useWorkspaceStore()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    refresh()
  }, [refresh])

  async function pickFolder() {
    setError(null)
    try {
      const path = await invoke<string | null>("pick_folder", { title: "Open a repository" })
      if (!path) return // user cancelled
      await open(path)
      navigate("/chat")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function openRecent(path: string) {
    setError(null)
    try {
      await open(path)
      navigate("/chat")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 p-8">
      {/* Wordmark */}
      <div className="text-center">
        <h1 className="font-mono text-3xl font-bold tracking-tight text-kai-orange">kaioken</h1>
        <p className="mt-2 font-mono text-sm text-kai-dim">
          AI coding agent + knowledge engine
        </p>
      </div>

      {/* Open folder button */}
      <button
        onClick={pickFolder}
        disabled={loading}
        className={cn(
          "flex items-center gap-2 rounded-md border border-kai-orange/40 bg-accent px-6 py-3",
          "font-mono text-sm text-kai-orange transition-colors hover:bg-accent/80",
          "disabled:opacity-50"
        )}
      >
        <FolderOpen size={18} />
        {loading ? "Opening…" : "Open a repository"}
      </button>

      {error && (
        <p className="flex items-center gap-2 font-mono text-xs text-kai-rose">
          <AlertTriangle size={14} />
          {error}
        </p>
      )}

      {/* Recents */}
      {recents.length > 0 && (
        <div className="w-full max-w-md">
          <h2 className="mb-2 flex items-center gap-2 font-mono text-xs text-kai-dim">
            <Clock size={12} />
            Recent
          </h2>
          <ul className="space-y-1">
            {recents.map((r) => (
              <li key={r.path}>
                <button
                  onClick={() => !r.missing && openRecent(r.path)}
                  disabled={r.missing}
                  className={cn(
                    "w-full truncate rounded px-3 py-2 text-left font-mono text-xs transition-colors",
                    r.missing
                      ? "cursor-not-allowed text-kai-dim opacity-50"
                      : "text-kai-text hover:bg-panel"
                  )}
                >
                  {r.path}
                  {r.missing && <span className="ml-2 text-kai-rose">(missing)</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Already-open workspaces */}
      {list.length > 0 && (
        <div className="w-full max-w-md">
          <h2 className="mb-2 font-mono text-xs text-kai-dim">Open workspaces</h2>
          <ul className="space-y-1">
            {list.map((ws) => (
              <li key={ws.id}>
                <button
                  onClick={() => {
                    useWorkspaceStore.getState().setActive(ws.id)
                  }}
                  className="w-full truncate rounded px-3 py-2 text-left font-mono text-xs text-kai-text transition-colors hover:bg-panel"
                >
                  {ws.name}
                  <span className="ml-2 text-kai-dim">{ws.path}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
