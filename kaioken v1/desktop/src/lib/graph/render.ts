// DPR-aware canvas draw pass. Stateless apart from a label-width cache: the
// engine hands it everything each frame, so it can render a full graph or a
// focused subgraph without knowing which is which.

import type { EdgeKind, GraphColors, NodeKind } from "./types"
import type { LayoutNode } from "./layout"

export interface RenderNode extends LayoutNode {
  kind: NodeKind
  label: string
  degree: number
  missing?: boolean
}

export interface RenderEdge {
  source: RenderNode
  target: RenderNode
  kind: EdgeKind
}

export interface Transform {
  x: number
  y: number
  k: number
}

export interface RenderState {
  transform: Transform
  width: number
  height: number
  dpr: number
  hover: string | null
  selected: string | null
  /** Focus mode: nodes outside this set (and their edges) are dimmed. */
  focus: Set<string> | null
  /** Search matches, drawn with a pulsing ring. */
  pulse: Set<string>
  /** 0..1 animation phase for the pulse ring. */
  pulsePhase: number
}

/** Labels appear for everyone past this zoom; hubs and hovered always. */
const LABEL_ZOOM = 1.1
const HUB_DEGREE = 6
const FONT_PX = 11
const FONT_FAMILY = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

// Text measured once per label at FONT_PX and scaled by 1/k when drawn —
// width is linear in font size, so one measurement serves every zoom level.
const labelWidths = new Map<string, number>()

function labelWidth(ctx: CanvasRenderingContext2D, label: string): number {
  let w = labelWidths.get(label)
  if (w === undefined) {
    ctx.font = `${FONT_PX}px ${FONT_FAMILY}`
    w = ctx.measureText(label).width
    labelWidths.set(label, w)
  }
  return w
}

function nodeColor(n: RenderNode, colors: GraphColors): string {
  switch (n.kind) {
    case "file":
      return colors.file
    case "section":
      return colors.section
    default:
      return colors.doc
  }
}

export function render(
  ctx: CanvasRenderingContext2D,
  nodes: RenderNode[],
  edges: RenderEdge[],
  colors: GraphColors,
  state: RenderState
): void {
  const { transform: t, width, height, dpr } = state
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  if (colors.background !== "transparent") {
    ctx.fillStyle = colors.background
    ctx.fillRect(0, 0, width, height)
  }
  ctx.translate(t.x, t.y)
  ctx.scale(t.k, t.k)

  const hover = state.hover
  const dimming = state.focus !== null || hover !== null

  // Edges first, dimmed unless both ends are in play.
  ctx.lineWidth = 1 / t.k
  for (const e of edges) {
    let alpha = 0.5
    if (state.focus !== null && !(state.focus.has(e.source.id) && state.focus.has(e.target.id))) {
      alpha = 0.06
    } else if (hover !== null && e.source.id !== hover && e.target.id !== hover) {
      alpha = 0.12
    }
    ctx.globalAlpha = e.kind === "source" ? alpha * 0.7 : alpha
    ctx.strokeStyle = colors.edge
    ctx.beginPath()
    ctx.moveTo(e.source.x, e.source.y)
    ctx.lineTo(e.target.x, e.target.y)
    ctx.stroke()
  }

  // Nodes.
  for (const n of nodes) {
    const inFocus = state.focus === null || state.focus.has(n.id)
    const active = n.id === hover || n.id === state.selected
    let alpha = inFocus ? 1 : 0.12
    if (dimming && inFocus && !active && hover !== null && n.id !== hover) alpha = 0.55
    if (n.missing) alpha *= 0.45

    ctx.globalAlpha = alpha
    ctx.fillStyle = nodeColor(n, colors)
    ctx.beginPath()
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
    ctx.fill()

    if (active) {
      ctx.globalAlpha = 1
      ctx.strokeStyle = colors.accent
      ctx.lineWidth = 1.5 / t.k
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.r + 2 / t.k, 0, Math.PI * 2)
      ctx.stroke()
    }

    if (state.pulse.has(n.id)) {
      const ring = n.r + 3 + Math.sin(state.pulsePhase * Math.PI * 2) * 2
      ctx.globalAlpha = 0.75
      ctx.strokeStyle = colors.accent
      ctx.lineWidth = 1.5 / t.k
      ctx.beginPath()
      ctx.arc(n.x, n.y, ring, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  // Labels: everyone past the zoom threshold, hubs and the hovered/selected
  // node always. Constant on-screen size — font scales by 1/k.
  ctx.font = `${FONT_PX / t.k}px ${FONT_FAMILY}`
  ctx.textBaseline = "top"
  for (const n of nodes) {
    const active = n.id === hover || n.id === state.selected
    const show = active || t.k >= LABEL_ZOOM || n.degree >= HUB_DEGREE || state.pulse.has(n.id)
    if (!show) continue
    const inFocus = state.focus === null || state.focus.has(n.id)
    if (!inFocus && !active) continue
    ctx.globalAlpha = active ? 1 : 0.85
    ctx.fillStyle = colors.label
    const w = labelWidth(ctx, n.label) / t.k
    ctx.fillText(n.label, n.x - w / 2, n.y + n.r + 3 / t.k)
    // labelWidth changed ctx.font when it measured a cache miss — restore.
    ctx.font = `${FONT_PX / t.k}px ${FONT_FAMILY}`
  }

  ctx.globalAlpha = 1
}
