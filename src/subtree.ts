/**
 * PURE CORE — no side-effects; all I/O enters via parameters.
 *
 * Subtree isolation: extracts a focused sub-graph from a resolved OrgTree.
 *
 * Used to render and print a single department or sub-team in isolation,
 * preserving the original layout and style of the full chart.
 *
 * Typical usage in a web editor dropdown:
 *
 *   const parsed = parseAndResolveBtl(source)
 *   if (!parsed.ok) return
 *
 *   const entries = listSubtrees(parsed.tree)      // populate dropdown
 *   const result  = compile(source, cfg, { subtreeId: entries[2].id })
 */

import type { Option } from '@tsfpp/prelude'
import { entriesOfMap, intoMap, intoSet, none, some } from '@tsfpp/prelude'
import { asNodeId } from './types/branded'
import type { OrgNode, OrgTree } from './types/org-tree'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A selectable focus point for subtree isolation, as returned by
 * `listSubtrees`. Pass `id` to `isolateSubtree` or to `compile` via
 * `CompileOptions.subtreeId`.
 */
export type SubtreeEntry = {
  /** Node kind from the resolved org tree. */
  readonly kind: 'employee' | 'department' | 'vacancy'
  /** Raw node identifier (NodeId or DeptId as string). */
  readonly id: string
  /** Human-readable label suitable for a dropdown or list UI. */
  readonly label: string
  /** Nesting depth relative to the tree root (root = 0). */
  readonly depth: number
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const nodeLabel = (node: OrgNode): string =>
  node.kind === 'department'
    ? node.name
    : node.meta.title.replace(/\n/g, ' — ')

const nodeRenderLabel = (node: OrgNode): string =>
  node.kind === 'department'
    ? node.name
    : node.meta.title

const composeShadowLabel = (primaryLabel: string, shadowLabelOverride: string | undefined): string => {
  const parts = primaryLabel
    .split('\n')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
  const [name = primaryLabel, ...rest] = parts
  const title = rest.length > 0 ? rest.join(' ') : undefined
  const effectiveTitle = shadowLabelOverride ?? title
  return effectiveTitle !== undefined ? `${name}\n${effectiveTitle}` : name
}

const childrenOf = (node: OrgNode): readonly OrgNode[] =>
  node.kind === 'department' ? node.members : node.children

const rawId = (id: OrgNode['id']): string => id

const collectParentMap = (
  node: OrgNode,
  parentId: string | undefined = undefined
): ReadonlyMap<string, string> => {
  const ownId = rawId(node.id)
  const withCurrent = parentId === undefined
    ? intoMap<string, string>([])
    : intoMap<string, string>([[ownId, parentId]])

  return childrenOf(node).reduce<ReadonlyMap<string, string>>((acc, child) => {
    const childMap = collectParentMap(child, ownId)
    return intoMap([...entriesOfMap(acc), ...entriesOfMap(childMap)])
  }, withCurrent)
}

const isAncestor = (ancestorId: string, nodeId: string, parentMap: ReadonlyMap<string, string>): boolean => {
  const parent = parentMap.get(nodeId)
  if (parent === undefined) return false
  if (parent === ancestorId) return true
  return isAncestor(ancestorId, parent, parentMap)
}

const uniqueInOrder = (values: readonly string[]): readonly string[] =>
  values.reduce<readonly string[]>((acc, value) => (acc.includes(value) ? acc : [...acc, value]), [])

const pruneDescendantSelections = (ids: readonly string[], parentMap: ReadonlyMap<string, string>): readonly string[] =>
  ids.filter((id) => !ids.some((candidate) => candidate !== id && isAncestor(candidate, id, parentMap)))

const filterShadowNodes = (tree: OrgTree, ids: ReadonlySet<string>): OrgTree['shadowNodes'] =>
  tree.shadowNodes
    .filter((s) => ids.has(rawId(s.id)))
    .map((s) => {
      if (ids.has(rawId(s.primary))) {
        return s
      }

      const primaryNode = findNodeById(tree.root, rawId(s.primary))
      if (primaryNode === undefined) {
        return s
      }

      return {
        ...s,
        label: composeShadowLabel(nodeRenderLabel(primaryNode), s.label)
      }
    })

// DEVIATION(4.4): Forest-root synthesis remains as one helper to keep root-kind branching and fallback semantics in one total function.
// eslint-disable-next-line max-lines-per-function -- forest root synthesis preserves existing root semantics across all root kinds in one total helper.
const buildForestRoot = (tree: OrgTree, selectedRoots: readonly OrgNode[]): OrgNode => {
  const firstNonDepartmentNodeId = (nodes: readonly OrgNode[]): string | undefined =>
    nodes.reduce<string | undefined>((found, node) => {
      if (found !== undefined) return found
      if (node.kind !== 'department') {
        return rawId(node.id)
      }
      return firstNonDepartmentNodeId(node.members)
    }, undefined)

  const syntheticRoot = (): OrgNode => ({
    kind: 'employee',
    id: asNodeId('__forest_root__'),
    meta: {
      title: 'Selected subtrees'
    },
    children: selectedRoots,
    staff: []
  })

  if (selectedRoots.length === 1 && selectedRoots[0] !== undefined) {
    return selectedRoots[0]
  }

  if (tree.root.kind === 'department') {
    const fallbackHead = firstNonDepartmentNodeId(selectedRoots)
    if (fallbackHead === undefined) {
      return syntheticRoot()
    }
    return {
      ...tree.root,
      head: asNodeId(fallbackHead),
      members: selectedRoots
    }
  }

  if (tree.root.kind === 'vacancy') {
    return {
      ...tree.root,
      children: selectedRoots
    }
  }

  return {
    ...tree.root,
    children: selectedRoots,
    staff: []
  }
}

/**
 * Collect the full set of raw node ids reachable from `node`, including
 * staff sidebar ids (which appear as dotted-edge endpoints).
 */
const collectNodeIds = (node: OrgNode): ReadonlySet<string> => {
  const ownId = rawId(node.id)

  if (node.kind === 'department') {
    return intoSet([ownId, ...node.members.flatMap((m) => [...collectNodeIds(m)])])
  }

  if (node.kind === 'employee') {
    return intoSet([
      ownId,
      ...node.staff.map((s) => rawId(s.id)),
      ...node.children.flatMap((c) => [...collectNodeIds(c)])
    ])
  }

  // vacancy
  return intoSet([ownId, ...node.children.flatMap((c) => [...collectNodeIds(c)])])
}

const findNodeById = (root: OrgNode, id: string): OrgNode | undefined => {
  if (rawId(root.id) === id) return root
  const children = root.kind === 'department' ? root.members : root.children
  return children.reduce<OrgNode | undefined>((found, child) => found ?? findNodeById(child, id), undefined)
}

const collectEntries = (node: OrgNode, depth: number): readonly SubtreeEntry[] => {
  const entry: SubtreeEntry = {
    kind: node.kind,
    id: rawId(node.id),
    label: nodeLabel(node),
    depth
  }
  const children = node.kind === 'department' ? node.members : node.children
  return [entry, ...children.flatMap((c) => collectEntries(c, depth + 1))]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List all nodes in the resolved tree as potential subtree focus points.
 *
 * Returns entries in pre-order depth-first traversal order. The `depth`
 * field lets callers indent dropdown entries to communicate visual hierarchy.
 * Staff sidebar nodes are excluded — they are not valid subtree roots.
 *
 * @param tree Resolved organizational tree.
 * @returns Ordered list of subtree entries, tree root first.
 */
export const listSubtrees = (tree: OrgTree): readonly SubtreeEntry[] =>
  collectEntries(tree.root, 0)

/**
 * Extract a subtree rooted at the node with the given id.
 *
 * Dotted edges and shadow nodes are filtered so only those whose
 * endpoints fall within the extracted subtree are preserved. The
 * returned `OrgTree` is structurally complete and ready to pass through
 * the full layout/render pipeline unchanged.
 *
 * @param tree The full resolved org tree.
 * @param id   Raw node id from `SubtreeEntry.id`.
 * @returns The isolated subtree as `Option<OrgTree>` — `none` when `id` is not found.
 */
export const isolateSubtree = (tree: OrgTree, id: string): Option<OrgTree> => {
  const node = findNodeById(tree.root, id)
  if (node === undefined) return none

  const ids = collectNodeIds(node)
  const shadowNodes = filterShadowNodes(tree, ids)

  return some({
    root: node,
    dottedEdges: tree.dottedEdges.filter((e) => ids.has(rawId(e.from)) && ids.has(rawId(e.to))),
    shadowNodes
  })
}

/**
 * Extract a union of multiple selected subtree roots.
 *
 * Unknown ids are ignored as long as at least one valid id remains.
 * If all ids are unknown, `none` is returned.
 *
 * @param tree The full resolved org tree.
 * @param ids Raw node ids to isolate and merge.
 * @returns A merged subtree tree when at least one id resolves, otherwise `none`.
 */
export const isolateSubtrees = (tree: OrgTree, ids: readonly string[]): Option<OrgTree> => {
  const uniqueIds = uniqueInOrder(ids)
  const validRoots = uniqueIds
    .map((id) => findNodeById(tree.root, id))
    .filter((node): node is OrgNode => node !== undefined)

  if (validRoots.length === 0) {
    return none
  }

  const parentMap = collectParentMap(tree.root)
  const validRootIds = pruneDescendantSelections(
    uniqueInOrder(validRoots.map((node) => rawId(node.id))),
    parentMap
  )

  const selectedRoots = validRootIds
    .map((id) => findNodeById(tree.root, id))
    .filter((node): node is OrgNode => node !== undefined)

  const includedIds = intoSet(
    selectedRoots.flatMap((node) => [...collectNodeIds(node)])
  )

  return some({
    root: buildForestRoot(tree, selectedRoots),
    dottedEdges: tree.dottedEdges.filter((e) => includedIds.has(rawId(e.from)) && includedIds.has(rawId(e.to))),
    shadowNodes: filterShadowNodes(tree, includedIds)
  })
}
