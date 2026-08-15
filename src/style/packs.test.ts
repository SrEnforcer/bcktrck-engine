import { describe, expect, it } from 'vitest'
import { fromNullable, getOrElseOption, isNone } from '@tsfpp/prelude'
import { createStylePackLoader, getStylePack, stylePacks } from './packs'

describe('stylePacks', () => {
  it('contains baseline built-in pack entries', () => {
    expect(stylePacks['minimal']).toBeDefined()
    expect(stylePacks['corporate']).toBeDefined()
  })
})

describe('getStylePack', () => {
  it('returns a pack source with case-insensitive name lookup', () => {
    const lower = getStylePack('minimal')
    const upper = getStylePack('MINIMAL')

    expect(lower).toBeDefined()
    expect(upper).toBe(lower)
    expect(getOrElseOption<string>(() => '')(fromNullable(lower)).includes('style')).toBe(true)
  })

  it('returns undefined for unknown pack names', () => {
    expect(isNone(fromNullable(getStylePack('does-not-exist')))).toBe(true)
  })
})

describe('createStylePackLoader', () => {
  it('prefers custom pack entries over built-in packs', () => {
    const loader = createStylePackLoader({ minimal: 'custom minimal style' })

    expect(getOrElseOption<string>(() => '')(fromNullable(loader('minimal')))).toBe('custom minimal style')
  })

  it('falls back to built-in and unknown results when custom pack missing', () => {
    const loader = createStylePackLoader({})
    const known = loader('corporate')
    const unknown = loader('no-pack')

    expect(known).toBeDefined()
    expect(unknown).toBeUndefined()
  })
})
