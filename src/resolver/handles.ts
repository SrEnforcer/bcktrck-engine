/**
 * @module resolver/handles
 *
 * Build stable handle maps and duplicate-handle diagnostics for AST nodes.
 *
 * @packageDocumentation
 */

/**
 * Handle map builder: assigns unique identifiers (handles) to all nodes in an AST.
 *
 * Explicit handles from source (@my-node) are used as-is if unique.
 * Missing handles are auto-generated from display names via slugification.
 * Duplicates are detected and reported, separate from the primary handle map.
 */

import type { AstNode } from '../types/ast'
import { assoc, conj, fromNullable, getOrElseOption, intoMap, intoSet, isNone } from '@tsfpp/prelude'
import { collectNodes } from './tree'

/**
 * A resolved handle entry bound to its originating AST node.
 */
export type HandleEntry = {
  readonly node: AstNode
  readonly handle: string
}

/**
 * Output of handle assignment for one AST root.
 */
export type BuildHandleMapResult = {
  readonly map: ReadonlyMap<string, HandleEntry>
  readonly nodeToHandle: ReadonlyMap<AstNode, string>
  readonly duplicates: readonly { readonly handle: string; readonly node: AstNode }[]
}

/**
 * Convert display name to a URL-friendly handle via slugification.
 * Empty results default to 'node'.
 */
const slugify = (value: string): string =>
  {
    const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    return normalized.length === 0 ? 'node' : normalized
  }

/**
 * Find the next available unique handle by appending '_2', '_3', etc. to the base.
 * Used when explicit handles are unavailable or auto-generated slugs need disambiguation.
 */
const uniqueAutoHandle = (base: string, used: ReadonlySet<string>): string => {
  const nextAvailable = (index: number): string => {
    const candidate = `${base}_${index}`
    return used.has(candidate) ? nextAvailable(index + 1) : candidate
  }

  return used.has(base) ? nextAvailable(2) : base
}

type HandleMapAcc = {
  readonly used: ReadonlySet<string>
  readonly map: ReadonlyMap<string, HandleEntry>
  readonly nodeToHandle: ReadonlyMap<AstNode, string>
  readonly duplicates: readonly { readonly handle: string; readonly node: AstNode }[]
}

const assignHandle = (acc: HandleMapAcc, node: AstNode): HandleMapAcc => {
  const explicitHandleOption = fromNullable(node.handle)
  if (!isNone(explicitHandleOption)) {
    const explicitHandle = explicitHandleOption.value
    if (acc.used.has(explicitHandle)) {
      return {
        ...acc,
        duplicates: [...acc.duplicates, { handle: explicitHandle, node }]
      }
    }

    return {
      used: conj(explicitHandle)(acc.used),
      map: assoc(explicitHandle, { node, handle: explicitHandle })(acc.map),
      nodeToHandle: assoc(node, explicitHandle)(acc.nodeToHandle),
      duplicates: acc.duplicates
    }
  }

  const base = slugify(getOrElseOption<string>(() => 'node')(fromNullable(node.displayName)))
  const autoHandle = uniqueAutoHandle(base, acc.used)
  return {
    used: conj(autoHandle)(acc.used),
    map: assoc(autoHandle, { node, handle: autoHandle })(acc.map),
    nodeToHandle: assoc(node, autoHandle)(acc.nodeToHandle),
    duplicates: acc.duplicates
  }
}

/**
 * Build a handle map from an AST root: assign unique identifiers to all nodes.
 *
 * Process:
 * 1. Collect all nodes (children and staff recursively)
 * 2. For each node, use explicit handle if provided and unique
 * 3. Otherwise, auto-generate handle from display name (via slugification)
 * 4. Ensure uniqueness by appending '_2', '_3', etc. as needed
 *
 * @param root Root node of AST
 * @returns Object containing handle map, node-to-handle mapping, and duplicate list
 */
export const buildHandleMap = (
  root: AstNode
): BuildHandleMapResult => {
  const nodes = collectNodes(root)
  const initialAcc: HandleMapAcc = {
    used: intoSet<string>([]),
    map: intoMap<string, HandleEntry>([]),
    nodeToHandle: intoMap<AstNode, string>([]),
    duplicates: []
  }

  const finalAcc = nodes.reduce(assignHandle, initialAcc)
  return {
    map: finalAcc.map,
    nodeToHandle: finalAcc.nodeToHandle,
    duplicates: finalAcc.duplicates
  }
}
