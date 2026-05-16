import { assoc, conj, entriesOfMap, intoMap, intoSet } from '@tsfpp/prelude'
import type { DeptId, NodeId } from './types/branded'
import type { DottedEdge, OrgNode, OrgTree } from './types/org-tree'

/**
 * An upward path from a target node to the root, including both person and department ids.
 * Used as an intermediate representation before filtering to a pure reporting chain.
 */
export type VerticalPath = readonly (NodeId | DeptId)[]
/**
 * Ordered sequence of person node ids from the target up to (but not including) the root,
 * representing the direct managerial reporting line.
 */
export type ReportingChain = readonly NodeId[]
/**
 * An alternative accountability chain (e.g. DT or OvJ), consisting only of
 * person node ids in upward order starting from the target.
 */
export type AltChain = readonly NodeId[]

type IndexedOrgNode = {
  readonly node: OrgNode
  readonly parentId: string | null
}

const childNodes = (node: OrgNode): readonly OrgNode[] =>
  node.kind === 'department' ? node.members : node.children

const rawId = (id: NodeId | DeptId): string => id

const buildNodeIndex = (
  node: OrgNode,
  parentId: string | null = null
): ReadonlyMap<string, IndexedOrgNode> => {
  const ownEntry = intoMap<string, IndexedOrgNode>([[rawId(node.id), { node, parentId }]])

  return childNodes(node).reduce<ReadonlyMap<string, IndexedOrgNode>>(
    (acc, child) => intoMap([
      ...entriesOfMap(acc),
      ...entriesOfMap(buildNodeIndex(child, rawId(node.id)))
    ]),
    ownEntry
  )
}

const buildVerticalPathFromIndex = (
  index: ReadonlyMap<string, IndexedOrgNode>,
  currentId: string
): VerticalPath => {
  const current = index.get(currentId)
  if (current === undefined) return []

  return current.parentId === null
    ? [current.node.id]
    : [current.node.id, ...buildVerticalPathFromIndex(index, current.parentId)]
}

const findDirectManagerId = (
  index: ReadonlyMap<string, IndexedOrgNode>,
  currentId: string
): NodeId | undefined => {
  const current = index.get(currentId)
  if (current === undefined || current.parentId === null) return undefined

  const parent = index.get(current.parentId)
  if (parent === undefined) return undefined

  if (parent.node.kind === 'department') {
    return rawId(current.node.id) === rawId(parent.node.head)
      ? findDirectManagerId(index, rawId(parent.node.id))
      : parent.node.head
  }

  return parent.node.id
}

const buildReportingChainFromIndex = (
  index: ReadonlyMap<string, IndexedOrgNode>,
  currentId: string
): ReportingChain => {
  const current = index.get(currentId)
  if (current === undefined || current.node.kind === 'department') return []

  const managerId = findDirectManagerId(index, currentId)

  return managerId === undefined
    ? [current.node.id]
    : [current.node.id, ...buildReportingChainFromIndex(index, rawId(managerId))]
}

const resolveReportingTargetId = (
  index: ReadonlyMap<string, IndexedOrgNode>,
  targetId: string
): NodeId | undefined => {
  const current = index.get(targetId)
  if (current === undefined) return undefined

  return current.node.kind === 'department' ? current.node.head : current.node.id
}

/**
 * Compute the full upward path from a node to the root, including department nodes.
 *
 * @param tree Resolved organizational tree.
 * @param targetId Id of the node to trace from.
 * @returns Ordered ids from the target node up to the tree root (inclusive).
 */
export const computeVerticalPath = (
  tree: OrgTree,
  targetId: NodeId | DeptId
): VerticalPath => {
  const index = buildNodeIndex(tree.root)
  return buildVerticalPathFromIndex(index, rawId(targetId))
}

/**
 * Compute the direct managerial reporting chain for a node.
 *
 * Traverses from the target upward through the tree, collecting only person node ids.
 * Department heads are resolved to their person id before chain traversal begins.
 *
 * @param tree Resolved organizational tree.
 * @param targetId Id of the node whose reporting chain to compute.
 * @returns Ordered `NodeId` values from target up to the tree root, or `[]` if not found.
 */
export const computeReportingChain = (
  tree: OrgTree,
  targetId: NodeId | DeptId
): ReportingChain => {
  const index = buildNodeIndex(tree.root)
  const reportingTargetId = resolveReportingTargetId(index, rawId(targetId))
  return reportingTargetId === undefined ? [] : buildReportingChainFromIndex(index, reportingTargetId)
}

// ---------------------------------------------------------------------------
// Alternative accountability chains (DT, OvJ, etc.)
// ---------------------------------------------------------------------------

/**
 * Build a direct-lookup map from "from" id to "to" id for a specific edge kind.
 * When multiple edges with the same `from` exist, the last one wins (use deterministic
 * DSL order to control priority).
 */
const buildEdgeIndex = (
  edges: readonly DottedEdge[],
  kind: string
): ReadonlyMap<NodeId, NodeId> =>
  edges
    .filter(e => e.kind === kind)
    .reduce<ReadonlyMap<NodeId, NodeId>>(
      (acc, e) => {
        const from = e.from
        const to = e.to
        return assoc(from, to)(acc)
      },
      intoMap<NodeId, NodeId>([])
    )

type WalkAltChainInput = {
  readonly edgeIndex: ReadonlyMap<NodeId, NodeId>
  readonly nodeIndex: ReadonlyMap<string, IndexedOrgNode>
  readonly currentId: NodeId
  readonly visited: ReadonlySet<NodeId>
}

const walkAltChain = (input: WalkAltChainInput): AltChain => {
  if (input.visited.has(input.currentId)) return []

  const current = input.nodeIndex.get(rawId(input.currentId))
  if (current === undefined || current.node.kind === 'department') return []

  const nextRawId = input.edgeIndex.get(input.currentId)
  if (nextRawId === undefined) {
    return [current.node.id]
  }

  const resolvedNextId = resolveReportingTargetId(input.nodeIndex, nextRawId) ?? nextRawId

  return [
    current.node.id,
    ...walkAltChain({
      edgeIndex: input.edgeIndex,
      nodeIndex: input.nodeIndex,
      currentId: resolvedNextId,
      visited: conj(input.currentId)(input.visited)
    })
  ]
}

/**
 * Walk an alternative accountability chain of a given `kind` (e.g. `'ombudsman'` or `'district attorney'`)
 * upward from `targetId`, following typed dotted edges.
 *
 * Returns the chain of person-node ids in order from target to top, or an empty
 * array if the target is unknown or not part of any such chain.
 *
 * Usage in the DSL:
 * ```
 * links
 *   @ali --> @jordy [kind: ombudsman]
 *   @jordy --> @joy  [kind: ombudsman]
 * ```
 *
 * @param tree Resolved organizational tree.
 * @param targetId Id of the node whose alternative chain to compute.
 * @param kind Dotted-edge kind selector, for example `dt` or `ovj`.
 * @returns Ordered `NodeId` values from target upward, or `[]` when unresolved.
 */
export const computeAltChain = (
  tree: OrgTree,
  targetId: NodeId | DeptId,
  kind: string
): AltChain => {
  const nodeIndex = buildNodeIndex(tree.root)
  const resolvedId = resolveReportingTargetId(nodeIndex, rawId(targetId))
  if (resolvedId === undefined) return []

  const edgeIndex = buildEdgeIndex(tree.dottedEdges, kind)
  return walkAltChain({
    edgeIndex,
    nodeIndex,
    currentId: resolvedId,
    visited: intoSet<NodeId>([])
  })
}