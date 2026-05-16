import type { DottedEdge } from '../../types/org-tree'
import type { PlacedTree, PlacedStaff, RenderConfig } from '../types'
import { emptyRenderBounds, escapeXml, expandBoundsWithPoints, getNodeBounds, type NodeBounds, type RenderBounds, type SvgPoint } from './shared'

// DEVIATION(2.4): Dotted-edge rendering remains co-located to preserve routing and label offset consistency.

type DottedEdgeCounts = Readonly<Record<string, number>>

type DottedRenderState = {
  readonly edgeElements: readonly string[]
  readonly bounds: RenderBounds
  readonly seenOut: DottedEdgeCounts
  readonly seenIn: DottedEdgeCounts
}

type DottedLabelElementInput = {
  readonly label: string
  readonly points: readonly SvgPoint[]
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
}

type RenderDottedEdgeElementsInput = {
  readonly state: DottedRenderState
  readonly edge: DottedEdge
  readonly points: readonly SvgPoint[]
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
}

type DottedEndpointsInput = {
  readonly fromBounds: NodeBounds
  readonly toBounds: NodeBounds
  readonly axisDelta: number
  readonly fromSpread: number
  readonly toSpread: number
}

type DottedGapRouteInput = {
  readonly start: SvgPoint
  readonly end: SvgPoint
  readonly gapMidY: number
  readonly sameRow: boolean
  readonly sameX: boolean
  readonly sameY: boolean
}

type DottedRouteInput = {
  readonly fromBounds: NodeBounds
  readonly toBounds: NodeBounds
  readonly cfg: RenderConfig
  readonly fromSpread: number
  readonly toSpread: number
}

type DottedGapMidpointInput = {
  readonly fromBounds: NodeBounds
  readonly toBounds: NodeBounds
  readonly start: SvgPoint
  readonly end: SvgPoint
}

type ReduceOneDottedEdgeInput = {
  readonly state: DottedRenderState
  readonly edge: DottedEdge
  readonly totals: { readonly outTotals: DottedEdgeCounts; readonly inTotals: DottedEdgeCounts }
  readonly placed: PlacedTree
  readonly staff: PlacedStaff
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
  readonly shadowBoundsMap: ReadonlyMap<string, NodeBounds>
}

type RenderDottedEdgesInput = {
  readonly dottedEdges: readonly DottedEdge[]
  readonly placed: PlacedTree
  readonly staff: PlacedStaff
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
  readonly shadowBoundsMap: ReadonlyMap<string, NodeBounds>
}

const incrementCount = (counts: DottedEdgeCounts, key: string): DottedEdgeCounts => ({
  ...counts,
  [key]: (counts[key] ?? 0) + 1
})

const buildDottedEdgeTotals = (dottedEdges: readonly DottedEdge[]): {
  readonly outTotals: DottedEdgeCounts
  readonly inTotals: DottedEdgeCounts
} => dottedEdges.reduce(
  (state, edge) => {
    const fromKey = String(edge.from)
    const toKey = String(edge.to)
    return {
      outTotals: incrementCount(state.outTotals, fromKey),
      inTotals: incrementCount(state.inTotals, toKey)
    }
  },
  {
    outTotals: {},
    inTotals: {}
  }
)

const getLabelAnchorForPolyline = (points: readonly SvgPoint[]): SvgPoint => {
  const p1 = points[1]
  const p2 = points[2]
  if (points.length >= 4 && p1 !== undefined && p2 !== undefined && Math.abs(p1.y - p2.y) < 0.01) {
    return {
      x: (p1.x + p2.x) / 2,
      y: p1.y
    }
  }

  const first = points[0] ?? { x: 0, y: 0 }
  const last = points[points.length - 1] ?? first
  return {
    x: (first.x + last.x) / 2,
    y: (first.y + last.y) / 2
  }
}

const dottedLabelElement = (input: DottedLabelElementInput): string => {
  const labelAnchor = getLabelAnchorForPolyline(input.points)
  const mx = labelAnchor.x
  const my = labelAnchor.y - 7
  return `<text x="${mx}" y="${my}" text-anchor="middle" dominant-baseline="middle" font-size="${Math.round(input.cfg.fontSize * 0.72)}px" font-family="${input.safeCfg.fontFamily}" fill="${input.safeCfg.dottedEdgeStroke}">${escapeXml(input.label)}</text>`
}

const dottedEdgeElement = (points: readonly SvgPoint[], safeCfg: RenderConfig): string => {
  const dottedPointsAttr = points.map((pt) => `${pt.x},${pt.y}`).join(' ')
  return `<polyline class="dotted-edge" points="${dottedPointsAttr}" fill="none" stroke="${safeCfg.dottedEdgeStroke}" stroke-width="1.25" stroke-dasharray="7 4" stroke-linecap="round" opacity="0.95" />`
}

const bumpDottedSeen = (state: DottedRenderState, fromKey: string, toKey: string): DottedRenderState => ({
  ...state,
  seenOut: incrementCount(state.seenOut, fromKey),
  seenIn: incrementCount(state.seenIn, toKey)
})

const renderDottedEdgeElements = (input: RenderDottedEdgeElementsInput): DottedRenderState => {
  const fromKey = String(input.edge.from)
  const toKey = String(input.edge.to)
  const nextEdgeElements = [
    ...input.state.edgeElements,
    dottedEdgeElement(input.points, input.safeCfg),
    ...(input.edge.label !== undefined && input.edge.label.length > 0
      ? [dottedLabelElement({ label: input.edge.label, points: input.points, cfg: input.cfg, safeCfg: input.safeCfg })]
      : [])
  ]

  const start = input.points[0]
  const end = input.points[input.points.length - 1]
  if (start === undefined || end === undefined) {
    return bumpDottedSeen({
      ...input.state,
      edgeElements: nextEdgeElements
    }, fromKey, toKey)
  }

  return bumpDottedSeen({
    edgeElements: nextEdgeElements,
    bounds: expandBoundsWithPoints(
        expandBoundsWithPoints(input.state.bounds, [start, end]),
        input.points
    ),
      seenOut: input.state.seenOut,
      seenIn: input.state.seenIn
  }, fromKey, toKey)
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

const getSpreadOffset = (index: number, total: number, cfg: RenderConfig): number => {
  if (total <= 1) {
    return 0
  }

  const gap = Math.max(6, cfg.fontSize * 0.72)
  return (index - (total - 1) / 2) * gap
}

const getHorizontalDottedEndpoints = (input: DottedEndpointsInput): { readonly start: SvgPoint; readonly end: SvgPoint } => {
  const startYMax = Math.max(0, input.fromBounds.h / 2 - 6)
  const endYMax = Math.max(0, input.toBounds.h / 2 - 6)
  return {
    start: {
      x: input.fromBounds.cx + (input.axisDelta >= 0 ? input.fromBounds.w / 2 : -input.fromBounds.w / 2),
      y: input.fromBounds.cy + clamp(input.fromSpread, -startYMax, startYMax)
    },
    end: {
      x: input.toBounds.cx + (input.axisDelta >= 0 ? -input.toBounds.w / 2 : input.toBounds.w / 2),
      y: input.toBounds.cy + clamp(input.toSpread, -endYMax, endYMax)
    }
  }
}

const getVerticalDottedEndpoints = (input: DottedEndpointsInput): { readonly start: SvgPoint; readonly end: SvgPoint } => {
  const startXMax = Math.max(0, input.fromBounds.w / 2 - 8)
  const endXMax = Math.max(0, input.toBounds.w / 2 - 8)
  return {
    start: {
      x: input.fromBounds.cx + clamp(input.fromSpread, -startXMax, startXMax),
      y: input.fromBounds.cy + (input.axisDelta >= 0 ? input.fromBounds.h / 2 : -input.fromBounds.h / 2)
    },
    end: {
      x: input.toBounds.cx + clamp(input.toSpread, -endXMax, endXMax),
      y: input.toBounds.cy + (input.axisDelta >= 0 ? -input.toBounds.h / 2 : input.toBounds.h / 2)
    }
  }
}

const getDottedGapRoute = (input: DottedGapRouteInput): readonly SvgPoint[] => {
  if (input.sameX && !input.sameRow) {
    return [input.start, input.end]
  }

  const midRoute: readonly SvgPoint[] = [
    input.start,
    { x: input.start.x, y: input.gapMidY },
    { x: input.end.x, y: input.gapMidY },
    input.end
  ]
  return input.sameY && !input.sameRow ? midRoute : midRoute
}

const resolveDottedEndpoints = (input: DottedRouteInput): { readonly start: SvgPoint; readonly end: SvgPoint; readonly horizontalDominant: boolean } => {
  const dx = input.toBounds.cx - input.fromBounds.cx
  const dy = input.toBounds.cy - input.fromBounds.cy
  const horizontalDominant = Math.abs(dx) >= Math.abs(dy)
  const endpoints = horizontalDominant
    ? getHorizontalDottedEndpoints({
      fromBounds: input.fromBounds,
      toBounds: input.toBounds,
      axisDelta: dx,
      fromSpread: input.fromSpread,
      toSpread: input.toSpread
    })
    : getVerticalDottedEndpoints({
      fromBounds: input.fromBounds,
      toBounds: input.toBounds,
      axisDelta: dy,
      fromSpread: input.fromSpread,
      toSpread: input.toSpread
    })
  return { start: endpoints.start, end: endpoints.end, horizontalDominant }
}

const resolveDottedGapMidY = (input: DottedGapMidpointInput): number => {
  const upper = input.fromBounds.cy <= input.toBounds.cy ? input.fromBounds : input.toBounds
  const lower = input.fromBounds.cy <= input.toBounds.cy ? input.toBounds : input.fromBounds
  const gapTop = upper.cy + upper.h / 2
  const gapBottom = lower.cy - lower.h / 2
  return gapBottom > gapTop ? (gapTop + gapBottom) / 2 : (input.start.y + input.end.y) / 2
}

const getDottedRoute = (input: DottedRouteInput): readonly SvgPoint[] => {
  const routeMargin = Math.max(input.cfg.fontSize, Math.round(input.cfg.rowHeight * 0.09))
  const resolved = resolveDottedEndpoints(input)
  const start = resolved.start
  const end = resolved.end

  const sameRow = Math.abs(input.fromBounds.cy - input.toBounds.cy) < 0.01
  if (sameRow && resolved.horizontalDominant) {
    const channelY = Math.min(
      input.fromBounds.cy - input.fromBounds.h / 2,
      input.toBounds.cy - input.toBounds.h / 2
    ) - routeMargin
    return [start, { x: start.x, y: channelY }, { x: end.x, y: channelY }, end]
  }

  const gapMidY = resolveDottedGapMidY({
    fromBounds: input.fromBounds,
    toBounds: input.toBounds,
    start,
    end
  })

  return getDottedGapRoute({
    start,
    end,
    gapMidY,
    sameRow,
    sameX: Math.abs(start.x - end.x) < 0.01,
    sameY: Math.abs(start.y - end.y) < 0.01
  })
}

const reduceOneDottedEdge = (input: ReduceOneDottedEdgeInput): DottedRenderState => {
  const fromBounds = getNodeBounds({
    id: input.edge.from,
    placed: input.placed,
    staff: input.staff,
    cfg: input.cfg,
    shadowBoundsMap: input.shadowBoundsMap
  })
  const toBounds = getNodeBounds({
    id: input.edge.to,
    placed: input.placed,
    staff: input.staff,
    cfg: input.cfg,
    shadowBoundsMap: input.shadowBoundsMap
  })
  if (fromBounds === undefined || toBounds === undefined) {
    return input.state
  }

  const fromKey = String(input.edge.from)
  const toKey = String(input.edge.to)
  const fromIndex = input.state.seenOut[fromKey] ?? 0
  const toIndex = input.state.seenIn[toKey] ?? 0
  const fromSpread = getSpreadOffset(fromIndex, input.totals.outTotals[fromKey] ?? 1, input.cfg)
  const toSpread = getSpreadOffset(toIndex, input.totals.inTotals[toKey] ?? 1, input.cfg)
  const points = getDottedRoute({ fromBounds, toBounds, cfg: input.cfg, fromSpread, toSpread })
  return renderDottedEdgeElements({
    state: input.state,
    edge: input.edge,
    points,
    cfg: input.cfg,
    safeCfg: input.safeCfg
  })
}

/** Renders all dotted edges and returns elements with merged bounds. */
export const renderDottedEdges = (
  input: RenderDottedEdgesInput
): { readonly edgeElements: readonly string[]; readonly bounds: RenderBounds } => {
  const totals = buildDottedEdgeTotals(input.dottedEdges)
  const reduced = input.dottedEdges.reduce(
    (state: DottedRenderState, edge: DottedEdge): DottedRenderState =>
      reduceOneDottedEdge({
        state,
        edge,
        totals,
        placed: input.placed,
        staff: input.staff,
        cfg: input.cfg,
        safeCfg: input.safeCfg,
        shadowBoundsMap: input.shadowBoundsMap
      }),
    {
      edgeElements: [],
      bounds: emptyRenderBounds(),
      seenOut: {},
      seenIn: {}
    }
  )

  return {
    edgeElements: reduced.edgeElements,
    bounds: reduced.bounds
  }
}
