/**
 * @module types/layout
 *
 * Layout types: positioned nodes, staff offset data, and bounds information.
 *
 * Used throughout the layout pipeline (Buchheim, staff placement, edge routing, rendering)
 * to track coordinate transformations and spatial relationships.
 *
 * @packageDocumentation
 */

import type { NodeId } from './branded'
import type { HrMetadata, OrgNode } from './org-tree'

/** Staff node placement relative to an owning manager node. */
export type StaffOffset = {
  readonly id: NodeId
  readonly side: 'left' | 'right'
  readonly x: number
  readonly y: number
}

/** Positioned org node enriched with render dimensions and hierarchical children. */
export type PositionedNode = {
  readonly id: NodeId
  readonly kind: OrgNode['kind']
  readonly meta?: HrMetadata
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly depth: number
  readonly children: readonly PositionedNode[]
  readonly staff: readonly StaffOffset[]
}

/** One routed edge waypoint in grid coordinates. */
export type RoutedPoint = {
  readonly x: number
  readonly y: number
}

/** Routed connection between two nodes with style and optional label. */
export type RoutedEdge = {
  readonly from: NodeId
  readonly to: NodeId
  readonly points: readonly RoutedPoint[]
  readonly style: 'solid' | 'dashed' | 'dotted'
  readonly label?: string
}

/** Width/height envelope for a fully laid out tree projection. */
export type LayoutBounds = {
  readonly w: number
  readonly h: number
}

/** Complete layout output containing root tree, edges, and computed bounds. */
export type LayoutTree = {
  readonly root: PositionedNode
  readonly edges: readonly RoutedEdge[]
  readonly dottedEdges: readonly RoutedEdge[]
  readonly bounds: LayoutBounds
}
