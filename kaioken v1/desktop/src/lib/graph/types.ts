// Wire-format mirrors of cli/internal/wiki/graph.go — the /wiki/graph payload
// both the daemon and `kaioken serve` emit. Field names match the Go JSON tags.

export type NodeKind = "doc" | "file" | "section"
export type EdgeKind = "contains" | "links" | "source"

export interface GraphNode {
  id: string
  kind: NodeKind
  label: string
  /** Wiki-relative path of a doc node, e.g. "Chat Agent/Chat Agent.md". */
  rel?: string
  /** Repo-relative path of a file node. */
  path?: string
  section?: string
  lang?: string
  words?: number
  is_section_doc?: boolean
  /** A cited file that no longer exists in the working tree. */
  missing?: boolean
}

export interface GraphEdge {
  source: string
  target: string
  kind: EdgeKind
}

export interface GraphStats {
  docs: number
  files: number
  sections: number
  edges: number
}

export interface Graph {
  root: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  stats: GraphStats
}

/** Which parts of the graph are drawn. Everything defaults to on. */
export interface GraphFilters {
  files: boolean
  kinds: Record<EdgeKind, boolean>
}

export const defaultFilters = (): GraphFilters => ({
  files: true,
  kinds: { contains: true, links: true, source: true },
})

/**
 * The palette the render layer draws with. No colour is hard-coded anywhere in
 * the engine — the desktop reads CSS variables, the served page reads its own
 * `--accent`/`--dim`/`--line` set, and both hand the result here.
 */
export interface GraphColors {
  background: string
  doc: string
  file: string
  section: string
  edge: string
  label: string
  /** Hover ring, selection, and search pulse. */
  accent: string
}
