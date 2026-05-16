/**
 * Abstract Syntax Tree (AST) types: intermediate representation after parsing.
 *
 * Preserves source structure (line/col positions), includes declarations, attributes,
 * layout hints, and visual directives. Used as input to semantic validation/resolution.
 *
 * AST node kinds: employee, staff, dept, group, vacant, shared, shadow, extern.
 */

export type AstNodeKind =
  | 'employee'
  | 'staff'
  | 'dept'
  | 'group'
  | 'vacant'
  | 'shared'
  | 'shadow'
  | 'extern'

export type AstAttrValue =
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'date'; readonly value: string }
  | { readonly kind: 'url'; readonly value: string }
  | { readonly kind: 'tags'; readonly value: readonly string[] }

export type AstAttr = {
  readonly key: string
  readonly value: AstAttrValue
}

export type AstLayoutHintKind =
  | 'hanging'
  | 'hanging-left'
  | 'hanging-right'
  | 'hanging-both'
  | 'multirow'
  | 'compact'
  | 'wide'
  | 'flat'
  | 'expand'

export type AstLayoutHint = {
  readonly kind: AstLayoutHintKind
  readonly param: number | string | undefined
}

export type AstVisualDirective = {
  readonly name: string
  readonly params: readonly string[]
}

export type AstNode = {
  readonly kind: AstNodeKind
  readonly line: number
  readonly col: number
  readonly displayName: string | undefined
  readonly handle: string | undefined
  readonly attrs: readonly AstAttr[]
  readonly layoutHints: readonly AstLayoutHint[]
  readonly visualHints: readonly AstVisualDirective[]
  readonly children: readonly AstNode[]
  readonly staffNodes: readonly AstNode[]
}

export type AstLink = {
  readonly line: number
  readonly col: number
  readonly from: string
  readonly to: string
  readonly attrs: readonly AstAttr[]
}

export type AstConfig = {
  readonly pairs: readonly AstAttr[]
}

export type AstOrg = {
  readonly name: string
  readonly attrs: readonly AstAttr[]
  readonly root: AstNode
  readonly links: readonly AstLink[]
  readonly config: AstConfig
}
