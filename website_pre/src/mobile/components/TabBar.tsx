import { NavLink } from "react-router-dom"
import { BookOpenText, FolderTree, Home, Monitor, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

const TABS = [
  { to: "/", label: "home", icon: Home, end: true },
  { to: "/desktop", label: "desktop", icon: Monitor },
  { to: "/docs", label: "docs", icon: BookOpenText },
  { to: "/preview", label: "output", icon: FolderTree },
  { to: "/more", label: "more", icon: MoreHorizontal },
]

/**
 * The phone site's primary navigation.
 *
 * The desktop header hides six destinations behind a hamburger; on a phone the
 * five that matter are always one thumb-reach away at the bottom of the screen,
 * which is where the thumb already is. Nothing here is smaller than 56px tall.
 */
export default function TabBar() {
  return (
    <nav
      aria-label="Primary"
      className="m-bar-blur m-safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border"
    >
      <ul className="flex h-[3.5rem]">
        {TABS.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  "relative flex h-full flex-col items-center justify-center gap-1",
                  isActive ? "text-kai-orange" : "text-kai-dim"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* the gutter mark, moved to the top edge of the tab */}
                  <span
                    className={cn(
                      "absolute inset-x-4 top-0 h-px transition-colors",
                      isActive ? "bg-kai-orange" : "bg-transparent"
                    )}
                    aria-hidden
                  />
                  <tab.icon className="size-[18px]" aria-hidden />
                  <span className="font-mono text-[9.5px] tracking-[0.1em] uppercase">
                    {tab.label}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
