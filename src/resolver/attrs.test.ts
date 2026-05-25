import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { AstAttr } from '../types/ast'
import { findHandleRefAttrValue, findNumberAttrValue, findStringAttrValue } from './attrs'
import {
  mkResolverBooleanAttr,
  mkResolverNumberAttr,
  mkResolverStringAttr
} from '../tests/factories/resolver-slice'

describe('findStringAttrValue', () => {
  describe('when the attribute exists and is string-typed', () => {
    it('returns the string value', () => {
      const attrs: readonly AstAttr[] = [mkResolverStringAttr('title', 'Platform Team')]

      const result = findStringAttrValue('title', attrs)

      expect(result).toBe('Platform Team')
    })
  })

  describe('when the key does not exist', () => {
    it('returns undefined when the key is absent from attrs', () => {
      const attrs: readonly AstAttr[] = [mkResolverStringAttr('title', 'Platform Team')]

      const result = findStringAttrValue('team', attrs)

      expect(result).toBeUndefined()
    })
  })

  describe('when the attribute exists with a non-string type', () => {
    it('returns undefined', () => {
      const attrs: readonly AstAttr[] = [mkResolverBooleanAttr('active', true)]

      const result = findStringAttrValue('active', attrs)

      expect(result).toBeUndefined()
    })
  })
})

describe('findNumberAttrValue', () => {
  describe('when the attribute exists and is number-typed', () => {
    it('returns the numeric value', () => {
      const attrs: readonly AstAttr[] = [mkResolverNumberAttr('weight', 3.5)]

      const result = findNumberAttrValue('weight', attrs)

      expect(result).toBe(3.5)
    })
  })

  describe('when the attribute exists with a non-number type', () => {
    it('returns undefined', () => {
      const attrs: readonly AstAttr[] = [mkResolverStringAttr('weight', 'heavy')]

      const result = findNumberAttrValue('weight', attrs)

      expect(result).toBeUndefined()
    })
  })
})

describe('findHandleRefAttrValue', () => {
  describe('when the string value starts with @', () => {
    it('returns the handle name without the prefix', () => {
      const attrs: readonly AstAttr[] = [mkResolverStringAttr('manager', '@alex')]

      const result = findHandleRefAttrValue('manager', attrs)

      expect(result).toBe('alex')
    })
  })

  describe('when the string value does not start with @', () => {
    it('returns undefined', () => {
      const attrs: readonly AstAttr[] = [mkResolverStringAttr('manager', 'alex')]

      const result = findHandleRefAttrValue('manager', attrs)

      expect(result).toBeUndefined()
    })
  })

  it('returns a suffix for every value prefixed with @', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const attrs: readonly AstAttr[] = [mkResolverStringAttr('manager', `@${value}`)]

        const result = findHandleRefAttrValue('manager', attrs)

        expect(result).toBe(value)
      })
    )
  })
})