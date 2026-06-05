/**
 * @module layout/route-edges
 *
 * Edge routing: generates orthogonal waypoint paths for tree edges.
 *
 * Computes entry/exit ports on parent and child nodes, then produces
 * axis-aligned waypoint sequences (L-shaped or straight paths) suitable for SVG rendering.
 * Handles edge cases: same x/y coordinates, minor vertical misalignments.
 *
 * @packageDocumentation
 */

import { fromNullable, isNone } from '@tsfpp/prelude'
import type { EdgeRoute, EdgeRoutePoint, IndexedTree, PlacedStaff, PlacedTree, RenderConfig } from './types'
import type { ResolvedStyleMap } from '../style/dsl'
import type { ShadowNode } from '../types/org-tree'

/**
 * Diagnostic emitted when an expected node position is absent during edge routing.
 * Indicates a layout/tree inconsistency rather than a user error.
 */
export type RouteEdgesDiagnostic = {
  readonly kind: 'missing_parent_position' | 'missing_child_position'
  readonly parentId: string
  readonly childId?: string
}

/**
 * Result of edge routing: the computed waypoint paths together with any
 * diagnostics for nodes whose positions were missing in the placement map.
 */
export type RouteEdgesResult = {
  readonly routes: readonly EdgeRoute[]
  readonly diagnostics: readonly RouteEdgesDiagnostic[]
}

const isHangingHint = (hint: string | undefined): hint is 'hanging' | 'hanging-left' | 'hanging-right' | 'hanging-both' =>
  hint === 'hanging' || hint === 'hanging-left' || hint === 'hanging-right' || hint === 'hanging-both'

type ToPortInput = {
  readonly x: number
  readonly y: number
  readonly cfg: RenderConfig
}

type RoutePort = {
  readonly cx: number
  readonly top: number
  readonly bottom: number
}

type MakeRouteInput = {
  readonly fromId: string
  readonly toId: string
  readonly parentPort: { readonly cx: number; readonly bottom: number }
  readonly childPort: { readonly cx: number; readonly top: number }
  readonly cfg: RenderConfig
  readonly obstacleBounds: readonly RouteNodeBounds[]
  readonly forcedChannelY: number | undefined
}

type MakeHangingRouteInput = {
  readonly fromId: string
  readonly toId: string
  readonly parentPos: { readonly x: number; readonly y: number }
  readonly childPos: { readonly x: number; readonly y: number }
  readonly nodeSize: number
}

type RouteEdgesInput = {
  readonly tree: IndexedTree
  readonly placed: PlacedTree
  readonly staff?: PlacedStaff
  readonly shadowNodes?: readonly ShadowNode[]
  readonly cfg: RenderConfig
  readonly styleMap: ResolvedStyleMap | undefined
}

type RouteNodeBounds = {
  readonly id: string
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
}

const toPort = (input: ToPortInput): RoutePort => ({
  cx: input.x + input.cfg.nodeSize / 2,
  top: input.y,
  bottom: input.y + input.cfg.nodeSize
})

const midpoint = (a: number, b: number): number => a + (b - a) / 2

const almostEqual = (a: number, b: number): boolean => Math.abs(a - b) < 0.000001

const toRouteNodeBounds = (input: {
  readonly id: string
  readonly point: { readonly x: number; readonly y: number }
  readonly cfg: RenderConfig
}): RouteNodeBounds => ({
  id: input.id,
  minX: input.point.x,
  maxX: input.point.x + input.cfg.nodeSize,
  minY: input.point.y,
  maxY: input.point.y + input.cfg.nodeSize
})

const toStaffRouteBounds = (input: {
  readonly id: string
  readonly point: { readonly x: number; readonly y: number }
  readonly cfg: RenderConfig
}): RouteNodeBounds => ({
  id: input.id,
  minX: input.point.x,
  maxX: input.point.x + input.cfg.staffSize,
  minY: input.point.y,
  maxY: input.point.y + input.cfg.staffSize
})

const toHostedStaffShadowBounds = (input: {
  readonly shadow: ShadowNode
  readonly tree: IndexedTree
  readonly placed: PlacedTree
  readonly cfg: RenderConfig
}): RouteNodeBounds | undefined => {
  if (input.shadow.type !== 'staff') {
    return undefined
  }

  const hostOption = fromNullable(input.shadow.host)
  if (isNone(hostOption)) {
    return undefined
  }

  const hostNodeOption = fromNullable(input.tree.nodes.get(String(hostOption.value)))
  const hostPosOption = fromNullable(input.placed.positions.get(String(hostOption.value)))
  if (isNone(hostNodeOption) || isNone(hostPosOption)) {
    return undefined
  }

  const hostNode = hostNodeOption.value
  const hostPos = hostPosOption.value
  const childTopYs = hostNode.children
    .map((childId) => input.placed.positions.get(childId)?.y)
    .filter((childY): childY is number => childY !== undefined)
  const parentBottomY = hostPos.y + input.cfg.nodeSize
  const nearestChildTopY = childTopYs.reduce<number | undefined>(
    (currentMin, childY) => currentMin === undefined || childY < currentMin ? childY : currentMin,
    undefined
  )
  const anchorY = nearestChildTopY !== undefined && nearestChildTopY > parentBottomY
    ? (parentBottomY + nearestChildTopY) / 2
    : hostPos.y + input.cfg.nodeSize / 2
  const side: 'left' | 'right' = input.shadow.side === 'left' ? 'left' : 'right'
  const direction = side === 'left' ? -1 : 1
  const baseOffset = (input.cfg.nodeSize + input.cfg.staffSize) / 2 + 0.05
  const parentCenterX = hostPos.x + input.cfg.nodeSize / 2
  const x = parentCenterX + direction * baseOffset - input.cfg.staffSize / 2
  const y = anchorY - input.cfg.staffSize / 2
  return {
    id: String(input.shadow.id),
    minX: x,
    maxX: x + input.cfg.staffSize,
    minY: y,
    maxY: y + input.cfg.staffSize
  }
}

const overlapsHorizontally = (x1: number, x2: number, bounds: RouteNodeBounds): boolean => {
  const minX = Math.min(x1, x2)
  const maxX = Math.max(x1, x2)
  return Math.max(minX, bounds.minX) < Math.min(maxX, bounds.maxX)
}

const isHorizontalSegmentBlocked = (
  y: number,
  x1: number,
  x2: number,
  obstacleBounds: readonly RouteNodeBounds[]
): boolean => obstacleBounds.some((bounds) => overlapsHorizontally(x1, x2, bounds) && y > bounds.minY && y < bounds.maxY)

const chooseChannelY = (input: {
  readonly start: EdgeRoutePoint
  readonly end: EdgeRoutePoint
  readonly cfg: RenderConfig
  readonly obstacleBounds: readonly RouteNodeBounds[]
}): number => {
  const minInterior = Math.min(input.start.y, input.end.y) + 0.05
  const maxInterior = Math.max(input.start.y, input.end.y) - 0.05

  if (minInterior >= maxInterior) {
    return midpoint(input.start.y, input.end.y)
  }

  const clampToInterior = (value: number): number => Math.min(maxInterior, Math.max(minInterior, value))
  const mid = midpoint(input.start.y, input.end.y)
  const clearance = Math.max(0.2, input.cfg.nodeSize * 0.35)
  const candidates = [
    clampToInterior(mid),
    clampToInterior(input.end.y - clearance),
    clampToInterior(input.start.y + clearance),
    maxInterior,
    minInterior
  ].filter((value, index, values) => values.findIndex((candidate) => almostEqual(candidate, value)) === index)

  const clearChannel = candidates.find((candidateY) => !isHorizontalSegmentBlocked(candidateY, input.start.x, input.end.x, input.obstacleBounds))
  return clearChannel === undefined ? clampToInterior(mid) : clearChannel
}

const chooseSharedChannelY = (input: {
  readonly start: EdgeRoutePoint
  readonly end: EdgeRoutePoint
  readonly cfg: RenderConfig
  readonly obstacleBounds: readonly RouteNodeBounds[]
}): number => {
  const minInterior = Math.min(input.start.y, input.end.y) + 0.05
  const maxInterior = Math.max(input.start.y, input.end.y) - 0.05

  if (minInterior >= maxInterior) {
    return midpoint(input.start.y, input.end.y)
  }

  const clampToInterior = (value: number): number => Math.min(maxInterior, Math.max(minInterior, value))
  const mid = midpoint(input.start.y, input.end.y)
  const clearance = Math.max(0.2, input.cfg.nodeSize * 0.35)
  const candidates = [
    clampToInterior(input.end.y - clearance),
    clampToInterior(mid),
    clampToInterior(input.start.y + clearance),
    maxInterior,
    minInterior
  ].filter((value, index, values) => values.findIndex((candidate) => almostEqual(candidate, value)) === index)

  const clearChannel = candidates.find((candidateY) => !isHorizontalSegmentBlocked(candidateY, input.start.x, input.end.x, input.obstacleBounds))
  return clearChannel === undefined ? clampToInterior(mid) : clearChannel
}

const makeRoute = (input: MakeRouteInput): EdgeRoute => {
  const start: EdgeRoutePoint = { x: input.parentPort.cx, y: input.parentPort.bottom }
  const end: EdgeRoutePoint = { x: input.childPort.cx, y: input.childPort.top }
  const clearance = 0.2

  const forcedChannelY = fromNullable(input.forcedChannelY)
  if (!isNone(forcedChannelY) && !almostEqual(start.x, end.x)) {
    const minInterior = Math.min(start.y, end.y) + 0.05
    const maxInterior = Math.max(start.y, end.y) - 0.05
    const channelY = minInterior >= maxInterior
      ? forcedChannelY.value
      : Math.min(maxInterior, Math.max(minInterior, forcedChannelY.value))
    return {
      fromId: input.fromId,
      toId: input.toId,
      points: [
        start,
        { x: start.x, y: channelY },
        { x: end.x, y: channelY },
        end
      ]
    }
  }

  if (almostEqual(start.y, end.y)) {
    if (almostEqual(start.x, end.x)) {
      return {
        fromId: input.fromId,
        toId: input.toId,
        points: [start, { x: end.x, y: end.y + clearance }]
      }
    }

    return {
      fromId: input.fromId,
      toId: input.toId,
      points: [start, end]
    }
  }

  if (almostEqual(start.x, end.x)) {
    return {
      fromId: input.fromId,
      toId: input.toId,
      points: [start, end]
    }
  }

  const channelY = chooseChannelY({
    start,
    end,
    cfg: input.cfg,
    obstacleBounds: input.obstacleBounds
  })
  return {
    fromId: input.fromId,
    toId: input.toId,
    points: [
      start,
      { x: start.x, y: channelY },
      { x: end.x, y: channelY },
      end
    ]
  }
}

const makeHangingRoute = (input: MakeHangingRouteInput): EdgeRoute => {
  const start: EdgeRoutePoint = {
    x: input.parentPos.x + input.nodeSize / 2,
    y: input.parentPos.y + input.nodeSize
  }

  const childIsRight = input.childPos.x > input.parentPos.x
  const childIsLeft = input.childPos.x < input.parentPos.x

  const end: EdgeRoutePoint = {
    x: childIsRight ? input.childPos.x : childIsLeft ? input.childPos.x + input.nodeSize : input.childPos.x + input.nodeSize / 2,
    y: input.childPos.y + input.nodeSize / 2
  }

  if (almostEqual(start.x, end.x) || almostEqual(start.y, end.y)) {
    return {
      fromId: input.fromId,
      toId: input.toId,
      points: [start, end]
    }
  }

  return {
    fromId: input.fromId,
    toId: input.toId,
    points: [
      start,
      { x: start.x, y: end.y },
      end
    ]
  }
}

type RouteBuilderInput = {
  readonly fromId: string
  readonly toId: string
  readonly parentPos: { readonly x: number; readonly y: number }
  readonly childPos: { readonly x: number; readonly y: number }
  readonly parentPort: { readonly cx: number; readonly bottom: number }
  readonly cfg: RenderConfig
  readonly obstacleBounds: readonly RouteNodeBounds[]
  readonly sharedChannelY: number | undefined
}

const routeByDefault = (input: RouteBuilderInput): EdgeRoute =>
  makeRoute({
    fromId: input.fromId,
    toId: input.toId,
    parentPort: input.parentPort,
    childPort: toPort({ x: input.childPos.x, y: input.childPos.y, cfg: input.cfg }),
    cfg: input.cfg,
    obstacleBounds: input.obstacleBounds,
    forcedChannelY: input.sharedChannelY
  })

const routeByHanging = (input: RouteBuilderInput): EdgeRoute =>
  makeHangingRoute({
    fromId: input.fromId,
    toId: input.toId,
    parentPos: input.parentPos,
    childPos: input.childPos,
    nodeSize: input.cfg.nodeSize
  })

const routeStrategy: Readonly<Record<'default' | 'hanging', (input: RouteBuilderInput) => EdgeRoute>> = {
  default: routeByDefault,
  hanging: routeByHanging
}

const hasStaffSides = (node: IndexedTree['nodes'] extends ReadonlyMap<string, infer N> ? N : never): boolean =>
  node.staffLeft.length > 0 || node.staffRight.length > 0

const hasHostedStaffShadow = (nodeId: string, staffShadowHostIds: ReadonlyArray<string>): boolean =>
  staffShadowHostIds.includes(nodeId)

const toSharedDefaultChannelY = (input: {
  readonly parent: IndexedTree['nodes'] extends ReadonlyMap<string, infer N> ? N : never
  readonly parentPort: RoutePort
  readonly placed: PlacedTree
  readonly cfg: RenderConfig
  readonly allNodeBounds: readonly RouteNodeBounds[]
  readonly staffShadowHostIds: ReadonlyArray<string>
}): number | undefined => {
  const hasStaffContext = hasStaffSides(input.parent) || hasHostedStaffShadow(input.parent.id, input.staffShadowHostIds)
  if (!hasStaffContext || isHangingHint(input.parent.layoutHint)) {
    return undefined
  }

  const placedChildren = input.parent.children
    .map((childId) => {
      const childPosOption = fromNullable(input.placed.positions.get(childId))
      return isNone(childPosOption) ? undefined : { id: childId, pos: childPosOption.value }
    })
    .filter((child): child is { readonly id: string; readonly pos: { readonly x: number; readonly y: number } } => child !== undefined)

  if (placedChildren.length < 2) {
    return undefined
  }

  const childCenters = placedChildren.map((child) => child.pos.x + input.cfg.nodeSize / 2)
  const minX = childCenters.reduce((currentMin, x) => Math.min(currentMin, x), input.parentPort.cx)
  const maxX = childCenters.reduce((currentMax, x) => Math.max(currentMax, x), input.parentPort.cx)
  const maxTopY = placedChildren
    .map((child) => child.pos.y)
    .reduce((currentMax, y) => Math.max(currentMax, y), Number.NEGATIVE_INFINITY)

  const childIds = placedChildren.map((child) => child.id)
  const obstacleBounds = input.allNodeBounds
    .filter((bounds) => bounds.id !== input.parent.id)
    .filter((bounds) => !childIds.includes(bounds.id))

  return chooseSharedChannelY({
    start: { x: minX, y: input.parentPort.bottom },
    end: { x: maxX, y: maxTopY },
    cfg: input.cfg,
    obstacleBounds
  })
}

/**
 * Routes direct tree edges (parent→child) into orthogonal waypoint paths
 * in grid coordinates. Returned points are immutable and ready for SVG scaling.
 */
export const routeEdges = (
  input: RouteEdgesInput
): readonly EdgeRoute[] => routeEdgesWithDiagnostics(input).routes

/**
 * Route all tree edges and collect diagnostics for missing node positions.
 *
 * Unlike `routeEdges`, this variant does not silently drop unreachable nodes;
 * it records a `RouteEdgesDiagnostic` for every position lookup that fails,
 * enabling callers to surface layout inconsistencies.
 *
 * @param tree Indexed tree whose node adjacency list drives routing.
 * @param placed Buchheim placement map (grid coordinates).
 * @param cfg Render configuration (node size, column width, row height).
 * @param styleMap Per-node resolved styles, used to apply edge style overrides.
 * @returns `RouteEdgesResult` with all computed routes and any diagnostics.
 */
export const routeEdgesWithDiagnostics = (
  input: RouteEdgesInput
): RouteEdgesResult => {
  type Acc = { readonly routes: readonly EdgeRoute[]; readonly diagnostics: readonly RouteEdgesDiagnostic[] }
  const placedNodeBounds = Array.from(input.placed.positions.entries())
    .map(([id, point]) => toRouteNodeBounds({ id, point, cfg: input.cfg }))
  const staffBounds = input.staff?.staff.map((staffNode) =>
    toStaffRouteBounds({
      id: staffNode.id,
      point: { x: staffNode.x, y: staffNode.y },
      cfg: input.cfg
    })
  ) ?? []
  const staffShadowBounds = input.shadowNodes
    ?.flatMap((shadow) => {
      const bounds = toHostedStaffShadowBounds({ shadow, tree: input.tree, placed: input.placed, cfg: input.cfg })
      return bounds === undefined ? [] : [bounds]
    })
    ?? []
  const staffShadowHostIds = input.shadowNodes
    ?.filter((shadow) => shadow.type === 'staff')
    .flatMap((shadow) => {
      const hostOption = fromNullable(shadow.host)
      return isNone(hostOption) ? [] : [String(hostOption.value)]
    })
    .reduce<ReadonlyArray<string>>((acc, hostId) => (acc.includes(hostId) ? acc : [...acc, hostId]), [])
    ?? []
  const allNodeBounds = [...placedNodeBounds, ...staffBounds, ...staffShadowBounds]

  return [...input.tree.nodes.values()].reduce<Acc>((acc, parent) => {
    const parentPosOption = fromNullable(input.placed.positions.get(parent.id))
    if (isNone(parentPosOption)) {
      return { ...acc, diagnostics: [...acc.diagnostics, { kind: 'missing_parent_position', parentId: parent.id }] }
    }
    const parentPos = parentPosOption.value

    const parentPort = toPort({ x: parentPos.x, y: parentPos.y, cfg: input.cfg })
    const sharedChannelY = toSharedDefaultChannelY({
      parent,
      parentPort,
      placed: input.placed,
      cfg: input.cfg,
      allNodeBounds,
      staffShadowHostIds
    })
    return parent.children.reduce<Acc>((childAcc, childId) => {
      const childPosOption = fromNullable(input.placed.positions.get(childId))
      if (isNone(childPosOption)) {
        return { ...childAcc, diagnostics: [...childAcc.diagnostics, { kind: 'missing_child_position', parentId: parent.id, childId }] }
      }
      const childPos = childPosOption.value
      const obstacleBounds = allNodeBounds.filter((bounds) => bounds.id !== parent.id && bounds.id !== childId)

      const edgeStyleOption = fromNullable(input.styleMap?.get(childId)?.edgeStyle)
      const edgeWidthOption = fromNullable(input.styleMap?.get(childId)?.edgeWidth)
      const routeKind: 'default' | 'hanging' = isHangingHint(parent.layoutHint) ? 'hanging' : 'default'
      const route = routeStrategy[routeKind]({
        fromId: parent.id,
        toId: childId,
        parentPos,
        childPos,
        parentPort,
        cfg: input.cfg,
        obstacleBounds,
        sharedChannelY: routeKind === 'default' ? sharedChannelY : undefined
      })
      const fullRoute = {
        ...route,
        ...(!isNone(edgeStyleOption) ? { edgeStyle: edgeStyleOption.value } : {}),
        ...(!isNone(edgeWidthOption) ? { edgeWidth: edgeWidthOption.value } : {})
      }
      return { ...childAcc, routes: [...childAcc.routes, fullRoute] }
    }, acc)
  }, { routes: [], diagnostics: [] })
}
