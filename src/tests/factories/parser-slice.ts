/**
 * @module tests/factories/parser-slice
 *
 * Test fixture builders shared across unit and slice tests.
 *
 * @packageDocumentation
 */

import type { Token } from '../../lexer/tokens'
import type { Parser } from '../../parser/combinators'
import { fromNullable, getOrElse } from '@tsfpp/prelude'

/** Build mkParserToken test fixture values. */
export const mkParserToken = (
  kind: Token['kind'],
  value: string = kind
): Token => ({
  kind,
  value,
  line: 1,
  col: 1
})

/** Parser that consumes tokens until empty and then fails, used by many() tests. */
export const mkConsumeUntilEmptyParser = (): Parser<string> => {
  const parseWithFallback = (tokens: readonly Token[]): string =>
    getOrElse<string>(() => '')(fromNullable(tokens[0]?.value))

  return (tokens) => tokens.length === 0
    ? { ok: false, error: 'done', line: 1, col: 1 }
    : { ok: true, value: parseWithFallback(tokens), rest: tokens.slice(1) }
}
