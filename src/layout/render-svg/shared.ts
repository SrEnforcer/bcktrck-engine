/**
 * @module layout/render-svg/shared
 *
 * Rendering helper module for SVG projection internals.
 *
 * @packageDocumentation
 */

import type { EdgeStyleValue, IndexedTree, LayoutNodeKind, PlacedTree, PlacedStaff, RenderConfig, RenderResult } from '../types'
import { flatMapO, fromNullable, getOrElse, isSome, mapO, pipe } from '@tsfpp/prelude'
import { renderIcon, renderIconSpec } from '../../icons/render'
import type { IconSpec } from '../../icons/render'
import type { ResolvedNodeStyle, ResolvedTextStyle } from '../../style/dsl'

/** Shared geometry bounds for render projection. */
export type RenderBounds = {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

/** Center-point bounds used for node routing decisions. */
export type NodeBounds = {
  readonly cx: number
  readonly cy: number
  readonly w: number
  readonly h: number
}

/** Immutable SVG point in pixels. */
export type SvgPoint = {
  readonly x: number
  readonly y: number
}

/** Section output with elements and accumulated bounds. */
export type SectionRender = {
  readonly elements: readonly string[]
  readonly bounds: RenderBounds
}

/** Shadow section output split into body and connector layers. */
export type ShadowBodyRender = {
  readonly bodyElements: readonly string[]
  readonly edgeElements: readonly string[]
  readonly bounds: RenderBounds
}

/** Projection section partitions rendered in final z-order. */
export type ProjectionSections = {
  readonly dottedRender: { readonly edgeElements: readonly string[]; readonly bounds: RenderBounds }
  readonly solidEdgeRender: SectionRender
  readonly staffConnectorRender: SectionRender
  readonly shadowBodyRender: ShadowBodyRender
  readonly nodeBodyRender: SectionRender
  readonly staffBodyRender: SectionRender
}

/** Tree node item extracted from `IndexedTree.nodes`. */
export type IndexedTreeNode = IndexedTree['nodes'] extends ReadonlyMap<string, infer N> ? N : never

/** Common node/staff style context for rectangle and label rendering. */
export type NodeRenderStyleContext = {
  readonly style: ResolvedNodeStyle | undefined
  readonly fill: string
  readonly strokeAttr: string
  readonly baseTextStyle: ResolvedTextStyle
  readonly textFontSize: number
}

/** Resolved shadow placement and style data used by body rendering. */
export type ShadowPlacement = {
  readonly x: number
  readonly y: number
  readonly sx: number
  readonly sy: number
  readonly w: number
  readonly h: number
  /** Bounds of the primary node — includes dimensions so connectors can attach to node edges. */
  readonly primaryPos: NodeBounds | undefined
  readonly shadowStyle: ResolvedNodeStyle | undefined
}

type BoundsFromRectInput = {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

type GetNodeBoundsInput = {
  readonly id: string
  readonly placed: PlacedTree
  readonly staff: PlacedStaff
  readonly cfg: RenderConfig
  readonly shadowBoundsMap: ReadonlyMap<string, NodeBounds> | undefined
}

type GetNodePositionInput = {
  readonly id: string
  readonly placed: PlacedTree
  readonly staff: PlacedStaff
  readonly cfg: RenderConfig
}

/** Escapes XML special characters to prevent injection vulnerabilities. */
export const escapeXml = (str: string): string =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** Converts grid coordinates (x, y) to SVG pixel coordinates. */
export const gridToPixels = (x: number, y: number, cfg: RenderConfig): { readonly x: number; readonly y: number } => ({
  x: x * cfg.colWidth,
  y: y * cfg.rowHeight
})

/** Empty bounds identity value for monotonic min/max folding. */
export const emptyRenderBounds = (): RenderBounds => ({
  minX: Number.POSITIVE_INFINITY,
  minY: Number.POSITIVE_INFINITY,
  maxX: Number.NEGATIVE_INFINITY,
  maxY: Number.NEGATIVE_INFINITY
})

/** Build expandBoundsWithPoint output for rendering pipeline use. */
export const expandBoundsWithPoint = (bounds: RenderBounds, point: SvgPoint): RenderBounds => ({
  minX: Math.min(bounds.minX, point.x),
  minY: Math.min(bounds.minY, point.y),
  maxX: Math.max(bounds.maxX, point.x),
  maxY: Math.max(bounds.maxY, point.y)
})

/** Build expandBoundsWithPoints output for rendering pipeline use. */
export const expandBoundsWithPoints = (
  bounds: RenderBounds,
  points: readonly SvgPoint[]
): RenderBounds => points.reduce((acc, point) => expandBoundsWithPoint(acc, point), bounds)

/** Build mergeRenderBounds output for rendering pipeline use. */
export const mergeRenderBounds = (left: RenderBounds, right: RenderBounds): RenderBounds => ({
  minX: Math.min(left.minX, right.minX),
  minY: Math.min(left.minY, right.minY),
  maxX: Math.max(left.maxX, right.maxX),
  maxY: Math.max(left.maxY, right.maxY)
})

/** Build boundsFromRect output for rendering pipeline use. */
export const boundsFromRect = (input: BoundsFromRectInput): RenderBounds => ({
  minX: input.x,
  minY: input.y,
  maxX: input.x + input.w,
  maxY: input.y + input.h
})

/** Build mergeAllBounds output for rendering pipeline use. */
export const mergeAllBounds = (boundsList: readonly RenderBounds[]): RenderBounds =>
  boundsList.reduce((acc, bounds) => mergeRenderBounds(acc, bounds), emptyRenderBounds())

/** Build mergeSectionRender output for rendering pipeline use. */
export const mergeSectionRender = (left: SectionRender, right: SectionRender): SectionRender => ({
  elements: [...left.elements, ...right.elements],
  bounds: mergeRenderBounds(left.bounds, right.bounds)
})

/** Build mergeShadowBodyRender output for rendering pipeline use. */
export const mergeShadowBodyRender = (left: ShadowBodyRender, right: ShadowBodyRender): ShadowBodyRender => ({
  bodyElements: [...left.bodyElements, ...right.bodyElements],
  edgeElements: [...left.edgeElements, ...right.edgeElements],
  bounds: mergeRenderBounds(left.bounds, right.bounds)
})

/** Looks up a bounds box from placed nodes, staff positions, or a pre-computed shadow bounds map. */
export const getNodeBounds = (
  input: GetNodeBoundsInput
): NodeBounds | undefined => {
  const posOption = fromNullable(input.placed.positions.get(input.id))
  if (isSome(posOption)) {
    const pos = posOption.value
    const w = input.cfg.nodeSize * input.cfg.colWidth
    const h = input.cfg.nodeSize * input.cfg.rowHeight
    const p = { x: pos.x * input.cfg.colWidth, y: pos.y * input.cfg.rowHeight }
    return { cx: p.x + w / 2, cy: p.y + h / 2, w, h }
  }

  const staffNodeOption = fromNullable(input.staff.staff.find((s) => s.id === input.id))
  if (isSome(staffNodeOption)) {
    const staffNode = staffNodeOption.value
    const w = input.cfg.staffSize * input.cfg.colWidth
    const h = input.cfg.staffSize * input.cfg.rowHeight
    const p = { x: staffNode.x * input.cfg.colWidth, y: staffNode.y * input.cfg.rowHeight }
    return { cx: p.x + w / 2, cy: p.y + h / 2, w, h }
  }

  const shadowBoundsOption = pipe(
    fromNullable(input.shadowBoundsMap),
    flatMapO((shadowBoundsMap) => fromNullable(shadowBoundsMap.get(input.id)))
  )
  return isSome(shadowBoundsOption) ? shadowBoundsOption.value : undefined
}

/** Looks up a center position from placed nodes or staff array. */
export const getNodePosition = (
  input: GetNodePositionInput
): { readonly cx: number; readonly cy: number } | undefined => {
  const posOption = fromNullable(input.placed.positions.get(input.id))
  if (isSome(posOption)) {
    const pos = posOption.value
    const p = { x: pos.x * input.cfg.colWidth, y: pos.y * input.cfg.rowHeight }
    return { cx: p.x + (input.cfg.nodeSize * input.cfg.colWidth) / 2, cy: p.y + (input.cfg.nodeSize * input.cfg.rowHeight) / 2 }
  }

  const staffNodeOption = fromNullable(input.staff.staff.find((s) => s.id === input.id))
  if (isSome(staffNodeOption)) {
    const staffNode = staffNodeOption.value
    const p = { x: staffNode.x * input.cfg.colWidth, y: staffNode.y * input.cfg.rowHeight }
    return { cx: p.x + (input.cfg.staffSize * input.cfg.colWidth) / 2, cy: p.y + (input.cfg.staffSize * input.cfg.rowHeight) / 2 }
  }

  return undefined
}

/** Gets the fill color for a node based on its kind. */
export const getFillColor = (kind: LayoutNodeKind, cfg: RenderConfig): string => {
  switch (kind) {
    case 'department':
      return cfg.deptFill
    case 'vacancy':
      return cfg.vacancyFill
    case 'employee':
      return cfg.employeeFill
  }
}

/** Build mergeTextStyle output for rendering pipeline use. */
export const mergeTextStyle = (base: ResolvedTextStyle, override: ResolvedTextStyle): ResolvedTextStyle => ({
  ...base,
  ...override
})

/** Build textAttrs output for rendering pipeline use. */
export const textAttrs = (style: ResolvedTextStyle): string => {
  const attrs = [
    pipe(fromNullable(style.color), mapO((color) => `fill="${escapeXml(color)}"`)),
    pipe(fromNullable(style.fontSize), mapO((fontSize) => `font-size="${Math.round(fontSize)}px"`)),
    pipe(fromNullable(style.fontWeight), mapO((fontWeight) => `font-weight="${escapeXml(fontWeight)}"`))
  ]

  return attrs
    .filter(isSome)
    .map((attr) => attr.value)
    .join(' ')
}

/** Build rectStrokeStyleAttrs output for rendering pipeline use. */
export const rectStrokeStyleAttrs = (style: ResolvedNodeStyle | undefined): string => {
  switch (style?.borderStyle) {
    case undefined:
      return ''
    case 'solid':
      return ''
    case 'none':
      return ''
    case 'dashed':
      return ' stroke-dasharray="8 5"'
    case 'dotted':
      return ' stroke-dasharray="2 4" stroke-linecap="round"'
  }
}

/** Build edgeStrokeStyleAttrs output for rendering pipeline use. */
export const edgeStrokeStyleAttrs = (edgeStyle: EdgeStyleValue | undefined): string => {
  switch (edgeStyle) {
    case undefined:
      return ''
    case 'straight':
      return ''
    case 'dashed':
      return ' stroke-dasharray="8 5"'
    case 'dotted':
      return ' stroke-dasharray="2 4" stroke-linecap="round"'
  }
}

/** Build strokeWidthAttr output for rendering pipeline use. */
export const strokeWidthAttr = (width: number): string => ` stroke-width="${width}"`

const ICON_STACK_GAP = 2
const ICON_STACK_PADDING = 4

/** Renders one or more icons for a node. */
type RenderNodeIconsParams = {
  readonly specs: readonly IconSpec[]
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly color: string
}

/** Build renderNodeIcons output for rendering pipeline use. */
export const renderNodeIcons = (
  params: RenderNodeIconsParams
): string => {
  const { specs, bounds, color } = params
  const { x: nodeX, y: nodeY, width: nodeW, height: nodeH } = bounds
  const firstOption = fromNullable(specs[0])
  if (specs.length === 1 && isSome(firstOption)) {
    return renderIconSpec({
      spec: firstOption.value,
      bounds: { x: nodeX, y: nodeY, width: nodeW, height: nodeH },
      color
    })
  }

  const n = specs.length
  return specs
    .map((spec, i) => {
      const size = spec.size
      const x = nodeX + nodeW - ICON_STACK_PADDING - (n - i) * size - (n - 1 - i) * ICON_STACK_GAP
      const y = nodeY + nodeH - ICON_STACK_PADDING - size
      return renderIcon({
        name: spec.name,
        x,
        y,
        size,
        color,
        opacity: pipe(fromNullable(spec.opacity), getOrElse(() => 0.3))
      })
    })
    .join('')
}

/** Build sanitizeRenderConfig output for rendering pipeline use. */
export const sanitizeRenderConfig = (cfg: RenderConfig): RenderConfig => ({
  ...cfg,
  nodeBorder: escapeXml(cfg.nodeBorder),
  employeeFill: escapeXml(cfg.employeeFill),
  deptFill: escapeXml(cfg.deptFill),
  vacancyFill: escapeXml(cfg.vacancyFill),
  edgeStroke: escapeXml(cfg.edgeStroke),
  dottedEdgeStroke: escapeXml(cfg.dottedEdgeStroke),
  subordinateCountBadgeFill: escapeXml(cfg.subordinateCountBadgeFill),
  subordinateCountBadgeText: escapeXml(cfg.subordinateCountBadgeText),
  shadowDashArray: escapeXml(cfg.shadowDashArray),
  fontFamily: escapeXml(cfg.fontFamily)
})

const findFirstMissingPositionNodeId = (
  nodeIds: readonly string[],
  placed: PlacedTree
): string | undefined => {
  const currentOption = fromNullable(nodeIds[0])
  if (isSome(currentOption)) {
    const current = currentOption.value
    return placed.positions.has(current)
      ? findFirstMissingPositionNodeId(nodeIds.slice(1), placed)
      : current
  }
  return undefined
}

/** Validates that each tree node has a computed layout position. */
export const validatePlacedNodePositions = (
  tree: IndexedTree,
  placed: PlacedTree
): RenderResult | undefined => {
  const firstMissingNodeIdOption = fromNullable(findFirstMissingPositionNodeId(Array.from(tree.nodes.keys()), placed))
  if (isSome(firstMissingNodeIdOption)) {
    const firstMissingNodeId = firstMissingNodeIdOption.value
    return {
      ok: false,
      error: {
        kind: 'missing_layout_position',
        nodeId: firstMissingNodeId,
        message: `Missing layout position for node: ${firstMissingNodeId}`
      }
    }
  }

  return undefined
}
