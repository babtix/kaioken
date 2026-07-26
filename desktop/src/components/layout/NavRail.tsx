import { NavLink } from "react-router-dom"
import { BookOpen, Layers, FolderOpen, MessageSquare, Settings, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/store/workspace"

const NAV_ITEMS = [
  { to: "/chat", icon: MessageSquare, label: "Chat" },
  { to: "/wiki", icon: BookOpen, label: "Wiki" },
  { to: "/activity", icon: Zap, label: "Activity" },
  { to: "/cards", icon: Layers, label: "Cards" },
  { to: "/settings", icon: Settings, label: "Settings" },
] as const

export default function NavRail() {
  const active = useWorkspaceStore((s) => s.active)

  return (
    <nav className="flex w-12 flex-col items-center gap-1 border-r border-border bg-card py-3">
      {/* Home / workspace picker */}
      <NavLink
        to="/"
        className={({ isActive }) =>
          cn(
            "flex size-9 items-center justify-center rounded-md text-kai-dim transition-colors hover:text-kai-text",
            isActive && "bg-accent text-kai-orange"
          )
        }
        title="Workspaces"
      >
        <FolderOpen size={18} />
      </NavLink>

      <div className="my-1 h-px w-6 bg-border" />

      {/* Feature nav — disabled when no workspace is open */}
      {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              "flex size-9 items-center justify-center rounded-md text-kai-dim transition-colors",
              active ? "hover:text-kai-text" : "pointer-events-none opacity-30",
              isActive && "bg-accent text-kai-orange"
            )
          }
          title={label}
        >
          <Icon size={18} />
        </NavLink>
      ))}
    </nav>
  )
}
