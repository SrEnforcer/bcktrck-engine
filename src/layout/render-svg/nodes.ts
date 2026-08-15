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

import { fromNullable, getOrElseOption, isNone, mapOption, matchOption, pipe } from '@tsfpp/prelude'
import type { IconSpec } from '../../icons/render'
import type { ResolvedStyleMap, ResolvedTextStyles } from '../../style/dsl'
import type { IndexedTree, PlacedTree, PlacedStaff, RenderConfig } from '../types'
import { toTextStyle } from './text'
import {
  boundsFromRect,
  emptyRenderBounds,
  escapeXml,
  getFillColor,
  gridToPixels,
  mergeSectionRender,
  rectStrokeStyleAttrs,
  strokeWidthAttr,
  type IndexedTreeNode,
  type NodeRenderStyleContext,
  type SectionRender,
} from './shared'
import {
  buildSingleNodeBodyElements,
  buildSingleNodeBodyVisualFragments,
  buildStaffLabelElement,
  optionalElement,
  renderOptionalIconElement,
} from './nodes-fragments'

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

const resolveNodeRenderStyleContext = (input: ResolveNodeRenderStyleContextInput): NodeRenderStyleContext => {
  const style = input.styleMap.get(input.nodeId)
  const fill = pipe(
    fromNullable(style?.backgroundColor),
    mapOption(escapeXml),
    getOrElseOption(() => getFillColor(input.nodeKind, input.safeCfg))
  )
  const stroke = pipe(
    fromNullable(style?.borderColor),
    mapOption(escapeXml),
    getOrElseOption(() => input.safeCfg.nodeBorder)
  )
  const textFontSize = pipe(
    fromNullable(toTextStyle(style).fontSize),
    getOrElseOption(() => input.cfg.fontSize)
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
    getOrElseOption(() => {
      const parentIdOption = fromNullable(parentId)
      return matchOption(() => undefined, (value: string) => input.styleMap.get(value))(parentIdOption)
    })
  )
  const fill = pipe(
    fromNullable(style?.backgroundColor),
    mapOption(escapeXml),
    getOrElseOption(() => input.safeCfg.employeeFill)
  )
  const stroke = pipe(
    fromNullable(style?.borderColor),
    mapOption(escapeXml),
    getOrElseOption(() => input.safeCfg.nodeBorder)
  )
  const textFontSize = pipe(
    fromNullable(toTextStyle(style).fontSize),
    getOrElseOption(() => input.cfg.fontSize)
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
      `<rect id="${escapeXml(input.staffNode.id)}" class="staff" x="${input.p.x}" y="${input.p.y}" width="${w}" height="${h}" fill="${renderStyle.fill}"${renderStyle.strokeAttr}${strokeWidthAttr(pipe(fromNullable(renderStyle.style?.borderWidth), getOrElseOption(() => 1)))} opacity="0.7"${rectStrokeStyleAttrs(renderStyle.style)} />`,
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
