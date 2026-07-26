import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { invoke } from "@tauri-apps/api/core"
import { Check, ChevronsUpDown, FolderOpen, FolderPlus, X } from "lucide-react"
import { useWorkspaceStore } from "@/store/workspace"
import { Badge } from "@/components/ui"
import { cn } from "@/lib/utils"

/** Top-bar workspace picker (T019). Without this the only way to change
 *  repository is to close the app — the active workspace pins the whole
 *  shell, and every feature route reads from it. */
export default function WorkspaceSwitcher() {
  const { active, list, recents, open, close, setActive, refresh } = useWorkspaceStore()
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!isOpen) return
    refresh()
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [isOpen, refresh])

  if (!active) return null

  async function choose(path: string) {
    setIsOpen(false)
    try {
      await open(path)
      navigate("/")
    } catch {
      /* the store surfaces a toast */
    }
  }

  async function pickFolder() {
    setIsOpen(false)
    try {
      const path = await invoke<string | null>("pick_folder", { title: "Open a repository" })
      if (path) await choose(path)
    } catch {
      /* cancelled */
    }
  }

  // Recents minus whatever is already listed as open, so the menu never
  // shows the same repo twice.
  const openPaths = new Set(list.map((w) => w.path))
  const otherRecents = recents.filter((r) => !openPaths.has(r.path))

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        onClick={() => setIsOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={cn(
          "flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs transition-colors outline-none",
          "text-kai-text hover:bg-panel focus-visible:ring-2 focus-visible:ring-kai-orange/50",
          isOpen && "bg-panel"
        )}
        title={active.path}
      >
        <span className="truncate">{active.name}</span>
        <ChevronsUpDown size={11} className="shrink-0 text-kai-dim" />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="animate-pop absolute left-0 top-full z-40 mt-1 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        >
          {list.length > 0 && (
            <div className="border-b border-border py-1">
              <p className="px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-kai-dim">
                Open
              </p>
              {list.map((w) => (
                <div key={w.id} className="group flex items-center">
                  <button
                    role="menuitem"
                    onClick={() => {
                      setActive(w.id)
                      setIsOpen(false)
                      navigate("/")
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-panel/60"
                  >
                    {w.id === active.id ? (
                      <Check size={11} className="shrink-0 text-kai-orange" />
                    ) : (
                      <span className="w-[11px] shrink-0" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[11px] text-kai-text">
                        {w.name}
                      </span>
                      <span className="block truncate font-mono text-[9px] text-kai-dim">
                        {w.path}
                      </span>
                    </span>
                    {!w.has_config && <Badge tone="amber">init</Badge>}
                  </button>
                  <button
                    onClick={() => close(w.id)}
                    title="Close workspace"
                    className="mr-1.5 shrink-0 rounded p-1 text-kai-dim opacity-0 transition-opacity hover:text-kai-rose group-hover:opacity-100"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {otherRecents.length > 0 && (
            <div className="max-h-56 overflow-auto border-b border-border py-1">
              <p className="px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-kai-dim">
                Recent
              </p>
              {otherRecents.slice(0, 10).map((r) => {
                const name = r.path.split("/").filter(Boolean).pop() || r.path
                return (
                  <button
                    key={r.path}
                    role="menuitem"
                    disabled={r.missing}
                    onClick={() => choose(r.path)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors",
                      r.missing ? "cursor-not-allowed opacity-40" : "hover:bg-panel/60"
                    )}
                  >
                    <FolderOpen size={11} className="shrink-0 text-kai-dim" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[11px] text-kai-text">
                        {name}
                      </span>
                      <span className="block truncate font-mono text-[9px] text-kai-dim">
                        {r.path}
                      </span>
                    </span>
                    {r.missing && <Badge tone="rose">missing</Badge>}
                  </button>
                )
              })}
            </div>
          )}

          <button
            role="menuitem"
            onClick={pickFolder}
            className="flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[11px] text-kai-orange transition-colors hover:bg-panel/60"
          >
            <FolderPlus size={12} />
            Open a repository…
          </button>
        </div>
      )}
    </div>
  )
}
