import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { invoke } from "@tauri-apps/api/core"
import {
  BookOpen,
  Clock,
  FolderOpen,
  GitBranch,
  Layers,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react"
import { useWorkspaceStore } from "@/store/workspace"
import { Badge, Card, SectionLabel, Skeleton } from "@/components/ui"
import { GlowButton } from "@/components/hud"
import { cn } from "@/lib/utils"
import { formatBytes } from "@/lib/format"
import type { ScanResult } from "@/lib/types"
import AsciiArt from "@/components/common/AsciiArt"

const ASCII_LOGO = `██╗  ██╗  █████╗  ██╗  ██████╗  ██╗  ██╗ ███████╗ ███╗   ██╗
██║ ██╔╝ ██╔══██╗ ██║ ██╔═══██╗ ██║ ██╔╝ ██╔════╝ ████╗  ██║
█████╔╝  ███████║ ██║ ██║   ██║ █████╔╝  █████╗   ██╔██╗ ██║
██╔═██╗  ██╔══██║ ██║ ██║   ██║ ██╔═██╗  ██╔══╝   ██║╚██╗██║
██║  ██╗ ██║  ██║ ██║ ╚██████╔╝ ██║  ██╗ ███████╗ ██║ ╚████║
╚═╝  ╚═╝ ╚═╝  ╚═╝ ╚═╝  ╚═════╝  ╚═╝  ╚═╝ ╚══════╝ ╚═╝  ╚═══╝`

export default function Welcome() {
  const active = useWorkspaceStore((s) => s.active)
  return active ? <WorkspaceOverview /> : <RepoPicker />
}

// ── Overview of the open workspace ─────────────────────────────────────────

function WorkspaceOverview() {
  const active = useWorkspaceStore((s) => s.active)!
  const scan = useWorkspaceStore((s) => s.scan)
  const refreshScan = useWorkspaceStore((s) => s.refreshScan)
  const navigate = useNavigate()

  useEffect(() => {
    refreshScan()
  }, [active.id, refreshScan])

  const k = active.knowledge

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h1 className="font-mono text-xl font-bold tracking-tight text-kai-white">
            {active.name}
          </h1>
          <p className="mt-0.5 truncate font-mono text-[11px] text-kai-dim">{active.path}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {active.git.is_repo && (
            <Badge tone="neutral">
              <GitBranch size={9} />
              {active.git.branch}
            </Badge>
          )}
          {active.git.dirty_count > 0 && (
            <Badge tone="amber">{active.git.dirty_count} uncommitted</Badge>
          )}
          {active.model && <Badge tone="orange">{active.model}</Badge>}
        </div>
      </header>

      {/* Knowledge state — each tile routes to where you act on it. */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Modules"
          value={k.module_count}
          icon={Layers}
          onClick={() => navigate("/cards")}
        />
        <StatTile
          label="Wiki docs"
          value={k.wiki_docs}
          icon={BookOpen}
          onClick={() => navigate(k.wiki_docs > 0 ? "/wiki" : "/activity")}
        />
        <StatTile
          label="Skills"
          value={k.skill_count}
          icon={Sparkles}
          onClick={() => navigate("/cards")}
        />
        <StatTile
          label="Sections"
          value={k.wiki_sections}
          icon={BookOpen}
          onClick={() => navigate(k.wiki_docs > 0 ? "/wiki" : "/activity")}
        />
      </div>

      {/* Nudge toward the next useful action when the repo is un-analysed.
          The rim glow is earned here: this is the screen's one call to action. */}
      {k.wiki_docs === 0 && k.module_count === 0 && (
        <Card className="hud-corners hud-rim mt-4 flex flex-wrap items-center gap-3 rounded-[var(--radius)] bg-accent/40 p-4">
          <Sparkles size={15} className="shrink-0 text-kai-orange" />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs text-kai-text">This repository has no knowledge yet</p>
            <p className="mt-0.5 font-mono text-[10px] text-kai-dim">
              Generate a wiki to turn it into linked chapters you (and the agent) can read.
            </p>
          </div>
          <GlowButton onClick={() => navigate("/activity")}>Generate</GlowButton>
        </Card>
      )}

      {/* Scan */}
      <section className="mt-6">
        <div className="flex items-center gap-2">
          <SectionLabel>Repository scan</SectionLabel>
          <button
            onClick={() => refreshScan(true)}
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] text-kai-dim transition-colors hover:text-kai-text"
          >
            <RefreshCw size={10} />
            refresh
          </button>
        </div>
        {scan ? <ScanPanel scan={scan} /> : <ScanSkeleton />}
      </section>
    </div>
  )
}

function ScanPanel({ scan }: { scan: ScanResult }) {
  const total = scan.languages.reduce((n, l) => n + l.files, 0) || 1
  const top = scan.languages.slice(0, 6)

  return (
    <div className="mt-2 space-y-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-mono text-sm text-kai-text">
          {scan.files.toLocaleString()} files
        </span>
        <span className="font-mono text-xs text-kai-dim">{formatBytes(scan.bytes)}</span>
        {scan.cached && <Badge tone="neutral">cached</Badge>}
      </div>

      {top.length > 0 && (
        <div>
          {/* Composition bar */}
          <div className="flex h-1.5 overflow-hidden rounded-full">
            {top.map((l, i) => (
              <div
                key={l.lang}
                title={`${l.lang} · ${l.files} files`}
                style={{ width: `${(l.files / total) * 100}%` }}
                className={
                  ["bg-kai-orange", "bg-kai-amber", "bg-kai-tan", "bg-kai-blue", "bg-kai-green", "bg-kai-sage"][i % 6]
                }
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {top.map((l, i) => (
              <span key={l.lang} className="flex items-center gap-1.5 font-mono text-[10px] text-kai-muted">
                <span
                  className={cn(
                    "size-2 rounded-sm",
                    ["bg-kai-orange", "bg-kai-amber", "bg-kai-tan", "bg-kai-blue", "bg-kai-green", "bg-kai-sage"][i % 6]
                  )}
                />
                {l.lang}
                <span className="text-kai-dim">{l.files}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <pre className="max-h-72 overflow-auto rounded-md border border-border bg-kai-code p-3 font-mono text-[10px] leading-relaxed text-kai-muted">
        {scan.tree}
      </pre>
    </div>
  )
}

function ScanSkeleton() {
  return (
    <div className="mt-2 space-y-3">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-1.5 w-full rounded-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  )
}

function StatTile({
  label,
  value,
  icon: Icon,
  onClick,
}: {
  label: string
  value: number
  icon: typeof Layers
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group hud-panel hud-corners rounded-[var(--radius)] p-3 text-left transition-colors outline-none",
        "hover:border-kai-orange/40 focus-visible:ring-2 focus-visible:ring-kai-orange/50"
      )}
    >
      <div className="flex items-center gap-1.5">
        <Icon size={11} className="text-kai-dim transition-colors group-hover:text-kai-orange" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-kai-dim">{label}</span>
      </div>
      <p
        className={cn(
          "mt-1 font-mono text-2xl font-bold tabular-nums",
          value > 0 ? "text-kai-orange" : "text-kai-dim"
        )}
      >
        {value}
      </p>
    </button>
  )
}

// ── Repo picker ────────────────────────────────────────────────────────────

function RepoPicker() {
  const navigate = useNavigate()
  const { list, recents, loading, open, refresh } = useWorkspaceStore()
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    refresh()
  }, [refresh])

  const openPath = useCallback(
    async (path: string) => {
      setError(null)
      try {
        await open(path)
        navigate("/chat")
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [open, navigate]
  )

  async function pickFolder() {
    setError(null)
    try {
      const path = await invoke<string | null>("pick_folder", { title: "Open a repository" })
      if (path) await openPath(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
      }}
      className={cn(
        "hud-grid relative flex h-full flex-col items-center justify-center gap-7 p-8 transition-colors overflow-hidden",
        dragging && "bg-accent/30"
      )}
    >
      {/* hero ambient bloom for logo and initial action */}
      <div className="animate-bloom kai-bloom pointer-events-none absolute left-1/2 top-1/3 h-[45vh] w-[65vw] -translate-x-1/2 -translate-y-1/2 bg-kai-orange/15" />

      <div className="animate-charge text-center flex flex-col items-center z-10">
        <AsciiArt
          art={ASCII_LOGO}
          label="kaioken"
          className="text-[8px] sm:text-[13px] md:text-[16px]"
        />
        <div className="mt-2.5 font-mono text-[9px] sm:text-[13px] opacity-70 tracking-wider">
          <span className="text-kai-rose/50">══════════════════════════ </span>
          <span className="font-bold text-kai-orange glow-orange">v1.3.3</span>
          <span className="text-kai-rose/50"> ══════════════════════════</span>
        </div>
      </div>

      <GlowButton onClick={pickFolder} busy={loading} className="px-6 py-2.5">
        <span className="flex items-center gap-2">
          <FolderOpen size={14} />
          {loading ? "Opening…" : "Open a repository"}
        </span>
      </GlowButton>

      {error && (
        <p className="flex items-center gap-2 font-mono text-xs text-kai-rose">
          <TriangleAlert size={13} />
          {error}
        </p>
      )}

      {(recents.length > 0 || list.length > 0) && (
        <div className="hud-panel hud-corners w-full max-w-lg rounded-[var(--radius)] p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Clock size={11} className="text-kai-dim" />
            <SectionLabel>Recent</SectionLabel>
          </div>
          <ul className="space-y-1">
            {recents.slice(0, 8).map((r) => {
              const name = r.path.split("/").filter(Boolean).pop() || r.path
              return (
                <li key={r.path}>
                  <button
                    onClick={() => !r.missing && openPath(r.path)}
                    disabled={r.missing}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left transition-colors outline-none",
                      r.missing
                        ? "cursor-not-allowed opacity-45"
                        : "hover:border-border hover:bg-card focus-visible:ring-2 focus-visible:ring-kai-orange/50"
                    )}
                  >
                    <FolderOpen
                      size={13}
                      className="shrink-0 text-kai-dim transition-colors group-hover:text-kai-orange"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-xs text-kai-text">{name}</span>
                      <span className="block truncate font-mono text-[10px] text-kai-dim">{r.path}</span>
                    </span>
                    {r.missing && (
                      <span className="ml-auto shrink-0">
                        <Badge tone="rose">missing</Badge>
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <p className="font-mono text-[10px] text-kai-dim">
        Everything stays local — the only network traffic is to your chosen model provider.
      </p>
    </div>
  )
}
