/**
 * @module types/ast
 *
 * Abstract Syntax Tree (AST) types: intermediate representation after parsing.
 *
 * Preserves source structure (line/col positions), includes declarations, attributes,
 * layout hints, and visual directives. Used as input to semantic validation/resolution.
 *
 * AST node kinds: employee, staff, dept, group, vacant, shared, shadow, extern.
 *
 * @packageDocumentation
 */

/** Node categories emitted by the parser before semantic resolution. */
export type AstNodeKind =
  | 'employee'
  | 'staff'
  | 'dept'
  | 'group'
  | 'vacant'
  | 'shared'
  | 'shadow'
  | 'extern'

/** Literal attribute values supported by the BTL grammar. */
export type AstAttrValue =
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'date'; readonly value: string }
  | { readonly kind: 'url'; readonly value: string }
  | { readonly kind: 'tags'; readonly value: readonly string[] }

/** Key/value attribute pair attached to nodes, links, or config blocks. */
export type AstAttr = {
  readonly key: string
  readonly value: AstAttrValue
}

/** Layout hint names allowed in the DSL. */
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

/** Concrete layout hint with optional parameter payload. */
export type AstLayoutHint = {
  readonly kind: AstLayoutHintKind
  readonly param: number | string | undefined
}

/** Parsed visual directive with name and ordered string parameters. */
export type AstVisualDirective = {
  readonly name: string
  readonly params: readonly string[]
}

/** Parsed organization node preserving location and unresolved child/staff structure. */
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

/** Parsed dotted/alternative link declaration before semantic validation. */
export type AstLink = {
  readonly line: number
  readonly col: number
  readonly from: string
  readonly to: string
  readonly attrs: readonly AstAttr[]
}

/** Top-level config block represented as raw attribute pairs. */
export type AstConfig = {
  readonly pairs: readonly AstAttr[]
}

/** Full parsed AST document returned by grammar entrypoint. */
export type AstOrg = {
  readonly name: string
  readonly attrs: readonly AstAttr[]
  readonly root: AstNode
  readonly links: readonly AstLink[]
  readonly config: AstConfig
}
