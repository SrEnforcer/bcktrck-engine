/**
 * PURE CORE — no side-effects; all I/O enters via parameters.
 *
 * Shadow node body, label, and connector SVG element renderers.
 */

// DEVIATION(2.4): Shadow rendering remains co-located to preserve connector and label alignment behavior.

import type { ShadowNode } from '../../types/org-tree'
import type { ResolvedNodeStyle, ResolvedStyleMap, ResolvedTextStyles } from '../../style/dsl'
import type { IndexedTree, PlacedTree, PlacedStaff, RenderConfig } from '../types'
import { buildStyledLabelLines, composeShadowLabel, fitFontSizeToBox, renderStyledLabelElement, toTextStyle } from './text'
import {
  boundsFromRect,
  emptyRenderBounds,
  escapeXml,
  expandBoundsWithPoints,
  getNodeBounds,
  gridToPixels,
  mergeShadowBodyRender,
  rectStrokeStyleAttrs,
  strokeWidthAttr,
  type NodeBounds,
  type ShadowBodyRender,
  type ShadowPlacement,
} from './shared'

const STAFF_SHADOW_EDGE_GAP_RATIO = 0.05

type ShadowDimensions = {
  readonly w: number
  readonly h: number
  readonly isStaffShadow: boolean
}

type ResolveStaffShadowPlacementInput = {
  readonly shadow: ShadowNode
  readonly placed: PlacedTree
  readonly staff: PlacedStaff
  readonly cfg: RenderConfig
  readonly dimensions: ShadowDimensions
  readonly primaryPos: NodeBounds | undefined
  readonly shadowStyle: ResolvedNodeStyle | undefined
}

type ResolveGenericShadowPlacementInput = {
  readonly shadow: ShadowNode
  readonly placed: PlacedTree
  readonly cfg: RenderConfig
  readonly dimensions: ShadowDimensions
  readonly primaryPos: NodeBounds | undefined
  readonly shadowStyle: ResolvedNodeStyle | undefined
}

type ResolveShadowPlacementInput = {
  readonly shadow: ShadowNode
  readonly placed: PlacedTree
  readonly staff: PlacedStaff
  readonly cfg: RenderConfig
  readonly styleMap: ResolvedStyleMap
}

type RenderShadowLabelElementInput = {
  readonly shadow: ShadowNode
  readonly tree: IndexedTree
  readonly staff: PlacedStaff
  readonly placement: ShadowPlacement
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
  readonly textStyles: ResolvedTextStyles
}

type RenderSingleShadowBodyInput = {
  readonly shadow: ShadowNode
  readonly tree: IndexedTree
  readonly placed: PlacedTree
  readonly staff: PlacedStaff
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
  readonly styleMap: ResolvedStyleMap
  readonly textStyles: ResolvedTextStyles
}

type RenderShadowRectElementInput = {
  readonly shadow: ShadowNode
  readonly placement: ShadowPlacement
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
}

type ShadowEdgeAttachPointInput = {
  readonly cx: number
  readonly cy: number
  readonly w: number
  readonly h: number
  readonly dx: number
  readonly dy: number
  readonly outward: boolean
}

type BuildShadowBoundsMapInput = {
  readonly shadowNodes: readonly ShadowNode[]
  readonly placed: PlacedTree
  readonly staff: PlacedStaff
  readonly cfg: RenderConfig
  readonly styleMap: ResolvedStyleMap
}

type RenderShadowBodiesInput = {
  readonly shadowNodes: readonly ShadowNode[]
  readonly tree: IndexedTree
  readonly placed: PlacedTree
  readonly staff: PlacedStaff
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
  readonly styleMap: ResolvedStyleMap
  readonly textStyles: ResolvedTextStyles
}

const shadowDimensions = (
  shadow: ShadowNode,
  cfg: RenderConfig
): ShadowDimensions => {
  const isStaffShadow = shadow.type === 'staff'
  return {
    w: (isStaffShadow ? cfg.staffSize : cfg.nodeSize) * cfg.colWidth,
    h: (isStaffShadow ? cfg.staffSize : cfg.nodeSize) * cfg.rowHeight,
    isStaffShadow
  }
}

const resolveStaffShadowPlacement = (
  input: ResolveStaffShadowPlacementInput
): ShadowPlacement | undefined => {
  if (!input.dimensions.isStaffShadow) {
    return undefined
  }

  const anchorBounds = input.shadow.host !== undefined
    ? getNodeBounds({
      id: input.shadow.host,
      placed: input.placed,
      staff: input.staff,
      cfg: input.cfg,
      shadowBoundsMap: undefined
    }) ?? input.primaryPos
    : input.primaryPos
  if (anchorBounds === undefined) {
    return undefined
  }

  const side = input.shadow.side ?? 'right'
  const gap = input.cfg.colWidth * STAFF_SHADOW_EDGE_GAP_RATIO
  const x = side === 'left'
    ? anchorBounds.cx - anchorBounds.w / 2 - gap - input.dimensions.w
    : anchorBounds.cx + anchorBounds.w / 2 + gap
  const y = anchorBounds.cy - input.dimensions.h / 2
  return {
    x,
    y,
    sx: x + input.dimensions.w / 2,
    sy: y + input.dimensions.h / 2,
    w: input.dimensions.w,
    h: input.dimensions.h,
    primaryPos: input.primaryPos,
    shadowStyle: input.shadowStyle
  }
}

const resolveGenericShadowPlacement = (
  input: ResolveGenericShadowPlacementInput
): ShadowPlacement | undefined => {
  const explicitPos = input.placed.positions.get(String(input.shadow.id))
  const explicitPixels = explicitPos !== undefined ? gridToPixels(explicitPos.x, explicitPos.y, input.cfg) : undefined

  const anchor = explicitPixels !== undefined
    ? { cx: explicitPixels.x + (input.cfg.nodeSize * input.cfg.colWidth) / 2, cy: explicitPixels.y + (input.cfg.nodeSize * input.cfg.rowHeight) / 2 }
    : input.primaryPos
  if (anchor === undefined) {
    return undefined
  }

  const x = explicitPixels !== undefined
    ? explicitPixels.x + (input.cfg.nodeSize * input.cfg.colWidth - input.dimensions.w) / 2
    : (anchor.cx + input.cfg.colWidth * input.cfg.shadowOffsetX - input.dimensions.w / 2)
  const y = explicitPixels !== undefined
    ? explicitPixels.y + (input.cfg.nodeSize * input.cfg.rowHeight - input.dimensions.h) / 2
    : (anchor.cy + input.cfg.rowHeight * input.cfg.shadowOffsetY - input.dimensions.h / 2)

  return {
    x,
    y,
    sx: x + input.dimensions.w / 2,
    sy: y + input.dimensions.h / 2,
    w: input.dimensions.w,
    h: input.dimensions.h,
    primaryPos: input.primaryPos,
    shadowStyle: input.shadowStyle
  }
}

const resolveShadowPlacement = (
  input: ResolveShadowPlacementInput
): ShadowPlacement | undefined => {
  const shadowStyle = input.styleMap.get(String(input.shadow.id))
  const primaryPos = getNodeBounds({
    id: input.shadow.primary,
    placed: input.placed,
    staff: input.staff,
    cfg: input.cfg,
    shadowBoundsMap: undefined
  })
  const explicitPos = input.placed.positions.get(String(input.shadow.id))
  if (explicitPos === undefined && primaryPos === undefined) {
    return undefined
  }

  const dimensions = shadowDimensions(input.shadow, input.cfg)
  const staffPlacement = resolveStaffShadowPlacement({
    shadow: input.shadow,
    placed: input.placed,
    staff: input.staff,
    cfg: input.cfg,
    dimensions,
    primaryPos,
    shadowStyle
  })
  return staffPlacement ?? resolveGenericShadowPlacement({
    shadow: input.shadow,
    placed: input.placed,
    cfg: input.cfg,
    dimensions,
    primaryPos,
    shadowStyle
  })
}

const renderShadowLabelElement = (
  input: RenderShadowLabelElementInput
): string => {
  const primaryId = String(input.shadow.primary)
  const primaryNode = input.tree.nodes.get(primaryId)
  const primaryStaff = input.staff.staff.find((entry) => entry.id === primaryId)
  const primaryLabel = primaryNode?.label ?? primaryStaff?.label ?? input.tree.staffLabels?.get(primaryId)
  const shadowLabelText = primaryLabel !== undefined
    ? composeShadowLabel(primaryLabel, input.shadow.label)
    : (input.shadow.label ?? input.shadow.id)
  const shadowBaseFont = Math.max(1, input.cfg.fontSize * input.cfg.shadowFontScale)
  const maxCharsPerLine = Math.max(8, Math.floor((input.placement.w - 10) / (shadowBaseFont * 0.52)))
  const styledLines = buildStyledLabelLines(shadowLabelText, maxCharsPerLine, 3)
  const fittedShadowFont = fitFontSizeToBox({
    lines: styledLines.map((line) => line.text),
    baseFontSize: shadowBaseFont,
    boxWidth: input.placement.w,
    boxHeight: input.placement.h,
    minFontSize: Math.max(1, shadowBaseFont * 0.8)
  })
  return renderStyledLabelElement({
    tx: input.placement.x + input.placement.w / 2,
    ty: input.placement.y + input.placement.h / 2,
    fontFamily: input.safeCfg.fontFamily,
    styledLines,
    textStyles: input.textStyles,
    baseTextStyle: toTextStyle(input.placement.shadowStyle),
    fittedFont: fittedShadowFont,
    fallbackText: ''
  })
}

const renderShadowRectElement = (
  input: RenderShadowRectElementInput
): string =>
  `<rect id="${escapeXml(input.shadow.id)}" class="shadow" x="${input.placement.x}" y="${input.placement.y}" width="${input.placement.w}" height="${input.placement.h}" fill="${input.placement.shadowStyle?.backgroundColor !== undefined ? escapeXml(input.placement.shadowStyle.backgroundColor) : input.safeCfg.employeeFill}"${input.placement.shadowStyle?.borderStyle === 'none' ? '' : ` stroke="${input.placement.shadowStyle?.borderColor !== undefined ? escapeXml(input.placement.shadowStyle.borderColor) : input.safeCfg.nodeBorder}"`}${strokeWidthAttr(input.placement.shadowStyle?.borderWidth ?? 1)} opacity="${input.cfg.shadowOpacity}"${rectStrokeStyleAttrs(input.placement.shadowStyle)} />`

const shadowEdgeAttachPoint = (
  input: ShadowEdgeAttachPointInput
): { readonly x: number; readonly y: number } => {
  if (Math.abs(input.dx) >= Math.abs(input.dy)) {
    const sign = input.outward ? (input.dx >= 0 ? 1 : -1) : (input.dx >= 0 ? -1 : 1)
    return { x: input.cx + sign * input.w / 2, y: input.cy }
  }
  const sign = input.outward ? (input.dy >= 0 ? 1 : -1) : (input.dy >= 0 ? -1 : 1)
  return { x: input.cx, y: input.cy + sign * input.h / 2 }
}

const renderShadowConnectorElements = (
  shadow: ShadowNode,
  placement: ShadowPlacement,
  safeCfg: RenderConfig
): readonly string[] => {
  if (shadow.hideConnector === true || placement.primaryPos === undefined) {
    return []
  }
  const { cx: pcx, cy: pcy, w: pw, h: ph } = placement.primaryPos
  const dx = placement.sx - pcx
  const dy = placement.sy - pcy
  const start = shadowEdgeAttachPoint({ cx: pcx, cy: pcy, w: pw, h: ph, dx, dy, outward: true })
  const end = shadowEdgeAttachPoint({ cx: placement.sx, cy: placement.sy, w: placement.w, h: placement.h, dx, dy, outward: false })
  return [`<line class="shadow-edge" x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="${safeCfg.dottedEdgeStroke}" stroke-width="1.5" stroke-dasharray="${safeCfg.shadowDashArray}" />`]
}

const renderSingleShadowBody = (
  input: RenderSingleShadowBodyInput
): ShadowBodyRender => {
  const placement = resolveShadowPlacement({
    shadow: input.shadow,
    placed: input.placed,
    staff: input.staff,
    cfg: input.cfg,
    styleMap: input.styleMap
  })
  if (placement === undefined) {
    return { bodyElements: [], edgeElements: [], bounds: emptyRenderBounds() }
  }

  const labelElement = renderShadowLabelElement({
    shadow: input.shadow,
    tree: input.tree,
    staff: input.staff,
    placement,
    cfg: input.cfg,
    safeCfg: input.safeCfg,
    textStyles: input.textStyles
  })
  const rectElement = renderShadowRectElement({ shadow: input.shadow, placement, cfg: input.cfg, safeCfg: input.safeCfg })
  const connectorElements = renderShadowConnectorElements(input.shadow, placement, input.safeCfg)
  const nodeBounds = boundsFromRect({ x: placement.x, y: placement.y, w: placement.w, h: placement.h })
  const connectorBounds = placement.primaryPos !== undefined
    ? expandBoundsWithPoints(nodeBounds, [{ x: placement.sx, y: placement.sy }, { x: placement.primaryPos.cx, y: placement.primaryPos.cy }])
    : nodeBounds

  return {
    bodyElements: [rectElement, labelElement],
    edgeElements: connectorElements,
    bounds: connectorBounds
  }
}

/** Builds a map of shadow node id → NodeBounds for use by dotted-edge routing. */
export const buildShadowBoundsMap = (
  input: BuildShadowBoundsMapInput
): ReadonlyMap<string, NodeBounds> => {
  const entries = input.shadowNodes.flatMap((shadow) => {
    const placement = resolveShadowPlacement({
      shadow,
      placed: input.placed,
      staff: input.staff,
      cfg: input.cfg,
      styleMap: input.styleMap
    })
    if (placement === undefined) {
      return []
    }
    const bounds: NodeBounds = { cx: placement.sx, cy: placement.sy, w: placement.w, h: placement.h }
    return [[String(shadow.id), bounds] as const]
  })

  // DEVIATION(1.9): The boundary contract requires a ReadonlyMap for fast lookup by shadow id.
  // eslint-disable-next-line no-restricted-syntax -- DEVIATION(1.9): required map construction at rendering boundary.
  return new Map(entries)
}

/** Builds SVG elements for all shadow node bodies and their connectors. */
export const renderShadowBodies = (
  input: RenderShadowBodiesInput
): ShadowBodyRender => input.shadowNodes.reduce<ShadowBodyRender>((state, shadow) =>
  mergeShadowBodyRender(state, renderSingleShadowBody({
    shadow,
    tree: input.tree,
    placed: input.placed,
    staff: input.staff,
    cfg: input.cfg,
    safeCfg: input.safeCfg,
    styleMap: input.styleMap,
    textStyles: input.textStyles
  })),
{ bodyElements: [], edgeElements: [], bounds: emptyRenderBounds() })
