import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { BookOpen, ChevronDown, ChevronRight, FileText } from "lucide-react"
import { api } from "@/lib/api"
import { useWorkspaceStore } from "@/store/workspace"
import { Spinner } from "@/components/ui"
import { cn } from "@/lib/utils"
import type { WikiTree, WikiTreeSection } from "@/lib/types"

// WikiOutlinePanel lists the generated wiki's sections and documents so the
// explorer doubles as a table of contents. Clicking a doc opens the Wiki reader
// at that document (the reader reads the ?doc= query param on mount).
export default function WikiOutlinePanel() {
  const ws = useWorkspaceStore((s) => s.active)
  const [tree, setTree] = useState<WikiTree | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const navigate = useNavigate()

  useEffect(() => {
    if (!ws) return
    setLoading(true)
    setError(null)
    api
      .wikiTree(ws.id)
      .then(setTree)
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false))
  }, [ws?.id])

  const openDoc = (rel: string) => navigate(`/wiki?doc=${encodeURIComponent(rel)}`)

  const toggle = (name: string) =>
    setCollapsed((s) => {
      const next = new Set(s)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
        <BookOpen size={12} className="shrink-0 text-kai-amber" />
        <span className="font-mono text-[10px] text-kai-dim">wiki</span>
        {tree && tree.sections.length > 0 && (
          <span className="font-mono text-[10px] text-kai-dim">
            ·{tree.sections.length} sections
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {loading && !tree ? (
          <div className="flex items-center gap-2 px-3 py-4 font-mono text-[10px] text-kai-dim">
            <Spinner size={12} /> loading wiki…
          </div>
        ) : error ? (
          <div className="px-3 py-4 font-mono text-[10px] text-kai-rose">{error}</div>
        ) : !tree || tree.sections.length === 0 ? (
          <div className="px-3 py-4 font-mono text-[10px] text-kai-dim">
            no wiki generated yet. start a wiki run from the Wiki route.
          </div>
        ) : (
          <ul className="py-1">
            {tree.sections.map((s) => (
              <SectionItem
                key={s.name}
                section={s}
                collapsed={collapsed.has(s.name)}
                onToggle={() => toggle(s.name)}
                onOpen={openDoc}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function SectionItem({
  section,
  collapsed,
  onToggle,
  onOpen,
}: {
  section: WikiTreeSection
  collapsed: boolean
  onToggle: () => void
  onOpen: (rel: string) => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left outline-none transition-colors hover:bg-panel/60 focus-visible:ring-2 focus-visible:ring-kai-orange/50"
      >
        <span className="flex size-4 shrink-0 items-center justify-center text-kai-dim">
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </span>
        <span className="truncate font-mono text-[11px] font-medium text-kai-text">
          {section.name}
        </span>
        <span className="ml-auto shrink-0 pl-2 font-mono text-[9px] text-kai-dim">
          {section.docs.length}
        </span>
      </button>
      {!collapsed && (
        <ul>
          {section.docs.map((d) => (
            <li key={d.rel}>
              <button
                type="button"
                onClick={() => onOpen(d.rel)}
                className={cn(
                  "flex w-full items-center gap-1.5 py-0.5 pr-2 text-left outline-none transition-colors",
                  "hover:bg-panel/60 focus-visible:ring-2 focus-visible:ring-kai-orange/50"
                )}
                style={{ paddingLeft: 30 }}
              >
                <FileText size={12} className="shrink-0 text-kai-dim" />
                <span className="truncate font-mono text-[11px] text-kai-muted">{d.title}</span>
                {d.reading_minutes > 0 && (
                  <span className="ml-auto shrink-0 pl-2 font-mono text-[9px] text-kai-dim">
                    {d.reading_minutes}m
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
