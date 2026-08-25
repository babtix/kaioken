import { Fragment, useEffect, useRef, useState } from "react"
import {
  BookOpen, Code2, FolderOpen, Globe, Layers, MessageSquare,
  Minus, Puzzle, Radar, Settings, Square, Store, Wallet,
  Waypoints, X, Zap,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useInView, useReducedMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"
import {
  ActivityPane, BrowserPane, CardsPane, ChatPane, CostPane,
  EditorPane, ExtensionsPane, GraphPane, ResearchPane,
  SettingsPane, WikiPane, WorkspacesPane,
} from "./panes"

/**
 * A working recreation of the Kaioken desktop window — custom title bar, nav
 * rail, route content, status bar. Click the rail to change screens; left
 * alone it walks the tour by itself.
 */

type PaneId =
  | "repos" | "chat" | "research" | "wiki" | "graph" | "cards"
  | "editor" | "browser" | "activity" | "extensions" | "cost" | "settings"

interface RailItem {
  id: PaneId
  icon: LucideIcon
  label: string
  key: string
  Pane: React.ComponentType<{ active: boolean }>
}

const RAIL: RailItem[] = [
  { id: "repos", icon: FolderOpen, label: "Repos", key: "", Pane: WorkspacesPane },
  { id: "chat", icon: MessageSquare, label: "Chat", key: "1", Pane: ChatPane },
  { id: "research", icon: Radar, label: "Research", key: "2", Pane: ResearchPane },
  { id: "wiki", icon: BookOpen, label: "Wiki", key: "3", Pane: WikiPane },
  { id: "graph", icon: Waypoints, label: "Graph", key: "4", Pane: GraphPane },
  { id: "cards", icon: Layers, label: "Cards", key: "5", Pane: CardsPane },
  { id: "editor", icon: Code2, label: "Editor", key: "6", Pane: EditorPane },
  { id: "browser", icon: Globe, label: "Browser", key: "7", Pane: BrowserPane },
  { id: "activity", icon: Zap, label: "Activity", key: "8", Pane: ActivityPane },
  { id: "extensions", icon: Puzzle, label: "Ext", key: "9", Pane: ExtensionsPane },
  { id: "cost", icon: Wallet, label: "Cost", key: "", Pane: CostPane },
  { id: "settings", icon: Settings, label: "Settings", key: ",", Pane: SettingsPane },
]

const TOUR: PaneId[] = ["chat", "research", "wiki", "graph", "activity", "cost", "editor"]
const DWELL_MS = 5600

export default function AppWindow({
  className,
  start = "chat",
}: {
  className?: string
  start?: PaneId
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const inView = useInView(hostRef, "120px")
  const reduced = useReducedMotion()

  const [pane, setPane] = useState<PaneId>(start)
  const [steered, setSteered] = useState(false)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    if (reduced || steered || hovered || !inView) return
    const id = window.setInterval(() => {
      setPane((current) => {
        const i = TOUR.indexOf(current)
        return TOUR[(i + 1) % TOUR.length] ?? TOUR[0]
      })
    }, DWELL_MS)
    return () => window.clearInterval(id)
  }, [reduced, steered, hovered, inView])

  const item = RAIL.find((r) => r.id === pane) ?? RAIL[1]
  const Pane = item.Pane

  return (
    <div
      ref={hostRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn("overflow-hidden rounded-md border border-border bg-background", className)}
      role="figure"
      aria-label={`The Kaioken desktop app, showing the ${item.label} screen`}
    >
      {/* ── title bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-border bg-card px-2.5 py-1.5">
        <span className="text-[10px] text-kai-orange" aria-hidden>▎</span>
        <span className="text-[10px] font-bold tracking-tight text-foreground">KAIOKEN</span>
        <span className="hidden items-center gap-1 sm:flex">
          <span className="ml-1 rounded-sm border border-border px-1.5 py-px text-[9px] text-kai-muted">ai_now_know ▾</span>
          <span className="text-[9px] text-kai-sage">master</span>
          <span className="text-[9px] text-kai-dim">·3</span>
        </span>
        <span className="ml-auto hidden rounded-sm border border-border px-1.5 py-px text-[9px] text-kai-muted md:inline">
          anthropic/claude-sonnet-4.5 ▾
        </span>
        <span className="ml-2 flex items-center gap-1.5 text-kai-dim" aria-hidden>
          <Minus className="size-2.5" />
          <Square className="size-2" />
          <X className="size-2.5" />
        </span>
      </div>

      {/* ── rail + content ───────────────────────────────────────────── */}
      <div className="flex h-[460px]">
        <nav className="flex w-[58px] shrink-0 flex-col items-center gap-0.5 overflow-hidden border-r border-border bg-card py-1.5" aria-label="App screens">
          {RAIL.map((r, i) => {
            const isActive = r.id === pane
            return (
              <Fragment key={r.id}>
                <button
                  type="button"
                  onClick={() => { setPane(r.id); setSteered(true) }}
                  title={r.key ? `${r.label} · Ctrl+${r.key}` : r.label}
                  aria-pressed={isActive}
                  className={cn(
                    "group relative flex w-11 shrink-0 flex-col items-center gap-0.5 rounded-sm py-1",
                    "transition-colors outline-none focus-visible:ring-1 focus-visible:ring-kai-orange/60",
                    isActive ? "bg-accent text-kai-orange" : "text-kai-dim hover:bg-kai-panel hover:text-kai-text"
                  )}
                >
                  {isActive ? (
                    <span className="absolute top-1/2 -left-1.5 h-4 w-0.5 -translate-y-1/2 rounded-r bg-kai-orange shadow-[0_0_8px_-1px_var(--kai-orange)]" aria-hidden />
                  ) : null}
                  <span className="relative">
                    <r.icon className="size-[13px]" />
                    {r.id === "activity" ? (
                      <span className="absolute -top-1 -right-1.5 flex size-2.5 items-center justify-center rounded-full bg-kai-orange text-[6px] font-bold text-primary-foreground">2</span>
                    ) : null}
                  </span>
                  <span className="text-[7px] leading-none">{r.label}</span>
                </button>
                {i === 0 ? <span className="my-0.5 h-px w-6 bg-border" aria-hidden /> : null}
              </Fragment>
            )
          })}
          <span className="mt-auto" />
          <span className="my-0.5 h-px w-6 bg-border" aria-hidden />
          <span className="flex w-11 flex-col items-center gap-0.5 py-1 text-kai-dim">
            <Store className="size-[13px]" />
            <span className="text-[7px] leading-none">Registry</span>
          </span>
        </nav>

        <div key={pane} className="flex min-w-0 flex-1 animate-rise">
          <Pane active={inView} />
        </div>
      </div>

      {/* ── status bar ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-t border-border bg-card px-2.5 py-1">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-kai-green shadow-[0_0_6px_-1px_var(--kai-green)]" />
          <span className="text-[8.5px] text-kai-muted">daemon ok · :54312</span>
        </span>
        <span className="h-2.5 w-px bg-border" aria-hidden />
        <span className="hidden text-[8.5px] text-kai-muted sm:inline">
          ×3 wiki 7/11 <span className="text-kai-orange">▓▓▓▓▓▓▓░░░░</span>
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span className="hidden text-[8.5px] text-kai-muted md:inline">214 calls · 1.8M tok</span>
          <span className="rounded-sm border border-border px-1.5 py-px text-[8px] text-kai-dim">Ctrl+K</span>
        </span>
      </div>
    </div>
  )
}
