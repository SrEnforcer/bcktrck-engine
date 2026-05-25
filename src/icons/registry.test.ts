import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ICON_POS,
  DEFAULT_ICON_SIZE,
  ICON_POSITIONS,
  getIcon,
  isKnownIcon,
  listIconNames
} from './registry'

describe('icon registry defaults', () => {
  it('exposes expected default icon position and size', () => {
    expect(DEFAULT_ICON_POS).toBe('upper-left')
    expect(DEFAULT_ICON_SIZE).toBe(14)
  })

  it('contains all supported icon anchor positions', () => {
    expect(ICON_POSITIONS.has('upper-left')).toBe(true)
    expect(ICON_POSITIONS.has('upper-right')).toBe(true)
    expect(ICON_POSITIONS.has('bottom-left')).toBe(true)
    expect(ICON_POSITIONS.has('bottom-right')).toBe(true)
  })
})

describe('icon registry lookups', () => {
  it('returns a lucide node and known status for registered icons', () => {
    const icon = getIcon('user')
    const cannabis = getIcon('cannabis')

    expect(icon).toBeDefined()
    expect(cannabis).toBeDefined()
    expect(isKnownIcon('user')).toBe(true)
    expect(isKnownIcon('cannabis')).toBe(true)
  })

  it('returns undefined and false for unknown icon names', () => {
    expect(getIcon('not-a-real-icon')).toBeUndefined()
    expect(isKnownIcon('not-a-real-icon')).toBe(false)
  })

  it('lists known icon names including compatibility alias', () => {
    const names = listIconNames()

    expect(names.includes('user')).toBe(true)
    expect(names.includes('cannabis')).toBe(true)
    expect(names.includes('cirkle-fading-plus')).toBe(true)
  })
})
