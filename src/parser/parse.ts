/**
 * @module parser/parse
 *
 * BTL parser: tokenizes source and parses tokens into an Abstract Syntax Tree.
 *
 * Uses lexical analysis followed by a parser combinator-based grammar to produce
 * a well-formed AstOrg, or returns a detailed parse error on failure.
 *
 * @packageDocumentation
 */

import { getStringField, isOk, isRecord, matchOption, tryCatch } from '@tsfpp/prelude'
import { tokenize } from '../lexer/tokenize'
import type { AstOrg } from '../types/ast'
import type { ParseResult } from '../types/results'

import { parse } from './grammar'

const errorMessage = (error: unknown): string => {
  if (!isRecord(error)) {
    return String(error)
  }
  const message = getStringField(error, 'message')
  return matchOption(() => String(error), (value: string) => value)(message)
}

/**
 * Parse BTL source into an AstOrg value or a typed parse error.
 *
 * @param source Raw BTL text
 * @returns `{ ok: true, value: AstOrg, rest: [] }` on success,
 *          or `{ ok: false, error, line, col }` on parse failure.
 */
export const parseBtl = (source: string): ParseResult<AstOrg> => {
  const parsed = tryCatch(
    () => parse(tokenize(source)),
    (error) => errorMessage(error)
  )
  if (isOk(parsed)) {
    return parsed.value
  }
  return {
    ok: false,
    error: `Parser exception: ${parsed.error}`,
    line: 1,
    col: 1
  }
}
