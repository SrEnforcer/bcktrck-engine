/**
 * @module parser/combinators
 *
 * Parser combinators for composing token parsers into a modular recursive-descent grammar.
 *
 * Provides combinator functions (map, seq, choice, many, opt, etc.) that enable
 * bottom-up composition of token-level parsers into higher-level declarative grammars.
 *
 * @packageDocumentation
 */

import type { Option } from '@tsfpp/prelude'
import { fromNullable, getOrElse, isNone, none, some } from '@tsfpp/prelude'
import type { Token, TokenKind } from '../lexer/tokens'
import type { ParseResult } from '../types/results'

const lineOrZero = (token: Token | undefined): number =>
  getOrElse<number>(() => 0)(fromNullable(token?.line))

const colOrZero = (token: Token | undefined): number =>
  getOrElse<number>(() => 0)(fromNullable(token?.col))

const tokenKindOrEof = (token: Token | undefined): TokenKind | 'eof' =>
  getOrElse<TokenKind | 'eof'>(() => 'eof')(fromNullable(token?.kind))

/**
 * A parser takes a token stream and returns a ParseResult.
 * Success includes the parsed value and remaining tokens; failure includes error details and position.
 */
export type Parser<T> = (tokens: readonly Token[]) => ParseResult<T>

/**
 * Transform a parser's output via a mapping function.
 *
 * @param parser Source parser
 * @param mapper Function to transform the parsed value
 * @returns A new parser that applies the mapping
 */
export const map = <A, B>(parser: Parser<A>, mapper: (value: A) => B): Parser<B> => {
  return (tokens) => {
    const result = parser(tokens)
    if (!result.ok) {
      return result
    }

    return {
      ok: true,
      value: mapper(result.value),
      rest: result.rest
    }
  }
}

/**
 * Sequence two parsers: run first, then second on the remaining tokens.
 * Both must succeed; otherwise return the first error.
 *
 * @param first First parser
 * @param second Second parser (runs on first's remaining tokens)
 * @returns A parser that returns a tuple of both parsed values
 */
export const seq = <A, B>(first: Parser<A>, second: Parser<B>): Parser<readonly [A, B]> => {
  return (tokens) => {
    const firstResult = first(tokens)
    if (!firstResult.ok) {
      return firstResult
    }

    const secondResult = second(firstResult.rest)
    if (!secondResult.ok) {
      return secondResult
    }

    return {
      ok: true,
      value: [firstResult.value, secondResult.value] as const,
      rest: secondResult.rest
    }
  }
}

/**
 * Try parsers in order until one succeeds; return its result.
 * If all fail, report a combined error listing all alternatives.
 *
 * @param parsers Alternative parsers to try in sequence
 * @returns A parser that succeeds on the first successful alternative
 */
export const choice = <T>(...parsers: readonly Parser<T>[]): Parser<T> => {
  return (tokens) => {
    const tryParserAt = (index: number, errors: readonly string[]): ParseResult<T> => {
      const parserOption = fromNullable(parsers[index])
      if (isNone(parserOption)) {
        const first = tokens[0]
        return {
          ok: false,
          error: `No alternative matched: ${errors.join(' | ')}`,
          line: lineOrZero(first),
          col: colOrZero(first)
        }
      }

      const result = parserOption.value(tokens)
      return result.ok ? result : tryParserAt(index + 1, [...errors, result.error])
    }

    return tryParserAt(0, [])
  }
}

/**
 * Repeat a parser zero or more times, returning an array of results.
 * Succeeds even if the parser fails on the first token (matches zero occurrences).
 * Detects infinite loops (non-consuming parsers) and returns an error.
 *
 * @param parser Parser to repeat
 * @returns A parser that collects zero or more successful applications
 */
export const many = <T>(parser: Parser<T>): Parser<readonly T[]> => {
  return (tokens) => {
    const collect = (rest: readonly Token[], values: readonly T[]): ParseResult<readonly T[]> => {
      const result = parser(rest)
      if (!result.ok) {
        return {
          ok: true,
          value: values,
          rest
        }
      }

      if (result.rest.length === rest.length) {
        return {
          ok: false,
          error: 'Parser in many() did not consume input',
          line: lineOrZero(result.rest[0]),
          col: colOrZero(result.rest[0])
        }
      }

      return collect(result.rest, [...values, result.value])
    }

    return collect(tokens, [])
  }
}

/**
 * Make a parser optional: succeeds with `some(T)` on a match or `none` on failure.
 * Always consumes zero tokens on failure (backtracking).
 *
 * @param parser Parser to make optional
 * @returns A parser that returns `Option<T>` — `none` instead of `undefined` on miss
 */
export const opt = <T>(parser: Parser<T>): Parser<Option<T>> => {
  return (tokens) => {
    const result = parser(tokens)
    if (!result.ok) {
      return {
        ok: true,
        value: none,
        rest: tokens
      }
    }

    return {
      ok: true,
      value: some(result.value),
      rest: result.rest
    }
  }
}

/**
 * Match a single token of the given kind, consuming it from the stream.
 *
 * @param kind The expected `TokenKind`.
 * @returns A parser that succeeds with the matched token, or fails with a descriptive error.
 */
export const token = (kind: TokenKind): Parser<Token> => {
  return (tokens) => {
    const current = tokens[0]
    const currentOption = fromNullable(current)
    if (tokenKindOrEof(current) === kind && !isNone(currentOption)) {
      return {
        ok: true,
        value: currentOption.value,
        rest: tokens.slice(1)
      }
    }

    return {
      ok: false,
      error: `Expected ${kind}, got ${tokenKindOrEof(current)}`,
      line: lineOrZero(current),
      col: colOrZero(current)
    }
  }
}

/**
 * Defer parser construction until the first parse invocation.
 *
 * Breaks circular reference cycles that arise in mutually-recursive grammar rules
 * (e.g. an expression parser that references itself via a sub-rule).
 *
 * @param factory Thunk that returns the actual parser when called.
 * @returns A parser that calls `factory()` on every invocation.
 */
export const lazy = <T>(factory: () => Parser<T>): Parser<T> => {
  return (tokens) => factory()(tokens)
}
