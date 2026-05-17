import { describe, expect, it, vi } from 'vitest'

vi.mock('./parser/parse', () => ({
  parseBtl: vi.fn()
}))

vi.mock('./resolver/resolve', () => ({
  resolveAst: vi.fn()
}))

import { parseBtl } from './parser/parse'
import { resolveAst } from './resolver/resolve'
import { parseAndResolveBtl } from './parse-and-resolve'
import { mkCompileAst, mkParseResolveTree } from './tests/factories/compile-slice'

const mockedParseBtl = vi.mocked(parseBtl)
const mockedResolveAst = vi.mocked(resolveAst)

describe('parseAndResolveBtl when parsing fails', () => {
  it('returns a parseError result and skips resolution', () => {
    const parseError = { ok: false, error: 'parse failed', line: 2, col: 3 } as const
    mockedParseBtl.mockReturnValue(parseError)

    const result = parseAndResolveBtl('invalid source')

    expect(result).toEqual({ ok: false, parseError })
  })
})

describe('parseAndResolveBtl when parsing succeeds and resolution fails', () => {
  it('returns resolveErrors from the resolver', () => {
    const ast = mkCompileAst()
    mockedParseBtl.mockReturnValue({ ok: true, value: ast, rest: [] })
    mockedResolveAst.mockReturnValue({
      ok: false,
      errors: [{ kind: 'invalid_attr_value', handle: 'x', line: 1, col: 1, message: 'bad attr' }]
    })

    const result = parseAndResolveBtl('source')

    expect(result).toEqual({
      ok: false,
      resolveErrors: [{ kind: 'invalid_attr_value', handle: 'x', line: 1, col: 1, message: 'bad attr' }]
    })
  })
})

describe('parseAndResolveBtl when parsing and resolution succeed', () => {
  it('returns ok with ast and resolved tree', () => {
    const ast = mkCompileAst()
    const tree = mkParseResolveTree()
    mockedParseBtl.mockReturnValue({ ok: true, value: ast, rest: [] })
    mockedResolveAst.mockReturnValue({ ok: true, tree })

    const result = parseAndResolveBtl('source')

    expect(result).toEqual({ ok: true, ast, tree })
  })
})