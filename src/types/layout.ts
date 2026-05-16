/**
 * Layout types: positioned nodes, staff offset data, and bounds information.
 *
 * Used throughout the layout pipeline (Buchheim, staff placement, edge routing, rendering)
 * to track coordinate transformations and spatial relationships.
 */

import type { NodeId } from './branded'
import type { HrMetadata, OrgNode } from './org-tree'

export type StaffOffset = {
  readonly id: NodeId
  readonly side: 'left' | 'right'
  readonly x: number
  readonly y: number
}

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

export type RoutedPoint = {
  readonly x: number
  readonly y: number
}

export type RoutedEdge = {
  readonly from: NodeId
  readonly to: NodeId
  readonly points: readonly RoutedPoint[]
  readonly style: 'solid' | 'dashed' | 'dotted'
  readonly label?: string
}

export type LayoutBounds = {
  readonly w: number
  readonly h: number
}

export type LayoutTree = {
  readonly root: PositionedNode
  readonly edges: readonly RoutedEdge[]
  readonly dottedEdges: readonly RoutedEdge[]
  readonly bounds: LayoutBounds
}
