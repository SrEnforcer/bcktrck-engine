import { describe, expect, it, vi } from 'vitest'
import type { AstOrg } from '../types/ast'

vi.mock('../lexer/tokenize', () => ({
  tokenize: vi.fn()
}))

vi.mock('./grammar', () => ({
  parse: vi.fn()
}))

import { tokenize } from '../lexer/tokenize'
import { parse } from './grammar'
import { parseBtl } from './parse'

const mockedTokenize = vi.mocked(tokenize)
const mockedParse = vi.mocked(parse)

const requireParseErr = (
  result: ReturnType<typeof parseBtl>
): Extract<ReturnType<typeof parseBtl>, { readonly ok: false }> =>
  result.ok ? expect.fail('Expected parseBtl to fail in this test setup') : result

const minimalAst = (): AstOrg => ({
  name: 'Acme',
  attrs: [],
  root: {
    kind: 'employee',
    line: 1,
    col: 1,
    displayName: 'CEO',
    handle: 'ceo',
    attrs: [],
    layoutHints: [],
    visualHints: [],
    children: [],
    staffNodes: []
  },
  links: [],
  config: { pairs: [] }
})

describe('parseBtl when tokenize and grammar parse succeed', () => {
  it('returns the grammar parse result unchanged', () => {
    const expected = { ok: true, value: minimalAst(), rest: [] } as const
    mockedTokenize.mockReturnValue([])
    mockedParse.mockReturnValue(expected)

    const result = parseBtl('org acme')

    expect(result).toEqual(expected)
  })
})

describe('parseBtl when grammar parsing returns a parse error', () => {
  it('returns that parse error unchanged', () => {
    const expected = { ok: false, error: 'unexpected token', line: 2, col: 5 } as const
    mockedTokenize.mockReturnValue([])
    mockedParse.mockReturnValue(expected)

    const result = parseBtl('broken')

    expect(result).toEqual(expected)
  })
})

describe('parseBtl when tokenization throws', () => {
  it('wraps the exception as a parser exception parse error', () => {
    mockedTokenize.mockImplementation(() => JSON.parse('{'))

    const result = requireParseErr(parseBtl('boom'))

    expect(result.error.startsWith('Parser exception:')).toBe(true)
  })
})