import { describe, expect, it } from 'vitest'
import { compile, listSubtreesFromSource } from './compile'

const requireCompileError = (
  result: ReturnType<typeof compile>
): Extract<ReturnType<typeof compile>, { readonly ok: false }> =>
  result.ok ? expect.fail('Expected compile to fail in this test setup') : result

const validSource = ['org "Acme"', '  CEO @ceo', '    Engineer @eng'].join('\n')

describe('compile when source defs extraction fails', () => {
  it('reports a parse error at the defs declaration line', () => {
    const source = ['defs', '  not-a-variable', ...validSource.split('\n')].join('\n')

    const result = requireCompileError(compile(source))

    expect(typeof result.parseError?.error).toBe('string')
    expect(result.parseError?.line).toBe(2)
  })
})

describe('compile when subtreeId does not resolve', () => {
  it('reports an unknown_handle resolve error for the missing subtree id', () => {
    const result = requireCompileError(compile(validSource, undefined, { subtreeId: 'missing' }))

    expect(result.resolveErrors?.[0]?.kind).toBe('unknown_handle')
  })
})

describe('compile when upstreamId does not resolve', () => {
  it('reports an unknown_handle resolve error for the missing upstream id', () => {
    const result = requireCompileError(compile(validSource, undefined, { upstreamId: 'missing' }))

    expect(result.resolveErrors?.[0]?.kind).toBe('unknown_handle')
  })
})

describe('compile when style resolution fails', () => {
  it('reports selector validation errors from the style block', () => {
    const source = ['style', '  @missing', '    color: #f00', ...validSource.split('\n')].join('\n')

    const result = requireCompileError(compile(source))

    expect((result.resolveErrors?.length ?? 0) > 0).toBe(true)
    expect(result.resolveErrors?.[0]?.kind).toBe('invalid_attr_value')
  })
})

describe('compile when all stages succeed', () => {
  it('returns rendered svg output for a valid source document', () => {
    const result = compile(validSource)

    expect(result.ok).toBe(true)
    expect(result.ok ? result.svg.includes('<svg') : false).toBe(true)
  })

  it('renders successfully when upstreamId is provided', () => {
    const result = compile(validSource, undefined, { upstreamId: 'eng' })

    expect(result.ok).toBe(true)
    expect(result.ok ? result.svg.includes('<svg') : false).toBe(true)
  })
})

describe('listSubtreesFromSource when semantic resolution fails', () => {
  it('returns department subtree entries from parsed AST fallback', () => {
    const source = [
      'org "Acme"',
      '  ~dept Engineering @dept_eng [head: @missing_head]',
      '    Lead @lead'
    ].join('\n')

    const entries = listSubtreesFromSource(source)

    expect(entries.some((entry) => entry.kind === 'department' && entry.id === 'dept_eng')).toBe(true)
  })
})

describe('listSubtreesFromSource fallback when department has no handle', () => {
  it('derives a stable department id from display name when handle is missing', () => {
    const source = [
      'org "Acme"',
      '  ~dept Platform [head: @missing_head]',
      '    Lead @lead'
    ].join('\n')

    const entries = listSubtreesFromSource(source)

    expect(entries.some((entry) => entry.kind === 'department' && entry.id === 'platform')).toBe(true)
  })
})

describe('listSubtreesFromSource fallback when staff and department siblings coexist', () => {
  it('still returns department entries from the org tree', () => {
    const source = [
      'org "Acme"',
      '  ~staff Support [primary: @ceo] [style: none]',
      '  ~dept Unit Core @uc [head: @ceo]',
      '    Lead @ceo'
    ].join('\n')

    const entries = listSubtreesFromSource(source)

    expect(entries.some((entry) => entry.kind === 'department' && entry.id === 'uc')).toBe(true)
  })
})

describe('listSubtreesFromSource fallback when semantic resolution fails for a non-department tree', () => {
  it('still exposes employee nodes as selectable subtree entries', () => {
    const source = [
      'org "Acme"',
      '  Alice @alice',
      'links',
      '  @alice --> @missing [kind: dt]'
    ].join('\n')

    const entries = listSubtreesFromSource(source)

    expect(entries.some((entry) => entry.kind === 'employee' && entry.id === 'alice')).toBe(true)
  })
})