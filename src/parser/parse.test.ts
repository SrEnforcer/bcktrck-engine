import { describe, expect, it } from 'vitest'
import { parseBtl } from './parse'

const requireParseErr = (
  result: ReturnType<typeof parseBtl>
): Extract<ReturnType<typeof parseBtl>, { readonly ok: false }> =>
  result.ok ? expect.fail('Expected parseBtl to fail in this test setup') : result

describe('parseBtl when tokenize and grammar parse succeed', () => {
  it('returns an AstOrg for valid source', () => {
    const result = parseBtl(['org "Acme"', '  Alice @alice'].join('\n'))

    expect(result.ok).toBe(true)
    expect(result.ok ? result.value.name : '').toBe('Acme')
  })
})

describe('parseBtl when grammar parsing returns a parse error', () => {
  it('returns parse error details from grammar', () => {
    const result = requireParseErr(parseBtl(['org "Acme"', '  Alice %mystery'].join('\n')))

    expect(result.error.includes('Unknown layout hint kind')).toBe(true)
    expect(result.line).toBe(2)
  })
})

describe('parseBtl when a handle marker has no identifier', () => {
  it('returns parse error with expected-handle message', () => {
    const result = requireParseErr(parseBtl(['org "Acme"', '  Alice @'].join('\n')))

    expect(result.error.includes('Expected handle identifier')).toBe(true)
  })
})