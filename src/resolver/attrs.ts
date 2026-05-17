/**
 * @module resolver/attrs
 *
 * Provide typed AST attribute lookup helpers used by semantic resolvers.
 *
 * @packageDocumentation
 */

import { fromNullable, isNone } from '@tsfpp/prelude'
import type { AstAttr } from '../types/ast'

const findAttrByKey = (key: string, attrs: readonly AstAttr[]): AstAttr | undefined =>
  attrs.find((attr) => attr.key === key)

/**
 * Look up a string-typed attribute value by key.
 *
 * @param key Attribute key to search for.
 * @param attrs Attribute list from an AST node.
 * @returns The string value when the attribute exists and its value is typed as a string literal; otherwise `undefined`.
 */
export const findStringAttrValue = (key: string, attrs: readonly AstAttr[]): string | undefined => {
  const attrOption = fromNullable(findAttrByKey(key, attrs))
  if (isNone(attrOption)) return undefined
  if (attrOption.value.value.kind !== 'string') {
    return undefined
  }
  return attrOption.value.value.value
}

/**
 * Look up a number-typed attribute value by key.
 *
 * @param key Attribute key to search for.
 * @param attrs Attribute list from an AST node.
 * @returns The numeric value when the attribute exists and its value is typed as a number literal; otherwise `undefined`.
 */
export const findNumberAttrValue = (key: string, attrs: readonly AstAttr[]): number | undefined => {
  const attrOption = fromNullable(findAttrByKey(key, attrs))
  if (isNone(attrOption)) return undefined
  if (attrOption.value.value.kind !== 'number') {
    return undefined
  }
  return attrOption.value.value.value
}

/**
 * Look up a handle-reference attribute value by key.
 *
 * A handle reference is a string attribute whose raw value starts with `@`.
 * The leading `@` is stripped in the returned value.
 *
 * @param key Attribute key to search for.
 * @param attrs Attribute list from an AST node.
 * @returns The handle name (without `@`) when found; otherwise `undefined`.
 */
export const findHandleRefAttrValue = (key: string, attrs: readonly AstAttr[]): string | undefined => {
  const raw = findStringAttrValue(key, attrs)
  return raw?.startsWith('@') === true ? raw.slice(1) : undefined
}
