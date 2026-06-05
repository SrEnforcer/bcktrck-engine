/**
 * @module layout/render-svg/dotted
 *
 * Rendering helper module for SVG projection internals.
 *
 * @packageDocumentation
 */

import type { DottedEdge } from '../../types/org-tree'
import { fromNullable, getOrElse, isNone, isSome, mapO, pipe } from '@tsfpp/prelude'
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

type DottedGapRouteInput = {
  readonly start: SvgPoint
  readonly end: SvgPoint
  readonly gapMidY: number
  readonly cfg: RenderConfig
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
  readonly obstacles: readonly NodeBounds[]
}

type DottedGapMidpointInput = {
  readonly fromBounds: NodeBounds
  readonly toBounds: NodeBounds
  readonly start: SvgPoint
  readonly end: SvgPoint
}

type DottedObstacleBoundsInput = {
  readonly edge: DottedEdge
  readonly placed: PlacedTree
  readonly staff: PlacedStaff
  readonly cfg: RenderConfig
  readonly shadowBoundsMap: ReadonlyMap<string, NodeBounds>
}

type SameRowDetourInput = {
  readonly start: SvgPoint
  readonly end: SvgPoint
  readonly fromBounds: NodeBounds
  readonly toBounds: NodeBounds
  readonly obstacles: readonly NodeBounds[]
  readonly routeMargin: number
}

type DottedSideEndpointsInput = {
  readonly fromBounds: NodeBounds
  readonly toBounds: NodeBounds
  readonly fromSpread: number
  readonly toSpread: number
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

const numberOrDefault = (value: number | undefined, fallback: number): number =>
  pipe(
    fromNullable(value),
    getOrElse(() => fallback)
  )

const incrementCount = (counts: DottedEdgeCounts, key: string): DottedEdgeCounts => ({
  ...counts,
  [key]: numberOrDefault(counts[key], 0) + 1
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
  const p1Option = fromNullable(points[1])
  const p2Option = fromNullable(points[2])
  if (points.length >= 4 && isSome(p1Option) && isSome(p2Option) && Math.abs(p1Option.value.y - p2Option.value.y) < 0.01) {
    return {
      x: (p1Option.value.x + p2Option.value.x) / 2,
      y: p1Option.value.y
    }
  }

  const first = pipe(
    fromNullable(points[0]),
    getOrElse(() => ({ x: 0, y: 0 }))
  )
  const last = pipe(
    fromNullable(points[points.length - 1]),
    getOrElse(() => first)
  )
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
  const dottedLabelElements = pipe(
    fromNullable(input.edge.label),
    mapO((label) => label.length > 0
      ? [dottedLabelElement({ label, points: input.points, cfg: input.cfg, safeCfg: input.safeCfg })]
      : []
    ),
    getOrElse<readonly string[]>(() => [])
  )
  const nextEdgeElements = [
    ...input.state.edgeElements,
    dottedEdgeElement(input.points, input.safeCfg),
    ...dottedLabelElements
  ]

  const start = fromNullable(input.points[0])
  const end = fromNullable(input.points[input.points.length - 1])
  if (isNone(start) || isNone(end)) {
    return bumpDottedSeen({
      ...input.state,
      edgeElements: nextEdgeElements
    }, fromKey, toKey)
  }

  return bumpDottedSeen({
    edgeElements: nextEdgeElements,
    bounds: expandBoundsWithPoints(
      expandBoundsWithPoints(input.state.bounds, [start.value, end.value]),
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

const getSideDottedEndpoints = (input: DottedSideEndpointsInput): { readonly start: SvgPoint; readonly end: SvgPoint } => {
  const fromIsLeftOfTo = input.fromBounds.cx <= input.toBounds.cx
  const startYMax = Math.max(0, input.fromBounds.h / 2 - 6)
  const endYMax = Math.max(0, input.toBounds.h / 2 - 6)
  const startX = fromIsLeftOfTo
    ? input.fromBounds.cx + input.fromBounds.w / 2
    : input.fromBounds.cx - input.fromBounds.w / 2
  const endX = fromIsLeftOfTo
    ? input.toBounds.cx - input.toBounds.w / 2
    : input.toBounds.cx + input.toBounds.w / 2

  return {
    start: {
      x: startX,
      y: input.fromBounds.cy + clamp(input.fromSpread, -startYMax, startYMax)
    },
    end: {
      x: endX,
      y: input.toBounds.cy + clamp(input.toSpread, -endYMax, endYMax)
    }
  }
}

const getDottedGapRoute = (input: DottedGapRouteInput): readonly SvgPoint[] => {
  if (input.sameX && !input.sameRow) {
    return getRightDetourRoute(input.start, input.end, input.cfg)
  }

  const midRoute: readonly SvgPoint[] = [
    input.start,
    { x: input.start.x, y: input.gapMidY },
    { x: input.end.x, y: input.gapMidY },
    input.end
  ]
  return input.sameY && !input.sameRow ? midRoute : midRoute
}

const isNearlySameColumn = (input: DottedRouteInput): boolean => {
  const dx = Math.abs(input.toBounds.cx - input.fromBounds.cx)
  const threshold = Math.max(8, input.cfg.colWidth * 0.25)
  return dx <= threshold
}

const getRightDetourRoute = (start: SvgPoint, end: SvgPoint, cfg: RenderConfig): readonly SvgPoint[] => {
  const detour = Math.max(cfg.colWidth * 0.75, cfg.fontSize * 2)
  const pivotX = Math.max(start.x, end.x) + detour
  return [
    start,
    { x: pivotX, y: start.y },
    { x: pivotX, y: end.y },
    end
  ]
}

const boundsXSpan = (bounds: NodeBounds): { readonly minX: number; readonly maxX: number } => ({
  minX: bounds.cx - bounds.w / 2,
  maxX: bounds.cx + bounds.w / 2
})

const boundsYSpan = (bounds: NodeBounds): { readonly minY: number; readonly maxY: number } => ({
  minY: bounds.cy - bounds.h / 2,
  maxY: bounds.cy + bounds.h / 2
})

const horizontalSegmentBlocked = (y: number, x1: number, x2: number, obstacles: readonly NodeBounds[]): boolean => {
  const minX = Math.min(x1, x2)
  const maxX = Math.max(x1, x2)

  return obstacles.some((bounds) => {
    const xSpan = boundsXSpan(bounds)
    const ySpan = boundsYSpan(bounds)
    const overlapsX = Math.max(minX, xSpan.minX) < Math.min(maxX, xSpan.maxX)
    const intersectsY = y > ySpan.minY && y < ySpan.maxY
    return overlapsX && intersectsY
  })
}

const toNodeBoundsFromPlaced = (
  id: string,
  point: { readonly x: number; readonly y: number },
  cfg: RenderConfig
): { readonly id: string; readonly bounds: NodeBounds } => {
  const w = cfg.nodeSize * cfg.colWidth
  const h = cfg.nodeSize * cfg.rowHeight
  const x = point.x * cfg.colWidth
  const y = point.y * cfg.rowHeight
  return {
    id,
    bounds: {
      cx: x + w / 2,
      cy: y + h / 2,
      w,
      h
    }
  }
}

const toNodeBoundsFromStaff = (
  staffPosition: PlacedStaff['staff'][number],
  cfg: RenderConfig
): { readonly id: string; readonly bounds: NodeBounds } => {
  const w = cfg.staffSize * cfg.colWidth
  const h = cfg.staffSize * cfg.rowHeight
  const x = staffPosition.x * cfg.colWidth
  const y = staffPosition.y * cfg.rowHeight
  return {
    id: staffPosition.id,
    bounds: {
      cx: x + w / 2,
      cy: y + h / 2,
      w,
      h
    }
  }
}

const obstacleBoundsForEdge = (input: DottedObstacleBoundsInput): readonly NodeBounds[] => {
  const fromId = String(input.edge.from)
  const toId = String(input.edge.to)

  const placedBounds = Array.from(input.placed.positions.entries())
    .map(([id, point]) => toNodeBoundsFromPlaced(id, point, input.cfg))

  const staffBounds = input.staff.staff
    .map((staffPosition) => toNodeBoundsFromStaff(staffPosition, input.cfg))

  const shadowBounds = Array.from(input.shadowBoundsMap.entries())
    .map(([id, bounds]) => ({ id, bounds }))

  return [...placedBounds, ...staffBounds, ...shadowBounds]
    .filter((entry) => entry.id !== fromId && entry.id !== toId)
    .map((entry) => entry.bounds)
}

const sameRowDetourRoute = (input: SameRowDetourInput): readonly SvgPoint[] => {
  const blocked = horizontalSegmentBlocked(input.start.y, input.start.x, input.end.x, input.obstacles)
  if (!blocked) {
    return [input.start, input.end]
  }

  const fromYSpan = boundsYSpan(input.fromBounds)
  const toYSpan = boundsYSpan(input.toBounds)

  const aboveCandidate = Math.min(fromYSpan.minY, toYSpan.minY) - input.routeMargin
  const belowCandidate = Math.max(fromYSpan.maxY, toYSpan.maxY) + input.routeMargin

  const blockersInCorridor = input.obstacles.filter((bounds) => {
    const xSpan = boundsXSpan(bounds)
    const minX = Math.min(input.start.x, input.end.x)
    const maxX = Math.max(input.start.x, input.end.x)
    return Math.max(minX, xSpan.minX) < Math.min(maxX, xSpan.maxX)
  })

  const blockerTop = blockersInCorridor.reduce((acc, bounds) => Math.min(acc, boundsYSpan(bounds).minY), Number.POSITIVE_INFINITY)
  const blockerBottom = blockersInCorridor.reduce((acc, bounds) => Math.max(acc, boundsYSpan(bounds).maxY), Number.NEGATIVE_INFINITY)

  const channelAbove = Number.isFinite(blockerTop) ? Math.min(aboveCandidate, blockerTop - input.routeMargin) : aboveCandidate
  const channelBelow = Number.isFinite(blockerBottom) ? Math.max(belowCandidate, blockerBottom + input.routeMargin) : belowCandidate

  const chooseAbove = Math.abs(channelAbove - input.start.y) <= Math.abs(channelBelow - input.start.y)
  const channelY = chooseAbove ? channelAbove : channelBelow

  return [
    input.start,
    { x: input.start.x, y: channelY },
    { x: input.end.x, y: channelY },
    input.end
  ]
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
  const endpoints = getSideDottedEndpoints({
    fromBounds: input.fromBounds,
    toBounds: input.toBounds,
    fromSpread: input.fromSpread,
    toSpread: input.toSpread
  })
  const start = endpoints.start
  const end = endpoints.end

  if (isNearlySameColumn(input)) {
    return getRightDetourRoute(start, end, input.cfg)
  }

  const sameRow = Math.abs(input.fromBounds.cy - input.toBounds.cy) < 0.01
  if (sameRow) {
    return sameRowDetourRoute({
      start,
      end,
      fromBounds: input.fromBounds,
      toBounds: input.toBounds,
      obstacles: input.obstacles,
      routeMargin
    })
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
    gapMidY: gapMidY - routeMargin * 0.1,
    cfg: input.cfg,
    sameRow,
    sameX: Math.abs(start.x - end.x) < 0.01,
    sameY: Math.abs(start.y - end.y) < 0.01
  })
}

const getDottedRoutePointsForEdge = (input: {
  readonly edge: DottedEdge
  readonly state: DottedRenderState
  readonly totals: { readonly outTotals: DottedEdgeCounts; readonly inTotals: DottedEdgeCounts }
  readonly cfg: RenderConfig
  readonly fromBounds: NodeBounds
  readonly toBounds: NodeBounds
  readonly obstacles: readonly NodeBounds[]
}): readonly SvgPoint[] => {
  const fromKey = String(input.edge.from)
  const toKey = String(input.edge.to)
  const fromIndex = numberOrDefault(input.state.seenOut[fromKey], 0)
  const toIndex = numberOrDefault(input.state.seenIn[toKey], 0)
  const fromTotal = numberOrDefault(input.totals.outTotals[fromKey], 1)
  const toTotal = numberOrDefault(input.totals.inTotals[toKey], 1)
  const fromSpread = getSpreadOffset(fromIndex, fromTotal, input.cfg)
  const toSpread = getSpreadOffset(toIndex, toTotal, input.cfg)
  return getDottedRoute({
    fromBounds: input.fromBounds,
    toBounds: input.toBounds,
    cfg: input.cfg,
    fromSpread,
    toSpread,
    obstacles: input.obstacles
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
  const fromBoundsOption = fromNullable(fromBounds)
  const toBoundsOption = fromNullable(toBounds)
  if (isNone(fromBoundsOption) || isNone(toBoundsOption)) {
    return input.state
  }

  const points = getDottedRoutePointsForEdge({
    edge: input.edge,
    state: input.state,
    totals: input.totals,
    cfg: input.cfg,
    fromBounds: fromBoundsOption.value,
    toBounds: toBoundsOption.value,
    obstacles: obstacleBoundsForEdge({
      edge: input.edge,
      placed: input.placed,
      staff: input.staff,
      cfg: input.cfg,
      shadowBoundsMap: input.shadowBoundsMap
    })
  })
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
