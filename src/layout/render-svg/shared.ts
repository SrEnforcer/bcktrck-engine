import type { EdgeStyleValue, IndexedTree, LayoutNodeKind, PlacedTree, PlacedStaff, RenderConfig, RenderResult } from '../types'
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

export const expandBoundsWithPoint = (bounds: RenderBounds, point: SvgPoint): RenderBounds => ({
  minX: Math.min(bounds.minX, point.x),
  minY: Math.min(bounds.minY, point.y),
  maxX: Math.max(bounds.maxX, point.x),
  maxY: Math.max(bounds.maxY, point.y)
})

export const expandBoundsWithPoints = (
  bounds: RenderBounds,
  points: readonly SvgPoint[]
): RenderBounds => points.reduce((acc, point) => expandBoundsWithPoint(acc, point), bounds)

export const mergeRenderBounds = (left: RenderBounds, right: RenderBounds): RenderBounds => ({
  minX: Math.min(left.minX, right.minX),
  minY: Math.min(left.minY, right.minY),
  maxX: Math.max(left.maxX, right.maxX),
  maxY: Math.max(left.maxY, right.maxY)
})

export const boundsFromRect = (input: BoundsFromRectInput): RenderBounds => ({
  minX: input.x,
  minY: input.y,
  maxX: input.x + input.w,
  maxY: input.y + input.h
})

export const mergeAllBounds = (boundsList: readonly RenderBounds[]): RenderBounds =>
  boundsList.reduce((acc, bounds) => mergeRenderBounds(acc, bounds), emptyRenderBounds())

export const mergeSectionRender = (left: SectionRender, right: SectionRender): SectionRender => ({
  elements: [...left.elements, ...right.elements],
  bounds: mergeRenderBounds(left.bounds, right.bounds)
})

export const mergeShadowBodyRender = (left: ShadowBodyRender, right: ShadowBodyRender): ShadowBodyRender => ({
  bodyElements: [...left.bodyElements, ...right.bodyElements],
  edgeElements: [...left.edgeElements, ...right.edgeElements],
  bounds: mergeRenderBounds(left.bounds, right.bounds)
})

/** Looks up a bounds box from placed nodes, staff positions, or a pre-computed shadow bounds map. */
export const getNodeBounds = (
  input: GetNodeBoundsInput
): NodeBounds | undefined => {
  const pos = input.placed.positions.get(input.id)
  if (pos !== undefined) {
    const w = input.cfg.nodeSize * input.cfg.colWidth
    const h = input.cfg.nodeSize * input.cfg.rowHeight
    const p = { x: pos.x * input.cfg.colWidth, y: pos.y * input.cfg.rowHeight }
    return { cx: p.x + w / 2, cy: p.y + h / 2, w, h }
  }

  const staffNode = input.staff.staff.find((s) => s.id === input.id)
  if (staffNode !== undefined) {
    const w = input.cfg.staffSize * input.cfg.colWidth
    const h = input.cfg.staffSize * input.cfg.rowHeight
    const p = { x: staffNode.x * input.cfg.colWidth, y: staffNode.y * input.cfg.rowHeight }
    return { cx: p.x + w / 2, cy: p.y + h / 2, w, h }
  }

  return input.shadowBoundsMap?.get(input.id)
}

/** Looks up a center position from placed nodes or staff array. */
export const getNodePosition = (
  input: GetNodePositionInput
): { readonly cx: number; readonly cy: number } | undefined => {
  const pos = input.placed.positions.get(input.id)
  if (pos !== undefined) {
    const p = { x: pos.x * input.cfg.colWidth, y: pos.y * input.cfg.rowHeight }
    return { cx: p.x + (input.cfg.nodeSize * input.cfg.colWidth) / 2, cy: p.y + (input.cfg.nodeSize * input.cfg.rowHeight) / 2 }
  }

  const staffNode = input.staff.staff.find((s) => s.id === input.id)
  if (staffNode !== undefined) {
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

export const mergeTextStyle = (base: ResolvedTextStyle, override: ResolvedTextStyle): ResolvedTextStyle => ({
  ...base,
  ...override
})

export const textAttrs = (style: ResolvedTextStyle): string => [
  style.color !== undefined ? `fill="${escapeXml(style.color)}"` : undefined,
  style.fontSize !== undefined ? `font-size="${Math.round(style.fontSize)}px"` : undefined,
  style.fontWeight !== undefined ? `font-weight="${escapeXml(style.fontWeight)}"` : undefined
]
  .filter((value): value is string => value !== undefined)
  .join(' ')

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

export const strokeWidthAttr = (width: number): string => ` stroke-width="${width}"`

const ICON_STACK_GAP = 2
const ICON_STACK_PADDING = 4

/** Renders one or more icons for a node. */
type RenderNodeIconsParams = {
  readonly specs: readonly IconSpec[]
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly color: string
}

export const renderNodeIcons = (
  params: RenderNodeIconsParams
): string => {
  const { specs, bounds, color } = params
  const { x: nodeX, y: nodeY, width: nodeW, height: nodeH } = bounds
  const first = specs[0]
  if (specs.length === 1 && first !== undefined) {
    return renderIconSpec({
      spec: first,
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
        opacity: spec.opacity !== undefined ? spec.opacity : 0.3
      })
    })
    .join('')
}

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
  const current = nodeIds[0]
  if (current !== undefined) {
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
  const firstMissingNodeId = findFirstMissingPositionNodeId(Array.from(tree.nodes.keys()), placed)
  if (firstMissingNodeId !== undefined) {
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
