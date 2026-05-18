/**
 * @module parse-and-resolve
 *
 * PURE CORE — no side-effects; all I/O enters via parameters.
 *
 * Parse and resolve BTL source into a final organizational tree.
 *
 * This module orchestrates the parsing (source → AST) and resolution (AST → OrgTree)
 * phases, capturing errors from both stages and returning a discriminated union
 * so callers can distinguish parse failures from semantic validation failures.
 *
 * @packageDocumentation
 */

import type { ParseAndResolveResult } from '../types/results'

import { parseBtl } from '../parser/parse'
import { resolveAst } from '../resolver/resolve'

type ParseAndResolveOptions = {
  readonly variables?: ReadonlyMap<string, string>
  readonly variableIcons?: ReadonlyArray<{ readonly variable: string; readonly icon: string; readonly normalizedValue: string }>
}

/**
 * Parse BTL source text and resolve to an organizational tree.
 *
 * @param source Raw BTL text
 * @param options Optional variable bindings injected before semantic resolution.
 * @returns A discriminated union: `{ ok: true, ast, tree }` on success,
 *          or `{ ok: false, parseError?, resolveErrors? }` on failure.
 * @param options Optional variable bindings and variable-icon bindings injected before semantic resolution.
 * @returns A discriminated union: `{ ok: true, ast, tree }` on success,
 *          or `{ ok: false, parseError?, resolveErrors? }` on failure.
 */
export const parseAndResolveBtl = (source: string, options: ParseAndResolveOptions = {}): ParseAndResolveResult => {
  const parsed = parseBtl(source)
  if (!parsed.ok) {
    return {
      ok: false,
      parseError: parsed
    }
  }

  const resolved = resolveAst(parsed.value, options.variables, options.variableIcons)
  if (!resolved.ok) {
    return {
      ok: false,
      resolveErrors: resolved.errors
    }
  }

  return {
    ok: true,
    ast: parsed.value,
    tree: resolved.tree
  }
}
