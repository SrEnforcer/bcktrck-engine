import { describe, expect, it } from 'vitest'
import { parseAndResolveBtl } from './parse-and-resolve'

const validSource = ['org "Acme"', '  CEO @ceo', '    Engineer @eng'].join('\n')

describe('parseAndResolveBtl when parsing fails', () => {
  it('returns a parseError result and skips resolution', () => {
    const result = parseAndResolveBtl('org "Acme"\n  Alice @')

    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.parseError?.error.includes('Expected handle identifier')).toBe(true)
  })
})

describe('parseAndResolveBtl when parsing succeeds and resolution fails', () => {
  it('returns resolveErrors from the resolver', () => {
    const source = [...validSource.split('\n'), 'links', '  @ceo --> @missing [kind: dt]'].join('\n')
    const result = parseAndResolveBtl(source)

    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.resolveErrors?.[0]?.kind).toBe('unknown_handle')
  })
})

describe('parseAndResolveBtl when parsing and resolution succeed', () => {
  it('returns ok with ast and resolved tree', () => {
    const result = parseAndResolveBtl(validSource)

    expect(result.ok).toBe(true)
    expect(result.ok ? result.ast.name : '').toBe('Acme')
    expect(result.ok ? result.tree.root.kind : 'none').toBe('employee')
  })
})