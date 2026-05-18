/**
 * @module types/results
 *
 * Result types: discriminated unions for error handling.
 *
 * `ParseResult` and `ResolveResult` allow callers to distinguish between success
 * and distinct failure modes without using exceptions. Type guards (`.ok` predicate)
 * enable TypeScript narrowing.
 *
 * @packageDocumentation
 */

import type { AstOrg } from './ast'
import type { Token } from '../lexer/tokens'
import type { OrgTree } from './org-tree'

/** Successful parser output containing parsed value and unconsumed token tail. */
export type ParseOk<T> = {
  readonly ok: true
  readonly value: T
  readonly rest: readonly Token[]
}

/** Parser failure with message and source position for diagnostics. */
export type ParseErr = {
  readonly ok: false
  readonly error: string
  readonly line: number
  readonly col: number
}

/** Generic parser result ADT. */
export type ParseResult<T> = ParseOk<T> | ParseErr

/** Semantic resolver error categories. */
export type ResolveErrorKind =
  | 'unknown_handle'
  | 'duplicate_handle'
  | 'cycle_in_staff'
  | 'invalid_attr_value'

/** Structured semantic resolver error with optional suggestion. */
export type ResolveError = {
  readonly kind: ResolveErrorKind
  readonly handle: string
  readonly line: number
  readonly col: number
  readonly message: string
  readonly suggestion?: string
}

/** Semantic resolver output ADT. */
export type ResolveResult =
  | { readonly ok: true; readonly tree: OrgTree }
  | { readonly ok: false; readonly errors: readonly ResolveError[] }

/** End-to-end parse+resolve output ADT. */
export type ParseAndResolveResult =
  | { readonly ok: true; readonly ast: AstOrg; readonly tree: OrgTree }
  | { readonly ok: false; readonly parseError?: ParseErr; readonly resolveErrors?: readonly ResolveError[] }
