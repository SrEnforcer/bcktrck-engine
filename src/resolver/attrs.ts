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
  const attr = findAttrByKey(key, attrs)
  if (attr === undefined) return undefined
  if (attr.value.kind !== 'string') {
    return undefined
  }
  return attr.value.value
}

/**
 * Look up a number-typed attribute value by key.
 *
 * @param key Attribute key to search for.
 * @param attrs Attribute list from an AST node.
 * @returns The numeric value when the attribute exists and its value is typed as a number literal; otherwise `undefined`.
 */
export const findNumberAttrValue = (key: string, attrs: readonly AstAttr[]): number | undefined => {
  const attr = findAttrByKey(key, attrs)
  if (attr === undefined) return undefined
  if (attr.value.kind !== 'number') {
    return undefined
  }
  return attr.value.value
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
