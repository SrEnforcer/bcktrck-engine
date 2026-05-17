import { describe, expect, it } from 'vitest'
import { asDeptId, asHandle, asNodeId } from './branded'

describe('branded constructors', () => {
  it('returns the original string value for asNodeId branding', () => {
    expect(asNodeId('n-1')).toBe('n-1')
  })

  it('returns the original string value for asDeptId branding', () => {
    expect(asDeptId('d-1')).toBe('d-1')
  })

  it('returns the original string value for asHandle branding', () => {
    expect(asHandle('@leader')).toBe('@leader')
  })
})
