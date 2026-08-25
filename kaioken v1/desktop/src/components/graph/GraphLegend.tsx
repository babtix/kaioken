import type { GraphStats } from "@/lib/graph/types"

/**
 * Colour key + counts, floated over the canvas corner. Swatches use the same
 * theme variables GraphCanvas feeds the engine, so they can never disagree.
 */
export default function GraphLegend({ stats }: { stats: GraphStats | null }) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 rounded border border-border bg-card/85 px-2.5 py-2 backdrop-blur">
      <div className="space-y-1">
        <LegendRow color="var(--kai-orange)" label="wiki page" count={stats?.docs} />
        <LegendRow color="var(--kai-sage)" label="source file" count={stats?.files} />
        {stats !== null && stats.sections > 0 && (
          <LegendRow color="var(--kai-muted)" label="section" count={stats.sections} />
        )}
      </div>
      {stats !== null && (
        <p className="mt-1.5 border-t border-border pt-1 font-mono text-[9px] text-kai-dim">
          {stats.edges} edges
        </p>
      )}
    </div>
  )
}

function LegendRow({ color, label, count }: { color: string; label: string; count?: number }) {
  return (
    <div className="flex items-center gap-1.5 font-mono text-[9px] text-kai-dim">
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <span>{label}</span>
      {count !== undefined && <span className="ml-auto pl-3 text-kai-muted">{count}</span>}
    </div>
  )
}
