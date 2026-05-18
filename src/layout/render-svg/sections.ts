/**
 * @module layout/render-svg/sections
 *
 * Rendering helper module for SVG projection internals.
 *
 * @packageDocumentation
 */

/**
 * PURE CORE — no side-effects; all I/O enters via parameters.
 *
 * Projection orchestrator: assembles all section renders into a final SVG document.
 */

import type { DottedEdge, ShadowNode } from '../../types/org-tree'
import type { IconSpec } from '../../icons/render'
import type { ResolvedStyleMap, ResolvedTextStyles } from '../../style/dsl'
import type { EdgeRoute, IndexedTree, PlacedTree, PlacedStaff, RenderConfig, RenderResult } from '../types'
import { renderDottedEdges } from './dotted'
import { renderSolidEdges, renderStaffConnectors } from './edges'
import { buildShadowBoundsMap, renderShadowBodies } from './shadows'
import { buildStaffParentLookup, renderNodeBodies, renderStaffBodies } from './nodes'
import {
  mergeAllBounds,
  sanitizeRenderConfig,
  type ProjectionSections,
  type RenderBounds,
} from './shared'

type ProjectionInput = {
  readonly tree: IndexedTree
  readonly placed: PlacedTree
  readonly staff: PlacedStaff
  readonly cfg: RenderConfig
  readonly dottedEdges: readonly DottedEdge[]
  readonly shadowNodes: readonly ShadowNode[]
  readonly edgeRoutes: readonly EdgeRoute[]
  readonly styleMap: ResolvedStyleMap
  readonly textStyles: ResolvedTextStyles
  readonly iconMap: ReadonlyMap<string, readonly IconSpec[]>
}

type BuildProjectionSectionsInput = {
  readonly tree: IndexedTree
  readonly placed: PlacedTree
  readonly staff: PlacedStaff
  readonly cfg: RenderConfig
  readonly dottedEdges: readonly DottedEdge[]
  readonly shadowNodes: readonly ShadowNode[]
  readonly edgeRoutes: readonly EdgeRoute[]
  readonly styleMap: ResolvedStyleMap
  readonly textStyles: ResolvedTextStyles
  readonly iconMap: ReadonlyMap<string, readonly IconSpec[]>
  readonly safeCfg: RenderConfig
}

type ProjectionRenderDependencies = {
  readonly shadowIds: ReadonlySet<string>
  readonly staffShadowIds: ReadonlySet<string>
  readonly staffParentLookup: Readonly<Record<string, string>>
  readonly shadowBoundsMap: ReturnType<typeof buildShadowBoundsMap>
}

const buildProjectionRenderDependencies = (
  input: BuildProjectionSectionsInput
): ProjectionRenderDependencies => {
  // DEVIATION(1.9): Membership checks for shadow node IDs are performance-critical in this rendering boundary; Set is used for O(1) lookups.
  // eslint-disable-next-line no-restricted-syntax -- DEVIATION(1.9): boundary-level render aggregation requires efficient ID membership checks.
  const shadowIds = new Set<string>(input.shadowNodes.map((shadow) => String(shadow.id)))
  // DEVIATION(1.9): Staff-shadow filtering during edge rendering relies on fast lookup semantics.
  // eslint-disable-next-line no-restricted-syntax -- DEVIATION(1.9): boundary-level render aggregation requires efficient ID membership checks.
  const staffShadowIds = new Set<string>(input.shadowNodes
    .filter((shadow) => shadow.type === 'staff')
    .map((shadow) => String(shadow.id)))

  return {
    shadowIds,
    staffShadowIds,
    staffParentLookup: buildStaffParentLookup(input.tree),
    shadowBoundsMap: buildShadowBoundsMap({
      shadowNodes: input.shadowNodes,
      placed: input.placed,
      staff: input.staff,
      cfg: input.cfg,
      styleMap: input.styleMap
    })
  }
}

const buildProjectionSections = (
  input: BuildProjectionSectionsInput
): ProjectionSections => {
  const {
    tree,
    placed,
    staff,
    cfg,
    dottedEdges,
    shadowNodes,
    edgeRoutes,
    styleMap,
    textStyles,
    iconMap,
    safeCfg
  } = input

  const dependencies = buildProjectionRenderDependencies(input)

  return buildSectionRenders({
    tree,
    placed,
    staff,
    cfg,
    dottedEdges,
    shadowNodes,
    edgeRoutes,
    styleMap,
    textStyles,
    iconMap,
    safeCfg,
    dependencies
  })
}

type BuildSectionRendersInput = {
  readonly tree: IndexedTree
  readonly placed: PlacedTree
  readonly staff: PlacedStaff
  readonly cfg: RenderConfig
  readonly dottedEdges: readonly DottedEdge[]
  readonly shadowNodes: readonly ShadowNode[]
  readonly edgeRoutes: readonly EdgeRoute[]
  readonly styleMap: ResolvedStyleMap
  readonly textStyles: ResolvedTextStyles
  readonly iconMap: ReadonlyMap<string, readonly IconSpec[]>
  readonly safeCfg: RenderConfig
  readonly dependencies: ProjectionRenderDependencies
}

type BuildEdgeAndShadowSectionsInput = {
  readonly tree: IndexedTree
  readonly placed: PlacedTree
  readonly staff: PlacedStaff
  readonly cfg: RenderConfig
  readonly dottedEdges: readonly DottedEdge[]
  readonly shadowNodes: readonly ShadowNode[]
  readonly edgeRoutes: readonly EdgeRoute[]
  readonly styleMap: ResolvedStyleMap
  readonly textStyles: ResolvedTextStyles
  readonly safeCfg: RenderConfig
  readonly dependencies: ProjectionRenderDependencies
}

type BuildNodeAndStaffSectionsInput = {
  readonly tree: IndexedTree
  readonly placed: PlacedTree
  readonly staff: PlacedStaff
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
  readonly styleMap: ResolvedStyleMap
  readonly textStyles: ResolvedTextStyles
  readonly iconMap: ReadonlyMap<string, readonly IconSpec[]>
  readonly dependencies: ProjectionRenderDependencies
}

const buildEdgeAndShadowSections = (input: BuildEdgeAndShadowSectionsInput): Pick<ProjectionSections, 'dottedRender' | 'solidEdgeRender' | 'staffConnectorRender' | 'shadowBodyRender'> => ({
  dottedRender: renderDottedEdges({
    dottedEdges: input.dottedEdges,
    placed: input.placed,
    staff: input.staff,
    cfg: input.cfg,
    safeCfg: input.safeCfg,
    shadowBoundsMap: input.dependencies.shadowBoundsMap
  }),
  solidEdgeRender: renderSolidEdges({
    tree: input.tree,
    placed: input.placed,
    cfg: input.cfg,
    edgeRoutes: input.edgeRoutes,
    styleMap: input.styleMap,
    safeCfg: input.safeCfg,
    staffShadowIds: input.dependencies.staffShadowIds
  }),
  staffConnectorRender: renderStaffConnectors({
    tree: input.tree,
    placed: input.placed,
    staff: input.staff,
    cfg: input.cfg,
    safeCfg: input.safeCfg
  }),
  shadowBodyRender: renderShadowBodies({
    shadowNodes: input.shadowNodes,
    tree: input.tree,
    placed: input.placed,
    staff: input.staff,
    cfg: input.cfg,
    safeCfg: input.safeCfg,
    styleMap: input.styleMap,
    textStyles: input.textStyles
  })
})

const buildNodeAndStaffSections = (input: BuildNodeAndStaffSectionsInput): Pick<ProjectionSections, 'nodeBodyRender' | 'staffBodyRender'> => ({
  nodeBodyRender: renderNodeBodies({
    tree: input.tree,
    placed: input.placed,
    cfg: input.cfg,
    safeCfg: input.safeCfg,
    styleMap: input.styleMap,
    textStyles: input.textStyles,
    iconMap: input.iconMap,
    shadowIds: input.dependencies.shadowIds
  }),
  staffBodyRender: renderStaffBodies({
    staff: input.staff,
    cfg: input.cfg,
    safeCfg: input.safeCfg,
    styleMap: input.styleMap,
    textStyles: input.textStyles,
    iconMap: input.iconMap,
    staffParentLookup: input.dependencies.staffParentLookup
  })
})

const buildSectionRenders = (input: BuildSectionRendersInput): ProjectionSections => ({
  ...buildEdgeAndShadowSections({
    tree: input.tree,
    placed: input.placed,
    staff: input.staff,
    cfg: input.cfg,
    dottedEdges: input.dottedEdges,
    shadowNodes: input.shadowNodes,
    edgeRoutes: input.edgeRoutes,
    styleMap: input.styleMap,
    textStyles: input.textStyles,
    safeCfg: input.safeCfg,
    dependencies: input.dependencies
  }),
  ...buildNodeAndStaffSections({
    tree: input.tree,
    placed: input.placed,
    staff: input.staff,
    cfg: input.cfg,
    safeCfg: input.safeCfg,
    styleMap: input.styleMap,
    textStyles: input.textStyles,
    iconMap: input.iconMap,
    dependencies: input.dependencies
  })
})

const buildSvgFromSections = (
  sections: ProjectionSections,
  viewBox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}" width="${viewBox.width}" height="${viewBox.height}">
${[
  ...sections.shadowBodyRender.bodyElements,
  ...sections.nodeBodyRender.elements,
  ...sections.staffBodyRender.elements,
  ...sections.dottedRender.edgeElements,
  ...sections.solidEdgeRender.elements,
  ...sections.staffConnectorRender.elements,
  ...sections.shadowBodyRender.edgeElements
].join('\n')}
</svg>`

const buildProjectionBounds = (sections: ProjectionSections): RenderBounds =>
  mergeAllBounds([
    sections.dottedRender.bounds,
    sections.solidEdgeRender.bounds,
    sections.staffConnectorRender.bounds,
    sections.shadowBodyRender.bounds,
    sections.nodeBodyRender.bounds,
    sections.staffBodyRender.bounds
  ])

const computeViewBoxFromBounds = (
  combinedBounds: RenderBounds,
  cfg: RenderConfig
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } => {
  const hasFiniteBounds = Number.isFinite(combinedBounds.minX)
    && Number.isFinite(combinedBounds.minY)
    && Number.isFinite(combinedBounds.maxX)
    && Number.isFinite(combinedBounds.maxY)
  const boundedMinX = hasFiniteBounds ? combinedBounds.minX : 0
  const boundedMinY = hasFiniteBounds ? combinedBounds.minY : 0
  const boundedMaxX = hasFiniteBounds ? combinedBounds.maxX : cfg.nodeSize * cfg.colWidth
  const boundedMaxY = hasFiniteBounds ? combinedBounds.maxY : cfg.nodeSize * cfg.rowHeight
  const padding = 20

  return {
    x: boundedMinX - padding,
    y: boundedMinY - padding,
    width: boundedMaxX - boundedMinX + 2 * padding,
    height: boundedMaxY - boundedMinY + 2 * padding
  }
}

/** Renders a fully prepared layout projection to SVG and viewBox metadata. */
export const renderSvgProjection = (
  input: ProjectionInput
): RenderResult => {
  const {
    tree,
    placed,
    staff,
    cfg,
    dottedEdges,
    shadowNodes,
    edgeRoutes,
    styleMap,
    textStyles,
    iconMap
  } = input

  const safeCfg = sanitizeRenderConfig(cfg)
  const sections = buildProjectionSections({
    tree,
    placed,
    staff,
    cfg,
    dottedEdges,
    shadowNodes,
    edgeRoutes,
    styleMap,
    textStyles,
    iconMap,
    safeCfg
  })
  const combinedBounds = buildProjectionBounds(sections)
  const viewBox = computeViewBoxFromBounds(combinedBounds, cfg)
  const svg = buildSvgFromSections(sections, viewBox)

  return {
    ok: true,
    value: { svg, viewBox }
  }
}
