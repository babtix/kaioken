import { NavLink } from "react-router-dom"
import { openInBrowser } from "@/lib/openInBrowser"
import { BookOpen, Code2, FolderOpen, Globe, Layers, MessageSquare, Puzzle, Radar, Settings, Store, Wallet, Waypoints, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { REGISTRY_WEB_URL } from "@/lib/links"
import { useWorkspaceStore } from "@/store/workspace"
import { useRunsStore } from "@/store/runs"

// Ordered by workflow: the ask surfaces (Chat for the repository, Research
// for the web), then the three knowledge views the answers draw from
// (Wiki, Graph, Cards), then hands-on tools, then runs and extensions.
// Settings keeps Ctrl+, only — the number row stops at 9 and every other
// route outranks it.
const NAV_ITEMS = [
  { to: "/chat", icon: MessageSquare, label: "Chat", key: "1" },
  { to: "/research", icon: Radar, label: "Research", key: "2" },
  { to: "/wiki", icon: BookOpen, label: "Wiki", key: "3" },
  { to: "/graph", icon: Waypoints, label: "Graph", key: "4" },
  { to: "/cards", icon: Layers, label: "Cards", key: "5" },
  { to: "/editor", icon: Code2, label: "Editor", key: "6" },
  { to: "/browser", icon: Globe, label: "Browser", key: "7" },
  { to: "/activity", icon: Zap, label: "Activity", key: "8" },
  { to: "/extensions", icon: Puzzle, label: "Ext", key: "9" },
  // Cost gets no number: the row stops at 9, and a spending view is something
  // you go looking for rather than flip to mid-task.
  { to: "/cost", icon: Wallet, label: "Cost", key: "" },
  { to: "/settings", icon: Settings, label: "Settings", key: "," },
] as const

export default function NavRail() {
  const active = useWorkspaceStore((s) => s.active)
  const runs = useRunsStore((s) => s.runs)
  const activeRuns = runs.filter((r) => r.state === "running" || r.state === "queued").length

  return (
    <nav className="flex w-[68px] shrink-0 flex-col items-center gap-1 border-r border-border bg-card py-2">
      <RailLink to="/" icon={FolderOpen} label="Repos" hint="Workspaces" />

      <div className="my-1 h-px w-8 bg-border" />

      {NAV_ITEMS.map((item) => (
        <RailLink
          key={item.to}
          to={item.to}
          icon={item.icon}
          label={item.label}
          hint={item.key ? `${item.label} · Ctrl+${item.key}` : item.label}
          disabled={!active}
          badge={item.to === "/activity" && activeRuns > 0 ? activeRuns : undefined}
        />
      ))}

      {/* External: the registry website. Pinned to the bottom, past a
          divider, so it reads as "leaves the app" — and it needs no open
          workspace, unlike the internal routes above. */}
      <div className="mt-auto" />
      <div className="my-1 h-px w-8 bg-border" />
      <RailExternal
        url={REGISTRY_WEB_URL}
        icon={Store}
        label="Registry"
        hint="Extension registry (web)"
      />
    </nav>
  )
}

function RailLink({
  to,
  icon: Icon,
  label,
  hint,
  disabled,
  badge,
}: {
  to: string
  icon: typeof FolderOpen
  label: string
  hint: string
  disabled?: boolean
  badge?: number
}) {
  return (
    <NavLink
      to={to}
      title={hint}
      className={({ isActive }) =>
        cn(
          "group relative flex w-14 flex-col items-center gap-0.5 rounded-md py-1.5",
          "transition-colors outline-none focus-visible:ring-2 focus-visible:ring-kai-orange/50",
          disabled
            ? "pointer-events-none opacity-25"
            : isActive
              ? "hud-corners bg-accent text-kai-orange"
              : "text-kai-dim hover:bg-panel/60 hover:text-kai-text"
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Active indicator bar, flush against the rail's left edge. The
              glow is the HUD cue: it fires only for the current route, so it
              still reads as "you are here" rather than decoration. */}
          {isActive && (
            <span
              className="absolute -left-2 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-kai-orange
                         shadow-[0_0_8px_-1px_var(--kai-orange)]"
              aria-hidden
            />
          )}
          <span className="relative">
            <Icon size={17} />
            {badge !== undefined && (
              <span
                className="absolute -right-1.5 -top-1 flex size-3.5 items-center justify-center rounded-full
                           bg-kai-orange font-mono text-[8px] font-bold text-primary-foreground
                           shadow-[0_0_6px_-1px_var(--kai-orange)]"
              >
                {badge}
              </span>
            )}
          </span>
          <span className="font-mono text-[9px] leading-none">{label}</span>
        </>
      )}
    </NavLink>
  )
}

// RailExternal mirrors RailLink's look but opens a URL in the system
// browser instead of routing — no active state, never disabled.
function RailExternal({
  url,
  icon: Icon,
  label,
  hint,
}: {
  url: string
  icon: typeof FolderOpen
  label: string
  hint: string
}) {
  return (
    <button
      type="button"
      title={hint}
      onClick={() => openInBrowser(url)}
      className={cn(
        "group relative flex w-14 flex-col items-center gap-0.5 rounded-md py-1.5",
        "transition-colors outline-none focus-visible:ring-2 focus-visible:ring-kai-orange/50",
        "text-kai-dim hover:bg-panel/60 hover:text-kai-text"
      )}
    >
      <Icon size={17} />
      <span className="font-mono text-[9px] leading-none">{label}</span>
    </button>
  )
}
