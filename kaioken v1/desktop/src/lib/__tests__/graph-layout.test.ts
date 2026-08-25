import { describe, expect, it } from "vitest"
import { ForceLayout, mulberry32, placeInitial, type LayoutEdge, type LayoutNode } from "../graph/layout"

function makeNodes(n: number): LayoutNode[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r: 4,
    fx: null,
    fy: null,
  }))
}

function star(nodes: LayoutNode[]): LayoutEdge[] {
  // Hub at index 0, spokes to everyone else.
  return nodes.slice(1).map((t) => ({ source: nodes[0], target: t, strength: 0.7, length: 55 }))
}

describe("mulberry32", () => {
  it("is deterministic for a fixed seed", () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    for (let i = 0; i < 10; i++) expect(a()).toBe(b())
  })

  it("differs across seeds", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })
})

describe("placeInitial", () => {
  it("gives every node a distinct position", () => {
    const nodes = makeNodes(30)
    placeInitial(nodes, 42)
    const seen = new Set(nodes.map((n) => `${n.x},${n.y}`))
    expect(seen.size).toBe(30)
  })

  it("is reproducible for the same seed", () => {
    const a = makeNodes(10)
    const b = makeNodes(10)
    placeInitial(a, 42)
    placeInitial(b, 42)
    for (let i = 0; i < a.length; i++) {
      expect(a[i].x).toBe(b[i].x)
      expect(a[i].y).toBe(b[i].y)
    }
  })
})

describe("ForceLayout", () => {
  it("converges and stops doing work", () => {
    const nodes = makeNodes(12)
    placeInitial(nodes, 42)
    const layout = new ForceLayout(nodes, star(nodes), { seed: 42 })
    layout.settle()
    expect(layout.converged).toBe(true)
    expect(layout.step()).toBe(false)
  })

  it("produces identical layouts for identical inputs", () => {
    const run = () => {
      const nodes = makeNodes(15)
      placeInitial(nodes, 42)
      const layout = new ForceLayout(nodes, star(nodes), { seed: 42 })
      layout.settle()
      return nodes.map((n) => [n.x, n.y])
    }
    expect(run()).toEqual(run())
  })

  it("separates unconnected nodes and keeps springs near rest length", () => {
    const nodes = makeNodes(8)
    placeInitial(nodes, 42)
    const edges = star(nodes)
    const layout = new ForceLayout(nodes, edges, { seed: 42 })
    layout.settle(1000)

    // No two nodes collapsed onto each other.
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y)
        expect(d).toBeGreaterThan(1)
      }
    }
    // Spokes end up within a sane multiple of the rest length.
    for (const e of edges) {
      const d = Math.hypot(e.source.x - e.target.x, e.source.y - e.target.y)
      expect(d).toBeLessThan(e.length * 4)
    }
  })

  it("respects pinned nodes", () => {
    const nodes = makeNodes(5)
    placeInitial(nodes, 42)
    nodes[0].fx = 123
    nodes[0].fy = -45
    const layout = new ForceLayout(nodes, star(nodes), { seed: 42 })
    layout.settle()
    expect(nodes[0].x).toBe(123)
    expect(nodes[0].y).toBe(-45)
  })

  it("reheat restarts a settled simulation", () => {
    const nodes = makeNodes(4)
    placeInitial(nodes, 42)
    const layout = new ForceLayout(nodes, [], { seed: 42 })
    layout.settle()
    expect(layout.converged).toBe(true)
    layout.reheat(0.5)
    expect(layout.converged).toBe(false)
    expect(layout.step()).toBe(true)
  })

  it("handles an empty graph without dividing by zero", () => {
    const layout = new ForceLayout([], [], {})
    expect(layout.step()).toBe(false)
  })
})
