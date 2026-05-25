/**
 * @module subtree/subtree-helpers
 *
 * Internal helper functions shared by subtree selection and upstream isolation.
 *
 * @packageDocumentation
 */

import type { Option } from '@tsfpp/prelude'
import { fromNullable, intoSet, isNone, none, some } from '@tsfpp/prelude'
import type { OrgNode } from '../types/org-tree'

const rawId = (id: OrgNode['id']): string => id

/** Collect every reachable node id from a subtree, including staff ids. */
export const collectNodeIds = (node: OrgNode): ReadonlySet<string> => {
  const ownId = rawId(node.id)

  if (node.kind === 'department') {
    return intoSet([ownId, ...node.members.flatMap((member) => [...collectNodeIds(member)])])
  }

  if (node.kind === 'employee') {
    return intoSet([
      ownId,
      ...node.staff.map((staffNode) => rawId(staffNode.id)),
      ...node.children.flatMap((child) => [...collectNodeIds(child)])
    ])
  }

  return intoSet([ownId, ...node.children.flatMap((child) => [...collectNodeIds(child)])])
}

/** Find one node by raw id using a total depth-first walk. */
export const findNodeById = (root: OrgNode, id: string): OrgNode | undefined => {
  if (rawId(root.id) === id) {
    return root
  }

  const children = root.kind === 'department' ? root.members : root.children
  const nextOption = fromNullable(children[0])
  if (isNone(nextOption)) {
    return undefined
  }

  const foundOption = fromNullable(findNodeById(nextOption.value, id))
  return isNone(foundOption)
    ? findNodeByIdInSiblings(children.slice(1), id)
    : foundOption.value
}

const findNodeByIdInSiblings = (siblings: readonly OrgNode[], id: string): OrgNode | undefined => {
  const nextOption = fromNullable(siblings[0])
  if (isNone(nextOption)) {
    return undefined
  }

  const foundOption = fromNullable(findNodeById(nextOption.value, id))
  return isNone(foundOption)
    ? findNodeByIdInSiblings(siblings.slice(1), id)
    : foundOption.value
}

const cloneAsPathNode = (node: OrgNode): OrgNode => {
  if (node.kind === 'department') {
    return { ...node, members: [] }
  }

  if (node.kind === 'vacancy') {
    return { ...node, children: [] }
  }

  return { ...node, children: [], staff: [] }
}

const withPathChild = (parent: OrgNode, child: OrgNode): OrgNode => {
  if (parent.kind === 'department') {
    return { ...parent, members: [child] }
  }

  if (parent.kind === 'vacancy') {
    return { ...parent, children: [child] }
  }

  return { ...parent, children: [child], staff: [] }
}

/** Build a single root-to-target chain from ordered path nodes. */
export const buildUpstreamPathRoot = (nodes: readonly OrgNode[]): Option<OrgNode> => {
  const headOption = fromNullable(nodes[0])
  if (isNone(headOption)) {
    return none
  }

  const head = cloneAsPathNode(headOption.value)
  const tailOption = fromNullable(nodes[1])
  if (isNone(tailOption)) {
    return some(head)
  }

  const tailRootOption = buildUpstreamPathRoot(nodes.slice(1))
  return isNone(tailRootOption)
    ? some(head)
    : some(withPathChild(head, tailRootOption.value))
}

/** Follow the parent map upward from a starting node id. */
export const upwardPathIds = (
  startId: string,
  parentMap: ReadonlyMap<string, string>
): readonly string[] => {
  const parentIdOption = fromNullable(parentMap.get(startId))
  return isNone(parentIdOption)
    ? [startId]
    : [startId, ...upwardPathIds(parentIdOption.value, parentMap)]
}