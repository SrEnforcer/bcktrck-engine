import { describe, expect, it } from 'vitest'
import { buildHandleMap } from './handles'
import { mkResolverNode } from '../tests/factories/resolver-slice'

describe('buildHandleMap when explicit handles are unique', () => {
  it('maps each explicit handle and leaves duplicates empty', () => {
    const child = mkResolverNode('employee', { displayName: 'Engineer', handle: 'eng' })
    const root = mkResolverNode('employee', {
      displayName: 'Chief Executive',
      handle: 'ceo',
      children: [child]
    })

    const result = buildHandleMap(root)

    expect(result.map.has('ceo')).toBe(true)
    expect(result.map.has('eng')).toBe(true)
    expect(result.duplicates.length).toBe(0)
  })
})

describe('buildHandleMap when explicit handles are duplicated', () => {
  it('records duplicate handles without replacing the first mapping', () => {
    const child = mkResolverNode('employee', { displayName: 'Engineer', handle: 'dup' })
    const root = mkResolverNode('employee', {
      displayName: 'Chief Executive',
      handle: 'dup',
      children: [child]
    })

    const result = buildHandleMap(root)

    expect(result.map.size).toBe(1)
    expect(result.duplicates.length).toBe(1)
    expect(result.duplicates[0]?.handle).toBe('dup')
  })
})

describe('buildHandleMap when handles are missing', () => {
  it('auto-generates slugified handles and disambiguates collisions', () => {
    const childA = mkResolverNode('employee', { displayName: 'Data Platform', handle: undefined })
    const childB = mkResolverNode('employee', { displayName: 'Data Platform', handle: undefined })
    const root = mkResolverNode('employee', {
      displayName: 'Chief Executive',
      handle: undefined,
      children: [childA, childB]
    })

    const result = buildHandleMap(root)

    expect(result.map.has('chief-executive')).toBe(true)
    expect(result.map.has('data-platform')).toBe(true)
    expect(result.map.has('data-platform_2')).toBe(true)
  })
})

describe('buildHandleMap when a display name slug is empty', () => {
  it('falls back to node as the base auto handle', () => {
    const root = mkResolverNode('employee', { displayName: '!!!', handle: undefined })

    const result = buildHandleMap(root)

    expect(result.map.has('node')).toBe(true)
  })
})

describe('buildHandleMap when staff nodes are present', () => {
  it('includes staff nodes in the handle map traversal', () => {
    const staff = mkResolverNode('employee', { displayName: 'Assistant', handle: 'assistant' })
    const root = mkResolverNode('employee', {
      displayName: 'Chief Executive',
      handle: 'ceo',
      staffNodes: [staff]
    })

    const result = buildHandleMap(root)

    expect(result.map.has('assistant')).toBe(true)
    expect(result.nodeToHandle.get(staff)).toBe('assistant')
  })
})