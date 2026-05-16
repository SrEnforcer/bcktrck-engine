/**
 * PURE CORE — no side-effects; all I/O enters via parameters.
 *
 * Public SVG rendering entrypoint for positioned org layouts.
 */

import type { DottedEdge, ShadowNode } from '../types/org-tree'
import type { EdgeRoute, IndexedTree, PlacedTree, PlacedStaff, RenderConfig, RenderResult } from './types'
import type { ResolvedStyleMap, ResolvedTextStyles } from '../style/dsl'
import type { IconSpec } from '../icons/render'
import { validatePlacedNodePositions } from './render-svg/shared'
import { renderSvgProjection } from './render-svg/sections'

type RenderSvgInput = {
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

/** Default `RenderConfig` values used when no caller-supplied config is provided. */
export const defaultRenderConfig: RenderConfig = {
  nodeSize: 1,
  staffSize: 0.6,
  colWidth: 80,
  rowHeight: 120,
  nodeBorder: '#000',
  employeeFill: '#e3f2fd',
  deptFill: '#fff3e0',
  vacancyFill: '#f3e5f5',
  edgeStroke: '#999',
  dottedEdgeStroke: '#aaa',
  shadowOffsetX: 0.75,
  shadowOffsetY: -0.75,
  shadowOpacity: 0.55,
  shadowDashArray: '3 3',
  shadowFontScale: 1,
  fontSize: 12,
  fontFamily: 'Arial',
  showSubordinateCount: false,
  subordinateCountIncludeVacancies: false,
  subordinateCountBadgeFill: '#999',
  subordinateCountBadgeText: '#ffffff',
  subordinateCountBadgeFontScale: 0.75
}

/**
 * Render an indexed, placed, and styled org tree to an SVG document string.
 *
 * Validates required layout positions, then delegates to the projection renderer.
 */
export const renderSvg = (
  input: RenderSvgInput
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

  const validation = validatePlacedNodePositions(tree, placed)
  if (validation !== undefined) {
    return validation
  }

  return renderSvgProjection({
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
  })
}
