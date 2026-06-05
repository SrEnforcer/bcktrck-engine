/**
 * @module layout/render-svg/shadows
 *
 * Rendering helper module for SVG projection internals.
 *
 * @packageDocumentation
 */

/**
 * PURE CORE — no side-effects; all I/O enters via parameters.
 *
 * Shadow node body, label, and connector SVG element renderers.
 */

// DEVIATION(2.4): Shadow rendering remains co-located to preserve connector and label alignment behavior.

import { fromNullable, getOrElse, intoMap, isNone, pipe } from '@tsfpp/prelude'
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
  readonly tree: IndexedTree
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
  readonly tree: IndexedTree
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
  readonly tree: IndexedTree
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

  const hostOption = fromNullable(input.shadow.host)
  const positionedFromHost = isNone(hostOption)
    ? undefined
    : (() => {
      const hostNodeOption = fromNullable(input.tree.nodes.get(hostOption.value))
      const hostPosOption = fromNullable(input.placed.positions.get(hostOption.value))
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

      const side = pipe(fromNullable(input.shadow.side), getOrElse(() => 'right'))
      const direction = side === 'left' ? -1 : 1
      const baseOffset = (input.cfg.nodeSize + input.cfg.staffSize) / 2 + 0.05
      const parentCenterX = hostPos.x + input.cfg.nodeSize / 2
      const xGrid = parentCenterX + direction * baseOffset - input.cfg.staffSize / 2
      const yGrid = anchorY - input.cfg.staffSize / 2

      return {
        x: xGrid * input.cfg.colWidth,
        y: yGrid * input.cfg.rowHeight,
        sx: xGrid * input.cfg.colWidth + input.dimensions.w / 2,
        sy: yGrid * input.cfg.rowHeight + input.dimensions.h / 2,
        w: input.dimensions.w,
        h: input.dimensions.h,
        primaryPos: input.primaryPos,
        shadowStyle: input.shadowStyle
      } satisfies ShadowPlacement
    })()

  if (positionedFromHost !== undefined) {
    return positionedFromHost
  }

  const hostAnchor = isNone(hostOption)
    ? input.primaryPos
    : getNodeBounds({
      id: hostOption.value,
      placed: input.placed,
      staff: input.staff,
      cfg: input.cfg,
      shadowBoundsMap: undefined
    })
  const anchorBoundsOption = fromNullable(pipe(fromNullable(hostAnchor), getOrElse(() => input.primaryPos)))
  if (isNone(anchorBoundsOption)) {
    return undefined
  }
  const anchorBounds = anchorBoundsOption.value

  const side = pipe(fromNullable(input.shadow.side), getOrElse(() => 'right'))
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
  const explicitPosOption = fromNullable(explicitPos)
  const explicitPixels = isNone(explicitPosOption)
    ? undefined
    : gridToPixels(explicitPosOption.value.x, explicitPosOption.value.y, input.cfg)
  const explicitPixelsOption = fromNullable(explicitPixels)

  const anchorOption = fromNullable(!isNone(explicitPixelsOption)
    ? {
      cx: explicitPixelsOption.value.x + (input.cfg.nodeSize * input.cfg.colWidth) / 2,
      cy: explicitPixelsOption.value.y + (input.cfg.nodeSize * input.cfg.rowHeight) / 2
    }
    : input.primaryPos)
  if (isNone(anchorOption)) {
    return undefined
  }
  const anchor = anchorOption.value

  const x = !isNone(explicitPixelsOption)
    ? explicitPixelsOption.value.x + (input.cfg.nodeSize * input.cfg.colWidth - input.dimensions.w) / 2
    : (anchor.cx + input.cfg.colWidth * input.cfg.shadowOffsetX - input.dimensions.w / 2)
  const y = !isNone(explicitPixelsOption)
    ? explicitPixelsOption.value.y + (input.cfg.nodeSize * input.cfg.rowHeight - input.dimensions.h) / 2
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
  if (isNone(fromNullable(explicitPos)) && isNone(fromNullable(primaryPos))) {
    return undefined
  }

  const dimensions = shadowDimensions(input.shadow, input.cfg)
  const staffPlacement = resolveStaffShadowPlacement({
    tree: input.tree,
    shadow: input.shadow,
    placed: input.placed,
    staff: input.staff,
    cfg: input.cfg,
    dimensions,
    primaryPos,
    shadowStyle
  })
  return pipe(
    fromNullable(staffPlacement),
    getOrElse(() => resolveGenericShadowPlacement({
      shadow: input.shadow,
      placed: input.placed,
      cfg: input.cfg,
      dimensions,
      primaryPos,
      shadowStyle
    }))
  )
}

const renderShadowLabelElement = (
  input: RenderShadowLabelElementInput
): string => {
  const primaryId = String(input.shadow.primary)
  const primaryNode = input.tree.nodes.get(primaryId)
  const primaryStaff = input.staff.staff.find((entry) => entry.id === primaryId)
  const primaryLabel = pipe(
    fromNullable(primaryNode?.label),
    getOrElse(() => pipe(
      fromNullable(primaryStaff?.label),
      getOrElse(() => input.tree.staffLabels?.get(primaryId))
    ))
  )
  const primaryLabelOption = fromNullable(primaryLabel)
  const shadowLabelText = isNone(primaryLabelOption)
    ? pipe(fromNullable(input.shadow.label), getOrElse(() => String(input.shadow.id)))
    : composeShadowLabel(primaryLabelOption.value, input.shadow.label)
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
): string => {
  const backgroundColor = pipe(
    fromNullable(input.placement.shadowStyle?.backgroundColor),
    getOrElse(() => input.safeCfg.employeeFill)
  )
  const borderColor = pipe(
    fromNullable(input.placement.shadowStyle?.borderColor),
    getOrElse(() => input.safeCfg.nodeBorder)
  )
  const strokeAttr = input.placement.shadowStyle?.borderStyle === 'none'
    ? ''
    : ` stroke="${escapeXml(borderColor)}"`

  return `<rect id="${escapeXml(input.shadow.id)}" class="shadow" x="${input.placement.x}" y="${input.placement.y}" width="${input.placement.w}" height="${input.placement.h}" fill="${escapeXml(backgroundColor)}"${strokeAttr}${strokeWidthAttr(pipe(fromNullable(input.placement.shadowStyle?.borderWidth), getOrElse(() => 1)))} opacity="${input.cfg.shadowOpacity}"${rectStrokeStyleAttrs(input.placement.shadowStyle)} />`
}

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
  const primaryPosOption = fromNullable(placement.primaryPos)
  if (shadow.hideConnector === true || isNone(primaryPosOption)) {
    return []
  }
  const { cx: pcx, cy: pcy, w: pw, h: ph } = primaryPosOption.value
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
    tree: input.tree,
    shadow: input.shadow,
    placed: input.placed,
    staff: input.staff,
    cfg: input.cfg,
    styleMap: input.styleMap
  })
  const placementOption = fromNullable(placement)
  if (isNone(placementOption)) {
    return { bodyElements: [], edgeElements: [], bounds: emptyRenderBounds() }
  }
  const safePlacement = placementOption.value

  const labelElement = renderShadowLabelElement({
    shadow: input.shadow,
    tree: input.tree,
    staff: input.staff,
    placement: safePlacement,
    cfg: input.cfg,
    safeCfg: input.safeCfg,
    textStyles: input.textStyles
  })
  const rectElement = renderShadowRectElement({ shadow: input.shadow, placement: safePlacement, cfg: input.cfg, safeCfg: input.safeCfg })
  const connectorElements = renderShadowConnectorElements(input.shadow, safePlacement, input.safeCfg)
  const nodeBounds = boundsFromRect({ x: safePlacement.x, y: safePlacement.y, w: safePlacement.w, h: safePlacement.h })
  const primaryPosOption = fromNullable(safePlacement.primaryPos)
  const connectorBounds = isNone(primaryPosOption)
    ? nodeBounds
    : expandBoundsWithPoints(
      nodeBounds,
      [{ x: safePlacement.sx, y: safePlacement.sy }, { x: primaryPosOption.value.cx, y: primaryPosOption.value.cy }]
    )

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
    const placementOption = fromNullable(resolveShadowPlacement({
      tree: input.tree,
      shadow,
      placed: input.placed,
      staff: input.staff,
      cfg: input.cfg,
      styleMap: input.styleMap
    }))
    if (isNone(placementOption)) {
      return []
    }
    const placement = placementOption.value
    const bounds: NodeBounds = { cx: placement.sx, cy: placement.sy, w: placement.w, h: placement.h }
    return [[String(shadow.id), bounds] as const]
  })

  // DEVIATION(1.9): The boundary contract requires a ReadonlyMap for fast lookup by shadow id.
  return intoMap(entries)
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
