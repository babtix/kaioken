import { Maximize, Search, X } from "lucide-react"
import type { EdgeKind, GraphFilters } from "@/lib/graph/types"
import { cn } from "@/lib/utils"

const EDGE_KINDS: { kind: EdgeKind; label: string }[] = [
  { kind: "contains", label: "contains" },
  { kind: "links", label: "links" },
  { kind: "source", label: "source" },
]

/**
 * The control strip over the graph: search (pulses matching nodes), file-node
 * and edge-kind toggles, fit, and — while a node is focused — a depth slider.
 */
export default function GraphControls({
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  onFit,
  focusLabel,
  depth,
  onDepthChange,
  onClearFocus,
}: {
  query: string
  onQueryChange: (q: string) => void
  filters: GraphFilters
  onFiltersChange: (f: GraphFilters) => void
  onFit: () => void
  /** Label of the focused node, null when nothing is focused. */
  focusLabel: string | null
  depth: number
  onDepthChange: (d: number) => void
  onClearFocus: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
      <div className="relative">
        <Search size={11} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-kai-dim" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Find a node…"
          className={cn(
            "w-44 rounded border border-border bg-panel py-1 pl-6 pr-2 font-mono text-[11px] text-kai-text",
            "placeholder:text-kai-dim outline-none focus-visible:ring-2 focus-visible:ring-kai-orange/50"
          )}
        />
      </div>

      <Toggle
        active={filters.files}
        label="files"
        onClick={() => onFiltersChange({ ...filters, files: !filters.files })}
      />
      <span className="h-4 w-px bg-border" aria-hidden />
      {EDGE_KINDS.map(({ kind, label }) => (
        <Toggle
          key={kind}
          active={filters.kinds[kind]}
          label={label}
          onClick={() =>
            onFiltersChange({ ...filters, kinds: { ...filters.kinds, [kind]: !filters.kinds[kind] } })
          }
        />
      ))}

      <button
        onClick={onFit}
        title="Fit graph to view"
        className={cn(
          "flex items-center gap-1 rounded border border-border px-2 py-1 font-mono text-[10px] text-kai-dim",
          "transition-colors outline-none hover:border-kai-line hover:text-kai-text",
          "focus-visible:ring-2 focus-visible:ring-kai-orange/50"
        )}
      >
        <Maximize size={10} />
        fit
      </button>

      {focusLabel !== null && (
        <span className="ml-auto flex items-center gap-2 font-mono text-[10px] text-kai-dim">
          <span className="max-w-40 truncate text-kai-text">{focusLabel}</span>
          depth
          <input
            type="range"
            min={1}
            max={3}
            step={1}
            value={depth}
            onChange={(e) => onDepthChange(Number(e.target.value))}
            className="w-20 accent-kai-orange"
            aria-label="Focus depth"
          />
          {depth}
          <button
            onClick={onClearFocus}
            title="Clear focus"
            aria-label="Clear focus"
            className={cn(
              "rounded border border-border p-0.5 text-kai-dim transition-colors outline-none",
              "hover:text-kai-text focus-visible:ring-2 focus-visible:ring-kai-orange/50"
            )}
          >
            <X size={10} />
          </button>
        </span>
      )}
    </div>
  )
}

function Toggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded border px-2 py-1 font-mono text-[10px] transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-kai-orange/50",
        active
          ? "border-kai-orange/40 bg-accent text-kai-orange"
          : "border-border text-kai-dim hover:text-kai-text"
      )}
    >
      {label}
    </button>
  )
}
