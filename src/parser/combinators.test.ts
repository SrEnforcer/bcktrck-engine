import * as fc from 'fast-check'
import { isNone, isSome } from '@tsfpp/prelude'
import { describe, expect, it } from 'vitest'
import { choice, lazy, many, map, opt, seq, token, type Parser } from './combinators'
import { mkConsumeUntilEmptyParser, mkParserToken } from '../tests/factories/parser-slice'

const requireParseOk = <T>(
  result: ReturnType<Parser<T>>
): Extract<ReturnType<Parser<T>>, { readonly ok: true }> =>
  result.ok ? result : expect.fail('Expected parser to succeed in this test setup')

const requireParseErr = <T>(
  result: ReturnType<Parser<T>>
): Extract<ReturnType<Parser<T>>, { readonly ok: false }> =>
  result.ok ? expect.fail('Expected parser to fail in this test setup') : result

describe('map when the source parser succeeds', () => {
  it('returns the mapped value and preserves remaining tokens', () => {
    const parser: Parser<number> = () => ({ ok: true, value: 2, rest: [mkParserToken('eof')] })

    const result = requireParseOk(map(parser, (value) => value * 3)([]))

    expect(result.value).toBe(6)
    expect(result.rest.length).toBe(1)
  })
})

describe('map when the source parser fails', () => {
  it('returns the original parse error', () => {
    const parser: Parser<number> = () => ({ ok: false, error: 'boom', line: 2, col: 3 })

    const result = map(parser, (value) => value * 3)([])

    expect(result).toEqual({ ok: false, error: 'boom', line: 2, col: 3 })
  })
})

describe('seq', () => {
  it('returns a tuple when both parsers succeed', () => {
    const first: Parser<string> = (tokens) => ({ ok: true, value: 'a', rest: tokens.slice(1) })
    const second: Parser<number> = (tokens) => ({ ok: true, value: tokens.length, rest: tokens.slice(1) })

    const result = requireParseOk(seq(first, second)([mkParserToken('identifier'), mkParserToken('eof')]))

    expect(result.value[0]).toBe('a')
    expect(result.value[1]).toBe(1)
  })

  it('returns the first parser error without running the second result path', () => {
    const first: Parser<string> = () => ({ ok: false, error: 'first-fail', line: 1, col: 1 })
    const second: Parser<number> = () => ({ ok: true, value: 1, rest: [] })

    const result = seq(first, second)([mkParserToken('identifier')])

    expect(result).toEqual({ ok: false, error: 'first-fail', line: 1, col: 1 })
  })

  it('returns the second parser error when the first parser succeeds', () => {
    const first: Parser<string> = (tokens) => ({ ok: true, value: 'ok', rest: tokens })
    const second: Parser<number> = () => ({ ok: false, error: 'second-fail', line: 4, col: 2 })

    const result = seq(first, second)([mkParserToken('identifier')])

    expect(result).toEqual({ ok: false, error: 'second-fail', line: 4, col: 2 })
  })
})

describe('choice', () => {
  it('returns the first successful parser result', () => {
    const failing: Parser<string> = () => ({ ok: false, error: 'fail-1', line: 1, col: 1 })
    const succeeding: Parser<string> = (tokens) => ({ ok: true, value: 'winner', rest: tokens.slice(1) })

    const result = requireParseOk(choice(failing, succeeding)([mkParserToken('identifier'), mkParserToken('eof')]))

    expect(result.value).toBe('winner')
  })

  it('returns a combined alternative error when all parsers fail', () => {
    const failA: Parser<string> = () => ({ ok: false, error: 'a', line: 3, col: 4 })
    const failB: Parser<string> = () => ({ ok: false, error: 'b', line: 5, col: 6 })

    const result = requireParseErr(choice(failA, failB)([mkParserToken('identifier')]))

    expect(result.error.includes('a | b')).toBe(true)
  })
})

describe('many', () => {
  it('returns an empty array when the parser fails immediately', () => {
    const parser: Parser<string> = () => ({ ok: false, error: 'stop', line: 1, col: 1 })

    const result = requireParseOk(many(parser)([mkParserToken('identifier')]))

    expect(result.value.length).toBe(0)
  })

  it('collects repeated values while input is consumed', () => {
    const parser = mkConsumeUntilEmptyParser()

    const result = requireParseOk(many(parser)([mkParserToken('identifier', 'x'), mkParserToken('identifier', 'y')]))

    expect(result.value.join(',')).toBe('x,y')
  })

  it('returns an error when the parser does not consume any input', () => {
    const parser: Parser<string> = (tokens) => ({ ok: true, value: 'loop', rest: tokens })

    const result = requireParseErr(many(parser)([mkParserToken('identifier')]))

    expect(result.error.includes('did not consume input')).toBe(true)
  })
})

describe('opt', () => {
  it('returns Some when the parser succeeds', () => {
    const parser: Parser<string> = (tokens) => ({ ok: true, value: 'hit', rest: tokens.slice(1) })

    const result = requireParseOk(opt(parser)([mkParserToken('identifier'), mkParserToken('eof')]))

    expect(isSome(result.value)).toBe(true)
    expect(isSome(result.value) ? result.value.value : '').toBe('hit')
  })

  it('returns None and keeps input when the parser fails', () => {
    const parser: Parser<string> = () => ({ ok: false, error: 'miss', line: 1, col: 1 })
    const tokens = [mkParserToken('identifier'), mkParserToken('eof')]

    const result = requireParseOk(opt(parser)(tokens))

    expect(isNone(result.value)).toBe(true)
    expect(result.rest.length).toBe(tokens.length)
  })
})

describe('token', () => {
  it('returns the matching token and consumes it', () => {
    const result = requireParseOk(token('identifier')([mkParserToken('identifier'), mkParserToken('eof')]))

    expect(result.value.kind).toBe('identifier')
    expect(result.rest.length).toBe(1)
  })

  it('returns an expected-vs-actual error when kinds differ', () => {
    const result = requireParseErr(token('identifier')([mkParserToken('keyword_org')]))

    expect(result.error.includes('Expected identifier, got keyword_org')).toBe(true)
  })
})

describe('lazy', () => {
  it('invokes the parser factory at parse time', () => {
    const parser = lazy(() => token('identifier'))

    const result = parser([mkParserToken('identifier')])

    expect(result.ok).toBe(true)
  })
})

describe('combinator properties', () => {
  it('token parser succeeds for any identifier token stream with an identifier head', () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { minLength: 1, maxLength: 8 }), (values) => {
        const parsedTokens = values.map((value) => mkParserToken('identifier', value))

        const result = token('identifier')(parsedTokens)

        expect(result.ok).toBe(true)
      })
    )
  })
})