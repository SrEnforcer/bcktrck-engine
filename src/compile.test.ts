import { describe, expect, it } from 'vitest'
import { compile } from './compile'

const requireCompileError = (
  result: ReturnType<typeof compile>
): Extract<ReturnType<typeof compile>, { readonly ok: false }> =>
  result.ok ? expect.fail('Expected compile to fail in this test setup') : result

const validSource = ['org "Acme"', '  CEO @ceo', '    Engineer @eng'].join('\n')

describe('compile when source defs extraction fails', () => {
  it('returns parseError', () => {
    const result = requireCompileError(compile(['defs', '  not-a-variable', ...validSource.split('\n')].join('\n')))

    expect(typeof result.parseError?.error).toBe('string')
    expect(result.parseError?.line).toBe(2)
  })
})

describe('compile when subtreeId does not resolve', () => {
  it('returns unknown_handle resolveErrors', () => {
    const result = requireCompileError(compile(validSource, undefined, { subtreeId: 'missing' }))

    expect(result.resolveErrors?.[0]?.kind).toBe('unknown_handle')
  })
})

describe('compile when style resolution fails', () => {
  it('returns resolveErrors from style selector validation', () => {
    const source = ['style', '  @missing', '    color: #f00', ...validSource.split('\n')].join('\n')
    const result = requireCompileError(compile(source))

    expect((result.resolveErrors?.length ?? 0) > 0).toBe(true)
    expect(result.resolveErrors?.[0]?.kind).toBe('invalid_attr_value')
  })
})

describe('compile when all stages succeed', () => {
  it('returns ok with svg and viewBox', () => {
    const result = compile(validSource)

    expect(result.ok).toBe(true)
    expect(result.ok ? result.svg.includes('<svg') : false).toBe(true)
  })
})