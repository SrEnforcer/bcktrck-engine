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
import type { EdgeRoute, EdgeRoutePoint, IndexedTree, PlacedTree, RenderConfig } from './types'
import type { ResolvedStyleMap } from '../style/dsl'

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
  readonly cfg: RenderConfig
  readonly styleMap: ResolvedStyleMap | undefined
}

const toPort = (input: ToPortInput): RoutePort => ({
  cx: input.x + input.cfg.nodeSize / 2,
  top: input.y,
  bottom: input.y + input.cfg.nodeSize
})

const midpoint = (a: number, b: number): number => a + (b - a) / 2

const almostEqual = (a: number, b: number): boolean => Math.abs(a - b) < 0.000001

const makeRoute = (input: MakeRouteInput): EdgeRoute => {
  const start: EdgeRoutePoint = { x: input.parentPort.cx, y: input.parentPort.bottom }
  const end: EdgeRoutePoint = { x: input.childPort.cx, y: input.childPort.top }
  const clearance = 0.2

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

  const channelY = midpoint(start.y, end.y)
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
}

const routeByDefault = (input: RouteBuilderInput): EdgeRoute =>
  makeRoute({
    fromId: input.fromId,
    toId: input.toId,
    parentPort: input.parentPort,
    childPort: toPort({ x: input.childPos.x, y: input.childPos.y, cfg: input.cfg })
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

  return [...input.tree.nodes.values()].reduce<Acc>((acc, parent) => {
    const parentPosOption = fromNullable(input.placed.positions.get(parent.id))
    if (isNone(parentPosOption)) {
      return { ...acc, diagnostics: [...acc.diagnostics, { kind: 'missing_parent_position', parentId: parent.id }] }
    }
    const parentPos = parentPosOption.value

    const parentPort = toPort({ x: parentPos.x, y: parentPos.y, cfg: input.cfg })
    return parent.children.reduce<Acc>((childAcc, childId) => {
      const childPosOption = fromNullable(input.placed.positions.get(childId))
      if (isNone(childPosOption)) {
        return { ...childAcc, diagnostics: [...childAcc.diagnostics, { kind: 'missing_child_position', parentId: parent.id, childId }] }
      }
      const childPos = childPosOption.value

      const edgeStyleOption = fromNullable(input.styleMap?.get(childId)?.edgeStyle)
      const edgeWidthOption = fromNullable(input.styleMap?.get(childId)?.edgeWidth)
      const routeKind: 'default' | 'hanging' = isHangingHint(parent.layoutHint) ? 'hanging' : 'default'
      const route = routeStrategy[routeKind]({ fromId: parent.id, toId: childId, parentPos, childPos, parentPort, cfg: input.cfg })
      const fullRoute = {
        ...route,
        ...(!isNone(edgeStyleOption) ? { edgeStyle: edgeStyleOption.value } : {}),
        ...(!isNone(edgeWidthOption) ? { edgeWidth: edgeWidthOption.value } : {})
      }
      return { ...childAcc, routes: [...childAcc.routes, fullRoute] }
    }, acc)
  }, { routes: [], diagnostics: [] })
}
