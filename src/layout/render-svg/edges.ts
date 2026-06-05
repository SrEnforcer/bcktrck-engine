/**
 * @module layout/render-svg/edges
 *
 * Rendering helper module for SVG projection internals.
 *
 * @packageDocumentation
 */

/**
 * PURE CORE — no side-effects; all I/O enters via parameters.
 *
 * Staff connector and solid edge SVG element renderers.
 */

import type { ResolvedStyleMap } from '../../style/dsl'
import { fromNullable, getOrElse, isSome, pipe } from '@tsfpp/prelude'
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

type StaffConnectorChainState = {
  readonly section: SectionRender
  readonly previousOutX: number | undefined
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

const parentSideStartX = (isLeft: boolean, parentX: number, nodeW: number): number =>
  isLeft ? parentX : parentX + nodeW

const staffSideTargetX = (isLeft: boolean, staffX: number, staffW: number): number =>
  isLeft ? staffX + staffW : staffX

const staffSideOutboundX = (isLeft: boolean, staffX: number, staffW: number): number =>
  isLeft ? staffX : staffX + staffW

const staffCenterY = (staffY: number, cfg: RenderConfig): number =>
  staffY + (cfg.staffSize * cfg.rowHeight) / 2

const staffBranchStartX = (
  input: Readonly<{
    readonly isLeft: boolean
    readonly parentX: number
    readonly nodeW: number
    readonly parentCy: number
    readonly connectorY: number
  }>
): number =>
  Math.abs(input.connectorY - input.parentCy) < 0.001
    ? parentSideStartX(input.isLeft, input.parentX, input.nodeW)
    : input.parentX + input.nodeW / 2

const renderStaffConnectorSide = (
  input: RenderStaffConnectorSideInput
): SectionRender =>
  input.staffIds.reduce<StaffConnectorChainState>((nextSideState, staffId) => {
    const staffPosOption = fromNullable(input.staffById[staffId])
    if (isSome(staffPosOption)) {
      const staffPos = staffPosOption.value
      const staffX = staffPos.x * input.cfg.colWidth
      const connectorY = staffCenterY(staffPos.y * input.cfg.rowHeight, input.cfg)
      const staffW = input.cfg.staffSize * input.cfg.colWidth
      const x1 = pipe(
        fromNullable(nextSideState.previousOutX),
        getOrElse(() => staffBranchStartX({
          isLeft: input.isLeft,
          parentX: input.parentX,
          nodeW: input.nodeW,
          parentCy: input.parentCy,
          connectorY
        }))
      )
      const x2 = staffSideTargetX(input.isLeft, staffX, staffW)
      const rendered = renderOneStaffConnector({ x1, x2, y: connectorY, safeCfg: input.safeCfg })

      return {
        section: {
          elements: [...nextSideState.section.elements, rendered.element],
          bounds: mergeRenderBounds(nextSideState.section.bounds, rendered.bounds)
        },
        previousOutX: staffSideOutboundX(input.isLeft, staffX, staffW)
      }
    }
    return nextSideState
  }, { section: input.sideState, previousOutX: undefined }).section

const renderStaffConnectorsForParent = (
  input: RenderStaffConnectorsForParentInput
): SectionRender => {
  const parentPosOption = fromNullable(input.placed.positions.get(input.parentId))
  if (isSome(parentPosOption)) {
    const parentPos = parentPosOption.value
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
  return input.state
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
  const edgeWidth = pipe(fromNullable(route.edgeWidth), getOrElse(() => 2))
  const element = `<polyline class="edge" points="${pointsAttr}" fill="none" stroke="${input.safeCfg.edgeStroke}"${strokeWidthAttr(edgeWidth)}${edgeStrokeStyleAttrs(route.edgeStyle)} />`
  return {
    elements: [...state.elements, element],
    bounds: expandBoundsWithPoints(state.bounds, pixels)
  }
}, { elements: [], bounds: emptyRenderBounds() })

const renderFallbackSolidEdges = (
  input: RenderFallbackSolidEdgesInput
): SectionRender => Array.from(input.tree.nodes.entries()).reduce<SectionRender>((state, [nodeId, node]) => {
  const parentPosOption = fromNullable(input.placed.positions.get(nodeId))
  if (isSome(parentPosOption) && node.children.length > 0) {
    const parentPos = parentPosOption.value
    const parentPixels = gridToPixels(parentPos.x, parentPos.y, input.cfg)
    return node.children.reduce<SectionRender>((childState, childId) => {
      const childNodeOption = fromNullable(input.tree.nodes.get(childId))
      const childPosOption = fromNullable(input.placed.positions.get(childId))
      if (isSome(childNodeOption) && isSome(childPosOption) && !input.staffShadowIds.has(childId)) {
        const childPos = childPosOption.value
        const childPixels = gridToPixels(childPos.x, childPos.y, input.cfg)
        const x1 = parentPixels.x + (input.cfg.nodeSize * input.cfg.colWidth) / 2
        const y1 = parentPixels.y + input.cfg.nodeSize * input.cfg.rowHeight
        const x2 = childPixels.x + (input.cfg.nodeSize * input.cfg.colWidth) / 2
        const y2 = childPixels.y
        const edgeStyle = input.styleMap.get(childId)?.edgeStyle
        const widthValue = input.styleMap.get(childId)?.edgeWidth
        const edgeWidth = pipe(fromNullable(widthValue), getOrElse(() => 2))
        const element = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${input.safeCfg.edgeStroke}"${strokeWidthAttr(edgeWidth)}${edgeStrokeStyleAttrs(edgeStyle)} />`

        return {
          elements: [...childState.elements, element],
          bounds: mergeRenderBounds(
            childState.bounds,
            boundsFromRect({ x: childPixels.x, y: childPixels.y, w: input.cfg.nodeSize * input.cfg.colWidth, h: input.cfg.nodeSize * input.cfg.rowHeight })
          )
        }
      }
      return childState
    }, state)
  }
  return state
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
