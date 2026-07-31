import * as React from "react"
import {
  BookOpen,
  Code2,
  FolderOpen,
  Globe,
  Layers,
  MessageSquare,
  Minus,
  Puzzle,
  Radar,
  Settings,
  Square,
  Store,
  Wallet,
  Waypoints,
  X,
  Zap,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useInView, useReducedMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"
import {
  ActivityPane,
  BrowserPane,
  CardsPane,
  ChatPane,
  CostPane,
  EditorPane,
  ExtensionsPane,
  GraphPane,
  ResearchPane,
  SettingsPane,
  WikiPane,
  WorkspacesPane,
} from "./panes"

/**
 * A working recreation of the Kaioken desktop window — custom title bar, nav
 * rail, route content, status bar. Click the rail to change screens; left
 * alone it walks the tour by itself.
 *
 * The rail order, labels and shortcuts are the app's own
 * (desktop/src/components/layout/NavRail.tsx).
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

/** The unattended tour: the screens worth seeing, in the order that tells the
 *  story. Every rail item is still reachable by clicking. */
const TOUR: PaneId[] = ["chat", "research", "wiki", "graph", "activity", "cost", "editor"]

const DWELL_MS = 5600

export default function AppWindow({
  className,
  size = "lg",
  start = "chat",
}: {
  className?: string
  /** lg fills a hero; sm sits inside a page section */
  size?: "lg" | "sm"
  start?: PaneId
}) {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const inView = useInView(hostRef, "120px")
  const reduced = useReducedMotion()

  const [pane, setPane] = React.useState<PaneId>(start)
  // Once a visitor picks a screen the tour stops for good — a carousel that
  // keeps moving after you touch it is the thing everyone hates about them.
  const [steered, setSteered] = React.useState(false)
  const [hovered, setHovered] = React.useState(false)

  React.useEffect(() => {
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
  const tall = size === "lg"
  const touring = !reduced && !steered && inView

  return (
    <div
      ref={hostRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "overflow-hidden rounded-md border border-border bg-background panel-glow",
        className
      )}
      role="figure"
      aria-label={`The Kaioken desktop app, showing the ${item.label} screen`}
    >
      {/* ── title bar (decorations:false — the app draws its own) ───────── */}
      <div className="flex items-center gap-2 border-b border-border bg-card px-2.5 py-1.5">
        <span className="text-[9px] text-kai-dim" aria-hidden>›</span>
        <span className="text-[9.5px] font-bold tracking-tight text-foreground">kaioken</span>
        <span className="text-[9px] text-kai-dim">|</span>
        <span className="hidden items-center gap-1 sm:flex">
          <span className="text-[9px] font-semibold text-kai-text">cli</span>
          <span className="text-[9px] text-kai-sage">○</span>
          <span className="text-[9px] text-kai-dim">|</span>
          <span className="text-[9px] text-kai-dim">⟁</span>
          <span className="text-[9px] text-kai-muted">master</span>
          <span className="text-[9px] text-kai-dim">·109</span>
        </span>
        <span className="ml-auto hidden items-center gap-1.5 sm:flex">
          <span className="flex items-center gap-1 rounded-sm border border-border px-1.5 py-px text-[8.5px] text-kai-dim">
            🔍 Search…
            <span className="rounded-[2px] border border-border bg-background px-0.5 text-[7.5px]">Ctrl</span>
            <span className="rounded-[2px] border border-border bg-background px-0.5 text-[7.5px]">K</span>
          </span>
        </span>
        <span className="hidden rounded-sm border border-kai-orange/30 bg-kai-orange/10 px-1.5 py-px text-[8.5px] text-kai-amber md:inline">
          nvidia/nemotron-3-super-120b-a12b
        </span>
        <span className="ml-1 flex items-center gap-1.5 text-kai-dim" aria-hidden>
          <Minus className="size-2.5" />
          <Square className="size-2" />
          <X className="size-2.5" />
        </span>
      </div>

      {/* ── tour progress — how long until the screen changes on its own ── */}
      <div className="relative h-px w-full bg-transparent" aria-hidden>
        {touring ? (
          <div
            key={pane}
            className={cn(
              "animate-tour absolute inset-y-0 left-0 w-full bg-gradient-to-r from-kai-orange/40 to-kai-orange",
              hovered && "[animation-play-state:paused]"
            )}
            style={{ animationDuration: `${DWELL_MS}ms` }}
          />
        ) : null}
      </div>

      {/* ── rail + content ─────────────────────────────────────────────── */}
      <div className={cn("flex", tall ? "h-[360px] sm:h-[420px] lg:h-[460px]" : "h-[300px]")}>
        <nav
          className="flex w-[50px] shrink-0 flex-col items-center gap-0.5 overflow-hidden border-r border-border bg-card py-1.5 sm:w-[58px]"
          aria-label="App screens"
        >
          {RAIL.map((r, i) => {
            const isActive = r.id === pane
            return (
              <React.Fragment key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPane(r.id)
                    setSteered(true)
                  }}
                  title={r.key ? `${r.label} · Ctrl+${r.key}` : r.label}
                  aria-pressed={isActive}
                  className={cn(
                    "group relative flex w-11 shrink-0 flex-col items-center gap-0.5 rounded-sm py-1",
                    "transition-colors outline-none focus-visible:ring-1 focus-visible:ring-kai-orange/60",
                    isActive
                      ? "bg-accent text-kai-orange"
                      : "text-kai-dim hover:bg-kai-panel hover:text-kai-text"
                  )}
                >
                  {isActive ? (
                    <span
                      className="absolute top-1/2 -left-1.5 h-4 w-0.5 -translate-y-1/2 rounded-r bg-kai-orange shadow-[0_0_8px_-1px_var(--kai-orange)]"
                      aria-hidden
                    />
                  ) : null}
                  <span className="relative">
                    <r.icon className="size-[13px]" />
                    {r.id === "activity" ? (
                      <span className="absolute -top-1 -right-1.5 flex size-2.5 items-center justify-center rounded-full bg-kai-orange text-[6px] font-bold text-primary-foreground">
                        2
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[7px] leading-none">{r.label}</span>
                </button>
                {i === 0 ? <span className="my-0.5 h-px w-6 bg-border" aria-hidden /> : null}
              </React.Fragment>
            )
          })}
          <span className="mt-auto" />
          <span className="my-0.5 h-px w-6 bg-border" aria-hidden />
          <span className="flex w-11 flex-col items-center gap-0.5 py-1 text-kai-dim">
            <Store className="size-[13px]" />
            <span className="text-[7px] leading-none">Registry</span>
          </span>
        </nav>

        {/* keyed so each screen remounts — the animations replay on switch */}
        <div key={pane} className="flex min-w-0 flex-1 animate-rise">
          <Pane active={inView} />
        </div>
      </div>

      {/* ── status bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-t border-border bg-card px-2.5 py-1">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-kai-green shadow-[0_0_6px_-1px_var(--kai-green)]" />
          <span className="text-[8px] text-kai-muted">daemon v1.0.0 · :62841</span>
        </span>
        <span className="text-[8px] text-kai-dim">·</span>
        <span className="text-[8px] text-kai-muted">{item.label}</span>
        <span className="ml-auto flex items-center gap-2">
          {touring ? (
            <span className="text-[8px] text-kai-dim">
              {hovered ? "tour paused" : "touring — click the rail to steer"}
            </span>
          ) : null}
          <span className="hidden text-[8px] text-kai-dim sm:inline">D:/project/ai_now_know/cli</span>
        </span>
      </div>
    </div>
  )
}

/** The rail, exported so pages can label the screens without re-declaring them. */
export const DESKTOP_RAIL = RAIL.map(({ id, label, key }) => ({ id, label, key }))
