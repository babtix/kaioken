import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Waypoints } from "lucide-react"
import GraphCanvas from "@/components/graph/GraphCanvas"
import GraphControls from "@/components/graph/GraphControls"
import GraphLegend from "@/components/graph/GraphLegend"
import EmptyState from "@/components/EmptyState"
import { Skeleton } from "@/components/ui"
import { api } from "@/lib/api"
import type { GraphEngine } from "@/lib/graph/engine"
import { defaultFilters, type Graph as GraphData, type GraphFilters, type GraphNode } from "@/lib/graph/types"
import { useOpenFile } from "@/lib/openFile"
import { useWorkspaceStore } from "@/store/workspace"

/**
 * The Obsidian-style overview of the generated wiki: dark nodes are pages,
 * sage nodes are the repo files they cite. Click a page to read it, click a
 * file to open it in the editor, Ctrl/Cmd-click anything to focus its
 * neighbourhood.
 */
export default function Graph() {
  const ws = useWorkspaceStore((s) => s.active)
  const navigate = useNavigate()
  const openFile = useOpenFile()

  const [graph, setGraph] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<GraphFilters>(defaultFilters())
  const [query, setQuery] = useState("")
  const [hovered, setHovered] = useState<GraphNode | null>(null)
  const [focused, setFocused] = useState<GraphNode | null>(null)
  const [depth, setDepth] = useState(1)
  const engineRef = useRef<GraphEngine | null>(null)

  useEffect(() => {
    if (!ws) return
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .wikiGraph(ws.id)
      .then((g) => {
        if (!cancelled) setGraph(g)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [ws?.id])

  // Search pulses matching nodes rather than filtering them away — position
  // is the whole point of the view, so nothing should jump while typing.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !graph) return
    const q = query.trim().toLowerCase()
    if (!q) {
      engine.pulse([])
      return
    }
    const id = setTimeout(() => {
      const ids = graph.nodes
        .filter((n) => n.label.toLowerCase().includes(q) || n.rel?.toLowerCase().includes(q))
        .map((n) => n.id)
      engine.pulse(ids)
    }, 180)
    return () => clearTimeout(id)
  }, [query, graph])

  // Depth changes re-run the focus BFS around the same node.
  useEffect(() => {
    if (focused) engineRef.current?.focus(focused.id, depth)
  }, [depth, focused])

  const handleSelect = (node: GraphNode, ev?: { ctrlKey?: boolean; metaKey?: boolean }) => {
    // Ctrl/Cmd-click (any kind) focuses the neighbourhood instead of leaving.
    if (ev?.ctrlKey || ev?.metaKey || node.kind === "section") {
      setFocused(node)
      engineRef.current?.focus(node.id, depth)
      return
    }
    if (node.kind === "doc" && node.rel) {
      navigate(`/wiki?doc=${encodeURIComponent(node.rel)}`)
      return
    }
    if (node.kind === "file" && node.path && !node.missing) {
      openFile(node.path)
    }
  }

  if (!ws) {
    return <EmptyState icon={Waypoints} title="No workspace open" hint="Open a repository to see its wiki graph." />
  }
  if (error) {
    return (
      <EmptyState
        icon={Waypoints}
        title="Could not load the graph"
        hint={error}
        action={{ label: "Retry", onClick: () => navigate(0) }}
      />
    )
  }
  if (loading && !graph) {
    return (
      <div className="space-y-3 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    )
  }
  if (graph && graph.nodes.length === 0) {
    return (
      <EmptyState
        icon={Waypoints}
        title="No wiki generated yet"
        hint="The graph draws the generated wiki's pages and sources. Start a wiki run from the Activity screen."
        action={{ label: "Go to Activity", onClick: () => navigate("/activity") }}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <GraphControls
        query={query}
        onQueryChange={setQuery}
        filters={filters}
        onFiltersChange={setFilters}
        onFit={() => engineRef.current?.fit()}
        focusLabel={focused?.label ?? null}
        depth={depth}
        onDepthChange={setDepth}
        onClearFocus={() => {
          setFocused(null)
          engineRef.current?.clearFocus()
          engineRef.current?.fit()
        }}
      />

      <div className="relative min-h-0 flex-1">
        <GraphCanvas
          graph={graph}
          filters={filters}
          onEngine={(engine) => {
            engineRef.current = engine
          }}
          onHover={setHovered}
          onSelect={(node) => handleSelect(node, lastModifiers)}
          className="block"
        />
        <GraphLegend stats={graph?.stats ?? null} />

        {hovered && (
          <div className="pointer-events-none absolute bottom-3 right-3 max-w-72 rounded border border-border bg-card/85 px-2.5 py-1.5 backdrop-blur">
            <p className="truncate font-mono text-[11px] text-kai-text">{hovered.label}</p>
            <p className="truncate font-mono text-[9px] text-kai-dim">
              {hovered.kind === "doc"
                ? `${hovered.rel}${hovered.words ? ` · ${hovered.words.toLocaleString()} words` : ""}`
                : hovered.kind === "file"
                  ? `${hovered.path}${hovered.missing ? " · deleted" : ""}`
                  : "section"}
            </p>
            <p className="font-mono text-[9px] text-kai-dim">
              {hovered.kind === "doc" ? "click to read · " : hovered.kind === "file" && !hovered.missing ? "click to open · " : ""}
              ctrl+click to focus
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// The engine's onSelect callback has no event object, so the last observed
// modifier state is tracked at module level — set on pointerdown (capture
// phase) before the engine's click resolves.
let lastModifiers: { ctrlKey: boolean; metaKey: boolean } = { ctrlKey: false, metaKey: false }
if (typeof window !== "undefined") {
  window.addEventListener(
    "pointerdown",
    (e) => {
      lastModifiers = { ctrlKey: e.ctrlKey, metaKey: e.metaKey }
    },
    { capture: true }
  )
}
