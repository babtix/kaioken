import { useEffect, useRef } from "react"
import { GraphEngine } from "@/lib/graph/engine"
import type { Graph, GraphColors, GraphFilters, GraphNode } from "@/lib/graph/types"
import { useThemeStore } from "@/store/theme"

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

/**
 * The engine's palette, read from the CSS variables in index.css so the
 * canvas follows the theme: --kai-orange for docs, --kai-sage for files,
 * --kai-line for edges. Never hard-coded — the light sweep retints these.
 */
export function readGraphColors(): GraphColors {
  return {
    background: "transparent",
    doc: cssVar("--kai-orange", "#ff8700"),
    file: cssVar("--kai-sage", "#87af87"),
    section: cssVar("--kai-muted", "#808080"),
    edge: cssVar("--kai-line", "#303030"),
    label: cssVar("--kai-muted", "#808080"),
    accent: cssVar("--kai-amber", "#ffaf00"),
  }
}

/**
 * Thin React wrapper around the shared engine: a <canvas> ref, an engine
 * instance per mount, colours re-read on theme change. All behaviour lives in
 * lib/graph — this component only translates props into engine calls.
 */
export default function GraphCanvas({
  graph,
  filters,
  onEngine,
  onHover,
  onSelect,
  className,
}: {
  graph: Graph | null
  filters?: GraphFilters
  /** Hands the engine up so the parent can call fit/focus/pulse. */
  onEngine?: (engine: GraphEngine) => void
  onHover?: (node: GraphNode | null) => void
  onSelect?: (node: GraphNode) => void
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<GraphEngine | null>(null)
  const theme = useThemeStore((s) => s.theme)

  useEffect(() => {
    const engine = new GraphEngine()
    engineRef.current = engine
    engine.mount(canvasRef.current!)
    engine.setColors(readGraphColors())
    onEngine?.(engine)
    return () => {
      engine.destroy()
      engineRef.current = null
    }
    // The engine lives for the component's lifetime; props flow via effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Callbacks are reassigned every render so stale closures never fire.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.onHover = onHover ?? null
    engine.onSelect = onSelect ?? null
  })

  useEffect(() => {
    engineRef.current?.setColors(readGraphColors())
  }, [theme])

  useEffect(() => {
    if (graph) engineRef.current?.setGraph(graph)
  }, [graph])

  useEffect(() => {
    if (filters) engineRef.current?.setFilters(filters)
  }, [filters])

  return <canvas ref={canvasRef} className={className} />
}
