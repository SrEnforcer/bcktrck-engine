/**
 * PURE CORE — no side-effects; all I/O enters via parameters.
 *
 * Staff connector and solid edge SVG element renderers.
 */

import type { ResolvedStyleMap } from '../../style/dsl'
import type { EdgeRoute, IndexedTree, PlacedTree, PlacedStaff, RenderConfig } from '../types'
import {
  boundsFromRect,
  edgeStrokeStyleAttrs,
  emptyRenderBounds,
  expandBoundsWithPoints,
  gridToPixels,
  mergeRenderBounds,
  strokeWidthAttr,
  type IndexedTreeNode,
  type RenderBounds,
  type SectionRender,
} from './shared'

type StaffLookup = Readonly<Record<string, PlacedStaff['staff'][number]>>

type RenderOneStaffConnectorInput = {
  readonly x1: number
  readonly x2: number
  readonly y: number
  readonly safeCfg: RenderConfig
}

type RenderStaffConnectorSideInput = {
  readonly staffIds: readonly string[]
  readonly isLeft: boolean
  readonly parentX: number
  readonly parentCy: number
  readonly nodeW: number
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
  readonly staffById: StaffLookup
  readonly sideState: SectionRender
}

type RenderStaffConnectorsForParentInput = {
  readonly state: SectionRender
  readonly parentId: string
  readonly node: IndexedTreeNode
  readonly placed: PlacedTree
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
  readonly staffById: StaffLookup
}

type RenderStaffConnectorsInput = {
  readonly tree: IndexedTree
  readonly placed: PlacedTree
  readonly staff: PlacedStaff
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
}

type RenderRoutedSolidEdgesInput = {
  readonly edgeRoutes: readonly EdgeRoute[]
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
  readonly staffShadowIds: ReadonlySet<string>
}

type RenderFallbackSolidEdgesInput = {
  readonly tree: IndexedTree
  readonly placed: PlacedTree
  readonly cfg: RenderConfig
  readonly styleMap: ResolvedStyleMap
  readonly safeCfg: RenderConfig
  readonly staffShadowIds: ReadonlySet<string>
}

type RenderSolidEdgesInput = {
  readonly tree: IndexedTree
  readonly placed: PlacedTree
  readonly cfg: RenderConfig
  readonly edgeRoutes: readonly EdgeRoute[]
  readonly styleMap: ResolvedStyleMap
  readonly safeCfg: RenderConfig
  readonly staffShadowIds: ReadonlySet<string>
}

const buildStaffLookup = (staff: PlacedStaff): StaffLookup =>
  staff.staff.reduce<StaffLookup>((lookup, staffNode) => ({
    ...lookup,
    [staffNode.id]: staffNode
  }), {})

const renderOneStaffConnector = (
  input: RenderOneStaffConnectorInput
): { readonly element: string; readonly bounds: RenderBounds } => ({
  element: `<line class="staff-edge" x1="${input.x1}" y1="${input.y}" x2="${input.x2}" y2="${input.y}" stroke="${input.safeCfg.edgeStroke}" stroke-width="1.25" stroke-dasharray="3 3" opacity="0.55" />`,
  bounds: { minX: Math.min(input.x1, input.x2), minY: input.y, maxX: Math.max(input.x1, input.x2), maxY: input.y }
})

const renderStaffConnectorSide = (
  input: RenderStaffConnectorSideInput
): SectionRender =>
  input.staffIds.reduce<SectionRender>((nextSideState, staffId) => {
    const staffPos = input.staffById[staffId]
    if (staffPos === undefined) {
      return nextSideState
    }

    const staffX = staffPos.x * input.cfg.colWidth
    const staffW = input.cfg.staffSize * input.cfg.colWidth
    const x1 = input.isLeft ? input.parentX : input.parentX + input.nodeW
    const x2 = input.isLeft ? staffX + staffW : staffX
    const rendered = renderOneStaffConnector({ x1, x2, y: input.parentCy, safeCfg: input.safeCfg })

    return {
      elements: [...nextSideState.elements, rendered.element],
      bounds: mergeRenderBounds(nextSideState.bounds, rendered.bounds)
    }
  }, input.sideState)

const renderStaffConnectorsForParent = (
  input: RenderStaffConnectorsForParentInput
): SectionRender => {
  const parentPos = input.placed.positions.get(input.parentId)
  if (parentPos === undefined) {
    return input.state
  }

  const nodeW = input.cfg.nodeSize * input.cfg.colWidth
  const nodeH = input.cfg.nodeSize * input.cfg.rowHeight
  const parentX = parentPos.x * input.cfg.colWidth
  const parentY = parentPos.y * input.cfg.rowHeight
  const parentCy = parentY + nodeH / 2
  const leftState = renderStaffConnectorSide({
    staffIds: input.node.staffLeft,
    isLeft: true,
    parentX,
    parentCy,
    nodeW,
    cfg: input.cfg,
    safeCfg: input.safeCfg,
    staffById: input.staffById,
    sideState: input.state
  })
  return renderStaffConnectorSide({
    staffIds: input.node.staffRight,
    isLeft: false,
    parentX,
    parentCy,
    nodeW,
    cfg: input.cfg,
    safeCfg: input.safeCfg,
    staffById: input.staffById,
    sideState: leftState
  })
}

/** Builds SVG elements for all staff connector lines in the tree. */
export const renderStaffConnectors = (
  input: RenderStaffConnectorsInput
): SectionRender => {
  const staffById = buildStaffLookup(input.staff)

  return Array.from(input.tree.nodes.entries()).reduce<SectionRender>(
    (state, [parentId, node]) => renderStaffConnectorsForParent({
      state,
      parentId,
      node,
      placed: input.placed,
      cfg: input.cfg,
      safeCfg: input.safeCfg,
      staffById
    }),
    { elements: [], bounds: emptyRenderBounds() }
  )
}

const renderRoutedSolidEdges = (
  input: RenderRoutedSolidEdgesInput
): SectionRender => input.edgeRoutes.reduce<SectionRender>((state, route) => {
  if (input.staffShadowIds.has(route.toId)) {
    return state
  }
  const pixels = route.points.map((pt) => ({ x: pt.x * input.cfg.colWidth, y: pt.y * input.cfg.rowHeight }))
  if (pixels.length < 2) {
    return state
  }

  const pointsAttr = pixels.map((pt) => `${pt.x},${pt.y}`).join(' ')
  const element = `<polyline class="edge" points="${pointsAttr}" fill="none" stroke="${input.safeCfg.edgeStroke}"${strokeWidthAttr(route.edgeWidth ?? 2)}${edgeStrokeStyleAttrs(route.edgeStyle)} />`
  return {
    elements: [...state.elements, element],
    bounds: expandBoundsWithPoints(state.bounds, pixels)
  }
}, { elements: [], bounds: emptyRenderBounds() })

const renderFallbackSolidEdges = (
  input: RenderFallbackSolidEdgesInput
): SectionRender => Array.from(input.tree.nodes.entries()).reduce<SectionRender>((state, [nodeId, node]) => {
  const parentPos = input.placed.positions.get(nodeId)
  if (parentPos === undefined || node.children.length === 0) {
    return state
  }

  const parentPixels = gridToPixels(parentPos.x, parentPos.y, input.cfg)
  return node.children.reduce<SectionRender>((childState, childId) => {
    const childNode = input.tree.nodes.get(childId)
    const childPos = input.placed.positions.get(childId)
    if (childNode === undefined || childPos === undefined || input.staffShadowIds.has(childId)) {
      return childState
    }

    const childPixels = gridToPixels(childPos.x, childPos.y, input.cfg)
    const x1 = parentPixels.x + (input.cfg.nodeSize * input.cfg.colWidth) / 2
    const y1 = parentPixels.y + input.cfg.nodeSize * input.cfg.rowHeight
    const x2 = childPixels.x + (input.cfg.nodeSize * input.cfg.colWidth) / 2
    const y2 = childPixels.y
    const edgeStyle = input.styleMap.get(childId)?.edgeStyle
    const edgeWidth = input.styleMap.get(childId)?.edgeWidth
    const element = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${input.safeCfg.edgeStroke}"${strokeWidthAttr(edgeWidth ?? 2)}${edgeStrokeStyleAttrs(edgeStyle)} />`

    return {
      elements: [...childState.elements, element],
      bounds: mergeRenderBounds(
        childState.bounds,
        boundsFromRect({ x: childPixels.x, y: childPixels.y, w: input.cfg.nodeSize * input.cfg.colWidth, h: input.cfg.nodeSize * input.cfg.rowHeight })
      )
    }
  }, state)
}, { elements: [], bounds: emptyRenderBounds() })

/** Builds SVG polyline/line elements for all solid (non-dotted) edges. */
export const renderSolidEdges = (
  input: RenderSolidEdgesInput
): SectionRender => input.edgeRoutes.length > 0
  ? renderRoutedSolidEdges({
      edgeRoutes: input.edgeRoutes,
      cfg: input.cfg,
      safeCfg: input.safeCfg,
      staffShadowIds: input.staffShadowIds
    })
  : renderFallbackSolidEdges({
      tree: input.tree,
      placed: input.placed,
      cfg: input.cfg,
      styleMap: input.styleMap,
      safeCfg: input.safeCfg,
      staffShadowIds: input.staffShadowIds
    })
