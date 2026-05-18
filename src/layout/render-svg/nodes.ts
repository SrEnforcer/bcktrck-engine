/**
 * @module layout/render-svg/nodes
 *
 * Rendering helper module for SVG projection internals.
 *
 * @packageDocumentation
 */

/**
 * PURE CORE — no side-effects; all I/O enters via parameters.
 *
 * Node body, staff body, and triangle SVG element renderers.
 */

/* eslint-disable max-lines */
// DEVIATION(2.4): This module remains temporarily large during incremental migration and will be split into focused files in a follow-up slice.

import { flatMapO, fromNullable, getOrElse, isNone, mapO, pipe } from '@tsfpp/prelude'
import type { IconSpec } from '../../icons/render'
import type { ResolvedNodeStyle, ResolvedStyleMap, ResolvedTextStyles } from '../../style/dsl'
import type { IndexedTree, PlacedTree, PlacedStaff, RenderConfig } from '../types'
import { countDirectSubordinates } from '../../subordinate-count-policy'
import { buildStyledLabelLines, fitFontSizeToBox, renderStyledLabelElement, toTextStyle } from './text'
import {
  boundsFromRect,
  emptyRenderBounds,
  escapeXml,
  getFillColor,
  gridToPixels,
  mergeSectionRender,
  rectStrokeStyleAttrs,
  renderNodeIcons,
  strokeWidthAttr,
  type IndexedTreeNode,
  type NodeRenderStyleContext,
  type SectionRender,
} from './shared'

type RenderOptionalIconElementParams = {
  readonly iconSpecs: readonly IconSpec[] | undefined
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly style: ResolvedNodeStyle | undefined
  readonly cfg: RenderConfig
}

const renderOptionalIconElement = (params: RenderOptionalIconElementParams): string | undefined => {
  const { iconSpecs, x, y, w, h, style, cfg } = params
  const iconSpecsOption = fromNullable(iconSpecs)
  if (isNone(iconSpecsOption) || iconSpecsOption.value.length === 0) {
    return undefined
  }
  const color = pipe(
    fromNullable(style?.iconColor),
    getOrElse(() => pipe(
      fromNullable(style?.borderColor),
      getOrElse(() => cfg.nodeBorder)
    ))
  )

  return renderNodeIcons({
    specs: iconSpecsOption.value,
    bounds: { x, y, width: w, height: h },
    color
  })
}

const optionalElement = (value: string | undefined): readonly string[] => {
  const valueOption = fromNullable(value)
  return isNone(valueOption) ? [] : [valueOption.value]
}

type Corner = 'upper-left' | 'upper-right' | 'bottom-left' | 'bottom-right'

const ICON_STACK_GAP = 2
const ICON_STACK_PADDING = 4
const BADGE_GAP = 3
const BADGE_HEIGHT = 17

const normalizeHexLike = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, '')

const isNearWhiteColor = (value: string): boolean => {
  const normalized = normalizeHexLike(value)
  return normalized === '#fff' || normalized === '#ffffff' || normalized === 'white'
}

const subordinateBadgeCorner = (iconSpecs: readonly IconSpec[] | undefined): Corner => {
  const iconSpecsOption = fromNullable(iconSpecs)
  if (isNone(iconSpecsOption)) {
    return 'bottom-right'
  }
  if (iconSpecsOption.value.length > 1) {
    return 'bottom-right'
  }
  const firstOption = fromNullable(iconSpecsOption.value[0])
  if (isNone(firstOption)) {
    return 'bottom-right'
  }
  return firstOption.value.pos
}

const iconBlockWidthAtCorner = (
  iconSpecs: readonly IconSpec[] | undefined,
  corner: Corner
): number => {
  const iconSpecsOption = fromNullable(iconSpecs)
  if (isNone(iconSpecsOption) || iconSpecsOption.value.length === 0) {
    return 0
  }
  const safeIconSpecs = iconSpecsOption.value

  if (safeIconSpecs.length === 1) {
    const firstOption = fromNullable(safeIconSpecs[0])
    if (isNone(firstOption)) {
      return 0
    }
    return firstOption.value.pos === corner ? firstOption.value.size : 0
  }

  if (corner !== 'bottom-right') {
    return 0
  }

  const iconWidths = safeIconSpecs.map((spec) => spec.size)
  const totalIconWidth = iconWidths.reduce((sum, width) => sum + width, 0)
  const totalGapWidth = ICON_STACK_GAP * Math.max(0, safeIconSpecs.length - 1)
  return totalIconWidth + totalGapWidth
}

type DirectSubordinateCandidate = {
  readonly kind: 'employee' | 'department' | 'vacancy'
  readonly isShadow: boolean
}

type DirectSubordinateCountInput = {
  readonly node: IndexedTreeNode
  readonly tree: IndexedTree
  readonly cfg: RenderConfig
  readonly shadowIds: ReadonlySet<string>
}

const flattenDepartmentChildren = (
  childIds: readonly string[],
  tree: IndexedTree,
  shadowIds: ReadonlySet<string>
): readonly DirectSubordinateCandidate[] =>
  childIds.reduce<readonly DirectSubordinateCandidate[]>((entries, childId) => {
    const child = tree.nodes.get(childId)
    const childOption = fromNullable(child)
    if (isNone(childOption)) {
      return entries
    }
    const safeChild = childOption.value

    return safeChild.kind === 'department'
      ? [...entries, ...flattenDepartmentChildren(safeChild.children, tree, shadowIds)]
      : [...entries, { kind: safeChild.kind, isShadow: shadowIds.has(childId) }]
  }, [])

const staffDirectCandidates = (
  staffIds: readonly string[],
  shadowIds: ReadonlySet<string>
): readonly DirectSubordinateCandidate[] =>
  staffIds.map((staffId) => ({ kind: 'employee', isShadow: shadowIds.has(staffId) }))

const directSubordinateCount = (input: DirectSubordinateCountInput): number => {
  if (input.node.kind !== 'employee') {
    return 0
  }

  const candidates = [
    ...staffDirectCandidates([...input.node.staffLeft, ...input.node.staffRight], input.shadowIds),
    ...flattenDepartmentChildren(input.node.children, input.tree, input.shadowIds)
  ]

  return countDirectSubordinates(candidates, {
    includeVacancies: input.cfg.subordinateCountIncludeVacancies,
    includeShadows: false
  })
}

type SubordinateBadgeLayout = {
  readonly text: string
  readonly fontSize: number
  readonly badgeX: number
  readonly textX: number
  readonly textY: number
  readonly headCx: number
  readonly headCy: number
  readonly headR: number
  readonly shoulderTopY: number
  readonly shoulderBottomY: number
  readonly shoulderHalfWidth: number
}

type SubordinateBadgeSizing = {
  readonly text: string
  readonly fontSize: number
  readonly iconSize: number
  readonly iconGap: number
  readonly badgeWidth: number
}

type SubordinateBadgeAnchor = {
  readonly badgeX: number
  readonly badgeY: number
}

type SubordinateBadgeAnchorInput = {
  readonly iconSpecs: readonly IconSpec[] | undefined
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly badgeWidth: number
}

type SubordinateBadgeLayoutInput = {
  readonly count: number
  readonly iconSpecs: readonly IconSpec[] | undefined
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly cfg: RenderConfig
}

type RenderSubordinateCountBadgeInput = {
  readonly nodeId: string
  readonly node: IndexedTreeNode
  readonly tree: IndexedTree
  readonly iconSpecs: readonly IconSpec[] | undefined
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
  readonly shadowIds: ReadonlySet<string>
}

type RenderSubordinateBadgeSvgInput = {
  readonly nodeId: string
  readonly layout: SubordinateBadgeLayout
  readonly safeCfg: RenderConfig
  readonly fillColor: string
  readonly textColor: string
}

type RenderSingleNodeBodyAtPositionInput = {
  readonly tree: IndexedTree
  readonly nodeId: string
  readonly node: IndexedTreeNode
  readonly p: { readonly x: number; readonly y: number }
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
  readonly styleMap: ResolvedStyleMap
  readonly textStyles: ResolvedTextStyles
  readonly iconMap: ReadonlyMap<string, readonly IconSpec[]>
  readonly shadowIds: ReadonlySet<string>
}

type ResolveNodeRenderStyleContextInput = {
  readonly nodeId: string
  readonly nodeKind: IndexedTreeNode['kind']
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
  readonly styleMap: ResolvedStyleMap
}

type ResolveStaffRenderStyleContextInput = {
  readonly staffNodeId: string
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
  readonly styleMap: ResolvedStyleMap
  readonly staffParentLookup: Readonly<Record<string, string>>
}

type RenderSingleNodeBodyInput = {
  readonly tree: IndexedTree
  readonly nodeId: string
  readonly node: IndexedTreeNode
  readonly placed: PlacedTree
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
  readonly styleMap: ResolvedStyleMap
  readonly textStyles: ResolvedTextStyles
  readonly iconMap: ReadonlyMap<string, readonly IconSpec[]>
  readonly shadowIds: ReadonlySet<string>
}

type RenderNodeBodiesInput = {
  readonly tree: IndexedTree
  readonly placed: PlacedTree
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
  readonly styleMap: ResolvedStyleMap
  readonly textStyles: ResolvedTextStyles
  readonly iconMap: ReadonlyMap<string, readonly IconSpec[]>
  readonly shadowIds: ReadonlySet<string>
}

type RenderSingleStaffBodyAtPositionInput = {
  readonly staffNode: PlacedStaff['staff'][number]
  readonly p: { readonly x: number; readonly y: number }
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
  readonly styleMap: ResolvedStyleMap
  readonly textStyles: ResolvedTextStyles
  readonly iconMap: ReadonlyMap<string, readonly IconSpec[]>
  readonly staffParentLookup: Readonly<Record<string, string>>
}

type RenderSingleStaffBodyInput = {
  readonly staffNode: PlacedStaff['staff'][number]
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
  readonly styleMap: ResolvedStyleMap
  readonly textStyles: ResolvedTextStyles
  readonly iconMap: ReadonlyMap<string, readonly IconSpec[]>
  readonly staffParentLookup: Readonly<Record<string, string>>
}

type RenderStaffBodiesInput = {
  readonly staff: PlacedStaff
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
  readonly styleMap: ResolvedStyleMap
  readonly textStyles: ResolvedTextStyles
  readonly iconMap: ReadonlyMap<string, readonly IconSpec[]>
  readonly staffParentLookup: Readonly<Record<string, string>>
}

type TrianglePointsForCornerInput = {
  readonly corner: 'upper-left' | 'bottom-right' | 'upper-right' | 'bottom-left'
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly size: number
  readonly triOffset: number
}

type RenderTriangleElementInput = {
  readonly triangleEffect: { readonly color: string } | undefined
  readonly iconSpecs: readonly IconSpec[] | undefined
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

type BuildSingleNodeBodyElementsInput = {
  readonly nodeId: string
  readonly renderStyle: NodeRenderStyleContext
  readonly p: { readonly x: number; readonly y: number }
  readonly w: number
  readonly h: number
  readonly triangleElement: string | undefined
  readonly iconElement: string | undefined
  readonly subordinateBadge: string | undefined
  readonly labelElement: string
}

type BuildSingleNodeBodyVisualFragmentsInput = {
  readonly input: RenderSingleNodeBodyAtPositionInput
  readonly renderStyle: NodeRenderStyleContext
  readonly w: number
  readonly h: number
}

type NodeBodyVisualFragments = {
  readonly triangleElement: string | undefined
  readonly iconElement: string | undefined
  readonly subordinateBadge: string | undefined
  readonly labelElement: string
}

type BuildNodeLabelElementInput = {
  readonly p: { readonly x: number; readonly y: number }
  readonly w: number
  readonly h: number
  readonly nodeLabel: string
  readonly safeCfg: RenderConfig
  readonly textStyles: ResolvedTextStyles
  readonly renderStyle: NodeRenderStyleContext
}

type BuildNodeIconAndBadgeFragmentsInput = {
  readonly input: RenderSingleNodeBodyAtPositionInput
  readonly w: number
  readonly h: number
  readonly renderStyle: NodeRenderStyleContext
}

type BuildStaffLabelElementInput = {
  readonly staffLabel: string
  readonly p: { readonly x: number; readonly y: number }
  readonly w: number
  readonly h: number
  readonly safeCfg: RenderConfig
  readonly textStyles: ResolvedTextStyles
  readonly renderStyle: NodeRenderStyleContext
}

type NodeIconAndBadgeFragments = {
  readonly triangleElement: string | undefined
  readonly iconElement: string | undefined
  readonly subordinateBadge: string | undefined
}

const subordinateBadgeSizing = (count: number, cfg: RenderConfig): SubordinateBadgeSizing => {
  const text = String(count)
  const fontSize = Math.max(10, Math.round(cfg.fontSize * cfg.subordinateCountBadgeFontScale))
  const iconSize = Math.max(9, Math.round(fontSize * 0.9))
  const iconGap = 5
  const textWidth = Math.max(1, text.length) * fontSize * 0.58
  const badgeWidth = Math.round(iconSize + iconGap + textWidth)
  return { text, fontSize, iconSize, iconGap, badgeWidth }
}

const subordinateBadgeAnchor = (input: SubordinateBadgeAnchorInput): SubordinateBadgeAnchor => {
  const corner = subordinateBadgeCorner(input.iconSpecs)
  const iconWidth = iconBlockWidthAtCorner(input.iconSpecs, corner)
  const offsetFromIcons = iconWidth > 0 ? iconWidth + BADGE_GAP : 0
  const badgeX = corner === 'upper-left' || corner === 'bottom-left'
    ? input.x + ICON_STACK_PADDING + offsetFromIcons
    : input.x + input.w - ICON_STACK_PADDING - input.badgeWidth - offsetFromIcons
  const badgeY = corner === 'upper-left' || corner === 'upper-right'
    ? input.y + ICON_STACK_PADDING
    : input.y + input.h - ICON_STACK_PADDING - BADGE_HEIGHT
  return { badgeX, badgeY }
}

const subordinateBadgeLayout = (input: SubordinateBadgeLayoutInput): SubordinateBadgeLayout => {
  const sizing = subordinateBadgeSizing(input.count, input.cfg)
  const anchor = subordinateBadgeAnchor({
    iconSpecs: input.iconSpecs,
    x: input.x,
    y: input.y,
    w: input.w,
    h: input.h,
    badgeWidth: sizing.badgeWidth
  })
  const { text, fontSize, iconSize, iconGap } = sizing
  const { badgeX, badgeY } = anchor
  const textX = badgeX + iconSize + iconGap
  const textY = badgeY + BADGE_HEIGHT / 2 - 0.2
  const headCx = badgeX + iconSize / 2
  const headCy = textY - iconSize * 0.22
  const headR = Math.max(1.5, iconSize * 0.2)
  const shoulderTopY = headCy + headR + 0.8
  const shoulderBottomY = shoulderTopY + Math.max(2.3, iconSize * 0.35)
  const shoulderHalfWidth = Math.max(2.5, iconSize * 0.34)

  return {
    text,
    fontSize,
    badgeX,
    textX,
    textY,
    headCx,
    headCy,
    headR,
    shoulderTopY,
    shoulderBottomY,
    shoulderHalfWidth
  }
}

const renderSubordinateBadgeSvg = (input: RenderSubordinateBadgeSvgInput): string =>
  `<g class="subordinate-count-badge" data-node-id="${escapeXml(input.nodeId)}" data-x="${input.layout.badgeX}"><circle cx="${input.layout.headCx}" cy="${input.layout.headCy}" r="${input.layout.headR}" fill="none" stroke="${input.fillColor}" stroke-width="1.25" /><path d="M ${input.layout.headCx - input.layout.shoulderHalfWidth} ${input.layout.shoulderBottomY} Q ${input.layout.headCx} ${input.layout.shoulderTopY} ${input.layout.headCx + input.layout.shoulderHalfWidth} ${input.layout.shoulderBottomY}" fill="none" stroke="${input.fillColor}" stroke-width="1.25" stroke-linecap="round" /><text x="${input.layout.textX}" y="${input.layout.textY}" text-anchor="start" dominant-baseline="middle" dy="0.03em" font-family="${input.safeCfg.fontFamily}" font-size="${input.layout.fontSize}px" font-weight="600" fill="${input.textColor}">${escapeXml(input.layout.text)}</text></g>`

const renderSubordinateCountBadge = (input: RenderSubordinateCountBadgeInput): string | undefined => {
  if (!input.cfg.showSubordinateCount) {
    return undefined
  }

  const count = directSubordinateCount({
    node: input.node,
    tree: input.tree,
    cfg: input.cfg,
    shadowIds: input.shadowIds
  })
  if (count <= 0) {
    return undefined
  }

  const layout = subordinateBadgeLayout({
    count,
    iconSpecs: input.iconSpecs,
    x: input.x,
    y: input.y,
    w: input.w,
    h: input.h,
    cfg: input.cfg
  })
  const fillColor = input.safeCfg.subordinateCountBadgeFill
  const textColor = isNearWhiteColor(input.safeCfg.subordinateCountBadgeText)
    ? input.safeCfg.subordinateCountBadgeFill
    : input.safeCfg.subordinateCountBadgeText

  return renderSubordinateBadgeSvg({
    nodeId: input.nodeId,
    layout,
    safeCfg: input.safeCfg,
    fillColor,
    textColor
  })
}

const resolveNodeRenderStyleContext = (input: ResolveNodeRenderStyleContextInput): NodeRenderStyleContext => {
  const style = input.styleMap.get(input.nodeId)
  const fill = pipe(
    fromNullable(style?.backgroundColor),
    mapO(escapeXml),
    getOrElse(() => getFillColor(input.nodeKind, input.safeCfg))
  )
  const stroke = pipe(
    fromNullable(style?.borderColor),
    mapO(escapeXml),
    getOrElse(() => input.safeCfg.nodeBorder)
  )
  const textFontSize = pipe(
    fromNullable(toTextStyle(style).fontSize),
    getOrElse(() => input.cfg.fontSize)
  )
  return {
    style,
    fill,
    strokeAttr: style?.borderStyle === 'none' ? '' : ` stroke="${stroke}"`,
    baseTextStyle: toTextStyle(style),
    textFontSize
  }
}

const resolveStaffRenderStyleContext = (input: ResolveStaffRenderStyleContextInput): NodeRenderStyleContext => {
  const parentId = input.staffParentLookup[input.staffNodeId]
  const style = pipe(
    fromNullable(input.styleMap.get(input.staffNodeId)),
    getOrElse(() => {
      const parentIdOption = fromNullable(parentId)
      return isNone(parentIdOption) ? undefined : input.styleMap.get(parentIdOption.value)
    })
  )
  const fill = pipe(
    fromNullable(style?.backgroundColor),
    mapO(escapeXml),
    getOrElse(() => input.safeCfg.employeeFill)
  )
  const stroke = pipe(
    fromNullable(style?.borderColor),
    mapO(escapeXml),
    getOrElse(() => input.safeCfg.nodeBorder)
  )
  const textFontSize = pipe(
    fromNullable(toTextStyle(style).fontSize),
    getOrElse(() => input.cfg.fontSize)
  )
  return {
    style,
    fill,
    strokeAttr: style?.borderStyle === 'none' ? '' : ` stroke="${stroke}"`,
    baseTextStyle: toTextStyle(style),
    textFontSize
  }
}

/** Builds a lookup map from staff node ID to the ID of its parent tree node. */
export const buildStaffParentLookup = (tree: IndexedTree): Readonly<Record<string, string>> => {
  const initialLookup: Record<string, string> = {}
  return Array.from(tree.nodes.entries()).reduce((lookup, [parentId, node]) => {
    const ids = [...node.staffLeft, ...node.staffRight]
    return ids.reduce((nextLookup, id) => ({
      ...nextLookup,
      [id]: parentId
    }), lookup)
  }, initialLookup)
}

const resolveTriangleCorner = (iconPos: string): 'upper-left' | 'bottom-right' | 'upper-right' | 'bottom-left' => {
  if (iconPos === 'upper-left') {
    return 'bottom-right'
  }
  if (iconPos === 'bottom-left') {
    return 'upper-right'
  }
  if (iconPos === 'upper-right') {
    return 'bottom-left'
  }
  return 'upper-left'
}

const trianglePointsForCorner = (input: TrianglePointsForCornerInput): string => {
  switch (input.corner) {
    case 'upper-left':
      return `${input.x + input.triOffset},${input.y + input.triOffset} ${input.x + input.size + input.triOffset},${input.y + input.triOffset} ${input.x + input.triOffset},${input.y + input.size + input.triOffset}`
    case 'bottom-right':
      return `${input.x + input.w - input.triOffset},${input.y + input.h - input.triOffset} ${input.x + input.w - input.size - input.triOffset},${input.y + input.h - input.triOffset} ${input.x + input.w - input.triOffset},${input.y + input.h - input.size - input.triOffset}`
    case 'upper-right':
      return `${input.x + input.w - input.triOffset},${input.y + input.triOffset} ${input.x + input.w - input.size - input.triOffset},${input.y + input.triOffset} ${input.x + input.w - input.triOffset},${input.y + input.size + input.triOffset}`
    case 'bottom-left':
      return `${input.x + input.triOffset},${input.y + input.h - input.triOffset} ${input.x + input.size + input.triOffset},${input.y + input.h - input.triOffset} ${input.x + input.triOffset},${input.y + input.h - input.size - input.triOffset}`
  }
}

const renderTriangleElement = (input: RenderTriangleElementInput): string | undefined => {
  const colorOption = fromNullable(input.triangleEffect?.color)
  if (isNone(colorOption)) {
    return undefined
  }

  const iconPos = pipe(
    fromNullable(input.iconSpecs),
    flatMapO((iconSpecs) => fromNullable(iconSpecs[0])),
    flatMapO((iconSpec) => fromNullable(iconSpec.pos)),
    getOrElse(() => 'bottom-right')
  )
  const corner = resolveTriangleCorner(iconPos)
  const size = Math.max(12, Math.min(input.w, input.h) * 0.18)
  const triOffset = 3
  const points = trianglePointsForCorner({ corner, x: input.x, y: input.y, w: input.w, h: input.h, size, triOffset })
  return `<polygon points="${points}" fill="${escapeXml(colorOption.value)}" />`
}

const buildSingleNodeBodyElements = (input: BuildSingleNodeBodyElementsInput): readonly string[] => [
  `<rect id="${escapeXml(input.nodeId)}" class="node" x="${input.p.x}" y="${input.p.y}" width="${input.w}" height="${input.h}" fill="${input.renderStyle.fill}"${input.renderStyle.strokeAttr}${strokeWidthAttr(pipe(fromNullable(input.renderStyle.style?.borderWidth), getOrElse(() => 2)))}${rectStrokeStyleAttrs(input.renderStyle.style)} />`,
  ...optionalElement(input.triangleElement),
  ...optionalElement(input.iconElement),
  ...optionalElement(input.subordinateBadge),
  input.labelElement
]

const buildNodeLabelElement = (input: BuildNodeLabelElementInput): string => {
  const maxCharsPerLine = Math.max(10, Math.floor((input.w - 12) / (input.renderStyle.textFontSize * 0.52)))
  const styledLines = buildStyledLabelLines(input.nodeLabel, maxCharsPerLine)
  const fittedNodeFont = fitFontSizeToBox({
    lines: styledLines.map((line) => line.text),
    baseFontSize: input.renderStyle.textFontSize,
    boxWidth: input.w,
    boxHeight: input.h,
    minFontSize: 9
  })
  return renderStyledLabelElement({
    tx: input.p.x + input.w / 2,
    ty: input.p.y + input.h / 2,
    fontFamily: input.safeCfg.fontFamily,
    styledLines,
    textStyles: input.textStyles,
    baseTextStyle: input.renderStyle.baseTextStyle,
    fittedFont: fittedNodeFont,
    fallbackText: ''
  })
}

const buildNodeIconAndBadgeFragments = (input: BuildNodeIconAndBadgeFragmentsInput): NodeIconAndBadgeFragments => {
  const iconSpecs = input.input.iconMap.get(input.input.nodeId)
  const iconElement = renderOptionalIconElement({
    iconSpecs,
    x: input.input.p.x,
    y: input.input.p.y,
    w: input.w,
    h: input.h,
    style: input.renderStyle.style,
    cfg: input.input.cfg
  })
  const subordinateBadge = renderSubordinateCountBadge({
    nodeId: input.input.nodeId,
    node: input.input.node,
    tree: input.input.tree,
    iconSpecs,
    x: input.input.p.x,
    y: input.input.p.y,
    w: input.w,
    h: input.h,
    cfg: input.input.cfg,
    safeCfg: input.input.safeCfg,
    shadowIds: input.input.shadowIds
  })
  const triangleElement = renderTriangleElement({
    triangleEffect: input.input.node.triangleEffect,
    iconSpecs,
    x: input.input.p.x,
    y: input.input.p.y,
    w: input.w,
    h: input.h
  })

  return {
    triangleElement,
    iconElement,
    subordinateBadge
  }
}

const buildStaffLabelElement = (input: BuildStaffLabelElementInput): string => {
  const maxCharsPerLine = Math.max(8, Math.floor((input.w - 8) / (input.renderStyle.textFontSize * 0.48)))
  const styledLines = buildStyledLabelLines(input.staffLabel, maxCharsPerLine)
  const fittedStaffFont = fitFontSizeToBox({
    lines: styledLines.map((line) => line.text),
    baseFontSize: input.renderStyle.textFontSize,
    boxWidth: input.w,
    boxHeight: input.h,
    minFontSize: 8
  })
  return renderStyledLabelElement({
    tx: input.p.x + input.w / 2,
    ty: input.p.y + input.h / 2,
    fontFamily: input.safeCfg.fontFamily,
    styledLines,
    textStyles: input.textStyles,
    baseTextStyle: input.renderStyle.baseTextStyle,
    fittedFont: fittedStaffFont,
    fallbackText: input.staffLabel
  })
}

const buildSingleNodeBodyVisualFragments = (input: BuildSingleNodeBodyVisualFragmentsInput): NodeBodyVisualFragments => {
  const iconAndBadges = buildNodeIconAndBadgeFragments({
    input: input.input,
    w: input.w,
    h: input.h,
    renderStyle: input.renderStyle
  })
  const labelElement = buildNodeLabelElement({
    p: input.input.p,
    w: input.w,
    h: input.h,
    nodeLabel: input.input.node.label,
    safeCfg: input.input.safeCfg,
    textStyles: input.input.textStyles,
    renderStyle: input.renderStyle
  })

  return {
    triangleElement: iconAndBadges.triangleElement,
    iconElement: iconAndBadges.iconElement,
    subordinateBadge: iconAndBadges.subordinateBadge,
    labelElement
  }
}

const renderSingleNodeBodyAtPosition = (input: RenderSingleNodeBodyAtPositionInput): SectionRender => {
  const w = input.cfg.nodeSize * input.cfg.colWidth
  const h = input.cfg.nodeSize * input.cfg.rowHeight
  const renderStyle = resolveNodeRenderStyleContext({
    nodeId: input.nodeId,
    nodeKind: input.node.kind,
    cfg: input.cfg,
    safeCfg: input.safeCfg,
    styleMap: input.styleMap
  })
  const visualFragments = buildSingleNodeBodyVisualFragments({
    input,
    renderStyle,
    w,
    h
  })

  return {
    elements: buildSingleNodeBodyElements({
      nodeId: input.nodeId,
      renderStyle,
      p: input.p,
      w,
      h,
      triangleElement: visualFragments.triangleElement,
      iconElement: visualFragments.iconElement,
      subordinateBadge: visualFragments.subordinateBadge,
      labelElement: visualFragments.labelElement
    }),
    bounds: boundsFromRect({ x: input.p.x, y: input.p.y, w, h })
  }
}

const renderSingleNodeBody = (input: RenderSingleNodeBodyInput): SectionRender => {
  if (input.shadowIds.has(input.nodeId)) {
    return { elements: [], bounds: emptyRenderBounds() }
  }

  const posOption = fromNullable(input.placed.positions.get(input.nodeId))
  if (isNone(posOption)) {
    return { elements: [], bounds: emptyRenderBounds() }
  }
  const pos = posOption.value

  return renderSingleNodeBodyAtPosition({
    tree: input.tree,
    nodeId: input.nodeId,
    node: input.node,
    p: gridToPixels(pos.x, pos.y, input.cfg),
    cfg: input.cfg,
    safeCfg: input.safeCfg,
    styleMap: input.styleMap,
    textStyles: input.textStyles,
    iconMap: input.iconMap,
    shadowIds: input.shadowIds
  })
}

/** Builds SVG rect and label elements for all non-shadow tree nodes. */
export const renderNodeBodies = (
  input: RenderNodeBodiesInput
): SectionRender => Array.from(input.tree.nodes.entries()).reduce<SectionRender>(
  (state, [nodeId, node]) => mergeSectionRender(state, renderSingleNodeBody({
    tree: input.tree,
    nodeId,
    node,
    placed: input.placed,
    cfg: input.cfg,
    safeCfg: input.safeCfg,
    styleMap: input.styleMap,
    textStyles: input.textStyles,
    iconMap: input.iconMap,
    shadowIds: input.shadowIds
  })),
  { elements: [], bounds: emptyRenderBounds() }
)

const renderSingleStaffBodyAtPosition = (input: RenderSingleStaffBodyAtPositionInput): SectionRender => {
  const w = input.cfg.staffSize * input.cfg.colWidth
  const h = input.cfg.staffSize * input.cfg.rowHeight
  const renderStyle = resolveStaffRenderStyleContext({
    staffNodeId: input.staffNode.id,
    cfg: input.cfg,
    safeCfg: input.safeCfg,
    styleMap: input.styleMap,
    staffParentLookup: input.staffParentLookup
  })
  const iconElement = renderOptionalIconElement({
    iconSpecs: input.iconMap.get(input.staffNode.id),
    x: input.p.x,
    y: input.p.y,
    w,
    h,
    style: renderStyle.style,
    cfg: input.cfg
  })
  const labelElement = buildStaffLabelElement({
    staffLabel: input.staffNode.label,
    p: input.p,
    w,
    h,
    safeCfg: input.safeCfg,
    textStyles: input.textStyles,
    renderStyle
  })

  return {
    elements: [
      `<rect id="${escapeXml(input.staffNode.id)}" class="staff" x="${input.p.x}" y="${input.p.y}" width="${w}" height="${h}" fill="${renderStyle.fill}"${renderStyle.strokeAttr}${strokeWidthAttr(pipe(fromNullable(renderStyle.style?.borderWidth), getOrElse(() => 1)))} opacity="0.7"${rectStrokeStyleAttrs(renderStyle.style)} />`,
      ...optionalElement(iconElement),
      labelElement
    ],
    bounds: boundsFromRect({ x: input.p.x, y: input.p.y, w, h })
  }
}

const renderSingleStaffBody = (input: RenderSingleStaffBodyInput): SectionRender =>
  renderSingleStaffBodyAtPosition({
    staffNode: input.staffNode,
    p: gridToPixels(input.staffNode.x, input.staffNode.y, input.cfg),
    cfg: input.cfg,
    safeCfg: input.safeCfg,
    styleMap: input.styleMap,
    textStyles: input.textStyles,
    iconMap: input.iconMap,
    staffParentLookup: input.staffParentLookup
  })

/** Builds SVG rect and label elements for all staff nodes. */
export const renderStaffBodies = (
  input: RenderStaffBodiesInput
): SectionRender => input.staff.staff.reduce<SectionRender>(
  (state, staffNode) => mergeSectionRender(state, renderSingleStaffBody({
    staffNode,
    cfg: input.cfg,
    safeCfg: input.safeCfg,
    styleMap: input.styleMap,
    textStyles: input.textStyles,
    iconMap: input.iconMap,
    staffParentLookup: input.staffParentLookup
  })),
  { elements: [], bounds: emptyRenderBounds() }
)
