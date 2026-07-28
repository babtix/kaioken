// The public engine: one class, handed a <canvas>, dependency-free. The
// desktop imports it directly; scripts/build-graph-asset.mjs bundles this
// same file into an IIFE that `kaioken serve` embeds — so the two surfaces
// can never drift apart.

import { ForceLayout, placeInitial, type LayoutEdge } from "./layout"
import { render, type RenderEdge, type RenderNode, type Transform } from "./render"
import {
  defaultFilters,
  type EdgeKind,
  type Graph,
  type GraphColors,
  type GraphFilters,
  type GraphNode,
} from "./types"

export type { Graph, GraphColors, GraphFilters, GraphNode } from "./types"
export { defaultFilters } from "./types"
export { ForceLayout, placeInitial, mulberry32 } from "./layout"

/** Spring tuning per edge kind — `contains` stiffest, `source` loosest. */
const SPRINGS: Record<EdgeKind, { strength: number; length: number }> = {
  contains: { strength: 0.7, length: 55 },
  links: { strength: 0.35, length: 95 },
  source: { strength: 0.15, length: 70 },
}

const MIN_ZOOM = 0.08
const MAX_ZOOM = 5
/** Pointer movement below this (px) counts as a click, not a drag. */
const CLICK_SLOP = 4

/** Node radius from degree — Obsidian's rule; files sit a step smaller. */
function radiusFor(node: GraphNode, degree: number): number {
  const base = node.kind === "file" ? 2.5 : 4
  return base + Math.sqrt(degree) * 1.6
}

export class GraphEngine {
  onHover: ((node: GraphNode | null) => void) | null = null
  onSelect: ((node: GraphNode) => void) | null = null

  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private graph: Graph | null = null
  private filters: GraphFilters = defaultFilters()
  private colors: GraphColors = {
    background: "transparent",
    doc: "#d0d0d0",
    file: "#585858",
    section: "#808080",
    edge: "#303030",
    label: "#808080",
    accent: "#ff8700",
  }

  private nodes: RenderNode[] = []
  private edges: RenderEdge[] = []
  private byId = new Map<string, RenderNode>()
  private layout: ForceLayout | null = null
  /** Positions survive filter toggles and graph refreshes. */
  private positions = new Map<string, { x: number; y: number }>()

  private transform: Transform = { x: 0, y: 0, k: 1 }
  private hover: string | null = null
  private selected: string | null = null
  private focusId: string | null = null
  private focusDepth = 1
  private focusSet: Set<string> | null = null
  private pulseSet = new Set<string>()
  private pulseUntil = 0

  private raf = 0
  private running = false
  private destroyed = false
  private width = 0
  private height = 0
  private dpr = 1
  private resizeObserver: ResizeObserver | null = null
  private fitOnLayout = false

  // Pointer state.
  private dragNode: RenderNode | null = null
  private panning = false
  private pointerDown: { x: number; y: number } | null = null
  private lastPointer = { x: 0, y: 0 }
  private moved = false

  private readonly reducedMotion: boolean =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

  mount(canvas: HTMLCanvasElement): void {
    this.canvas = canvas
    this.ctx = canvas.getContext("2d")
    canvas.style.touchAction = "none"

    canvas.addEventListener("pointerdown", this.onPointerDown)
    canvas.addEventListener("pointermove", this.onPointerMove)
    canvas.addEventListener("pointerup", this.onPointerUp)
    canvas.addEventListener("pointerleave", this.onPointerLeave)
    canvas.addEventListener("wheel", this.onWheel, { passive: false })
    canvas.addEventListener("dblclick", this.onDblClick)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas.parentElement ?? canvas)
    this.resize()
  }

  setGraph(graph: Graph): void {
    this.graph = graph
    this.fitOnLayout = true
    this.rebuild()
  }

  setColors(colors: GraphColors): void {
    this.colors = colors
    this.requestFrame()
  }

  setFilters(filters: GraphFilters): void {
    this.filters = filters
    this.rebuild()
  }

  /** Dim everything outside `depth` hops of `id`, and fit to what remains. */
  focus(id: string, depth = 1): void {
    this.focusId = id
    this.focusDepth = depth
    this.recomputeFocus()
    this.fit()
  }

  clearFocus(): void {
    this.focusId = null
    this.focusSet = null
    this.requestFrame()
  }

  /** Pulse a set of nodes (search hits) for a few seconds. */
  pulse(ids: string[]): void {
    this.pulseSet = new Set(ids)
    this.pulseUntil = this.reducedMotion ? Infinity : performance.now() + 4000
    this.requestFrame()
  }

  setSelected(id: string | null): void {
    this.selected = id
    this.requestFrame()
  }

  /** Fit the visible (or focused) nodes into the viewport with padding. */
  fit(): void {
    const pool =
      this.focusSet !== null
        ? this.nodes.filter((n) => this.focusSet!.has(n.id))
        : this.nodes
    if (pool.length === 0 || this.width === 0) return
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const n of pool) {
      if (n.x - n.r < x0) x0 = n.x - n.r
      if (n.y - n.r < y0) y0 = n.y - n.r
      if (n.x + n.r > x1) x1 = n.x + n.r
      if (n.y + n.r > y1) y1 = n.y + n.r
    }
    const pad = 40
    const k = Math.min(
      MAX_ZOOM,
      Math.max(
        MIN_ZOOM,
        Math.min((this.width - pad * 2) / (x1 - x0 || 1), (this.height - pad * 2) / (y1 - y0 || 1))
      )
    )
    this.transform = {
      k,
      x: this.width / 2 - ((x0 + x1) / 2) * k,
      y: this.height / 2 - ((y0 + y1) / 2) * k,
    }
    this.requestFrame()
  }

  destroy(): void {
    this.destroyed = true
    this.running = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.resizeObserver?.disconnect()
    const c = this.canvas
    if (c) {
      c.removeEventListener("pointerdown", this.onPointerDown)
      c.removeEventListener("pointermove", this.onPointerMove)
      c.removeEventListener("pointerup", this.onPointerUp)
      c.removeEventListener("pointerleave", this.onPointerLeave)
      c.removeEventListener("wheel", this.onWheel)
      c.removeEventListener("dblclick", this.onDblClick)
    }
    this.canvas = null
    this.ctx = null
  }

  // ---- internals ----

  /** Rebuild render/layout structures from graph + filters. */
  private rebuild(): void {
    if (!this.graph) return
    const g = this.graph

    const degree = new Map<string, number>()
    const activeEdges = g.edges.filter((e) => {
      if (!this.filters.kinds[e.kind]) return false
      if (!this.filters.files && e.kind === "source") return false
      return true
    })
    for (const e of activeEdges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
    }

    const visible = g.nodes.filter((n) => this.filters.files || n.kind !== "file")
    this.nodes = visible.map((n) => {
      const d = degree.get(n.id) ?? 0
      const prev = this.positions.get(n.id)
      return {
        id: n.id,
        kind: n.kind,
        label: n.label,
        degree: d,
        missing: n.missing,
        x: prev?.x ?? 0,
        y: prev?.y ?? 0,
        vx: 0,
        vy: 0,
        r: radiusFor(n, d),
        fx: null,
        fy: null,
      }
    })
    this.byId = new Map(this.nodes.map((n) => [n.id, n]))

    // Seed only the nodes that have no remembered position, so a filter
    // toggle does not scramble a settled drawing.
    const fresh = this.nodes.filter((n) => !this.positions.has(n.id))
    if (fresh.length > 0) placeInitial(fresh, 42 + this.positions.size)

    this.edges = []
    const layoutEdges: LayoutEdge[] = []
    for (const e of activeEdges) {
      const s = this.byId.get(e.source)
      const t = this.byId.get(e.target)
      if (!s || !t) continue
      this.edges.push({ source: s, target: t, kind: e.kind })
      const spring = SPRINGS[e.kind]
      layoutEdges.push({ source: s, target: t, strength: spring.strength, length: spring.length })
    }

    this.layout = new ForceLayout(this.nodes, layoutEdges, { seed: 42 })
    this.recomputeFocus()

    if (this.reducedMotion) {
      // Static render: settle synchronously, no animation loop.
      this.layout.settle()
      this.rememberPositions()
      if (this.fitOnLayout) {
        this.fitOnLayout = false
        this.fit()
      }
      this.requestFrame()
      return
    }
    this.startLoop()
  }

  private recomputeFocus(): void {
    if (this.focusId === null || !this.byId.has(this.focusId)) {
      this.focusSet = null
      return
    }
    // BFS over the currently visible edges, out to focusDepth hops.
    const adj = new Map<string, string[]>()
    for (const e of this.edges) {
      const a = adj.get(e.source.id) ?? []
      a.push(e.target.id)
      adj.set(e.source.id, a)
      const b = adj.get(e.target.id) ?? []
      b.push(e.source.id)
      adj.set(e.target.id, b)
    }
    const seen = new Set<string>([this.focusId])
    let frontier = [this.focusId]
    for (let hop = 0; hop < this.focusDepth; hop++) {
      const next: string[] = []
      for (const id of frontier) {
        for (const nb of adj.get(id) ?? []) {
          if (!seen.has(nb)) {
            seen.add(nb)
            next.push(nb)
          }
        }
      }
      frontier = next
    }
    this.focusSet = seen
  }

  private rememberPositions(): void {
    for (const n of this.nodes) this.positions.set(n.id, { x: n.x, y: n.y })
  }

  // ---- the frame loop: run while hot, freeze once settled ----

  private startLoop(): void {
    if (this.running || this.destroyed) return
    this.running = true
    const tick = () => {
      if (!this.running || this.destroyed) return
      let busy = false
      if (this.layout && !this.layout.converged) {
        this.layout.step()
        busy = true
        if (this.layout.converged) this.rememberPositions()
      }
      if (this.fitOnLayout && this.layout && this.layout.alpha < 0.3) {
        this.fitOnLayout = false
        this.fit()
      }
      const now = performance.now()
      if (this.pulseSet.size > 0 && now < this.pulseUntil) {
        busy = true
      } else if (this.pulseSet.size > 0 && now >= this.pulseUntil) {
        this.pulseSet = new Set()
      }
      this.draw()
      if (busy) {
        this.raf = requestAnimationFrame(tick)
      } else {
        // Frozen: CPU returns to idle until an interaction reheats us.
        this.running = false
      }
    }
    this.raf = requestAnimationFrame(tick)
  }

  private reheat(alpha = 0.3): void {
    if (this.reducedMotion) {
      this.layout?.reheat(alpha)
      this.layout?.settle()
      this.rememberPositions()
      this.requestFrame()
      return
    }
    this.layout?.reheat(alpha)
    this.startLoop()
  }

  /** One render without (re)starting the simulation loop. */
  private requestFrame(): void {
    if (this.running || this.destroyed) return
    this.raf = requestAnimationFrame(() => {
      if (!this.destroyed) this.draw()
    })
  }

  private draw(): void {
    if (!this.ctx) return
    const phase =
      this.pulseUntil === Infinity ? 0.25 : ((performance.now() % 1200) / 1200 + 1) % 1
    render(this.ctx, this.nodes, this.edges, this.colors, {
      transform: this.transform,
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      hover: this.hover,
      selected: this.selected,
      focus: this.focusSet,
      pulse: this.pulseSet,
      pulsePhase: phase,
    })
  }

  private resize(): void {
    const c = this.canvas
    if (!c) return
    const host = c.parentElement ?? c
    const rect = host.getBoundingClientRect()
    this.dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1
    this.width = Math.max(1, Math.floor(rect.width))
    this.height = Math.max(1, Math.floor(rect.height))
    c.width = this.width * this.dpr
    c.height = this.height * this.dpr
    c.style.width = `${this.width}px`
    c.style.height = `${this.height}px`
    this.requestFrame()
  }

  // ---- hit testing + pointer handlers ----

  private toWorld(px: number, py: number): { x: number; y: number } {
    const t = this.transform
    return { x: (px - t.x) / t.k, y: (py - t.y) / t.k }
  }

  private canvasPoint(ev: PointerEvent | WheelEvent | MouseEvent): { x: number; y: number } {
    const rect = this.canvas!.getBoundingClientRect()
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top }
  }

  private hitTest(px: number, py: number): RenderNode | null {
    const w = this.toWorld(px, py)
    const slack = 3 / this.transform.k
    // Last drawn wins, so iterate backwards.
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i]
      const dx = w.x - n.x
      const dy = w.y - n.y
      const rr = n.r + slack
      if (dx * dx + dy * dy <= rr * rr) return n
    }
    return null
  }

  private lookup(id: string): GraphNode | null {
    return this.graph?.nodes.find((n) => n.id === id) ?? null
  }

  private onPointerDown = (ev: PointerEvent): void => {
    if (!this.canvas) return
    this.canvas.setPointerCapture(ev.pointerId)
    const p = this.canvasPoint(ev)
    this.pointerDown = p
    this.lastPointer = p
    this.moved = false
    const hit = this.hitTest(p.x, p.y)
    if (hit) {
      this.dragNode = hit
      // Pin where it stands; onPointerMove takes over from here.
      hit.fx = hit.x
      hit.fy = hit.y
    } else {
      this.panning = true
    }
  }

  private onPointerMove = (ev: PointerEvent): void => {
    if (!this.canvas) return
    const p = this.canvasPoint(ev)

    if (this.pointerDown) {
      const dx = p.x - this.pointerDown.x
      const dy = p.y - this.pointerDown.y
      if (dx * dx + dy * dy > CLICK_SLOP * CLICK_SLOP) this.moved = true
    }

    if (this.dragNode) {
      const w = this.toWorld(p.x, p.y)
      this.dragNode.fx = w.x
      this.dragNode.fy = w.y
      this.reheat(0.25)
      this.lastPointer = p
      return
    }
    if (this.panning) {
      this.transform.x += p.x - this.lastPointer.x
      this.transform.y += p.y - this.lastPointer.y
      this.lastPointer = p
      this.requestFrame()
      return
    }

    const hit = this.hitTest(p.x, p.y)
    const id = hit?.id ?? null
    if (id !== this.hover) {
      this.hover = id
      this.canvas.style.cursor = hit ? "pointer" : "default"
      this.onHover?.(id ? this.lookup(id) : null)
      this.requestFrame()
    }
    this.lastPointer = p
  }

  private onPointerUp = (ev: PointerEvent): void => {
    if (!this.canvas) return
    this.canvas.releasePointerCapture(ev.pointerId)
    if (this.dragNode) {
      this.dragNode.fx = null
      this.dragNode.fy = null
      if (!this.moved) this.select(this.dragNode)
      this.dragNode = null
      this.rememberPositions()
    } else if (this.panning && !this.moved) {
      // A clean click on empty canvas clears the selection.
      this.selected = null
      this.requestFrame()
    }
    this.panning = false
    this.pointerDown = null
  }

  private onPointerLeave = (): void => {
    if (this.hover !== null) {
      this.hover = null
      this.onHover?.(null)
      this.requestFrame()
    }
  }

  private onWheel = (ev: WheelEvent): void => {
    ev.preventDefault()
    const p = this.canvasPoint(ev)
    const factor = Math.pow(1.0015, -ev.deltaY)
    const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.transform.k * factor))
    // Zoom about the cursor: the world point under it must not move.
    const scale = k / this.transform.k
    this.transform = {
      k,
      x: p.x - (p.x - this.transform.x) * scale,
      y: p.y - (p.y - this.transform.y) * scale,
    }
    this.requestFrame()
  }

  private onDblClick = (): void => {
    this.fit()
  }

  private select(node: RenderNode): void {
    this.selected = node.id
    this.requestFrame()
    const data = this.lookup(node.id)
    if (data) this.onSelect?.(data)
  }
}
