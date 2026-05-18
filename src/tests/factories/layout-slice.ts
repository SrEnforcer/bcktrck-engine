/**
 * @module tests/factories/layout-slice
 *
 * Test fixture builders shared across unit and slice tests.
 *
 * @packageDocumentation
 */

import { fromNullable, getOrElse, intoMap, isNone } from '@tsfpp/prelude'
import type { IndexedNode, IndexedTree, LayoutPoint, PlacedTree, RenderConfig } from '../../layout/types'
import { asDeptId, asNodeId } from '../../types/branded'
import type { OrgNode, OrgTree } from '../../types/org-tree'

type LayoutHintValue = Exclude<IndexedNode['layoutHint'], undefined>

const optionalLayoutHint = (
  layoutHint: IndexedNode['layoutHint']
): { readonly layoutHint?: LayoutHintValue } => {
  const layoutHintOption = fromNullable(layoutHint)
  return isNone(layoutHintOption) ? {} : { layoutHint: layoutHintOption.value }
}

/** Build mkSliceRenderConfig test fixture values. */
export const mkSliceRenderConfig = (): RenderConfig => ({
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
})

const mkApplyHintRootNode = (input: {
  readonly layoutHint: 'hanging' | 'hanging-left' | 'hanging-right' | 'hanging-both' | undefined
  readonly children: readonly string[]
}): IndexedNode => ({
  id: 'root',
  kind: 'employee',
  label: 'Root',
  depth: 0,
  parentId: null,
  childIndex: 0,
  children: input.children,
  staffLeft: [],
  staffRight: [],
  ...optionalLayoutHint(input.layoutHint)
})

const mkApplyHintChildNode = (input: {
  readonly id: string
  readonly index: number
}): IndexedNode => ({
  id: input.id,
  kind: 'employee',
  label: input.id,
  depth: 1,
  parentId: 'root',
  childIndex: input.index,
  children: [],
  staffLeft: [],
  staffRight: []
})

/** Build mkApplyHintTree test fixture values. */
export const mkApplyHintTree = (input: {
  readonly layoutHint: 'hanging' | 'hanging-left' | 'hanging-right' | 'hanging-both' | undefined
  readonly children: readonly string[]
}): IndexedTree => ({
  rootId: 'root',
  nodes: intoMap([
    ['root', mkApplyHintRootNode({ layoutHint: input.layoutHint, children: input.children })],
    ...input.children.map((id, index) => [id, mkApplyHintChildNode({ id, index })] as const)
  ])
})

/** Build mkPlacedFromEntries test fixture values. */
export const mkPlacedFromEntries = (
  entries: ReadonlyArray<readonly [string, { readonly x: number; readonly y: number }]>
): PlacedTree => ({
  rootId: 'root',
  positions: intoMap(entries)
})

/** Build mkRouteEdgesTree test fixture values. */
export const mkRouteEdgesTree = (layoutHint: IndexedNode['layoutHint']): IndexedTree => ({
  rootId: 'root',
  nodes: intoMap([
    ['root', {
      id: 'root',
      kind: 'employee',
      label: 'Root',
      depth: 0,
      parentId: null,
      childIndex: 0,
      children: ['child'],
      staffLeft: [],
      staffRight: [],
      ...optionalLayoutHint(layoutHint)
    }],
    ['child', { id: 'child', kind: 'employee', label: 'Child', depth: 1, parentId: 'root', childIndex: 0, children: [], staffLeft: [], staffRight: [] }]
  ])
})

/** Build mkRouteEdgesPlaced test fixture values. */
export const mkRouteEdgesPlaced = (input: {
  readonly root: LayoutPoint
  readonly child: LayoutPoint
}): PlacedTree => ({
  rootId: 'root',
  positions: intoMap([
    ['root', input.root],
    ['child', input.child]
  ])
})

/** Build mkIndexTreeEmployee test fixture values. */
export const mkIndexTreeEmployee = (input: {
  readonly id: string
  readonly title: string
  readonly children?: readonly OrgNode[]
  readonly staff?: ReadonlyArray<{ readonly id: string; readonly side: 'left' | 'right'; readonly label: string }>
}): OrgNode => ({
  kind: 'employee',
  id: asNodeId(input.id),
  meta: { title: input.title },
  children: getOrElse<readonly OrgNode[]>(() => [])(fromNullable(input.children)),
  staff: getOrElse<ReadonlyArray<{ readonly id: string; readonly side: 'left' | 'right'; readonly label: string }>>(() => [])(fromNullable(input.staff))
    .map((entry) => ({ id: asNodeId(entry.id), side: entry.side, label: entry.label }))
})

/** Build mkIndexTreeDepartment test fixture values. */
export const mkIndexTreeDepartment = (
  id: string,
  name: string,
  members: readonly OrgNode[]
): OrgNode => ({
  kind: 'department',
  id: asDeptId(id),
  name,
  head: asNodeId('head'),
  members
})

/** Build mkStaffPlacementTree test fixture values. */
export const mkStaffPlacementTree = (): IndexedTree => ({
  rootId: 'root',
  nodes: intoMap([
    ['root', {
      id: 'root',
      kind: 'employee',
      label: 'Root',
      depth: 0,
      parentId: null,
      childIndex: 0,
      children: [],
      staffLeft: ['left-a', 'left-b'],
      staffRight: ['right-a']
    }]
  ]),
  staffLabels: intoMap([
    ['left-a', 'Left A'],
    ['left-b', 'Left B']
  ])
})

/** Build mkStaffPlacementPlaced test fixture values. */
export const mkStaffPlacementPlaced = (): PlacedTree => ({
  rootId: 'root',
  positions: intoMap([
    ['root', { x: 0, y: 0 }]
  ])
})

/** Build mkSimpleOrgTree test fixture values. */
export const mkSimpleOrgTree = (root: OrgNode): OrgTree => ({
  root,
  dottedEdges: [],
  shadowNodes: []
})
