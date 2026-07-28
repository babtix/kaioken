import { useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import GraphCanvas from "@/components/graph/GraphCanvas"
import { api } from "@/lib/api"
import type { GraphEngine } from "@/lib/graph/engine"
import type { Graph, GraphNode } from "@/lib/graph/types"
import { useOpenFile } from "@/lib/openFile"
import { useWorkspaceStore } from "@/store/workspace"
import { cn } from "@/lib/utils"

// One fetch per workspace, shared across doc navigations — the graph does
// not change while reading.
const graphCache = new Map<string, Promise<Graph>>()

function fetchGraph(wsId: string): Promise<Graph> {
  let p = graphCache.get(wsId)
  if (!p) {
    p = api.wikiGraph(wsId)
    graphCache.set(wsId, p)
    p.catch(() => graphCache.delete(wsId))
  }
  return p
}

// Collapsed state and depth survive restarts, the same way ResizeHandle
// persists its width.
const COLLAPSE_KEY = "kai-localgraph-collapsed"
const DEPTH_KEY = "kai-localgraph-depth"

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1"
  } catch {
    return false
  }
}

function readDepth(): 1 | 2 {
  try {
    return localStorage.getItem(DEPTH_KEY) === "2" ? 2 : 1
  } catch {
    return 1
  }
}

/**
 * The wiki reader's mini graph: the current chapter and its neighbourhood,
 * one or two hops out. Clicking a neighbour swaps the reader; the panel then
 * re-centres on the new document.
 */
export default function LocalGraph({
  docPath,
  onNavigate,
}: {
  /** Wiki-relative path of the open document. */
  docPath: string
  /** Follow a doc-node click into the reader. */
  onNavigate: (rel: string) => void
}) {
  const ws = useWorkspaceStore((s) => s.active)
  const openFile = useOpenFile()
  const [graph, setGraph] = useState<Graph | null>(null)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [depth, setDepth] = useState<1 | 2>(readDepth)
  const engineRef = useRef<GraphEngine | null>(null)

  useEffect(() => {
    if (!ws) return
    let cancelled = false
    fetchGraph(ws.id)
      .then((g) => {
        if (!cancelled) setGraph(g)
      })
      .catch(() => {
        if (!cancelled) setGraph(null)
      })
    return () => {
      cancelled = true
    }
  }, [ws?.id])

  // Re-centre whenever the document, the depth, or the graph itself changes.
  useEffect(() => {
    if (!collapsed && graph && docPath) {
      engineRef.current?.focus(`doc:${docPath}`, depth)
    }
  }, [graph, docPath, depth, collapsed])

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0")
    } catch {}
  }

  const changeDepth = (d: 1 | 2) => {
    setDepth(d)
    try {
      localStorage.setItem(DEPTH_KEY, String(d))
    } catch {}
  }

  const handleSelect = (node: GraphNode) => {
    if (node.kind === "doc" && node.rel && node.rel !== docPath) {
      onNavigate(node.rel)
      return
    }
    if (node.kind === "file" && node.path && !node.missing) {
      openFile(node.path)
    }
  }

  // Nothing useful to draw — a wiki with no graph, or the fetch failed.
  if (graph !== null && graph.nodes.length === 0) return null

  return (
    <section className="mb-4">
      <div className="flex w-full items-center gap-1">
        <button
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          className={cn(
            "flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-kai-dim",
            "transition-colors outline-none hover:text-kai-text focus-visible:ring-2 focus-visible:ring-kai-orange/50"
          )}
        >
          {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
          Connections
        </button>
        {!collapsed && (
          <span className="ml-auto flex gap-0.5">
            {([1, 2] as const).map((d) => (
              <button
                key={d}
                onClick={() => changeDepth(d)}
                aria-pressed={depth === d}
                title={`${d} hop${d > 1 ? "s" : ""}`}
                className={cn(
                  "rounded border px-1 font-mono text-[9px] transition-colors outline-none",
                  "focus-visible:ring-2 focus-visible:ring-kai-orange/50",
                  depth === d
                    ? "border-kai-orange/40 text-kai-orange"
                    : "border-border text-kai-dim hover:text-kai-text"
                )}
              >
                {d}
              </button>
            ))}
          </span>
        )}
      </div>

      {!collapsed && (
        <div className="relative mt-2 h-60 overflow-hidden rounded border border-border bg-card/40">
          <GraphCanvas
            graph={graph}
            onEngine={(engine) => {
              engineRef.current = engine
            }}
            onSelect={handleSelect}
            className="block"
          />
        </div>
      )}
    </section>
  )
}
