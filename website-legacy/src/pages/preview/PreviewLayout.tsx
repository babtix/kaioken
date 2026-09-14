import * as React from "react"
import { NavLink, Outlet, useLocation, useParams } from "react-router-dom"
import { ChevronRight, FolderTree, PanelLeft, X } from "lucide-react"
import { WIKI_SECTIONS, WIKI_STATS } from "@/data/wiki"
import { cn } from "@/lib/utils"

function Tree({ onNavigate }: { onNavigate?: () => void }) {
  const { section: activeSection } = useParams()
  // The section containing the open document starts expanded.
  const [open, setOpen] = React.useState<Record<string, boolean>>(() =>
    activeSection ? { [activeSection]: true } : {}
  )

  React.useEffect(() => {
    if (activeSection) setOpen((o) => ({ ...o, [activeSection]: true }))
  }, [activeSection])

  return (
    <nav>
      <NavLink
        to="/preview"
        end
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-2 rounded-sm px-2 py-1.5 font-mono text-[12.5px] transition-colors",
            isActive ? "bg-kai-orange/10 text-kai-amber" : "text-muted-foreground hover:text-foreground"
          )
        }
      >
        <FolderTree className="size-3.5" />
        .kaioken/wiki
      </NavLink>

      <p className="mt-1 px-2 font-mono text-[10.5px] text-kai-dim">
        {WIKI_STATS.sections} sections · {WIKI_STATS.documents} documents
      </p>

      <ul className="mt-4 space-y-0.5">
        {WIKI_SECTIONS.map((section) => {
          const expanded = open[section.slug] ?? false
          return (
            <li key={section.slug}>
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [section.slug]: !expanded }))}
                aria-expanded={expanded}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left font-mono text-[12px] transition-colors",
                  activeSection === section.slug
                    ? "text-kai-orange"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ChevronRight
                  className={cn(
                    "size-3 shrink-0 transition-transform",
                    expanded && "rotate-90"
                  )}
                />
                <span className="min-w-0 flex-1 truncate uppercase">{section.title}</span>
                <span className="shrink-0 rounded-sm bg-kai-panel px-1 text-[10px] text-kai-dim">
                  {section.docs.length}
                </span>
              </button>

              {expanded ? (
                <ul className="mt-0.5 mb-1 ml-[13px] space-y-0.5 border-l border-border">
                  {section.docs.map((doc) => (
                    <li key={doc.slug}>
                      <NavLink
                        to={`/preview/${section.slug}/${doc.slug}`}
                        onClick={onNavigate}
                        className={({ isActive }) =>
                          cn(
                            "-ml-px block border-l-2 py-1 pr-1 pl-3 font-mono text-[12px] leading-snug transition-colors",
                            isActive
                              ? "border-kai-orange bg-kai-orange/[0.07] text-kai-amber"
                              : "border-transparent text-muted-foreground hover:border-kai-dim hover:text-foreground"
                          )
                        }
                      >
                        {doc.title}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export default function PreviewLayout() {
  const [open, setOpen] = React.useState(false)
  const { pathname } = useLocation()

  React.useEffect(() => setOpen(false), [pathname])

  return (
    <div className="mx-auto max-w-[88rem] px-4 pt-24 sm:px-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mb-5 flex items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 font-mono text-[12.5px] text-muted-foreground transition-colors hover:text-foreground lg:hidden"
      >
        {open ? <X className="size-3.5" /> : <PanelLeft className="size-3.5" />}
        {open ? "close" : "browse output"}
      </button>
      {open ? (
        <div className="mb-8 max-h-[70vh] overflow-y-auto rounded-sm border border-border bg-card p-4 lg:hidden">
          <Tree onNavigate={() => setOpen(false)} />
        </div>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[17rem_1fr] lg:gap-12">
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2 pb-8">
            <Tree />
          </div>
        </aside>
        <Outlet />
      </div>
    </div>
  )
}
