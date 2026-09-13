import * as React from "react"
import { NavLink, Outlet, useLocation } from "react-router-dom"
import { PanelLeft, X } from "lucide-react"
import { DOCS_NAV } from "@/data/docs-nav"
import { cn } from "@/lib/utils"

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-7">
      {DOCS_NAV.map((section) => (
        <div key={section.heading}>
          <h2 className="font-mono text-[10.5px] tracking-[0.25em] text-kai-dim uppercase">
            {section.heading}
          </h2>
          <ul className="mt-3 space-y-0.5 border-l border-border">
            {section.links.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "-ml-px flex border-l-2 py-1.5 pl-3 font-mono text-[13px] transition-colors",
                      isActive
                        ? "border-kai-orange bg-kai-orange/[0.07] text-kai-amber"
                        : "border-transparent text-muted-foreground hover:border-kai-dim hover:text-foreground"
                    )
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export default function DocsLayout() {
  const [open, setOpen] = React.useState(false)
  const { pathname } = useLocation()

  React.useEffect(() => setOpen(false), [pathname])

  return (
    <div className="mx-auto max-w-6xl px-4 pt-24 sm:px-6">
      {/* mobile: a disclosure rather than a full sheet — the nav is short */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mb-5 flex items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 font-mono text-[12.5px] text-muted-foreground transition-colors hover:text-foreground lg:hidden"
      >
        {open ? <X className="size-3.5" /> : <PanelLeft className="size-3.5" />}
        {open ? "close" : "browse docs"}
      </button>
      {open ? (
        <div className="mb-8 rounded-sm border border-border bg-card p-5 lg:hidden">
          <SidebarNav onNavigate={() => setOpen(false)} />
        </div>
      ) : null}

      <div className="grid gap-12 lg:grid-cols-[13rem_1fr] lg:gap-14">
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pb-8">
            <SidebarNav />
          </div>
        </aside>
        <Outlet />
      </div>
    </div>
  )
}
