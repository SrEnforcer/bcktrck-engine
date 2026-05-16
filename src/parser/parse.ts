/**
 * BTL parser: tokenizes source and parses tokens into an Abstract Syntax Tree.
 *
 * Uses lexical analysis followed by a parser combinator-based grammar to produce
 * a well-formed AstOrg, or returns a detailed parse error on failure.
 */

import { getStringField, isRecord, isSome } from '@tsfpp/prelude'
import { tokenize } from '../lexer/tokenize'
import type { AstOrg } from '../types/ast'
import type { ParseResult } from '../types/results'

import { parse } from './grammar'

const errorMessage = (error: unknown): string => {
  if (!isRecord(error)) {
    return String(error)
  }
  const message = getStringField(error, 'message')
  return isSome(message) ? message.value : String(error)
}

/**
 * Parse BTL source into an AstOrg value or a typed parse error.
 *
 * @param source Raw BTL text
 * @returns `{ ok: true, value: AstOrg, rest: [] }` on success,
 *          or `{ ok: false, error, line, col }` on parse failure.
 */
export const parseBtl = (source: string): ParseResult<AstOrg> => {
  try {
    const tokens = tokenize(source)
    return parse(tokens)
  } catch (error) {
    return {
      ok: false,
      error: `Parser exception: ${errorMessage(error)}`,
      line: 1,
      col: 1
    }
  }
}
