// Force-directed layout: Barnes–Hut quadtree repulsion, springs per edge
// kind, centering gravity, velocity decay, alpha cooling. Pure and seedable —
// no canvas, no DOM — so it unit-tests headless and both surfaces (desktop
// React, `kaioken serve` vanilla JS) share one implementation.

export interface LayoutNode {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  /** Draw radius; also pads the repulsion so big nodes claim more room. */
  r: number
  /** Pinned position while dragging; null when free. */
  fx: number | null
  fy: number | null
}

export interface LayoutEdge {
  source: LayoutNode
  target: LayoutNode
  /** Spring stiffness 0..1 — `contains` stiffest, `source` loosest. */
  strength: number
  /** Rest length in world units. */
  length: number
}

export interface LayoutOptions {
  seed?: number
  /** Repulsive charge, negative pulls; magnitude scales with node radius. */
  repulsion?: number
  /** Barnes–Hut opening angle; larger is faster and rougher. */
  theta?: number
  /** Pull toward the origin, keeps disconnected clusters on screen. */
  gravity?: number
  velocityDecay?: number
  alphaMin?: number
  alphaDecay?: number
}

const DEFAULTS: Required<LayoutOptions> = {
  seed: 42,
  repulsion: 320,
  theta: 0.9,
  gravity: 0.05,
  velocityDecay: 0.6,
  alphaMin: 0.003,
  alphaDecay: 0.028,
}

/** mulberry32 — tiny deterministic PRNG so layouts reproduce under test. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Deterministic initial placement: a phyllotaxis spiral (like d3-force) with
 * a seeded jitter so coincident nodes never start exactly stacked.
 */
export function placeInitial(nodes: LayoutNode[], seed: number): void {
  const rand = mulberry32(seed)
  const radiusStep = 12
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    const radius = radiusStep * Math.sqrt(0.5 + i)
    const angle = i * goldenAngle
    n.x = radius * Math.cos(angle) + (rand() - 0.5) * 1e-3
    n.y = radius * Math.sin(angle) + (rand() - 0.5) * 1e-3
    n.vx = 0
    n.vy = 0
  }
}

// A quadtree cell. Leaves hold one node; internal cells hold aggregate mass.
interface Quad {
  x0: number
  y0: number
  x1: number
  y1: number
  mass: number
  cx: number
  cy: number
  node: LayoutNode | null
  children: (Quad | null)[] | null
}

function newQuad(x0: number, y0: number, x1: number, y1: number): Quad {
  return { x0, y0, x1, y1, mass: 0, cx: 0, cy: 0, node: null, children: null }
}

function quadInsert(q: Quad, n: LayoutNode, depth: number): void {
  // Beyond a sane depth the nodes are effectively coincident — aggregate
  // rather than recursing forever.
  if (q.node === null && q.children === null) {
    q.node = n
    return
  }
  if (depth > 24) {
    q.mass += 1
    q.cx += n.x
    q.cy += n.y
    return
  }
  if (q.children === null) {
    const prev = q.node!
    q.node = null
    q.children = [null, null, null, null]
    q.mass = 0
    q.cx = 0
    q.cy = 0
    quadInsertChild(q, prev, depth)
  }
  quadInsertChild(q, n, depth)
}

function quadInsertChild(q: Quad, n: LayoutNode, depth: number): void {
  const mx = (q.x0 + q.x1) / 2
  const my = (q.y0 + q.y1) / 2
  const i = (n.x >= mx ? 1 : 0) + (n.y >= my ? 2 : 0)
  let child = q.children![i]
  if (child === null) {
    child = newQuad(
      i & 1 ? mx : q.x0,
      i & 2 ? my : q.y0,
      i & 1 ? q.x1 : mx,
      i & 2 ? q.y1 : my
    )
    q.children![i] = child
  }
  quadInsert(child, n, depth + 1)
}

// Bottom-up pass filling each cell's total mass and centre of mass.
function quadAccumulate(q: Quad): void {
  if (q.children !== null) {
    let mass = q.mass // coincident overflow accumulated at depth cap
    let cx = q.cx
    let cy = q.cy
    for (const c of q.children) {
      if (c === null) continue
      quadAccumulate(c)
      mass += c.mass
      cx += c.cx * c.mass
      cy += c.cy * c.mass
    }
    q.mass = mass
    q.cx = mass > 0 ? cx / mass : (q.x0 + q.x1) / 2
    q.cy = mass > 0 ? cy / mass : (q.y0 + q.y1) / 2
    return
  }
  if (q.node !== null) {
    q.mass = 1
    q.cx = q.node.x
    q.cy = q.node.y
  }
}

export class ForceLayout {
  readonly nodes: LayoutNode[]
  readonly edges: LayoutEdge[]
  alpha = 1
  private readonly opts: Required<LayoutOptions>

  constructor(nodes: LayoutNode[], edges: LayoutEdge[], opts: LayoutOptions = {}) {
    this.nodes = nodes
    this.edges = edges
    this.opts = { ...DEFAULTS, ...opts }
  }

  get converged(): boolean {
    return this.alpha < this.opts.alphaMin
  }

  /** Warm the simulation back up (drag, filter change, new graph). */
  reheat(alpha = 0.5): void {
    this.alpha = Math.max(this.alpha, alpha)
  }

  /** One tick. Returns false once converged (and does no work). */
  step(): boolean {
    if (this.converged || this.nodes.length === 0) return false
    const { repulsion, theta, gravity, velocityDecay } = this.opts
    const alpha = this.alpha
    const nodes = this.nodes

    // Repulsion via Barnes–Hut.
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const n of nodes) {
      if (n.x < x0) x0 = n.x
      if (n.y < y0) y0 = n.y
      if (n.x > x1) x1 = n.x
      if (n.y > y1) y1 = n.y
    }
    // Square the bounds so quadrants stay quadrants.
    const side = Math.max(x1 - x0, y1 - y0, 1)
    const root = newQuad(x0, y0, x0 + side, y0 + side)
    for (const n of nodes) quadInsert(root, n, 0)
    quadAccumulate(root)

    const thetaSq = theta * theta
    for (const n of nodes) {
      applyRepulsion(n, root, thetaSq, repulsion * alpha)
    }

    // Springs, stiffest first by construction order — order is irrelevant to
    // the sum, but keeping it stable keeps runs reproducible.
    for (const e of this.edges) {
      const dx = e.target.x - e.source.x
      const dy = e.target.y - e.source.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1e-6
      const f = ((dist - e.length) / dist) * e.strength * alpha
      const fx = dx * f * 0.5
      const fy = dy * f * 0.5
      e.source.vx += fx
      e.source.vy += fy
      e.target.vx -= fx
      e.target.vy -= fy
    }

    // Centering gravity + integration.
    for (const n of nodes) {
      n.vx -= n.x * gravity * alpha
      n.vy -= n.y * gravity * alpha
      n.vx *= velocityDecay
      n.vy *= velocityDecay
      if (n.fx !== null) {
        n.x = n.fx
        n.y = n.fy!
        n.vx = 0
        n.vy = 0
      } else {
        n.x += n.vx
        n.y += n.vy
      }
    }

    this.alpha += (0 - this.alpha) * this.opts.alphaDecay
    return true
  }

  /** Run to convergence synchronously — `prefers-reduced-motion`, tests. */
  settle(maxTicks = 400): void {
    for (let i = 0; i < maxTicks && this.step(); i++) {
      // step() advances until alpha cools
    }
  }
}

function applyRepulsion(n: LayoutNode, q: Quad, thetaSq: number, strength: number): void {
  if (q.mass === 0 && q.node === null) return
  const dx = n.x - q.cx
  const dy = n.y - q.cy
  const distSq = dx * dx + dy * dy
  const width = q.x1 - q.x0

  // Far enough away: treat the whole cell as one body.
  if (q.children !== null && (width * width) / distSq < thetaSq) {
    if (distSq > 1e-9) {
      const f = (strength * q.mass) / distSq
      n.vx += dx * f
      n.vy += dy * f
    }
    return
  }
  if (q.children !== null) {
    for (const c of q.children) {
      if (c !== null) applyRepulsion(n, c, thetaSq, strength)
    }
    return
  }
  if (q.node !== null && q.node !== n && distSq > 1e-9) {
    // Pad by radius so larger nodes hold more space around themselves.
    const f = (strength * (1 + n.r * 0.06)) / distSq
    n.vx += dx * f
    n.vy += dy * f
  }
}
