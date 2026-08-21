import { useEffect, useRef } from "react"
import { Plus, X } from "lucide-react"
import { useTerminalStore, MIN_PANEL_HEIGHT, MAX_PANEL_HEIGHT } from "@/store/terminal"
import { onTermExit } from "@/lib/term"
import TerminalView from "@/components/terminal/TerminalView"
import { cn } from "@/lib/utils"

// The VS Code-style bottom panel: a strip of terminal tabs, a "+" to spawn
// another shell, and a drag handle on the top edge. Every TerminalView stays
// mounted — switching tabs only flips visibility, so scrollback and the
// running process are untouched.
export default function TerminalPanel() {
  const terminals = useTerminalStore((s) => s.terminals)
  const activeId = useTerminalStore((s) => s.activeId)
  const panelHeight = useTerminalStore((s) => s.panelHeight)
  const create = useTerminalStore((s) => s.create)
  const select = useTerminalStore((s) => s.select)
  const close = useTerminalStore((s) => s.close)
  const handleExit = useTerminalStore((s) => s.handleExit)
  const setPanelHeight = useTerminalStore((s) => s.setPanelHeight)
  const togglePanel = useTerminalStore((s) => s.togglePanel)

  // Shells that end on their own (`exit`, crash) take their tab with them.
  useEffect(() => {
    const un = onTermExit(({ id }) => handleExit(id))
    return () => {
      void un.then((f) => f())
    }
  }, [handleExit])

  const dragFrom = useRef<{ y: number; height: number } | null>(null)

  return (
    <div
      className="relative flex shrink-0 flex-col border-t border-border bg-card"
      style={{ height: panelHeight }}
    >
      {/* Drag handle: a thin grab strip along the panel's top edge. */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-valuenow={panelHeight}
        aria-valuemin={MIN_PANEL_HEIGHT}
        aria-valuemax={MAX_PANEL_HEIGHT}
        className="absolute -top-1 left-0 right-0 z-10 h-2 cursor-row-resize"
        onPointerDown={(e) => {
          dragFrom.current = { y: e.clientY, height: panelHeight }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const from = dragFrom.current
          if (!from) return
          // Dragging up grows the panel.
          setPanelHeight(from.height + (from.y - e.clientY))
        }}
        onPointerUp={(e) => {
          dragFrom.current = null
          e.currentTarget.releasePointerCapture(e.pointerId)
        }}
      />

      {/* Tab strip */}
      <div className="flex shrink-0 items-end gap-1 overflow-x-auto border-b border-border/80 bg-muted/40 px-2 pt-1.5">
        <span className="mb-1 px-1.5 font-mono text-[10px] uppercase tracking-wide text-kai-dim">
          Terminal
        </span>
        {terminals.map((t) => (
          <TerminalTab
            key={t.id}
            title={t.title}
            active={t.id === activeId}
            onSelect={() => select(t.id)}
            onClose={() => close(t.id)}
          />
        ))}
        <button
          type="button"
          aria-label="New terminal"
          title="New terminal"
          onClick={() => void create()}
          className="mb-1 flex size-6 shrink-0 items-center justify-center rounded text-kai-dim outline-none transition-colors hover:bg-card hover:text-kai-text focus-visible:ring-2 focus-visible:ring-kai-orange/50"
        >
          <Plus size={12} />
        </button>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Hide terminal panel"
          title="Hide panel (Ctrl+`)"
          onClick={togglePanel}
          className="mb-1 flex size-6 shrink-0 items-center justify-center rounded text-kai-dim outline-none transition-colors hover:bg-card hover:text-kai-text focus-visible:ring-2 focus-visible:ring-kai-orange/50"
        >
          <X size={12} />
        </button>
      </div>

      {/* All sessions stay mounted; only the active one is visible. */}
      <div className="relative min-h-0 flex-1" style={{ background: "var(--kai-code)" }}>
        {terminals.map((t) => (
          <TerminalView key={t.id} id={t.id} active={t.id === activeId} />
        ))}
      </div>
    </div>
  )
}

function TerminalTab({
  title,
  active,
  onSelect,
  onClose,
}: {
  title: string
  active: boolean
  onSelect: () => void
  onClose: () => void
}) {
  const handleAuxClick = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault()
    }
  }

  return (
    <div
      onClick={onSelect}
      onAuxClick={handleAuxClick}
      onMouseDown={handleMouseDown}
      title={title}
      className={cn(
        "group relative flex h-7 min-w-0 max-w-[170px] shrink-0 cursor-pointer items-center gap-1.5",
        "rounded-t-[var(--radius)] px-2.5 transition-all outline-none select-none",
        active
          ? "border-x border-t border-border/80 border-b-transparent bg-background text-kai-text shadow-xs"
          : "border border-transparent bg-card/40 text-kai-dim hover:border-border/60 hover:bg-card hover:text-kai-text"
      )}
    >
      {active && (
        <span
          className="absolute -top-px left-0 right-0 h-[2px] rounded-t-sm bg-kai-orange"
          aria-hidden="true"
        />
      )}
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-mono text-[11px]",
          active ? "font-medium text-kai-text" : "text-kai-dim group-hover:text-kai-text"
        )}
      >
        {title}
      </span>
      <button
        type="button"
        aria-label={`Close ${title}`}
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="flex size-4 shrink-0 items-center justify-center rounded text-kai-dim opacity-0 outline-none transition-all hover:bg-accent hover:text-kai-rose focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X size={11} />
      </button>
    </div>
  )
}
