import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Search } from "lucide-react"
import { openInBrowser } from "@/lib/openInBrowser"
import { REGISTRY_LINKS } from "@/lib/links"
import { useWorkspaceStore } from "@/store/workspace"
import { useRunsStore } from "@/store/runs"
import { useChatStore } from "@/store/chat"
import { cn } from "@/lib/utils"

type PaletteItem = {
  id: string
  label: string
  sub?: string
  group: string
  action: () => void
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const ws = useWorkspaceStore((s) => s.active)
  const recents = useWorkspaceStore((s) => s.recents)
  const openWs = useWorkspaceStore((s) => s.open)
  const startRun = useRunsStore((s) => s.start)
  const newSession = useChatStore((s) => s.newSession)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery("")
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const items = useMemo(() => {
    const out: PaletteItem[] = []
    // Navigation
    const nav = [
      { to: "/chat", label: "Chat" }, { to: "/research", label: "Research" },
      { to: "/wiki", label: "Wiki" },
      { to: "/graph", label: "Graph" },
      { to: "/cards", label: "Cards" }, { to: "/activity", label: "Activity" },
      { to: "/extensions", label: "Extensions" },
      { to: "/settings", label: "Settings" },
    ]
    for (const n of nav) {
      out.push({ id: `nav-${n.to}`, label: n.label, group: "Navigation", action: () => { navigate(n.to); onClose() } })
    }
    // Commands
    if (ws) {
      const cmds = [
        { id: "wiki", label: "Run Wiki", sub: "×3 multiplier" },
        { id: "update", label: "Run Update", sub: "incremental refresh" },
        { id: "generate", label: "Run Generate", sub: "knowledge cards" },
        { id: "skills", label: "Run Skills", sub: "agent skills" },
        { id: "scan", label: "Run Scan", sub: "repo inventory" },
      ]
      for (const c of cmds) {
        out.push({ id: `cmd-${c.id}`, label: c.label, sub: c.sub, group: "Commands", action: () => { startRun(ws.id, c.id); navigate("/activity"); onClose() } })
      }
      out.push({ id: "cmd-new-session", label: "New Chat Session", group: "Commands", action: () => { newSession(ws.id); navigate("/chat"); onClose() } })
    }
    // Recents
    for (const r of recents.slice(0, 5)) {
      if (r.missing) continue
      out.push({ id: `recent-${r.path}`, label: r.path.split("/").pop() || r.path, sub: r.path, group: "Recents", action: () => { openWs(r.path).then(() => navigate("/chat")); onClose() } })
    }
    // Registry website — external links, workspace not required (like Navigation).
    for (const l of REGISTRY_LINKS) {
      out.push({ id: `web-${l.url}`, label: l.label, sub: l.description, group: "Registry (web)", action: () => { openInBrowser(l.url); onClose() } })
    }
    return out
  }, [ws, recents, navigate, onClose, startRun, newSession, openWs])

  const filtered = useMemo(() => {
    if (!query.trim()) return items.slice(0, 20)
    const q = query.toLowerCase()
    return items
      .filter((i) => i.label.toLowerCase().includes(q) || i.sub?.toLowerCase().includes(q))
      .slice(0, 20)
  }, [items, query])

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, filtered.length - 1)) }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)) }
    if (e.key === "Enter" && filtered[selected]) { filtered[selected].action() }
    if (e.key === "Escape") { onClose() }
  }

  if (!open) return null

  // Group items for rendering
  const groups: Record<string, PaletteItem[]> = {}
  for (const item of filtered) {
    ;(groups[item.group] ??= []).push(item)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-lg rounded-md border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search size={14} className="text-kai-dim" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0) }}
            onKeyDown={handleKey}
            placeholder="Type a command…"
            className="flex-1 bg-transparent font-mono text-sm text-kai-text placeholder:text-kai-dim focus:outline-none"
          />
        </div>
        <div className="max-h-72 overflow-auto py-1">
          {Object.entries(groups).map(([group, gItems]) => (
            <div key={group}>
              <p className="px-3 py-1 font-mono text-[9px] font-bold uppercase text-kai-dim">{group}</p>
              {gItems.map((item) => (
                <button
                  key={item.id}
                  onClick={item.action}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs transition-colors",
                    filtered[selected]?.id === item.id ? "bg-accent text-kai-orange" : "text-kai-text hover:bg-panel"
                  )}
                >
                  {item.label}
                  {item.sub && <span className="ml-auto text-[10px] text-kai-dim">{item.sub}</span>}
                </button>
              ))}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-4 text-center font-mono text-xs text-kai-dim">No results</p>
          )}
        </div>
      </div>
    </div>
  )
}
