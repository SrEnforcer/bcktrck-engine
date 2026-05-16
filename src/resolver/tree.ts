/**
 * AST tree utilities.
 */

import type { AstNode } from '../types/ast'

/**
 * Recursively collect all nodes (including children and staff nodes) from an AST node.
 *
 * @param node Root node to traverse
 * @returns Flattened array of all nodes in the subtree
 */
export const collectNodes = (node: AstNode): readonly AstNode[] => {
  const ownChildren = node.children.flatMap((child) => collectNodes(child))
  const ownStaff = node.staffNodes.flatMap((staff) => collectNodes(staff))
  return [node, ...ownChildren, ...ownStaff]
}
