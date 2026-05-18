/**
 * @module layout/index-tree
 *
 * Tree indexer: transforms an OrgTree into a flat indexed representation for layout algorithms.
 *
 * Creates a Map of all nodes (indexed by string id) with their structural relationships:
 * children, parent, depth, and left/right staff assignments. This flat indexed form
 * enables efficient tree traversal during layout, positioning, and rendering.
 *
 * @packageDocumentation
 */

import type { DeptId, NodeId } from '../types/branded'
import type { OrgNode, OrgTree } from '../types/org-tree'
import { fromNullable, intoMap, isNone } from '@tsfpp/prelude'
import type { IndexedNode, IndexedTree, LayoutNodeKind } from './types'

/** Extracts the raw string id from a branded NodeId or DeptId. */
const toId = (id: NodeId | DeptId): string => id

type WalkResult = {
  readonly nodes: ReadonlyMap<string, IndexedNode>
  readonly staffLabels: ReadonlyMap<string, string>
}

type WalkContext = {
  readonly parentId: string | null
  readonly depth: number
  readonly childIndex: number
}

type AssembleNodeResultInput = {
  readonly id: string
  readonly indexedNode: IndexedNode
  readonly children: readonly OrgNode[]
  readonly depth: number
}

type WalkDepartmentNodeInput = {
  readonly node: Extract<OrgNode, { readonly kind: 'department' }>
  readonly id: string
  readonly context: WalkContext
}

type WalkVacancyNodeInput = {
  readonly node: Extract<OrgNode, { readonly kind: 'vacancy' }>
  readonly id: string
  readonly context: WalkContext
}

type WalkEmployeeNodeInput = {
  readonly node: Extract<OrgNode, { readonly kind: 'employee' }>
  readonly id: string
  readonly context: WalkContext
}

type WalkNodeInput = {
  readonly node: OrgNode
  readonly context: WalkContext
}

type OptionalLayoutHints = {
  readonly layoutHint?: OrgNode['layoutHint']
  readonly hangingSide?: OrgNode['hangingSide']
}

type StaffEntry = {
  readonly id: NodeId
  readonly side: 'left' | 'right'
  readonly label: string
}

type IndexedNodeWithTriangle = IndexedNode & {
  readonly triangleEffect?: { readonly color: string }
}

const mapFromEntries = <K, V>(entries: ReadonlyArray<readonly [K, V]>): ReadonlyMap<K, V> => intoMap(entries)

const emptyWalkResult = (): WalkResult => ({
  nodes: mapFromEntries<string, IndexedNode>([]),
  staffLabels: mapFromEntries<string, string>([])
})

const mergeWalkResults = (left: WalkResult, right: WalkResult): WalkResult => ({
  nodes: mapFromEntries([
    ...Array.from(left.nodes.entries()).map(([id, node]) => [id, node] as const),
    ...Array.from(right.nodes.entries()).map(([id, node]) => [id, node] as const)
  ]),
  staffLabels: mapFromEntries([
    ...Array.from(left.staffLabels.entries()).map(([id, label]) => [id, label] as const),
    ...Array.from(right.staffLabels.entries()).map(([id, label]) => [id, label] as const)
  ])
})

const optionalLayoutHints = (
  node: OptionalLayoutHints
): Partial<Pick<IndexedNode, 'layoutHint' | 'hangingSide'>> => {
  const layoutHintOption = fromNullable(node.layoutHint)
  const hangingSideOption = fromNullable(node.hangingSide)

  return {
    ...(!isNone(layoutHintOption) ? { layoutHint: layoutHintOption.value } : {}),
    ...(!isNone(hangingSideOption) ? { hangingSide: hangingSideOption.value } : {})
  }
}

const childIds = (children: readonly OrgNode[]): readonly string[] => children.map((child) => toId(child.id))

const getTriangleEffect = (node: OrgNode): { readonly color: string } | undefined => node.triangleEffect

const collectStaff = (
  staff: readonly StaffEntry[]
): { readonly leftIds: readonly string[]; readonly rightIds: readonly string[]; readonly labels: ReadonlyMap<string, string> } => {
  const left = staff.filter((entry) => entry.side === 'left')
  const right = staff.filter((entry) => entry.side !== 'left')
  return {
    leftIds: left.map((entry) => toId(entry.id)),
    rightIds: right.map((entry) => toId(entry.id)),
    labels: mapFromEntries(staff.map((entry) => [toId(entry.id), entry.label] as const))
  }
}

const createIndexedNodeBase = (
  node: OrgNode,
  params: {
    readonly id: string
    readonly kind: LayoutNodeKind
    readonly label: string
    readonly depth: number
    readonly parentId: string | null
    readonly childIndex: number
    readonly children: readonly string[]
    readonly staffLeft: readonly string[]
    readonly staffRight: readonly string[]
  }
): IndexedNodeWithTriangle => {
  const triangleEffect = getTriangleEffect(node)
  const triangleOption = fromNullable(triangleEffect)
  return {
    id: params.id,
    kind: params.kind,
    label: params.label,
    ...optionalLayoutHints(node),
    ...(!isNone(triangleOption) ? { triangleEffect: triangleOption.value } : {}),
    depth: params.depth,
    parentId: params.parentId,
    childIndex: params.childIndex,
    children: params.children,
    staffLeft: params.staffLeft,
    staffRight: params.staffRight
  }
}

const walkChildren = (
  parentId: string,
  depth: number,
  children: readonly OrgNode[]
): WalkResult =>
  children.reduce(
    (acc, child, i) => mergeWalkResults(acc, walkNode({
      node: child,
      context: { parentId, depth: depth + 1, childIndex: i }
    })),
    emptyWalkResult()
  )

const assembleNodeResult = (input: AssembleNodeResultInput): WalkResult => {
  const current: WalkResult = {
    nodes: mapFromEntries([[input.id, input.indexedNode] as const]),
    staffLabels: mapFromEntries<string, string>([])
  }
  const childResult = walkChildren(input.id, input.depth, input.children)
  return mergeWalkResults(current, childResult)
}

const walkDepartmentNode = (input: WalkDepartmentNodeInput): WalkResult =>
  assembleNodeResult({
    id: input.id,
    indexedNode: createIndexedNodeBase(input.node, {
      id: input.id,
      kind: 'department',
      label: input.node.name,
      depth: input.context.depth,
      parentId: input.context.parentId,
      childIndex: input.context.childIndex,
      children: childIds(input.node.members),
      staffLeft: [],
      staffRight: []
    }),
    children: input.node.members,
    depth: input.context.depth
  })

const walkVacancyNode = (input: WalkVacancyNodeInput): WalkResult =>
  assembleNodeResult({
    id: input.id,
    indexedNode: createIndexedNodeBase(input.node, {
      id: input.id,
      kind: 'vacancy',
      label: input.node.meta.title,
      depth: input.context.depth,
      parentId: input.context.parentId,
      childIndex: input.context.childIndex,
      children: childIds(input.node.children),
      staffLeft: [],
      staffRight: []
    }),
    children: input.node.children,
    depth: input.context.depth
  })

const walkEmployeeNode = (input: WalkEmployeeNodeInput): WalkResult => {
  const staffData = collectStaff(input.node.staff)
  const baseResult = assembleNodeResult(
    {
      id: input.id,
      indexedNode: createIndexedNodeBase(input.node, {
      id: input.id,
      kind: 'employee',
      label: input.node.meta.title,
      depth: input.context.depth,
      parentId: input.context.parentId,
      childIndex: input.context.childIndex,
      children: childIds(input.node.children),
      staffLeft: staffData.leftIds,
      staffRight: staffData.rightIds
    }),
      children: input.node.children,
      depth: input.context.depth
    }
  )

  return {
    nodes: baseResult.nodes,
    staffLabels: mapFromEntries([
      ...Array.from(baseResult.staffLabels.entries()).map(([id, label]) => [id, label] as const),
      ...Array.from(staffData.labels.entries()).map(([id, label]) => [id, label] as const)
    ])
  }
}

const walkNode = (input: WalkNodeInput): WalkResult => {
  const id = toId(input.node.id)

  switch (input.node.kind) {
    case 'department':
      return walkDepartmentNode({ node: input.node, id, context: input.context })
    case 'vacancy':
      return walkVacancyNode({ node: input.node, id, context: input.context })
    case 'employee':
      return walkEmployeeNode({ node: input.node, id, context: input.context })
  }
}

/**
 * Build an `IndexedTree` from a resolved `OrgTree`.
 *
 * Walks the tree depth-first, assigning depth, parent id, and child-index
 * metadata to each node. Staff nodes are collected into per-node `staffLeft`
 * and `staffRight` lists rather than being promoted to standalone `IndexedNode`
 * entries.
 *
 * @param orgTree Resolved organizational tree from the resolver phase.
 * @returns A flat indexed structure suitable for the Buchheim layout algorithm.
 */
export const indexTree = (orgTree: OrgTree): IndexedTree => {
  const result = walkNode({
    node: orgTree.root,
    context: { parentId: null, depth: 0, childIndex: 0 }
  })
  return { rootId: toId(orgTree.root.id), nodes: result.nodes, staffLabels: result.staffLabels }
}
