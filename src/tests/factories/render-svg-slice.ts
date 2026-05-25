/**
 * @module tests/factories/render-svg-slice
 *
 * Test fixture builders shared across unit and slice tests.
 *
 * @packageDocumentation
 */

import { intoMap, none } from '@tsfpp/prelude'
import type { IconSpec } from '../../icons/render'
import type { ResolvedNodeStyle, ResolvedTextStyles } from '../../style/dsl'
import { asNodeId } from '../../types/branded'
import type { DottedEdge, ShadowNode } from '../../types/org-tree'
import { defaultRenderConfig } from '../../layout/render-svg'
import type { EdgeRoute, IndexedNode, IndexedTree, LayoutPoint, PlacedStaff, PlacedTree, RenderConfig } from '../../layout/types'

/** Build mkRenderSvgInput test fixture values. */
export const mkRenderSvgInput = (): {
  readonly tree: { readonly rootId: string; readonly nodes: ReadonlyMap<string, IndexedNode> }
  readonly placed: { readonly rootId: string; readonly positions: ReadonlyMap<string, LayoutPoint> }
  readonly staff: { readonly staff: readonly [] }
  readonly cfg: typeof defaultRenderConfig
  readonly dottedEdges: readonly DottedEdge[]
  readonly shadowNodes: readonly ShadowNode[]
  readonly edgeRoutes: readonly EdgeRoute[]
  readonly styleMap: ReadonlyMap<string, ResolvedNodeStyle>
  readonly textStyles: { readonly nodeName: {}; readonly nodeTitle: {} }
  readonly iconMap: ReadonlyMap<string, readonly IconSpec[]>
} => ({
  tree: { rootId: 'root', nodes: intoMap<string, IndexedNode>([]) },
  placed: { rootId: 'root', positions: intoMap<string, LayoutPoint>([]) },
  staff: { staff: [] },
  cfg: defaultRenderConfig,
  dottedEdges: [],
  shadowNodes: [],
  edgeRoutes: [],
  styleMap: intoMap<string, ResolvedNodeStyle>([]),
  textStyles: { nodeName: {}, nodeTitle: {} },
  iconMap: intoMap<string, readonly IconSpec[]>([])
})

/** Build mkDottedInput test fixture values. */
export const mkDottedInput = (input: {
  readonly dottedEdges: readonly DottedEdge[]
  readonly cfg: RenderConfig
}): {
  readonly dottedEdges: readonly DottedEdge[]
  readonly placed: {
    readonly rootId: string
    readonly positions: ReadonlyMap<string, { readonly x: number; readonly y: number }>
  }
  readonly staff: { readonly staff: readonly [] }
  readonly cfg: RenderConfig
  readonly safeCfg: RenderConfig
  readonly shadowBoundsMap: ReadonlyMap<string, never>
} => ({
  dottedEdges: input.dottedEdges,
  placed: {
    rootId: 'a',
    positions: intoMap([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 2, y: 0 }]
    ])
  },
  staff: { staff: [] },
  cfg: input.cfg,
  safeCfg: input.cfg,
  shadowBoundsMap: intoMap([])
})

/** Build mkShadowFixtures test fixture values. */
export const mkShadowFixtures = (): {
  readonly tree: IndexedTree
  readonly placed: PlacedTree
  readonly staff: PlacedStaff
  readonly textStyles: ResolvedTextStyles
  readonly shadowNodes: readonly ShadowNode[]
} => ({
  tree: {
    rootId: 'root',
    nodes: intoMap([
      ['root', { id: 'root', kind: 'employee', label: 'Root\nLead', depth: 0, parentId: none, childIndex: 0, children: [], staffLeft: [], staffRight: [] }]
    ])
  },
  placed: {
    rootId: 'root',
    positions: intoMap([
      ['root', { x: 0, y: 0 }],
      ['shadow-root', { x: 1, y: 0 }]
    ])
  },
  staff: { staff: [] },
  textStyles: { nodeName: {}, nodeTitle: {} },
  shadowNodes: [{ id: asNodeId('shadow-root'), primary: asNodeId('root'), type: 'employee', label: 'Acting' }]
})

/** Build mkSharedGeometryFixtures test fixture values. */
export const mkSharedGeometryFixtures = (): {
  readonly placed: {
    readonly rootId: string
    readonly positions: ReadonlyMap<string, { readonly x: number; readonly y: number }>
  }
  readonly staff: {
    readonly staff: readonly [{ readonly id: string; readonly label: string; readonly x: number; readonly y: number; readonly side: 'left' }]
  }
} => ({
  placed: { rootId: 'root', positions: intoMap([['root', { x: 0, y: 0 }]]) },
  staff: { staff: [{ id: 's1', label: 'S1', x: 1, y: 1, side: 'left' }] }
})
